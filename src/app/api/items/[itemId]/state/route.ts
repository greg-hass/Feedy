import { NextResponse } from "next/server";

import { apiErrorFrom, assertApiUser, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { invalidateNavigationCache } from "@/lib/navigation-data";
import { assertOwnedItem } from "@/lib/ownership";
import { itemStateSchema } from "@/lib/schemas";

type Params = Promise<{ itemId: string }>;

export async function POST(request: Request, context: { params: Params }) {
	try {
		const user = await assertApiUser();
		const { itemId } = await context.params;
		const input = await parseJson(request, itemStateSchema);
		await assertOwnedItem(prisma, user.id, itemId);

		if (typeof input.read === "boolean") {
			if (input.read) {
				await prisma.readState.upsert({
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
				await prisma.readState.deleteMany({
					where: { userId: user.id, itemId },
				});
			}
		}

		if (typeof input.bookmarked === "boolean") {
			if (input.bookmarked) {
				await prisma.bookmark.upsert({
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
				await prisma.bookmark.deleteMany({
					where: { userId: user.id, itemId },
				});
			}
		}

		invalidateNavigationCache(user.id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return apiErrorFrom(error, "Could not update item");
	}
}
