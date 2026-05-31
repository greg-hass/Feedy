import { NextResponse } from "next/server";

import { apiErrorFrom, assertApiUser } from "@/lib/api";
import { ImportExportStatus, ImportExportType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildOpml } from "@/lib/feed/opml";

export async function GET() {
  try {
    const user = await assertApiUser();
    const folders = await prisma.folder.findMany({
      where: { userId: user.id },
      include: { feeds: true },
      orderBy: { position: "asc" },
    });
    const looseFeeds = await prisma.feed.findMany({
      where: { userId: user.id, folderId: null },
      orderBy: { position: "asc" },
    });

    const xml = buildOpml([
      ...folders.map((folder) => ({
        text: folder.title,
        title: folder.title,
        children: folder.feeds.map((feed) => ({
          text: feed.label || feed.title,
          title: feed.label || feed.title,
          xmlUrl: feed.sourceUrl,
          htmlUrl: feed.siteUrl || undefined,
        })),
      })),
      ...looseFeeds.map((feed) => ({
        text: feed.label || feed.title,
        title: feed.label || feed.title,
        xmlUrl: feed.sourceUrl,
        htmlUrl: feed.siteUrl || undefined,
      })),
    ]);

    await prisma.importExportRecord.create({
      data: {
        userId: user.id,
        type: ImportExportType.OPML_EXPORT,
        status: ImportExportStatus.SUCCEEDED,
        filename: "feedy-export.opml",
      },
    });

    return new NextResponse(xml, {
      headers: {
        "content-type": "text/x-opml",
        "content-disposition": 'attachment; filename="feedy-export.opml"',
      },
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not export OPML");
  }
}
