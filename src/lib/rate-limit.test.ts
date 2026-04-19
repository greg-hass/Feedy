import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createFixedWindowRateLimiter } from "@/lib/rate-limit";

class FakeRedis {
  private readonly counts = new Map<string, number>();
  private readonly expiries = new Map<string, number>();

  async incr(key: string) {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }

  async expire(key: string, seconds: number) {
    this.expiries.set(key, seconds);
    return 1;
  }

  async ttl(key: string) {
    return this.expiries.get(key) ?? -1;
  }
}

describe("createFixedWindowRateLimiter", () => {
  it("blocks after the configured limit is exceeded", async () => {
    const limiter = createFixedWindowRateLimiter(new FakeRedis() as never);

    assert.equal((await limiter.check("login:127.0.0.1:admin", { limit: 2, windowSeconds: 60 })).allowed, true);
    assert.equal((await limiter.check("login:127.0.0.1:admin", { limit: 2, windowSeconds: 60 })).allowed, true);
    assert.equal((await limiter.check("login:127.0.0.1:admin", { limit: 2, windowSeconds: 60 })).allowed, false);
  });
});
