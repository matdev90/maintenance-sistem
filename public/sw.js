const CACHE_NAME = 'simrs-v4';
const STATIC_ASSETS = [
  '/css/anim-3d.css',
  '/js/modal-3d.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/socket.io/')) return;
  if (!url.pathname.match(/\.(css|js|png|jpg|gif|svg|ico|woff2?)$/)) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)).catch(() => fetch(event.request))
  );
});
