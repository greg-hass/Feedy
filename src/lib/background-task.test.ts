import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runBackgroundTask } from "@/lib/background-task";

describe("runBackgroundTask", () => {
  it("reports rejected scheduled work rather than leaking an unhandled rejection", async () => {
    const calls: unknown[][] = [];

    await runBackgroundTask(
      "schedule feeds",
      async () => {
        throw new Error("redis unavailable");
      },
      (...args) => {
        calls.push(args);
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.[0], "[worker] schedule feeds failed");
  });
});
