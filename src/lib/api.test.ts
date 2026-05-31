import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiAuthError, apiErrorFrom } from "@/lib/api";

describe("apiErrorFrom", () => {
  it("maps api auth errors to 401", async () => {
    const response = apiErrorFrom(new ApiAuthError(), "fallback");

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  });
});
