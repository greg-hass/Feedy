import { Worker } from "bullmq";

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
      (feed.lastRefreshedAt ? new Date(feed.lastRefreshedAt).getTime() : 0) +
      interval * 60 * 1000;

    if (dueAt > now) {
      continue;
    }

    const queued = await enqueueFeedRefresh({ feedId: feed.id, trigger: "auto" });
    if (!queued.enqueued) {
      continue;
    }

    await prisma.refreshJob.create({
      data: {
        userId: user.id,
        feedId: feed.id,
        trigger: JobTrigger.AUTO,
        status: JobStatus.QUEUED,
      },
    });
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
      await refreshFeed(
        job.data.feedId,
        job.data.trigger === "auto" ? JobTrigger.AUTO : JobTrigger.MANUAL,
      );
    },
    {
      connection: getRedis(),
      concurrency: 4,
    },
  );

  const iconWorker = new Worker(
    iconQueueName,
    async (job) => {
      await fetchAndCacheIcon(job.data.feedId);
    },
    {
      connection: getRedis(),
      concurrency: 2,
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

boot().catch((error) => {
  console.error(error);
  process.exit(1);
});
