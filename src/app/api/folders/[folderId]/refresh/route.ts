import { NextResponse } from "next/server";

import { apiError, apiErrorFrom, assertApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { invalidateNavigationCache } from "@/lib/navigation-data";
import { createFixedWindowRateLimiter } from "@/lib/rate-limit";
import { MAX_MANUAL_REFRESH_FEEDS } from "@/lib/workload-limits";
import { queueRefreshBatch } from "@/lib/refresh-orchestration";

const rateLimiter = createFixedWindowRateLimiter();

type Params = Promise<{ folderId: string }>;

export async function POST(_request: Request, context: { params: Params }) {
	try {
		const user = await assertApiUser();
		const refreshAttempt = await rateLimiter.check(
			`refresh:folder:${user.id}`,
			{
				limit: 5,
				windowSeconds: 5 * 60,
			},
		);
		if (!refreshAttempt.allowed) {
			const response = apiError(
				"Folder refreshes are happening too quickly",
				429,
			);
			response.headers.set(
				"Retry-After",
				String(refreshAttempt.retryAfterSeconds),
			);
			return response;
		}
		const { folderId } = await context.params;
		const feeds = await prisma.feed.findMany({
			where: { userId: user.id, folderId },
			select: { id: true },
		});
		if (feeds.length > MAX_MANUAL_REFRESH_FEEDS) {
			return apiError(
				`Folder refresh is limited to ${MAX_MANUAL_REFRESH_FEEDS} feeds at a time.`,
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
		return apiErrorFrom(error, "Could not refresh folder");
	}
}
