import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

type NavigationStatsClient = Pick<
	typeof prisma,
	"navigationStats" | "$queryRaw"
>;

export async function getNavigationStats(
	client: NavigationStatsClient,
	userId: string,
	hideYouTubeShorts: boolean,
) {
	const existing = await client.navigationStats.findUnique({
		where: { userId },
		select: {
			unreadCount: true,
			savedCount: true,
		},
	});

	if (existing) {
		return existing;
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

	return client.navigationStats.upsert({
		where: { userId },
		update: {
			unreadCount: Number(row?.unreadCount ?? 0),
			savedCount: Number(row?.savedCount ?? 0),
		},
		create: {
			userId,
			unreadCount: Number(row?.unreadCount ?? 0),
			savedCount: Number(row?.savedCount ?? 0),
		},
	});
}

export async function adjustNavigationStats(
	client: NavigationStatsClient,
	userId: string,
	delta: { unreadDelta?: number; savedDelta?: number },
) {
	const unreadDelta = delta.unreadDelta ?? 0;
	const savedDelta = delta.savedDelta ?? 0;

	if (unreadDelta === 0 && savedDelta === 0) {
		return;
	}

	await client.navigationStats.upsert({
		where: { userId },
		update: {
			...(unreadDelta !== 0 ? { unreadCount: { increment: unreadDelta } } : {}),
			...(savedDelta !== 0 ? { savedCount: { increment: savedDelta } } : {}),
		},
		create: {
			userId,
			unreadCount: Math.max(0, unreadDelta),
			savedCount: Math.max(0, savedDelta),
		},
	});
}
