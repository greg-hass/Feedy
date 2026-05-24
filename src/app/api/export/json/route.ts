import { NextResponse } from "next/server";

import { apiError, assertApiUser } from "@/lib/api";
import { ImportExportStatus, ImportExportType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { MAX_JSON_EXPORT_ITEMS } from "@/lib/workload-limits";

export async function GET() {
  try {
    const user = await assertApiUser();
    const itemCount = await prisma.item.count({
      where: { feed: { userId: user.id } },
    });
    if (itemCount > MAX_JSON_EXPORT_ITEMS) {
      return apiError(
        `JSON export is limited to ${MAX_JSON_EXPORT_ITEMS} items. Use a database backup for larger libraries.`,
        413,
      );
    }

    const [folders, feeds, items, bookmarks, readStates, settings] = await Promise.all([
      prisma.folder.findMany({ where: { userId: user.id }, orderBy: { position: "asc" } }),
      prisma.feed.findMany({ where: { userId: user.id }, orderBy: { position: "asc" } }),
      prisma.item.findMany({
        where: { feed: { userId: user.id } },
        orderBy: [{ publishedAt: "desc" }, { discoveredAt: "desc" }],
        take: MAX_JSON_EXPORT_ITEMS + 1,
      }),
      prisma.bookmark.findMany({ where: { userId: user.id } }),
      prisma.readState.findMany({ where: { userId: user.id } }),
      prisma.settings.findUnique({ where: { userId: user.id } }),
    ]);
    if (items.length > MAX_JSON_EXPORT_ITEMS) {
      return apiError("The library grew during export. Please retry or use a database backup.", 413);
    }

    await prisma.importExportRecord.create({
      data: {
        userId: user.id,
        type: ImportExportType.JSON_EXPORT,
        status: ImportExportStatus.SUCCEEDED,
        filename: "feedy-backup.json",
      },
    });

    return NextResponse.json(
      {
        exportedAt: new Date().toISOString(),
        user: { username: user.username },
        settings,
        folders,
        feeds,
        items,
        bookmarks,
        readStates,
      },
      {
        headers: {
          "content-disposition": 'attachment; filename="feedy-backup.json"',
        },
      },
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not export backup");
  }
}
