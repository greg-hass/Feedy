import { FeedSourceType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildTimelinePage } from "@/lib/timeline-pagination";

export type TimelineSourceFilter = "RSS" | "REDDIT" | "YOUTUBE";
export type TimelineStateFilter = "UNREAD" | "READ" | "ALL";
export type FeedSourceFilter = "ALL" | TimelineSourceFilter;

const itemCommonSelect = {
  id: true,
  uniqueKey: true,
  title: true,
  summary: true,
  canonicalUrl: true,
  mediaUrl: true,
  publishedAt: true,
  youtubeVideoId: true,
  youtubeIsShort: true,
  feed: {
    select: {
      id: true,
      title: true,
      label: true,
      sourceType: true,
    },
  },
  bookmarks: {
    select: { id: true },
  },
  readStates: {
    select: { id: true },
  },
} satisfies Prisma.ItemSelect;

const timelineItemSelect = {
  ...itemCommonSelect,
} satisfies Prisma.ItemSelect;

const readerItemSelect = {
  ...itemCommonSelect,
  readabilityHtml: true,
  contentHtml: true,
  commentsUrl: true,
  redditPermalink: true,
  author: true,
  discoveredAt: true,
  fetchedAt: true,
} satisfies Prisma.ItemSelect;

type TimelineItemRecord = Prisma.ItemGetPayload<{
  select: typeof timelineItemSelect;
}>;

type TimelineItemQueryOptions = {
  feedId?: string;
  folderId?: string;
  saved?: boolean;
  sourceFilter?: TimelineSourceFilter;
  stateFilter?: TimelineStateFilter;
  q?: string;
  cursor?: string;
  pageSize?: number;
};

function buildSourceTypeFilter(
  sourceFilter?: TimelineSourceFilter | FeedSourceFilter,
):
  | FeedSourceType
  | {
      in: FeedSourceType[];
    }
  | undefined {
  if (sourceFilter === "YOUTUBE") {
    return {
      in: [
        FeedSourceType.YOUTUBE_RSS,
        FeedSourceType.YOUTUBE_CHANNEL_RSS,
        FeedSourceType.YOUTUBE_PLAYLIST_RSS,
      ],
    };
  }

  if (sourceFilter === "REDDIT") {
    return FeedSourceType.REDDIT_RSS;
  }

  if (sourceFilter === "RSS") {
    return { in: [FeedSourceType.RSS, FeedSourceType.ATOM, FeedSourceType.UNKNOWN] };
  }

  return undefined;
}

