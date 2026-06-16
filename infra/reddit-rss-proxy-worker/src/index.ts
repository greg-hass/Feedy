type Env = {
  ALLOWED_TARGET_HOSTS?: string;
  PROXY_TOKEN?: string;
};

const DEFAULT_ALLOWED_HOSTS = new Set(["reddit.com", "www.reddit.com", "old.reddit.com"]);
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

function getAllowedHosts(env: Env) {
  const configured = env.ALLOWED_TARGET_HOSTS
    ?.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  return configured?.length ? new Set(configured) : DEFAULT_ALLOWED_HOSTS;
}

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function isAllowedRedditRssUrl(target: URL, allowedHosts: Set<string>) {
  if (target.protocol !== "https:") {
    return false;
  }

  if (!allowedHosts.has(target.hostname.toLowerCase())) {
    return false;
  }

  return target.pathname.endsWith(".rss") || target.pathname.includes("/.rss");
}

async function readLimitedResponse(response: Response) {
  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new Error("Reddit RSS response exceeded maximum size");
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

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonError("Method not allowed", 405);
    }

    const requestUrl = new URL(request.url);
    if (env.PROXY_TOKEN) {
      const token = requestUrl.searchParams.get("token") ?? request.headers.get("x-proxy-token");
      if (token !== env.PROXY_TOKEN) {
        return jsonError("Unauthorized", 401);
      }
    }

    const rawTarget = requestUrl.searchParams.get("url");
    if (!rawTarget) {
      return jsonError("Missing url query parameter");
    }

    let target: URL;
    try {
      target = new URL(rawTarget);
    } catch {
      return jsonError("Invalid target URL");
    }

    if (!isAllowedRedditRssUrl(target, getAllowedHosts(env))) {
      return jsonError("Only Reddit HTTPS RSS URLs are allowed", 403);
    }

    const upstreamInit: RequestInit & {
      cf?: { cacheTtl: number; cacheEverything: boolean };
    } = {
      method: request.method,
      redirect: "manual",
      headers: {
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "user-agent": "FeedyRedditRssProxy/1.0 (+https://github.com/greg-hass/Feedy)",
      },
      cf: {
        cacheTtl: upstreamCacheTtl(target),
        cacheEverything: true,
      },
    };

    const upstream = await fetch(target.href, upstreamInit);

    const headers = new Headers();
    const contentType = upstream.headers.get("content-type") ?? "application/xml; charset=utf-8";
    headers.set("content-type", contentType);
    headers.set("cache-control", upstream.ok ? "public, max-age=60" : "no-store");
    headers.set("x-feedy-reddit-proxy", "cloudflare-worker");

    for (const header of ["retry-after", "x-ratelimit-reset"]) {
      const value = upstream.headers.get(header);
      if (value) headers.set(header, value);
    }

    if (request.method === "HEAD" || upstream.status === 204 || upstream.status === 304) {
      return new Response(null, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    }

    try {
      const body = await readLimitedResponse(upstream);
      return new Response(body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Proxy fetch failed", 502);
    }
  },
};

export default worker;

function upstreamCacheTtl(target: URL) {
  const path = target.pathname.toLowerCase();
  if (path.includes("/comments/")) {
    return 30;
  }
  return 60;
}
