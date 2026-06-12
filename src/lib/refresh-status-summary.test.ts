import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizeDurableRefreshBatch, summarizeLegacyRefreshJobs } from "@/lib/refresh-status-summary";

describe("refresh status summaries", () => {
  it("summarizes durable refresh batches from persisted counters", () => {
    const startedAt = new Date("2026-06-12T10:00:00.000Z");
    const finishedAt = new Date("2026-06-12T10:01:00.000Z");

    assert.deepEqual(
      summarizeDurableRefreshBatch({
        totalFeeds: 5,
        queued: 4,
        skipped: 1,
        succeeded: 2,
        failed: 1,
        status: "PARTIAL",
        startedAt,
        finishedAt,
      }),
      {
        ok: true,
        total: 5,
        queued: 1,
        running: 1,
        succeeded: 2,
        failed: 1,
        skipped: 1,
        completed: 4,
        active: 1,
        status: "PARTIAL",
        startedAt,
        finishedAt,
      },
    );
  });

  it("does not report negative active work when counters race ahead", () => {
    const summary = summarizeDurableRefreshBatch({
        totalFeeds: 2,
        queued: 1,
        skipped: 1,
        succeeded: 2,
        failed: 0,
        status: "SUCCEEDED",
        startedAt: new Date("2026-06-12T10:00:00.000Z"),
        finishedAt: null,
    });

    assert.equal(summary.active, 0);
    assert.equal(summary.completed, 2);
  });

  it("keeps legacy refresh job status as a fallback", () => {
    assert.deepEqual(
      summarizeLegacyRefreshJobs([
        { status: "QUEUED" },
        { status: "RUNNING" },
        { status: "SUCCEEDED" },
        { status: "FAILED" },
      ]),
      {
        ok: true,
        total: 4,
        queued: 1,
        running: 1,
        succeeded: 1,
        failed: 1,
        completed: 2,
        active: 2,
      },
    );
  });
});
