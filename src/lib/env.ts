import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/feedy?schema=public"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16).default("development-build-secret-0001"),
  APP_USERNAME: z.string().min(1).default("admin"),
  APP_PASSWORD: z.string().min(1).default("change-me"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  REFRESH_DEFAULT_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  REFRESH_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(16),
  ICON_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(24).default(4),
  REFRESH_DOMAIN_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  REFRESH_HTTP_TIMEOUT_MS: z.coerce.number().int().min(2000).max(60_000).default(8000),
  DISCOVERY_SEARCH_PROVIDER: z.string().default("duckduckgo"),
  PERF_LOGGING: z.enum(["true", "false"]).default("true"),
  PERF_SLOW_MS: z.coerce.number().int().min(50).max(10_000).default(250),
  PERF_SLOW_FEED_MS: z.coerce.number().int().min(200).max(30_000).default(1200),
  DATA_DIR: z.string().default("./data"),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/feedy?schema=public",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  APP_URL: process.env.APP_URL ?? "http://localhost:3000",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "development-build-secret-0001",
  APP_USERNAME: process.env.APP_USERNAME ?? "admin",
  APP_PASSWORD: process.env.APP_PASSWORD ?? "change-me",
  COOKIE_SECURE: process.env.COOKIE_SECURE ?? "false",
  REFRESH_DEFAULT_INTERVAL_MINUTES: process.env.REFRESH_DEFAULT_INTERVAL_MINUTES ?? "60",
  REFRESH_WORKER_CONCURRENCY: process.env.REFRESH_WORKER_CONCURRENCY ?? "16",
  ICON_WORKER_CONCURRENCY: process.env.ICON_WORKER_CONCURRENCY ?? "4",
  REFRESH_DOMAIN_CONCURRENCY: process.env.REFRESH_DOMAIN_CONCURRENCY ?? "3",
  REFRESH_HTTP_TIMEOUT_MS: process.env.REFRESH_HTTP_TIMEOUT_MS ?? "8000",
  DISCOVERY_SEARCH_PROVIDER: process.env.DISCOVERY_SEARCH_PROVIDER ?? "duckduckgo",
  PERF_LOGGING: process.env.PERF_LOGGING ?? "true",
  PERF_SLOW_MS: process.env.PERF_SLOW_MS ?? "250",
  PERF_SLOW_FEED_MS: process.env.PERF_SLOW_FEED_MS ?? "1200",
  DATA_DIR: process.env.DATA_DIR ?? "./data",
});

export const isProd = process.env.NODE_ENV === "production";
