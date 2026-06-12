import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAllRefreshFeedWhere, buildFolderRefreshFeedWhere } from "@/lib/refresh-scope";

describe("refresh feed scopes", () => {
  it("scopes folder refresh to the selected folder for the current user", () => {
    assert.deepEqual(buildFolderRefreshFeedWhere("user-1", "folder-1"), {
      userId: "user-1",
      folderId: "folder-1",
    });
  });

  it("keeps full refresh scoped only to the current user", () => {
    assert.deepEqual(buildAllRefreshFeedWhere("user-1"), {
      userId: "user-1",
    });
  });
});
