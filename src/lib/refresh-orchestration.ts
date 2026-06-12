import { randomUUID } from "node:crypto";

import { JobStatus, JobTrigger, Prisma, RefreshBatchStatus } from "@prisma/client";

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
  createRefreshBatch?: typeof prisma.refreshBatch.create;
  updateRefreshBatch?: typeof prisma.refreshBatch.update;
  createRefreshJob?: typeof prisma.refreshJob.create;
  deleteRefreshJob?: typeof prisma.refreshJob.delete;
  enqueueRefresh?: typeof enqueueFeedRefresh;
  batchMap?: typeof mapInBatches;
};

type SingleRefreshDeps = Pick<
  Required<RefreshOrchestrationDeps>,
  "createRefreshJob" | "deleteRefreshJob" | "enqueueRefresh"
>;

type RefreshBatchProgressClient = Pick<typeof prisma, "$executeRaw">;

export function getRefreshBatchId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const batchId = (metadata as { batchId?: unknown }).batchId;
  return typeof batchId === "string" && batchId.length > 0 ? batchId : null;
}

export async function recordRefreshBatchResult(
  client: RefreshBatchProgressClient,
  batchId: string | null,
  result: "SUCCEEDED" | "FAILED",
) {
  if (!batchId) {
    return;
  }

  await client.$executeRaw(Prisma.sql`
    UPDATE "RefreshBatch"
    SET
      "succeeded" = "succeeded" + ${result === "SUCCEEDED" ? 1 : 0},
      "failed" = "failed" + ${result === "FAILED" ? 1 : 0},
      "startedAt" = COALESCE("startedAt", NOW()),
      "finishedAt" = CASE
        WHEN "succeeded" + "failed" + 1 >= "queued" THEN NOW()
        ELSE "finishedAt"
      END,
      "status" = CASE
        WHEN ${result === "FAILED"} AND "succeeded" + "failed" + 1 >= "queued" AND "succeeded" = 0 THEN 'FAILED'::"RefreshBatchStatus"
        WHEN "succeeded" + "failed" + 1 >= "queued" AND ("failed" + ${result === "FAILED" ? 1 : 0}) > 0 THEN 'PARTIAL'::"RefreshBatchStatus"
        WHEN "succeeded" + "failed" + 1 >= "queued" THEN 'SUCCEEDED'::"RefreshBatchStatus"
        ELSE 'RUNNING'::"RefreshBatchStatus"
      END,
      "updatedAt" = NOW()
    WHERE "id" = ${batchId}
      AND "queued" > 0
      AND "succeeded" + "failed" < "queued"
  `);
}

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
    createRefreshBatch: deps.createRefreshBatch ?? prisma.refreshBatch.create.bind(prisma.refreshBatch),
    updateRefreshBatch: deps.updateRefreshBatch ?? prisma.refreshBatch.update.bind(prisma.refreshBatch),
    createRefreshJob: deps.createRefreshJob ?? prisma.refreshJob.create.bind(prisma.refreshJob),
    deleteRefreshJob: deps.deleteRefreshJob ?? prisma.refreshJob.delete.bind(prisma.refreshJob),
    enqueueRefresh: deps.enqueueRefresh ?? enqueueFeedRefresh,
    batchMap: deps.batchMap ?? mapInBatches,
  };

  await resolvedDeps.createRefreshBatch({
    data: {
      id: batchId,
      userId,
      status: RefreshBatchStatus.QUEUED,
      totalFeeds: feedIds.length,
      queued: 0,
      skipped: 0,
    },
  });

  const results = await resolvedDeps.batchMap(
    feedIds,
    REFRESH_ENQUEUE_BATCH_SIZE,
    async (feed) =>
      queueRefreshForFeed(userId, feed.id, batchStartedAt, batchId, trigger, resolvedDeps),
  );

  const queued = results.filter(Boolean).length;
  const skipped = feedIds.length - queued;
  await resolvedDeps.updateRefreshBatch({
    where: { id: batchId },
    data: {
      queued,
      skipped,
      status: queued > 0 ? RefreshBatchStatus.QUEUED : RefreshBatchStatus.SUCCEEDED,
      ...(queued === 0 ? { finishedAt: new Date() } : {}),
    },
  });

  return {
    ok: true,
    queued,
    skipped,
    totalFeeds: feedIds.length,
    batchStartedAt: batchStartedAt.toISOString(),
    batchId,
  };
}
