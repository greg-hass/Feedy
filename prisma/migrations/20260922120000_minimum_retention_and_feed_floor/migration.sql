ALTER TABLE "Settings"
ALTER COLUMN "itemRetentionDays" SET DEFAULT 30;

UPDATE "Settings"
SET "itemRetentionDays" = 30
WHERE "itemRetentionDays" < 30;
