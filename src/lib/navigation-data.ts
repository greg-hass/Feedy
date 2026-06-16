import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { normalizeFeedMuteRules } from "@/lib/feed/mute-rules";
import { readNavigationStats } from "@/lib/navigation-stats";

type FeedFolderCountRow = {
	feedId: string | null;
	folderId: string | null;
	totalCount: bigint;
	unreadCount: bigint;
};

type FeedPerformanceRow = {
	feedId: string;
	latestDurationMs: number | null;
	averageDurationMs: number | null;
	slowCount24h: bigint;
};

type NavigationClient = Pick<
	typeof prisma,
	"folder" | "feed" | "user" | "navigationStats" | "$queryRaw"
>;

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
	lastRefreshedAt: true,
	lastSuccessfulRefreshAt: true,
	lastFailureAt: true,
	lastError: true,
	healthStatus: true,
	folderId: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.FeedSelect;

type NavigationData = {
	folders: Array<
		Prisma.FolderGetPayload<{ select: typeof navigationFolderSelect }> & {
			counts: {
				articleCount: number;
				unreadCount: number;
				feedCount: number;
				issueCount: number;
				slowFeedCount: number;
			};
		}
	>;
	feeds: Array<
		Prisma.FeedGetPayload<{ select: typeof navigationFeedSelect }> & {
			muteRules: ReturnType<typeof normalizeFeedMuteRules>;
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
		}
	>;
	stats: {
		unreadTotal: number;
		savedCount: number;
	};
};

type NavigationCacheEntry = {
	expiresAt: number;
	promise: Promise<NavigationData>;
};

const NAVIGATION_CACHE_TTL_MS = 30_000;
const navigationCache = new Map<string, NavigationCacheEntry>();

export function invalidateNavigationCache(userId: string) {
	navigationCache.delete(userId);
}

export async function getFeedAndFolderCounts(
	userId: string,
	hideYouTubeShorts: boolean | undefined,
	client: NavigationClient = prisma,
) {
	const rows = await client.$queryRaw<FeedFolderCountRow[]>(Prisma.sql`
    SELECT
      CASE WHEN GROUPING(f."id") = 0 THEN f."id" ELSE NULL END AS "feedId",
      CASE WHEN GROUPING(f."id") = 1 THEN f."folderId" ELSE NULL END AS "folderId",
      COUNT(i."id")::bigint AS "totalCount",
      COUNT(i."id") FILTER (WHERE rs."id" IS NULL)::bigint AS "unreadCount"
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

	const feedCounts = new Map<
		string,
		{ totalCount: number; unreadCount: number }
	>();
	const folderCounts = new Map<
		string,
		{ totalCount: number; unreadCount: number }
	>();

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

export async function getLibraryCounts(
	userId: string,
	_hideYouTubeShorts?: boolean,
	client: NavigationClient = prisma,
) {
	const stats = await readNavigationStats(client, userId);

	return {
		unreadTotal: stats.unreadCount,
		savedCount: stats.savedCount,
	};
}

export async function getFeedPerformanceStats(
	userId: string,
	client: NavigationClient = prisma,
) {
	const rows = await client.$queryRaw<FeedPerformanceRow[]>(Prisma.sql`
    SELECT
      f.id AS "feedId",
      latest."durationMs"::int AS "latestDurationMs",
      avg10."averageDurationMs"::int AS "averageDurationMs",
      COALESCE(slow."slowCount24h", 0)::bigint AS "slowCount24h"
    FROM "Feed" f
    LEFT JOIN LATERAL (
      SELECT
        EXTRACT(EPOCH FROM (COALESCE(rl."finishedAt", rl."startedAt") - rl."startedAt")) * 1000 AS "durationMs"
      FROM "RefreshLog" rl
      WHERE rl."feedId" = f.id
        AND rl.status = 'SUCCEEDED'
        AND rl."finishedAt" IS NOT NULL
      ORDER BY rl."startedAt" DESC
      LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT ROUND(AVG(recent."durationMs")) AS "averageDurationMs"
      FROM (
        SELECT
          EXTRACT(EPOCH FROM (COALESCE(rl."finishedAt", rl."startedAt") - rl."startedAt")) * 1000 AS "durationMs"
        FROM "RefreshLog" rl
        WHERE rl."feedId" = f.id
          AND rl.status = 'SUCCEEDED'
          AND rl."finishedAt" IS NOT NULL
        ORDER BY rl."startedAt" DESC
        LIMIT 10
      ) recent
    ) avg10 ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "slowCount24h"
      FROM "RefreshLog" rl
      WHERE rl."feedId" = f.id
        AND rl.status = 'SUCCEEDED'
        AND rl."finishedAt" IS NOT NULL
        AND rl."startedAt" >= NOW() - INTERVAL '24 hours'
        AND EXTRACT(EPOCH FROM (COALESCE(rl."finishedAt", rl."startedAt") - rl."startedAt")) * 1000 >= ${env.PERF_SLOW_FEED_MS}
    ) slow ON true
    WHERE f."userId" = ${userId}
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

export async function getNavigationData(
	userId: string,
	client: NavigationClient = prisma,
) {
	const now = Date.now();
	const cached = navigationCache.get(userId);
	if (cached && cached.expiresAt > now) {
		return cached.promise;
	}

	const promise = loadNavigationData(client, userId).catch((error) => {
		navigationCache.delete(userId);
		throw error;
	});

	navigationCache.set(userId, {
		expiresAt: now + NAVIGATION_CACHE_TTL_MS,
		promise,
	});

	return promise;
}

export async function loadNavigationData(
	client: NavigationClient,
	userId: string,
) {
	const hideYouTubeShorts =
		(
			await client.user.findUnique({
				where: { id: userId },
				select: { settings: { select: { hideYouTubeShorts: true } } },
			})
		)?.settings?.hideYouTubeShorts ?? false;

	const [folders, feeds, counts, feedPerformanceStats, libraryCounts] =
		await Promise.all([
			client.folder.findMany({
				where: { userId },
				select: navigationFolderSelect,
				orderBy: { position: "asc" },
			}),
			client.feed.findMany({
				where: { userId },
				select: navigationFeedSelect,
				orderBy: [
					{ isPinned: "desc" },
					{ position: "asc" },
					{ createdAt: "asc" },
				],
			}),
			getFeedAndFolderCounts(userId, hideYouTubeShorts, client),
			getFeedPerformanceStats(userId, client),
			getLibraryCounts(userId, hideYouTubeShorts, client),
		]);

	const folderFeedStats = new Map<
		string,
		{ feedCount: number; issueCount: number; slowFeedCount: number }
	>();

	for (const feed of feeds) {
		if (!feed.folderId) {
			continue;
		}

		const current = folderFeedStats.get(feed.folderId) ?? {
			feedCount: 0,
			issueCount: 0,
			slowFeedCount: 0,
		};
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
			counts: counts.feedCounts.get(feed.id) ?? {
				unreadCount: 0,
				totalCount: 0,
			},
		})),
		stats: {
			unreadTotal: libraryCounts.unreadTotal,
			savedCount: libraryCounts.savedCount,
		},
	};
}
