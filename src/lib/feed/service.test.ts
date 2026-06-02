import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getReaderExtractionCandidateIds, upsertFeedItemsInBatches } from "@/lib/feed/service";

describe("upsertFeedItemsInBatches", () => {
  it("splits large refresh writes into smaller transactions", async () => {
    const calls: number[] = [];
    const client = {
      $transaction: async (operations: Array<Promise<{ id: string }>>) => {
        calls.push(operations.length);
        return operations;
      },
      item: {
        upsert: (args: { where: { uniqueKey: string } }) =>
          Promise.resolve({ id: args.where.uniqueKey }),
      },
    };

    const operations = Array.from({ length: 120 }, (_, index) => ({
      where: { uniqueKey: `item-${index}` },
      update: {},
      create: { uniqueKey: `item-${index}` },
    }));

    const results = await upsertFeedItemsInBatches(client as never, operations as never);

    assert.equal(results.length, 120);
    assert.deepEqual(calls, [50, 50, 20]);
  });
});

describe("getReaderExtractionCandidateIds", () => {
  it("queues only new canonical-url items without feed-provided content", () => {
    const ids = getReaderExtractionCandidateIds({
      upserts: [{ id: "new-empty" }, { id: "new-content" }, { id: "old-empty" }, { id: "new-no-url" }],
      existingKeys: new Set(["old-empty-key"]),
      items: [
        {
          uniqueKey: "new-empty-key",
          title: "New empty",
          canonicalUrl: "https://example.com/article",
        },
        {
          uniqueKey: "new-content-key",
          title: "New content",
          canonicalUrl: "https://example.com/full",
          contentHtml: "<p>Already available</p>",
        },
        {
          uniqueKey: "old-empty-key",
          title: "Old empty",
          canonicalUrl: "https://example.com/old",
        },
        {
          uniqueKey: "new-no-url-key",
          title: "New no URL",
        },
      ],
    });

    assert.deepEqual(ids, ["new-empty"]);
  });
});
