import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeHtmlEntities } from "@/lib/utils";

describe("decodeHtmlEntities", () => {
	it("decodes named entities", () => {
		assert.equal(decodeHtmlEntities("Tom &amp; Jerry"), "Tom & Jerry");
	});

	it("decodes decimal numeric entities", () => {
		assert.equal(decodeHtmlEntities("eBay&#8217;s saga"), "eBay’s saga");
	});

	it("decodes hex numeric entities", () => {
		assert.equal(decodeHtmlEntities("eBay&#x2019;s saga"), "eBay’s saga");
	});

	it("decodes double-encoded entities", () => {
		assert.equal(decodeHtmlEntities("eBay&amp;#8217;s saga"), "eBay’s saga");
	});

	it("leaves out-of-range code points as empty", () => {
		assert.equal(decodeHtmlEntities("bad &#9999999999; value"), "bad  value");
	});

	it("returns empty string for nullish input", () => {
		assert.equal(decodeHtmlEntities(null), "");
		assert.equal(decodeHtmlEntities(undefined), "");
	});
});
