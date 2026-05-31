import { prisma } from "@/lib/db";

type WorkerMaintenanceClient = typeof prisma;

export async function recoverStaleRefreshJobs(client: WorkerMaintenanceClient = prisma) {
  const result = await client.refreshJob.updateMany({
    where: {
      status: "RUNNING",
    },
    data: {
      status: "QUEUED",
      startedAt: null,
      completedAt: null,
      errorMessage: null,
    },
  });

  return result.count;
}
