import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { upsertFeedItemsInBatches } from "@/lib/feed/service";

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
