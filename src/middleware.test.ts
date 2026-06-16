import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { proxy } from "./proxy";
import { NextRequest } from "next/server";

function makeRequest(options: {
  method?: string;
  path?: string;
  origin?: string | null;
  host?: string;
  forwardedProto?: string;
}) {
  const host = options.host ?? "feedy.local:3000";
  const url = `http://${host}${options.path ?? "/api/feeds"}`;
  const headers = new Headers();
  headers.set("host", host);
  if (options.origin !== undefined && options.origin !== null) {
    headers.set("origin", options.origin);
  }
  if (options.forwardedProto) {
    headers.set("x-forwarded-proto", options.forwardedProto);
  }
  return new NextRequest(url, { method: options.method ?? "POST", headers });
}

describe("CSRF middleware", () => {
  it("allows GET requests without Origin", () => {
    const request = makeRequest({ method: "GET", path: "/api/items" });
    const response = proxy(request);
    assert.equal(response.status, 200);
  });

  it("allows HEAD requests without Origin", () => {
    const request = makeRequest({ method: "HEAD", path: "/api/items" });
    const response = proxy(request);
    assert.equal(response.status, 200);
  });

  it("allows OPTIONS requests without Origin", () => {
    const request = makeRequest({ method: "OPTIONS", path: "/api/items" });
    const response = proxy(request);
    assert.equal(response.status, 200);
  });

  it("allows non-API routes without Origin", () => {
    const request = makeRequest({ method: "POST", path: "/app/unread" });
    const response = proxy(request);
    assert.equal(response.status, 200);
  });

  it("allows /api/health without Origin (exempt)", () => {
    const request = makeRequest({ method: "GET", path: "/api/health" });
    const response = proxy(request);
    assert.equal(response.status, 200);
  });

  it("rejects POST to API without Origin header", async () => {
    const request = makeRequest({ method: "POST", path: "/api/feeds" });
    const response = proxy(request);
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, "Missing Origin header");
  });

  it("rejects PATCH to API without Origin header", async () => {
    const request = makeRequest({ method: "PATCH", path: "/api/settings" });
    const response = proxy(request);
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, "Missing Origin header");
  });

  it("rejects DELETE to API without Origin header", async () => {
    const request = makeRequest({ method: "DELETE", path: "/api/feeds/abc123" });
    const response = proxy(request);
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, "Missing Origin header");
  });

  it("rejects POST with mismatched Origin", async () => {
    const request = makeRequest({
      method: "POST",
      path: "/api/auth/login",
      origin: "https://evil.com",
      host: "feedy.local:3000",
    });
    const response = proxy(request);
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, "CSRF check failed");
  });

  it("allows POST with matching Origin (same host, same port, http)", () => {
    const request = makeRequest({
      method: "POST",
      path: "/api/auth/login",
      origin: "http://feedy.local:3000",
      host: "feedy.local:3000",
    });
    const response = proxy(request);
    assert.equal(response.status, 200);
  });

  it("allows POST with matching Origin (via x-forwarded-proto)", () => {
    const request = makeRequest({
      method: "POST",
      path: "/api/feeds",
      origin: "https://feedy.example.com",
      host: "feedy.example.com",
      forwardedProto: "https",
    });
    const response = proxy(request);
    assert.equal(response.status, 200);
  });

  it("rejects when Origin port differs from host port", async () => {
    const request = makeRequest({
      method: "POST",
      path: "/api/feeds",
      origin: "http://feedy.local:4000",
      host: "feedy.local:3000",
    });
    const response = proxy(request);
    assert.equal(response.status, 403);
  });

  it("rejects when Origin hostname differs from host", async () => {
    const request = makeRequest({
      method: "POST",
      path: "/api/feeds",
      origin: "http://other.local:3000",
      host: "feedy.local:3000",
    });
    const response = proxy(request);
    assert.equal(response.status, 403);
  });

  it("allows POST to /api/refresh/all with valid Origin", () => {
    const request = makeRequest({
      method: "POST",
      path: "/api/refresh/all",
      origin: "http://feedy.local:3000",
      host: "feedy.local:3000",
    });
    const response = proxy(request);
    assert.equal(response.status, 200);
  });
});

