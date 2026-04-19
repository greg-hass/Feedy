type ResolvedNativeSource = {
  kind: "native";
  src: string;
  type: string;
  poster?: string | null;
  youtubeVideoId?: string | null;
};

type ResolvedFallbackSource = {
  kind: "youtube";
  youtubeVideoId: string;
  poster?: string | null;
};

type UnresolvedSource = {
  kind: "none";
};

export type ResolvedMediaSource = ResolvedNativeSource | ResolvedFallbackSource | UnresolvedSource;

function isLikelyVideoUrl(url: string) {
  return /\.(mp4|m4v|mov|webm|m3u8)(?:[?#]|$)/i.test(url);
}

async function detectContentType(url: string) {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow" });
    return response.headers.get("content-type")?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

async function resolveYouTubeSource(videoId: string): Promise<ResolvedFallbackSource> {
  return {
    kind: "youtube",
    youtubeVideoId: videoId,
  };
}

export async function resolvePlayableMediaSource(input: {
  mediaUrl: string | null;
  youtubeVideoId: string | null;
  title: string;
}): Promise<ResolvedMediaSource> {
  if (input.youtubeVideoId) {
    return resolveYouTubeSource(input.youtubeVideoId);
  }

  if (input.mediaUrl) {
    if (isLikelyVideoUrl(input.mediaUrl)) {
      return {
        kind: "native",
        src: input.mediaUrl,
        type: "video/mp4",
        poster: null,
      };
    }

    const contentType = await detectContentType(input.mediaUrl);
    if (contentType?.startsWith("video/")) {
      return {
        kind: "native",
        src: input.mediaUrl,
        type: contentType,
        poster: null,
      };
    }
  }

  return { kind: "none" };
}
