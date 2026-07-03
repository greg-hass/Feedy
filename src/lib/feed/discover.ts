import * as cheerio from "cheerio";

import { validateFeedUrl } from "@/lib/feed/parse";
import { fetchWithTimeout } from "@/lib/http";
import {
  buildDiscoverySearchQueries,
  buildYoutubeSearchQueries,
  compactDiscoveryKeyword,
  normalizeDiscoveryKeyword,
  normalizeYoutubeIdentity,
} from "@/lib/feed/discover-utils";
import type { DiscoveryResult, DiscoverySourceFilter } from "@/lib/feed/discover-types";
import {
  balanceAllSourceResults,
  dedupeRankedResults,
  rankResults,
  normalizeDiscoveryFeedUrl,
} from "@/lib/feed/discover-ranking";
import { normalizeRedditFeed, extractRedditSubreddit } from "@/lib/feed/discover-reddit";
import {
  extractYouTubeHandle,
  extractYouTubeInitialDataFromHtml,
  findYouTubeChannelCandidates,
  normalizeYoutubeFeed,
} from "@/lib/feed/discover-youtube";

function mapValidatedSourceType(
  sourceType: Awaited<ReturnType<typeof validateFeedUrl>>["sourceType"],
): DiscoveryResult["sourceType"] {
  if (sourceType === "REDDIT_RSS") {
    return "REDDIT_RSS";
  }

  if (
    sourceType === "YOUTUBE_RSS" ||
    sourceType === "YOUTUBE_CHANNEL_RSS" ||
    sourceType === "YOUTUBE_PLAYLIST_RSS"
  ) {
    return "YOUTUBE_RSS";
  }

  return "RSS";
}

function sourceFilterAllowsResult(
  sourceFilter: DiscoverySourceFilter,
  sourceType: DiscoveryResult["sourceType"],
) {
  if (sourceFilter === "ALL") {
    return true;
  }

  if (sourceFilter === "RSS") {
    return sourceType === "RSS";
  }

  if (sourceFilter === "REDDIT") {
    return sourceType === "REDDIT_RSS";
  }

  return sourceType === "YOUTUBE_RSS";
}

async function discoverDirectInput(
  keyword: string,
  sourceFilter: DiscoverySourceFilter,
): Promise<DiscoveryResult[]> {
  const directUrl = normalizeDirectUrlInput(keyword);
  if (!directUrl) {
    return [];
  }

  const results: DiscoveryResult[] = [];

  const youtube = normalizeYoutubeFeed(directUrl);
  if (youtube && sourceFilterAllowsResult(sourceFilter, youtube.sourceType)) {
    results.push(youtube);
  }

  const reddit = normalizeRedditFeed(directUrl);
  if (reddit && sourceFilterAllowsResult(sourceFilter, reddit.sourceType)) {
    results.push(reddit);
  }

  try {
    const validated = await validateFeedUrl(directUrl);
    const mappedSourceType = mapValidatedSourceType(validated.sourceType);
    if (sourceFilterAllowsResult(sourceFilter, mappedSourceType)) {
      results.push({
        title: validated.title,
        description: validated.description,
        siteName: validated.siteUrl ? new URL(validated.siteUrl).hostname : null,
        favicon: validated.iconUrl,
        feedUrl: normalizeDiscoveryFeedUrl(validated.feedUrl),
        siteUrl: validated.siteUrl,
        sourceType: mappedSourceType,
      });
    }
  } catch {
    if (sourceFilter === "ALL" || sourceFilter === "RSS") {
      results.push(...(await discoverFromWebsite(directUrl)));
    }
  }

  return dedupeRankedResults(results, keyword);
}

function buildCommonFeedCandidates(url: string) {
  try {
    const parsed = new URL(url);
    return ["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml"]
      .map((path) => new URL(path, `${parsed.origin}/`).toString());
  } catch {
    return [];
  }
}

function buildWebsiteKeywordGuesses(keyword: string) {
  const normalized = normalizeDiscoveryKeyword(keyword);
  if (!normalized) {
    return [];
  }

  const compact = compactDiscoveryKeyword(keyword);
  const hyphenated = normalized.replace(/\s+/g, "-");
  const guesses = new Set<string>();

  for (const host of [compact, hyphenated]) {
    if (!host || host.length < 3) {
      continue;
    }

    guesses.add(`https://${host}.com/`);
    guesses.add(`https://www.${host}.com/`);
    guesses.add(`https://${host}.org/`);
    guesses.add(`https://www.${host}.org/`);
    guesses.add(`https://${host}.net/`);
    guesses.add(`https://www.${host}.net/`);
  }

  return Array.from(guesses);
}

