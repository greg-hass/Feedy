export type NavFeed = {
  id: string;
  title: string;
  label: string | null;
  description: string | null;
  sourceUrl: string;
  siteUrl: string | null;
  sourceType: string;
  isPinned: boolean;
  excludeFromTimeline: boolean;
  muteRules: {
    titlePatterns: string[];
    authorPatterns: string[];
    hideFromTimeline: boolean;
    autoMarkRead: boolean;
  } | null;
  position: number;
  lastRefreshedAt: string | null;
  lastSuccessfulRefreshAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  healthStatus: string;
  folderId: string | null;
  performance: {
    latestDurationMs: number | null;
    averageDurationMs: number | null;
    slowCount24h: number;
    isSlow: boolean;
  };
  counts: {
    unreadCount: number;
    totalCount: number;
  };
};

export type NavFolder = {
  id: string;
  title: string;
  position: number;
  counts: {
    unreadCount: number;
    articleCount: number;
    feedCount: number;
    issueCount: number;
    slowFeedCount: number;
  };
};

export type ItemRecord = {
  id: string;
  title: string;
  summary: string | null;
  readabilityHtml?: string | null;
  contentHtml?: string | null;
  canonicalUrl: string | null;
  commentsUrl?: string | null;
  mediaUrl: string | null;
  publishedAt: string | null;
  youtubeVideoId: string | null;
  youtubeIsShort: boolean;
  redditPermalink?: string | null;
  bookmarked: boolean;
  read: boolean;
  feed: {
    id: string;
    title: string;
    label: string | null;
    sourceType: string;
  };
};

export type TimelineItemsPageResponse = {
  items: ItemRecord[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type MeResponse = {
  authenticated: boolean;
  user: {
    id: string;
    username: string;
    settings: {
      theme: "SYSTEM" | "LIGHT" | "DARK";
      accentColor:
        | "EMERALD"
        | "BLUE"
        | "INDIGO"
        | "VIOLET"
        | "PINK"
        | "ROSE"
        | "ORANGE"
        | "AMBER"
        | "LIME"
        | "CYAN"
        | "TEAL"
        | "SLATE";
      itemRetentionDays: number;
      hideYouTubeShorts: boolean;
      refreshIntervalMinutes: number;
      readerOpenOriginalByDefault: boolean;
      keepScreenAwake: boolean;
    };
  };
  navigation: {
    folders: NavFolder[];
    feeds: NavFeed[];
    stats: {
      unreadTotal: number;
      savedCount: number;
    };
  };
};
