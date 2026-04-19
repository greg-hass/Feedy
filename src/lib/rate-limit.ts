import { getRedis } from "@/lib/redis";

type RedisLike = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
};

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function createFixedWindowRateLimiter(client: RedisLike = getRedis()) {
  return {
    async check(key: string, input: { limit: number; windowSeconds: number }): Promise<RateLimitDecision> {
      const redisKey = `rate-limit:${key}`;
      const count = await client.incr(redisKey);
      if (count === 1) {
        await client.expire(redisKey, input.windowSeconds);
      }

      const ttl = await client.ttl(redisKey);
      return {
        allowed: count <= input.limit,
        remaining: Math.max(0, input.limit - count),
        retryAfterSeconds: ttl > 0 ? ttl : input.windowSeconds,
      };
    },
  };
}
