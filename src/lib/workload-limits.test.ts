import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertWithinLimit, mapInBatches } from "@/lib/workload-limits";

describe("assertWithinLimit", () => {
  it("accepts the boundary and rejects work above the configured maximum", () => {
    assert.doesNotThrow(() => assertWithinLimit(2, 2, "feeds"));
    assert.throws(() => assertWithinLimit(3, 2, "feeds"), /maximum allowed/i);
  });
});

describe("mapInBatches", () => {
  it("preserves results while limiting in-flight work", async () => {
    let active = 0;
    let peakActive = 0;

    const results = await mapInBatches([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return value * 2;
    });

    assert.deepEqual(results, [2, 4, 6, 8, 10]);
    assert.ok(peakActive <= 2);
  });
});
