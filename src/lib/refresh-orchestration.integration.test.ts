import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { Queue } from "bullmq";
import { PrismaClient } from "@prisma/client";
import IORedis from "ioredis";

import { hasIntegrationTestEnv } from "@/lib/integration-test-env";

import { JobTrigger } from "@prisma/client";

const shouldRun = hasIntegrationTestEnv();
const testDescribe = shouldRun ? describe : describe.skip;

testDescribe("refresh orchestration integration", () => {
	const testDatabaseUrl = process.env.TEST_DATABASE_URL!;
	const testRedisUrl = process.env.TEST_REDIS_URL!;

	let prisma: PrismaClient | null = null;
	let redis: IORedis | null = null;
	let queue: Queue | null = null;

	after(async () => {
		await queue?.drain().catch(() => null);
		await queue?.close().catch(() => null);
		await redis?.quit().catch(() => null);
		await prisma?.$disconnect().catch(() => null);
	});

	it("queues a single refresh job and dedupes the second enqueue", async () => {
		process.env.DATABASE_URL = testDatabaseUrl;
		process.env.REDIS_URL = testRedisUrl;

		const [{ queueSingleFeedRefresh }, { refreshQueueName }] =
			await Promise.all([
				import("@/lib/refresh-orchestration"),
				import("@/lib/queue"),
			]);

		prisma = new PrismaClient({
			datasources: { db: { url: testDatabaseUrl } },
		} as never);
		redis = new IORedis(testRedisUrl, {
			maxRetriesPerRequest: null,
			lazyConnect: true,
		});
		queue = new Queue(refreshQueueName, { connection: redis });

		const unique = `it-${Date.now()}-${Math.random().toString(16).slice(2)}`;
		const user = await prisma.user.create({
			data: {
				username: `user-${unique}`,
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
		const feed = await prisma.feed.create({
			data: {
				userId: user.id,
				title: `feed-${unique}`,
				sourceUrl: `https://example.com/${unique}.xml`,
			},
		});

		try {
			const first = await queueSingleFeedRefresh(
				user.id,
				feed.id,
				JobTrigger.MANUAL,
				{
					createRefreshJob: prisma.refreshJob.create.bind(prisma.refreshJob),
					deleteRefreshJob: prisma.refreshJob.delete.bind(prisma.refreshJob),
					enqueueRefresh: async (payload) => {
						const helper = await import("@/lib/queue");
						return helper.enqueueFeedRefresh(payload);
					},
				},
			);
			const second = await queueSingleFeedRefresh(
				user.id,
				feed.id,
				JobTrigger.MANUAL,
				{
					createRefreshJob: prisma.refreshJob.create.bind(prisma.refreshJob),
					deleteRefreshJob: prisma.refreshJob.delete.bind(prisma.refreshJob),
					enqueueRefresh: async (payload) => {
						const helper = await import("@/lib/queue");
						return helper.enqueueFeedRefresh(payload);
					},
				},
			);

			const jobs = await queue.getJobs([
				"waiting",
				"active",
				"delayed",
				"completed",
			]);
			const refreshJobs = await prisma.refreshJob.findMany({
				where: { feedId: feed.id },
			});

			assert.equal(first, true);
			assert.equal(second, false);
			assert.equal(jobs.length, 1);
			assert.equal(refreshJobs.length, 1);
		} finally {
			await queue.obliterate({ force: true }).catch(() => null);
			await prisma.item
				.deleteMany({ where: { feedId: feed.id } })
				.catch(() => null);
			await prisma.refreshJob
				.deleteMany({ where: { feedId: feed.id } })
				.catch(() => null);
			await prisma.feed.delete({ where: { id: feed.id } }).catch(() => null);
			await prisma.settings
				.delete({ where: { userId: user.id } })
				.catch(() => null);
			await prisma.user.delete({ where: { id: user.id } }).catch(() => null);
		}
	});
});
