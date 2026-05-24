import type { RateLimitDecision } from "@/lib/rate-limit";

type LoginRateLimiter = {
  check(
    key: string,
    input: { limit: number; windowSeconds: number },
  ): Promise<RateLimitDecision>;
};

const LOGIN_WINDOW_SECONDS = 15 * 60;
const ACCOUNT_ATTEMPT_LIMIT = 5;
const EMERGENCY_GLOBAL_ATTEMPT_LIMIT = 300;

export async function checkLoginThrottle(limiter: LoginRateLimiter, normalizedUsername: string) {
  const [accountAttempt, emergencyAttempt] = await Promise.all([
    limiter.check(`login:user:${normalizedUsername}`, {
      limit: ACCOUNT_ATTEMPT_LIMIT,
      windowSeconds: LOGIN_WINDOW_SECONDS,
    }),
    limiter.check("login:emergency-global", {
      limit: EMERGENCY_GLOBAL_ATTEMPT_LIMIT,
      windowSeconds: LOGIN_WINDOW_SECONDS,
    }),
  ]);

  return {
    allowed: accountAttempt.allowed && emergencyAttempt.allowed,
    retryAfterSeconds: Math.max(
      accountAttempt.retryAfterSeconds,
      emergencyAttempt.retryAfterSeconds,
    ),
  };
}
