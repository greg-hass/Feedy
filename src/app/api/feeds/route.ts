import { NextResponse } from "next/server";

import { apiErrorFrom, assertApiUser, parseJson } from "@/lib/api";
import { getNavigationData } from "@/lib/navigation-data";
import { createFeedForUser } from "@/lib/feed/service";
import { feedSchema } from "@/lib/schemas";

export async function GET() {
  try {
    const user = await assertApiUser();
    const navigation = await getNavigationData(user.id);
    return NextResponse.json(navigation.feeds);
  } catch (error) {
    return apiErrorFrom(error, "Unauthorized");
  }
}

export async function POST(request: Request) {
  try {
    const user = await assertApiUser();
    const input = await parseJson(request, feedSchema);
    const feed = await createFeedForUser(user.id, input);
    return NextResponse.json(feed);
  } catch (error) {
    return apiErrorFrom(error, "Could not create feed");
  }
}
