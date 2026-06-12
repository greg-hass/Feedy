-- Align the database default with the application's 15 minute refresh cadence.
ALTER TABLE "Settings"
ALTER COLUMN "refreshIntervalMinutes" SET DEFAULT 15;
