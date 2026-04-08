-- Feed lookup and timeline filtering
CREATE INDEX "Feed_userId_siteUrl_idx" ON "public"."Feed"("userId", "siteUrl");
CREATE INDEX "Feed_userId_excludeFromTimeline_sourceType_idx"
ON "public"."Feed"("userId", "excludeFromTimeline", "sourceType");

-- Timeline ordering within a feed
DROP INDEX IF EXISTS "Item_feedId_publishedAt_idx";
CREATE INDEX "Item_feedId_publishedAt_discoveredAt_idx"
ON "public"."Item"("feedId", "publishedAt" DESC, "discoveredAt" DESC);

-- Fast unread/bookmark existence checks from item-first joins
CREATE INDEX "ReadState_itemId_userId_idx" ON "public"."ReadState"("itemId", "userId");
CREATE INDEX "Bookmark_itemId_userId_idx" ON "public"."Bookmark"("itemId", "userId");

-- Refresh status and batch tracking
CREATE INDEX "RefreshJob_userId_status_requestedAt_idx"
ON "public"."RefreshJob"("userId", "status", "requestedAt" DESC);
CREATE INDEX "RefreshJob_userId_batchId_idx"
ON "public"."RefreshJob"("userId", (metadata->>'batchId'));
