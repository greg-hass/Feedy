import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateRefreshProgress } from "@/lib/refresh-progress";

describe("calculateRefreshProgress", () => {
  it("keeps a queued batch near the start until status polling returns", () => {
    assert.equal(
      calculateRefreshProgress({
        phase: "refreshing",
        status: null,
      }),
      5,
    );
  });

  it("calculates progress from completed feeds once status is available", () => {
    assert.equal(
      calculateRefreshProgress({
        phase: "refreshing",
        status: {
          completed: 3,
          total: 10,
        },
      }),
      30,
    );
  });

  it("caps progress at 100 when refresh counters race ahead", () => {
    assert.equal(
      calculateRefreshProgress({
        phase: "refreshing",
        status: {
          completed: 3,
          total: 2,
        },
      }),
      100,
    );
  });
});
