import assert from "node:assert/strict";
import { describe, it } from "node:test";

import manifest from "@/app/manifest";

describe("PWA manifest", () => {
	it("keeps the standalone launch surface aligned with the dark app background", () => {
		const appManifest = manifest();

		assert.equal(appManifest.display, "standalone");
		assert.equal(appManifest.background_color, "#0a0a0a");
		assert.equal(appManifest.theme_color, "#0a0a0a");
	});
});
