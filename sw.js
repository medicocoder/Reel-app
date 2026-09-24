// Reel — service worker
// Two jobs:
//   1. Keep the app shell (index.html, app.js, manifest) available offline.
//   2. Play videos that were saved for offline use, INCLUDING seeking:
//      Safari/iOS asks media for byte ranges and refuses a plain 200
//      answer, so cached videos are served back as proper 206 responses.
//
// Everything else (Worker/API calls, fx lookups, the /video-proxy stream
// for videos that are NOT saved) is deliberately left alone: the browser
// handles it natively, so native Range/streaming behaviour is untouched.
//
// NOTE (iOS Safari): if this PWA sits unused for roughly a week, WebKit
// may evict this cache. That's a platform limit, not a bug here.

const SHELL_CACHE = 'reel-shell-v3'; // bumped: old caches (incl. the catch-all one) get deleted on activate
const VIDEO_CACHE = 'reel-video-cache-v1'; // must match CACHE_NAME in app.js

const SHELL_FILES = ['./', './index.html', './app.js', './manifest.json'];
const SHELL_PATHS = new Set(SHELL_FILES.map((f) => new URL(f, self.registration.scope).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== VIDEO_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// "bytes=START-END" against a fully cached file → 206 (or 416).
function rangeResponse(buf, rangeHeader, contentType) {
  const size = buf.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start, end;
  if (m[1] === '') { // suffix range: last N bytes
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': contentType || 'video/mp4',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  });
}

async function serveVideo(request) {
  const cache = await caches.open(VIDEO_CACHE);
  const cached = await cache.match(request.url, { ignoreVary: true });
  if (!cached) return fetch(request); // not saved (or evicted) → network
  const range = request.headers.get('range');
  if (!range) return cached;
  const buf = await cached.arrayBuffer();
  return rangeResponse(buf, range, cached.headers.get('Content-Type')) || cached;
}

async function shellNetworkFirst(request, url) {
  const key = url.origin + url.pathname; // ignore ?add=… / ?code=… when caching
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.status === 200) cache.put(key, res.clone());
    return res;
  } catch (e) {
    return (await cache.match(key)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 1) Saved videos: the app only points <video> at the plain CDN URL when
  //    it is in VIDEO_CACHE; otherwise it uses the Worker proxy URL (below).
  if (request.destination === 'video' && /(^|\.)twimg\.com$/.test(url.hostname)) {
    event.respondWith(serveVideo(request));
    return;
  }

  // 2) App shell (same origin only): network-first, cache as offline fallback.
  if (url.origin === self.location.origin && SHELL_PATHS.has(url.pathname)) {
    event.respondWith(shellNetworkFirst(request, url));
    return;
  }

  // 3) Everything else (Worker, fx, video-proxy, …): not intercepted.
});
