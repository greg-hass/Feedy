import { NextResponse } from "next/server";

import { apiError, apiErrorFrom, assertApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertOwnedFeed } from "@/lib/ownership";
import { createFixedWindowRateLimiter } from "@/lib/rate-limit";
import { queueRefreshBatch } from "@/lib/refresh-orchestration";

const rateLimiter = createFixedWindowRateLimiter();

type Params = Promise<{ feedId: string }>;

export async function POST(_request: Request, context: { params: Params }) {
  try {
    const user = await assertApiUser();
    const { feedId } = await context.params;
    await assertOwnedFeed(prisma, user.id, feedId);
    const refreshAttempt = await rateLimiter.check(`refresh:feed:${user.id}`, {
      limit: 5,
      windowSeconds: 5 * 60,
    });
    if (!refreshAttempt.allowed) {
      const response = apiError("Feed refreshes are happening too quickly", 429);
      response.headers.set("Retry-After", String(refreshAttempt.retryAfterSeconds));
      return response;
    }
    return NextResponse.json(
      await queueRefreshBatch({
        userId: user.id,
        feedIds: [{ id: feedId }],
      }),
    );
  } catch (error) {
    return apiErrorFrom(error, "Could not queue refresh");
  }
}
