import { UnrecoverableError, Worker } from "bullmq";

import { JobStatus, JobTrigger } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchAndCacheIcon } from "@/lib/feed/icons";
import { refreshFeed } from "@/lib/feed/service";
import { ensureSingleUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { enqueueFeedRefresh, iconQueueName, refreshQueueName } from "@/lib/queue";
import { getRedis } from "@/lib/redis";
import { pruneUserData } from "@/lib/retention";
import { ensureDataDirs } from "@/lib/storage";

async function scheduleDueFeeds() {
  const user = await ensureSingleUser();
  const feeds = await prisma.feed.findMany({
    where: { userId: user.id },
    include: { user: { include: { settings: true } } },
  });

  const now = Date.now();
  for (const feed of feeds) {
    const interval =
      feed.refreshIntervalMinutes ??
      feed.user.settings?.refreshIntervalMinutes ??
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

    const refreshJob = await prisma.refreshJob.create({
      data: {
        userId: user.id,
        feedId: feed.id,
        trigger: JobTrigger.AUTO,
        status: JobStatus.QUEUED,
      },
    });
    const queued = await enqueueFeedRefresh({
      feedId: feed.id,
      trigger: "auto",
      refreshJobId: refreshJob.id,
    });
    if (!queued.enqueued) {
      await prisma.refreshJob.delete({ where: { id: refreshJob.id } }).catch(() => null);
    }
  }
}

async function runRetentionCleanup() {
  const user = await ensureSingleUser();
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

async function boot() {
  ensureDataDirs();
  await ensureSingleUser();

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

  await scheduleDueFeeds();
  await runRetentionCleanup();
  setInterval(() => {
    void scheduleDueFeeds();
  }, 60_000);
  setInterval(() => {
    void runRetentionCleanup();
  }, 6 * 60 * 60 * 1000);

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
