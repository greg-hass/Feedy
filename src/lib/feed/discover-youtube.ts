import type { DiscoveryResult } from "@/lib/feed/discover-types";
import { normalizeYoutubeIdentity } from "@/lib/feed/discover-utils";

export function youtubeCanonicalKey(result: DiscoveryResult) {
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

export function normalizeYoutubeFeed(url: string) {
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

export function extractYouTubeHandle(url: string) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/@([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? null;
  } catch {
    const match = url.match(/\/@([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? null;
  }
}

export function extractYouTubeChannelId(url: string) {
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

export type YouTubeChannelCandidate = {
  channelId: string;
  title: string;
  handle?: string | null;
  thumbnail?: string | null;
};

export function findYouTubeChannelCandidates(payload: unknown) {
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

export function extractYouTubeInitialDataFromHtml(html: string) {
  return extractYouTubeInitialData(html);
}
