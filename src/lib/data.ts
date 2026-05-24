import { FeedSourceType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { normalizeFeedMuteRules } from "@/lib/feed/mute-rules";
import { buildTimelinePage } from "@/lib/timeline-pagination";

export type TimelineSourceFilter = "RSS" | "REDDIT" | "YOUTUBE";
export type TimelineStateFilter = "UNREAD" | "READ" | "ALL";
export type FeedSourceFilter = "ALL" | TimelineSourceFilter;

type FeedFolderCountRow = {
  feedId: string | null;
  folderId: string | null;
  totalCount: bigint;
  unreadCount: bigint;
};

type LibraryCountRow = {
  unreadTotal: bigint;
  savedCount: bigint;
};

type FeedPerformanceRow = {
  feedId: string;
  latestDurationMs: number | null;
  averageDurationMs: number | null;
  slowCount24h: bigint;
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
  muteRules: true,
  position: true,
  refreshIntervalMinutes: true,
  lastRefreshedAt: true,
  lastSuccessfulRefreshAt: true,
  lastFailureAt: true,
  lastError: true,
  healthStatus: true,
  folderId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FeedSelect;

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

type ReaderItemRecord = Prisma.ItemGetPayload<{
  select: typeof readerItemSelect;
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

async function runSearchWithIndexedPlanner<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    // This search query intentionally leans on trigram indexes for wide text fields.
    // Postgres sometimes prefers a sequential scan for common terms, so we bias the
    // planner away from that path only for this transaction.
    await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
    return fn(tx);
  });
}

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

export async function getFeedAndFolderCounts(userId: string) {
  const hideYouTubeShorts = (
    await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: { select: { hideYouTubeShorts: true } } },
    })
  )?.settings?.hideYouTubeShorts ?? false;

  const rows = await prisma.$queryRaw<FeedFolderCountRow[]>(Prisma.sql`
    SELECT
      CASE WHEN GROUPING(f."id") = 0 THEN f."id" ELSE NULL END AS "feedId",
      CASE WHEN GROUPING(f."id") = 1 THEN f."folderId" ELSE NULL END AS "folderId",
      COUNT(*)::bigint AS "totalCount",
      COUNT(*) FILTER (WHERE rs.id IS NULL)::bigint AS "unreadCount"
    FROM "Feed" f
    LEFT JOIN "Item" i
      ON i."feedId" = f.id
      AND (
        NOT ${hideYouTubeShorts}
        OR COALESCE(i."youtubeIsShort", false) = false
      )
    LEFT JOIN "ReadState" rs
      ON rs."itemId" = i.id
      AND rs."userId" = ${userId}
    WHERE f."userId" = ${userId}
    GROUP BY GROUPING SETS ((f."id", f."folderId"), (f."folderId"))
  `);

  const feedCounts = new Map<string, { totalCount: number; unreadCount: number }>();
  const folderCounts = new Map<string, { totalCount: number; unreadCount: number }>();

  for (const row of rows) {
    const counts = {
      totalCount: Number(row.totalCount),
      unreadCount: Number(row.unreadCount),
    };

    if (row.feedId) {
      feedCounts.set(row.feedId, counts);
    } else {
      folderCounts.set(row.folderId ?? "uncategorized", counts);
    }
  }

  return { feedCounts, folderCounts };
}

async function buildTimelineQuery(
  userId: string,
  options?: TimelineItemQueryOptions,
  pageSize = 100,
  includeExtraItem = false,
){
  const sourceTypeFilter = buildSourceTypeFilter(options?.sourceFilter);
  const hideYouTubeShorts = (
    await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: { select: { hideYouTubeShorts: true } } },
    })
  )?.settings?.hideYouTubeShorts ?? false;

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
      ...(hideYouTubeShorts ? { youtubeIsShort: false } : {}),
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
) : Promise<TimelineItemRecord[]> {
  const { query, searchQuery } = await buildTimelineQuery(userId, options, pageSize, includeExtraItem);

  if (searchQuery) {
    return runSearchWithIndexedPlanner((tx) => tx.item.findMany(query) as Promise<TimelineItemRecord[]>);
  }

  return prisma.item.findMany(query) as Promise<TimelineItemRecord[]>;
}
export async function getLibraryCounts(userId: string) {
  const hideYouTubeShorts = (
    await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: { select: { hideYouTubeShorts: true } } },
    })
  )?.settings?.hideYouTubeShorts ?? false;

  const [row] = await prisma.$queryRaw<LibraryCountRow[]>(Prisma.sql`
    SELECT
      (
        SELECT COUNT(*)::bigint
        FROM "Item" i
        INNER JOIN "Feed" f ON f.id = i."feedId"
        LEFT JOIN "ReadState" rs
          ON rs."itemId" = i.id
          AND rs."userId" = ${userId}
        WHERE f."userId" = ${userId}
          AND f."excludeFromTimeline" = false
          AND i."mutedByRule" = false
          AND (
            NOT ${hideYouTubeShorts}
            OR COALESCE(i."youtubeIsShort", false) = false
          )
          AND rs.id IS NULL
      ) AS "unreadTotal",
      (
        SELECT COUNT(*)::bigint
        FROM "Bookmark" b
        WHERE b."userId" = ${userId}
      ) AS "savedCount"
  `);

  return {
    unreadTotal: Number(row?.unreadTotal ?? 0),
    savedCount: Number(row?.savedCount ?? 0),
  };
}

