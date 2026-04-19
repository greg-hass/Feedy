import { createHash } from "node:crypto";

import { Innertube } from "youtubei.js";

import type { FeedValidationResult, ParsedFeedItem } from "@/lib/feed/types";
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

let innertubePromise: Promise<Innertube> | null = null;

async function getYouTubeClient() {
  innertubePromise ??= Innertube.create();
  return innertubePromise;
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

function firstThumbnailUrl(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const first = value[0] as Record<string, unknown> | undefined;
  if (!first || typeof first.url !== "string") {
    return null;
  }

  return first.url.trim() || null;
}

function parseRelativeYouTubeDate(text: string | null): Date | null {
  if (!text) {
    return null;
  }

  const normalized = text.toLowerCase().trim();
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
    .update(items.map((item) => item.externalId || item.guid || item.canonicalUrl || item.title).join("|"))
    .digest("hex");
}

function mapChannelVideoToItem(feedId: string, item: Record<string, unknown>): ParsedFeedItem {
  const videoId =
    (typeof item.video_id === "string" ? item.video_id : null) ??
    (typeof item.id === "string" ? item.id : null);
  const title = decodeHtmlEntities(readText(item.title) || "Untitled item");
  const published = parseRelativeYouTubeDate(readText(item.published));
  const author = decodeHtmlEntities(readText(item.author) || readText(item.owner) || null);

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
    mediaUrl: firstThumbnailUrl(item.thumbnails),
    youtubeVideoId: videoId,
    redditPermalink: null,
    publishedAt: published,
  };
}

function mapPlaylistItemToItem(feedId: string, item: Record<string, unknown>): ParsedFeedItem {
  const videoId =
    (typeof item.video_id === "string" ? item.video_id : null) ??
    (typeof item.id === "string" ? item.id : null);
  const title = decodeHtmlEntities(readText(item.title) || "Untitled item");
  const published = parseRelativeYouTubeDate(readText(item.published));
  const author = decodeHtmlEntities(readText(item.author) || null);

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
    mediaUrl: firstThumbnailUrl(item.thumbnails),
    youtubeVideoId: videoId,
    redditPermalink: null,
    publishedAt: published,
  };
}

export async function validateYouTubeFeedUrl(url: string): Promise<FeedValidationResult> {
  const target = parseYouTubeFeedTarget(url);
  if (!target) {
    throw new Error("Unsupported YouTube feed URL");
  }

  const youtube = await getYouTubeClient();

  if (target.kind === "channel") {
    const channel = await youtube.getChannel(target.id);
    const metadata = channel.metadata ?? {};

    return {
      title: decodeHtmlEntities(readText(metadata.title) || "Untitled feed"),
      description: decodeHtmlEntities(readText(metadata.description) || null),
      siteUrl: readText(metadata.url_canonical) || readText(metadata.url) || `https://www.youtube.com/channel/${target.id}`,
      feedUrl: target.feedUrl,
      iconUrl: firstThumbnailUrl(metadata.avatar) || firstThumbnailUrl(metadata.thumbnail),
      sourceType: target.sourceType,
    };
  }

  const playlist = await youtube.getPlaylist(target.id);
  const info = playlist.info ?? {};

  return {
    title: decodeHtmlEntities(readText(info.title) || "Untitled feed"),
    description: decodeHtmlEntities(readText(info.description) || null),
    siteUrl: `https://www.youtube.com/playlist?list=${target.id}`,
    feedUrl: target.feedUrl,
    iconUrl: firstThumbnailUrl(info.thumbnails),
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

  const youtube = await getYouTubeClient();

  if (target.kind === "channel") {
    const channel = await youtube.getChannel(target.id);
    const current = await channel.getVideos();
    const items = (current.videos ?? []).map((item) =>
      mapChannelVideoToItem(feedId, item as unknown as Record<string, unknown>),
    );
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
      lastModified: null,
      feed: {
        title: decodeHtmlEntities(readText(channel.metadata?.title) || "Untitled feed"),
        description: decodeHtmlEntities(readText(channel.metadata?.description) || null),
        siteUrl:
          readText(channel.metadata?.url_canonical) ||
          readText(channel.metadata?.url) ||
          `https://www.youtube.com/channel/${target.id}`,
        iconUrl: firstThumbnailUrl(channel.metadata?.avatar) || firstThumbnailUrl(channel.metadata?.thumbnail),
        sourceType: target.sourceType,
        feedUrl: target.feedUrl,
      },
      items,
    };
  }

  const playlist = await youtube.getPlaylist(target.id);
  const items = (playlist.items ?? []).map((item) =>
    mapPlaylistItemToItem(feedId, item as unknown as Record<string, unknown>),
  );
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
    lastModified: null,
    feed: {
      title: decodeHtmlEntities(readText(playlist.info?.title) || "Untitled feed"),
      description: decodeHtmlEntities(readText(playlist.info?.description) || null),
      siteUrl: `https://www.youtube.com/playlist?list=${target.id}`,
      iconUrl: firstThumbnailUrl(playlist.info?.thumbnails),
      sourceType: target.sourceType,
      feedUrl: target.feedUrl,
    },
    items,
  };
}
