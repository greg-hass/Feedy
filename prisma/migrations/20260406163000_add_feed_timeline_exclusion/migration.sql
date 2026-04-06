ALTER TABLE "Feed"
ADD COLUMN "excludeFromTimeline" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Feed_userId_excludeFromTimeline_idx"
ON "Feed"("userId", "excludeFromTimeline");
