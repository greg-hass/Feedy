import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hash } from "bcryptjs";

import {
  authenticate,
  loadUserForAuthentication,
  repairSingleUserDatabase,
  syncSingleUserFromEnv,
  validateSessionPayload,
} from "@/lib/auth";

describe("authentication helpers", () => {
  it("loads the stored user without mutating state", async () => {
    let updateCalled = false;
    const client = {
      count: async () => 1,
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

  it("rejects a database that already contains multiple users", async () => {
    const client = {
      $transaction: async (fn: (tx: { $executeRaw: () => Promise<void>; user: { count: () => Promise<number>; findFirst: () => Promise<null> } }) => Promise<unknown>) =>
        fn({
          $executeRaw: async () => {},
          user: {
            count: async () => 2,
            findFirst: async () => null,
          },
        }),
      user: {
        count: async () => 2,
        findFirst: async () => null,
      },
    } as const;

    await assert.rejects(
      () => syncSingleUserFromEnv(client as never),
      /single-user mode/i,
    );
  });

  it("bootstraps the single user inside a transaction", async () => {
    const calls: string[] = [];
    const client = {
      $transaction: async (fn: (tx: {
        $executeRaw: () => Promise<void>;
        user: {
          count: () => Promise<number>;
          findFirst: () => Promise<null>;
          create: (args: { data: { username: string } }) => Promise<{ id: string; username: string }>;
        };
      }) => Promise<{ id: string; username: string }>) =>
        fn({
          $executeRaw: async () => {
            calls.push("lock");
          },
          user: {
            count: async () => 0,
            findFirst: async () => null,
            create: async (args) => {
              calls.push(`create:${args.data.username}`);
              return { id: "user-1", username: args.data.username };
            },
          },
        }),
      user: {
        count: async () => 0,
        findFirst: async () => null,
      },
    } as const;

    const user = await syncSingleUserFromEnv(client as never);

    assert.equal(user.username, "admin");
    assert.deepEqual(calls, ["lock", "create:admin"]);
  });

  it("repairs a multi-user database by keeping the oldest user", async () => {
    const calls: string[] = [];
    const client = {
      $transaction: async (fn: (tx: {
        $executeRaw: () => Promise<void>;
        user: {
          findMany: () => Promise<Array<{ id: string; username: string; settings: { refreshIntervalMinutes: number; itemRetentionDays: number; hideYouTubeShorts: boolean } | null }>>;
          deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<{ count: number }>;
          update: (args: { where: { id: string }; data: { username: string; passwordHash: string } }) => Promise<{ id: string; username: string }>;
        };
      }) => Promise<{ id: string; username: string }>) =>
        fn({
          $executeRaw: async () => {
            calls.push("lock");
          },
          user: {
            findMany: async () => [
              {
                id: "user-1",
                username: "oldest",
                settings: {
                  refreshIntervalMinutes: 15,
                  itemRetentionDays: 30,
                  hideYouTubeShorts: true,
                },
              },
              { id: "user-2", username: "extra-1", settings: null },
              { id: "user-3", username: "extra-2", settings: null },
            ],
            deleteMany: async (args) => {
              calls.push(`delete:${args.where.id.in.join(",")}`);
              return { count: 2 };
            },
            update: async (args) => {
              calls.push(`update:${args.where.id}`);
              assert.equal(args.data.username, "admin");
              return { id: args.where.id, username: args.data.username };
            },
          },
        }),
      user: {
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 }),
        update: async () => ({ id: "user-1", username: "admin" }),
      },
    } as const;

    const user = await repairSingleUserDatabase(client as never);

    assert.equal(user.username, "admin");
    assert.deepEqual(calls, ["lock", "delete:user-2,user-3", "update:user-1"]);
  });

  it("repairs an empty database by creating the single user", async () => {
    const calls: string[] = [];
    const client = {
      $transaction: async (fn: (tx: {
        $executeRaw: () => Promise<void>;
        user: {
          findMany: () => Promise<Array<{ id: string; username: string; settings: null }>>;
          deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<{ count: number }>;
          create: (args: { data: { username: string } }) => Promise<{ id: string; username: string }>;
        };
      }) => Promise<{ id: string; username: string }>) =>
        fn({
          $executeRaw: async () => {
            calls.push("lock");
          },
          user: {
            findMany: async () => [],
            deleteMany: async () => ({ count: 0 }),
            create: async (args) => {
              calls.push(`create:${args.data.username}`);
              return { id: "user-1", username: args.data.username };
            },
          },
        }),
      user: {
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 }),
        create: async () => ({ id: "user-1", username: "admin" }),
      },
    } as const;

    const user = await repairSingleUserDatabase(client as never);

    assert.equal(user.username, "admin");
    assert.deepEqual(calls, ["lock", "create:admin"]);
  });

  it("authenticates against the stored password hash", async () => {
    const passwordHash = await hash("correct horse battery staple", 12);
    const client = {
      user: {
        findFirst: async (args?: { where?: { username?: { equals?: string } } }) => {
          assert.equal(args?.where?.username?.equals, "admin");
          return {
            id: "user-1",
            username: "Admin",
            passwordHash,
            settings: { id: "settings-1" },
          };
        },
      },
    } as const;

    const user = await authenticate(
      "ADMIN",
      "correct horse battery staple",
      client as never,
      async () => {},
    );

    assert.equal(user?.id, "user-1");
    assert.equal(user?.username, "Admin");
  });

  it("rejects a username that does not exist", async () => {
    const client = {
      user: {
        findFirst: async () => null,
      },
    } as const;

    const user = await authenticate(
      "missing",
      "correct horse battery staple",
      client as never,
      async () => {},
    );

    assert.equal(user, null);
  });

  it("rejects malformed session payloads", () => {
    assert.equal(validateSessionPayload({ userId: "", username: 123 }), null);
    assert.deepEqual(validateSessionPayload({ userId: "user-1", username: "admin" }), {
      userId: "user-1",
      username: "admin",
    });
  });
});
