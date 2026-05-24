import { NextResponse } from "next/server";

import { checkReadiness } from "@/lib/health";

export async function GET() {
  const result = await checkReadiness();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
