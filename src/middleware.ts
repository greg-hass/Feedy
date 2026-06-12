import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF protection via Origin header validation.
 *
 * Browsers automatically send the `Origin` header on:
 * - All cross-origin requests
 * - Same-origin POST/PATCH/DELETE/PUT requests (form submissions and fetch)
 *
 * A malicious site cannot spoof the Origin header in a browser context.
 * If Origin is missing (rare but possible in older HTTP clients), we reject
 * the request unless it's a safe method (GET, HEAD, OPTIONS).
 *
 * Exempt paths:
 * - /api/health — unauthenticated, read-only, no session cookie dependency
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT_PATHS = new Set(["/api/health"]);

function getAppOrigin(request: NextRequest): string | null {
  const host = request.headers.get("host");
  if (!host) return null;

  // Prefer the forwarded proto header (set by reverse proxies like Caddy/Nginx)
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return `${forwardedProto}://${host}`;
  }

  // Fall back to the request URL protocol (http in dev, or behind a proxy
  // that doesn't set x-forwarded-proto)
  try {
    const protocol = new URL(request.url).protocol;
    return `${protocol}//${host}`;
  } catch {
    return null;
  }
}

function originMatches(origin: string, allowedOrigin: string): boolean {
  try {
    const originUrl = new URL(origin);
    const allowedUrl = new URL(allowedOrigin);
    return originUrl.origin === allowedUrl.origin;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  // Only protect API routes with mutating methods
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (SAFE_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  if (EXEMPT_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");

  // No Origin header — reject. Modern browsers always send Origin on
  // mutating requests. Non-browser clients (curl, scripts) can set it
  // explicitly.
  if (!origin) {
    return NextResponse.json(
      { error: "Missing Origin header" },
      { status: 403 },
    );
  }

  const appOrigin = getAppOrigin(request);
  if (!appOrigin) {
    return NextResponse.json(
      { error: "Could not determine application origin" },
      { status: 403 },
    );
  }

  if (!originMatches(origin, appOrigin)) {
    return NextResponse.json(
      { error: "CSRF check failed" },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
