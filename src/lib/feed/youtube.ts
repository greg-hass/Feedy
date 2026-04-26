import { createHash } from "node:crypto";

import Parser from "rss-parser";

import type { FeedValidationResult, ParsedFeedItem } from "@/lib/feed/types";
import { fetchWithTimeout } from "@/lib/http";
import { decodeHtmlEntities } from "@/lib/utils";

type YouTubeFeedTarget =
  | {
      kind: "channel";
      id: string;
      feedUrl: string;
      sourceType: "YOUTUBE_CHANNEL_RSS";
    }
  | {
      kind: "playlist";
      id: string;
      feedUrl: string;
      sourceType: "YOUTUBE_PLAYLIST_RSS";
    };

type YouTubeFeedFetchResult =
  | {
      notModified: true;
      etag: string | null;
      lastModified: string | null;
    }
  | {
      notModified: false;
      etag: string | null;
      lastModified: string | null;
      feed: {
        title: string;
        description: string | null;
        siteUrl: string | null;
        iconUrl: string | null;
        sourceType: "YOUTUBE_CHANNEL_RSS" | "YOUTUBE_PLAYLIST_RSS";
        feedUrl: string;
      };
      items: ParsedFeedItem[];
    };

const parser = new Parser({
  defaultRSS: 2.0,
  headers: {
    "user-agent": "Feedy/1.0",
  },
  customFields: {
    item: [
      ["yt:videoId", "ytVideoId"],
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

type ParsedYouTubeItem = {
  ytVideoId?: string | null;
  title?: string | null;
  link?: string | null;
  id?: string | null;
  pubDate?: string | null;
  isoDate?: string | null;
  author?: string | null;
  mediaThumbnail?: Array<{ $?: { url?: string } }>;
  enclosure?: { url?: string | null } | null;
};

const shortsProbeCache = new Map<string, Promise<boolean>>();

export function getYouTubeThumbnailUrls(videoId: string) {
  return [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/default.jpg`,
    `https://img.youtube.com/vi/${videoId}/0.jpg`,
  ];
}

export function probeYouTubeShort(videoId: string) {
  const cached = shortsProbeCache.get(videoId);
  if (cached) {
    return cached;
  }

  const probe = (async () => {
    try {
      const response = await fetchWithTimeout(`https://www.youtube.com/shorts/${videoId}`, {
        headers: {
          "user-agent": "Feedy/1.0",
        },
      });
      return response.ok && response.url.includes(`/shorts/${videoId}`);
    } catch {
      return false;
    }
  })();

  shortsProbeCache.set(videoId, probe);
  return probe;
}

function readText(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text.trim() || null;
  }
  if (typeof record.name === "string") {
    return record.name.trim() || null;
  }
  if (typeof record.title === "string") {
    return record.title.trim() || null;
  }

  return null;
}

function firstThumbnailUrlFromParsedItem(value: ParsedYouTubeItem["mediaThumbnail"]) {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const thumbnail of value) {
    const url = thumbnail?.$?.url?.trim();
    if (url) {
      return url;
    }
  }

  return null;
}

function parseRelativeYouTubeDate(text: string | null): Date | null {
  if (!text) {
    return null;
  }

  const normalized = text
    .toLowerCase()
    .trim()
    .replace(/^(streamed|premiered|uploaded|posted)\s+/i, "")
    .replace(/\s+\(edited\)$/i, "");
  if (normalized === "just now") {
    return new Date();
  }

  const match = normalized.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const unitMs: Record<string, number> = {
    second: 1_000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 7 * 86_400_000,
    month: 30 * 86_400_000,
    year: 365 * 86_400_000,
  };

  return new Date(Date.now() - amount * unitMs[unit]);
}

function extractYouTubePublishedText(item: Record<string, unknown>) {
  return (
    readText(item.published) ||
    readText(item.published_time) ||
    readText(item.publish_date) ||
    readText(item.publishedTimeText) ||
    readText(item.dateText) ||
    readText(item.publishDate) ||
    readText(item.pubDate) ||
    readText(item.isoDate) ||
    null
  );
}

function parseYouTubePublishedAt(item: Record<string, unknown>) {
  const publishedText = extractYouTubePublishedText(item);
  const relativeDate = parseRelativeYouTubeDate(publishedText);
  if (relativeDate) {
    return relativeDate;
  }

  if (publishedText) {
    const absoluteDate = new Date(publishedText);
    if (!Number.isNaN(absoluteDate.getTime())) {
      return absoluteDate;
    }
  }

  return null;
}

function normalizeFeedUrl(url: string) {
  try {
    return new URL(url).toString();
  } catch {
    return url;
  }
}

export function parseYouTubeFeedTarget(url: string): YouTubeFeedTarget | null {
  try {
    const parsed = new URL(url);

    if (!parsed.hostname.includes("youtube.com")) {
      return null;
    }

    if (parsed.pathname !== "/feeds/videos.xml") {
      return null;
    }

    const channelId = parsed.searchParams.get("channel_id");
    if (channelId) {
      return {
        kind: "channel",
        id: channelId,
        feedUrl: normalizeFeedUrl(url),
        sourceType: "YOUTUBE_CHANNEL_RSS",
      };
    }

    const playlistId = parsed.searchParams.get("playlist_id");
    if (playlistId) {
      return {
        kind: "playlist",
        id: playlistId,
        feedUrl: normalizeFeedUrl(url),
        sourceType: "YOUTUBE_PLAYLIST_RSS",
      };
    }
  } catch {
    return null;
  }

  return null;
}

function hashYouTubeItemIds(items: ParsedFeedItem[]) {
  return createHash("sha256")
    .update(
      items
        .map(
          (item) =>
            [
              item.externalId || item.guid || item.canonicalUrl || item.title,
              item.publishedAt?.toISOString() ?? "",
            ].join(":"),
        )
        .join("|"),
    )
    .digest("hex");
}

async function mapFeedItemToItem(feedId: string, item: ParsedYouTubeItem): Promise<ParsedFeedItem> {
  const videoId =
    (typeof item.ytVideoId === "string" ? item.ytVideoId : null) ??
    (typeof item.id === "string" && item.id.startsWith("yt:video:") ? item.id.replace(/^yt:video:/, "") : null) ??
    (typeof item.link === "string"
      ? new URL(item.link).searchParams.get("v")
      : null);
  const title = decodeHtmlEntities((typeof item.title === "string" ? item.title.trim() : "") || "Untitled item");
  const published = parseYouTubePublishedAt(item as unknown as Record<string, unknown>);
  const author = decodeHtmlEntities(typeof item.author === "string" ? item.author.trim() || null : null);
  const feedThumbnailUrl =
    firstThumbnailUrlFromParsedItem(item.mediaThumbnail) ||
    (typeof item.enclosure?.url === "string" ? item.enclosure.url.trim() || null : null);
  const mediaUrl =
    feedThumbnailUrl ||
    (typeof item.enclosure?.url === "string" ? item.enclosure.url.trim() || null : null) ||
    (videoId ? getYouTubeThumbnailUrls(videoId)[0] : null);

  return {
    uniqueKey: createHash("sha256")
      .update(`${feedId}:${videoId || title}`)
      .digest("hex"),
    guid: videoId,
    externalId: videoId,
    title,
    summary: null,
    contentHtml: null,
    author,
    canonicalUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
    commentsUrl: null,
      mediaUrl,
    youtubeVideoId: videoId,
    youtubeIsShort: false,
    redditPermalink: null,
    publishedAt: published,
  };
}

export async function validateYouTubeFeedUrl(url: string): Promise<FeedValidationResult> {
  const target = parseYouTubeFeedTarget(url);
  if (!target) {
    throw new Error("Unsupported YouTube feed URL");
  }

  const response = await fetchWithTimeout(target.feedUrl, {
    headers: {
      "user-agent": "Feedy/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Feed returned ${response.status}`);
  }

  const feed = await parser.parseString(await response.text());

  return {
    title: decodeHtmlEntities(feed.title?.trim()) || "Untitled feed",
    description: decodeHtmlEntities(readText((feed as { description?: unknown }).description) || null),
    siteUrl: feed.link?.trim() || target.feedUrl,
    feedUrl: target.feedUrl,
    iconUrl: null,
    sourceType: target.sourceType,
  };
}

export async function fetchYouTubeFeedConditionally(
  url: string,
  feedId: string,
  options?: {
    etag?: string | null;
  },
): Promise<YouTubeFeedFetchResult> {
  const target = parseYouTubeFeedTarget(url);
  if (!target) {
    throw new Error("Unsupported YouTube feed URL");
  }

  const requestHeaders: Record<string, string> = {
    "user-agent": "Feedy/1.0",
  };
  if (options?.etag) {
    requestHeaders["if-none-match"] = options.etag;
  }

  const response = await fetchWithTimeout(target.feedUrl, {
    headers: requestHeaders,
  });
  if (response.status === 304) {
    return {
      notModified: true as const,
      etag: response.headers.get("etag") ?? options?.etag ?? null,
      lastModified: response.headers.get("last-modified") ?? null,
    };
  }
  if (!response.ok) {
    throw new Error(`Feed returned ${response.status}`);
  }

  const feed = await parser.parseString(await response.text());
  const items = await Promise.all((feed.items ?? []).map((item) => mapFeedItemToItem(feedId, item as ParsedYouTubeItem)));
  const etag = hashYouTubeItemIds(items);

  if (options?.etag && options.etag === etag) {
    return {
      notModified: true,
      etag,
      lastModified: null,
    };
  }

  return {
    notModified: false,
    etag,
    lastModified: response.headers.get("last-modified"),
    feed: {
      title: decodeHtmlEntities(feed.title?.trim()) || "Untitled feed",
      description: decodeHtmlEntities(readText((feed as { description?: unknown }).description) || null),
      siteUrl: feed.link?.trim() || target.feedUrl,
      iconUrl: null,
      sourceType: target.sourceType,
      feedUrl: target.feedUrl,
    },
    items,
  };
}