export async function getFeedPerformanceStats(userId: string) {
  const rows = await prisma.$queryRaw<FeedPerformanceRow[]>(Prisma.sql`
    WITH recent_logs AS (
      SELECT
        rl."feedId",
        EXTRACT(EPOCH FROM (COALESCE(rl."finishedAt", rl."startedAt") - rl."startedAt")) * 1000 AS "durationMs",
        rl."startedAt",
        ROW_NUMBER() OVER (
          PARTITION BY rl."feedId"
          ORDER BY rl."startedAt" DESC
        ) AS "rowNumber"
      FROM "RefreshLog" rl
      INNER JOIN "Feed" f ON f.id = rl."feedId"
      WHERE f."userId" = ${userId}
        AND rl.status = 'SUCCEEDED'
        AND rl."finishedAt" IS NOT NULL
    )
    SELECT
      "feedId",
      MAX(CASE WHEN "rowNumber" = 1 THEN "durationMs" END)::int AS "latestDurationMs",
      ROUND(AVG(CASE WHEN "rowNumber" <= 10 THEN "durationMs" END))::int AS "averageDurationMs",
      COUNT(*) FILTER (
        WHERE "startedAt" >= NOW() - INTERVAL '24 hours'
          AND "durationMs" >= ${env.PERF_SLOW_FEED_MS}
      )::bigint AS "slowCount24h"
    FROM recent_logs
    GROUP BY "feedId"
  `);

  return new Map(
    rows.map((row) => [
      row.feedId,
      {
        latestDurationMs: row.latestDurationMs,
        averageDurationMs: row.averageDurationMs,
        slowCount24h: Number(row.slowCount24h),
        isSlow:
          (row.latestDurationMs ?? 0) >= env.PERF_SLOW_FEED_MS ||
          Number(row.slowCount24h) > 0,
      },
    ]),
  );
}

export async function getNavigationData(userId: string) {
  const [folders, feeds, counts, feedPerformanceStats, libraryCounts] =
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
      getFeedAndFolderCounts(userId),
      getFeedPerformanceStats(userId),
      getLibraryCounts(userId),
    ]);

  const folderFeedStats = new Map<
    string,
    { feedCount: number; issueCount: number; slowFeedCount: number }
  >();

  for (const feed of feeds) {
    if (!feed.folderId) {
      continue;
    }

    const current = folderFeedStats.get(feed.folderId) ?? { feedCount: 0, issueCount: 0, slowFeedCount: 0 };
    current.feedCount += 1;
    if (feed.healthStatus !== "HEALTHY") {
      current.issueCount += 1;
    }
    if (feedPerformanceStats.get(feed.id)?.isSlow) {
      current.slowFeedCount += 1;
    }
    folderFeedStats.set(feed.folderId, current);
  }

  return {
    folders: folders.map((folder) => ({
      ...folder,
      counts: {
        articleCount: counts.folderCounts.get(folder.id)?.totalCount ?? 0,
        unreadCount: counts.folderCounts.get(folder.id)?.unreadCount ?? 0,
        feedCount: folderFeedStats.get(folder.id)?.feedCount ?? 0,
        issueCount: folderFeedStats.get(folder.id)?.issueCount ?? 0,
        slowFeedCount: folderFeedStats.get(folder.id)?.slowFeedCount ?? 0,
      },
    })),
    feeds: feeds.map((feed) => ({
      ...feed,
      muteRules: normalizeFeedMuteRules(feed.muteRules),
      performance: feedPerformanceStats.get(feed.id) ?? {
        latestDurationMs: null,
        averageDurationMs: null,
        slowCount24h: 0,
        isSlow: false,
      },
      counts: counts.feedCounts.get(feed.id) ?? { unreadCount: 0, totalCount: 0 },
    })),
    stats: {
      unreadTotal: libraryCounts.unreadTotal,
      savedCount: libraryCounts.savedCount,
    },
  };
}

export async function getTimelineItems(
  userId: string,
  options?: TimelineItemQueryOptions,
): Promise<TimelineItemRecord[]> {
  return loadTimelineItemRecords(userId, options, 100, false);
}

export async function getTimelineItemPage(
  userId: string,
  options?: TimelineItemQueryOptions,
) {
  const pageSize = options?.pageSize ?? 100;
  const records = await loadTimelineItemRecords(userId, options, pageSize, true);
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
  }) as Promise<ReaderItemRecord | null>;
}
