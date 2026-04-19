import { NextResponse } from "next/server";

import { apiError, parseJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { loginSchema } from "@/lib/schemas";
import { createFixedWindowRateLimiter } from "@/lib/rate-limit";

const rateLimiter = createFixedWindowRateLimiter();

function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();
  return forwardedIp || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip") || "unknown";
}

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
    const loginAttempt = await rateLimiter.check(`login:${getRequestIp(request)}:${input.username.toLowerCase()}`, {
      limit: 5,
      windowSeconds: 15 * 60,
    });
    if (!loginAttempt.allowed) {
      if (contentType.includes("application/json")) {
        const response = apiError("Too many login attempts", 429);
        response.headers.set("Retry-After", String(loginAttempt.retryAfterSeconds));
        return response;
      }

      const response = NextResponse.redirect(new URL("/login?error=rate_limited", requestOrigin(request)), {
        status: 303,
      });
      response.headers.set("Retry-After", String(loginAttempt.retryAfterSeconds));
      return response;
    }
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
