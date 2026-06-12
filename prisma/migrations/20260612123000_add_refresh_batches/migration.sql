CREATE TYPE "RefreshBatchStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

CREATE TABLE "RefreshBatch" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "RefreshBatchStatus" NOT NULL DEFAULT 'QUEUED',
  "totalFeeds" INTEGER NOT NULL DEFAULT 0,
  "queued" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "succeeded" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefreshBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RefreshBatch"
ADD CONSTRAINT "RefreshBatch_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "RefreshBatch_userId_createdAt_idx"
ON "RefreshBatch"("userId", "createdAt" DESC);

CREATE INDEX "RefreshBatch_userId_status_createdAt_idx"
ON "RefreshBatch"("userId", "status", "createdAt" DESC);
