export type FeedValidationResult = {
  title: string;
  description?: string | null;
  siteUrl?: string | null;
  feedUrl: string;
  iconUrl?: string | null;
  sourceType:
    | "RSS"
    | "ATOM"
    | "REDDIT_RSS"
    | "YOUTUBE_CHANNEL_RSS"
    | "YOUTUBE_PLAYLIST_RSS"
    | "YOUTUBE_RSS"
    | "UNKNOWN";
};

export type ParsedFeedItem = {
  uniqueKey: string;
  guid?: string | null;
  externalId?: string | null;
  title: string;
  summary?: string | null;
  contentHtml?: string | null;
  author?: string | null;
  canonicalUrl?: string | null;
  commentsUrl?: string | null;
  mediaUrl?: string | null;
  youtubeVideoId?: string | null;
  youtubeIsShort?: boolean;
  redditPermalink?: string | null;
  publishedAt?: Date | null;
};
