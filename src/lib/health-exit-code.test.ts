import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readinessExitCode } from "@/lib/health";

describe("readinessExitCode", () => {
  it("returns success only when all readiness checks pass", () => {
    assert.equal(readinessExitCode({ ok: true }), 0);
    assert.equal(readinessExitCode({ ok: false }), 1);
  });
});
