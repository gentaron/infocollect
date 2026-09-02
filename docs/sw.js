// Service worker: precaches the app shell so InfoCollect opens instantly and
// keeps working offline, and keeps the newest data JSON in a separate cache.

const VERSION = 'v1';
const SHELL_CACHE = `infocollect-shell-${VERSION}`;
const DATA_CACHE = `infocollect-data-${VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll is all-or-nothing; add individually so one missing optional
      // asset cannot break the whole installation.
      await Promise.all(
        SHELL_ASSETS.map((asset) => cache.add(new Request(asset, { cache: 'reload' })).catch(() => {})),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && request.method === 'GET') {
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(async () => {
        const fallback = await caches.match('./index.html', { ignoreSearch: true });
        return fallback || Response.error();
      }),
    );
    return;
  }

  if (url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  event.respondWith(cacheFirst(request).catch(() => caches.match(request, { ignoreSearch: true })));
});

// Optional: refresh the cached payload in the background on supporting browsers.
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'infocollect-refresh') return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(DATA_CACHE);
      for (const path of ['./data/latest.json', './data/index.json']) {
        try {
          const response = await fetch(new Request(path, { cache: 'reload' }));
          if (response.ok) await cache.put(path, response.clone());
        } catch { /* offline: try again next time */ }
      }
    })(),
  );
});
