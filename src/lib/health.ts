import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";

type ReadinessDatabase = {
  $queryRaw(query: TemplateStringsArray): Promise<unknown>;
};

type ReadinessRedis = {
  ping(): Promise<unknown>;
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

export async function checkReadiness(
  database: ReadinessDatabase = prisma,
  redis: ReadinessRedis = getRedis(),
  timeoutMs = 2_000,
) {
  const [databaseResult, redisResult] = await Promise.allSettled([
    withDeadline(database.$queryRaw`SELECT 1`, timeoutMs),
    withDeadline(redis.ping(), timeoutMs),
  ]);
  const checks = {
    database: databaseResult.status === "fulfilled",
    redis: redisResult.status === "fulfilled",
  };

  return {
    ok: checks.database && checks.redis,
    checks,
  };
}

export function readinessExitCode(result: { ok: boolean }) {
  return result.ok ? 0 : 1;
}
