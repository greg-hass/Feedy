import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const cssSource = readFileSync(
	new URL("../app/globals.css", import.meta.url),
	"utf8",
);
const shellSource = readFileSync(
	new URL("../components/app-shell.tsx", import.meta.url),
	"utf8",
);

describe("Theme contract", () => {
	it("defines a --nav-inactive token", () => {
		assert.match(cssSource, /--nav-inactive:/);
	});

	it("uses green for --success in light mode", () => {
		assert.match(cssSource, /--success:\s*#(?:059669|10b981|34d399)/i);
	});

	it("does not hard-code white for inactive navigation", () => {
		assert.doesNotMatch(shellSource, /active \? "var\(--accent\)" : "#ffffff"/);
	});

	it("uses --nav-inactive for inactive navigation", () => {
		assert.match(shellSource, /var\(--nav-inactive\)/);
	});

	it("exposes aria-current on the active nav link", () => {
		assert.match(shellSource, /aria-current=\{active \? "page" : undefined\}/);
	});
});
