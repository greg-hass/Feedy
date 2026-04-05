import { createHash } from "node:crypto";

import Parser from "rss-parser";

import { FeedSourceType } from "@prisma/client";
import { fetchWithTimeout } from "@/lib/http";
import type { FeedValidationResult, ParsedFeedItem } from "@/lib/feed/types";

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

  return FeedSourceType.UNKNOWN;
}

function hashUniqueKey(feedId: string, raw: string) {
  return createHash("sha256").update(`${feedId}:${raw}`).digest("hex");
}

export async function validateFeedUrl(url: string): Promise<FeedValidationResult> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Feed returned ${response.status}`);
  }

  const xml = await response.text();
  const feed = await parser.parseString(xml);
  const sourceType = detectSourceType(url, feed.feedUrl ?? feed.generator ?? null);

  return {
    title: feed.title?.trim() || "Untitled feed",
    description: feed.description?.trim() || null,
    siteUrl: feed.link?.trim() || null,
    feedUrl: feed.feedUrl?.trim() || url,
    iconUrl: ((feed as { image?: { url?: string } }).image?.url as string | undefined) ?? null,
    sourceType,
  };
}

export async function fetchAndParseFeed(url: string, feedId: string) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Feed returned ${response.status}`);
  }

  const xml = await response.text();
  const feed = await parser.parseString(xml);
  const sourceType = detectSourceType(url, feed.feedUrl ?? feed.generator ?? null);
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
      title: item.title?.trim() || "Untitled item",
      summary: item.contentSnippet?.trim() || item.summary?.trim() || null,
      contentHtml:
        (extra.contentEncoded as string | undefined) ??
        item["content"] ??
        null,
      author:
        item.creator?.trim() ||
        (typeof extra.author === "string" ? extra.author.trim() : null),
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
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    feed: {
      title: feed.title?.trim() || "Untitled feed",
      description: feed.description?.trim() || null,
      siteUrl: feed.link?.trim() || null,
      iconUrl: ((feed as { image?: { url?: string } }).image?.url as string | undefined) ?? null,
      sourceType,
    },
    items,
  };
}
