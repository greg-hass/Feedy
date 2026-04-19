import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { viewport } from "@/app/viewport";

describe("root viewport", () => {
  it("allows user scaling", () => {
    assert.equal(viewport.userScalable, true);
    assert.notEqual(viewport.maximumScale, 1);
  });
});
