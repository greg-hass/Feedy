import { Queue } from "bullmq";

import { getRedis } from "@/lib/redis";

export const refreshQueueName = "feed-refresh";
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
let iconQueue: Queue<IconJobPayload> | undefined;
let readerExtractionQueue: Queue<ReaderExtractionJobPayload> | undefined;

export function getRefreshQueue() {
	refreshQueue ??= new Queue<RefreshJobPayload>(refreshQueueName, {
		connection: getRedis(),
		defaultJobOptions: {
			attempts: 4,
			backoff: {
				type: "exponential",
				delay: 30_000,
			},
			removeOnComplete: 100,
			removeOnFail: 100,
		},
	});

	return refreshQueue;
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
	const queue = getRefreshQueue();
	const dedupeId = `refresh-${payload.feedId}`;

	const job = await queue.add(dedupeId, payload, {
		jobId: dedupeId,
	});

	if (!job) {
		const existing = await queue.getJob(dedupeId);
		return { enqueued: false, job: existing! };
	}

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
