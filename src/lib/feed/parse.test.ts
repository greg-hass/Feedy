import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { FeedSourceType } from "@prisma/client";
import { fetchAndParseFeedConditionally, validateFeedUrl } from "@/lib/feed/parse";
import { __setOutboundFetch } from "@/lib/http";

afterEach(() => {
  __setOutboundFetch(undefined);
});

function mockFetch(handler: (input: RequestInfo | URL | string, init?: RequestInit) => Response | Promise<Response>) {
  __setOutboundFetch(handler as (url: string | URL, init?: RequestInit) => Promise<Response>);
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

  it("prefers an embedded high-resolution Reddit preview over its small thumbnail", async () => {
    const reddit = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>newest submissions : ProductivityApps</title>
  <entry>
    <id>t3_preview</id>
    <title>Image post</title>
    <link href="https://www.reddit.com/r/ProductivityApps/comments/preview/image_post/" />
    <content type="html">&lt;p&gt;&lt;a href=&quot;https://preview.redd.it/image.jpg?width=1080&amp;amp;format=pjpg&amp;amp;auto=webp&quot;&gt;large image&lt;/a&gt;&lt;/p&gt;</content>
    <media:thumbnail url="https://preview.redd.it/image.jpg?width=140&amp;height=140&amp;crop=1:1,smart&amp;auto=webp" />
    <published>2026-05-25T11:10:45+00:00</published>
  </entry>
</feed>`;

    mockFetch(() => new Response(reddit, { status: 200 }));

    const result = await fetchAndParseFeedConditionally(
      "https://www.reddit.com/r/ProductivityApps/new/.rss",
      "reddit-feed",
    );

    assert.equal(result.notModified, false);
    if (result.notModified) {
      throw new Error("Expected parsed Reddit feed");
    }

    assert.equal(
      result.items[0]?.mediaUrl,
      "https://preview.redd.it/image.jpg?width=1080&format=pjpg&auto=webp",
    );
  });

  it("removes a Reddit body image when the same image is promoted to mediaUrl", async () => {
    const reddit = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>newest submissions : CachyOS</title>
  <entry>
    <id>t3_duplicate</id>
    <title>Cachy Logo</title>
    <link href="https://www.reddit.com/r/CachyOS/comments/duplicate/cachy_logo/" />
    <content type="html">&lt;table&gt;&lt;tr&gt;&lt;td&gt;&lt;a href=&quot;https://preview.redd.it/cachy.png?width=1080&amp;amp;format=png&amp;amp;auto=webp&quot;&gt;&lt;img src=&quot;https://preview.redd.it/cachy.png?width=640&amp;amp;crop=smart&amp;amp;auto=webp&quot; /&gt;&lt;/a&gt;&lt;/td&gt;&lt;td&gt;Been playing around with the CachyOS logo.&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</content>
    <media:thumbnail url="https://preview.redd.it/cachy.png?width=140&amp;height=78&amp;crop=smart&amp;auto=webp" />
    <published>2026-06-02T18:30:00+00:00</published>
  </entry>
</feed>`;

    mockFetch(() => new Response(reddit, { status: 200 }));

    const result = await fetchAndParseFeedConditionally(
      "https://www.reddit.com/r/CachyOS/new/.rss",
      "reddit-feed",
    );

    assert.equal(result.notModified, false);
    if (result.notModified) {
      throw new Error("Expected parsed Reddit feed");
    }

    assert.equal(
      result.items[0]?.mediaUrl,
      "https://preview.redd.it/cachy.png?width=1080&format=png&auto=webp",
    );
    assert.equal(result.items[0]?.contentHtml?.includes("<img"), false);
    assert.match(result.items[0]?.contentHtml ?? "", /Been playing around with the CachyOS logo\./);
  });

  it("removes Reddit body thumbnails when a different Reddit preview is promoted to mediaUrl", async () => {
    const reddit = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>newest submissions : SelfHosted</title>
  <entry>
    <id>t3_thumbnail_duplicate</id>
    <title>File manager</title>
    <link href="https://www.reddit.com/r/selfhosted/comments/thumb/file_manager/" />
    <content type="html">&lt;p&gt;&lt;a href=&quot;https://preview.redd.it/header.png?width=1080&amp;amp;format=png&amp;amp;auto=webp&quot;&gt;header&lt;/a&gt;&lt;/p&gt;&lt;p&gt;I kept wanting something lighter.&lt;/p&gt;&lt;p&gt;&lt;a href=&quot;https://external-preview.redd.it/thumb.jpg?width=140&amp;amp;height=78&amp;amp;auto=webp&quot;&gt;&lt;img src=&quot;https://external-preview.redd.it/thumb.jpg?width=140&amp;amp;height=78&amp;amp;auto=webp&quot; /&gt;&lt;/a&gt;&lt;/p&gt;</content>
    <media:thumbnail url="https://external-preview.redd.it/thumb.jpg?width=140&amp;height=78&amp;auto=webp" />
    <published>2026-06-02T18:45:00+00:00</published>
  </entry>
</feed>`;

    mockFetch(() => new Response(reddit, { status: 200 }));

    const result = await fetchAndParseFeedConditionally(
      "https://www.reddit.com/r/selfhosted/new/.rss",
      "reddit-feed",
    );

    assert.equal(result.notModified, false);
    if (result.notModified) {
      throw new Error("Expected parsed Reddit feed");
    }

    assert.equal(
      result.items[0]?.mediaUrl,
      "https://preview.redd.it/header.png?width=1080&format=png&auto=webp",
    );
    assert.equal(result.items[0]?.contentHtml?.includes("<img"), false);
    assert.equal(result.items[0]?.contentHtml?.includes("external-preview.redd.it"), false);
    assert.match(result.items[0]?.contentHtml ?? "", /I kept wanting something lighter\./);
  });

  it("retains Reddit's small thumbnail when no larger preview is embedded", async () => {
    const reddit = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>newest submissions : ProductivityApps</title>
  <entry>
    <id>t3_thumbnail</id>
    <title>Thumbnail post</title>
    <link href="https://www.reddit.com/r/ProductivityApps/comments/thumbnail/post/" />
    <content type="html">&lt;p&gt;No large media link here.&lt;/p&gt;</content>
    <media:thumbnail url="https://preview.redd.it/thumb.png?width=140&amp;height=86&amp;auto=webp" />
    <published>2026-05-25T07:13:43+00:00</published>
  </entry>
</feed>`;

    mockFetch(() => new Response(reddit, { status: 200 }));

    const result = await fetchAndParseFeedConditionally(
      "https://www.reddit.com/r/ProductivityApps/new/.rss",
      "reddit-feed",
    );

    assert.equal(result.notModified, false);
    if (result.notModified) {
      throw new Error("Expected parsed Reddit feed");
    }

    assert.equal(
      result.items[0]?.mediaUrl,
      "https://preview.redd.it/thumb.png?width=140&height=86&auto=webp",
    );
  });

  it("uses an external Reddit link post URL as the canonical reader URL", async () => {
    const reddit = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>newest submissions : Technology</title>
  <entry>
    <id>t3_external_link</id>
    <title>Interesting article</title>
    <link href="https://www.reddit.com/r/technology/comments/external/interesting_article/" />
    <content type="html">&lt;span&gt;&lt;a href=&quot;https://example.com/articles/interesting?utm_source=reddit&quot;&gt;Article link&lt;/a&gt;&lt;/span&gt;&lt;p&gt;submitted by &lt;a href=&quot;https://www.reddit.com/user/alice&quot;&gt;/u/alice&lt;/a&gt;&lt;/p&gt;</content>
    <published>2026-06-02T18:45:00+00:00</published>
  </entry>
</feed>`;

    mockFetch(() => new Response(reddit, { status: 200 }));

    const result = await fetchAndParseFeedConditionally(
      "https://www.reddit.com/r/technology/new/.rss",
      "reddit-feed",
    );

    assert.equal(result.notModified, false);
    if (result.notModified) {
      throw new Error("Expected parsed Reddit feed");
    }

    assert.equal(result.items[0]?.canonicalUrl, "https://example.com/articles/interesting?utm_source=reddit");
    assert.equal(
      result.items[0]?.redditPermalink,
      "https://www.reddit.com/r/technology/comments/external/interesting_article/",
    );
  });
});
