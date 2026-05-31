import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { markItemsRead } from "@/lib/mark-read";

describe("markItemsRead", () => {
  it("uses a single transaction with createMany and updateMany", async () => {
    const operations: string[] = [];
    const client = {
      readState: {
        createMany: (args: { data: Array<{ itemId: string; userId: string; lastReadAt: Date }>; skipDuplicates: boolean }) => {
          operations.push(`createMany:${args.data.length}:${args.skipDuplicates}`);
          return Promise.resolve();
        },
        updateMany: (args: {
          where: { userId: string; itemId: { in: string[] } };
          data: { lastReadAt: Date };
        }) => {
          operations.push(`updateMany:${args.where.itemId.in.length}`);
          return Promise.resolve();
        },
      },
      $transaction: async (queries: Promise<unknown>[]) => {
        operations.push(`transaction:${queries.length}`);
        await Promise.all(queries);
      },
    };

    await markItemsRead(client as never, "user-1", ["item-1", "item-2"]);

    assert.deepEqual(operations, ["createMany:2:true", "updateMany:2", "transaction:2"]);
  });

  it("skips writes when there are no item ids", async () => {
    let transactionCalled = false;
    const client = {
      readState: {
        createMany: () => Promise.resolve(),
        updateMany: () => Promise.resolve(),
      },
      $transaction: async () => {
        transactionCalled = true;
      },
    };

    await markItemsRead(client as never, "user-1", []);

    assert.equal(transactionCalled, false);
  });
});
