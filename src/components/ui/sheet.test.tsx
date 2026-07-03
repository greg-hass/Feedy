import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import { Sheet, isEscapeKey, findFirstFocusable } from "./sheet";

describe("Sheet static markup", () => {
	it("renders dialog semantics", () => {
		const html = renderToStaticMarkup(
			React.createElement(
				Sheet,
				{ title: "Edit feed", onClose: () => undefined },
				React.createElement("button", null, "Save"),
			),
		);

		assert.match(html, /role="dialog"/);
		assert.match(html, /aria-modal="true"/);
		assert.match(html, /aria-labelledby="[^"]+"/);
	});

	it("connects the title through aria-labelledby", () => {
		const html = renderToStaticMarkup(
			React.createElement(Sheet, {
				title: "Edit folder",
				onClose: () => undefined,
			}),
		);

		const labelledByMatch = html.match(/aria-labelledby="([^"]+)"/);
		assert.ok(labelledByMatch, "aria-labelledby must be present");
		const id = labelledByMatch[1];
		assert.match(
			html,
			new RegExp(`id="${id}"[^>]*>\\s*Edit folder`),
			"the labelled-by id must point to an element containing the title",
		);
	});

	it("renders a close button with an accessible name", () => {
		const html = renderToStaticMarkup(
			React.createElement(Sheet, {
				title: "Feed health",
				onClose: () => undefined,
			}),
		);

		assert.match(html, /aria-label="Close Feed health"/);
	});

	it("renders a backdrop element", () => {
		const html = renderToStaticMarkup(
			React.createElement(Sheet, {
				title: "Move feeds",
				onClose: () => undefined,
			}),
		);

		// The backdrop is the outer fixed-position div
		assert.match(html, /fixed inset-0 z-50/);
	});
});

describe("isEscapeKey", () => {
	it("returns true for Escape", () => {
		assert.equal(isEscapeKey({ key: "Escape" }), true);
	});

	it("returns false for other keys", () => {
		assert.equal(isEscapeKey({ key: "Enter" }), false);
		assert.equal(isEscapeKey({ key: "Tab" }), false);
		assert.equal(isEscapeKey({ key: "a" }), false);
	});
});

describe("findFirstFocusable", () => {
	it("returns null when container is null", () => {
		assert.equal(findFirstFocusable(null), null);
	});

	it("finds the first focusable element in a DOM", () => {
		const dom = new JSDOM(
			'<!DOCTYPE html><body><p>Not focusable</p><button>First</button><a href="#">Second</a><input type="text" /></body>',
		);
		const div = dom.window.document.body;
		const result = findFirstFocusable(div);
		assert.ok(result);
		assert.equal(result?.tagName, "BUTTON");
	});

	it("skips disabled elements", () => {
		const dom = new JSDOM(
			"<!DOCTYPE html><body><button disabled>Disabled</button><button>Enabled</button></body>",
		);
		const div = dom.window.document.body;
		const result = findFirstFocusable(div);
		assert.ok(result);
		assert.equal(result?.textContent, "Enabled");
	});
});
