import * as cheerio from "cheerio";

import { validateFeedUrl } from "@/lib/feed/parse";
import { fetchWithTimeout } from "@/lib/http";

export type DiscoveryResult = {
  title: string;
  description?: string | null;
  siteName?: string | null;
  favicon?: string | null;
  feedUrl: string;
  siteUrl?: string | null;
  sourceType: "RSS" | "REDDIT_RSS" | "YOUTUBE_RSS";
};

export type DiscoverySourceFilter = "ALL" | "RSS" | "REDDIT" | "YOUTUBE";

const YOUTUBE_CHANNEL_SEARCH_FILTER = "EgIQAg==";

function normalizeDiscoveryKeyword(keyword: string) {
  return keyword
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[@'".,!?()[\]{}:;|/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactDiscoveryKeyword(keyword: string) {
  return normalizeDiscoveryKeyword(keyword).replace(/\s+/g, "");
}

function buildDiscoverySearchQueries(keyword: string, maxQueries = 5) {
  const normalized = normalizeDiscoveryKeyword(keyword);
  if (!normalized) {
    return [];
  }

  const tokens = normalized.split(" ").filter(Boolean);
  const queries = new Set<string>();
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) {
      queries.add(trimmed);
    }
  };

  add(keyword);
  add(normalized);
  add(compactDiscoveryKeyword(keyword));

  if (tokens.length > 0) {
    add(tokens[0]);
  }

  if (tokens.length > 1) {
    add(tokens.join(" "));
    add(tokens.join(""));
    add(`${tokens[0]}${tokens.slice(1).map((token) => token[0]).join("")}`);
    add(tokens.map((token) => token[0]).join(""));
  }

  return Array.from(queries).slice(0, maxQueries);
}

function buildYoutubeSearchQueries(keyword: string) {
  const baseQueries = buildDiscoverySearchQueries(keyword, 4);
  const prioritized: string[] = [];
  const seen = new Set<string>();
  const normalized = normalizeDiscoveryKeyword(keyword);
  const tokens = normalized.split(" ").filter(Boolean);
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    prioritized.push(trimmed);
  };

  if (tokens.length > 1) {
    const first = tokens[0]!;
    const last = tokens[tokens.length - 1]!;
    const lastInitial = last[0];
    const firstPlusInitial = `${first}${lastInitial}`;
    const separatedInitial = `${first} ${lastInitial}`;

    add(firstPlusInitial);
    add(`@${firstPlusInitial}`);
    add(compactDiscoveryKeyword(keyword));
    add(keyword);
    add(separatedInitial);
    add(`${keyword} channel`);
    add(`${separatedInitial} channel`);
  } else {
    add(compactDiscoveryKeyword(keyword));
    add(keyword);
    add(`${keyword} channel`);
  }

  for (const query of baseQueries) {
    add(query);
    add(`${query} channel`);
  }

  return prioritized.slice(0, 6);
}

function normalizeYoutubeIdentity(value: string) {
  return compactDiscoveryKeyword(value)
    .replace(/official|channel|youtube/g, "")
    .replace(/\d+/g, "")
    .trim();
}

function youtubeNoisePenalty(result: DiscoveryResult) {
  const haystack = normalizeDiscoveryKeyword(
    `${result.title} ${result.description || ""} ${result.siteUrl || ""}`,
  );

  return YOUTUBE_NOISE_TERMS.reduce((penalty, term) => {
    return haystack.includes(term) ? penalty + 12 : penalty;
  }, 0);
}

function youtubeCanonicalKey(result: DiscoveryResult) {
  const siteUrl = result.siteUrl || "";
  const handle = extractYouTubeHandle(siteUrl);
  const channelId =
    extractYouTubeChannelId(siteUrl) ||
    (() => {
      try {
        return new URL(result.feedUrl).searchParams.get("channel_id");
      } catch {
        return null;
      }
    })();

  if (handle) {
    return `yt:handle:${handle.toLowerCase()}`;
  }

  if (channelId) {
    return `yt:channel:${channelId}`;
  }

  return `yt:title:${normalizeYoutubeIdentity(result.title)}`;
}

