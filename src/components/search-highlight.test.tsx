import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SearchHighlight } from "@/components/search-highlight";

describe("SearchHighlight", () => {
  it("wraps matching text and leaves the rest alone", () => {
    const markup = renderToStaticMarkup(
      <SearchHighlight text="Claude design notes" query="design" />,
    );

    assert.match(markup, /<mark[^>]*>design<\/mark>/);
    assert.match(markup, /Claude/);
    assert.match(markup, /notes/);
  });
});
