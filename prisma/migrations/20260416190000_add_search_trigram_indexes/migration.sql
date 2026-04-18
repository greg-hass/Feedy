CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Feed search: keep the existing contains-based behavior, but make it indexable.
CREATE INDEX IF NOT EXISTS "Feed_userId_isPinned_updatedAt_idx"
ON "public"."Feed"("userId", "isPinned" DESC, "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "Feed_title_trgm_idx"
ON "public"."Feed" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Feed_label_trgm_idx"
ON "public"."Feed" USING gin ("label" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Feed_description_trgm_idx"
ON "public"."Feed" USING gin ("description" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Feed_siteUrl_trgm_idx"
ON "public"."Feed" USING gin ("siteUrl" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Feed_sourceUrl_trgm_idx"
ON "public"."Feed" USING gin ("sourceUrl" gin_trgm_ops);

-- Timeline search: item text fields stay on the same contains semantics, but get trigram support.
CREATE INDEX IF NOT EXISTS "Item_title_trgm_idx"
ON "public"."Item" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Item_summary_trgm_idx"
ON "public"."Item" USING gin ("summary" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Item_author_trgm_idx"
ON "public"."Item" USING gin ("author" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Item_contentHtml_trgm_idx"
ON "public"."Item" USING gin ("contentHtml" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Item_readabilityHtml_trgm_idx"
ON "public"."Item" USING gin ("readabilityHtml" gin_trgm_ops);
