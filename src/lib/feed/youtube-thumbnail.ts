const LANDSCAPE_QUALITY_ORDER = [
  "maxresdefault",
  "hq720",
  "sddefault",
  "hqdefault",
  "mqdefault",
  "0",
  "default",
] as const;

const SHORTS_QUALITY_ORDER = ["oar2", "maxres2", "hq2", "frame0"] as const;

const THUMBNAIL_MINIMUM_SIZES: Record<string, { width: number; height: number }> = {
  oar2: { width: 320, height: 180 },
  maxres2: { width: 320, height: 180 },
  hq2: { width: 320, height: 180 },
  frame0: { width: 320, height: 180 },
  maxresdefault: { width: 320, height: 180 },
  hq720: { width: 320, height: 180 },
  sddefault: { width: 320, height: 180 },
  hqdefault: { width: 320, height: 180 },
  mqdefault: { width: 320, height: 180 },
  "0": { width: 320, height: 180 },
  default: { width: 120, height: 90 },
};

const THUMBNAIL_NAME_PATTERN = [...SHORTS_QUALITY_ORDER, ...LANDSCAPE_QUALITY_ORDER].join("|");

type YouTubeThumbnailOptions = {
  existingUrl?: string | null;
  isShort?: boolean;
};

export function getYouTubeThumbnailUrls(videoId: string, options: YouTubeThumbnailOptions = {}) {
  const qualities = options.isShort
    ? [...SHORTS_QUALITY_ORDER, ...LANDSCAPE_QUALITY_ORDER]
    : LANDSCAPE_QUALITY_ORDER;
  const urls = qualities.map((quality) => `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`);

  if (options.existingUrl) {
    urls.push(options.existingUrl);
  }

  return [...new Set(urls)];
}

export function isLikelyLowResolutionYouTubePlaceholder(
  thumbnailUrl: string,
  image: Pick<HTMLImageElement, "naturalWidth" | "naturalHeight">,
) {
  if (!isYouTubeVideoThumbnail(thumbnailUrl)) {
    return false;
  }

  const minimumSize = getThumbnailMinimumSize(thumbnailUrl);
  if (!minimumSize || !image.naturalWidth || !image.naturalHeight) {
    return false;
  }

  return image.naturalWidth < minimumSize.width || image.naturalHeight < minimumSize.height;
}

function isYouTubeVideoThumbnail(thumbnailUrl: string) {
  try {
    const url = new URL(thumbnailUrl);
    return (
      (/^i\d*\.ytimg\.com$/i.test(url.hostname) || url.hostname === "img.youtube.com") &&
      new RegExp(`/vi/[^/]+/(?:${THUMBNAIL_NAME_PATTERN})\\.jpg$`, "i").test(url.pathname)
    );
  } catch {
    return false;
  }
}

function getThumbnailMinimumSize(thumbnailUrl: string) {
  const match = thumbnailUrl.match(new RegExp(`/(${THUMBNAIL_NAME_PATTERN})\\.jpg(?:\\?|$)`, "i"));
  if (!match) {
    return null;
  }

  return THUMBNAIL_MINIMUM_SIZES[match[1].toLowerCase()] ?? null;
}
