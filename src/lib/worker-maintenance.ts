import { prisma } from "@/lib/db";
import { enqueueFeedRefresh } from "@/lib/queue";
import { getRefreshBatchId, recordRefreshBatchResult } from "@/lib/refresh-orchestration";
import { jobTriggerToQueueTrigger } from "@/lib/refresh-trigger";

type WorkerMaintenanceClient = typeof prisma;
type EnqueueRefresh = typeof enqueueFeedRefresh;

export async function recoverStaleRefreshJobs(
  client: WorkerMaintenanceClient = prisma,
  enqueueRefresh: EnqueueRefresh = enqueueFeedRefresh,
) {
  const jobs = await client.refreshJob.findMany({
    where: {
      status: "RUNNING",
    },
    select: {
      id: true,
      feedId: true,
      trigger: true,
      metadata: true,
    },
  });

  if (jobs.length === 0) {
    return 0;
  }

  const recoverableJobs = jobs.filter(
    (job): job is typeof job & { feedId: string } => typeof job.feedId === "string",
  );
  const orphanedJobs = jobs.filter((job) => typeof job.feedId !== "string");

  let failedOrphanedCount = 0;
  if (orphanedJobs.length > 0) {
    const failedOrphaned = await client.refreshJob.updateMany({
      where: {
        id: { in: orphanedJobs.map((job) => job.id) },
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: "Cannot recover refresh job because its feed no longer exists.",
      },
    });
    failedOrphanedCount = failedOrphaned.count;

    for (const job of orphanedJobs) {
      await recordRefreshBatchResult(
        client,
        getRefreshBatchId(job.metadata),
        "FAILED",
      );
    }
  }

  if (recoverableJobs.length === 0) {
    return failedOrphanedCount;
  }

  for (const job of recoverableJobs) {
    await enqueueRefresh({
      feedId: job.feedId,
      trigger: jobTriggerToQueueTrigger(job.trigger),
      refreshJobId: job.id,
    });
  }

  const result = await client.refreshJob.updateMany({
    where: {
      id: { in: recoverableJobs.map((job) => job.id) },
    },
    data: {
      status: "QUEUED",
      startedAt: null,
      completedAt: null,
      errorMessage: null,
    },
  });

  return result.count + failedOrphanedCount;
}
