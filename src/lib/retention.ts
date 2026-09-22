import { Prisma } from "@prisma/client";
import { subDays } from "date-fns";

import { prisma } from "@/lib/db";

const REFRESH_RECORD_RETENTION_DAYS = 30;
const IMPORT_RECORD_RETENTION_DAYS = 30;
const PRUNE_BATCH_SIZE = 1000;
const PRUNE_ITEM_CAP_PER_RUN = 10_000;
const MINIMUM_ITEMS_PER_FEED = 15;

export async function pruneUserData(userId: string, itemRetentionDays: number) {
  const itemCutoff = subDays(new Date(), itemRetentionDays);
  const refreshCutoff = subDays(new Date(), REFRESH_RECORD_RETENTION_DAYS);
  const importCutoff = subDays(new Date(), IMPORT_RECORD_RETENTION_DAYS);

  const staleItems = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH ranked_items AS (
      SELECT
        item."id",
        COALESCE(item."publishedAt", item."discoveredAt") AS "retentionDate",
        ROW_NUMBER() OVER (
          PARTITION BY item."feedId"
          ORDER BY
            COALESCE(item."publishedAt", item."discoveredAt") DESC,
            item."discoveredAt" DESC,
            item."id" DESC
        ) AS "feedRank"
      FROM "Item" AS item
      INNER JOIN "Feed" AS feed ON feed."id" = item."feedId"
      WHERE feed."userId" = ${userId}
    )
    SELECT ranked_items."id"
    FROM ranked_items
    WHERE ranked_items."feedRank" > ${MINIMUM_ITEMS_PER_FEED}
      AND ranked_items."retentionDate" < ${itemCutoff}
      AND NOT EXISTS (
        SELECT 1
        FROM "Bookmark" AS bookmark
        WHERE bookmark."itemId" = ranked_items."id"
      )
    ORDER BY ranked_items."retentionDate" ASC, ranked_items."id" ASC
    LIMIT ${PRUNE_ITEM_CAP_PER_RUN}
  `);

  let deletedItems = 0;
  for (let offset = 0; offset < staleItems.length; offset += PRUNE_BATCH_SIZE) {
    const itemIds = staleItems
      .slice(offset, offset + PRUNE_BATCH_SIZE)
      .map((item) => item.id);
    const deletedInBatch = await prisma.$transaction(async (tx) => {
      const unreadToDelete = await tx.item.count({
        where: {
          id: { in: itemIds },
          feed: { userId, excludeFromTimeline: false },
          mutedByRule: false,
          readStates: { none: { userId } },
        },
      });

      const result = await tx.item.deleteMany({
        where: { id: { in: itemIds } },
      });

      if (unreadToDelete > 0) {
        await tx.navigationStats.upsert({
          where: { userId },
          update: { unreadCount: { decrement: unreadToDelete } },
          create: {
            userId,
            unreadCount: 0,
            savedCount: 0,
          },
        });
      }

      return result.count;
    });
    deletedItems += deletedInBatch;
  }

  const [refreshLogsResult, refreshJobsResult, importRecordsResult] = await prisma.$transaction([
    prisma.refreshLog.deleteMany({
      where: {
        feed: { userId },
        startedAt: { lt: refreshCutoff },
      },
    }),
    prisma.refreshJob.deleteMany({
      where: {
        userId,
        requestedAt: { lt: refreshCutoff },
      },
    }),
    prisma.importExportRecord.deleteMany({
      where: {
        userId,
        createdAt: { lt: importCutoff },
      },
    }),
  ]);

  return {
    deletedItems,
    deletedRefreshLogs: refreshLogsResult.count,
    deletedRefreshJobs: refreshJobsResult.count,
    deletedImportRecords: importRecordsResult.count,
  };
}
