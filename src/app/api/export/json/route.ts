import { NextResponse } from "next/server";

import { apiError, assertApiUser } from "@/lib/api";
import { ImportExportStatus, ImportExportType } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const user = await assertApiUser();
    const [folders, feeds, items, bookmarks, readStates, settings] = await Promise.all([
      prisma.folder.findMany({ where: { userId: user.id }, orderBy: { position: "asc" } }),
      prisma.feed.findMany({ where: { userId: user.id }, orderBy: { position: "asc" } }),
      prisma.item.findMany({
        where: { feed: { userId: user.id } },
        orderBy: [{ publishedAt: "desc" }, { discoveredAt: "desc" }],
      }),
      prisma.bookmark.findMany({ where: { userId: user.id } }),
      prisma.readState.findMany({ where: { userId: user.id } }),
      prisma.settings.findUnique({ where: { userId: user.id } }),
    ]);

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
