import { createHash } from "node:crypto";

import * as cheerio from "cheerio";
import Parser from "rss-parser";

import { FeedSourceType } from "@prisma/client";
import { fetchWithTimeout } from "@/lib/http";
import { sanitizeReaderHtml } from "@/lib/sanitize-reader-html";
import type { FeedValidationResult, ParsedFeedItem } from "@/lib/feed/types";
import { decodeHtmlEntities } from "@/lib/utils";
import {
  fetchYouTubeFeedConditionally,
  parseYouTubeFeedTarget,
  validateYouTubeFeedUrl,
} from "@/lib/feed/youtube";
import { getYouTubeThumbnailUrls } from "@/lib/feed/youtube-thumbnail";
import {
  assertWithinLimit,
  mapInBatches,
  MAX_FEED_ITEMS_PER_REFRESH,
  REMOTE_PROBE_BATCH_SIZE,
} from "@/lib/workload-limits";

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

function detectFeedMarkupType(xml: string) {
  if (/<feed\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(xml)) {
    return "atom";
  }

  if (/<rss\b/i.test(xml)) {
    return "rss";
  }

  return null;
}

function hashUniqueKey(feedId: string, raw: string) {
  return createHash("sha256").update(`${feedId}:${raw}`).digest("hex");
}

function firstThumbnailUrlFromParsedItem(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const thumbnail of value) {
    const url = (thumbnail as { $?: { url?: string } } | null | undefined)?.$?.url?.trim();
    if (url) {
      return url;
    }
  }

  return null;
}

const REDDIT_IMAGE_HOSTS = new Set([
  "preview.redd.it",
  "i.redd.it",
  "external-preview.redd.it",
]);

function redditImageCandidate(url: string) {
  try {
    const parsed = new URL(url);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      !REDDIT_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())
    ) {
      return null;
    }

    const width = Number.parseInt(parsed.searchParams.get("width") ?? "", 10);
    return {
      url,
      width: Number.isFinite(width) && width > 0
        ? width
        : parsed.hostname.toLowerCase() === "i.redd.it"
          ? Number.POSITIVE_INFINITY
          : null,
    };
  } catch {
    return null;
  }
}

function isRedditHostedUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "reddit.com" || hostname.endsWith(".reddit.com") || REDDIT_IMAGE_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

function externalRedditArticleUrl(content: string | null) {
  if (!content) {
    return null;
  }

  const $ = cheerio.load(content);

  for (const element of $("a").toArray()) {
    const href = $(element).attr("href")?.trim();
    if (!href) {
      continue;
    }

    try {
      const parsed = new URL(href);
      if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !isRedditHostedUrl(href)) {
        return parsed.toString();
      }
    } catch {
      continue;
    }
  }

  return null;
}

function higherResolutionRedditPreviewUrl(content: unknown, thumbnailUrl: string | null) {
  if (typeof content !== "string") {
    return null;
  }

  const thumbnailWidth = thumbnailUrl ? redditImageCandidate(thumbnailUrl)?.width ?? 0 : 0;
  let bestCandidate: { url: string; width: number } | null = null;
  const decodedContent = decodeHtmlEntities(content);

  for (const match of decodedContent.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    const candidate = redditImageCandidate(match[0]);
    if (
      candidate?.width == null ||
      candidate.width <= thumbnailWidth ||
      (bestCandidate && candidate.width <= bestCandidate.width)
    ) {
      continue;
    }

    bestCandidate = { url: candidate.url, width: candidate.width };
  }

  return bestCandidate?.url ?? null;
}