function normalizeYoutubeFeed(url: string) {
  const parsed = new URL(url);
  if (!parsed.hostname.includes("youtube.com")) {
    return null;
  }

  if (parsed.pathname === "/feeds/videos.xml") {
    return {
      title: "YouTube feed",
      description: "YouTube RSS feed",
      siteName: "YouTube",
      favicon: "https://www.youtube.com/s/desktop/fe376c4d/img/logos/favicon_144x144.png",
      feedUrl: parsed.toString(),
      siteUrl: "https://www.youtube.com",
      sourceType: "YOUTUBE_RSS" as const,
    };
  }

  return null;
}

function normalizeRedditFeed(url: string) {
  const parsed = new URL(url);
  if (!parsed.hostname.includes("reddit.com")) {
    return null;
  }

  const subredditMatch = parsed.pathname.match(/\/r\/([^/]+)/);
  return {
    title: subredditMatch ? `r/${subredditMatch[1]}` : "Reddit RSS",
    description: "Reddit RSS feed",
    siteName: "Reddit",
    favicon: "https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-180x180.png",
    feedUrl: parsed.pathname.endsWith(".rss")
      ? parsed.toString()
      : `${parsed.toString().replace(/\/$/, "")}.rss`,
    siteUrl: subredditMatch ? `https://www.reddit.com/r/${subredditMatch[1]}/` : "https://www.reddit.com",
    sourceType: "REDDIT_RSS" as const,
  };
}

