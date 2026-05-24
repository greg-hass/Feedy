import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatImportSummary } from "@/lib/import-export-ui";

describe("formatImportSummary", () => {
  it("reports imported, duplicate, folder, and failed results", () => {
    assert.equal(
      formatImportSummary({
        imported: 2,
        duplicates: 1,
        foldersCreated: 3,
        failed: 1,
      }),
      "2 imported · 1 duplicates skipped · 3 folders created · 1 failed",
    );
  });

  it("omits failed results when no entries fail", () => {
    assert.equal(
      formatImportSummary({
        imported: 4,
        duplicates: 0,
        foldersCreated: 0,
        failed: 0,
      }),
      "4 imported · 0 duplicates skipped · 0 folders created",
    );
  });
});
