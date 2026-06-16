import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectDueFeedIds, selectDueFeeds } from "@/lib/refresh-scheduler";

describe("selectDueFeedIds", () => {
  it("uses the Settings cadence for every feed", () => {
    const now = new Date("2026-06-12T12:00:00.000Z").getTime();

    assert.deepEqual(
      selectDueFeedIds({
        feeds: [
          {
            id: "due",
            lastRefreshedAt: new Date("2026-06-12T11:44:59.000Z"),
            lastFailureAt: null,
          },
          {
            id: "not-due",
            lastRefreshedAt: new Date("2026-06-12T11:50:01.000Z"),
            lastFailureAt: null,
          },
        ],
        now,
        intervalMinutes: 15,
        backlog: 0,
      }),
      ["due"],
    );
  });

  it("uses last failure time when a feed has never refreshed successfully", () => {
    const now = new Date("2026-06-12T12:00:00.000Z").getTime();

    assert.deepEqual(
      selectDueFeedIds({
        feeds: [
          {
            id: "failed-recently",
            lastRefreshedAt: null,
            lastFailureAt: new Date("2026-06-12T11:50:01.000Z"),
          },
          {
            id: "failed-earlier",
            lastRefreshedAt: null,
            lastFailureAt: new Date("2026-06-12T11:44:59.000Z"),
          },
        ],
        now,
        intervalMinutes: 15,
        backlog: 0,
      }),
      ["failed-earlier"],
    );
  });

  it("uses the latest attempt when a recent failure is newer than an older success", () => {
    const now = new Date("2026-06-12T12:00:00.000Z").getTime();

    assert.deepEqual(
      selectDueFeedIds({
        feeds: [
          {
            id: "recent-failure",
            lastRefreshedAt: new Date("2026-06-12T10:00:00.000Z"),
            lastFailureAt: new Date("2026-06-12T11:50:01.000Z"),
          },
          {
            id: "old-failure",
            lastRefreshedAt: new Date("2026-06-12T10:00:00.000Z"),
            lastFailureAt: new Date("2026-06-12T11:44:59.000Z"),
          },
        ],
        now,
        intervalMinutes: 15,
        backlog: 0,
      }),
      ["old-failure"],
    );
  });

  it("uses success time when it is newer than a previous failure", () => {
    const now = new Date("2026-06-12T12:00:00.000Z").getTime();

    assert.deepEqual(
      selectDueFeedIds({
        feeds: [
          {
            id: "recent-success",
            lastRefreshedAt: new Date("2026-06-12T11:50:01.000Z"),
            lastFailureAt: new Date("2026-06-12T10:00:00.000Z"),
          },
          {
            id: "old-success",
            lastRefreshedAt: new Date("2026-06-12T11:44:59.000Z"),
            lastFailureAt: new Date("2026-06-12T10:00:00.000Z"),
          },
        ],
        now,
        intervalMinutes: 15,
        backlog: 0,
      }),
      ["old-success"],
    );
  });

  it("caps selected feeds so scheduled refresh cannot overfill the queue", () => {
    assert.deepEqual(
      selectDueFeedIds({
        feeds: [{ id: "one", lastRefreshedAt: null, lastFailureAt: null }],
        now: Date.now(),
        intervalMinutes: 15,
        backlog: 100,
      }),
      [],
    );
  });

  it("reports whether due feeds were capped", () => {
    assert.deepEqual(
      selectDueFeeds({
        feeds: [
          { id: "one", lastRefreshedAt: null, lastFailureAt: null },
          { id: "two", lastRefreshedAt: null, lastFailureAt: null },
        ],
        now: Date.now(),
        intervalMinutes: 15,
        backlog: 99,
      }),
      {
        dueFeedIds: ["one"],
        capped: true,
      },
    );
  });
});
