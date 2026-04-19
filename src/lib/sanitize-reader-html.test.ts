import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitizeReaderHtml } from "@/lib/sanitize-reader-html";

describe("sanitizeReaderHtml", () => {
  it("removes script tags and event handlers", () => {
    const dirty = `<p>Hello <script>alert(1)</script><img src="https://example.com/x.png" onerror="alert(2)"><a href="https://example.com" onclick="alert(3)">link</a></p>`;
    const clean = sanitizeReaderHtml(dirty);

    assert.equal(clean.includes("<script>"), false);
    assert.equal(clean.includes("onerror"), false);
    assert.equal(clean.includes("onclick"), false);
    assert.match(
      clean,
      /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">link<\/a>/,
    );
  });
});
