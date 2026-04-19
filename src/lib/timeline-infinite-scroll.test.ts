import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  flattenTimelinePages,
  shouldLoadNextTimelinePage,
} from "@/lib/timeline-infinite-scroll";

describe("timeline infinite scroll", () => {
  it("appends already loaded pages in order", () => {
    const items = flattenTimelinePages([
      { items: [{ id: "a" }] },
      { items: [{ id: "b" }, { id: "c" }] },
    ]);

    assert.deepEqual(items.map((item) => item.id), ["a", "b", "c"]);
  });

  it("stops loading when the sentinel is hidden or a fetch is active", () => {
    assert.equal(
      shouldLoadNextTimelinePage({
        hasMore: true,
        isBottomVisible: true,
        isFetchingNextPage: false,
      }),
      true,
    );

    assert.equal(
      shouldLoadNextTimelinePage({
        hasMore: false,
        isBottomVisible: true,
        isFetchingNextPage: false,
      }),
      false,
    );

    assert.equal(
      shouldLoadNextTimelinePage({
        hasMore: true,
        isBottomVisible: true,
        isFetchingNextPage: true,
      }),
      false,
    );
  });
});
