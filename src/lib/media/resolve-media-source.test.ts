import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePlayableMediaSource } from "@/lib/media/resolve-media-source";

describe("resolvePlayableMediaSource", () => {
  it("does not probe private media URLs from feed content", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4" },
      });
    }) as typeof fetch;

    try {
      const source = await resolvePlayableMediaSource({
        mediaUrl: "http://127.0.0.1/private-media",
        youtubeVideoId: null,
        title: "Untrusted media",
      });

      assert.deepEqual(source, { kind: "none" });
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
