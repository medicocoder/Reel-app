// Reel — service worker
// Two jobs:
//   1. Cache the app shell so the UI itself opens instantly offline.
//   2. Serve any previously-cached video (added via cache.add() in app.js)
//      straight from cache instead of hitting the network again.
//
// NOTE (iOS Safari): if this PWA sits unused for roughly a week, WebKit
// may evict this entire cache to reclaim space. That's a platform limit,
// not a bug here — there's no API to prevent it in a home-screen PWA.

const SHELL_CACHE = 'reel-shell-v1';
const VIDEO_CACHE = 'reel-video-cache-v1'; // must match CACHE_NAME in app.js

const SHELL_FILES = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== VIDEO_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Video files: cache-first (if user tapped "save for offline" earlier)
  if (request.destination === 'video' || request.url.match(/\.(mp4|m3u8|ts)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // App shell: cache-first, so the UI opens even with zero connectivity
  if (SHELL_FILES.some((f) => request.url.endsWith(f.replace('./', '')))) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Everything else (API calls, etc.): network-first, no caching
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
