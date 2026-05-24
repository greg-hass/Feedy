import sharp from "sharp";

import { fetchWithTimeout } from "@/lib/http";
import { getYouTubeThumbnailUrls } from "@/lib/feed/youtube-thumbnail";

const youtubePreviewCache = new Map<string, Promise<string>>();

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function splitTitleForSvg(title: string) {
  const normalized = title.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return ["YouTube video"];
  }

  const maxChars = 28;
  if (normalized.length <= maxChars) {
    return [normalized];
  }

  const midpoint = Math.floor(normalized.length / 2);
  const breakPoint =
    normalized.lastIndexOf(" ", midpoint) > 12
      ? normalized.lastIndexOf(" ", midpoint)
      : normalized.indexOf(" ", midpoint);

  if (breakPoint > 0) {
    const first = normalized.slice(0, breakPoint).trim();
    const second = normalized.slice(breakPoint + 1).trim();
    if (first && second) {
      return [first, second].map((line, index) =>
        index === 1 && line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line,
      );
    }
  }

  return [normalized.slice(0, maxChars - 1).trimEnd() + "…"];
}

function buildFallbackYouTubeThumbnailDataUrl(title: string) {
  const lines = splitTitleForSvg(title);
  const textBlocks = lines
    .slice(0, 2)
    .map((line, index) => {
      const y = 116 + index * 26;
      return `<text x="42" y="${y}" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700">${escapeXml(line)}</text>`;
    })
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-label="${escapeXml(title || "YouTube video")}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="50%" stop-color="#1f2937" />
          <stop offset="100%" stop-color="#111827" />
        </linearGradient>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#34d399" />
          <stop offset="100%" stop-color="#10b981" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)" />
      <circle cx="178" cy="178" r="96" fill="rgba(255,255,255,0.08)" />
      <rect x="88" y="88" width="180" height="110" rx="28" fill="rgba(255,255,255,0.10)" />
      <rect x="162" y="122" width="84" height="42" rx="21" fill="rgba(255,255,255,0.18)" />
      <path d="M196 133 L196 153 L214 143 Z" fill="#ffffff" opacity="0.95" />
      <text x="42" y="76" fill="#6ee7b7" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="3">YOUTUBE</text>
      ${textBlocks}
      <rect x="42" y="176" width="280" height="6" rx="3" fill="url(#accent)" opacity="0.9" />
      <text x="42" y="230" fill="rgba(255,255,255,0.72)" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="500">Preview unavailable from YouTube</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function fetchImageBytes(candidateUrl: string) {
  const response = await fetchWithTimeout(candidateUrl, {
    headers: {
      "user-agent": "Feedy/1.0",
    },
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
    return null;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.length > 0 ? bytes : null;
}

async function isLikelyThumbnailPlaceholder(bytes: Buffer) {
  try {
    const { data, info } = await sharp(bytes)
      .resize(32, 18, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = info.width * info.height;
    if (pixels <= 0) {
      return true;
    }

    let sum = 0;
    let sumSquares = 0;
    for (let index = 0; index < data.length; index += info.channels) {
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      const luminance = (red + green + blue) / 3;
      sum += luminance;
      sumSquares += luminance * luminance;
    }

    const mean = sum / pixels;
    const variance = sumSquares / pixels - mean * mean;
    const standardDeviation = Math.sqrt(Math.max(variance, 0));

    return standardDeviation < 22;
  } catch {
    return false;
  }
}

async function fetchYouTubeOEmbedThumbnail(videoId: string) {
  try {
    const url = new URL("https://www.youtube.com/oembed");
    url.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
    url.searchParams.set("format", "json");

    const response = await fetchWithTimeout(url, {
      headers: {
        "user-agent": "Feedy/1.0",
      },
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { thumbnail_url?: string };
    const thumbnailUrl = typeof body.thumbnail_url === "string" ? body.thumbnail_url.trim() : "";
    return thumbnailUrl || null;
  } catch {
    return null;
  }
}

async function fetchYouTubeWatchThumbnail(videoId: string) {
  try {
    const response = await fetchWithTimeout(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "user-agent": "Feedy/1.0",
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const ogImage =
      /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1] ??
      /<meta itemprop="thumbnailUrl" content="([^"]+)"/.exec(html)?.[1];

    if (!ogImage) {
      return null;
    }

    return ogImage.startsWith("//") ? `https:${ogImage}` : ogImage;
  } catch {
    return null;
  }
}

export async function resolveYouTubePreviewUrl(input: {
  videoId: string | null;
  title: string;
  feedThumbnailUrl?: string | null;
}) {
  const videoId = input.videoId;
  if (!videoId) {
    return buildFallbackYouTubeThumbnailDataUrl(input.title);
  }

  const cacheKey = [videoId, input.feedThumbnailUrl || ""].join("|");
  const cached = youtubePreviewCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const preview = (async () => {
    const candidateUrls = new Set<string>();
    if (input.feedThumbnailUrl) {
      candidateUrls.add(input.feedThumbnailUrl);
    }

    const oEmbedThumbnail = await fetchYouTubeOEmbedThumbnail(videoId);
    if (oEmbedThumbnail) {
      candidateUrls.add(oEmbedThumbnail);
    }

    const watchThumbnail = await fetchYouTubeWatchThumbnail(videoId);
    if (watchThumbnail) {
      candidateUrls.add(watchThumbnail);
    }

    for (const thumbnailUrl of getYouTubeThumbnailUrls(videoId)) {
      candidateUrls.add(thumbnailUrl);
    }

    for (const candidateUrl of candidateUrls) {
      const bytes = await fetchImageBytes(candidateUrl);
      if (!bytes) {
        continue;
      }

      if (await isLikelyThumbnailPlaceholder(bytes)) {
        continue;
      }

      return candidateUrl;
    }

    return buildFallbackYouTubeThumbnailDataUrl(input.title);
  })();

  youtubePreviewCache.set(cacheKey, preview);
  return preview;
}
