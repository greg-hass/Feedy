import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDiscoverySearchQueries,
  buildYoutubeSearchQueries,
  compactDiscoveryKeyword,
  normalizeDiscoveryKeyword,
  normalizeYoutubeIdentity,
} from "@/lib/feed/discover-utils";

describe("discover utils", () => {
  it("normalizes keywords consistently", () => {
    assert.equal(normalizeDiscoveryKeyword("  OpenAI / News  "), "openai news");
    assert.equal(compactDiscoveryKeyword("OpenAI / News"), "openainews");
  });

  it("builds a compact set of search queries", () => {
    assert.deepEqual(buildDiscoverySearchQueries("Open AI news", 5), [
      "Open AI news",
      "open ai news",
      "openainews",
      "open",
      "openan",
    ]);
  });

  it("prioritizes useful youtube queries", () => {
    const queries = buildYoutubeSearchQueries("Open AI news");
    assert.equal(queries[0], "openn");
    assert.equal(queries[1], "@openn");
    assert.ok(queries.includes("openainews"));
  });

  it("strips youtube noise from identities", () => {
    assert.equal(normalizeYoutubeIdentity("OpenAI official channel 2025"), "openai");
  });
});
