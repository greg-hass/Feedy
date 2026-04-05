import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { extname } from "node:path";

import { prisma } from "@/lib/db";
import { fetchWithTimeout } from "@/lib/http";
import { iconPath } from "@/lib/storage";

function inferIconCandidates(siteUrl?: string | null, hint?: string | null) {
  const candidates = new Set<string>();
  if (hint) {
    candidates.add(hint);
  }
  if (siteUrl) {
    try {
      const url = new URL(siteUrl);
      candidates.add(new URL("/favicon.ico", url).toString());
    } catch {
      return [...candidates];
    }
  }
  return [...candidates];
}

export async function fetchAndCacheIcon(feedId: string) {
  const feed = await prisma.feed.findUnique({
    where: { id: feedId },
    include: { icon: true },
  });

  if (!feed) {
    return null;
  }

  for (const candidate of inferIconCandidates(feed.siteUrl, feed.iconHintUrl)) {
    try {
      const response = await fetchWithTimeout(candidate, {}, 10_000);
      if (!response.ok) {
        continue;
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      const ext = extname(new URL(candidate).pathname) || ".ico";
      const filename = `${createHash("sha1").update(`${feedId}:${candidate}`).digest("hex")}${ext}`;
      const filePath = iconPath(filename);
      await writeFile(filePath, bytes);

      return prisma.feedIcon.upsert({
        where: { feedId },
        update: {
          sourceUrl: candidate,
          mimeType: response.headers.get("content-type"),
          storagePath: filePath,
          fetchedAt: new Date(),
        },
        create: {
          feedId,
          sourceUrl: candidate,
          mimeType: response.headers.get("content-type"),
          storagePath: filePath,
        },
      });
    } catch {
      continue;
    }
  }

  return null;
}
