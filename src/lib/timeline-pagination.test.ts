import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTimelinePage } from "@/lib/timeline-pagination";

describe("timeline pagination", () => {
  it("returns a cursor and hasMore when there is another page", () => {
    const records = Array.from({ length: 101 }, (_, index) => ({
      id: `item-${index}`,
      uniqueKey: `unique-${index}`,
    }));

    const page = buildTimelinePage(records, 100);

    assert.equal(page.items.length, 100);
    assert.equal(page.hasMore, true);
    assert.equal(page.nextCursor, "item-99");
  });

  it("returns no cursor when the page is complete", () => {
    const records = Array.from({ length: 3 }, (_, index) => ({
      id: `item-${index}`,
      uniqueKey: `unique-${index}`,
    }));

    const page = buildTimelinePage(records, 100);

    assert.equal(page.items.length, 3);
    assert.equal(page.hasMore, false);
    assert.equal(page.nextCursor, null);
  });
});
