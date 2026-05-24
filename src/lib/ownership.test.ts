import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertOwnedFeed, assertOwnedFolder, assertOwnedItem } from "@/lib/ownership";

function clientWithOwner(ownerId: string) {
  return {
    feed: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        where.userId === ownerId ? { id: where.id } : null,
    },
    folder: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        where.userId === ownerId ? { id: where.id } : null,
    },
    item: {
      findFirst: async ({ where }: { where: { id: string; feed: { userId: string } } }) =>
        where.feed.userId === ownerId ? { id: where.id } : null,
    },
  };
}

describe("resource ownership guards", () => {
  it("allows owned resources", async () => {
    const client = clientWithOwner("user-1");

    assert.deepEqual(await assertOwnedFeed(client as never, "user-1", "feed-1"), { id: "feed-1" });
    assert.deepEqual(await assertOwnedFolder(client as never, "user-1", "folder-1"), { id: "folder-1" });
    assert.deepEqual(await assertOwnedItem(client as never, "user-1", "item-1"), { id: "item-1" });
  });

  it("rejects resources outside the current user", async () => {
    const client = clientWithOwner("owner");

    await assert.rejects(assertOwnedFeed(client as never, "attacker", "feed-1"), /Feed not found/);
    await assert.rejects(assertOwnedFolder(client as never, "attacker", "folder-1"), /Folder not found/);
    await assert.rejects(assertOwnedItem(client as never, "attacker", "item-1"), /Item not found/);
  });
});
