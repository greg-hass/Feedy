import { Queue } from "bullmq";

import { getRedis } from "@/lib/redis";

export const refreshQueueName = "feed-refresh";
export const iconQueueName = "icon-fetch";

export type RefreshJobPayload = {
  feedId: string;
  trigger: "manual" | "auto" | "import";
};

export type IconJobPayload = {
  feedId: string;
};

let refreshQueue: Queue<RefreshJobPayload> | undefined;
let iconQueue: Queue<IconJobPayload> | undefined;

function getRefreshQueue() {
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

export async function enqueueFeedRefresh(payload: RefreshJobPayload) {
  return getRefreshQueue().add(`refresh:${payload.feedId}`, payload, {
    jobId: `refresh:${payload.feedId}`,
  });
}

export async function enqueueIconFetch(payload: IconJobPayload) {
  return getIconQueue().add(`icon:${payload.feedId}`, payload, {
    jobId: `icon:${payload.feedId}`,
  });
}
