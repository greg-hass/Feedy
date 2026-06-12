-- Support the default unread timeline query without indexing muted/null-dated rows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Item_unread_timeline_idx"
ON "Item" ("publishedAt" DESC, "id" DESC, "feedId")
WHERE "mutedByRule" = false
  AND "publishedAt" IS NOT NULL;
