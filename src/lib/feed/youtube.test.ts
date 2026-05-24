import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  fetchYouTubeFeedConditionally,
  probeYouTubeShort,
  parseYouTubeFeedTarget,
} from "@/lib/feed/youtube";
import { resolveYouTubePreviewUrl } from "@/lib/feed/youtube-preview";

describe("youtube feed helpers", () => {
  it("detects channel feed urls", () => {
    const target = parseYouTubeFeedTarget(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw",
    );

    assert.deepEqual(target, {
      kind: "channel",
      id: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
      feedUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw",
      sourceType: "YOUTUBE_CHANNEL_RSS",
    });
  });

  it("detects playlist feed urls", () => {
    const target = parseYouTubeFeedTarget(
      "https://www.youtube.com/feeds/videos.xml?playlist_id=PL590L5WQmH8fJ54F66W6s8wZzQ1mKJwC1",
    );

    assert.deepEqual(target, {
      kind: "playlist",
      id: "PL590L5WQmH8fJ54F66W6s8wZzQ1mKJwC1",
      feedUrl: "https://www.youtube.com/feeds/videos.xml?playlist_id=PL590L5WQmH8fJ54F66W6s8wZzQ1mKJwC1",
      sourceType: "YOUTUBE_PLAYLIST_RSS",
    });
  });

  it("ignores non-feed youtube urls", () => {
    assert.equal(parseYouTubeFeedTarget("https://www.youtube.com/@GoogleDevelopers"), null);
  });

  it("rejects lookalike youtube hosts", () => {
    assert.equal(parseYouTubeFeedTarget("https://youtube.com.attacker.invalid/feeds/videos.xml?channel_id=proof"), null);
  });

  it("parses youtube rss feed xml", async () => {
    const originalFetch = globalThis.fetch;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <title>Google for Developers</title>
  <link href="https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw" />
  <entry>
    <id>yt:video:FCb4LSzPVmo</id>
    <yt:videoId>FCb4LSzPVmo</yt:videoId>
    <title>Add Telephony to a Gemini Live Agent</title>
    <link href="https://www.youtube.com/watch?v=FCb4LSzPVmo" />
    <published>2026-04-21T16:00:48.000Z</published>
    <author><name>Google for Developers</name></author>
  </entry>
</feed>`;

    globalThis.fetch = (async () =>
      new Response(xml, {
        status: 200,
        headers: { "content-type": "text/xml; charset=UTF-8" },
      })) as typeof fetch;

    try {
      const result = await fetchYouTubeFeedConditionally(
        "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw",
        "feed-1",
      );

      assert.equal(result.notModified, false);
      if (result.notModified) {
        throw new Error("Expected a parsed feed");
      }

      assert.equal(result.items.length, 1);
      assert.equal(result.items[0]?.youtubeVideoId, "FCb4LSzPVmo");
      assert.equal(result.items[0]?.publishedAt?.toISOString(), "2026-04-21T16:00:48.000Z");
      assert.equal(result.feed.title, "Google for Developers");
      assert.equal(result.feed.siteUrl, "https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("detects youtube shorts via shorts url probing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/shorts/fYqOq0eJalk")) {
        return new Response("", {
          status: 200,
        });
      }

      return new Response("", {
        status: 404,
        headers: {
          location: "https://www.google.com/sorry/index?continue=https://www.youtube.com/watch?v=FCb4LSzPVmo",
        },
      });
    }) as typeof fetch;

    try {
      assert.equal(await probeYouTubeShort("fYqOq0eJalk"), true);
      assert.equal(await probeYouTubeShort("FCb4LSzPVmo"), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to a generated youtube preview when upstream thumbnails are placeholders", async () => {
    const originalFetch = globalThis.fetch;
    const placeholderPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2X6VwAAAAASUVORK5CYII=",
      "base64",
    );

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("oembed")) {
        return new Response(JSON.stringify({ thumbnail_url: "https://img.youtube.com/vi/test-video/maxresdefault.jpg" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.includes("/watch?v=test-video")) {
        return new Response('<meta property="og:image" content="https://img.youtube.com/vi/test-video/maxresdefault.jpg">', {
          status: 200,
          headers: { "content-type": "text/html; charset=UTF-8" },
        });
      }

      return new Response(placeholderPng, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as typeof fetch;

    try {
      const preview = await resolveYouTubePreviewUrl({
        videoId: "test-video",
        title: "A very important video title that should always show something",
        feedThumbnailUrl: "https://img.youtube.com/vi/test-video/maxresdefault.jpg",
      });

      assert.equal(preview.startsWith("data:image/svg+xml"), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("prefers an available maximum-resolution thumbnail over a lower-resolution feed thumbnail", async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    const detailedThumbnail = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><path fill="#000" d="M0 0h640v720H0z"/><path fill="#fff" d="M640 0h640v720H640z"/></svg>',
    );

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requests.push(url);

      if (url.includes("/maxresdefault.jpg")) {
        return new Response(detailedThumbnail, {
          status: 200,
          headers: { "content-type": "image/svg+xml" },
        });
      }

      if (url.includes("oembed")) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.includes("/watch?v=")) {
        return new Response("", {
          status: 200,
          headers: { "content-type": "text/html; charset=UTF-8" },
        });
      }

      return new Response(detailedThumbnail, {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      });
    }) as typeof fetch;

    try {
      const preview = await resolveYouTubePreviewUrl({
        videoId: "quality-test-video",
        title: "Highest quality available",
        feedThumbnailUrl: "https://i.ytimg.com/vi/quality-test-video/mqdefault.jpg",
      });

      assert.equal(preview, "https://i.ytimg.com/vi/quality-test-video/maxresdefault.jpg");
      assert.equal(requests.includes("https://i.ytimg.com/vi/quality-test-video/mqdefault.jpg"), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
