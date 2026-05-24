import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hash } from "bcryptjs";

import { authenticate, loadUserForAuthentication } from "@/lib/auth";

describe("authentication helpers", () => {
  it("loads the stored user without mutating state", async () => {
    let updateCalled = false;
    const client = {
      user: {
        findFirst: async () => ({
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

    const user = await loadUserForAuthentication(client as never);

    assert.equal(user?.id, "user-1");
    assert.equal(updateCalled, false);
  });

  it("authenticates against the stored password hash", async () => {
    const passwordHash = await hash("correct horse battery staple", 12);
    const client = {
      user: {
        findFirst: async () => ({
          id: "user-1",
          username: "admin",
          passwordHash,
          settings: { id: "settings-1" },
        }),
      },
    } as const;

    const user = await authenticate(
      "admin",
      "correct horse battery staple",
      client as never,
      async () => {},
    );

    assert.equal(user?.id, "user-1");
  });
});
