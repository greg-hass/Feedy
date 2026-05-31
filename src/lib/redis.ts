import IORedis from "ioredis";

import { env } from "@/lib/env";

declare global {
  var __feedyRedis: IORedis | undefined;
}

export function attachRedisErrorLogging(instance: Pick<IORedis, "on">) {
  instance.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[redis] ${message}`);
  });
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

  if (!instance.listenerCount("error")) {
    attachRedisErrorLogging(instance);
  }

  return instance;
}
