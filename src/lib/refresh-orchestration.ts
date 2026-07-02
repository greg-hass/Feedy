import { randomUUID } from "node:crypto";

import {
	JobStatus,
	JobTrigger,
	Prisma,
	RefreshBatchStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { enqueueFeedRefresh } from "@/lib/queue";
import { jobTriggerToQueueTrigger } from "@/lib/refresh-trigger";
import {
	mapInBatches,
	REFRESH_ENQUEUE_BATCH_SIZE,
} from "@/lib/workload-limits";

type RefreshFeedRef = {
	id: string;
};

export type RefreshBatchResult = {
	ok: true;
	queued: number;
	skipped: number;
	totalFeeds: number;
	batchStartedAt: string;
	batchId: string;
};

type QueueRefreshInput = {
	userId: string;
	feedIds: RefreshFeedRef[];
	batchStartedAt?: Date;
	batchId?: string;
	trigger?: JobTrigger;
};

type RefreshOrchestrationDeps = {
	createRefreshBatch?: typeof prisma.refreshBatch.create;
	updateRefreshBatch?: typeof prisma.refreshBatch.update;
	createRefreshJob?: typeof prisma.refreshJob.create;
	deleteRefreshJob?: typeof prisma.refreshJob.delete;
	enqueueRefresh?: typeof enqueueFeedRefresh;
	batchMap?: typeof mapInBatches;
	findActiveJob?: typeof prisma.refreshJob.findFirst;
};

type SingleRefreshDeps = Pick<
	Required<RefreshOrchestrationDeps>,
	"createRefreshJob" | "deleteRefreshJob" | "enqueueRefresh"
> & {
	findActiveJob?: typeof prisma.refreshJob.findFirst;
};

type RefreshBatchProgressClient = Pick<typeof prisma, "$executeRaw">;

export function buildRefreshBatchCompletionUpdate({
	queued,
	skipped,
	startedAt,
	finishedAt,
}: {
	queued: number;
	skipped: number;
	startedAt: Date;
	finishedAt: Date;
}) {
	return {
		queued,
		skipped,
		status:
			queued > 0 ? RefreshBatchStatus.QUEUED : RefreshBatchStatus.SUCCEEDED,
		...(queued === 0 ? { startedAt, finishedAt } : {}),
	};
}

export function buildRefreshBatchFailureUpdate({
	queued,
	skipped,
	startedAt,
	finishedAt,
}: {
	queued: number;
	skipped: number;
	startedAt: Date;
	finishedAt: Date;
}) {
	return {
		queued,
		skipped,
		status: queued > 0 ? RefreshBatchStatus.PARTIAL : RefreshBatchStatus.FAILED,
		startedAt,
		finishedAt,
	};
}

export function getRefreshBatchId(metadata: unknown) {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
		return null;
	}

	const batchId = (metadata as { batchId?: unknown }).batchId;
	return typeof batchId === "string" && batchId.length > 0 ? batchId : null;
}

/**
 * Atomically record one worker completion for a batch and transition its
 * status via a single UPDATE with CASE expressions.
 *
 * This replaces the naive read-modify-write (SELECT counts, compute new
 * state, UPDATE) with an atomic SQL update. Without this, two workers
 * completing concurrently could each read the old counters and write a
 * stale state — a lost-update race. The CASE expressions computed
 * against the row's current values at UPDATE time guarantee the state
 * transition is correct under concurrent writes.
 *
 * The WHERE clause `succeeded + failed < queued` acts as an idempotency
 * guard — once the batch is fully accounted for, excess calls are no-ops.
 *
 * Called by: worker after each individual feed refresh completes.
 */
