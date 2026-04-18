import { Innertube, Platform } from "youtubei.js/web";

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

let innertubePromise: Promise<Innertube> | null = null;

Platform.shim.eval = async (data, env) => {
  const exports: string[] = [];

  if (env.n) {
    exports.push(`n: exportedVars.nFunction("${env.n}")`);
  }

  if (env.sig) {
    exports.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  }

  const code = `${data.output}\nreturn { ${exports.join(", ")} };`;
  return new Function(code)();
};

function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = Innertube.create();
  }

  return innertubePromise;
}

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

async function resolveYouTubeSource(videoId: string): Promise<ResolvedNativeSource | ResolvedFallbackSource> {
  try {
    const innertube = await getInnertube();
    const info = await innertube.getInfo(videoId);
    const player = (info.actions as unknown as { session?: { player?: unknown } }).session?.player;

    const combinedFormats = (info.streaming_data?.formats ?? [])
      .filter((format) => format.has_audio && format.has_video)
      .sort((a, b) => {
        const heightDelta = (b.height ?? 0) - (a.height ?? 0);
        if (heightDelta !== 0) return heightDelta;
        return (b.bitrate ?? 0) - (a.bitrate ?? 0);
      });

    for (const format of combinedFormats) {
      const src = format.url || (await format.decipher(player as never));
      if (!src) {
        continue;
      }

      return {
        kind: "native",
        src,
        type: format.mime_type || "video/mp4",
        poster: info.basic_info.thumbnail?.[0]?.url ?? null,
        youtubeVideoId: videoId,
      };
    }
  } catch {
    // Fall through to the iframe player.
  }

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
