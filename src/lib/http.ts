export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000,
) {
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
  }
}
