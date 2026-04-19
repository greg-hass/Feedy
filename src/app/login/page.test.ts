import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

describe("login page defaults", () => {
  it("does not prefill the username with admin", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    assert.equal(source.includes('defaultValue="admin"'), false);
  });
});
