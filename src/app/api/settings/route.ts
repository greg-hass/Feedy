import { NextResponse } from "next/server";

import { apiError, assertApiUser, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { settingsSchema } from "@/lib/schemas";

export async function GET() {
  try {
    const user = await assertApiUser();
    return NextResponse.json(user.settings);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Unauthorized", 401);
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
    return NextResponse.json(settings);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not update settings");
  }
}
