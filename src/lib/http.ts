import { env } from "@/lib/env";
import dns from "node:dns/promises";
import net from "node:net";

type SemaphoreSlot = {
  resolve: () => void;
  promise: Promise<void>;
};

const domainSemaphores = new Map<string, { running: number; queue: SemaphoreSlot[] }>();
const MAX_OUTBOUND_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function getDomainSemaphore(hostname: string) {
  let sem = domainSemaphores.get(hostname);
  if (!sem) {
    sem = { running: 0, queue: [] };
    domainSemaphores.set(hostname, sem);
  }
  return sem;
}

function isPrivateAddress(address: string) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split(".").map((part) => Number.parseInt(part, 10));
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a === 169 && b === 254 ||
      a === 192 && b === 168 ||
      a === 100 && b !== undefined && b >= 64 && b <= 127 ||
      a === 172 && b !== undefined && b >= 16 && b <= 31 ||
      a >= 224
    ) {
      return true;
    }
    return false;
  }

  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("ff")
    );
  }

  return false;
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  );
}

async function assertSafeOutboundDestination(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported outbound protocol: ${url.protocol}`);
  }

  if (isLocalHostname(url.hostname)) {
    throw new Error("Outbound requests to local hostnames are not allowed");
  }

  if (net.isIP(url.hostname)) {
    if (isPrivateAddress(url.hostname)) {
      throw new Error("Outbound requests to private IP addresses are not allowed");
    }
    return;
  }

  const resolved = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (resolved.some((record) => isPrivateAddress(record.address))) {
    throw new Error("Outbound requests to private IP addresses are not allowed");
  }
}

async function readLimitedResponseBody(response: Response) {
  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      total += value.byteLength;
      if (total > MAX_OUTBOUND_RESPONSE_BYTES) {
        throw new Error("Outbound response exceeded the maximum allowed size");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

function rewriteResponseUrl(response: Response, finalUrl: string) {
  (response as Response & { finalUrl?: string }).finalUrl = finalUrl;
  try {
    Object.defineProperty(response, "url", {
      value: finalUrl,
      configurable: true,
    });
  } catch {
    // Best effort only. Consumers still have a functional Response object.
  }
}

async function fetchWithPolicy(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  redirectCount: number,
): Promise<Response> {
  const urlString = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(urlString);

  await assertSafeOutboundDestination(url);

  const release = await acquireDomainSlot(url.hostname);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers({
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
      "user-agent": "Feedy/1.0 (+https://self-hosted.local) mobile-first feed reader",
    });
    for (const [key, value] of new Headers(init.headers)) {
      headers.set(key, value);
    }

    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
      redirect: "manual",
      headers,
      next: { revalidate: 0 },
    });

    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.status !== 304 &&
      response.status !== 305 &&
      response.status !== 306
    ) {
      if (redirectCount >= MAX_REDIRECTS) {
        throw new Error("Too many redirects");
      }

      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Redirect response was missing a location header");
      }

      const nextUrl = new URL(location, url);
      clearTimeout(timeout);
      release();
      return await fetchWithPolicy(nextUrl, init, timeoutMs, redirectCount + 1);
    }

    const body = response.status === 204 || response.status === 304 ? null : await readLimitedResponseBody(response);
    const safeResponse = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    rewriteResponseUrl(safeResponse, url.href);
    return safeResponse;
  } finally {
    clearTimeout(timeout);
    release();
  }
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
  return fetchWithPolicy(input, init, timeoutMs, 0);
}
