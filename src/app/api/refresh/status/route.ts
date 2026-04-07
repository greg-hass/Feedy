import { NextResponse } from "next/server";
import { z } from "zod";
import { Queue } from "bullmq";

import { apiError, assertApiUser, parseQuery } from "@/lib/api";
import { prisma } from "@/lib/db";
import { refreshQueueName } from "@/lib/queue";
import { getRedis } from "@/lib/redis";

const refreshStatusQuerySchema = z.object({
  batchId: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const user = await assertApiUser();
    const query = await parseQuery(
      new URL(request.url).searchParams,
      refreshStatusQuerySchema,
    );
    const queue = new Queue(refreshQueueName, { connection: getRedis() });
    const staleThreshold = Date.now() - 60_000;
    const inFlightStates = new Set(["waiting", "active", "delayed", "prioritized", "waiting-children"]);

    const initialJobs = await prisma.refreshJob.findMany({
      where: {
        userId: user.id,
        metadata: {
          path: ["batchId"],
          equals: query.batchId,
        },
      },
      select: {
        id: true,
        feedId: true,
        status: true,
        requestedAt: true,
      },
    });

    const staleJobs = initialJobs.filter(
      (job) =>
        (job.status === "QUEUED" || job.status === "RUNNING") &&
        new Date(job.requestedAt).getTime() < staleThreshold,
    );

    for (const job of staleJobs) {
      const queueJob = await queue.getJob(`refresh-${job.feedId}`);
      const queueState = queueJob ? await queueJob.getState() : null;
      if (!queueState || !inFlightStates.has(queueState)) {
        await prisma.refreshJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorMessage: "Refresh job lost sync with the worker queue",
          },
        }).catch(() => null);
      }
    }

    await queue.close();

    const jobs = await prisma.refreshJob.findMany({
      where: {
        userId: user.id,
        metadata: {
          path: ["batchId"],
          equals: query.batchId,
        },
      },
      select: {
        status: true,
      },
    });

    const total = jobs.length;
    const queued = jobs.filter((job) => job.status === "QUEUED").length;
    const running = jobs.filter((job) => job.status === "RUNNING").length;
    const succeeded = jobs.filter((job) => job.status === "SUCCEEDED").length;
    const failed = jobs.filter((job) => job.status === "FAILED").length;

    return NextResponse.json({
      ok: true,
      total,
      queued,
      running,
      succeeded,
      failed,
      completed: succeeded + failed,
      active: queued + running,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not fetch refresh status");
  }
}
