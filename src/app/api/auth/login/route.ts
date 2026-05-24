import { NextResponse } from "next/server";

import { apiError, parseJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { loginSchema } from "@/lib/schemas";
import { createFixedWindowRateLimiter } from "@/lib/rate-limit";

const rateLimiter = createFixedWindowRateLimiter();

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const input = contentType.includes("application/json")
      ? await parseJson(request, loginSchema)
      : loginSchema.parse(
          Object.fromEntries((await request.formData()).entries()),
        );
    const normalizedUsername = input.username.trim().toLowerCase();
    const [userAttempt, globalAttempt] = await Promise.all([
      rateLimiter.check(`login:user:${normalizedUsername}`, {
        limit: 5,
        windowSeconds: 15 * 60,
      }),
      rateLimiter.check("login:global", {
        limit: 15,
        windowSeconds: 15 * 60,
      }),
    ]);
    if (!userAttempt.allowed || !globalAttempt.allowed) {
      const retryAfterSeconds = Math.max(userAttempt.retryAfterSeconds, globalAttempt.retryAfterSeconds);
      if (contentType.includes("application/json")) {
        const response = apiError("Too many login attempts", 429);
        response.headers.set("Retry-After", String(retryAfterSeconds));
        return response;
      }

      const response = NextResponse.redirect(new URL("/login?error=rate_limited", request.url), {
        status: 303,
      });
      response.headers.set("Retry-After", String(retryAfterSeconds));
      return response;
    }
    const user = await authenticate(input.username, input.password);
    if (!user) {
      if (contentType.includes("application/json")) {
        return apiError("Invalid credentials", 401);
      }

      return NextResponse.redirect(new URL("/login?error=invalid", request.url), {
        status: 303,
      });
    }

    if (contentType.includes("application/json")) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.redirect(new URL("/app/unread", request.url), {
      status: 303,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    if ((request.headers.get("content-type") || "").includes("application/json")) {
      return apiError(message);
    }

    return NextResponse.redirect(new URL("/login?error=failed", request.url), {
      status: 303,
    });
  }
}
