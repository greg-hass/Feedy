import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { apiErrorFrom, assertApiUser, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { invalidateNavigationCache } from "@/lib/navigation-data";
import { assertOwnedFolder } from "@/lib/ownership";
import { updateFeedSchema } from "@/lib/schemas";

type Params = Promise<{ feedId: string }>;

export async function PATCH(request: Request, context: { params: Params }) {
	try {
		const user = await assertApiUser();
		const { feedId } = await context.params;
		const input = await parseJson(request, updateFeedSchema);
		const { muteRules, ...rest } = input;
		if (input.folderId) {
			await assertOwnedFolder(prisma, user.id, input.folderId);
		}

		const feed = await prisma.feed.update({
			where: {
				id: feedId,
				userId: user.id,
			},
			data: {
				...rest,
				...(muteRules ? { muteRules: muteRules as Prisma.InputJsonValue } : {}),
			},
		});

		invalidateNavigationCache(user.id);
		return NextResponse.json(feed);
	} catch (error) {
		return apiErrorFrom(error, "Could not update feed");
	}
}

export async function DELETE(_request: Request, context: { params: Params }) {
	try {
		const user = await assertApiUser();
		const { feedId } = await context.params;
		await prisma.feed.delete({
			where: { id: feedId, userId: user.id },
		});
		invalidateNavigationCache(user.id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return apiErrorFrom(error, "Could not delete feed");
	}
}
