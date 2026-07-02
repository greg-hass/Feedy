import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  fetchYouTubeFeedConditionally,
  probeYouTubeShort,
  parseYouTubeFeedTarget,
} from "@/lib/feed/youtube";
import { __setOutboundFetch } from "@/lib/http";

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

    __setOutboundFetch(async () =>
      new Response(xml, {
        status: 200,
        headers: { "content-type": "text/xml; charset=UTF-8" },
      }),
    );

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
      __setOutboundFetch(undefined);
    }
  });

  it("detects youtube shorts via shorts url probing", async () => {
    __setOutboundFetch(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.href;
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
    });

    try {
      assert.equal(await probeYouTubeShort("fYqOq0eJalk"), true);
      assert.equal(await probeYouTubeShort("FCb4LSzPVmo"), false);
    } finally {
      __setOutboundFetch(undefined);
    }
  });
});
