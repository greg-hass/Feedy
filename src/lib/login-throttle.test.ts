import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkLoginThrottle } from "@/lib/login-throttle";

class FakeLimiter {
  private readonly counts = new Map<string, number>();

  async check(key: string, options: { limit: number; windowSeconds: number }) {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);

    return {
      allowed: count <= options.limit,
      remaining: Math.max(0, options.limit - count),
      retryAfterSeconds: options.windowSeconds,
    };
  }
}

describe("checkLoginThrottle", () => {
  it("does not let a small spray of different usernames lock out a real login", async () => {
    const limiter = new FakeLimiter();

    for (let index = 0; index < 15; index += 1) {
      assert.equal((await checkLoginThrottle(limiter, `guess-${index}`)).allowed, true);
    }

    assert.equal((await checkLoginThrottle(limiter, "owner")).allowed, true);
  });

  it("blocks repeated attempts against one account", async () => {
    const limiter = new FakeLimiter();

    for (let index = 0; index < 5; index += 1) {
      assert.equal((await checkLoginThrottle(limiter, "owner")).allowed, true);
    }

    assert.equal((await checkLoginThrottle(limiter, "owner")).allowed, false);
  });
});
