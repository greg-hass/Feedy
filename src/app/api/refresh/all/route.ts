import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { apiError, assertApiUser } from "@/lib/api";
import { JobStatus, JobTrigger } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueFeedRefresh } from "@/lib/queue";

export async function POST() {
  try {
    const user = await assertApiUser();
    const batchStartedAt = new Date();
    const batchId = randomUUID();
    const feeds = await prisma.feed.findMany({
      where: { userId: user.id },
      select: { id: true },
    });

    const results = await Promise.all(
      feeds.map(async (feed) => {
        const refreshJob = await prisma.refreshJob.create({
          data: {
            userId: user.id,
            feedId: feed.id,
            trigger: JobTrigger.MANUAL,
            status: JobStatus.QUEUED,
            requestedAt: batchStartedAt,
            metadata: { batchId },
          },
        });
        const queued = await enqueueFeedRefresh({
          feedId: feed.id,
          trigger: "manual",
          refreshJobId: refreshJob.id,
        });
        if (!queued.enqueued) {
          await prisma.refreshJob.delete({ where: { id: refreshJob.id } }).catch(() => null);
        }
        return queued.enqueued;
      }),
    );

    return NextResponse.json({
      ok: true,
      queued: results.filter(Boolean).length,
      skipped: feeds.length - results.filter(Boolean).length,
      totalFeeds: feeds.length,
      batchStartedAt: batchStartedAt.toISOString(),
      batchId,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not queue refreshes");
  }
}
