export type DiscoveryResult = {
  title: string;
  description?: string | null;
  siteName?: string | null;
  favicon?: string | null;
  feedUrl: string;
  siteUrl?: string | null;
  sourceType: "RSS" | "REDDIT_RSS" | "YOUTUBE_RSS";
};

export type DiscoverySourceFilter = "ALL" | "RSS" | "REDDIT" | "YOUTUBE";
