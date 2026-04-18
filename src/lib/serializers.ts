export function serializeItem(item: {
  id: string;
  title: string;
  summary: string | null;
  readabilityHtml?: string | null;
  contentHtml?: string | null;
  canonicalUrl: string | null;
  commentsUrl?: string | null;
  mediaUrl: string | null;
  publishedAt: Date | null;
  youtubeVideoId: string | null;
  redditPermalink?: string | null;
  feed: {
    id: string;
    title: string;
    label: string | null;
    sourceType: string;
  };
  bookmarks: Array<unknown>;
  readStates: Array<unknown>;
}) {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    readabilityHtml: item.readabilityHtml,
    contentHtml: item.contentHtml,
    canonicalUrl: item.canonicalUrl,
    commentsUrl: item.commentsUrl,
    mediaUrl: item.mediaUrl,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    youtubeVideoId: item.youtubeVideoId,
    redditPermalink: item.redditPermalink,
    feed: item.feed,
    bookmarked: item.bookmarks.length > 0,
    read: item.readStates.length > 0,
  };
}
