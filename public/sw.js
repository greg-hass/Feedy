const CACHE_NAME = "feedy-shell-v3";
const SHELL_ROUTES = ["/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ROUTES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        return (await caches.match("/offline")) || Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      fetch(request).catch(async () => caches.match(request)),
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(async () => caches.match(request)),
  );
});
