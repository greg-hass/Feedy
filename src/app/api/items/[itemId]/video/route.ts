import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getReaderItem } from "@/lib/data";
import { resolvePlayableMediaSource } from "@/lib/media/resolve-media-source";

type Params = Promise<{ itemId: string }>;

export async function GET(_request: Request, context: { params: Params }) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await context.params;
  const item = await getReaderItem(session.userId, itemId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const source = await resolvePlayableMediaSource({
    mediaUrl: item.mediaUrl,
    youtubeVideoId: item.youtubeVideoId,
    title: item.title,
  });

  if (source.kind === "none") {
    return NextResponse.json({ error: "No playable media" }, { status: 404 });
  }

  return NextResponse.json(source, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
