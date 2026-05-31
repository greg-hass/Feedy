import { NextResponse } from "next/server";

import { apiErrorFrom, assertApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { markItemsRead } from "@/lib/mark-read";

type Params = Promise<{ feedId: string }>;

export async function POST(_request: Request, context: { params: Params }) {
  try {
    const user = await assertApiUser();
    const { feedId } = await context.params;

    const items = await prisma.item.findMany({
      where: {
        feedId,
        feed: { userId: user.id },
      },
      select: { id: true },
    });

    await markItemsRead(
      prisma,
      user.id,
      items.map((item) => item.id),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorFrom(error, "Could not mark feed as read");
  }
}
