import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeTimelineRefreshDelta,
  formatTimelineRefreshLabel,
} from "@/lib/timeline-refresh";

describe("computeTimelineRefreshDelta", () => {
  it("returns the contiguous new prefix and the oldest new item id", () => {
    const delta = computeTimelineRefreshDelta(["a", "b", "c"], ["x", "y", "a", "b", "c"]);

    assert.equal(delta.newCount, 2);
    assert.equal(delta.jumpTargetId, "y");
  });

  it("returns no jump target when the list did not gain new ids", () => {
    const delta = computeTimelineRefreshDelta(["a", "b", "c"], ["a", "b", "c"]);

    assert.equal(delta.newCount, 0);
    assert.equal(delta.jumpTargetId, null);
  });

  it("formats singular and plural notification labels", () => {
    assert.equal(formatTimelineRefreshLabel(1), "↑ 1 new article");
    assert.equal(formatTimelineRefreshLabel(3), "↑ 3 new articles");
  });
});
