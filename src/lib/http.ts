import { ProxyAgent, Agent, fetch as undiciFetch } from "undici";

import { env } from "@/lib/env";
import dns from "node:dns/promises";
import net from "node:net";

type SemaphoreSlot = {
	resolve: () => void;
	promise: Promise<void>;
};

let redditProxyAgent: ProxyAgent | undefined;
if (env.REDDIT_PROXY_URL) {
	redditProxyAgent = new ProxyAgent(env.REDDIT_PROXY_URL);
}

const domainSemaphores = new Map<
	string,
	{ running: number; queue: SemaphoreSlot[] }
>();
const domainRateLimitUntil = new Map<string, number>();
const MAX_OUTBOUND_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MAX_RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;

function getDomainSemaphore(hostname: string) {
	let sem = domainSemaphores.get(hostname);
	if (!sem) {
		sem = { running: 0, queue: [] };
		domainSemaphores.set(hostname, sem);
	}
	return sem;
}

function isRedditHost(hostname: string) {
	const normalized = hostname.toLowerCase();
	return normalized === "reddit.com" || normalized.endsWith(".reddit.com");
}

export function buildRedditRssProxyUrl(
	proxyBaseUrl: string,
	targetUrl: string,
) {
	const proxyUrl = new URL(proxyBaseUrl);
	proxyUrl.searchParams.set("url", targetUrl);
	return proxyUrl;
}

function getEffectiveDomainConcurrency(hostname: string) {
	if (isRedditHost(hostname)) {
		return 1;
	}

	return env.REFRESH_DOMAIN_CONCURRENCY;
}

function getRateLimitCooldownMs(response: Response) {
	const retryAfter = response.headers.get("retry-after");
	if (retryAfter) {
		const seconds = Number.parseInt(retryAfter, 10);
		if (Number.isFinite(seconds) && seconds > 0) {
			return Math.min(seconds * 1000, MAX_RATE_LIMIT_COOLDOWN_MS);
		}

		const dateMs = Date.parse(retryAfter);
		if (Number.isFinite(dateMs)) {
			return Math.min(
				Math.max(dateMs - Date.now(), 0),
				MAX_RATE_LIMIT_COOLDOWN_MS,
			);
		}
	}

	const redditReset = response.headers.get("x-ratelimit-reset");
	if (redditReset) {
		const seconds = Number.parseFloat(redditReset);
		if (Number.isFinite(seconds) && seconds > 0) {
			return Math.min(Math.ceil(seconds * 1000), MAX_RATE_LIMIT_COOLDOWN_MS);
		}
	}

	return 60_000;
}

function rememberRateLimit(hostname: string, cooldownMs: number) {
	const until = Date.now() + cooldownMs;
	domainRateLimitUntil.set(
		hostname,
		Math.max(domainRateLimitUntil.get(hostname) ?? 0, until),
	);
}

/**
 * Wait for a rate-limit cooldown to expire instead of throwing.
 * Capped at MAX_RATE_LIMIT_WAIT_MS to avoid blocking the worker indefinitely.
 */
const MAX_RATE_LIMIT_WAIT_MS = 60_000;

async function waitForRateLimitCooldown(hostname: string) {
	const limitedUntil = domainRateLimitUntil.get(hostname) ?? 0;
	const remainingMs = limitedUntil - Date.now();
	if (remainingMs <= 0) {
		if (limitedUntil > 0) {
			domainRateLimitUntil.delete(hostname);
		}
		return;
	}

	const waitMs = Math.min(remainingMs, MAX_RATE_LIMIT_WAIT_MS);
	await new Promise<void>((resolve) => setTimeout(resolve, waitMs));

	if (Date.now() >= limitedUntil) {
		domainRateLimitUntil.delete(hostname);
	}
}

function isPrivateAddress(address: string) {
	if (net.isIP(address) === 4) {
		const [a, b] = address.split(".").map((part) => Number.parseInt(part, 10));
		if (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 169 && b === 254) ||
			(a === 192 && b === 168) ||
			(a === 100 && b !== undefined && b >= 64 && b <= 127) ||
			(a === 172 && b !== undefined && b >= 16 && b <= 31) ||
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

/**
 * Resolves a URL's hostname to IP addresses and validates them against
 * private/reserved ranges. Returns the resolved addresses so callers can
 * pin connections to the validated IPs, preventing DNS rebinding attacks
 * where DNS is re-resolved between validation and connection.
 */
/** @returns resolved addresses, never empty on success */
async function resolveOutboundHostname(
	url: URL,
): Promise<{ address: string; family: number }[]> {
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`Unsupported outbound protocol: ${url.protocol}`);
	}

	if (isLocalHostname(url.hostname)) {
		throw new Error("Outbound requests to local hostnames are not allowed");
	}

	if (net.isIP(url.hostname)) {
		if (isPrivateAddress(url.hostname)) {
			throw new Error(
				"Outbound requests to private IP addresses are not allowed",
			);
		}
		return [{ address: url.hostname, family: net.isIP(url.hostname) as 4 | 6 }];
	}

	const resolved = await dns.lookup(url.hostname, {
		all: true,
		verbatim: true,
	});
	if (resolved.some((record) => isPrivateAddress(record.address))) {
		throw new Error(
			"Outbound requests to private IP addresses are not allowed",
		);
	}
	return resolved;
}

