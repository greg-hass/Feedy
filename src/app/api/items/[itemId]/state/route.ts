import { NextResponse } from "next/server";

import { apiErrorFrom, assertApiUser, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { invalidateNavigationCache } from "@/lib/navigation-data";
import { adjustNavigationStats } from "@/lib/navigation-stats";
import { assertOwnedItem } from "@/lib/ownership";
import { itemStateSchema } from "@/lib/schemas";

type Params = Promise<{ itemId: string }>;

export async function POST(request: Request, context: { params: Params }) {
	try {
		const user = await assertApiUser();
		const { itemId } = await context.params;
		const input = await parseJson(request, itemStateSchema);
		await assertOwnedItem(prisma, user.id, itemId);

		await prisma.$transaction(async (tx) => {
			let savedDelta = 0;
			let unreadDelta = 0;

			if (typeof input.read === "boolean") {
				const existingRead = await tx.readState.findUnique({
					where: {
						userId_itemId: {
							userId: user.id,
							itemId,
						},
					},
					select: { id: true },
				});

				if (input.read) {
					if (!existingRead) {
						unreadDelta -= 1;
					}
					await tx.readState.upsert({
						where: {
							userId_itemId: {
								userId: user.id,
								itemId,
							},
						},
						update: { lastReadAt: new Date() },
						create: {
							userId: user.id,
							itemId,
						},
					});
				} else {
					if (existingRead) {
						unreadDelta += 1;
					}
					await tx.readState.deleteMany({
						where: { userId: user.id, itemId },
					});
				}
			}

			if (typeof input.bookmarked === "boolean") {
				const existingBookmark = await tx.bookmark.findUnique({
					where: {
						userId_itemId: {
							userId: user.id,
							itemId,
						},
					},
					select: { id: true },
				});

				if (input.bookmarked) {
					if (!existingBookmark) {
						savedDelta += 1;
					}
					await tx.bookmark.upsert({
						where: {
							userId_itemId: {
								userId: user.id,
								itemId,
							},
						},
						update: { bookmarkedAt: new Date() },
						create: {
							userId: user.id,
							itemId,
						},
					});
				} else {
					if (existingBookmark) {
						savedDelta -= 1;
					}
					await tx.bookmark.deleteMany({
						where: { userId: user.id, itemId },
					});
				}
			}

			await adjustNavigationStats(tx, user.id, { unreadDelta, savedDelta });
		});

		invalidateNavigationCache(user.id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return apiErrorFrom(error, "Could not update item");
	}
}
