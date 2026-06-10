import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

type NavigationStatsClient = Pick<
	typeof prisma,
	"$queryRaw"
>;

type NavigationStatsStoreClient = NavigationStatsClient & {
	navigationStats?: Pick<
		typeof prisma.navigationStats,
		"findUnique" | "upsert"
	>;
};

export async function getNavigationStats(
	client: NavigationStatsStoreClient,
	userId: string,
	hideYouTubeShorts: boolean,
) {
	if (client.navigationStats) {
		const existing = await client.navigationStats.findUnique({
			where: { userId },
			select: {
				unreadCount: true,
				savedCount: true,
			},
		});

		if (existing) {
			const unreadCount = Math.max(0, existing.unreadCount);
			const savedCount = Math.max(0, existing.savedCount);
			if (unreadCount !== existing.unreadCount || savedCount !== existing.savedCount) {
				await client.navigationStats.upsert({
					where: { userId },
					update: { unreadCount, savedCount },
					create: { userId, unreadCount, savedCount },
				});
			}

			return { unreadCount, savedCount };
		}
	}

	const [row] = await client.$queryRaw<
		Array<{ unreadCount: bigint; savedCount: bigint }>
	>(Prisma.sql`
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
			) AS "unreadCount",
			(
				SELECT COUNT(*)::bigint
				FROM "Bookmark" b
				WHERE b."userId" = ${userId}
			) AS "savedCount"
	`);

	if (!client.navigationStats) {
		return {
			unreadCount: Number(row?.unreadCount ?? 0),
			savedCount: Number(row?.savedCount ?? 0),
		};
	}

	return client.navigationStats.upsert({
		where: { userId },
		update: {
			unreadCount: Math.max(0, Number(row?.unreadCount ?? 0)),
			savedCount: Math.max(0, Number(row?.savedCount ?? 0)),
		},
		create: {
			userId,
			unreadCount: Math.max(0, Number(row?.unreadCount ?? 0)),
			savedCount: Math.max(0, Number(row?.savedCount ?? 0)),
		},
	});
}

export async function adjustNavigationStats(
	client: NavigationStatsStoreClient,
	userId: string,
	delta: { unreadDelta?: number; savedDelta?: number },
) {
	if (!client.navigationStats) {
		return;
	}

	const unreadDelta = delta.unreadDelta ?? 0;
	const savedDelta = delta.savedDelta ?? 0;

	if (unreadDelta === 0 && savedDelta === 0) {
		return;
	}

	await client.$queryRaw(Prisma.sql`
		INSERT INTO "NavigationStats" ("userId", "unreadCount", "savedCount", "updatedAt")
		VALUES (
			${userId},
			GREATEST(${unreadDelta}, 0),
			GREATEST(${savedDelta}, 0),
			NOW()
		)
		ON CONFLICT ("userId") DO UPDATE
		SET
			"unreadCount" = GREATEST("NavigationStats"."unreadCount" + ${unreadDelta}, 0),
			"savedCount" = GREATEST("NavigationStats"."savedCount" + ${savedDelta}, 0),
			"updatedAt" = NOW()
	`);
}
