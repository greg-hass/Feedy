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

export function proxy(request: NextRequest) {
	const nonce = crypto.randomUUID();
	const response = handleRequest(request, nonce);

	// Add security headers to all responses
	if (response instanceof NextResponse) {
		addSecurityHeaders(response, nonce);
	}

	return response;
}

function nextResponseWithNonce(request: NextRequest, nonce: string) {
	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-nonce", nonce);
	return NextResponse.next({
		request: {
			headers: requestHeaders,
		},
	});
}

function handleRequest(request: NextRequest, nonce: string) {
	// Only protect API routes with mutating methods
	if (!request.nextUrl.pathname.startsWith("/api/")) {
		return nextResponseWithNonce(request, nonce);
	}

	if (SAFE_METHODS.has(request.method)) {
		return nextResponseWithNonce(request, nonce);
	}

	if (EXEMPT_PATHS.has(request.nextUrl.pathname)) {
		return nextResponseWithNonce(request, nonce);
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
		return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
	}

	return nextResponseWithNonce(request, nonce);
}

export const config = {
	matcher: [
		"/api/:path*",
		"/((?!_next/static|_next/image|favicon.ico|icons).*)",
	],
};

/**
 * Add security headers to all responses.
 *
 * CSP rationale:
 * - default-src 'self' — block everything by default
 * - script-src 'self' 'nonce-{request nonce}' https://www.youtube.com — bundled JS, Next.js bootstrap scripts, and YouTube iframe API
 * - style-src 'self' 'unsafe-inline' — Tailwind + feed reader HTML needs inline styles
 * - img-src 'self' data: blob: https: — feed images, favicons, PWA icons, YouTube thumbnails
 * - font-src 'self' — bundled fonts only
 * - connect-src 'self' — API calls from same origin only
 * - frame-src https://www.youtube.com — YouTube embeds in reader and inline playback
 * - media-src blob: — inline video/audio from feed content
 * - object-src 'none' — no Flash/Java/plugins
 * - frame-ancestors 'none' — prevent clickjacking (our app is not embeddable)
 * - base-uri 'self' — prevent base tag injection
 * - form-action 'self' — login form posts to our own API only
 */
function getContentSecurityPolicy(nonce: string) {
	return [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}' https://www.youtube.com`,
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob: https:",
		"font-src 'self'",
		"connect-src 'self'",
		"frame-src https://www.youtube.com",
		"media-src blob:",
		"object-src 'none'",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	].join("; ");
}

function addSecurityHeaders(response: NextResponse, nonce: string) {
	response.headers.set(
		"Content-Security-Policy",
		getContentSecurityPolicy(nonce),
	);
	response.headers.set("X-Content-Type-Options", "nosniff");
	response.headers.set("X-Frame-Options", "DENY");
	response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
}
