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
