type SchedulableFeed = {
  id: string;
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
  const intervalMs = intervalMinutes * 60 * 1000;
  let capped = false;

  for (const feed of feeds) {
    const lastSuccessAt = feed.lastRefreshedAt
      ? new Date(feed.lastRefreshedAt).getTime()
      : 0;
    const lastFailureAt = feed.lastFailureAt
      ? new Date(feed.lastFailureAt).getTime()
      : 0;
    const lastAttemptAt = Math.max(lastSuccessAt, lastFailureAt);
    const dueAt = lastAttemptAt + intervalMs;

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

export function selectDueFeedIds(options: Parameters<typeof selectDueFeeds>[0]) {
  return selectDueFeeds(options).dueFeedIds;
}
