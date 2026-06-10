import { NextResponse } from "next/server";

import { apiErrorFrom, assertApiUser, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { invalidateNavigationCache } from "@/lib/navigation-data";
import { getNavigationStats } from "@/lib/navigation-stats";
import { settingsSchema } from "@/lib/schemas";

export async function GET() {
	try {
		const user = await assertApiUser();
		return NextResponse.json(user.settings);
	} catch (error) {
		return apiErrorFrom(error, "Unauthorized");
	}
}

export async function PATCH(request: Request) {
	try {
		const user = await assertApiUser();
		const input = await parseJson(request, settingsSchema);
		const settings = await prisma.settings.update({
			where: { userId: user.id },
			data: input,
		});
		if (typeof input.hideYouTubeShorts === "boolean") {
			await getNavigationStats(prisma, user.id, input.hideYouTubeShorts);
		}
		invalidateNavigationCache(user.id);
		return NextResponse.json(settings);
	} catch (error) {
		return apiErrorFrom(error, "Could not update settings");
	}
}
