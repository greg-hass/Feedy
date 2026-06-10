import { NextResponse } from "next/server";

import { apiErrorFrom, assertApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { invalidateNavigationCache } from "@/lib/navigation-data";
import { markItemsRead } from "@/lib/mark-read";

type Params = Promise<{ folderId: string }>;

export async function POST(_request: Request, context: { params: Params }) {
	try {
		const user = await assertApiUser();
		const { folderId } = await context.params;

		const items = await prisma.item.findMany({
			where: {
				feed: {
					userId: user.id,
					folderId,
				},
			},
			select: { id: true },
		});

		const newlyReadCount = await markItemsRead(
			prisma,
			user.id,
			items.map((item) => item.id),
		);
		await prisma.navigationStats.upsert({
			where: { userId: user.id },
			update: {
				unreadCount: { decrement: newlyReadCount },
			},
			create: {
				userId: user.id,
				unreadCount: 0,
				savedCount: 0,
			},
		});

		invalidateNavigationCache(user.id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return apiErrorFrom(error, "Could not mark folder as read");
	}
}
