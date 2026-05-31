import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getNavigationData } from "@/lib/navigation-data";

describe("getNavigationData", () => {
  it("dedupes concurrent loads and refreshes after the cache expires", async () => {
    const calls: string[] = [];
    const client = {
      folder: {
        findMany: async () => {
          calls.push("folders");
          return [];
        },
      },
      feed: {
        findMany: async () => {
          calls.push("feeds");
          return [];
        },
      },
      user: {
        findUnique: async () => ({
          settings: { hideYouTubeShorts: false },
        }),
      },
      $queryRaw: async () => {
        calls.push("query");
        return [];
      },
    };

    const originalNow = Date.now;
    let now = 1_000;
    Date.now = () => now;

    try {
      const [first, second] = await Promise.all([
        getNavigationData("user-cache", client as never),
        getNavigationData("user-cache", client as never),
      ]);

      assert.deepEqual(first, second);
      assert.deepEqual(calls, ["folders", "feeds", "query", "query", "query"]);

      now += 31_000;
      calls.length = 0;

      await getNavigationData("user-cache", client as never);
      assert.deepEqual(calls, ["folders", "feeds", "query", "query", "query"]);
    } finally {
      Date.now = originalNow;
    }
  });
});
