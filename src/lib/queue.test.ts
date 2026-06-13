import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isReturnedRefreshJobNew } from "@/lib/queue";

describe("isReturnedRefreshJobNew", () => {
	it("accepts the returned job when BullMQ stored the requested refresh payload", () => {
		assert.equal(
			isReturnedRefreshJobNew(
				{
					data: {
						feedId: "feed-1",
						trigger: "manual",
						refreshJobId: "job-1",
					},
				},
				{
					feedId: "feed-1",
					trigger: "manual",
					refreshJobId: "job-1",
				},
			),
			true,
		);
	});

	it("rejects an existing deduped job with an older refresh job id", () => {
		assert.equal(
			isReturnedRefreshJobNew(
				{
					data: {
						feedId: "feed-1",
						trigger: "manual",
						refreshJobId: "job-1",
					},
				},
				{
					feedId: "feed-1",
					trigger: "manual",
					refreshJobId: "job-2",
				},
			),
			false,
		);
	});
});