export async function recordRefreshBatchResult(
	client: RefreshBatchProgressClient,
	batchId: string | null,
	result: "SUCCEEDED" | "FAILED",
) {
	if (!batchId) {
		return;
	}

	await client.$executeRaw(Prisma.sql`
    UPDATE "RefreshBatch"
    SET
      "succeeded" = "succeeded" + ${result === "SUCCEEDED" ? 1 : 0},
      "failed" = "failed" + ${result === "FAILED" ? 1 : 0},
      "startedAt" = COALESCE("startedAt", NOW()),
      "finishedAt" = CASE
        WHEN "succeeded" + "failed" + 1 >= "queued" THEN NOW()
        ELSE "finishedAt"
      END,
      "status" = CASE
        WHEN ${result === "FAILED"} AND "succeeded" + "failed" + 1 >= "queued" AND "succeeded" = 0 THEN 'FAILED'::"RefreshBatchStatus"
        WHEN "succeeded" + "failed" + 1 >= "queued" AND ("failed" + ${result === "FAILED" ? 1 : 0}) > 0 THEN 'PARTIAL'::"RefreshBatchStatus"
        WHEN "succeeded" + "failed" + 1 >= "queued" THEN 'SUCCEEDED'::"RefreshBatchStatus"
        ELSE 'RUNNING'::"RefreshBatchStatus"
      END,
      "updatedAt" = NOW()
    WHERE "id" = ${batchId}
      AND "queued" > 0
      AND "succeeded" + "failed" < "queued"
  `);
}

async function queueRefreshForFeed(
	userId: string,
	feedId: string,
	batchStartedAt: Date,
	batchId: string,
	trigger: JobTrigger,
	deps: Required<RefreshOrchestrationDeps>,
) {
	// This findFirst is an optimisation, not a correctness guarantee — a concurrent
	// caller can race through between this check and the create+enqueue below. Real
	// deduplication happens in BullMQ via the stable jobId (see enqueueFeedRefresh).
	// Skip if there's a recent QUEUED/RUNNING job for this feed (same
	// sentinel as queueSingleFeedRefresh). This avoids unnecessary DB
	// writes and keeps batch stats accurate.
	const existing = await deps.findActiveJob?.({
		where: {
			feedId,
			status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
			requestedAt: { gt: new Date(Date.now() - 5 * 60_000) },
		},
		select: { id: true },
	});
	if (existing) {
		return false;
	}

	return createAndEnqueueRefreshJob(
		deps,
		{ userId, feedId, trigger },
		{ requestedAt: batchStartedAt, metadata: { batchId } },
	);
}

/**
 * Shared helper: create a refresh job in the DB, enqueue it in BullMQ,
 * and clean up the job record on failure or BullMQ dedupe.
 * Used by both single-feed (queueSingleFeedRefresh) and batch
 * (queueRefreshForFeed) paths.
 */
async function createAndEnqueueRefreshJob(
	deps: Pick<
		Required<RefreshOrchestrationDeps>,
		"createRefreshJob" | "deleteRefreshJob" | "enqueueRefresh"
	>,
	params: {
		userId: string;
		feedId: string;
		trigger: JobTrigger;
	},
	extraData?: Record<string, unknown>,
): Promise<boolean> {
	const refreshJob = await deps.createRefreshJob({
		data: {
			userId: params.userId,
			feedId: params.feedId,
			trigger: params.trigger,
			status: JobStatus.QUEUED,
			...(extraData ?? {}),
		} as never,
	});

	let queued: Awaited<ReturnType<typeof enqueueFeedRefresh>>;
	try {
		queued = await deps.enqueueRefresh({
			feedId: params.feedId,
			trigger: jobTriggerToQueueTrigger(params.trigger),
			refreshJobId: refreshJob.id,
		});
	} catch (error) {
		await deps
			.deleteRefreshJob({ where: { id: refreshJob.id } })
			.catch(() => null);
		throw error;
	}

	if (!queued.enqueued) {
		await deps
			.deleteRefreshJob({ where: { id: refreshJob.id } })
			.catch(() => null);
	}

	return queued.enqueued;
}

