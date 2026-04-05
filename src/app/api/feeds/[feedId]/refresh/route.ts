import { NextResponse } from "next/server";

import { apiError, assertApiUser } from "@/lib/api";
import { JobStatus, JobTrigger } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueFeedRefresh } from "@/lib/queue";

type Params = Promise<{ feedId: string }>;

export async function POST(_request: Request, context: { params: Params }) {
  try {
    const user = await assertApiUser();
    const { feedId } = await context.params;
    await prisma.refreshJob.create({
      data: {
        userId: user.id,
        feedId,
        trigger: JobTrigger.MANUAL,
        status: JobStatus.QUEUED,
      },
    });
    await enqueueFeedRefresh({ feedId, trigger: "manual" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not queue refresh");
  }
}
