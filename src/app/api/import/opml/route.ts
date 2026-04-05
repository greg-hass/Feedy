import { NextResponse } from "next/server";

import { apiError, assertApiUser } from "@/lib/api";
import { ImportExportStatus, ImportExportType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseOpml } from "@/lib/feed/opml";
import { createFeedForUser } from "@/lib/feed/service";

async function importNodes(
  userId: string,
  nodes: Array<{
    title: string;
    text: string;
    xmlUrl?: string;
    children?: Array<{
      title: string;
      text: string;
      xmlUrl?: string;
    }>;
  }>,
) {
  let imported = 0;

  for (const node of nodes) {
    let folderId: string | null = null;
    if (node.children?.length) {
      const folder = await prisma.folder.create({
        data: {
          userId,
          title: node.title,
        },
      });
      folderId = folder.id;

      for (const child of node.children) {
        if (!child.xmlUrl) continue;
        const exists = await prisma.feed.findFirst({
          where: { userId, sourceUrl: child.xmlUrl },
        });
        if (exists) continue;
        await createFeedForUser(userId, {
          sourceUrl: child.xmlUrl,
          folderId,
          label: child.title,
        });
        imported += 1;
      }
      continue;
    }

    if (!node.xmlUrl) continue;
    const exists = await prisma.feed.findFirst({
      where: { userId, sourceUrl: node.xmlUrl },
    });
    if (exists) continue;
    await createFeedForUser(userId, {
      sourceUrl: node.xmlUrl,
      label: node.title,
    });
    imported += 1;
  }

  return imported;
}

export async function POST(request: Request) {
  try {
    const user = await assertApiUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return apiError("File is required");
    }

    const xml = await file.text();
    const nodes = parseOpml(xml);

    const record = await prisma.importExportRecord.create({
      data: {
        userId: user.id,
        type: ImportExportType.OPML_IMPORT,
        status: ImportExportStatus.RUNNING,
        filename: file.name,
      },
    });

    const imported = await importNodes(user.id, nodes);
    await prisma.importExportRecord.update({
      where: { id: record.id },
      data: {
        status: ImportExportStatus.SUCCEEDED,
        completedAt: new Date(),
        summary: { imported },
      },
    });

    return NextResponse.json({ ok: true, imported });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not import OPML");
  }
}