export async function queueSingleFeedRefresh(
	userId: string,
	feedId: string,
	trigger: JobTrigger = JobTrigger.MANUAL,
	deps: Partial<SingleRefreshDeps> = {},
) {
	const resolvedDeps: SingleRefreshDeps = {
		createRefreshJob:
			deps.createRefreshJob ?? prisma.refreshJob.create.bind(prisma.refreshJob),
		deleteRefreshJob:
			deps.deleteRefreshJob ?? prisma.refreshJob.delete.bind(prisma.refreshJob),
		enqueueRefresh: deps.enqueueRefresh ?? enqueueFeedRefresh,
		findActiveJob:
			deps.findActiveJob ?? prisma.refreshJob.findFirst.bind(prisma.refreshJob),
	};

	// This findFirst is an optimisation, not a correctness guarantee — a concurrent
	// caller can race through between this check and the create+enqueue below. Real
	// deduplication happens in BullMQ via the stable jobId (see enqueueFeedRefresh).
	// Skip only if there's a very recent active job (created within the refresh window).
	// Older QUEUED/RUNNING jobs are likely stale and will be cleaned up by maintenance.
	const existing = await resolvedDeps.findActiveJob!({
		where: {
			feedId,
			status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
			requestedAt: { gt: new Date(Date.now() - 5 * 60_000) },
		},
		select: { id: true },
	});
	if (existing) {
		return false;
	}

	return createAndEnqueueRefreshJob(resolvedDeps, {
		userId,
		feedId,
		trigger,
	});
}

export async function queueRefreshBatch(
	{
		userId,
		feedIds,
		batchStartedAt = new Date(),
		batchId = randomUUID(),
		trigger = JobTrigger.MANUAL,
	}: QueueRefreshInput,
	deps: RefreshOrchestrationDeps = {},
): Promise<RefreshBatchResult> {
	const resolvedDeps: Required<RefreshOrchestrationDeps> = {
		createRefreshBatch:
			deps.createRefreshBatch ??
			prisma.refreshBatch.create.bind(prisma.refreshBatch),
		updateRefreshBatch:
			deps.updateRefreshBatch ??
			prisma.refreshBatch.update.bind(prisma.refreshBatch),
		createRefreshJob:
			deps.createRefreshJob ?? prisma.refreshJob.create.bind(prisma.refreshJob),
		deleteRefreshJob:
			deps.deleteRefreshJob ?? prisma.refreshJob.delete.bind(prisma.refreshJob),
		enqueueRefresh: deps.enqueueRefresh ?? enqueueFeedRefresh,
		batchMap: deps.batchMap ?? mapInBatches,
		findActiveJob:
			deps.findActiveJob ?? prisma.refreshJob.findFirst.bind(prisma.refreshJob),
	};

	await resolvedDeps.createRefreshBatch({
		data: {
			id: batchId,
			userId,
			status: RefreshBatchStatus.QUEUED,
			totalFeeds: feedIds.length,
			queued: 0,
			skipped: 0,
		},
	});

	let results: boolean[];
	try {
		results = await resolvedDeps.batchMap(
			feedIds,
			REFRESH_ENQUEUE_BATCH_SIZE,
			async (feed) =>
				queueRefreshForFeed(
					userId,
					feed.id,
					batchStartedAt,
					batchId,
					trigger,
					resolvedDeps,
				),
		);
	} catch (error) {
		await resolvedDeps
			.updateRefreshBatch({
				where: { id: batchId },
				data: buildRefreshBatchFailureUpdate({
					queued: 0,
					skipped: feedIds.length,
					startedAt: batchStartedAt,
					finishedAt: new Date(),
				}),
			})
			.catch(() => null);
		throw error;
	}

	const queued = results.filter(Boolean).length;
	const skipped = feedIds.length - queued;
	await resolvedDeps.updateRefreshBatch({
		where: { id: batchId },
		data: buildRefreshBatchCompletionUpdate({
			queued,
			skipped,
			startedAt: batchStartedAt,
			finishedAt: new Date(),
		}),
	});

	return {
		ok: true,
		queued,
		skipped,
		totalFeeds: feedIds.length,
		batchStartedAt: batchStartedAt.toISOString(),
		batchId,
	};
}
