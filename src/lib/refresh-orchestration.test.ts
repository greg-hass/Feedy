import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { JobTrigger } from "@prisma/client";

import {
	buildRefreshBatchCompletionUpdate,
	getRefreshBatchId,
	queueRefreshBatch,
	queueSingleFeedRefresh,
	recordRefreshBatchResult,
} from "@/lib/refresh-orchestration";

describe("queueRefreshBatch", () => {
	it("builds a completed batch update when no jobs are queued", () => {
		const finishedAt = new Date("2026-01-01T00:01:00.000Z");
		const startedAt = new Date("2026-01-01T00:00:00.000Z");

		assert.deepEqual(
			buildRefreshBatchCompletionUpdate({
				queued: 0,
				skipped: 2,
				startedAt,
				finishedAt,
			}),
			{
				queued: 0,
				skipped: 2,
				status: "SUCCEEDED",
				startedAt,
				finishedAt,
			},
		);
	});

	it("creates refresh jobs and enqueues them in batches", async () => {
		const calls: string[] = [];
		const deps = {
			createRefreshBatch: async ({
				data,
			}: {
				data: {
					id: string;
					userId: string;
					totalFeeds: number;
					status: string;
				};
			}) => {
				calls.push(
					`batch:${data.id}:${data.userId}:${data.totalFeeds}:${data.status}`,
				);
				return null;
			},
			updateRefreshBatch: async ({
				where,
				data,
			}: {
				where: { id: string };
				data: { queued: number; skipped: number; status: string };
			}) => {
				calls.push(
					`batch-update:${where.id}:${data.queued}:${data.skipped}:${data.status}`,
				);
				return null;
			},
			createRefreshJob: async ({
				data,
			}: {
				data: { feedId: string; metadata: { batchId: string } };
			}) => {
				calls.push(`create:${data.feedId}:${data.metadata.batchId}`);
				return { id: `job-${data.feedId}` };
			},
			deleteRefreshJob: async ({ where }: { where: { id: string } }) => {
				calls.push(`delete:${where.id}`);
				return null;
			},
			enqueueRefresh: async ({ feedId }: { feedId: string }) => {
				calls.push(`enqueue:${feedId}`);
				return { enqueued: true, job: { id: `bull-${feedId}` } };
			},
			batchMap: async <T, R>(
				items: T[],
				_batchSize: number,
				mapper: (item: T) => Promise<R>,
			) => Promise.all(items.map(mapper)),
			// No active jobs — sentinel check passes through
			findActiveJob: async () => null,
		};

		const result = await queueRefreshBatch(
			{
				userId: "user-1",
				feedIds: [{ id: "feed-1" }, { id: "feed-2" }],
				batchStartedAt: new Date("2026-01-01T00:00:00.000Z"),
				batchId: "batch-1",
			},
			deps as never,
		);

		assert.deepEqual(result, {
			ok: true,
			queued: 2,
			skipped: 0,
			totalFeeds: 2,
			batchStartedAt: "2026-01-01T00:00:00.000Z",
			batchId: "batch-1",
		});
		assert.deepEqual(calls, [
			"batch:batch-1:user-1:2:QUEUED",
			"create:feed-1:batch-1",
			"create:feed-2:batch-1",
			"enqueue:feed-1",
			"enqueue:feed-2",
			"batch-update:batch-1:2:0:QUEUED",
		]);
	});

	it("cleans up refresh jobs when enqueue is deduped", async () => {
		const calls: string[] = [];
		const deps = {
			createRefreshBatch: async ({
				data,
			}: {
				data: {
					id: string;
					userId: string;
					totalFeeds: number;
					status: string;
				};
			}) => {
				calls.push(
					`batch:${data.id}:${data.userId}:${data.totalFeeds}:${data.status}`,
				);
				return null;
			},
			updateRefreshBatch: async ({
				where,
				data,
			}: {
				where: { id: string };
				data: {
					queued: number;
					skipped: number;
					status: string;
					startedAt?: Date;
					finishedAt?: Date;
				};
			}) => {
				calls.push(
					`batch-update:${where.id}:${data.queued}:${data.skipped}:${data.status}:${data.startedAt?.toISOString() ?? ""}:${data.finishedAt instanceof Date}`,
				);
				return null;
			},
			createRefreshJob: async () => {
				calls.push("create");
				return { id: "job-1" };
			},
			deleteRefreshJob: async ({ where }: { where: { id: string } }) => {
				calls.push(`delete:${where.id}`);
				return null;
			},
			enqueueRefresh: async () => {
				calls.push("enqueue");
				return { enqueued: false, job: { id: "bull-1" } };
			},
			batchMap: async <T, R>(
				items: T[],
				_batchSize: number,
				mapper: (item: T) => Promise<R>,
			) => Promise.all(items.map(mapper)),
			// No active jobs — sentinel check passes through
			findActiveJob: async () => null,
		};

		const result = await queueRefreshBatch(
			{
				userId: "user-1",
				feedIds: [{ id: "feed-1" }],
				batchStartedAt: new Date("2026-01-01T00:00:00.000Z"),
				batchId: "batch-1",
			},
			deps as never,
		);

		assert.deepEqual(result, {
			ok: true,
			queued: 0,
			skipped: 1,
			totalFeeds: 1,
			batchStartedAt: "2026-01-01T00:00:00.000Z",
			batchId: "batch-1",
		});
		assert.deepEqual(calls, [
			"batch:batch-1:user-1:1:QUEUED",
			"create",
			"enqueue",
			"delete:job-1",
			"batch-update:batch-1:0:1:SUCCEEDED:2026-01-01T00:00:00.000Z:true",
		]);
	});

	it("marks a batch failed when enqueue throws before any jobs are queued", async () => {
		const calls: string[] = [];
		const error = new Error("redis unavailable");
		const deps = {
			createRefreshBatch: async ({
				data,
			}: {
				data: {
					id: string;
					userId: string;
					totalFeeds: number;
					status: string;
				};
			}) => {
				calls.push(
					`batch:${data.id}:${data.userId}:${data.totalFeeds}:${data.status}`,
				);
				return null;
			},
			updateRefreshBatch: async ({
				where,
				data,
			}: {
				where: { id: string };
				data: {
					queued: number;
					skipped: number;
					status: string;
					startedAt?: Date;
					finishedAt?: Date;
				};
			}) => {
				calls.push(
					`batch-update:${where.id}:${data.queued}:${data.skipped}:${data.status}:${data.startedAt?.toISOString() ?? ""}:${data.finishedAt instanceof Date}`,
				);
				return null;
			},
			createRefreshJob: async () => {
				calls.push("create");
				return { id: "job-1" };
			},
			deleteRefreshJob: async ({ where }: { where: { id: string } }) => {
				calls.push(`delete:${where.id}`);
				return null;
			},
			enqueueRefresh: async () => {
				calls.push("enqueue");
				throw error;
			},
			batchMap: async <T, R>(
				items: T[],
				_batchSize: number,
				mapper: (item: T) => Promise<R>,
			) => Promise.all(items.map(mapper)),
			// No active jobs — sentinel check passes through
			findActiveJob: async () => null,
		};

		await assert.rejects(
			queueRefreshBatch(
				{
					userId: "user-1",
					feedIds: [{ id: "feed-1" }],
					batchStartedAt: new Date("2026-01-01T00:00:00.000Z"),
					batchId: "batch-1",
				},
				deps as never,
			),
			error,
		);

		assert.deepEqual(calls, [
			"batch:batch-1:user-1:1:QUEUED",
			"create",
			"enqueue",
			"delete:job-1",
			"batch-update:batch-1:0:1:FAILED:2026-01-01T00:00:00.000Z:true",
		]);
	});

	it("queues a single feed refresh through the shared helper", async () => {
		const calls: string[] = [];
		const result = await queueSingleFeedRefresh(
			"user-1",
			"feed-1",
			JobTrigger.AUTO,
			{
				findActiveJob: async () => null,
				createRefreshJob: async ({
					data,
				}: {
					data: { feedId: string; trigger: JobTrigger };
				}) => {
					calls.push(`create:${data.feedId}:${data.trigger}`);
					return { id: "job-1" };
				},
				deleteRefreshJob: async ({ where }: { where: { id: string } }) => {
					calls.push(`delete:${where.id}`);
					return null;
				},
				enqueueRefresh: async ({
					feedId,
					trigger,
				}: {
					feedId: string;
					trigger: "manual" | "auto";
				}) => {
					calls.push(`enqueue:${feedId}:${trigger}`);
					return { enqueued: true, job: { id: "bull-1" } };
				},
			} as never,
		);

		assert.equal(result, true);
		assert.deepEqual(calls, ["create:feed-1:AUTO", "enqueue:feed-1:auto"]);
	});

	it("cleans up a single refresh job when enqueue throws", async () => {
		const calls: string[] = [];
		const error = new Error("redis unavailable");

		await assert.rejects(
			queueSingleFeedRefresh("user-1", "feed-1", JobTrigger.MANUAL, {
				findActiveJob: async () => null,
				createRefreshJob: async () => {
					calls.push("create");
					return { id: "job-1" };
				},
				deleteRefreshJob: async ({ where }: { where: { id: string } }) => {
					calls.push(`delete:${where.id}`);
					return null;
				},
				enqueueRefresh: async () => {
					calls.push("enqueue");
					throw error;
				},
			} as never),
			error,
		);

		assert.deepEqual(calls, ["create", "enqueue", "delete:job-1"]);
	});

	it("extracts batch ids only from valid refresh metadata", () => {
		assert.equal(getRefreshBatchId({ batchId: "batch-1" }), "batch-1");
		assert.equal(getRefreshBatchId({ batchId: "" }), null);
		assert.equal(getRefreshBatchId({ batchId: 123 }), null);
		assert.equal(getRefreshBatchId(null), null);
		assert.equal(getRefreshBatchId(["batch-1"]), null);
	});

	it("skips batch progress updates when no batch id is present", async () => {
		let calls = 0;
		await recordRefreshBatchResult(
			{
				$executeRaw: async () => {
					calls++;
					return 1;
				},
			} as never,
			null,
			"SUCCEEDED",
		);

		assert.equal(calls, 0);
	});

	it("records batch progress for completed jobs", async () => {
		let calls = 0;
		await recordRefreshBatchResult(
			{
				$executeRaw: async () => {
					calls++;
					return 1;
				},
			} as never,
			"batch-1",
			"FAILED",
		);

		assert.equal(calls, 1);
	});
});