describe("Security headers", () => {
  it("sets Content-Security-Policy on API responses", () => {
    const request = makeRequest({ method: "GET", path: "/api/items" });
    const response = proxy(request);
    const csp = response.headers.get("Content-Security-Policy");
    assert.ok(csp, "CSP header should be present");
    assert.ok(csp.includes("default-src 'self'"), "CSP should have default-src");
    assert.ok(csp.includes("frame-ancestors 'none'"), "CSP should block framing");
    assert.ok(csp.includes("form-action 'self'"), "CSP should restrict form actions");
    assert.ok(csp.includes("object-src 'none'"), "CSP should block plugins");
  });

  it("sets Content-Security-Policy on page responses", () => {
    const request = makeRequest({ method: "GET", path: "/app/unread" });
    const response = proxy(request);
    const csp = response.headers.get("Content-Security-Policy");
    assert.ok(csp, "CSP header should be present on page responses");
  });

  it("allows nonce-bearing framework bootstrap scripts in CSP", () => {
    const request = makeRequest({ method: "GET", path: "/app/unread" });
    const response = proxy(request);
    const csp = response.headers.get("Content-Security-Policy");
    const nonceMatch = csp?.match(/script-src 'self' 'nonce-([^']+)'/);

    assert.ok(nonceMatch, "CSP should include a script nonce");
    assert.ok(nonceMatch[1], "script nonce should not be empty");
  });

  it("passes the CSP nonce to Next.js through the request headers", () => {
    const request = makeRequest({ method: "GET", path: "/app/unread" });
    const response = proxy(request);
    const csp = response.headers.get("Content-Security-Policy");
    const nonce = csp?.match(/'nonce-([^']+)'/)?.[1];

    assert.ok(nonce, "CSP should include a nonce");
    assert.equal(response.headers.get("x-middleware-request-x-nonce"), nonce);
  });

  it("does not allow arbitrary inline scripts", () => {
    const request = makeRequest({ method: "GET", path: "/app/unread" });
    const response = proxy(request);
    const csp = response.headers.get("Content-Security-Policy");
    const scriptSrc = csp
      ?.split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith("script-src"));

    assert.ok(scriptSrc, "CSP should include script-src");
    assert.ok(!scriptSrc.includes("'unsafe-inline'"), "script-src should not allow arbitrary inline scripts");
  });

  it("allows YouTube iframe API and embeds in CSP", () => {
    const request = makeRequest({ method: "GET", path: "/api/items" });
    const response = proxy(request);
    const csp = response.headers.get("Content-Security-Policy");
    assert.ok(csp?.includes("script-src 'self'") && csp.includes("https://www.youtube.com"), "CSP should allow YouTube iframe API script");
    assert.ok(csp?.includes("frame-src https://www.youtube.com"), "CSP should allow YouTube embeds");
  });

  it("allows inline styles in CSP for reader content", () => {
    const request = makeRequest({ method: "GET", path: "/api/items" });
    const response = proxy(request);
    const csp = response.headers.get("Content-Security-Policy");
    assert.ok(csp?.includes("style-src 'self' 'unsafe-inline'"), "CSP should allow inline styles");
  });

  it("allows https images for feed thumbnails", () => {
    const request = makeRequest({ method: "GET", path: "/api/items" });
    const response = proxy(request);
    const csp = response.headers.get("Content-Security-Policy");
    assert.ok(csp?.includes("img-src 'self' data: blob: https:"), "CSP should allow external images");
  });

  it("sets X-Content-Type-Options", () => {
    const request = makeRequest({ method: "GET", path: "/api/items" });
    const response = proxy(request);
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  });

  it("sets X-Frame-Options", () => {
    const request = makeRequest({ method: "GET", path: "/api/items" });
    const response = proxy(request);
    assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  });

  it("sets Referrer-Policy", () => {
    const request = makeRequest({ method: "GET", path: "/api/items" });
    const response = proxy(request);
    assert.equal(response.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  });

  it("sets security headers on CSRF rejection responses", () => {
    const request = makeRequest({ method: "POST", path: "/api/feeds" });
    const response = proxy(request);
    assert.equal(response.status, 403);
    assert.ok(response.headers.get("Content-Security-Policy"));
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  });
});
