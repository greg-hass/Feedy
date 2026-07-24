import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getYouTubeWatchUrl } from "@/lib/media/youtube-url";

describe("getYouTubeWatchUrl", () => {
	it("builds a safe YouTube watch URL", () => {
		assert.equal(
			getYouTubeWatchUrl("video&id"),
			"https://www.youtube.com/watch?v=video%26id",
		);
	});
});
