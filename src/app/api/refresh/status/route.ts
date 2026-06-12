import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorFrom, assertApiUser, parseQuery } from "@/lib/api";
import { prisma } from "@/lib/db";
import { measurePerf } from "@/lib/perf";
import { summarizeDurableRefreshBatch, summarizeLegacyRefreshJobs } from "@/lib/refresh-status-summary";

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

    const batch = await measurePerf(
      "api.refreshStatus.batch",
      () =>
        prisma.refreshBatch.findFirst({
          where: {
            id: query.batchId,
            userId: user.id,
          },
          select: {
            totalFeeds: true,
            queued: true,
            skipped: true,
            succeeded: true,
            failed: true,
            status: true,
            startedAt: true,
            finishedAt: true,
          },
        }),
      { userId: user.id, batchId: query.batchId },
    );

    if (batch) {
      return NextResponse.json(summarizeDurableRefreshBatch(batch));
    }

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

    return NextResponse.json(summarizeLegacyRefreshJobs(jobs));
  } catch (error) {
    return apiErrorFrom(error, "Could not fetch refresh status");
  }
}
