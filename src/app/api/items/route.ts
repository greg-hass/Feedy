import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, assertApiUser, parseQuery } from "@/lib/api";
import { getTimelineItems } from "@/lib/data";
import { serializeItem } from "@/lib/serializers";

const itemQuerySchema = z.object({
  feedId: z.string().optional(),
  saved: z.enum(["true", "false"]).optional(),
  sourceFilter: z.enum(["RSS", "REDDIT", "YOUTUBE"]).optional(),
  stateFilter: z.enum(["UNREAD", "READ", "ALL"]).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await assertApiUser();
    const query = await parseQuery(new URL(request.url).searchParams, itemQuerySchema);
    const items = await getTimelineItems(user.id, {
      feedId: query.feedId,
      saved: query.saved === "true",
      sourceFilter: query.sourceFilter,
      stateFilter: query.stateFilter,
    });

    return NextResponse.json(items.map(serializeItem));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not fetch items");
  }
}
