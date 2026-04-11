ALTER TABLE "Feed"
ADD COLUMN "muteRules" JSONB;

ALTER TABLE "Item"
ADD COLUMN "mutedByRule" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Item_mutedByRule_discoveredAt_idx"
ON "Item"("mutedByRule", "discoveredAt" DESC);
