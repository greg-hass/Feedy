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

    await prisma.$transaction(
      feeds.map((feed) =>
        prisma.refreshJob.create({
          data: {
            userId: user.id,
            feedId: feed.id,
            trigger: JobTrigger.MANUAL,
            status: JobStatus.QUEUED,
          },
        }),
      ),
    );

    await Promise.all(feeds.map((feed) => enqueueFeedRefresh({ feedId: feed.id, trigger: "manual" })));
    return NextResponse.json({ ok: true, queued: feeds.length });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not queue refreshes");
  }
}
