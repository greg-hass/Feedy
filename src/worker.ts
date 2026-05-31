import { UnrecoverableError, Worker } from "bullmq";

import { JobTrigger } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchAndCacheIcon } from "@/lib/feed/icons";
import { refreshFeed } from "@/lib/feed/service";
import { probeYouTubeShort } from "@/lib/feed/youtube";
import { loadPrimaryUser, syncSingleUserFromEnv } from "@/lib/auth";
import { env } from "@/lib/env";
import { getRefreshQueue, iconQueueName, refreshQueueName } from "@/lib/queue";
import { getRedis } from "@/lib/redis";
import { pruneUserData } from "@/lib/retention";
import { ensureDataDirs } from "@/lib/storage";
import { runBackgroundTask } from "@/lib/background-task";
import { recoverStaleRefreshJobs } from "@/lib/worker-maintenance";
import { queueSingleFeedRefresh } from "@/lib/refresh-orchestration";

async function scheduleDueFeeds() {
  const user = await loadPrimaryUser();
  if (!user) {
    return;
  }
  if (user.settings?.autoRefreshEnabled === false) {
    return;
  }

  const queue = getRefreshQueue();
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const backlog = waiting + active;

  if (backlog > 50) {
    console.log(`[worker] Auto-refresh skipped: queue backlog is ${backlog}`);
    return;
  }

  const feeds = await prisma.feed.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      lastRefreshedAt: true,
      lastFailureAt: true,
      refreshIntervalMinutes: true,
    },
  });

  const now = Date.now();
  let queuedCount = 0;
  for (const feed of feeds) {
    const interval =
      feed.refreshIntervalMinutes ??
      user.settings?.refreshIntervalMinutes ??
      env.REFRESH_DEFAULT_INTERVAL_MINUTES;
    const dueAt =
      (feed.lastRefreshedAt
        ? new Date(feed.lastRefreshedAt).getTime()
        : feed.lastFailureAt
          ? new Date(feed.lastFailureAt).getTime()
          : 0) +
      interval * 60 * 1000;

    if (dueAt > now) {
      continue;
    }

    if (backlog + queuedCount >= 100) {
      console.log(`[worker] Auto-refresh capped at ${queuedCount} feeds to limit queue growth`);
      break;
    }

    const queued = await queueSingleFeedRefresh(user.id, feed.id, JobTrigger.AUTO);
    if (queued) {
      queuedCount++;
    }
  }

  if (queuedCount > 0) {
    console.log(`[worker] Auto-refresh queued ${queuedCount} feeds (backlog was ${backlog})`);
  }
}

async function recoverStaleRefreshJobsOnBoot() {
  const count = await recoverStaleRefreshJobs(prisma);

  if (count > 0) {
    console.log(`[worker] Requeued ${count} stale refresh jobs after startup`);
  }
}

async function runRetentionCleanup() {
  const user = await loadPrimaryUser();
  if (!user) {
    return;
  }
  const retentionDays = user.settings?.itemRetentionDays ?? 90;
  const result = await pruneUserData(user.id, retentionDays);

  if (
    result.deletedItems ||
    result.deletedRefreshJobs ||
    result.deletedRefreshLogs ||
    result.deletedImportRecords
  ) {
    console.log("Retention cleanup completed", result);
  }
}

async function backfillYouTubeShortFlags() {
  const batchSize = 25;
  const concurrency = 5;
  let processedCount = 0;

  while (true) {
    const pendingItems = await prisma.item.findMany({
      where: {
        youtubeVideoId: { not: null },
        youtubeShortCheckedAt: null,
      },
      select: {
        id: true,
        youtubeVideoId: true,
      },
      orderBy: {
        id: "asc",
      },
      take: batchSize,
    });

    if (pendingItems.length === 0) {
      break;
    }

    console.log(`[worker] Backfilling YouTube Shorts flags for ${pendingItems.length} items`);

    for (let index = 0; index < pendingItems.length; index += concurrency) {
      const batch = pendingItems.slice(index, index + concurrency);
      await Promise.all(
        batch.map(async (item) => {
          const youtubeVideoId = item.youtubeVideoId;
          if (!youtubeVideoId) {
            return;
          }

          const youtubeIsShort = await probeYouTubeShort(youtubeVideoId);
          await prisma.item.update({
            where: { id: item.id },
            data: {
              youtubeIsShort,
              youtubeShortCheckedAt: new Date(),
            },
          });
        }),
      );
    }

    processedCount += pendingItems.length;
  }

  if (processedCount > 0) {
    console.log(`[worker] Backfilled YouTube Shorts flags for ${processedCount} items`);
  }
}

async function boot() {
  ensureDataDirs();
  await syncSingleUserFromEnv();
  await recoverStaleRefreshJobsOnBoot();

  const refreshWorker = new Worker(
    refreshQueueName,
    async (job) => {
      try {
        await refreshFeed(
          job.data.feedId,
          job.data.trigger === "auto" ? JobTrigger.AUTO : JobTrigger.MANUAL,
          job.data.refreshJobId,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown refresh error";

        if (isPermanentRefreshError(message)) {
          throw new UnrecoverableError(message);
        }

        throw error;
      }
    },
    {
      connection: getRedis(),
      concurrency: env.REFRESH_WORKER_CONCURRENCY,
    },
  );

  const iconWorker = new Worker(
    iconQueueName,
    async (job) => {
      await fetchAndCacheIcon(job.data.feedId);
    },
    {
      connection: getRedis(),
      concurrency: env.ICON_WORKER_CONCURRENCY,
    },
  );

  refreshWorker.on("failed", (job, error) => {
    console.error("Refresh job failed", job?.id, error);
  });

  iconWorker.on("failed", (job, error) => {
    console.error("Icon job failed", job?.id, error);
  });

  void runBackgroundTask("initial feed scheduling", scheduleDueFeeds);
  void runBackgroundTask("initial retention cleanup", runRetentionCleanup);
  void runBackgroundTask("YouTube Shorts backfill", backfillYouTubeShortFlags);
  const feedScheduleTimer = setInterval(() => {
    void runBackgroundTask("scheduled feed scheduling", scheduleDueFeeds);
  }, 60_000);
  const retentionTimer = setInterval(() => {
    void runBackgroundTask("scheduled retention cleanup", runRetentionCleanup);
  }, 6 * 60 * 60 * 1000);

  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`[worker] Received ${signal}, shutting down`);
    feedScheduleTimer.unref();
    retentionTimer.unref();
    const forcedExit = setTimeout(() => {
      console.error("[worker] Shutdown timed out, forcing exit");
      process.exit(1);
    }, 10_000);

    try {
      await Promise.allSettled([refreshWorker.close(), iconWorker.close()]);
      process.exit(0);
    } finally {
      clearTimeout(forcedExit);
    }
  };

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  console.log("Feedy worker started");
}

function isPermanentRefreshError(message: string) {
  return (
    /Feed not recognized as RSS 1 or 2\./i.test(message) ||
    /Unexpected close tag/i.test(message) ||
    /Invalid character in entity name/i.test(message) ||
    /Feed returned (401|403|404|410|422)\b/i.test(message)
  );
}

boot().catch((error) => {
  console.error(error);
  process.exit(1);
});
