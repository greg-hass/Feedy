import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { assertApiUser, apiErrorFrom } from "@/lib/api";
import { prisma } from "@/lib/db";
import { fetchAndCacheIcon } from "@/lib/feed/icons";
import { assertOwnedFeed } from "@/lib/ownership";

type Params = Promise<{ feedId: string }>;

function isWeakIconSource(sourceUrl?: string | null) {
	if (!sourceUrl) {
		return true;
	}

	const lower = sourceUrl.toLowerCase();
	const looksLikeRealIcon =
		lower.includes("favicon") ||
		lower.includes("apple-touch") ||
		lower.includes("android-chrome") ||
		lower.includes("mask-icon") ||
		lower.includes("logo") ||
		lower.includes("avatar") ||
		lower.includes("yt3.") ||
		lower.includes("googleusercontent.com") ||
		lower.includes("gravatar.com") ||
		lower.includes("wp.com");
	const looksLikePromoImage =
		lower.endsWith(".webp") ||
		lower.includes(".webp?") ||
		lower.endsWith(".jpg") ||
		lower.includes(".jpg?") ||
		lower.endsWith(".jpeg") ||
		lower.includes(".jpeg?") ||
		lower.includes("/content/images/") ||
		lower.includes("opengraph") ||
		lower.includes("open-graph");

	return (
		lower.includes("youtube.com/favicon") ||
		lower.includes("fit=32") ||
		lower.includes("w=32") ||
		lower.includes("h=32") ||
		lower.includes("sz=32") ||
		lower.includes("s32-") ||
		(looksLikePromoImage && !looksLikeRealIcon)
	);
}

export async function GET(_request: Request, context: { params: Params }) {
	const { feedId } = await context.params;

	try {
		const user = await assertApiUser();
		await assertOwnedFeed(prisma, user.id, feedId);
	} catch (error) {
		return apiErrorFrom(error, "Feed not found", 404);
	}

	let icon = await prisma.feedIcon.findUnique({
		where: { feedId },
	});

	if (!icon || isWeakIconSource(icon.sourceUrl)) {
		const refreshed = await fetchAndCacheIcon(feedId).catch(() => null);
		if (refreshed) {
			icon = refreshed;
		}
	}

	if (!icon) {
		return new NextResponse(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="14" fill="#0f172a"/><path d="M15 26a7 7 0 017 7" stroke="#f8fafc" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M15 18a15 15 0 0115 15" stroke="#f59e0b" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="17" cy="32" r="2.5" fill="#f8fafc"/></svg>`,
			{
				headers: {
					"content-type": "image/svg+xml",
					"cache-control": "no-store, max-age=0",
				},
			},
		);
	}

	const bytes = await readFile(icon.storagePath);
	return new NextResponse(bytes, {
		headers: {
			"content-type": icon.mimeType || "image/x-icon",
			"cache-control": "no-store, max-age=0",
		},
	});
}
