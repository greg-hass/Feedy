import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const librarySource = readFileSync(
	new URL("../components/feed-library-components.tsx", import.meta.url),
	"utf8",
);

describe("Feeds UI contracts", () => {
	it("offers pause or resume from feed swipe actions", () => {
		assert.match(librarySource, /getFeedPauseActionLabel/);
		assert.match(librarySource, /getFeedPausePatch/);
		assert.match(librarySource, /aria-label=\{`\$\{pauseLabel\}/);
	});

	it("marks paused feeds without relying on color alone", () => {
		assert.match(librarySource, /aria-label="Paused"/);
		assert.match(librarySource, />Paused</);
	});
});
