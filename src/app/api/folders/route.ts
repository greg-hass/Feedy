import { NextResponse } from "next/server";

import { apiErrorFrom, assertApiUser, parseJson } from "@/lib/api";
import {
	getNavigationData,
	invalidateNavigationCache,
} from "@/lib/navigation-data";
import { prisma } from "@/lib/db";
import { folderSchema } from "@/lib/schemas";

export async function GET() {
	try {
		const user = await assertApiUser();
		const navigation = await getNavigationData(user.id);
		return NextResponse.json(navigation.folders);
	} catch (error) {
		return apiErrorFrom(error, "Unauthorized");
	}
}

export async function POST(request: Request) {
	try {
		const user = await assertApiUser();
		const input = await parseJson(request, folderSchema);
		const maxPosition = await prisma.folder.aggregate({
			where: { userId: user.id },
			_max: { position: true },
		});

		const folder = await prisma.folder.create({
			data: {
				userId: user.id,
				title: input.title,
				position: input.position ?? (maxPosition._max.position ?? -1) + 1,
			},
		});

		invalidateNavigationCache(user.id);
		return NextResponse.json(folder);
	} catch (error) {
		return apiErrorFrom(error, "Could not create folder");
	}
}
