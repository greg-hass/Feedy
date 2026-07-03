import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
	new URL("../components/timeline-refresh-toast.tsx", import.meta.url),
	"utf8",
);
const unreadSource = readFileSync(
	new URL("../components/unread-screen.tsx", import.meta.url),
	"utf8",
);

describe("TimelineRefreshToast", () => {
	it("renders one compact action without dialog copy", () => {
		assert.match(source, /formatTimelineRefreshLabel\(count\)/);
		assert.doesNotMatch(source, /The timeline stayed in place/);
		assert.doesNotMatch(source, />Dismiss</);
		assert.doesNotMatch(source, /View new articles/);
	});

	it("auto-dismisses after five seconds and clears its timer", () => {
		assert.match(
			source,
			/window\.setTimeout\(\(\) => onDismissRef\.current\(\), 5_000\)/,
		);
		assert.match(source, /window\.clearTimeout\(timer\)/);
	});

	it("announces politely without taking focus", () => {
		assert.match(source, /aria-live="polite"/);
		assert.match(
			source,
			/aria-label=\{formatTimelineRefreshLabel\(count\)\}/,
		);
	});

	it("scrolls only the captured target and has no fallback movement", () => {
		assert.match(
			unreadSource,
			/if \(!element\) \{\s*setRefreshToast\(null\);\s*return;\s*\}/,
		);
		assert.match(
			unreadSource,
			/window\.matchMedia\(\s*"\(prefers-reduced-motion: reduce\)",?\s*\)/,
		);
		assert.match(unreadSource, /element\.scrollIntoView/);
		assert.doesNotMatch(unreadSource, /window\.scrollTo/);
	});
});
