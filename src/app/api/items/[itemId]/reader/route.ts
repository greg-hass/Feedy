import { NextResponse } from "next/server";

import { apiError, assertApiUser } from "@/lib/api";
import { getReaderItem } from "@/lib/data";
import { ensureReaderContent } from "@/lib/feed/service";
import { serializeItem } from "@/lib/serializers";

type Params = Promise<{ itemId: string }>;

export async function GET(_request: Request, context: { params: Params }) {
  try {
    const user = await assertApiUser();
    const { itemId } = await context.params;
    await ensureReaderContent(itemId);
    const item = await getReaderItem(user.id, itemId);
    if (!item) {
      return apiError("Item not found", 404);
    }
    return NextResponse.json(serializeItem(item));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not load reader");
  }
}
