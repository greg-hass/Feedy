import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getYouTubeThumbnailUrls, isLikelyLowResolutionYouTubePlaceholder } from "@/lib/feed/youtube-thumbnail";

describe("youtube thumbnail candidates", () => {
  it("orders landscape thumbnail candidates from highest to lowest quality", () => {
    assert.deepEqual(getYouTubeThumbnailUrls("video-id"), [
      "https://i.ytimg.com/vi/video-id/maxresdefault.jpg",
      "https://i.ytimg.com/vi/video-id/hq720.jpg",
      "https://i.ytimg.com/vi/video-id/sddefault.jpg",
      "https://i.ytimg.com/vi/video-id/hqdefault.jpg",
      "https://i.ytimg.com/vi/video-id/mqdefault.jpg",
      "https://i.ytimg.com/vi/video-id/0.jpg",
      "https://i.ytimg.com/vi/video-id/default.jpg",
    ]);
  });

  it("prepends portrait candidates for shorts and retains a distinct existing fallback last", () => {
    assert.deepEqual(
      getYouTubeThumbnailUrls("short-id", {
        existingUrl: "https://img.youtube.com/vi/short-id/hqdefault.jpg?rss=1",
        isShort: true,
      }),
      [
        "https://i.ytimg.com/vi/short-id/oar2.jpg",
        "https://i.ytimg.com/vi/short-id/maxres2.jpg",
        "https://i.ytimg.com/vi/short-id/hq2.jpg",
        "https://i.ytimg.com/vi/short-id/frame0.jpg",
        "https://i.ytimg.com/vi/short-id/maxresdefault.jpg",
        "https://i.ytimg.com/vi/short-id/hq720.jpg",
        "https://i.ytimg.com/vi/short-id/sddefault.jpg",
        "https://i.ytimg.com/vi/short-id/hqdefault.jpg",
        "https://i.ytimg.com/vi/short-id/mqdefault.jpg",
        "https://i.ytimg.com/vi/short-id/0.jpg",
        "https://i.ytimg.com/vi/short-id/default.jpg",
        "https://img.youtube.com/vi/short-id/hqdefault.jpg?rss=1",
      ],
    );
  });

  it("detects loaded YouTube placeholder images that are smaller than the requested quality", () => {
    assert.equal(
      isLikelyLowResolutionYouTubePlaceholder("https://i.ytimg.com/vi/video-id/maxresdefault.jpg", {
        naturalWidth: 120,
        naturalHeight: 90,
      }),
      true,
    );
    assert.equal(
      isLikelyLowResolutionYouTubePlaceholder("https://i.ytimg.com/vi/video-id/hqdefault.jpg", {
        naturalWidth: 320,
        naturalHeight: 180,
      }),
      false,
    );
  });

  it("keeps the final YouTube default thumbnail size as usable", () => {
    assert.equal(
      isLikelyLowResolutionYouTubePlaceholder("https://i.ytimg.com/vi/video-id/default.jpg", {
        naturalWidth: 120,
        naturalHeight: 90,
      }),
      false,
    );
  });

  it("ignores non-YouTube thumbnail URLs", () => {
    assert.equal(
      isLikelyLowResolutionYouTubePlaceholder("https://example.com/thumb.jpg", {
        naturalWidth: 1,
        naturalHeight: 1,
      }),
      false,
    );
  });
});