function buildKeywordGuesses(keyword: string): DiscoveryResult[] {
  const trimmed = keyword.trim();
  if (!trimmed) {
    return [];
  }

  const slug = compactDiscoveryKeyword(trimmed).slice(0, 32);
  const queries = buildDiscoverySearchQueries(trimmed, 4);
  const results: DiscoveryResult[] = [
    {
      title: `Reddit search: ${trimmed}`,
      description: "Keyword search across Reddit via RSS",
      siteName: "Reddit",
      favicon: "/icons/reddit.png",
      feedUrl: `https://www.reddit.com/search.rss?q=${encodeURIComponent(trimmed)}`,
      siteUrl: `https://www.reddit.com/search/?q=${encodeURIComponent(trimmed)}`,
      sourceType: "REDDIT_RSS",
    },
  ];

  for (const query of queries) {
    if (query.toLowerCase() === trimmed.toLowerCase()) {
      continue;
    }

    results.push({
      title: `Reddit search: ${query}`,
      description: "Keyword search across Reddit via RSS",
      siteName: "Reddit",
      favicon: "/icons/reddit.png",
      feedUrl: `https://www.reddit.com/search.rss?q=${encodeURIComponent(query)}`,
      siteUrl: `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`,
      sourceType: "REDDIT_RSS",
    });
  }

  if (slug) {
    results.push({
      title: `r/${slug}`,
      description: "Guessed subreddit RSS",
      siteName: "Reddit",
      favicon: "/icons/reddit.png",
      feedUrl: `https://www.reddit.com/r/${slug}/.rss`,
      siteUrl: `https://www.reddit.com/r/${slug}/`,
      sourceType: "REDDIT_RSS",
    });
  }

  return results;
}

