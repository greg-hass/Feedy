import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	__setOutboundFetch,
	buildRedditRssProxyUrl,
	fetchWithTimeout,
} from "@/lib/http";

describe("buildRedditRssProxyUrl", () => {
	it("adds the target Reddit URL as a url query parameter", () => {
		const proxied = buildRedditRssProxyUrl(
			"https://reddit-rss-proxy.example.workers.dev/fetch?token=abc",
			"https://www.reddit.com/r/selfhosted/.rss?sort=new",
		);

		assert.equal(
			proxied.origin,
			"https://reddit-rss-proxy.example.workers.dev",
		);
		assert.equal(proxied.pathname, "/fetch");
		assert.equal(proxied.searchParams.get("token"), "abc");
		assert.equal(
			proxied.searchParams.get("url"),
			"https://www.reddit.com/r/selfhosted/.rss?sort=new",
		);
	});
});

describe("fetchWithTimeout", () => {
	it("rejects private destinations before calling fetch", async () => {
		let fetchCalled = false;
		__setOutboundFetch(async () => {
			fetchCalled = true;
			throw new Error("fetch should not be reached");
		});

		try {
			await assert.rejects(
				fetchWithTimeout("http://127.0.0.1:5432/private", {}, 2000),
				/not allowed|private IP addresses|local hostnames/i,
			);
			assert.equal(fetchCalled, false);
		} finally {
			__setOutboundFetch(undefined);
		}
	});

	it("does not deadlock concurrent same-host redirects", async () => {
		const completedUrls: string[] = [];
		__setOutboundFetch(async (url: string | URL) => {
			const urlStr = url instanceof URL ? url.href : url;
			if (urlStr.includes("/initial/")) {
				return new Response(null, {
					status: 302,
					headers: { location: urlStr.replace("/initial/", "/resolved/") },
				});
			}

			completedUrls.push(urlStr);
			return new Response("ok", { status: 200 });
		});

		try {
			const redirectRequests = Array.from({ length: 20 }, (_, index) =>
				fetchWithTimeout(`https://8.8.8.8/initial/${index}`, {}, 1_000),
			);
			const responses = await Promise.race([
				Promise.all(redirectRequests),
				new Promise<never>((_resolve, reject) => {
					setTimeout(
						() => reject(new Error("same-host redirects deadlocked")),
						500,
					);
				}),
			]);

			assert.equal(responses.length, 20);
			assert.equal(completedUrls.length, 20);
		} finally {
			__setOutboundFetch(undefined);
		}
	});

	it("backs off a host after a rate-limit response", async () => {
		let fetchCount = 0;
		__setOutboundFetch(async () => {
			fetchCount++;
			// First fetch returns 429 with a short retry; subsequent fetches succeed
			if (fetchCount === 1) {
				return new Response("rate limited", {
					status: 429,
					headers: { "retry-after": "1" },
				});
			}
			return new Response("ok", { status: 200 });
		});

		try {
			const url = "https://8.8.4.4/rate-limited-feed";
			const first = await fetchWithTimeout(url, {}, 1_000);
			assert.equal(first.status, 429);

			// Second call should wait for the cooldown (1s) then fetch and succeed
			const second = await fetchWithTimeout(url, {}, 5_000);
			assert.equal(second.status, 200);
			assert.equal(fetchCount, 2);
		} finally {
			__setOutboundFetch(undefined);
		}
	});
});
