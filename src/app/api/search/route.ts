import { NextResponse } from "next/server";

import { apiErrorFrom, assertApiUser, parseQuery } from "@/lib/api";
import { getFeedSearch } from "@/lib/data";
import { measurePerf } from "@/lib/perf";
import { searchSchema } from "@/lib/schemas";

export async function GET(request: Request) {
  try {
    const user = await assertApiUser();
    const query = await parseQuery(new URL(request.url).searchParams, searchSchema);
    const results = await measurePerf(
      "api.search",
      () => getFeedSearch(user.id, query.q, query.sourceFilter),
      {
        userId: user.id,
        qLength: query.q.length,
        sourceFilter: query.sourceFilter ?? "ALL",
      },
    );
    return NextResponse.json(results);
  } catch (error) {
    return apiErrorFrom(error, "Could not search feeds");
  }
}