async function searchDuckDuckGo(query: string) {
  const response = await fetchWithTimeout(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {},
    10_000,
  );
  if (!response.ok) {
    return [];
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  return $(".result__a")
    .map((_, element) => $(element).attr("href"))
    .get()
    .filter(Boolean)
    .map((href) => decodeDuckDuckGoResult(href!));
}

function decodeDuckDuckGoResult(rawUrl: string) {
  const normalized = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;

  try {
    const parsed = new URL(normalized);
    if (parsed.hostname.includes("duckduckgo.com")) {
      const uddg = parsed.searchParams.get("uddg");
      if (uddg) {
        return decodeURIComponent(uddg);
      }
    }

    return normalized;
  } catch {
    return normalized;
  }
}

async function discoverFromWebsite(url: string): Promise<DiscoveryResult[]> {
  const response = await fetchWithTimeout(url, {}, 10_000);
  if (!response.ok) {
    return [];
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || url;
  const description = $('meta[name="description"]').attr("content")?.trim() || null;
  const icon =
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href") ||
    null;

  const autodiscovered = $('link[type="application/rss+xml"], link[type="application/atom+xml"]')
    .map((_, element) => $(element).attr("href"))
    .get()
    .filter(Boolean)
    .map((href) => new URL(href!, url).toString());

  const candidates = [...new Set([...autodiscovered, ...buildCommonFeedCandidates(url)])];
  const results: DiscoveryResult[] = [];

  for (const candidate of candidates.slice(0, 8)) {
    try {
      const validated = await validateFeedUrl(candidate);
      results.push({
        title: validated.title || title,
        description: validated.description || description,
        siteName: new URL(url).hostname,
        favicon: icon ? new URL(icon, url).toString() : null,
        feedUrl: normalizeDiscoveryFeedUrl(validated.feedUrl),
        siteUrl: validated.siteUrl || url,
        sourceType:
          validated.sourceType === "REDDIT_RSS"
            ? "REDDIT_RSS"
            : validated.sourceType === "YOUTUBE_RSS" ||
                validated.sourceType === "YOUTUBE_CHANNEL_RSS" ||
                validated.sourceType === "YOUTUBE_PLAYLIST_RSS"
              ? "YOUTUBE_RSS"
              : "RSS",
      });
    } catch (error) {
      console.warn("[discover] Feed autodiscovery failed", {
        url: candidate,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  return results;
}

async function discoverYoutubeByKeyword(keyword: string): Promise<DiscoveryResult[]> {
  const queries = buildYoutubeSearchQueries(keyword);
  const results = new Map<string, DiscoveryResult>();
  const keywordTokens = normalizeDiscoveryKeyword(keyword).split(" ").filter(Boolean);
  const normalizedKeyword = compactDiscoveryKeyword(keyword);

  const runQuery = async (query: string) => {
    const params = new URLSearchParams({
      search_query: query,
      sp: "EgIQAg==",
    });
    const response = await fetchWithTimeout(
      `https://www.youtube.com/results?${params.toString()}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        },
      },
      6_000,
    );
    if (!response.ok) {
      return [] as DiscoveryResult[];
    }

    const html = await response.text();
    const data = extractYouTubeInitialDataFromHtml(html);
    if (!data) {
      return [] as DiscoveryResult[];
    }

    const queryResults: DiscoveryResult[] = [];
    const candidates = findYouTubeChannelCandidates(data);
    for (const candidate of candidates.slice(0, 8)) {
      const siteUrl = candidate.handle
        ? `https://www.youtube.com/@${candidate.handle}`
        : `https://www.youtube.com/channel/${candidate.channelId}`;
      const relevanceHaystack = compactDiscoveryKeyword(
        `${query} ${candidate.title} ${candidate.handle || ""} ${siteUrl}`,
      );
      const matchedTokens = keywordTokens.filter((token) => relevanceHaystack.includes(token));
      if (keywordTokens.length && matchedTokens.length === 0) {
        continue;
      }

      const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${candidate.channelId}`;
      queryResults.push({
        title: candidate.title,
        description: `${candidate.title} on YouTube`,
        siteName: "YouTube",
        favicon:
          (candidate.thumbnail?.startsWith("//") ? `https:${candidate.thumbnail}` : candidate.thumbnail) ||
          "https://www.youtube.com/s/desktop/fe376c4d/img/logos/favicon_144x144.png",
        feedUrl,
        siteUrl,
        sourceType: "YOUTUBE_RSS",
      });
    }

    return queryResults;
  };

  const settled = await Promise.allSettled(queries.map((query) => runQuery(query)));
  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") {
      continue;
    }

    for (const result of outcome.value) {
      results.set(result.feedUrl, result);
    }
  }

  const ordered = rankResults(Array.from(results.values()), keyword);
  const strongest = ordered.find((result) => {
    const normalizedTitle = normalizeYoutubeIdentity(result.title);
    const handle = extractYouTubeHandle(result.siteUrl || "");
    return (
      normalizedTitle === normalizedKeyword ||
      (handle ? compactDiscoveryKeyword(handle) === normalizedKeyword : false)
    );
  });

  if (strongest) {
    return [strongest, ...ordered.filter((result) => result.feedUrl !== strongest.feedUrl)];
  }

  return ordered;
}

async function discoverRedditByKeyword(keyword: string): Promise<DiscoveryResult[]> {
  const queries = buildDiscoverySearchQueries(keyword);
  const results = new Map<string, DiscoveryResult>();

  for (const query of queries) {
    const searchResults = await searchDuckDuckGo(`${query} site:reddit.com/r`);
    const subredditPages = searchResults.filter((url) => url.includes("reddit.com/r/"));

    for (const candidate of subredditPages.slice(0, 8)) {
      const subreddit = extractRedditSubreddit(candidate);
      if (!subreddit) {
        continue;
      }

      const feedUrl = `https://www.reddit.com/r/${subreddit}/.rss`;
      results.set(feedUrl, {
        title: `r/${subreddit}`,
        description: `Reddit RSS for r/${subreddit}`,
        siteName: "Reddit",
        favicon: "/icons/reddit.png",
        feedUrl,
        siteUrl: `https://www.reddit.com/r/${subreddit}/`,
        sourceType: "REDDIT_RSS",
      });
    }
  }

  return Array.from(results.values());
}

function normalizeDirectUrlInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function looksLikeDirectUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }

  return /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(trimmed);
}

export async function discoverFeeds(
  keyword: string,
  sourceFilter: DiscoverySourceFilter = "ALL",
) {
  const trimmedKeyword = keyword.trim();
  if (!trimmedKeyword) {
    return [];
  }

  if (looksLikeDirectUrl(trimmedKeyword)) {
    const directMatches = await discoverDirectInput(trimmedKeyword, sourceFilter);
    if (directMatches.length > 0) {
      return directMatches.slice(0, 12);
    }
  }

  const rawUrls = new Set<string>();
  if (sourceFilter === "ALL" || sourceFilter === "RSS") {
    for (const guessedUrl of buildWebsiteKeywordGuesses(trimmedKeyword)) {
      rawUrls.add(guessedUrl);
    }

    for (const query of buildDiscoverySearchQueries(trimmedKeyword, 5)) {
      const searchResults = await searchDuckDuckGo(`${query} rss`);
      for (const url of searchResults.slice(0, 6)) {
        rawUrls.add(url);
      }
    }
  }

  const results: DiscoveryResult[] = [];

  if (sourceFilter === "ALL" || sourceFilter === "REDDIT") {
    results.push(...buildKeywordGuesses(trimmedKeyword), ...(await discoverRedditByKeyword(trimmedKeyword)));
  }

  if (sourceFilter === "ALL" || sourceFilter === "YOUTUBE") {
    results.push(...(await discoverYoutubeByKeyword(trimmedKeyword)));
  }

  for (const rawUrl of rawUrls) {
    try {
      const decoded = rawUrl!;
      const youtube = normalizeYoutubeFeed(decoded);
      if (youtube) {
        results.push(youtube);
        continue;
      }

      const reddit = normalizeRedditFeed(decoded);
      if (reddit) {
        results.push(reddit);
        continue;
      }

      const discovered = await discoverFromWebsite(decoded);
      results.push(...discovered.filter((result) => result.sourceType === "RSS"));
    } catch (error) {
      console.warn("[discover] Search result discovery failed", {
        url: rawUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  const rankedResults = dedupeRankedResults(results, trimmedKeyword);
  return (sourceFilter === "ALL" ? balanceAllSourceResults(rankedResults) : rankedResults).slice(0, 12);
}
