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
	const refreshJob = await deps.createRefreshJob({
		data: {
			userId,
			feedId,
			trigger,
			status: JobStatus.QUEUED,
			requestedAt: batchStartedAt,
			metadata: { batchId },
		},
	});

	let queued: Awaited<ReturnType<typeof enqueueFeedRefresh>>;
	try {
		queued = await deps.enqueueRefresh({
			feedId,
			trigger: jobTriggerToQueueTrigger(trigger),
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

	// Skip if there's already an active job for this feed — prevents DB row churn
	const existing = await resolvedDeps.findActiveJob!({
		where: {
			feedId,
			status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
		},
		select: { id: true },
	});
	if (existing) {
		return false;
	}

	const refreshJob = await resolvedDeps.createRefreshJob({
		data: {
			userId,
			feedId,
			trigger,
			status: JobStatus.QUEUED,
		},
	});

	let queued: Awaited<ReturnType<typeof enqueueFeedRefresh>>;
	try {
		queued = await resolvedDeps.enqueueRefresh({
			feedId,
			trigger: jobTriggerToQueueTrigger(trigger),
			refreshJobId: refreshJob.id,
		});
	} catch (error) {
		await resolvedDeps
			.deleteRefreshJob({ where: { id: refreshJob.id } })
			.catch(() => null);
		throw error;
	}

	if (!queued.enqueued) {
		await resolvedDeps
			.deleteRefreshJob({ where: { id: refreshJob.id } })
			.catch(() => null);
	}

	return queued.enqueued;
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
