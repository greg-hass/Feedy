import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { viewport } from "@/app/viewport";

describe("root viewport", () => {
  it("prevents pinch zoom in the installed-style app shell", () => {
    assert.equal(viewport.userScalable, false);
    assert.equal(viewport.maximumScale, 1);
  });
});
