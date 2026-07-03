import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";

export type DependencyReadiness = {
	database: boolean;
	redis: boolean;
};

type CheckFn = () => Promise<unknown>;

type InjectedChecks = {
	checkDatabase?: CheckFn;
	checkRedis?: CheckFn;
};

function withDeadline<T>(operation: Promise<T>, timeoutMs: number) {
	return new Promise<T>((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error("Readiness check timed out."));
		}, timeoutMs);

		operation.then(
			(result) => {
				clearTimeout(timeout);
				resolve(result);
			},
			(error) => {
				clearTimeout(timeout);
				reject(error);
			},
		);
	});
}

/**
 * Check that PostgreSQL and Redis are reachable.
 *
 * Accepts injected check functions for testing. When called with defaults,
 * uses the real Prisma client and Redis connection.
 *
 * Throws an actionable error naming the missing service. The error message
 * never includes connection URLs, credentials, or host details.
 */
export async function checkRuntimeDependencies(
	injected?: InjectedChecks,
	timeoutMs = 2_000,
): Promise<DependencyReadiness> {
	const checkDatabase =
		injected?.checkDatabase ??
		(async () => {
			await prisma.$queryRaw`SELECT 1`;
		});

	const checkRedis = injected?.checkRedis ?? (async () => getRedis().ping());

	const [databaseResult, redisResult] = await Promise.allSettled([
		withDeadline(checkDatabase(), timeoutMs),
		withDeadline(checkRedis(), timeoutMs),
	]);

	const database = databaseResult.status === "fulfilled";
	const redis = redisResult.status === "fulfilled";

	if (!database) {
		throw new Error(
			"PostgreSQL is unavailable. Check that the database is running and DATABASE_URL is set correctly.",
		);
	}

	if (!redis) {
		throw new Error(
			"Redis is unavailable. Check that Redis is running and REDIS_URL is set correctly.",
		);
	}

	return { database, redis };
}
