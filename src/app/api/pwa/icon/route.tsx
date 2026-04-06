import { ImageResponse } from "next/og";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PwaIconArtwork } from "@/lib/pwa-icon";
import type { AccentColor } from "@/lib/theme";

export const runtime = "nodejs";

async function getAccent(): Promise<AccentColor> {
  const session = await getSession();
  if (!session?.userId) return "EMERALD";

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { settings: { select: { accentColor: true } } },
  });

  return (user?.settings?.accentColor as AccentColor | undefined) ?? "EMERALD";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedSize = Number(searchParams.get("size") || "192");
  const size = [64, 180, 192, 512].includes(requestedSize) ? requestedSize : 192;
  const accent = await getAccent();

  const image = new ImageResponse(<PwaIconArtwork accent={accent} size={size} />, {
    width: size,
    height: size,
  });

  image.headers.set("Cache-Control", "private, no-store, max-age=0");
  return image;
}
