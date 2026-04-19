import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadUserBySessionId } from "@/lib/auth";

describe("loadUserBySessionId", () => {
  it("loads the current user without writing", async () => {
    let updateCalled = false;
    const client = {
      user: {
        findUnique: async () => ({
          id: "user-1",
          username: "admin",
          settings: { id: "settings-1" },
        }),
        update: async () => {
          updateCalled = true;
          return null;
        },
      },
    } as const;

    const user = await loadUserBySessionId(client as never, "user-1");

    assert.equal(user?.id, "user-1");
    assert.equal(updateCalled, false);
  });
});
