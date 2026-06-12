import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchWithTimeout } from "@/lib/http";

describe("fetchWithTimeout", () => {
  it("rejects private destinations before calling fetch", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("fetch should not be reached");
    }) as typeof fetch;

    try {
      await assert.rejects(
        fetchWithTimeout("http://127.0.0.1:5432/private", {}, 2000),
        /not allowed|private IP addresses|local hostnames/i,
      );
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not deadlock concurrent same-host redirects", async () => {
    const originalFetch = globalThis.fetch;
    const completedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/initial/")) {
        return new Response(null, {
          status: 302,
          headers: { location: url.replace("/initial/", "/resolved/") },
        });
      }

      completedUrls.push(url);
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    try {
      const redirectRequests = Array.from({ length: 20 }, (_, index) =>
        fetchWithTimeout(`https://8.8.8.8/initial/${index}`, {}, 1_000),
      );
      const responses = await Promise.race([
        Promise.all(redirectRequests),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("same-host redirects deadlocked")), 500);
        }),
      ]);

      assert.equal(responses.length, 20);
      assert.equal(completedUrls.length, 20);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("backs off a host after a rate-limit response", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount++;
      return new Response("rate limited", {
        status: 429,
        headers: { "x-ratelimit-reset": "30" },
      });
    }) as typeof fetch;

    try {
      const url = "https://8.8.4.4/rate-limited-feed";
      const first = await fetchWithTimeout(url, {}, 1_000);
      assert.equal(first.status, 429);

      await assert.rejects(
        fetchWithTimeout(url, {}, 1_000),
        /rate limited; retry after/i,
      );
      assert.equal(fetchCount, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
