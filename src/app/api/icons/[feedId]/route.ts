import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { assertApiUser, apiErrorFrom } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertOwnedFeed } from "@/lib/ownership";
import { enqueueIconFetch } from "@/lib/queue";

type Params = Promise<{ feedId: string }>;

export async function GET(_request: Request, context: { params: Params }) {
	const { feedId } = await context.params;

	try {
		const user = await assertApiUser();
		await assertOwnedFeed(prisma, user.id, feedId);
	} catch (error) {
		return apiErrorFrom(error, "Feed not found", 404);
	}

	const icon = await prisma.feedIcon.findUnique({
		where: { feedId },
	});

	// If no icon is cached yet, return the placeholder immediately and
	// enqueue a background fetch so the next request picks it up. Never
	// block the response on a network fetch — that was making feed icons
	// painfully slow on the timeline.
	if (!icon) {
		enqueueIconFetch({ feedId }).catch(() => null);
		return new NextResponse(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="14" fill="#0f172a"/><path d="M15 26a7 7 0 017 7" stroke="#f8fafc" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M15 18a15 15 0 0115 15" stroke="#f59e0b" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="17" cy="32" r="2.5" fill="#f8fafc"/></svg>`,
			{
				headers: {
					"content-type": "image/svg+xml",
					// Allow the browser to cache the placeholder so it doesn't
					// flicker when the same feed is rendered many times on the
					// timeline (e.g. when scrolling a long list).
					"cache-control": "private, max-age=60",
				},
			},
		);
	}

	const bytes = await readFile(icon.storagePath);
	return new NextResponse(bytes, {
		headers: {
			"content-type": icon.mimeType || "image/x-icon",
			// 24h browser cache. The icon rarely changes per feed, so caching
			// kills the appear/disappear loop on timeline scroll (each card
			// used to refetch the binary from disk on every scroll because
			// `no-store` forced a round trip per Image element). Bump the
			// `?v=N` cache buster in clients when icons need to be force-
			// refreshed (currently `?v=2`).
			"cache-control": "private, max-age=86400",
		},
	});
}
