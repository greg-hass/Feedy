import { env } from "@/lib/env";

type SemaphoreSlot = {
  resolve: () => void;
  promise: Promise<void>;
};

const domainSemaphores = new Map<string, { running: number; queue: SemaphoreSlot[] }>();

function getDomainSemaphore(hostname: string) {
  let sem = domainSemaphores.get(hostname);
  if (!sem) {
    sem = { running: 0, queue: [] };
    domainSemaphores.set(hostname, sem);
  }
  return sem;
}

async function acquireDomainSlot(hostname: string): Promise<() => void> {
  const sem = getDomainSemaphore(hostname);
  const limit = env.REFRESH_DOMAIN_CONCURRENCY;

  if (sem.running < limit) {
    sem.running++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      sem.running--;
      const next = sem.queue.shift();
      if (next) {
        sem.running++;
        next.resolve();
      }
      if (sem.running === 0 && sem.queue.length === 0) {
        domainSemaphores.delete(hostname);
      }
    };
  }

  return new Promise<() => void>((resolve) => {
    let slotResolve: () => void;
    const promise = new Promise<void>((r) => {
      slotResolve = r;
    });
    sem.queue.push({ resolve: slotResolve!, promise });

    promise.then(() => {
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        sem.running--;
        const next = sem.queue.shift();
        if (next) {
          sem.running++;
          next.resolve();
        }
        if (sem.running === 0 && sem.queue.length === 0) {
          domainSemaphores.delete(hostname);
        }
      });
    });
  });
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = env.REFRESH_HTTP_TIMEOUT_MS,
) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const hostname = new URL(url).hostname;

  const release = await acquireDomainSlot(hostname);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent":
          "Feedy/1.0 (+https://self-hosted.local) mobile-first feed reader",
        accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
        ...init.headers,
      },
      next: { revalidate: 0 },
    });
  } finally {
    clearTimeout(timeout);
    release();
  }
}
