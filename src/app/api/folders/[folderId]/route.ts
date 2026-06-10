import { NextResponse } from "next/server";

import { apiErrorFrom, assertApiUser, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { invalidateNavigationCache } from "@/lib/navigation-data";
import { updateFolderSchema } from "@/lib/schemas";

type Params = Promise<{ folderId: string }>;

export async function PATCH(request: Request, context: { params: Params }) {
	try {
		const user = await assertApiUser();
		const { folderId } = await context.params;
		const input = await parseJson(request, updateFolderSchema);

		const folder = await prisma.folder.update({
			where: {
				id: folderId,
				userId: user.id,
			},
			data: input,
		});

		invalidateNavigationCache(user.id);
		return NextResponse.json(folder);
	} catch (error) {
		return apiErrorFrom(error, "Could not update folder");
	}
}

export async function DELETE(_request: Request, context: { params: Params }) {
	try {
		const user = await assertApiUser();
		const { folderId } = await context.params;

		await prisma.feed.updateMany({
			where: { folderId, userId: user.id },
			data: { folderId: null },
		});
		await prisma.folder.delete({
			where: {
				id: folderId,
				userId: user.id,
			},
		});

		invalidateNavigationCache(user.id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return apiErrorFrom(error, "Could not delete folder");
	}
}
