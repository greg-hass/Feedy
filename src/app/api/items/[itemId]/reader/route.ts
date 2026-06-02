import { NextResponse } from "next/server";

import { apiError, apiErrorFrom, assertApiUser } from "@/lib/api";
import { getReaderItem } from "@/lib/data";
import { ensureReaderContentForLoadedItem } from "@/lib/feed/service";
import { measurePerf } from "@/lib/perf";
import { shouldFetchReadableContent } from "@/lib/reader-content";
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

    if (shouldFetchReadableContent(loadedItem)) {
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
    return apiErrorFrom(error, "Could not load reader");
  }
}
