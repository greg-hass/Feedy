import * as cheerio from "cheerio";

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

async function discoverFromWebsite(url: string) {
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
  const feedLinks = $('link[type="application/rss+xml"], link[type="application/atom+xml"]')
    .map((_, element) => $(element).attr("href"))
    .get()
    .filter(Boolean)
    .map((href) => new URL(href!, url).toString());

  return feedLinks.map((feedUrl) => ({
    title,
    description,
    siteName: new URL(url).hostname,
    favicon: icon ? new URL(icon, url).toString() : null,
    feedUrl,
    siteUrl: url,
    sourceType: "RSS" as const,
  }));
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
    feedUrl: parsed.pathname.endsWith(".rss") ? parsed.toString() : `${parsed.toString().replace(/\/$/, "")}.rss`,
    siteUrl: subredditMatch ? `https://www.reddit.com/r/${subredditMatch[1]}/` : "https://www.reddit.com",
    sourceType: "REDDIT_RSS" as const,
  };
}

export async function discoverFeeds(keyword: string) {
  const q = encodeURIComponent(keyword);
  const response = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${q}%20rss`, {}, 10_000);
  if (!response.ok) {
    throw new Error("Search provider unavailable");
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const rawResults = $(".result__a")
    .map((_, element) => $(element).attr("href"))
    .get()
    .filter(Boolean)
    .slice(0, 8);

  const results: DiscoveryResult[] = [];
  for (const rawUrl of rawResults) {
    try {
      const decoded = new URL(rawUrl!).searchParams.get("uddg") ?? rawUrl!;
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

      results.push(...(await discoverFromWebsite(decoded)));
    } catch {
      continue;
    }
  }

  const deduped = new Map<string, DiscoveryResult>();
  for (const result of results) {
    deduped.set(result.feedUrl, result);
  }

  return [...deduped.values()].slice(0, 12);
}
