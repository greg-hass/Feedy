import { FeedSourceType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type TimelineSourceFilter = "RSS" | "REDDIT" | "YOUTUBE";
export type TimelineStateFilter = "UNREAD" | "READ" | "ALL";
export type FeedSourceFilter = "ALL" | TimelineSourceFilter;

type FeedCountRow = {
  feedId: string;
  totalCount: bigint;
  unreadCount: bigint;
};

type FolderCountRow = {
  folderId: string | null;
  totalCount: bigint;
  unreadCount: bigint;
};

const navigationFolderSelect = {
  id: true,
  title: true,
  position: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FolderSelect;

const navigationFeedSelect = {
  id: true,
  title: true,
  label: true,
  description: true,
  sourceUrl: true,
  siteUrl: true,
  sourceType: true,
  isPinned: true,
  excludeFromTimeline: true,
  position: true,
  lastRefreshedAt: true,
  lastSuccessfulRefreshAt: true,
  lastFailureAt: true,
  lastError: true,
  healthStatus: true,
  folderId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FeedSelect;

const timelineItemSelect = {
  id: true,
  title: true,
  summary: true,
  readabilityHtml: true,
  contentHtml: true,
  canonicalUrl: true,
  commentsUrl: true,
  mediaUrl: true,
  publishedAt: true,
  youtubeVideoId: true,
  redditPermalink: true,
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

type TimelineItemRecord = Prisma.ItemGetPayload<{
  select: typeof timelineItemSelect;
}>;

export async function getFeedCounts(userId: string) {
  const rows = await prisma.$queryRaw<FeedCountRow[]>(Prisma.sql`
    SELECT
      i."feedId" AS "feedId",
      COUNT(*)::bigint AS "totalCount",
      COUNT(*) FILTER (WHERE rs.id IS NULL)::bigint AS "unreadCount"
    FROM "Item" i
    INNER JOIN "Feed" f ON f.id = i."feedId"
    LEFT JOIN "ReadState" rs
      ON rs."itemId" = i.id
      AND rs."userId" = ${userId}
    WHERE f."userId" = ${userId}
    GROUP BY i."feedId"
  `);

  return new Map(
    rows.map((row) => [
      row.feedId,
      {
        totalCount: Number(row.totalCount),
        unreadCount: Number(row.unreadCount),
      },
    ]),
  );
}

export async function getFolderCounts(userId: string) {
  const rows = await prisma.$queryRaw<FolderCountRow[]>(Prisma.sql`
    SELECT
      f."folderId" AS "folderId",
      COUNT(i.id)::bigint AS "totalCount",
      COUNT(i.id) FILTER (WHERE rs.id IS NULL)::bigint AS "unreadCount"
    FROM "Feed" f
    LEFT JOIN "Item" i ON i."feedId" = f.id
    LEFT JOIN "ReadState" rs
      ON rs."itemId" = i.id
      AND rs."userId" = ${userId}
    WHERE f."userId" = ${userId}
    GROUP BY f."folderId"
  `);

  return new Map(
    rows.map((row) => [
      row.folderId ?? "uncategorized",
      {
        totalCount: Number(row.totalCount),
        unreadCount: Number(row.unreadCount),
      },
    ]),
  );
}

export async function getNavigationData(userId: string) {
  const [folders, feeds, feedCounts, folderCounts, unreadTotal, savedCount] =
    await Promise.all([
      prisma.folder.findMany({
        where: { userId },
        select: navigationFolderSelect,
        orderBy: { position: "asc" },
      }),
      prisma.feed.findMany({
        where: { userId },
        select: navigationFeedSelect,
        orderBy: [{ isPinned: "desc" }, { position: "asc" }, { createdAt: "asc" }],
      }),
      getFeedCounts(userId),
      getFolderCounts(userId),
      prisma.item.count({
        where: {
          feed: { userId, excludeFromTimeline: false },
          readStates: { none: { userId } },
        },
      }),
      prisma.bookmark.count({ where: { userId } }),
    ]);

  const folderFeedStats = new Map<
    string,
    { feedCount: number; issueCount: number }
  >();

  for (const feed of feeds) {
    if (!feed.folderId) {
      continue;
    }

    const current = folderFeedStats.get(feed.folderId) ?? { feedCount: 0, issueCount: 0 };
    current.feedCount += 1;
    if (feed.healthStatus !== "HEALTHY") {
      current.issueCount += 1;
    }
    folderFeedStats.set(feed.folderId, current);
  }

  return {
    folders: folders.map((folder) => ({
      ...folder,
      counts: {
        articleCount: folderCounts.get(folder.id)?.totalCount ?? 0,
        unreadCount: folderCounts.get(folder.id)?.unreadCount ?? 0,
        feedCount: folderFeedStats.get(folder.id)?.feedCount ?? 0,
        issueCount: folderFeedStats.get(folder.id)?.issueCount ?? 0,
      },
    })),
    feeds: feeds.map((feed) => ({
      ...feed,
      counts: feedCounts.get(feed.id) ?? { unreadCount: 0, totalCount: 0 },
    })),
    stats: {
      unreadTotal,
      savedCount,
    },
  };
}

export async function getTimelineItems(
  userId: string,
  options?: {
    feedId?: string;
    folderId?: string;
    saved?: boolean;
    sourceFilter?: TimelineSourceFilter;
    stateFilter?: TimelineStateFilter;
  },
): Promise<TimelineItemRecord[]> {
  const sourceTypeFilter =
    options?.sourceFilter === "YOUTUBE"
      ? {
          in: [
            FeedSourceType.YOUTUBE_RSS,
            FeedSourceType.YOUTUBE_CHANNEL_RSS,
            FeedSourceType.YOUTUBE_PLAYLIST_RSS,
          ],
        }
      : options?.sourceFilter === "REDDIT"
        ? FeedSourceType.REDDIT_RSS
        : options?.sourceFilter === "RSS"
          ? { in: [FeedSourceType.RSS, FeedSourceType.ATOM, FeedSourceType.UNKNOWN] }
          : undefined;

  const stateWhere =
    options?.saved
      ? { bookmarks: { some: { userId } } }
      : options?.stateFilter === "READ"
        ? { readStates: { some: { userId } } }
        : options?.stateFilter === "ALL"
          ? {}
          : { readStates: { none: { userId } } };

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
    },
    orderBy: [{ publishedAt: "desc" }, { discoveredAt: "desc" }],
    take: 100,
    select: {
      ...timelineItemSelect,
      bookmarks: { where: { userId }, select: { id: true } },
      readStates: { where: { userId }, select: { id: true } },
    },
  } satisfies Prisma.ItemFindManyArgs;

  return prisma.item.findMany(query) as Promise<TimelineItemRecord[]>;
}

export async function getFeedSearch(
  userId: string,
  query: string,
  sourceFilter: FeedSourceFilter = "ALL",
) {
  if (!query.trim()) {
    return [];
  }

  const sourceTypeFilter =
    sourceFilter === "YOUTUBE"
      ? {
          in: [
            FeedSourceType.YOUTUBE_RSS,
            FeedSourceType.YOUTUBE_CHANNEL_RSS,
            FeedSourceType.YOUTUBE_PLAYLIST_RSS,
          ],
        }
      : sourceFilter === "REDDIT"
        ? FeedSourceType.REDDIT_RSS
        : sourceFilter === "RSS"
          ? { in: [FeedSourceType.RSS, FeedSourceType.ATOM, FeedSourceType.UNKNOWN] }
          : undefined;

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
      ...timelineItemSelect,
      author: true,
      discoveredAt: true,
      fetchedAt: true,
      feed: {
        select: {
          id: true,
          title: true,
          label: true,
          sourceType: true,
        },
      },
      bookmarks: { where: { userId }, select: { id: true } },
      readStates: { where: { userId }, select: { id: true } },
    },
  });
}
