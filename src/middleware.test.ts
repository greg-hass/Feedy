import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { middleware } from "./middleware";
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
    const response = middleware(request);
    assert.equal(response.status, 200);
  });

  it("allows HEAD requests without Origin", () => {
    const request = makeRequest({ method: "HEAD", path: "/api/items" });
    const response = middleware(request);
    assert.equal(response.status, 200);
  });

  it("allows OPTIONS requests without Origin", () => {
    const request = makeRequest({ method: "OPTIONS", path: "/api/items" });
    const response = middleware(request);
    assert.equal(response.status, 200);
  });

  it("allows non-API routes without Origin", () => {
    const request = makeRequest({ method: "POST", path: "/app/unread" });
    const response = middleware(request);
    assert.equal(response.status, 200);
  });

  it("allows /api/health without Origin (exempt)", () => {
    const request = makeRequest({ method: "GET", path: "/api/health" });
    const response = middleware(request);
    assert.equal(response.status, 200);
  });

  it("rejects POST to API without Origin header", async () => {
    const request = makeRequest({ method: "POST", path: "/api/feeds" });
    const response = middleware(request);
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, "Missing Origin header");
  });

  it("rejects PATCH to API without Origin header", async () => {
    const request = makeRequest({ method: "PATCH", path: "/api/settings" });
    const response = middleware(request);
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, "Missing Origin header");
  });

  it("rejects DELETE to API without Origin header", async () => {
    const request = makeRequest({ method: "DELETE", path: "/api/feeds/abc123" });
    const response = middleware(request);
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
    const response = middleware(request);
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
    const response = middleware(request);
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
    const response = middleware(request);
    assert.equal(response.status, 200);
  });

  it("rejects when Origin port differs from host port", async () => {
    const request = makeRequest({
      method: "POST",
      path: "/api/feeds",
      origin: "http://feedy.local:4000",
      host: "feedy.local:3000",
    });
    const response = middleware(request);
    assert.equal(response.status, 403);
  });

  it("rejects when Origin hostname differs from host", async () => {
    const request = makeRequest({
      method: "POST",
      path: "/api/feeds",
      origin: "http://other.local:3000",
      host: "feedy.local:3000",
    });
    const response = middleware(request);
    assert.equal(response.status, 403);
  });

  it("allows POST to /api/refresh/all with valid Origin", () => {
    const request = makeRequest({
      method: "POST",
      path: "/api/refresh/all",
      origin: "http://feedy.local:3000",
      host: "feedy.local:3000",
    });
    const response = middleware(request);
    assert.equal(response.status, 200);
  });
});
