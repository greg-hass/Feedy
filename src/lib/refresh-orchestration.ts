import { randomUUID } from "node:crypto";

import { JobStatus, JobTrigger } from "@prisma/client";

import { prisma } from "@/lib/db";
import { enqueueFeedRefresh } from "@/lib/queue";
import { mapInBatches, REFRESH_ENQUEUE_BATCH_SIZE } from "@/lib/workload-limits";

type RefreshFeedRef = {
  id: string;
};

export type RefreshBatchResult = {
  ok: true;
  queued: number;
  skipped: number;
  totalFeeds: number;
  batchStartedAt: string;
  batchId: string;
};

type QueueRefreshInput = {
  userId: string;
  feedIds: RefreshFeedRef[];
  batchStartedAt?: Date;
  batchId?: string;
  trigger?: JobTrigger;
};

type RefreshOrchestrationDeps = {
  createRefreshJob?: typeof prisma.refreshJob.create;
  deleteRefreshJob?: typeof prisma.refreshJob.delete;
  enqueueRefresh?: typeof enqueueFeedRefresh;
  batchMap?: typeof mapInBatches;
};

type SingleRefreshDeps = Pick<
  Required<RefreshOrchestrationDeps>,
  "createRefreshJob" | "deleteRefreshJob" | "enqueueRefresh"
>;

async function queueRefreshForFeed(
  userId: string,
  feedId: string,
  batchStartedAt: Date,
  batchId: string,
  trigger: JobTrigger,
  deps: Required<RefreshOrchestrationDeps>,
) {
  const refreshJob = await deps.createRefreshJob({
    data: {
      userId,
      feedId,
      trigger,
      status: JobStatus.QUEUED,
      requestedAt: batchStartedAt,
      metadata: { batchId },
    },
  });

  const queued = await deps.enqueueRefresh({
    feedId,
    trigger: trigger === JobTrigger.AUTO ? "auto" : "manual",
    refreshJobId: refreshJob.id,
  });

  if (!queued.enqueued) {
    await deps.deleteRefreshJob({ where: { id: refreshJob.id } }).catch(() => null);
  }

  return queued.enqueued;
}

export async function queueSingleFeedRefresh(
  userId: string,
  feedId: string,
  trigger: JobTrigger = JobTrigger.MANUAL,
  deps: Partial<SingleRefreshDeps> = {},
) {
  const resolvedDeps: SingleRefreshDeps = {
    createRefreshJob: deps.createRefreshJob ?? prisma.refreshJob.create.bind(prisma.refreshJob),
    deleteRefreshJob: deps.deleteRefreshJob ?? prisma.refreshJob.delete.bind(prisma.refreshJob),
    enqueueRefresh: deps.enqueueRefresh ?? enqueueFeedRefresh,
  };

  const refreshJob = await resolvedDeps.createRefreshJob({
    data: {
      userId,
      feedId,
      trigger,
      status: JobStatus.QUEUED,
    },
  });

  const queued = await resolvedDeps.enqueueRefresh({
    feedId,
    trigger: trigger === JobTrigger.AUTO ? "auto" : "manual",
    refreshJobId: refreshJob.id,
  });

  if (!queued.enqueued) {
    await resolvedDeps.deleteRefreshJob({ where: { id: refreshJob.id } }).catch(() => null);
  }

  return queued.enqueued;
}

export async function queueRefreshBatch({
  userId,
  feedIds,
  batchStartedAt = new Date(),
  batchId = randomUUID(),
  trigger = JobTrigger.MANUAL,
}: QueueRefreshInput, deps: RefreshOrchestrationDeps = {}): Promise<RefreshBatchResult> {
  const resolvedDeps: Required<RefreshOrchestrationDeps> = {
    createRefreshJob: deps.createRefreshJob ?? prisma.refreshJob.create.bind(prisma.refreshJob),
    deleteRefreshJob: deps.deleteRefreshJob ?? prisma.refreshJob.delete.bind(prisma.refreshJob),
    enqueueRefresh: deps.enqueueRefresh ?? enqueueFeedRefresh,
    batchMap: deps.batchMap ?? mapInBatches,
  };

  const results = await resolvedDeps.batchMap(
    feedIds,
    REFRESH_ENQUEUE_BATCH_SIZE,
    async (feed) =>
      queueRefreshForFeed(userId, feed.id, batchStartedAt, batchId, trigger, resolvedDeps),
  );

  const queued = results.filter(Boolean).length;
  return {
    ok: true,
    queued,
    skipped: feedIds.length - queued,
    totalFeeds: feedIds.length,
    batchStartedAt: batchStartedAt.toISOString(),
    batchId,
  };
}
