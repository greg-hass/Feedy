import { readFile } from "node:fs/promises";
import path from "node:path";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { AccentColor } from "@/lib/theme";

export const runtime = "nodejs";

const VALID_SIZES = new Set([64, 180, 192, 512]);
const VALID_ACCENTS = new Set([
  "emerald",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "pink",
  "rose",
  "orange",
  "amber",
  "lime",
  "slate",
]);

async function getAccent(requestedAccent: string | null): Promise<string> {
  const normalized = requestedAccent?.toLowerCase();
  if (normalized && VALID_ACCENTS.has(normalized)) {
    return normalized;
  }

  const session = await getSession();
  if (!session?.userId) {
    return "emerald";
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { settings: { select: { accentColor: true } } },
  });

  const accent = (user?.settings?.accentColor as AccentColor | undefined)?.toLowerCase();
  return accent && VALID_ACCENTS.has(accent) ? accent : "emerald";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedSize = Number(searchParams.get("size") || "64");
  const size = VALID_SIZES.has(requestedSize) ? requestedSize : 64;
  const accent = await getAccent(searchParams.get("accent"));
  const iconPath = path.join(process.cwd(), "public", "icon-variants", `${accent}-${size}.png`);
  const icon = await readFile(iconPath);

  return new Response(icon, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "image/png",
    },
  });
}
