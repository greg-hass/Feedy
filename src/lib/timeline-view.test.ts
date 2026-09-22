import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	getStoredTimelineView,
	isTimelineView,
	timelineListClassName,
} from "@/lib/timeline-view";

describe("isTimelineView", () => {
	it("accepts both view names", () => {
		assert.equal(isTimelineView("cards"), true);
		assert.equal(isTimelineView("compact"), true);
	});

	it("rejects anything else", () => {
		assert.equal(isTimelineView("flat"), false);
		assert.equal(isTimelineView(""), false);
		assert.equal(isTimelineView(null), false);
	});
});

describe("getStoredTimelineView", () => {
	it("defaults to cards outside the browser", () => {
		assert.equal(getStoredTimelineView(), "cards");
	});
});

describe("timelineListClassName", () => {
	it("uses the two-column grid at 744px+ in both views", () => {
		for (const className of [
			timelineListClassName("cards"),
			timelineListClassName("compact"),
		]) {
			assert.match(className, /min-\[744px\]:grid-cols-2/);
			assert.match(className, /min-\[744px\]:space-y-0/);
		}
	});

	it("packs compact rows tighter than cards", () => {
		assert.match(timelineListClassName("cards"), /space-y-3/);
		assert.match(timelineListClassName("compact"), /space-y-2/);
	});
});