function removeDuplicateRedditPreviewHtml(content: string | null, mediaUrl: string | null) {
  if (!content || !mediaUrl || !redditImageCandidate(mediaUrl)) {
    return content;
  }

  const $ = cheerio.load(content);

  $("img").each((_index, element) => {
    const image = $(element);
    const src = image.attr("src");

    if (!src || !redditImageCandidate(src)) {
      return;
    }

    const link = image.closest("a");
    if (link.length > 0 && link.contents().length === 1) {
      link.remove();
      return;
    }

    image.remove();
  });

  $("a").each((_index, element) => {
    const link = $(element);
    const href = link.attr("href");

    if (href && redditImageCandidate(href)) {
      link.remove();
    }
  });

  return $.root().html() || "";
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
  const resolvedFeedUrl =
    ((response as Response & { finalUrl?: string }).finalUrl ?? response.url)?.trim() || url;
  const sourceType = detectSourceType(resolvedFeedUrl, feed.feedUrl ?? feed.generator ?? detectFeedMarkupType(xml));

  return {
    title: decodeHtmlEntities(feed.title?.trim()) || "Untitled feed",
    description: decodeHtmlEntities(feed.description?.trim()) || null,
    siteUrl: feed.link?.trim() || null,
    feedUrl: resolvedFeedUrl,
    iconUrl: ((feed as { image?: { url?: string } }).image?.url as string | undefined) ?? null,
    sourceType,
  };
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
    const result = await fetchYouTubeFeedConditionally(url, feedId, {
      etag: options?.etag ?? null,
    });

    if (result.notModified) {
      return result;
    }
    assertWithinLimit(result.items.length, MAX_FEED_ITEMS_PER_REFRESH, "Feed items");

    return {
      ...result,
      items: result.items,
    };
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
  const resolvedFeedUrl =
    ((response as Response & { finalUrl?: string }).finalUrl ?? response.url)?.trim() || url;
  const sourceType = detectSourceType(resolvedFeedUrl, feed.feedUrl ?? feed.generator ?? detectFeedMarkupType(xml));
  const parsedItems = feed.items ?? [];
  assertWithinLimit(parsedItems.length, MAX_FEED_ITEMS_PER_REFRESH, "Feed items");
  const items: ParsedFeedItem[] = await mapInBatches(parsedItems, REMOTE_PROBE_BATCH_SIZE, async (item) => {
    const extra = item as unknown as Record<string, unknown>;
    const rawContentHtml = (extra.contentEncoded as string | undefined) ?? item["content"] ?? null;
    const redditPermalink = item.link?.includes("reddit.com") ? item.link : null;
    const redditExternalUrl = sourceType === FeedSourceType.REDDIT_RSS
      ? externalRedditArticleUrl(rawContentHtml)
      : null;
    const canonicalUrl =
      redditExternalUrl ||
      item.link?.trim() ||
      (typeof item.enclosure?.url === "string" ? item.enclosure.url : null);
    const videoId =
      extra.ytVideoId?.toString() ??
      new URL(canonicalUrl || "https://www.youtube.com", "https://www.youtube.com")
        .searchParams.get("v");
    const feedThumbnailUrl = firstThumbnailUrlFromParsedItem(extra.mediaThumbnail);
    const redditPreviewUrl = sourceType === FeedSourceType.REDDIT_RSS
      ? higherResolutionRedditPreviewUrl(extra.contentEncoded ?? item["content"], feedThumbnailUrl)
      : null;
    const mediaUrl = videoId
      ? feedThumbnailUrl || getYouTubeThumbnailUrls(videoId)[0] || null
      : item.enclosure?.url || redditPreviewUrl || feedThumbnailUrl || null;

    const rawId =
      item.guid ||
      (typeof extra.id === "string" ? extra.id : null) ||
      canonicalUrl ||
      `${item.title ?? ""}:${item.pubDate ?? ""}:${item.isoDate ?? ""}`;
    const contentHtml = sanitizeReaderHtml(
      sourceType === FeedSourceType.REDDIT_RSS
        ? removeDuplicateRedditPreviewHtml(rawContentHtml, mediaUrl)
        : rawContentHtml,
    ) || null;

    return {
      uniqueKey: hashUniqueKey(feedId, rawId),
      guid: item.guid ?? (typeof extra.id === "string" ? extra.id : null),
      externalId: (typeof extra.id === "string" ? extra.id : null) ?? item.guid ?? null,
      title: decodeHtmlEntities(item.title?.trim()) || "Untitled item",
      summary: decodeHtmlEntities(item.contentSnippet?.trim() || item.summary?.trim()) || null,
      contentHtml,
      author:
        decodeHtmlEntities(item.creator?.trim()) ||
        (typeof extra.author === "string" ? decodeHtmlEntities(extra.author.trim()) : null),
      canonicalUrl: canonicalUrl || null,
      commentsUrl: typeof extra.comments === "string" ? extra.comments.trim() : null,
      mediaUrl,
      youtubeVideoId: videoId,
      redditPermalink,
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
