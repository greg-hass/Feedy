import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { apiError, assertApiUser } from "@/lib/api";
import { JobStatus, JobTrigger } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueFeedRefresh } from "@/lib/queue";
import { createFixedWindowRateLimiter } from "@/lib/rate-limit";

const rateLimiter = createFixedWindowRateLimiter();

type Params = Promise<{ feedId: string }>;

export async function POST(_request: Request, context: { params: Params }) {
  try {
    const user = await assertApiUser();
    const refreshAttempt = await rateLimiter.check(`refresh:feed:${user.id}`, {
      limit: 5,
      windowSeconds: 5 * 60,
    });
    if (!refreshAttempt.allowed) {
      const response = apiError("Feed refreshes are happening too quickly", 429);
      response.headers.set("Retry-After", String(refreshAttempt.retryAfterSeconds));
      return response;
    }
    const batchStartedAt = new Date();
    const batchId = randomUUID();
    const { feedId } = await context.params;
    const refreshJob = await prisma.refreshJob.create({
      data: {
        userId: user.id,
        feedId,
        trigger: JobTrigger.MANUAL,
        status: JobStatus.QUEUED,
        requestedAt: batchStartedAt,
        metadata: { batchId },
      },
    });
    const queued = await enqueueFeedRefresh({
      feedId,
      trigger: "manual",
      refreshJobId: refreshJob.id,
    });
    if (!queued.enqueued) {
      await prisma.refreshJob.delete({ where: { id: refreshJob.id } }).catch(() => null);
    }
    return NextResponse.json({
      ok: true,
      queued: queued.enqueued ? 1 : 0,
      skipped: queued.enqueued ? 0 : 1,
      totalFeeds: 1,
      batchStartedAt: batchStartedAt.toISOString(),
      batchId,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not queue refresh");
  }
}
