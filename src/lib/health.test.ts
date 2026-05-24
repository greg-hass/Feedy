import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkReadiness } from "@/lib/health";

describe("checkReadiness", () => {
  it("reports healthy dependencies", async () => {
    const result = await checkReadiness(
      { $queryRaw: async () => [{ ok: 1 }] },
      { ping: async () => "PONG" },
    );

    assert.deepEqual(result, {
      ok: true,
      checks: { database: true, redis: true },
    });
  });

  it("reports a failed dependency without exposing its error", async () => {
    const result = await checkReadiness(
      { $queryRaw: async () => Promise.reject(new Error("credential details")) },
      { ping: async () => "PONG" },
    );

    assert.deepEqual(result, {
      ok: false,
      checks: { database: false, redis: true },
    });
  });

  it("fails readiness when a dependency does not respond before the deadline", async () => {
    const result = await Promise.race([
      checkReadiness(
        { $queryRaw: async () => new Promise(() => undefined) },
        { ping: async () => "PONG" },
        1,
      ),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("Readiness did not time out.")), 25);
      }),
    ]);

    assert.deepEqual(result, {
      ok: false,
      checks: { database: false, redis: true },
    });
  });
});