async function buildTimelineQuery(
  userId: string,
  options?: TimelineItemQueryOptions,
  pageSize = 100,
  includeExtraItem = false,
  hideYouTubeShorts?: boolean,
){
  const sourceTypeFilter = buildSourceTypeFilter(options?.sourceFilter);
  const resolvedHideYouTubeShorts =
    hideYouTubeShorts ??
    (
      await prisma.user.findUnique({
        where: { id: userId },
        select: { settings: { select: { hideYouTubeShorts: true } } },
      })
    )?.settings?.hideYouTubeShorts ??
    false;

  const stateWhere =
    options?.saved
      ? { bookmarks: { some: { userId } } }
      : options?.stateFilter === "READ"
        ? { readStates: { some: { userId } } }
        : options?.stateFilter === "ALL"
          ? {}
          : { readStates: { none: { userId } } };

  const searchQuery = options?.q?.trim() ?? "";
  const matchingFeedIds =
    searchQuery.length > 0
      ? (
          await prisma.feed.findMany({
            where: {
              userId,
              ...(options?.feedId ? { id: options.feedId } : {}),
              ...(options?.folderId ? { folderId: options.folderId } : {}),
              ...(!options?.feedId && !options?.folderId ? { excludeFromTimeline: false } : {}),
              ...(sourceTypeFilter ? { sourceType: sourceTypeFilter } : {}),
              OR: [
                { title: { contains: searchQuery, mode: "insensitive" as const } },
                { label: { contains: searchQuery, mode: "insensitive" as const } },
              ],
            },
            select: { id: true },
          })
        ).map((feed) => feed.id)
      : [];

  const searchWhere =
    searchQuery.length > 0
      ? {
          OR: [
            { title: { contains: searchQuery, mode: "insensitive" as const } },
            { summary: { contains: searchQuery, mode: "insensitive" as const } },
            { contentHtml: { contains: searchQuery, mode: "insensitive" as const } },
            { readabilityHtml: { contains: searchQuery, mode: "insensitive" as const } },
            { author: { contains: searchQuery, mode: "insensitive" as const } },
            ...(matchingFeedIds.length > 0
              ? [{ feedId: { in: matchingFeedIds } }]
              : []),
          ],
        }
      : {};

  const query = {
    where: {
      feed: {
        userId,
        ...(options?.feedId ? { id: options.feedId } : {}),
        ...(options?.folderId ? { folderId: options.folderId } : {}),
        ...(!options?.feedId && !options?.folderId ? { excludeFromTimeline: false } : {}),
        ...(sourceTypeFilter ? { sourceType: sourceTypeFilter } : {}),
      },
      ...stateWhere,
      ...(!options?.saved && !options?.feedId && !options?.folderId ? { mutedByRule: false } : {}),
      ...(resolvedHideYouTubeShorts ? { youtubeIsShort: false } : {}),
      ...searchWhere,
    },
    orderBy: [
      { publishedAt: { sort: "desc", nulls: "last" } },
      { discoveredAt: "desc" },
      { uniqueKey: "desc" },
    ],
    take: includeExtraItem ? pageSize + 1 : pageSize,
    ...(options?.cursor ? { cursor: { uniqueKey: options.cursor }, skip: 1 } : {}),
    select: {
      ...timelineItemSelect,
      bookmarks: { where: { userId }, select: { id: true } },
      readStates: { where: { userId }, select: { id: true } },
    },
  } satisfies Prisma.ItemFindManyArgs;

  return {
    query,
    searchQuery: searchQuery.length > 0 ? searchQuery : null,
  };
}

async function loadTimelineItemRecords(
  userId: string,
  options?: TimelineItemQueryOptions,
  pageSize = 100,
  includeExtraItem = false,
  hideYouTubeShorts?: boolean,
) : Promise<TimelineItemRecord[]> {
  const { query } = await buildTimelineQuery(
    userId,
    options,
    pageSize,
    includeExtraItem,
    hideYouTubeShorts,
  );
  return prisma.item.findMany(query);
}
export async function getTimelineItems(
  userId: string,
  options?: TimelineItemQueryOptions,
  hideYouTubeShorts?: boolean,
): Promise<TimelineItemRecord[]> {
  return loadTimelineItemRecords(userId, options, 100, false, hideYouTubeShorts);
}

export async function getTimelineItemPage(
  userId: string,
  options?: TimelineItemQueryOptions,
  hideYouTubeShorts?: boolean,
) {
  const pageSize = options?.pageSize ?? 100;
  const records = await loadTimelineItemRecords(userId, options, pageSize, true, hideYouTubeShorts);
  return buildTimelinePage(records, pageSize);
}

export async function getFeedSearch(
  userId: string,
  query: string,
  sourceFilter: FeedSourceFilter = "ALL",
) {
  if (!query.trim()) {
    return [];
  }

  const sourceTypeFilter = buildSourceTypeFilter(sourceFilter);

  return prisma.feed.findMany({
    where: {
      userId,
      ...(sourceTypeFilter ? { sourceType: sourceTypeFilter } : {}),
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { label: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { siteUrl: { contains: query, mode: "insensitive" } },
        { sourceUrl: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      title: true,
      label: true,
      description: true,
      sourceType: true,
      sourceUrl: true,
    },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    take: 20,
  });
}

export async function getReaderItem(userId: string, itemId: string) {
  return prisma.item.findFirst({
    where: {
      id: itemId,
      feed: { userId },
    },
    select: {
      ...readerItemSelect,
      bookmarks: { where: { userId }, select: { id: true } },
      readStates: { where: { userId }, select: { id: true } },
    },
  });
}
