// TravIndi service worker — hand-rolled, not a build-pipeline plugin
// (next-pwa/@serwist), so it never enters the Turbopack bundle and stays
// a plain static file under full control. Explicit, narrow cache
// strategies only:
//
// - Cache-first for static assets (images, Next's own hashed build
//   output, the favicon).
// - Network-first-falling-back-to-cache for exactly three read endpoints
//   (trip detail, trip itinerary, destination detail) — matched by path,
//   not host, so this works regardless of which origin
//   NEXT_PUBLIC_API_BASE_URL points at.
// - Everything else (crowd/weather/safety/booking endpoints, navigation,
//   third-party requests) is left to the network untouched — offline
//   must show "unavailable," never stale live-condition data served as
//   if it were fresh.
//
// Mutations (non-GET) are never intercepted or cached.

const STATIC_CACHE = "travindi-static-v1";
const API_CACHE = "travindi-api-v1";
const CURRENT_CACHES = [STATIC_CACHE, API_CACHE];

const STATIC_PATTERNS = [/^\/images\//, /^\/_next\/static\//, /^\/favicon\.ico$/];
const API_NETWORK_FIRST_PATTERNS = [
  /^\/api\/v1\/trips\/[^/]+\/itinerary$/,
  /^\/api\/v1\/trips\/[^/]+$/,
  /^\/api\/v1\/destinations\/[^/]+$/,
];

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function matchesAny(pathname, patterns) {
  return patterns.some((pattern) => pattern.test(pathname));
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstWithCacheFallback(request) {
  let response;
  try {
    response = await fetch(request);
  } catch (err) {
    const cache = await caches.open(API_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
  if (response.ok) {
    // Best-effort, never lets a caching failure break the real response
    // that's already on its way back to the page.
    caches
      .open(API_CACHE)
      .then((cache) => cache.put(request.clone ? request.clone() : request, response.clone()))
      .catch(() => {});
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (matchesAny(url.pathname, STATIC_PATTERNS)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (matchesAny(url.pathname, API_NETWORK_FIRST_PATTERNS)) {
    event.respondWith(networkFirstWithCacheFallback(request));
    return;
  }
});
