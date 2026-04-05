import IORedis from "ioredis";

import { env } from "@/lib/env";

declare global {
  var __feedyRedis: IORedis | undefined;
}

export function getRedis() {
  const instance =
    global.__feedyRedis ??
    new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });

  if (process.env.NODE_ENV !== "production") {
    global.__feedyRedis = instance;
  }

  return instance;
}
