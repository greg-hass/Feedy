import assert from "node:assert/strict";
import { it } from "node:test";
import { JSDOM } from "jsdom";

import {
	freezeListScrollPosition,
	saveListScrollPosition,
} from "./use-list-scroll-restoration";

it("does not let the outgoing navigation reset overwrite a frozen list position", () => {
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "https://feedy.test/app/feeds",
	});
	const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
	const previousDocument = Object.getOwnPropertyDescriptor(
		globalThis,
		"document",
	);

	Object.defineProperty(globalThis, "window", {
		value: dom.window,
		configurable: true,
	});
	Object.defineProperty(globalThis, "document", {
		value: dom.window.document,
		configurable: true,
	});
	Object.defineProperty(dom.window, "scrollY", {
		value: 780,
		configurable: true,
	});

	try {
		freezeListScrollPosition("feedy-feeds-scroll");
		assert.equal(
			dom.window.sessionStorage.getItem("feedy-feeds-scroll"),
			"780",
		);

		Object.defineProperty(dom.window, "scrollY", {
			value: 0,
			configurable: true,
		});
		saveListScrollPosition("feedy-feeds-scroll");

		assert.equal(
			dom.window.sessionStorage.getItem("feedy-feeds-scroll"),
			"780",
		);
	} finally {
		if (previousWindow) {
			Object.defineProperty(globalThis, "window", previousWindow);
		} else {
			Reflect.deleteProperty(globalThis, "window");
		}
		if (previousDocument) {
			Object.defineProperty(globalThis, "document", previousDocument);
		} else {
			Reflect.deleteProperty(globalThis, "document");
		}
		dom.window.close();
	}
});
