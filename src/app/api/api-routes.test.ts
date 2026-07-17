/**
 * API layer tests: auth helpers, request parsing, and validation schemas.
 *
 * These test the api.ts helper functions and schema validation without
 * needing a running database or Redis instance.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("api.ts helpers", () => {
  it("apiError returns JSON error with given status", async () => {
    const { apiError } = await import("@/lib/api");
    const response = apiError("Bad request", 400);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, "Bad request");
  });

  it("apiError defaults to 400 status", async () => {
    const { apiError } = await import("@/lib/api");
    const response = apiError("Something went wrong");
    assert.equal(response.status, 400);
  });

  it("apiErrorFrom returns 401 for ApiAuthError", async () => {
    const { apiErrorFrom, ApiAuthError } = await import("@/lib/api");
    const error = new ApiAuthError("Not logged in");
    const response = apiErrorFrom(error, "Fallback");
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error, "Not logged in");
  });

  it("apiErrorFrom returns 400 for generic errors", async () => {
    const { apiErrorFrom } = await import("@/lib/api");
    const error = new Error("Something broke");
    const response = apiErrorFrom(error, "Could not process");
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, "Could not process");
  });

  it("apiErrorFrom uses custom status when provided", async () => {
    const { apiErrorFrom } = await import("@/lib/api");
    const error = new Error("Not found");
    const response = apiErrorFrom(error, "Not found", 404);
    assert.equal(response.status, 404);
  });

  it("isApiAuthError identifies auth errors", async () => {
    const { isApiAuthError, ApiAuthError } = await import("@/lib/api");
    assert.ok(isApiAuthError(new ApiAuthError()));
    assert.ok(!isApiAuthError(new Error("not auth")));
    assert.ok(!isApiAuthError("string"));
    assert.ok(!isApiAuthError(null));
  });

  it("parseJson validates body against schema", async () => {
    const { parseJson } = await import("@/lib/api");
    const { z } = await import("zod");
    const schema = z.object({ name: z.string() });
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    const result = await parseJson(request, schema);
    assert.deepEqual(result, { name: "test" });
  });

  it("parseJson rejects invalid body", async () => {
    const { parseJson } = await import("@/lib/api");
    const { z } = await import("zod");
    const schema = z.object({ name: z.string() });
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: 123 }),
    });
    await assert.rejects(() => parseJson(request, schema));
  });

  it("parseQuery parses URL search params", async () => {
    const { parseQuery } = await import("@/lib/api");
    const { z } = await import("zod");
    const schema = z.object({
      q: z.string().optional(),
      page: z.coerce.number().int().optional(),
    });
    const params = new URLSearchParams("q=hello&page=2");
    const result = await parseQuery(params, schema);
    assert.deepEqual(result, { q: "hello", page: 2 });
  });
});

describe("Request validation schemas", () => {
  it("loginSchema requires username and password", async () => {
    const { loginSchema } = await import("@/lib/schemas");
    const valid = loginSchema.safeParse({ username: "admin", password: "secret" });
    assert.ok(valid.success);

    const noPassword = loginSchema.safeParse({ username: "admin" });
    assert.ok(!noPassword.success);

    const empty = loginSchema.safeParse({});
    assert.ok(!empty.success);
  });

  it("itemStateSchema allows partial updates", async () => {
    const { itemStateSchema } = await import("@/lib/schemas");
    const read = itemStateSchema.safeParse({ read: true });
    assert.ok(read.success);

    const bookmarked = itemStateSchema.safeParse({ bookmarked: false });
    assert.ok(bookmarked.success);

    const both = itemStateSchema.safeParse({ read: true, bookmarked: true });
    assert.ok(both.success);

    const empty = itemStateSchema.safeParse({});
    assert.ok(empty.success);
  });

  it("settingsSchema validates theme values", async () => {
    const { settingsSchema } = await import("@/lib/schemas");
    const valid = settingsSchema.safeParse({ theme: "DARK" });
    assert.ok(valid.success);

    const invalid = settingsSchema.safeParse({ theme: "NEON" });
    assert.ok(!invalid.success);
  });

  it("settingsSchema rejects retention days below 14", async () => {
    const { settingsSchema } = await import("@/lib/schemas");
    const tooLow = settingsSchema.safeParse({ itemRetentionDays: 7 });
    assert.ok(!tooLow.success);

    const valid = settingsSchema.safeParse({ itemRetentionDays: 30 });
    assert.ok(valid.success);
  });

  it("feedSchema requires valid sourceUrl", async () => {
    const { feedSchema } = await import("@/lib/schemas");
    const valid = feedSchema.safeParse({ sourceUrl: "https://example.com/feed.xml" });
    assert.ok(valid.success);
    const withIconHint = feedSchema.safeParse({
      sourceUrl: "https://example.com/feed.xml",
      iconHintUrl: "https://cdn.example.com/icon.png",
    });
    assert.ok(withIconHint.success);

    const invalid = feedSchema.safeParse({ sourceUrl: "not-a-url" });
    assert.ok(!invalid.success);
  });

  it("folderSchema validates title length", async () => {
    const { folderSchema } = await import("@/lib/schemas");
    const valid = folderSchema.safeParse({ title: "Tech" });
    assert.ok(valid.success);

    const empty = folderSchema.safeParse({ title: "" });
    assert.ok(!empty.success);

    const tooLong = folderSchema.safeParse({ title: "x".repeat(81) });
    assert.ok(!tooLong.success);
  });

  it("searchSchema trims and caps query length", async () => {
    const { searchSchema } = await import("@/lib/schemas");
    const valid = searchSchema.safeParse({ q: "  hello  " });
    assert.ok(valid.success);
    if (valid.success) {
      assert.equal(valid.data.q, "hello");
    }

    const tooLong = searchSchema.safeParse({ q: "x".repeat(241) });
    assert.ok(!tooLong.success);
  });

  it("updateFeedSchema allows partial updates", async () => {
    const { updateFeedSchema } = await import("@/lib/schemas");
    const label = updateFeedSchema.safeParse({ label: "My Feed" });
    assert.ok(label.success);

    const pinned = updateFeedSchema.safeParse({ isPinned: true });
    assert.ok(pinned.success);

    const empty = updateFeedSchema.safeParse({});
    assert.ok(empty.success);
  });
});
