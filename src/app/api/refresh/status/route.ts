import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorFrom, assertApiUser, parseQuery } from "@/lib/api";
import { prisma } from "@/lib/db";
import { measurePerf } from "@/lib/perf";

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
    const jobs = await measurePerf(
      "api.refreshStatus.summaryJobs",
      () =>
        prisma.refreshJob.findMany({
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
        }),
      { userId: user.id, batchId: query.batchId },
    );

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
    return apiErrorFrom(error, "Could not fetch refresh status");
  }
}