// Test-only override: inject a fetch implementation for non-proxy paths.
// In production, the DNS-pinned undici path is always used (see fetchWithPolicy).
let testFetchOverride:
	| ((url: string | URL, init?: RequestInit) => Promise<Response>)
	| undefined;

export function __setOutboundFetch(fn: typeof testFetchOverride): void {
	testFetchOverride = fn;
}

async function createDnsPinnedFetch(
	address: { address: string; family: number },
	servername: string,
): Promise<(url: string | URL, init?: RequestInit) => Promise<Response>> {
	const agent = new Agent({
		// The `connect` option is passed through to net.connect/tls.connect.
		// `servername` ensures correct TLS SNI when connecting to the IP directly.
		// `lookup` returns the already-validated IP, preventing DNS re-resolution.
		connect: {
			servername,
			lookup: (
				_hostname: string,
				opts: { all?: boolean } | undefined,
				cb: (
					err: Error | null,
					addr: string | { address: string; family: number }[],
					fam?: number,
				) => void,
			) => {
				// When `opts.all` is true (which it is whenever the upstream DNS
				// call used `all: true`), Node.js expects the callback to receive
				// an ARRAY of address records, not a single (address, family)
				// pair. We always pin to one validated IP, so wrap it in an array
				// in that case. Without this, Node.js treats the single address
				// string as the `addresses` array and fails with
				// ERR_INVALID_IP_ADDRESS: undefined when it can't index into it.
				if (opts?.all) {
					cb(null, [address]);
					return;
				}
				cb(null, address.address, address.family);
			},
		} as Record<string, unknown>,
	});

	return (url: string | URL, init?: RequestInit) =>
		undiciFetch(url, {
			...(init as Record<string, unknown>),
			dispatcher: agent,
		}) as unknown as Promise<Response>;
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
	const urlString =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.href
				: input.url;
	const url = new URL(urlString);

	// Resolve and validate the destination, capturing the resolved addresses
	// for DNS-pinned connections (prevents DNS rebinding attacks where the
	// hostname is re-resolved to a different IP between validation and connect).
	const resolvedAddresses = await resolveOutboundHostname(url);
	const primaryAddress = resolvedAddresses[0];
	if (!primaryAddress?.address) {
		throw new Error(
			`Outbound request blocked: DNS resolution for ${url.hostname} returned no addresses`,
		);
	}

	const release = await acquireDomainSlot(url.hostname);
	await waitForRateLimitCooldown(url.hostname);

	const proxiedUrl =
		isRedditHost(url.hostname) && env.REDDIT_RSS_PROXY_URL
			? buildRedditRssProxyUrl(env.REDDIT_RSS_PROXY_URL, url.href)
			: null;
	if (proxiedUrl) {
		// Validate the proxy URL too — it points to user infrastructure so
		// we don't need DNS pinning, but we still check for misconfigurations.
		await resolveOutboundHostname(proxiedUrl);
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const headers = new Headers({
			accept:
				"application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
			"user-agent":
				"Feedy/1.0 (+https://self-hosted.local) mobile-first feed reader",
		});
		for (const [key, value] of new Headers(init.headers)) {
			headers.set(key, value);
		}

		const useProxy =
			isRedditHost(url.hostname) && redditProxyAgent && !proxiedUrl;
		const fetchUrl = proxiedUrl ?? input;

		// Build the fetch function:
		// 1. Reddit proxy path: route through the configured proxy agent.
		//    The proxy handles DNS for the target URL.
		// 2. Reddit without proxy: use plain undici fetch. Reddit is behind
		//    Cloudflare — DNS pinning to a specific edge IP causes HTTP 421
		//    "Misdirected Request" because Cloudflare's anycast routing
		//    doesn't recognise the pinned connection. SSRF validation still
		//    runs above (resolveOutboundHostname), we just don't pin.
		// 3. Everything else: DNS-pinned undici to prevent re-resolution.
		const outboundFetch = useProxy
			? (() => {
					return (fUrl: string | URL, fInit?: RequestInit) =>
						undiciFetch(fUrl, {
							...(fInit as Record<string, unknown>),
							dispatcher: redditProxyAgent!,
						}) as unknown as Promise<Response>;
				})()
			: isRedditHost(url.hostname) && !testFetchOverride
				? (fUrl: string | URL, fInit?: RequestInit) =>
						undiciFetch(fUrl, {
							...(fInit as Record<string, unknown>),
						}) as unknown as Promise<Response>
			: // For testing, allow injecting a mock fetch implementation.
					// In production, this is always undefined.
					(testFetchOverride ??
					(await createDnsPinnedFetch(primaryAddress, url.hostname)));

		const response = await outboundFetch(fetchUrl as string | URL, {
			...(init as Record<string, unknown>),
			signal: controller.signal,
			redirect: "manual",
			headers,
		});

		if (response.status === 429) {
			const cooldownMs = getRateLimitCooldownMs(response);
			rememberRateLimit(url.hostname, cooldownMs);
		}

		// HTTP 421 "Misdirected Request" — Reddit/Cloudflare returns this
		// when a connection arrives at the wrong edge node. Apply a short
		// cooldown so the next attempt lets Cloudflare re-route.
		if (response.status === 421) {
			rememberRateLimit(url.hostname, 5_000);
		}

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

		const body =
			response.status === 204 || response.status === 304
				? null
				: await readLimitedResponseBody(response);
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
	const limit = getEffectiveDomainConcurrency(hostname);

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
