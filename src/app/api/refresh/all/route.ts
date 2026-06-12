import { NextResponse } from "next/server";

import { apiError, apiErrorFrom, assertApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { invalidateNavigationCache } from "@/lib/navigation-data";
import { createFixedWindowRateLimiter } from "@/lib/rate-limit";
import { MAX_MANUAL_REFRESH_FEEDS } from "@/lib/workload-limits";
import { queueRefreshBatch } from "@/lib/refresh-orchestration";
import { buildAllRefreshFeedWhere } from "@/lib/refresh-scope";

const rateLimiter = createFixedWindowRateLimiter();

export async function POST() {
	try {
		const user = await assertApiUser();
		const refreshAttempt = await rateLimiter.check(`refresh:all:${user.id}`, {
			limit: 5,
			windowSeconds: 5 * 60,
		});
		if (!refreshAttempt.allowed) {
			const response = apiError("Refreshes are happening too quickly", 429);
			response.headers.set(
				"Retry-After",
				String(refreshAttempt.retryAfterSeconds),
			);
			return response;
		}
		const feeds = await prisma.feed.findMany({
			where: buildAllRefreshFeedWhere(user.id),
			select: { id: true },
		});
		if (feeds.length > MAX_MANUAL_REFRESH_FEEDS) {
			return apiError(
				`Refresh all is limited to ${MAX_MANUAL_REFRESH_FEEDS} feeds at a time. Refresh folders individually or wait for scheduled refresh.`,
				413,
			);
		}

		invalidateNavigationCache(user.id);
		return NextResponse.json(
			await queueRefreshBatch({
				userId: user.id,
				feedIds: feeds,
			}),
		);
	} catch (error) {
		return apiErrorFrom(error, "Could not queue refreshes");
	}
}
