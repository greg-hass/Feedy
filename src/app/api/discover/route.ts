import { NextResponse } from "next/server";

import { apiError, assertApiUser, parseQuery } from "@/lib/api";
import { discoverFeeds } from "@/lib/feed/discover";
import { searchSchema } from "@/lib/schemas";

export async function GET(request: Request) {
  try {
    await assertApiUser();
    const query = await parseQuery(new URL(request.url).searchParams, searchSchema);
    const results = await discoverFeeds(query.q);
    return NextResponse.json(results);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not discover feeds");
  }
}
