import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getNavigationStats, readNavigationStats } from "@/lib/navigation-stats";

describe("getNavigationStats", () => {
	it("reconciles stale stored counts with the live unread query", async () => {
		const calls: string[] = [];

		const client = {
			$queryRaw: async () => {
				calls.push("query");
				return [{ unreadCount: 7n, savedCount: 2n }];
			},
			navigationStats: {
				findUnique: async () => {
					calls.push("findUnique");
					return { unreadCount: 0, savedCount: 2 };
				},
				upsert: async (args: { update: { unreadCount: number; savedCount: number } }) => {
					calls.push("upsert");
					assert.deepEqual(args.update, { unreadCount: 7, savedCount: 2 });
					return args.update;
				},
			},
		};

		const result = await getNavigationStats(client as never, "user-1", false);

		assert.deepEqual(result, { unreadCount: 7, savedCount: 2 });
		assert.deepEqual(calls, ["query", "findUnique", "upsert"]);
	});

	it("returns live counts without a navigationStats table helper", async () => {
		const client = {
			$queryRaw: async () => [{ unreadCount: 3n, savedCount: 1n }],
		};

		const result = await getNavigationStats(client as never, "user-1", false);

		assert.deepEqual(result, { unreadCount: 3, savedCount: 1 });
	});
});

describe("readNavigationStats", () => {
	it("returns stored counts without COUNT query", async () => {
		const calls: string[] = [];

		const client = {
			$queryRaw: async () => {
				calls.push("query");
				return [{ unreadCount: 42n, savedCount: 5n }];
			},
			navigationStats: {
				findUnique: async () => {
					calls.push("findUnique");
					return { unreadCount: 42, savedCount: 5 };
				},
				upsert: async () => {
					calls.push("upsert");
					return {};
				},
			},
		};

		const result = await readNavigationStats(client as never, "user-1");

		assert.deepEqual(result, { unreadCount: 42, savedCount: 5 });
		assert.deepEqual(calls, ["findUnique"], "should not issue COUNT query");
	});

	it("seeds from COUNT query on first access", async () => {
		const calls: string[] = [];

		const client = {
			$queryRaw: async () => {
				calls.push("query");
				return [{ unreadCount: 10n, savedCount: 3n }];
			},
			navigationStats: {
				findUnique: async () => {
					calls.push("findUnique");
					return null;
				},
				upsert: async (args: { update: { unreadCount: number; savedCount: number } }) => {
					calls.push("upsert");
					return args.update;
				},
			},
		};

		const result = await readNavigationStats(client as never, "user-1");

		assert.deepEqual(result, { unreadCount: 10, savedCount: 3 });
		assert.deepEqual(calls, ["findUnique", "query", "findUnique", "upsert"], "should fallback to COUNT + upsert on first access");
	});

	it("returns zeros without a navigationStats table helper", async () => {
		const client = {
			$queryRaw: async () => [{ unreadCount: 99n, savedCount: 99n }],
		};

		const result = await readNavigationStats(client as never, "user-1");

		assert.deepEqual(result, { unreadCount: 0, savedCount: 0 });
	});
});
