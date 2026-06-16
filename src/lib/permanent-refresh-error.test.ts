import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isPermanentRefreshError } from "@/lib/permanent-refresh-error";

describe("isPermanentRefreshError", () => {
	describe("HTTP status errors (our own format)", () => {
		for (const status of [401, 403, 404, 410, 422]) {
			it(`returns true for "Feed returned ${status}"`, () => {
				assert.ok(
					isPermanentRefreshError(new Error(`Feed returned ${status}`)),
				);
			});
		}

		it("returns false for transient HTTP statuses (429, 500, 502, 503)", () => {
			for (const status of [429, 500, 502, 503]) {
				assert.ok(
					!isPermanentRefreshError(new Error(`Feed returned ${status}`)),
					`Expected false for status ${status}`,
				);
			}
		});
	});

	describe("rss-parser structural errors (library-coupled)", () => {
		it("returns true for 'Feed not recognized as RSS 1 or 2.'", () => {
			assert.ok(
				isPermanentRefreshError(
					new Error("Feed not recognized as RSS 1 or 2."),
				),
			);
		});

		it("returns true for 'Unexpected close tag'", () => {
			assert.ok(
				isPermanentRefreshError(
					new Error("Unexpected close tag\nLine: 12\nColumn: 5"),
				),
			);
		});

		it("returns true for 'Invalid character in entity name'", () => {
			assert.ok(
				isPermanentRefreshError(new Error("Invalid character in entity name")),
			);
		});
	});

	describe("transient / non-permanent errors", () => {
		it("returns false for network timeout errors", () => {
			assert.ok(!isPermanentRefreshError(new Error("ETIMEDOUT")));
			assert.ok(
				!isPermanentRefreshError(
					new Error("fetch failed: connect ECONNREFUSED"),
				),
			);
		});

		it("returns false for undefined", () => {
			assert.ok(!isPermanentRefreshError(undefined));
		});

		it("returns false for non-Error values", () => {
			assert.ok(!isPermanentRefreshError("something went wrong"));
			assert.ok(!isPermanentRefreshError(42));
			assert.ok(!isPermanentRefreshError(null));
		});
	});
});
