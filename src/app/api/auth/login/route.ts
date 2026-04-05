import { NextResponse } from "next/server";

import { apiError, parseJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { loginSchema } from "@/lib/schemas";

function requestOrigin(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
  const protocol = forwardedProto || new URL(request.url).protocol.replace(":", "") || "http";
  return `${protocol}://${host}`;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const input = contentType.includes("application/json")
      ? await parseJson(request, loginSchema)
      : loginSchema.parse(
          Object.fromEntries((await request.formData()).entries()),
        );
    const user = await authenticate(input.username, input.password);
    if (!user) {
      if (contentType.includes("application/json")) {
        return apiError("Invalid credentials", 401);
      }

      return NextResponse.redirect(new URL("/login?error=invalid", requestOrigin(request)), {
        status: 303,
      });
    }

    if (contentType.includes("application/json")) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.redirect(new URL("/app/unread", requestOrigin(request)), {
      status: 303,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    if ((request.headers.get("content-type") || "").includes("application/json")) {
      return apiError(message);
    }

    return NextResponse.redirect(new URL("/login?error=failed", requestOrigin(request)), {
      status: 303,
    });
  }
}
