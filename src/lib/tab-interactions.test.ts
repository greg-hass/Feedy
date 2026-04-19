import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isActiveTabTap, vibrateIfSupported } from "@/lib/tab-interactions";

describe("tab interactions", () => {
  it("detects taps on the active tab", () => {
    assert.equal(isActiveTabTap("/app/unread", "/app/unread"), true);
    assert.equal(isActiveTabTap("/app/unread", "/app/feeds"), false);
  });

  it("does not throw when vibration is unavailable", () => {
    assert.equal(vibrateIfSupported(undefined, 12), false);
  });
});
