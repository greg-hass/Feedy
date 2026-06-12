import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { recoverStaleRefreshJobs } from "@/lib/worker-maintenance";

describe("recoverStaleRefreshJobs", () => {
  it("requeues stale running jobs on startup", async () => {
    const calls: string[] = [];
    const client = {
      refreshJob: {
        findMany: async (args: { where: { status: string }; select: { id: true; feedId: true; trigger: true } }) => {
          calls.push(`find:${args.where.status}`);
          return [
            { id: "job-1", feedId: "feed-1", trigger: "AUTO" },
            { id: "job-2", feedId: "feed-2", trigger: "MANUAL" },
            { id: "job-3", feedId: "feed-3", trigger: "IMPORT" },
          ];
        },
        updateMany: async (args: {
          where: { status?: string; id?: { in: string[] } };
          data: {
            status: string;
            startedAt: null;
            completedAt: null;
            errorMessage: null;
          };
        }) => {
          calls.push(args.where.id ? `update:${args.where.id.in.join(",")}` : `update:${args.where.status}`);
          calls.push(`next:${args.data.status}`);
          return { count: 2 };
        },
      },
    };

    const count = await recoverStaleRefreshJobs(client as never, async (payload) => {
      calls.push(`enqueue:${payload.refreshJobId}:${payload.feedId}:${payload.trigger}`);
      return { enqueued: true, job: { id: `bull-${payload.feedId}` } };
    });

    assert.equal(count, 2);
    assert.deepEqual(calls, [
      "find:RUNNING",
      "enqueue:job-1:feed-1:auto",
      "enqueue:job-2:feed-2:manual",
      "enqueue:job-3:feed-3:import",
      "update:job-1,job-2,job-3",
      "next:QUEUED",
    ]);
  });

  it("marks stale jobs without feeds failed instead of leaving them running", async () => {
    const calls: string[] = [];
    const client = {
      refreshJob: {
        findMany: async () => [
          { id: "job-orphan", feedId: null, trigger: "AUTO", metadata: { batchId: "batch-1" } },
        ],
        updateMany: async (args: {
          where: { id: { in: string[] } };
          data: {
            status: string;
            completedAt?: Date;
            errorMessage?: string;
          };
        }) => {
          calls.push(`update:${args.where.id.in.join(",")}`);
          calls.push(`status:${args.data.status}`);
          calls.push(`message:${args.data.errorMessage ?? ""}`);
          return { count: args.where.id.in.length };
        },
      },
      $executeRaw: async () => {
        calls.push("batch-result");
        return 1;
      },
    };

    const count = await recoverStaleRefreshJobs(client as never, async () => {
      calls.push("enqueue");
      return { enqueued: true, job: { id: "bull" } };
    });

    assert.equal(count, 1);
    assert.deepEqual(calls, [
      "update:job-orphan",
      "status:FAILED",
      "message:Cannot recover refresh job because its feed no longer exists.",
      "batch-result",
    ]);
  });
});
