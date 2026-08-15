import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeHeaderOffset } from "./use-auto-hide-header";

describe("computeHeaderOffset", () => {
	it("snaps fractional scroll-scaled offsets to whole pixels", () => {
		// delta * SCROLL_TO_HEADER_RATIO (0.48) accumulates fractions like
		// 37.41999… — iOS rasterises fractional translateY off the pixel grid.
		assert.equal(computeHeaderOffset(37.419999999999995, 96), 37);
		assert.equal(computeHeaderOffset(0.47999999999999996, 96), 0);
		assert.equal(computeHeaderOffset(45.5, 96), 46);
	});

	it("clamps negative offsets to 0 (header always fully visible at top)", () => {
		assert.equal(computeHeaderOffset(-24.8, 96), 0);
	});

	it("clamps to the max offset (header height * 2.1)", () => {
		assert.equal(computeHeaderOffset(10_000, 96), Math.round(96 * 2.1));
	});

	it("treats a zero measured header height as 1px to avoid a 0 max", () => {
		assert.equal(computeHeaderOffset(50, 0), 2);
	});
});
