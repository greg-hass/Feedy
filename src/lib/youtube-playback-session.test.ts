import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getYouTubePlaybackSessionPlacement,
  getYouTubePlaybackHostStyle,
  shouldMountBackgroundYouTubePlayer,
} from "@/lib/youtube-playback-session";

describe("youtube playback session helpers", () => {
  it("does not mount a background player when there is no active playback", () => {
    assert.equal(
      shouldMountBackgroundYouTubePlayer({ pathname: "/app/feeds", active: null }),
      false,
    );
    assert.equal(
      getYouTubePlaybackSessionPlacement({ pathname: "/app/feeds", active: null }),
      "none",
    );
  });

  it("prefers inline placement on the source pathname", () => {
    const active = { sourcePathname: "/app/unread", state: "playing" as const };

    assert.equal(
      shouldMountBackgroundYouTubePlayer({ pathname: "/app/unread", active }),
      false,
    );
    assert.equal(
      getYouTubePlaybackSessionPlacement({ pathname: "/app/unread", active }),
      "inline",
    );
  });

  it("mounts a background player when switching to another /app tab", () => {
    const active = { sourcePathname: "/app/unread", state: "playing" as const };

    assert.equal(
      shouldMountBackgroundYouTubePlayer({ pathname: "/app/feeds", active }),
      true,
    );
    assert.equal(
      getYouTubePlaybackSessionPlacement({ pathname: "/app/feeds", active }),
      "background",
    );
  });

  it("does not mount outside of /app routes", () => {
    const active = { sourcePathname: "/app/unread", state: "playing" as const };

    assert.equal(
      shouldMountBackgroundYouTubePlayer({ pathname: "/reader/123", active }),
      false,
    );
    assert.equal(
      getYouTubePlaybackSessionPlacement({ pathname: "/reader/123", active }),
      "none",
    );
  });

  it("treats ended sessions as inactive for placement", () => {
    const active = { sourcePathname: "/app/unread", state: "ended" as const };

    assert.equal(
      shouldMountBackgroundYouTubePlayer({ pathname: "/app/feeds", active }),
      false,
    );
    assert.equal(
      getYouTubePlaybackSessionPlacement({ pathname: "/app/unread", active }),
      "none",
    );
  });

  it("positions the shared host over the source slot while inline playback is active", () => {
    const active = { sourcePathname: "/app/unread", state: "playing" as const };

    assert.deepEqual(
      getYouTubePlaybackHostStyle({
        placement: "inline",
        sourceRect: { top: 112, left: 16, width: 343, height: 193 },
        active,
      }),
      {
        position: "fixed",
        top: "112px",
        left: "16px",
        width: "343px",
        height: "193px",
        zIndex: 60,
        opacity: 1,
        pointerEvents: "auto",
      },
    );
  });
});
