import { NextResponse } from "next/server";

import { apiError, parseJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { loginSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, loginSchema);
    const user = await authenticate(input.username, input.password);
    if (!user) {
      return apiError("Invalid credentials", 401);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Login failed");
  }
}
