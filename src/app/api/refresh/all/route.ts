import { NextResponse } from "next/server";

import { apiError, apiErrorFrom, assertApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { invalidateNavigationCache } from "@/lib/navigation-data";
import { createFixedWindowRateLimiter } from "@/lib/rate-limit";
import { MAX_MANUAL_REFRESH_FEEDS } from "@/lib/workload-limits";
import { queueRefreshBatch } from "@/lib/refresh-orchestration";

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
			where: { userId: user.id },
			select: { id: true },
		});
		if (feeds.length > MAX_MANUAL_REFRESH_FEEDS) {
			return apiError(
				`Refresh all is limited to ${MAX_MANUAL_REFRESH_FEEDS} feeds at a time. Refresh folders individually or wait for scheduled refresh.`,
				413,
			);
		}

		// Prevent duplicate batches: if there's a recent RUNNING batch, return it
		const existingBatch = await prisma.refreshBatch.findFirst({
			where: {
				userId: user.id,
				status: { in: ["QUEUED", "RUNNING"] },
				createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
			},
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				totalFeeds: true,
				queued: true,
				skipped: true,
				createdAt: true,
			},
		});

		if (existingBatch) {
			invalidateNavigationCache(user.id);
			return NextResponse.json({
				ok: true,
				batchId: existingBatch.id,
				totalFeeds: existingBatch.totalFeeds,
				queued: existingBatch.queued,
				skipped: existingBatch.skipped,
				batchStartedAt: existingBatch.createdAt.toISOString(),
				reuseExisting: true,
			});
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
