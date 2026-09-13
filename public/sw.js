/*
 * TravIndi service worker.
 *  - Static build assets, fonts and images: cache first.
 *  - Page navigations (same origin): network first, falling back to the last
 *    cached copy of that page, then to /offline.
 *  - API requests, realtime and anything cross-origin are never touched, so
 *    private data is never written to the Cache Storage. Offline copies of trip
 *    data live in IndexedDB, owned by the app and cleared on sign-out.
 */

const VERSION = 'travindi-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = '/offline';
const NEVER_CACHE_PAGES = [/^\/authority/, /^\/partner/, /^\/login/, /^\/register/];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const isStaticAsset = (url) =>
  url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/images/') || /\.(?:woff2?|png|jpe?g|webp|avif|svg|ico)$/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === 'navigate') {
    const cacheable = !NEVER_CACHE_PAGES.some((pattern) => pattern.test(url.pathname));
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (cacheable && response.ok) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(async () => (cacheable && (await caches.match(url.pathname))) || (await caches.match(OFFLINE_URL)) || Response.error()),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
