import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkRuntimeDependencies } from "./dependency-preflight";

describe("checkRuntimeDependencies", () => {
	it("reports both dependencies as ready", async () => {
		const result = await checkRuntimeDependencies({
			checkDatabase: async () => undefined,
			checkRedis: async () => undefined,
		});
		assert.deepEqual(result, { database: true, redis: true });
	});

	it("fails with an actionable database message", async () => {
		await assert.rejects(
			() =>
				checkRuntimeDependencies({
					checkDatabase: async () => {
						throw new Error("connection refused");
					},
					checkRedis: async () => undefined,
				}),
			/PostgreSQL is unavailable/,
		);
	});

	it("fails with an actionable redis message", async () => {
		await assert.rejects(
			() =>
				checkRuntimeDependencies({
					checkDatabase: async () => undefined,
					checkRedis: async () => {
						throw new Error("ECONNREFUSED");
					},
				}),
			/Redis is unavailable/,
		);
	});

	it("never exposes connection details in the error", async () => {
		const sensitiveDetail = "user=someuser pass=hidden-value host=10.0.0.5";
		await assert.rejects(
			() =>
				checkRuntimeDependencies({
					checkDatabase: async () => {
						throw new Error(sensitiveDetail);
					},
					checkRedis: async () => undefined,
				}),
			(error: Error) => {
				assert.match(error.message, /PostgreSQL is unavailable/);
				assert.doesNotMatch(error.message, /hidden-value/);
				assert.doesNotMatch(error.message, /10\.0\.0\.5/);
				return true;
			},
		);
	});

	it("times out when a check hangs", async () => {
		await assert.rejects(
			() =>
				checkRuntimeDependencies(
					{
						checkDatabase: async () => undefined,
						checkRedis: async () => new Promise(() => undefined), // never resolves
					},
					1,
				),
			/Redis is unavailable/i,
		);
	});
});
