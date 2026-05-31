import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { JobTrigger } from "@prisma/client";

import { queueRefreshBatch, queueSingleFeedRefresh } from "@/lib/refresh-orchestration";

describe("queueRefreshBatch", () => {
  it("creates refresh jobs and enqueues them in batches", async () => {
    const calls: string[] = [];
    const deps = {
      createRefreshJob: async ({ data }: { data: { feedId: string; metadata: { batchId: string } } }) => {
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
      batchMap: async <T, R>(items: T[], _batchSize: number, mapper: (item: T) => Promise<R>) =>
        Promise.all(items.map(mapper)),
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
      "create:feed-1:batch-1",
      "create:feed-2:batch-1",
      "enqueue:feed-1",
      "enqueue:feed-2",
    ]);
  });

  it("cleans up refresh jobs when enqueue is deduped", async () => {
    const calls: string[] = [];
    const deps = {
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
      batchMap: async <T, R>(items: T[], _batchSize: number, mapper: (item: T) => Promise<R>) =>
        Promise.all(items.map(mapper)),
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
    assert.deepEqual(calls, ["create", "enqueue", "delete:job-1"]);
  });

  it("queues a single feed refresh through the shared helper", async () => {
    const calls: string[] = [];
    const result = await queueSingleFeedRefresh(
      "user-1",
      "feed-1",
      JobTrigger.AUTO,
      {
        createRefreshJob: async ({ data }: { data: { feedId: string; trigger: JobTrigger } }) => {
          calls.push(`create:${data.feedId}:${data.trigger}`);
          return { id: "job-1" };
        },
        deleteRefreshJob: async ({ where }: { where: { id: string } }) => {
          calls.push(`delete:${where.id}`);
          return null;
        },
        enqueueRefresh: async ({ feedId, trigger }: { feedId: string; trigger: "manual" | "auto" }) => {
          calls.push(`enqueue:${feedId}:${trigger}`);
          return { enqueued: true, job: { id: "bull-1" } };
        },
      },
    );

    assert.equal(result, true);
    assert.deepEqual(calls, ["create:feed-1:AUTO", "enqueue:feed-1:auto"]);
  });
});
