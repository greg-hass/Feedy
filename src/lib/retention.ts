import { subDays } from "date-fns";

import { prisma } from "@/lib/db";

const REFRESH_RECORD_RETENTION_DAYS = 30;
const IMPORT_RECORD_RETENTION_DAYS = 30;
const PRUNE_BATCH_SIZE = 1000;
const PRUNE_ITEM_CAP_PER_RUN = 10_000;

export async function pruneUserData(userId: string, itemRetentionDays: number) {
  const itemCutoff = subDays(new Date(), itemRetentionDays);
  const refreshCutoff = subDays(new Date(), REFRESH_RECORD_RETENTION_DAYS);
  const importCutoff = subDays(new Date(), IMPORT_RECORD_RETENTION_DAYS);

  let deletedItems = 0;
  for (;;) {
    if (deletedItems >= PRUNE_ITEM_CAP_PER_RUN) {
      break;
    }

    const staleItems = await prisma.item.findMany({
      where: {
        feed: { userId },
        bookmarks: { none: {} },
        OR: [
          { publishedAt: { lt: itemCutoff } },
          {
            publishedAt: null,
            discoveredAt: { lt: itemCutoff },
          },
        ],
      },
      select: { id: true },
      take: Math.min(PRUNE_BATCH_SIZE, PRUNE_ITEM_CAP_PER_RUN - deletedItems),
    });

    if (staleItems.length === 0) {
      break;
    }

    const result = await prisma.item.deleteMany({
      where: {
        id: { in: staleItems.map((item) => item.id) },
      },
    });
    deletedItems += result.count;
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
