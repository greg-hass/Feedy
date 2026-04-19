import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseYouTubeFeedTarget } from "@/lib/feed/youtube";

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
});
