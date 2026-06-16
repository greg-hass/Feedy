import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRedditRssProxyUrl, fetchWithTimeout } from "@/lib/http";

describe("buildRedditRssProxyUrl", () => {
  it("adds the target Reddit URL as a url query parameter", () => {
    const proxied = buildRedditRssProxyUrl(
      "https://reddit-rss-proxy.example.workers.dev/fetch?token=abc",
      "https://www.reddit.com/r/selfhosted/.rss?sort=new",
    );

    assert.equal(proxied.origin, "https://reddit-rss-proxy.example.workers.dev");
    assert.equal(proxied.pathname, "/fetch");
    assert.equal(proxied.searchParams.get("token"), "abc");
    assert.equal(proxied.searchParams.get("url"), "https://www.reddit.com/r/selfhosted/.rss?sort=new");
  });
});

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
      // First fetch returns 429 with a short retry; subsequent fetches succeed
      if (fetchCount === 1) {
        return new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "1" },
        });
      }
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    try {
      const url = "https://8.8.4.4/rate-limited-feed";
      const first = await fetchWithTimeout(url, {}, 1_000);
      assert.equal(first.status, 429);

      // Second call should wait for the cooldown (1s) then fetch and succeed
      const second = await fetchWithTimeout(url, {}, 5_000);
      assert.equal(second.status, 200);
      assert.equal(fetchCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