function extractRedditSubreddit(url: string) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/r\/([^/?#]+)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function extractYouTubeHandle(url: string) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/@([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? null;
  } catch {
    const match = url.match(/\/@([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? null;
  }
}

function extractYouTubeChannelId(url: string) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/channel\/([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? null;
  } catch {
    const match = url.match(/\/channel\/([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? null;
  }
}

function extractYouTubeInitialData(html: string) {
  const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    return null;
  }
}

type YouTubeChannelCandidate = {
  channelId: string;
  title: string;
  handle?: string | null;
  thumbnail?: string | null;
};

const YOUTUBE_NOISE_TERMS = [
  "admin",
  "fandom",
  "fan",
  "fans",
  "clips",
  "highlights",
  "moments",
  "shorts",
  "tv",
  "live",
  "podcast",
  "news",
  "updates",
  "archive",
  "edits",
];

function findYouTubeChannelCandidates(payload: unknown) {
  const results: YouTubeChannelCandidate[] = [];

  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }

    const record = value as Record<string, unknown>;
    const renderer = record.channelRenderer as Record<string, unknown> | undefined;
    if (renderer) {
      const channelId = typeof renderer.channelId === "string" ? renderer.channelId : null;
      const titleNode = renderer.title as
        | { simpleText?: string; runs?: Array<{ text?: string }> }
        | undefined;
      const title =
        titleNode?.simpleText ||
        titleNode?.runs?.map((run) => run.text).filter(Boolean).join("").trim() ||
        null;
      const canonicalBaseUrl =
        typeof renderer.canonicalBaseUrl === "string" ? renderer.canonicalBaseUrl : null;
      const handle = canonicalBaseUrl ? extractYouTubeHandle(`https://www.youtube.com${canonicalBaseUrl}`) : null;
      const thumbnails =
        (renderer.thumbnail as { thumbnails?: Array<{ url?: string }> } | undefined)?.thumbnails ?? [];
      const thumbnail =
        thumbnails
          .map((item) => item.url)
          .filter((url): url is string => Boolean(url))
          .at(-1) ?? null;

      if (channelId && title) {
        results.push({ channelId, title, handle, thumbnail });
      }
    }

    for (const nested of Object.values(record)) {
      walk(nested);
    }
  };

  walk(payload);
  return results;
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

function normalizeDiscoveryFeedUrl(feedUrl: string) {
  try {
    const parsed = new URL(feedUrl);
    if (parsed.hostname.includes("youtube.com") && parsed.pathname === "/feeds/videos.xml") {
      parsed.protocol = "https:";
      return parsed.toString();
    }

    if (parsed.hostname.includes("reddit.com") && !parsed.pathname.endsWith(".rss")) {
      parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}.rss`;
      parsed.protocol = "https:";
      return parsed.toString();
    }

    return parsed.toString();
  } catch {
    return feedUrl;
  }
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

function normalizeDirectUrlInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

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
      favicon: "https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-180x180.png",
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
      favicon: "https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-180x180.png",
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
      favicon: "https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-180x180.png",
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

function rankResults(results: DiscoveryResult[], keyword: string) {
  const q = normalizeDiscoveryKeyword(keyword);

  return [...results].sort((a, b) => score(b, q) - score(a, q));
}

function score(result: DiscoveryResult, keyword: string) {
  const normalizedKeyword = compactDiscoveryKeyword(keyword);
  const keywordTokens = normalizeDiscoveryKeyword(keyword).split(" ").filter(Boolean);
  const haystack = compactDiscoveryKeyword(
    `${result.title} ${result.siteName || ""} ${result.description || ""} ${result.feedUrl} ${result.siteUrl || ""}`,
  );
  const normalizedTitle = normalizeYoutubeIdentity(result.title);

  let value = 0;
  if (normalizedKeyword && haystack.includes(normalizedKeyword)) value += 10;
  if (keywordTokens.length > 0 && keywordTokens.every((token) => haystack.includes(token))) value += 5;
  if (keywordTokens.length > 0 && result.title.toLowerCase().includes(keywordTokens[0])) value += 2;
  if (normalizedKeyword && compactDiscoveryKeyword(result.title) === normalizedKeyword) value += 10;
  if (normalizedKeyword && compactDiscoveryKeyword(result.siteName || "") === normalizedKeyword) value += 6;
  if (result.sourceType === "YOUTUBE_RSS") value += 4;
  if (result.sourceType === "REDDIT_RSS") value += 3;
  if (result.feedUrl.includes("/feed") || result.feedUrl.includes("rss")) value += 2;
  if (result.siteUrl?.includes("/@")) value += 3;
  if (result.siteUrl?.includes("/channel/")) value += 2;
  if (result.siteUrl?.includes("/r/")) value += 2;
  if (result.sourceType === "YOUTUBE_RSS") {
    if (normalizedKeyword && normalizedTitle === normalizedKeyword) value += 18;
    if (keywordTokens.length > 0 && keywordTokens.every((token) => normalizedTitle.includes(token))) value += 10;
    value -= youtubeNoisePenalty(result);
  }
  return value;
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
    } catch {
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
      sp: YOUTUBE_CHANNEL_SEARCH_FILTER,
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
    const data = extractYouTubeInitialData(html);
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
        favicon: "https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-180x180.png",
        feedUrl,
        siteUrl: `https://www.reddit.com/r/${subreddit}/`,
        sourceType: "REDDIT_RSS",
      });
    }
  }

  return Array.from(results.values());
}

function dedupeRankedResults(results: DiscoveryResult[], keyword: string) {
  const ranked = rankResults(results, keyword);
  const deduped = new Map<string, DiscoveryResult>();
  const finalResults: DiscoveryResult[] = [];

  for (const result of ranked) {
    const normalizedResult = {
      ...result,
      feedUrl: normalizeDiscoveryFeedUrl(result.feedUrl),
    };

    const keys = [normalizedResult.feedUrl];
    if (result.sourceType === "YOUTUBE_RSS") {
      keys.push(youtubeCanonicalKey(result));
      const normalizedTitle = normalizeYoutubeIdentity(result.title);
      if (normalizedTitle) {
        keys.push(`yt:title:${normalizedTitle}`);
      }
    }

    if (keys.some((key) => deduped.has(key))) {
      continue;
    }

    finalResults.push(normalizedResult);
    for (const key of keys) {
      deduped.set(key, normalizedResult);
    }
  }

  return finalResults;
}

function balanceAllSourceResults(results: DiscoveryResult[]) {
  const finalResults: DiscoveryResult[] = [];
  const seen = new Set<string>();
  const preferredSourceOrder: DiscoveryResult["sourceType"][] = ["RSS", "REDDIT_RSS", "YOUTUBE_RSS"];

  for (const sourceType of preferredSourceOrder) {
    const match = results.find((result) => result.sourceType === sourceType);
    if (!match) {
      continue;
    }

    const key = normalizeDiscoveryFeedUrl(match.feedUrl);
    if (seen.has(key)) {
      continue;
    }

    finalResults.push(match);
    seen.add(key);
  }

  for (const result of results) {
    const key = normalizeDiscoveryFeedUrl(result.feedUrl);
    if (seen.has(key)) {
      continue;
    }

    finalResults.push(result);
    seen.add(key);
  }

  return finalResults;
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
    } catch {
      continue;
    }
  }

  const rankedResults = dedupeRankedResults(results, trimmedKeyword);
  return (sourceFilter === "ALL" ? balanceAllSourceResults(rankedResults) : rankedResults).slice(0, 12);
}
