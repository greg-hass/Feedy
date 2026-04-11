import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { apiError, assertApiUser, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { updateFeedSchema } from "@/lib/schemas";

type Params = Promise<{ feedId: string }>;

export async function PATCH(request: Request, context: { params: Params }) {
  try {
    const user = await assertApiUser();
    const { feedId } = await context.params;
    const input = await parseJson(request, updateFeedSchema);
    const { muteRules, ...rest } = input;

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

    return NextResponse.json(feed);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not update feed");
  }
}

export async function DELETE(_request: Request, context: { params: Params }) {
  try {
    const user = await assertApiUser();
    const { feedId } = await context.params;
    await prisma.feed.delete({
      where: { id: feedId, userId: user.id },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not delete feed");
  }
}
