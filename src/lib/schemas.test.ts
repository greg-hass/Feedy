import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { settingsSchema } from "@/lib/schemas";

describe("settingsSchema", () => {
  it("accepts a 30-day item retention window", () => {
    assert.equal(settingsSchema.parse({ itemRetentionDays: 30 }).itemRetentionDays, 30);
  });

  it("rejects item retention windows shorter than 30 days", () => {
    assert.equal(settingsSchema.safeParse({ itemRetentionDays: 14 }).success, false);
    assert.equal(settingsSchema.safeParse({ itemRetentionDays: 29 }).success, false);
  });
});
