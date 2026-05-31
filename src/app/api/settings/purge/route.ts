import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorFrom, assertApiUser, parseJson } from "@/lib/api";
import { pruneUserData } from "@/lib/retention";

const purgeSchema = z.object({
  itemRetentionDays: z.number().int().min(30).max(365).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await assertApiUser();
    const input = await parseJson(request, purgeSchema);
    const retentionDays = input.itemRetentionDays ?? user.settings?.itemRetentionDays ?? 90;
    const result = await pruneUserData(user.id, retentionDays);

    return NextResponse.json({
      ...result,
      itemRetentionDays: retentionDays,
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not purge storage");
  }
}
