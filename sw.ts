const CACHE_NAME = "cheatle-v1";

const STATIC_ASSETS = ["/icon-192x192.png", "/icon-512x512.png"];

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  sw.skipWaiting();
});

sw.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
  );
  sw.clients.claim();
});

sw.addEventListener("fetch", (event: FetchEvent) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then(async (response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, clone);
          }
          return response;
        })
        .catch(() => cached || new Response("Offline", { status: 503 }));

      return cached || fetchPromise;
    })
  );
});
