import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const loginSource = readFileSync(
	new URL("../components/login-form.tsx", import.meta.url),
	"utf8",
);
const discoverSource = readFileSync(
	new URL("../components/discover-screen.tsx", import.meta.url),
	"utf8",
);
const settingsSource = readFileSync(
	new URL("../components/settings-screen.tsx", import.meta.url),
	"utf8",
);

describe("Async feedback contracts", () => {
	describe("Login form", () => {
		it("announces errors with role alert", () => {
			assert.match(loginSource, /role="alert"/);
		});

		it("keeps the password toggle keyboard-focusable", () => {
			assert.doesNotMatch(loginSource, /tabIndex=\{-1\}/);
		});
	});

	describe("Discover screen", () => {
		it("gives the search input an accessible label", () => {
			assert.match(discoverSource, /aria-label="Search/);
		});

		it("surfaces add-feed errors with role alert", () => {
			assert.match(discoverSource, /role="alert"/);
		});
	});

	describe("Settings screen", () => {
		it("exposes a polite live region for mutation feedback", () => {
			assert.match(settingsSource, /aria-live="polite"/);
		});

		it("exposes error feedback with role alert", () => {
			assert.match(settingsSource, /settings\.error \? "alert"/);
		});

		it("exposes aria-pressed on cadence options", () => {
			assert.match(settingsSource, /aria-pressed/);
		});

		it("presents a single import/export action", () => {
			// Should not have two separate links to the same page
			const importExportLinks =
				settingsSource.match(/\/app\/import-export/g) ?? [];
			assert.equal(
				importExportLinks.length,
				1,
				"Expected exactly one import/export link",
			);
		});
	});
});
