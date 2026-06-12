import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/feedy?schema=public"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16).default("development-build-secret-0001"),
  APP_USERNAME: z.string().min(1).default("admin"),
  APP_PASSWORD: z.string().min(1).default("change-me"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  REFRESH_DEFAULT_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(1440).default(15),
  REFRESH_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(16),
  ICON_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(24).default(4),
  READER_EXTRACTION_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  REFRESH_DOMAIN_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  REFRESH_HTTP_TIMEOUT_MS: z.coerce.number().int().min(2000).max(60_000).default(8000),
  DISCOVERY_SEARCH_PROVIDER: z.string().default("duckduckgo"),
  PERF_LOGGING: z.enum(["true", "false"]).default("true"),
  PERF_SLOW_MS: z.coerce.number().int().min(50).max(10_000).default(250),
  PERF_SLOW_FEED_MS: z.coerce.number().int().min(200).max(30_000).default(1200),
  DATA_DIR: z.string().default("./data"),
});

const parsedEnv = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  APP_URL: process.env.APP_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  APP_USERNAME: process.env.APP_USERNAME,
  APP_PASSWORD: process.env.APP_PASSWORD,
  COOKIE_SECURE: process.env.COOKIE_SECURE,
  REFRESH_DEFAULT_INTERVAL_MINUTES: process.env.REFRESH_DEFAULT_INTERVAL_MINUTES,
  REFRESH_WORKER_CONCURRENCY: process.env.REFRESH_WORKER_CONCURRENCY,
  ICON_WORKER_CONCURRENCY: process.env.ICON_WORKER_CONCURRENCY,
  READER_EXTRACTION_WORKER_CONCURRENCY: process.env.READER_EXTRACTION_WORKER_CONCURRENCY,
  REFRESH_DOMAIN_CONCURRENCY: process.env.REFRESH_DOMAIN_CONCURRENCY,
  REFRESH_HTTP_TIMEOUT_MS: process.env.REFRESH_HTTP_TIMEOUT_MS,
  DISCOVERY_SEARCH_PROVIDER: process.env.DISCOVERY_SEARCH_PROVIDER,
  PERF_LOGGING: process.env.PERF_LOGGING,
  PERF_SLOW_MS: process.env.PERF_SLOW_MS,
  PERF_SLOW_FEED_MS: process.env.PERF_SLOW_FEED_MS,
  DATA_DIR: process.env.DATA_DIR,
});

export const isProd = process.env.NODE_ENV === "production";
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

type ProductionEnvConfig = Pick<
  z.infer<typeof envSchema>,
  "APP_URL" | "AUTH_SECRET" | "APP_PASSWORD" | "COOKIE_SECURE"
>;

function isPrivateOrLocalDeploymentHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  const octets = normalized.split(".").map((part) => Number.parseInt(part, 10));

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    octets[0] === 127 ||
    octets[0] === 10 ||
    octets[0] === 192 && octets[1] === 168 ||
    octets[0] === 172 && octets[1] !== undefined && octets[1] >= 16 && octets[1] <= 31
  );
}

export function getProductionEnvProblems(config: ProductionEnvConfig) {
  const problems: string[] = [];
  if (
    config.AUTH_SECRET === "development-build-secret-0001" ||
    config.AUTH_SECRET === "change-me-to-a-long-random-secret" ||
    config.AUTH_SECRET.length < 32
  ) {
    problems.push("AUTH_SECRET must be a random value of at least 32 characters");
  }

  if (config.APP_PASSWORD === "change-me") {
    problems.push("APP_PASSWORD must not use the default placeholder");
  }

  try {
    const url = new URL(config.APP_URL);
    const isPrivateOrLocal = isPrivateOrLocalDeploymentHost(url.hostname);

    if (!isPrivateOrLocal && url.protocol !== "https:") {
      problems.push("APP_URL must use HTTPS for public production deployments");
    }

    if (url.protocol === "https:" && config.COOKIE_SECURE !== "true") {
      problems.push("COOKIE_SECURE must be true when APP_URL uses HTTPS");
    }

    if (url.protocol === "http:" && config.COOKIE_SECURE !== "false") {
      problems.push("COOKIE_SECURE must be false when APP_URL uses HTTP");
    }
  } catch {
    problems.push("APP_URL must be a valid URL");
  }

  return problems;
}

if (isProd && !isProductionBuild) {
  const problems = getProductionEnvProblems(parsedEnv);
  if (problems.length > 0) {
    throw new Error(`Invalid production environment: ${problems.join("; ")}`);
  }
}

export const env = parsedEnv;
