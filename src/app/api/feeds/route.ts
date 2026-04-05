import { NextResponse } from "next/server";

import { apiError, assertApiUser, parseJson } from "@/lib/api";
import { getNavigationData } from "@/lib/data";
import { createFeedForUser } from "@/lib/feed/service";
import { feedSchema } from "@/lib/schemas";

export async function GET() {
  try {
    const user = await assertApiUser();
    const navigation = await getNavigationData(user.id);
    return NextResponse.json(navigation.feeds);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Unauthorized", 401);
  }
}

export async function POST(request: Request) {
  try {
    const user = await assertApiUser();
    const input = await parseJson(request, feedSchema);
    const feed = await createFeedForUser(user.id, input);
    return NextResponse.json(feed);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not create feed");
  }
}
