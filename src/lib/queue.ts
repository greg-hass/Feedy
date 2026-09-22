import { Queue } from "bullmq";
import { FeedSourceType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";

export const refreshQueueName = "feed-refresh";
export const redditRefreshQueueName = "reddit-feed-refresh";
export const iconQueueName = "icon-fetch";
export const readerExtractionQueueName = "reader-extraction";

export type RefreshJobPayload = {
	feedId: string;
	trigger: "manual" | "auto" | "import";
	refreshJobId?: string;
};

export type IconJobPayload = {
	feedId: string;
};

export type ReaderExtractionJobPayload = {
	itemId: string;
};

let refreshQueue: Queue<RefreshJobPayload> | undefined;
let redditRefreshQueue: Queue<RefreshJobPayload> | undefined;
let iconQueue: Queue<IconJobPayload> | undefined;
let readerExtractionQueue: Queue<ReaderExtractionJobPayload> | undefined;

export function getRefreshQueue() {
	refreshQueue ??= createRefreshQueue(refreshQueueName);
	return refreshQueue;
}

export function getRedditRefreshQueue() {
	redditRefreshQueue ??= createRefreshQueue(redditRefreshQueueName);
	return redditRefreshQueue;
}

function createRefreshQueue(name: string) {
	return new Queue<RefreshJobPayload>(name, {
		connection: getRedis(),
		defaultJobOptions: {
			attempts: 4,
			backoff: {
				type: "exponential",
				delay: 30_000,
			},
			// The stable jobId intentionally dedupes active/waiting refreshes per feed.
			// Do NOT retain completed/failed refresh jobs: retained BullMQ hashes keep
			// the same jobId occupied and block future refreshes for that feed.
			removeOnComplete: true,
			removeOnFail: true,
		},
	});

}

function getIconQueue() {
	iconQueue ??= new Queue<IconJobPayload>(iconQueueName, {
		connection: getRedis(),
		defaultJobOptions: {
			attempts: 3,
			backoff: {
				type: "exponential",
				delay: 15_000,
			},
			removeOnComplete: 100,
			removeOnFail: 100,
		},
	});

	return iconQueue;
}

function getReaderExtractionQueue() {
	readerExtractionQueue ??= new Queue<ReaderExtractionJobPayload>(
		readerExtractionQueueName,
		{
			connection: getRedis(),
			defaultJobOptions: {
				attempts: 2,
				backoff: {
					type: "exponential",
					delay: 60_000,
				},
				removeOnComplete: 100,
				removeOnFail: 100,
			},
		},
	);

	return readerExtractionQueue;
}

export async function enqueueFeedRefresh(payload: RefreshJobPayload) {
	const dedupeId = `refresh-${payload.feedId}`;
	const feed = await prisma.feed.findUnique({
		where: { id: payload.feedId },
		select: { sourceType: true },
	});
	const isReddit = feed?.sourceType === FeedSourceType.REDDIT_RSS;
	const queue = isReddit ? getRedditRefreshQueue() : getRefreshQueue();
	if (isReddit) {
		// Jobs queued before the dedicated Reddit queue was introduced still
		// live in the original queue. Let those finish before scheduling another.
		const previousJob = await getRefreshQueue().getJob(dedupeId);
		if (previousJob) return { enqueued: false, job: previousJob };
	}
	const existing = await queue.getJob(dedupeId);
	if (existing) return { enqueued: false, job: existing };

	const job = await queue.add(dedupeId, payload, {
		jobId: dedupeId,
	});
	// BullMQ returns a truthy Job with the *new* payload even when a stable
	// jobId collided and Redis kept the older job. Read the stored payload to
	// distinguish that case, including concurrent enqueues from web and worker.
	const storedJob = await queue.getJob(dedupeId);
	if (storedJob && storedJob.data.refreshJobId !== payload.refreshJobId) {
		return { enqueued: false, job: storedJob };
	}
	// A missing stored job has already been processed and removed.
	return { enqueued: true, job };
}

export async function enqueueIconFetch(payload: IconJobPayload) {
	const queue = getIconQueue();
	const dedupeId = `icon-${payload.feedId}`;

	const job = await queue.add(dedupeId, payload, {
		jobId: dedupeId,
	});

	if (!job) {
		const existing = await queue.getJob(dedupeId);
		return { enqueued: false, job: existing! };
	}

	return { enqueued: true, job };
}

export async function enqueueReaderExtraction(
	payload: ReaderExtractionJobPayload,
) {
	const queue = getReaderExtractionQueue();
	const dedupeId = `reader-${payload.itemId}`;

	const job = await queue.add(dedupeId, payload, {
		jobId: dedupeId,
	});

	if (!job) {
		const existing = await queue.getJob(dedupeId);
		return { enqueued: false, job: existing! };
	}

	return { enqueued: true, job };
}
