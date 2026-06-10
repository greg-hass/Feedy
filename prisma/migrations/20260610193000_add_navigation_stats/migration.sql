CREATE TABLE "NavigationStats" (
  "userId" TEXT NOT NULL,
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "savedCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NavigationStats_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "NavigationStats"
ADD CONSTRAINT "NavigationStats_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "NavigationStats" ("userId", "unreadCount", "savedCount")
SELECT u."id", 0, 0
FROM "User" u
ON CONFLICT ("userId") DO NOTHING;
