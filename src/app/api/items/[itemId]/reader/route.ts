import { NextResponse } from "next/server";

import { apiError, assertApiUser } from "@/lib/api";
import { getReaderItem } from "@/lib/data";
import { ensureReaderContentForLoadedItem } from "@/lib/feed/service";
import { measurePerf } from "@/lib/perf";
import { serializeItem } from "@/lib/serializers";

type Params = Promise<{ itemId: string }>;

export async function GET(_request: Request, context: { params: Params }) {
  try {
    const user = await assertApiUser();
    const { itemId } = await context.params;
    let item = await measurePerf(
      "api.reader.load",
      () => getReaderItem(user.id, itemId),
      { userId: user.id, itemId },
    );
    if (!item) {
      return apiError("Item not found", 404);
    }
    const loadedItem = item;

    if (loadedItem.canonicalUrl && !loadedItem.readabilityHtml) {
      const updated = await measurePerf(
        "api.reader.ensureContent",
        () => ensureReaderContentForLoadedItem(loadedItem),
        { userId: user.id, itemId },
      );
      if (updated) {
        item = {
          ...loadedItem,
          ...updated,
        };
      }
    }
    return NextResponse.json(serializeItem(item));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not load reader");
  }
}
