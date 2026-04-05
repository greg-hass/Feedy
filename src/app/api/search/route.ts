import { NextResponse } from "next/server";

import { apiError, assertApiUser, parseQuery } from "@/lib/api";
import { getFeedSearch } from "@/lib/data";
import { searchSchema } from "@/lib/schemas";

export async function GET(request: Request) {
  try {
    const user = await assertApiUser();
    const query = await parseQuery(new URL(request.url).searchParams, searchSchema);
    const results = await getFeedSearch(user.id, query.q);
    return NextResponse.json(results);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not search feeds");
  }
}
