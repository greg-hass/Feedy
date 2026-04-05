import { NextResponse } from "next/server";

import { apiError, assertApiUser } from "@/lib/api";
import { JobStatus, JobTrigger } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueFeedRefresh } from "@/lib/queue";

export async function POST() {
  try {
    const user = await assertApiUser();
    const feeds = await prisma.feed.findMany({
      where: { userId: user.id },
      select: { id: true },
    });

    const results = await Promise.all(
      feeds.map(async (feed) => {
        const queued = await enqueueFeedRefresh({ feedId: feed.id, trigger: "manual" });
        if (queued.enqueued) {
          await prisma.refreshJob.create({
            data: {
              userId: user.id,
              feedId: feed.id,
              trigger: JobTrigger.MANUAL,
              status: JobStatus.QUEUED,
            },
          });
        }
        return queued.enqueued;
      }),
    );

    return NextResponse.json({ ok: true, queued: results.filter(Boolean).length });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not queue refreshes");
  }
}
