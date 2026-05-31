import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorFrom, assertApiUser, parseQuery } from "@/lib/api";
import { getTimelineItemPage, getTimelineItems } from "@/lib/data";
import { measurePerf } from "@/lib/perf";
import { serializeItem } from "@/lib/serializers";

const itemQuerySchema = z.object({
  feedId: z.string().optional(),
  folderId: z.string().optional(),
  saved: z.enum(["true", "false"]).optional(),
  sourceFilter: z.enum(["RSS", "REDDIT", "YOUTUBE"]).optional(),
  stateFilter: z.enum(["UNREAD", "READ", "ALL"]).optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await assertApiUser();
    const query = await parseQuery(new URL(request.url).searchParams, itemQuerySchema);
    if (query.pageSize !== undefined) {
      const page = await measurePerf(
        "api.items",
        () =>
          getTimelineItemPage(user.id, {
            feedId: query.feedId,
            folderId: query.folderId,
            saved: query.saved === "true",
            sourceFilter: query.sourceFilter,
            stateFilter: query.stateFilter,
            q: query.q,
            cursor: query.cursor,
            pageSize: query.pageSize,
          }, user.settings?.hideYouTubeShorts ?? false),
        {
          userId: user.id,
          feedId: query.feedId ?? null,
          folderId: query.folderId ?? null,
          saved: query.saved === "true",
          sourceFilter: query.sourceFilter ?? "ALL",
          stateFilter: query.stateFilter ?? "UNREAD",
          qLength: query.q?.length ?? 0,
          cursor: query.cursor ?? null,
          pageSize: query.pageSize,
        },
      );

      return NextResponse.json({
        items: page.items.map(serializeItem),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      });
    }

    const items = await measurePerf(
      "api.items",
      () =>
        getTimelineItems(user.id, {
          feedId: query.feedId,
          folderId: query.folderId,
          saved: query.saved === "true",
          sourceFilter: query.sourceFilter,
          stateFilter: query.stateFilter,
          q: query.q,
        }, user.settings?.hideYouTubeShorts ?? false),
      {
        userId: user.id,
        feedId: query.feedId ?? null,
        folderId: query.folderId ?? null,
        saved: query.saved === "true",
        sourceFilter: query.sourceFilter ?? "ALL",
        stateFilter: query.stateFilter ?? "UNREAD",
        qLength: query.q?.length ?? 0,
      },
    );

    return NextResponse.json(items.map(serializeItem));
  } catch (error) {
    return apiErrorFrom(error, "Could not fetch items");
  }
}
