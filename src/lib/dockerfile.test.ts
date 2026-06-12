import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Dockerfile runtime hardening", () => {
  it("runs the application as a non-root user", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");

    assert.match(dockerfile, /^USER\s+feedy$/m);
  });
});
