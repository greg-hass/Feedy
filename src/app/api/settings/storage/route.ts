import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { apiError, assertApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";

type StorageStatsRow = {
  dbSizeBytes: bigint;
  feedCount: bigint;
  articleCount: bigint;
  bookmarkedArticleCount: bigint;
};

export async function GET() {
  try {
    const user = await assertApiUser();
    const retentionDays = user.settings?.itemRetentionDays ?? 90;
    const [row] = await prisma.$queryRaw<StorageStatsRow[]>(Prisma.sql`
      SELECT
        pg_database_size(current_database())::bigint AS "dbSizeBytes",
        (
          SELECT COUNT(*)::bigint
          FROM "Feed" f
          WHERE f."userId" = ${user.id}
        ) AS "feedCount",
        (
          SELECT COUNT(*)::bigint
          FROM "Item" i
          INNER JOIN "Feed" f ON f.id = i."feedId"
          WHERE f."userId" = ${user.id}
        ) AS "articleCount",
        (
          SELECT COUNT(*)::bigint
          FROM "Bookmark" b
          WHERE b."userId" = ${user.id}
        ) AS "bookmarkedArticleCount"
    `);

    return NextResponse.json({
      dbSizeBytes: Number(row?.dbSizeBytes ?? BigInt(0)),
      feedCount: Number(row?.feedCount ?? BigInt(0)),
      articleCount: Number(row?.articleCount ?? BigInt(0)),
      bookmarkedArticleCount: Number(row?.bookmarkedArticleCount ?? BigInt(0)),
      retentionDays,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Unauthorized", 401);
  }
}
