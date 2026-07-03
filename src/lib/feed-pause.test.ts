import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	getFeedPauseActionLabel,
	getFeedPausePatch,
} from "@/lib/feed-pause";

describe("feed pause semantics", () => {
	it("builds a pause request for an active feed", () => {
		assert.deepEqual(getFeedPausePatch(false), {
			excludeFromTimeline: true,
		});
		assert.equal(getFeedPauseActionLabel(false), "Pause");
	});

	it("builds a resume request for a paused feed", () => {
		assert.deepEqual(getFeedPausePatch(true), {
			excludeFromTimeline: false,
		});
		assert.equal(getFeedPauseActionLabel(true), "Resume");
	});
});
