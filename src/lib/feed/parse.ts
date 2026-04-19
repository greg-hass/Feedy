import { createHash } from "node:crypto";

import Parser from "rss-parser";

import { FeedSourceType } from "@prisma/client";
import { fetchWithTimeout } from "@/lib/http";
import type { FeedValidationResult, ParsedFeedItem } from "@/lib/feed/types";
import { decodeHtmlEntities } from "@/lib/utils";
import {
  fetchYouTubeFeedConditionally,
  parseYouTubeFeedTarget,
  validateYouTubeFeedUrl,
} from "@/lib/feed/youtube";

const parser = new Parser({
  defaultRSS: 2.0,
  headers: {
    "user-agent": "Feedy/1.0",
  },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["yt:videoId", "ytVideoId"],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

function detectSourceType(url: string, feedType?: string | null): FeedSourceType {
  const youtubeTarget = parseYouTubeFeedTarget(url);
  if (youtubeTarget) {
    return youtubeTarget.sourceType;
  }

  const normalized = url.toLowerCase();

  if (normalized.includes("reddit.com")) {
    return FeedSourceType.REDDIT_RSS;
  }

  if (normalized.includes("youtube.com/feeds/videos.xml")) {
    if (normalized.includes("playlist_id=")) {
      return FeedSourceType.YOUTUBE_PLAYLIST_RSS;
    }

    if (normalized.includes("channel_id=")) {
      return FeedSourceType.YOUTUBE_CHANNEL_RSS;
    }

    return FeedSourceType.YOUTUBE_RSS;
  }

  if (feedType?.toLowerCase().includes("atom")) {
    return FeedSourceType.ATOM;
  }

  if (feedType?.toLowerCase().includes("rss")) {
    return FeedSourceType.RSS;
  }

  return FeedSourceType.RSS;
}

function hashUniqueKey(feedId: string, raw: string) {
  return createHash("sha256").update(`${feedId}:${raw}`).digest("hex");
}

export async function validateFeedUrl(url: string): Promise<FeedValidationResult> {
  const youtubeTarget = parseYouTubeFeedTarget(url);
  if (youtubeTarget) {
    return validateYouTubeFeedUrl(url);
  }

  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Feed returned ${response.status}`);
  }

  const xml = await response.text();
  const feed = await parser.parseString(xml);
  const resolvedFeedUrl = response.url?.trim() || url;
  const sourceType = detectSourceType(resolvedFeedUrl, feed.feedUrl ?? feed.generator ?? null);

  return {
    title: decodeHtmlEntities(feed.title?.trim()) || "Untitled feed",
    description: decodeHtmlEntities(feed.description?.trim()) || null,
    siteUrl: feed.link?.trim() || null,
    feedUrl: resolvedFeedUrl,
    iconUrl: ((feed as { image?: { url?: string } }).image?.url as string | undefined) ?? null,
    sourceType,
  };
}

export async function fetchAndParseFeed(url: string, feedId: string) {
  return fetchAndParseFeedConditionally(url, feedId);
}

export async function fetchAndParseFeedConditionally(
  url: string,
  feedId: string,
  options?: {
    etag?: string | null;
    lastModified?: string | null;
  },
) {
  const youtubeTarget = parseYouTubeFeedTarget(url);
  if (youtubeTarget) {
    return fetchYouTubeFeedConditionally(url, feedId, {
      etag: options?.etag ?? null,
    });
  }

  const requestHeaders: Record<string, string> = {};
  if (options?.etag) {
    requestHeaders["if-none-match"] = options.etag;
  }
  if (options?.lastModified) {
    requestHeaders["if-modified-since"] = options.lastModified;
  }

  const response = await fetchWithTimeout(url, {
    headers: requestHeaders,
  });
  if (response.status === 304) {
    return {
      notModified: true as const,
      etag: response.headers.get("etag") ?? options?.etag ?? null,
      lastModified: response.headers.get("last-modified") ?? options?.lastModified ?? null,
    };
  }
  if (!response.ok) {
    throw new Error(`Feed returned ${response.status}`);
  }

  const xml = await response.text();
  const feed = await parser.parseString(xml);
  const resolvedFeedUrl = response.url?.trim() || url;
  const sourceType = detectSourceType(resolvedFeedUrl, feed.feedUrl ?? feed.generator ?? null);
  const items: ParsedFeedItem[] = (feed.items ?? []).map((item) => {
    const extra = item as unknown as Record<string, unknown>;
    const canonicalUrl =
      item.link?.trim() ||
      (typeof item.enclosure?.url === "string" ? item.enclosure.url : null);
    const videoId =
      extra.ytVideoId?.toString() ??
      new URL(canonicalUrl || "https://www.youtube.com", "https://www.youtube.com")
        .searchParams.get("v");

    const rawId =
      item.guid ||
      (typeof extra.id === "string" ? extra.id : null) ||
      canonicalUrl ||
      `${item.title ?? ""}:${item.pubDate ?? ""}:${item.isoDate ?? ""}`;

    return {
      uniqueKey: hashUniqueKey(feedId, rawId),
      guid: item.guid ?? (typeof extra.id === "string" ? extra.id : null),
      externalId: (typeof extra.id === "string" ? extra.id : null) ?? item.guid ?? null,
      title: decodeHtmlEntities(item.title?.trim()) || "Untitled item",
      summary: decodeHtmlEntities(item.contentSnippet?.trim() || item.summary?.trim()) || null,
      contentHtml:
        (extra.contentEncoded as string | undefined) ??
        item["content"] ??
        null,
      author:
        decodeHtmlEntities(item.creator?.trim()) ||
        (typeof extra.author === "string" ? decodeHtmlEntities(extra.author.trim()) : null),
      canonicalUrl: canonicalUrl || null,
      commentsUrl: typeof extra.comments === "string" ? extra.comments.trim() : null,
      mediaUrl:
        item.enclosure?.url ||
        ((extra as { mediaThumbnail?: Array<{ $?: { url?: string } }> }).mediaThumbnail?.[0]?.$
          ?.url ?? null),
      youtubeVideoId: videoId,
      redditPermalink: item.link?.includes("reddit.com") ? item.link : null,
      publishedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null,
    };
  });

  return {
    notModified: false as const,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    feed: {
      title: decodeHtmlEntities(feed.title?.trim()) || "Untitled feed",
      description: decodeHtmlEntities(feed.description?.trim()) || null,
      siteUrl: feed.link?.trim() || null,
      iconUrl: ((feed as { image?: { url?: string } }).image?.url as string | undefined) ?? null,
      sourceType,
      feedUrl: resolvedFeedUrl,
    },
    items,
  };
}
