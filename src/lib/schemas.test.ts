import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { settingsSchema } from "@/lib/schemas";

describe("settingsSchema", () => {
  it("accepts a 14-day item retention window", () => {
    assert.equal(settingsSchema.parse({ itemRetentionDays: 14 }).itemRetentionDays, 14);
  });

  it("rejects item retention windows shorter than 14 days", () => {
    assert.equal(settingsSchema.safeParse({ itemRetentionDays: 13 }).success, false);
  });
});
