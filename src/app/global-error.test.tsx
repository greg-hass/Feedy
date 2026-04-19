import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import GlobalError from "@/app/global-error";

describe("GlobalError", () => {
  it("renders a retry button and safe message", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlobalError, {
        error: new Error("boom"),
        reset: () => {},
      }),
    );

    assert.match(markup, /Something went wrong/);
    assert.match(markup, /Try again/);
  });
});
