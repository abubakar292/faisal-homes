const CACHE_NAME = 'faisal-homes-pwa-v1';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/brand/faisal-logo.png',
  '/brand/faisal-mark.png',
  '/brand/icon-192.png',
  '/brand/icon-512.png',
  '/brand/favicon-32.png',
  '/brand/apple-touch-icon.png',
  '/manifest.json'
];

// Install: precache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('PWA: Precache partial error', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: purge stale caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: network-first for navigation, stale-while-revalidate for assets
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip Firebase, Firestore, external analytics and non-origin requests
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('firebase')
  ) {
    return;
  }

  // Navigation requests (HTML): Network first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/index.html');
          return fallback || new Response('Offline - Faisal Homes', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        })
    );
    return;
  }

  // Static assets (images, css, js, fonts): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
