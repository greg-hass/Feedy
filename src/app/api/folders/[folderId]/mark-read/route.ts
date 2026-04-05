import { NextResponse } from "next/server";

import { apiError, assertApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";

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

    await prisma.$transaction(
      items.map((item) =>
        prisma.readState.upsert({
          where: {
            userId_itemId: {
              userId: user.id,
              itemId: item.id,
            },
          },
          update: { lastReadAt: new Date() },
          create: {
            userId: user.id,
            itemId: item.id,
          },
        }),
      ),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not mark folder as read");
  }
}
