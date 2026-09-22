import { FeedSourceType } from "@prisma/client";

type SchedulableFeed = {
	id: string;
	sourceType?: FeedSourceType;
	lastRefreshedAt: Date | string | null;
	lastFailureAt: Date | string | null;
};

export function selectDueFeeds({
	feeds,
	now,
	intervalMinutes,
	backlog,
	maxQueueSize = 100,
}: {
	feeds: SchedulableFeed[];
	now: number;
	intervalMinutes: number;
	backlog: number;
	maxQueueSize?: number;
}) {
	const dueFeedIds: string[] = [];
	let capped = false;

	for (const feed of feeds) {
		const feedIntervalMinutes = feed.sourceType === FeedSourceType.REDDIT_RSS
			? Math.max(intervalMinutes, 60)
			: intervalMinutes;
		const lastSuccessAt = feed.lastRefreshedAt
			? new Date(feed.lastRefreshedAt).getTime()
			: 0;
		const lastFailureAt = feed.lastFailureAt
			? new Date(feed.lastFailureAt).getTime()
			: 0;
		const lastAttemptAt = Math.max(lastSuccessAt, lastFailureAt);
		const dueAt = lastAttemptAt + feedIntervalMinutes * 60 * 1000;

		if (dueAt > now) {
			continue;
		}

		if (backlog + dueFeedIds.length >= maxQueueSize) {
			capped = true;
			break;
		}

		dueFeedIds.push(feed.id);
	}

	return { dueFeedIds, capped };
}
