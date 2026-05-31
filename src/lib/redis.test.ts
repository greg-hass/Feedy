import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attachRedisErrorLogging } from "@/lib/redis";

describe("attachRedisErrorLogging", () => {
  it("logs redis connection errors", () => {
    const messages: string[] = [];
    const client = {
      on: (event: string, handler: (error: unknown) => void) => {
        assert.equal(event, "error");
        handler(new Error("redis unavailable"));
        return client;
      },
    };

    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      messages.push(args.map(String).join(" "));
    };

    try {
      attachRedisErrorLogging(client as never);
    } finally {
      console.error = originalError;
    }

    assert.deepEqual(messages, ["[redis] redis unavailable"]);
  });
});
