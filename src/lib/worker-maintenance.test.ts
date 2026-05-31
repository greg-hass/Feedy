import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { recoverStaleRefreshJobs } from "@/lib/worker-maintenance";

describe("recoverStaleRefreshJobs", () => {
  it("requeues stale running jobs on startup", async () => {
    const calls: string[] = [];
    const client = {
      refreshJob: {
        updateMany: async (args: {
          where: { status: string };
          data: {
            status: string;
            startedAt: null;
            completedAt: null;
            errorMessage: null;
          };
        }) => {
          calls.push(`status:${args.where.status}`);
          calls.push(`next:${args.data.status}`);
          return { count: 3 };
        },
      },
    };

    const count = await recoverStaleRefreshJobs(client as never);

    assert.equal(count, 3);
    assert.deepEqual(calls, ["status:RUNNING", "next:QUEUED"]);
  });
});
