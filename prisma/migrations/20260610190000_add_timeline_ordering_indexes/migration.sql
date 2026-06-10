-- Align timeline pagination with the query order used by the app.
CREATE INDEX "Item_feedId_publishedAt_id_idx"
ON "Item" ("feedId", "publishedAt" DESC, "id" DESC);

CREATE INDEX "Item_publishedAt_id_idx"
ON "Item" ("publishedAt" DESC, "id" DESC);
