import { NextResponse } from "next/server";

import { apiError, assertApiUser, parseJson } from "@/lib/api";
import { getNavigationData } from "@/lib/data";
import { prisma } from "@/lib/db";
import { folderSchema } from "@/lib/schemas";

export async function GET() {
  try {
    const user = await assertApiUser();
    const navigation = await getNavigationData(user.id);
    return NextResponse.json(navigation.folders);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Unauthorized", 401);
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

    return NextResponse.json(folder);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not create folder");
  }
}
