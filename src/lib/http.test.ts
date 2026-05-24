import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchWithTimeout } from "@/lib/http";

describe("fetchWithTimeout", () => {
  it("rejects private destinations before calling fetch", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("fetch should not be reached");
    }) as typeof fetch;

    try {
      await assert.rejects(
        fetchWithTimeout("http://127.0.0.1:5432/private", {}, 2000),
        /not allowed|private IP addresses|local hostnames/i,
      );
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
