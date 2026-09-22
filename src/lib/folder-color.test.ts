import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	folderDotColor,
	folderDotHue,
	getFeedFolderColorMap,
} from "@/lib/folder-color";

describe("folderDotHue", () => {
	it("is deterministic for a given title", () => {
		assert.equal(folderDotHue("News"), folderDotHue("News"));
	});

	it("stays inside the hue range", () => {
		for (const seed of ["", "a", "News", "r/worldnews", "🔥 folder"]) {
			const hue = folderDotHue(seed);
			assert.ok(hue >= 0 && hue < 360, `${seed} -> ${hue}`);
			assert.ok(Number.isInteger(hue));
		}
	});

	it("produces stable known values", () => {
		assert.equal(folderDotHue("News"), 182);
		assert.equal(folderDotHue("YouTube"), 166);
		assert.equal(folderDotHue("r/worldnews"), 205);
		assert.equal(folderDotHue("Tech longreads"), 154);
	});
});

describe("folderDotColor", () => {
	it("renders the hue as an hsl colour string", () => {
		assert.equal(folderDotColor("News"), "hsl(182, 62%, 52%)");
	});
});

describe("getFeedFolderColorMap", () => {
	const navigation = {
		folders: [
			{ id: "folder-1", title: "News" },
			{ id: "folder-2", title: "YouTube" },
		],
		feeds: [
			{ id: "feed-1", folderId: "folder-1" },
			{ id: "feed-2", folderId: "folder-2" },
			{ id: "feed-3", folderId: null },
			{ id: "feed-4", folderId: "missing-folder" },
		],
	};

	it("colours only feeds with a resolvable folder", () => {
		const map = getFeedFolderColorMap(navigation);
		assert.equal(map.size, 2);
		assert.equal(map.get("feed-1"), "hsl(182, 62%, 52%)");
		assert.equal(map.get("feed-2"), "hsl(166, 62%, 52%)");
		assert.equal(map.has("feed-3"), false);
		assert.equal(map.has("feed-4"), false);
	});

	it("returns an empty map for missing navigation", () => {
		assert.equal(getFeedFolderColorMap(null).size, 0);
		assert.equal(getFeedFolderColorMap(undefined).size, 0);
	});

	it("memoises on the navigation reference", () => {
		assert.equal(getFeedFolderColorMap(navigation), getFeedFolderColorMap(navigation));

		const next = { ...navigation, feeds: navigation.feeds.slice(0, 1) };
		const map = getFeedFolderColorMap(next);
		assert.equal(map.size, 1);
		assert.notEqual(map, getFeedFolderColorMap(navigation));
	});
});
