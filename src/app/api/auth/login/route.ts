import { NextResponse } from "next/server";

import { apiError, parseJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { checkLoginThrottle } from "@/lib/login-throttle";
import { env } from "@/lib/env";
import { loginSchema } from "@/lib/schemas";
import { createFixedWindowRateLimiter } from "@/lib/rate-limit";

const rateLimiter = createFixedWindowRateLimiter();

function appRedirect(path: string) {
  return new URL(path, env.APP_URL);
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const input = contentType.includes("application/json")
      ? await parseJson(request, loginSchema)
      : loginSchema.parse(
          Object.fromEntries((await request.formData()).entries()),
        );
    const normalizedUsername = input.username.trim().toLowerCase();
    const attempt = await checkLoginThrottle(rateLimiter, normalizedUsername);
    if (!attempt.allowed) {
      if (contentType.includes("application/json")) {
        const response = apiError("Too many login attempts", 429);
        response.headers.set("Retry-After", String(attempt.retryAfterSeconds));
        return response;
      }

      const response = NextResponse.redirect(appRedirect("/login?error=rate_limited"), {
        status: 303,
      });
      response.headers.set("Retry-After", String(attempt.retryAfterSeconds));
      return response;
    }
    const user = await authenticate(input.username, input.password);
    if (!user) {
      if (contentType.includes("application/json")) {
        return apiError("Invalid credentials", 401);
      }

      return NextResponse.redirect(appRedirect("/login?error=invalid"), {
        status: 303,
      });
    }

    if (contentType.includes("application/json")) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.redirect(appRedirect("/app/unread"), {
      status: 303,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    if ((request.headers.get("content-type") || "").includes("application/json")) {
      return apiError(message);
    }

    return NextResponse.redirect(appRedirect("/login?error=failed"), {
      status: 303,
    });
  }
}
