import { NextResponse } from "next/server";

import { apiError, assertApiUser, parseQuery } from "@/lib/api";
import { discoverFeeds } from "@/lib/feed/discover";
import { measurePerf } from "@/lib/perf";
import { createFixedWindowRateLimiter } from "@/lib/rate-limit";
import { searchSchema } from "@/lib/schemas";

const rateLimiter = createFixedWindowRateLimiter();

export async function GET(request: Request) {
  try {
    const user = await assertApiUser();
    const query = await parseQuery(new URL(request.url).searchParams, searchSchema);
    const discoverAttempt = await rateLimiter.check(`discover:${user.id}`, {
      limit: 20,
      windowSeconds: 5 * 60,
    });
    if (!discoverAttempt.allowed) {
      const response = apiError("Discovery searches are happening too quickly", 429);
      response.headers.set("Retry-After", String(discoverAttempt.retryAfterSeconds));
      return response;
    }

    const results = await measurePerf(
      "api.discover",
      () => discoverFeeds(query.q, query.sourceFilter),
      {
        qLength: query.q.length,
        sourceFilter: query.sourceFilter ?? "ALL",
      },
    );
    return NextResponse.json(results);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not discover feeds");
  }
}
