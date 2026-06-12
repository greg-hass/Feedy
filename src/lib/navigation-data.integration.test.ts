import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";

import { hasIntegrationTestEnv } from "@/lib/integration-test-env";
import { getNavigationData } from "@/lib/navigation-data";

const shouldRun = hasIntegrationTestEnv();
const testDescribe = shouldRun ? describe : describe.skip;

testDescribe("navigation data integration", () => {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL!;

  let prisma: PrismaClient | null = null;

  after(async () => {
    await prisma?.$disconnect().catch(() => null);
  });

  it("loads counts, library stats, and feed performance from real SQL", async () => {
    process.env.DATABASE_URL = testDatabaseUrl;

    prisma = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    } as never);

    const unique = `it-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const user = await prisma.user.create({
      data: {
        username: `nav-${unique}`,
        passwordHash: "hash",
        settings: {
          create: {
            theme: "SYSTEM",
            accentColor: "EMERALD",
            itemRetentionDays: 90,
            hideYouTubeShorts: false,
            refreshIntervalMinutes: 15,
          },
        },
      },
    });

    const folder = await prisma.folder.create({
      data: {
        userId: user.id,
        title: `Folder ${unique}`,
        position: 0,
      },
    });

    const feedOne = await prisma.feed.create({
      data: {
        userId: user.id,
        folderId: folder.id,
        title: `Feed One ${unique}`,
        sourceUrl: `https://example.com/one-${unique}.xml`,
        healthStatus: "DEGRADED",
      },
    });

    const feedTwo = await prisma.feed.create({
      data: {
        userId: user.id,
        title: `Feed Two ${unique}`,
        sourceUrl: `https://example.com/two-${unique}.xml`,
      },
    });

    const itemOne = await prisma.item.create({
      data: {
        feedId: feedOne.id,
        uniqueKey: `item-one-${unique}`,
        title: `Unread item ${unique}`,
        summary: "summary",
        publishedAt: twoHoursAgo,
      },
    });

    const itemTwo = await prisma.item.create({
      data: {
        feedId: feedOne.id,
        uniqueKey: `item-two-${unique}`,
        title: `Read item ${unique}`,
        summary: "summary",
        publishedAt: threeHoursAgo,
      },
    });

    const itemThree = await prisma.item.create({
      data: {
        feedId: feedTwo.id,
        uniqueKey: `item-three-${unique}`,
        title: `Saved item ${unique}`,
        summary: "summary",
        publishedAt: twoDaysAgo,
      },
    });

    const slowDuration = 5_000;

    await prisma.readState.create({
      data: {
        userId: user.id,
        itemId: itemTwo.id,
      },
    });

    await prisma.bookmark.create({
      data: {
        userId: user.id,
        itemId: itemThree.id,
      },
    });

    await prisma.refreshLog.create({
      data: {
        feedId: feedOne.id,
        status: "SUCCEEDED",
        startedAt: twoHoursAgo,
        finishedAt: new Date(twoHoursAgo.getTime() + slowDuration),
      },
    });

    await prisma.refreshLog.create({
      data: {
        feedId: feedOne.id,
        status: "SUCCEEDED",
        startedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
        finishedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000 + slowDuration),
      },
    });

    try {
      const data = await getNavigationData(user.id, prisma);

      assert.equal(data.folders.length, 1);
      assert.equal(data.folders[0]?.counts.articleCount, 2);
      assert.equal(data.folders[0]?.counts.unreadCount, 1);
      assert.equal(data.folders[0]?.counts.feedCount, 1);
      assert.equal(data.folders[0]?.counts.issueCount, 1);
      assert.equal(data.folders[0]?.counts.slowFeedCount, 1);

      const feedOneData = data.feeds.find((feed) => feed.id === feedOne.id);
      const feedTwoData = data.feeds.find((feed) => feed.id === feedTwo.id);

      assert.equal(feedOneData?.counts.totalCount, 2);
      assert.equal(feedOneData?.counts.unreadCount, 1);
      assert.equal(feedOneData?.performance.latestDurationMs, slowDuration);
      assert.equal(feedOneData?.performance.slowCount24h, 1);
      assert.equal(feedOneData?.performance.isSlow, true);

      assert.equal(feedTwoData?.counts.totalCount, 1);
      assert.equal(feedTwoData?.counts.unreadCount, 1);

      assert.equal(data.stats.unreadTotal, 2);
      assert.equal(data.stats.savedCount, 1);
    } finally {
      await prisma.refreshLog.deleteMany({ where: { feedId: { in: [feedOne.id, feedTwo.id] } } }).catch(() => null);
      await prisma.readState.deleteMany({ where: { itemId: { in: [itemOne.id, itemTwo.id, itemThree.id] } } }).catch(() => null);
      await prisma.bookmark.deleteMany({ where: { itemId: itemThree.id } }).catch(() => null);
      await prisma.item.deleteMany({ where: { feedId: { in: [feedOne.id, feedTwo.id] } } }).catch(() => null);
      await prisma.feed.deleteMany({ where: { id: { in: [feedOne.id, feedTwo.id] } } }).catch(() => null);
      await prisma.folder.delete({ where: { id: folder.id } }).catch(() => null);
      await prisma.settings.delete({ where: { userId: user.id } }).catch(() => null);
      await prisma.user.delete({ where: { id: user.id } }).catch(() => null);
    }
  });
});
