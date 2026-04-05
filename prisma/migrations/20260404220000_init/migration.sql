-- CreateEnum
CREATE TYPE "FeedSourceType" AS ENUM ('RSS', 'ATOM', 'REDDIT_RSS', 'YOUTUBE_CHANNEL_RSS', 'YOUTUBE_PLAYLIST_RSS', 'YOUTUBE_RSS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FeedHealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'ERROR', 'PENDING');

-- CreateEnum
CREATE TYPE "JobTrigger" AS ENUM ('MANUAL', 'AUTO', 'IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportExportType" AS ENUM ('OPML_IMPORT', 'OPML_EXPORT', 'JSON_EXPORT');

-- CreateEnum
CREATE TYPE "ImportExportStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theme" "ThemePreference" NOT NULL DEFAULT 'SYSTEM',
    "refreshIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "autoRefreshEnabled" BOOLEAN NOT NULL DEFAULT true,
    "readerOpenOriginalByDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Feed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT,
    "title" TEXT NOT NULL,
    "label" TEXT,
    "description" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "siteUrl" TEXT,
    "sourceType" "FeedSourceType" NOT NULL DEFAULT 'UNKNOWN',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "refreshIntervalMinutes" INTEGER,
    "lastRefreshedAt" TIMESTAMP(3),
    "lastSuccessfulRefreshAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastError" TEXT,
    "healthStatus" "FeedHealthStatus" NOT NULL DEFAULT 'PENDING',
    "etag" TEXT,
    "lastModified" TEXT,
    "iconHintUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Feed_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedIcon" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "mimeType" TEXT,
    "storagePath" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeedIcon_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "uniqueKey" TEXT NOT NULL,
    "guid" TEXT,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "contentHtml" TEXT,
    "readabilityHtml" TEXT,
    "author" TEXT,
    "canonicalUrl" TEXT,
    "commentsUrl" TEXT,
    "mediaUrl" TEXT,
    "youtubeVideoId" TEXT,
    "redditPermalink" TEXT,
    "publishedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReadState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReadState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "bookmarkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefreshJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "feedId" TEXT,
    "trigger" "JobTrigger" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,
    CONSTRAINT "RefreshJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefreshLog" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "newItems" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "metadata" JSONB,
    CONSTRAINT "RefreshLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportExportRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ImportExportType" NOT NULL,
    "status" "ImportExportStatus" NOT NULL DEFAULT 'QUEUED',
    "filename" TEXT,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ImportExportRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "Settings_userId_key" ON "Settings"("userId");
CREATE INDEX "Folder_userId_position_idx" ON "Folder"("userId", "position");
CREATE INDEX "Feed_userId_folderId_position_idx" ON "Feed"("userId", "folderId", "position");
CREATE INDEX "Feed_userId_isPinned_position_idx" ON "Feed"("userId", "isPinned", "position");
CREATE INDEX "Feed_lastRefreshedAt_idx" ON "Feed"("lastRefreshedAt");
CREATE UNIQUE INDEX "Feed_userId_sourceUrl_key" ON "Feed"("userId", "sourceUrl");
CREATE UNIQUE INDEX "FeedIcon_feedId_key" ON "FeedIcon"("feedId");
CREATE UNIQUE INDEX "Item_uniqueKey_key" ON "Item"("uniqueKey");
CREATE INDEX "Item_feedId_publishedAt_idx" ON "Item"("feedId", "publishedAt" DESC);
CREATE INDEX "Item_discoveredAt_idx" ON "Item"("discoveredAt" DESC);
CREATE INDEX "ReadState_userId_lastReadAt_idx" ON "ReadState"("userId", "lastReadAt" DESC);
CREATE UNIQUE INDEX "ReadState_userId_itemId_key" ON "ReadState"("userId", "itemId");
CREATE INDEX "Bookmark_userId_bookmarkedAt_idx" ON "Bookmark"("userId", "bookmarkedAt" DESC);
CREATE UNIQUE INDEX "Bookmark_userId_itemId_key" ON "Bookmark"("userId", "itemId");
CREATE INDEX "RefreshJob_feedId_requestedAt_idx" ON "RefreshJob"("feedId", "requestedAt" DESC);
CREATE INDEX "RefreshLog_feedId_startedAt_idx" ON "RefreshLog"("feedId", "startedAt" DESC);
CREATE INDEX "ImportExportRecord_userId_createdAt_idx" ON "ImportExportRecord"("userId", "createdAt" DESC);

ALTER TABLE "Settings" ADD CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Feed" ADD CONSTRAINT "Feed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Feed" ADD CONSTRAINT "Feed_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeedIcon" ADD CONSTRAINT "FeedIcon_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "Feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Item" ADD CONSTRAINT "Item_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "Feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReadState" ADD CONSTRAINT "ReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReadState" ADD CONSTRAINT "ReadState_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshJob" ADD CONSTRAINT "RefreshJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefreshJob" ADD CONSTRAINT "RefreshJob_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "Feed"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefreshLog" ADD CONSTRAINT "RefreshLog_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "Feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportExportRecord" ADD CONSTRAINT "ImportExportRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
