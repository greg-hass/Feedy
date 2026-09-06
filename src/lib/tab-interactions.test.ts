import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { vibrateIfSupported } from "@/lib/tab-interactions";

describe("tab interactions", () => {
  it("does not throw when vibration is unavailable", () => {
    assert.equal(vibrateIfSupported(undefined, 12), false);
  });
});
