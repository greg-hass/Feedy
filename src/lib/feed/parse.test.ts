import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { FeedSourceType } from "@prisma/client";
import { fetchAndParseFeedConditionally, validateFeedUrl } from "@/lib/feed/parse";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = handler as typeof fetch;
}

describe("feed parsing", () => {
  it("validates RSS metadata from the final response URL", async () => {
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example &amp; Friends</title>
    <description>Useful updates</description>
    <link>https://example.com</link>
    <image><url>https://example.com/icon.png</url></image>
  </channel>
</rss>`;

    mockFetch(() =>
      new Response(rss, {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      }),
    );

    const feed = await validateFeedUrl("https://example.com/feed");

    assert.deepEqual(feed, {
      title: "Example & Friends",
      description: "Useful updates",
      siteUrl: "https://example.com",
      feedUrl: "https://example.com/feed",
      iconUrl: "https://example.com/icon.png",
      sourceType: FeedSourceType.RSS,
    });
  });

  it("parses RSS items with sanitized content and stable unique keys", async () => {
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <link>https://example.com</link>
    <item>
      <guid>post-1</guid>
      <title>First &amp; Best</title>
      <link>https://example.com/post-1</link>
      <description>Short &amp; sweet</description>
      <content:encoded><![CDATA[<p>Hello <script>alert(1)</script><a href="https://example.com/read" onclick="alert(2)">read</a></p>]]></content:encoded>
      <author>Ada Lovelace</author>
      <pubDate>Mon, 13 May 2026 10:30:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

    mockFetch(() =>
      new Response(rss, {
        status: 200,
        headers: {
          etag: '"rss-v1"',
          "last-modified": "Mon, 13 May 2026 10:40:00 GMT",
        },
      }),
    );

    const result = await fetchAndParseFeedConditionally("https://example.com/feed.xml", "feed-1");

    assert.equal(result.notModified, false);
    if (result.notModified) {
      throw new Error("Expected parsed feed");
    }

    assert.equal(result.etag, '"rss-v1"');
    assert.equal(result.lastModified, "Mon, 13 May 2026 10:40:00 GMT");
    assert.equal(result.feed.sourceType, FeedSourceType.RSS);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.title, "First & Best");
    assert.equal(result.items[0]?.summary, "Short & sweet");
    assert.equal(result.items[0]?.canonicalUrl, "https://example.com/post-1");
    assert.equal(result.items[0]?.author, "Ada Lovelace");
    assert.equal(result.items[0]?.publishedAt?.toISOString(), "2026-05-13T10:30:00.000Z");
    assert.equal(result.items[0]?.contentHtml?.includes("<script>"), false);
    assert.match(result.items[0]?.contentHtml ?? "", /rel="noopener noreferrer"/);
  });

  it("detects Atom feeds and preserves conditional request headers", async () => {
    const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Updates</title>
  <link href="https://example.org/" />
  <entry>
    <id>tag:example.org,2026:entry-1</id>
    <title>Atom item</title>
    <link href="https://example.org/entry-1" />
    <updated>2026-05-14T09:00:00Z</updated>
  </entry>
</feed>`;
    const seenHeaders: Headers[] = [];

    mockFetch((_input, init) => {
      seenHeaders.push(new Headers(init?.headers));
      return new Response(atom, { status: 200 });
    });

    const result = await fetchAndParseFeedConditionally("https://example.org/atom.xml", "feed-2", {
      etag: '"old"',
      lastModified: "Thu, 14 May 2026 08:00:00 GMT",
    });

    assert.equal(seenHeaders[0]?.get("if-none-match"), '"old"');
    assert.equal(seenHeaders[0]?.get("if-modified-since"), "Thu, 14 May 2026 08:00:00 GMT");
    assert.equal(result.notModified, false);
    if (result.notModified) {
      throw new Error("Expected parsed feed");
    }

    assert.equal(result.feed.sourceType, FeedSourceType.ATOM);
    assert.equal(result.items[0]?.externalId, "tag:example.org,2026:entry-1");
    assert.equal(result.items[0]?.canonicalUrl, "https://example.org/entry-1");
  });

  it("returns a not-modified result for 304 responses", async () => {
    mockFetch(() =>
      new Response(null, {
        status: 304,
        headers: { etag: '"current"' },
      }),
    );

    const result = await fetchAndParseFeedConditionally("https://example.com/feed.xml", "feed-3", {
      etag: '"previous"',
      lastModified: "Thu, 14 May 2026 08:00:00 GMT",
    });

    assert.deepEqual(result, {
      notModified: true,
      etag: '"current"',
      lastModified: "Thu, 14 May 2026 08:00:00 GMT",
    });
  });
});
