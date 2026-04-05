import { NextResponse } from "next/server";

import { apiError, assertApiUser } from "@/lib/api";
import { JobStatus, JobTrigger } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueFeedRefresh } from "@/lib/queue";

type Params = Promise<{ folderId: string }>;

export async function POST(_request: Request, context: { params: Params }) {
  try {
    const user = await assertApiUser();
    const { folderId } = await context.params;
    const feeds = await prisma.feed.findMany({
      where: { userId: user.id, folderId },
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
    return apiError(error instanceof Error ? error.message : "Could not refresh folder");
  }
}
