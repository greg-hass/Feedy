import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { JobTrigger } from "@prisma/client";

import { jobTriggerToQueueTrigger, queueTriggerToJobTrigger } from "@/lib/refresh-trigger";

describe("refresh trigger mapping", () => {
  it("preserves import triggers through the queue payload", () => {
    assert.equal(jobTriggerToQueueTrigger(JobTrigger.IMPORT), "import");
    assert.equal(queueTriggerToJobTrigger("import"), JobTrigger.IMPORT);
  });
});
