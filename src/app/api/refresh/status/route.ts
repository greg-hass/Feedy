import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, assertApiUser, parseQuery } from "@/lib/api";
import { prisma } from "@/lib/db";

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
