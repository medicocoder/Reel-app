// =====================================================================
// Reel — personal X bookmark video viewer (PWA skeleton / vibe-coding base)
// This file is split into clearly marked sections so you can replace
// the MOCK sections with real calls once you have API credentials.
// =====================================================================

const CACHE_NAME = 'reel-video-cache-v1';

// ---------------------------------------------------------------------
// 1. CONFIG — fill these in once you register an app at developer.x.com
// ---------------------------------------------------------------------
const CONFIG = {
  clientId: 'TkhiM2N1SXJ3RC1CZ2dhMnEtZ246MTpjaQ',              // from X Developer Portal (OAuth 2.0, "public client" type enables PKCE without a secret)
  redirectUri: window.location.origin + window.location.pathname, // must match the callback URL registered in the portal
  authEndpoint: 'https://x.com/i/oauth2/authorize',
  tokenEndpoint: 'https://x-proxy.soheil-sptfy.workers.dev/2/oauth2/token', // NOTE: see "CORS caveat" comment near exchangeCodeForToken()
  scopes: ['bookmark.read', 'users.read', 'offline.access'],
};

// ---------------------------------------------------------------------
// 2. MOCK DATA — remove once real fetchBookmarks() is wired up.
// Structure mirrors what you'd build from the real X API response:
// each video has multiple bitrate variants (like X's media.variants).
// Sample clips below are public domain test assets (Big Buck Bunny),
// used only to demo the quality switcher — swap for real variant URLs.
// ---------------------------------------------------------------------
const MOCK_FOLDERS = [
  { id: 'f1', name: 'آموزشی', videos: ['v1', 'v2'] },
  { id: 'f2', name: 'طنز', videos: ['v3'] },
  { id: 'f3', name: 'مستند', videos: ['v4'] },
  { id: 'f4', name: 'برای بعد', videos: ['v2', 'v3'] },
];

const MOCK_VIDEOS = {
  v1: {
    id: 'v1', author: '@design_notes', text: 'یک ترد کوتاه درباره‌ی سیستم‌های تایپوگرافی و این‌که چطور مقیاس تایپ رو بچینیم.',
    tweetUrl: 'https://x.com/i/status/1',
    variants: [
      { label: '360p', bitrate: 360, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
      { label: '720p', bitrate: 720, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
    ],
  },
  v2: {
    id: 'v2', author: '@field_notes', text: 'کلیپ کوتاه از فرآیند رندر یک صحنه انیمیشن، فریم به فریم.',
    tweetUrl: 'https://x.com/i/status/2',
    variants: [
      { label: '360p', bitrate: 360, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
      { label: '480p', bitrate: 480, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
    ],
  },
  v3: {
    id: 'v3', author: '@daily_clip', text: 'یه کلیپ خنده‌دار که یه دوست فرستاده بود، صرفاً برای بایگانی.',
    tweetUrl: 'https://x.com/i/status/3',
    variants: [
      { label: '360p', bitrate: 360, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4' },
    ],
  },
  v4: {
    id: 'v4', author: '@archive_reel', text: 'بخشی از یک مستند کوتاه درباره‌ی معماری اواسط قرن بیستم.',
    tweetUrl: 'https://x.com/i/status/4',
    variants: [
      { label: '480p', bitrate: 480, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4' },
      { label: '1080p', bitrate: 1080, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4' },
    ],
  },
};

// ---------------------------------------------------------------------
// 3. AUTH — OAuth 2.0 + PKCE against X. This part runs fully client-side.
// ---------------------------------------------------------------------
function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(str) {
  const data = new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-256', data);
}

async function startLogin() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(await sha256(verifier));
  sessionStorage.setItem('pkce_verifier', verifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    scope: CONFIG.scopes.join(' '),
    state: base64url(crypto.getRandomValues(new Uint8Array(16))),
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  window.location.href = `${CONFIG.authEndpoint}?${params.toString()}`;
}

// CORS caveat: some OAuth providers block browser-side fetch to their
// token endpoint. If exchangeCodeForToken() fails with a CORS error in
// the console, you'll need a tiny serverless proxy (a single Cloudflare
// Worker / Vercel function) that just forwards this POST — it does NOT
// need to hold a client secret since PKCE public clients don't use one.
async function exchangeCodeForToken(code) {
  const verifier = sessionStorage.getItem('pkce_verifier');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    code,
    code_verifier: verifier,
  });
  const res = await fetch(CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('Token exchange failed: ' + res.status);
  return res.json(); // { access_token, refresh_token, expires_in, ... }
}

function isLoggedIn() {
  return !!localStorage.getItem('reel_access_token');
}

// ---------------------------------------------------------------------
// 4. BOOKMARKS — real call shape for when you're off mock data.
// Folder assignment for the "bookmarked with this app" scenario is kept
// locally (folderMap below). For the "bookmarked elsewhere" scenario,
// swap loadFolderMap() to fetch a JSON file from a GitHub raw URL that
// maps { folderName: [tweetId, ...] }, then still resolve media through
// this same X API call.
// ---------------------------------------------------------------------
async function fetchBookmarksFromX(userId, accessToken, sinceId = null) {
  const url = new URL(`https://x-proxy.soheil-sptfy.workers.dev//2/users/${userId}/bookmarks`);
  url.searchParams.set('expansions', 'attachments.media_keys,author_id');
  url.searchParams.set('media.fields', 'variants,type,duration_ms');
  url.searchParams.set('tweet.fields', 'created_at');
  url.searchParams.set('max_results', '100'); // max allowed per request
  if (sinceId) url.searchParams.set('since_id', sinceId); // only items newer than the last synced one
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('Bookmarks fetch failed: ' + res.status);
  return res.json();
  // Real response gives media.variants: [{bit_rate, content_type, url}, ...]
  // per video — filter content_type === 'video/mp4' (or the m3u8 master
  // playlist if X returns one) and sort by bit_rate to build the quality list.
}

// ---------------------------------------------------------------------
// 4b. INCREMENTAL SYNC — call this on app open, not on a timer. It only
// asks the API for bookmarks newer than the last sync, then merges them
// into a local store. This is what keeps real-world usage far under the
// free-tier rate limit (10 req / 15 min, 100 items per request) even
// with a large bookmark backlog.
// ---------------------------------------------------------------------
async function syncBookmarks(userId, accessToken) {
  const lastId = localStorage.getItem('reel_since_id'); // null on first-ever sync
  const data = await fetchBookmarksFromX(userId, accessToken, lastId);
  const newItems = data.data || [];

  if (newItems.length) {
    const store = JSON.parse(localStorage.getItem('reel_bookmark_store') || '[]');
    localStorage.setItem('reel_bookmark_store', JSON.stringify([...newItems, ...store]));
    localStorage.setItem('reel_since_id', newItems[0].id); // X returns newest-first
  }
  return newItems.length; // how many new bookmarks came in, useful for a toast/badge
}


function loadFolderMap() {
  // MOCK: local mapping. Replace with localStorage-backed editor,
  // or a fetch() to a GitHub raw JSON file for the external-bookmarking case.
  return MOCK_FOLDERS;
}

async function fetchMyUserId(accessToken) {
  const res = await fetch('https://x-proxy.soheil-sptfy.workers.dev/2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('users/me failed: ' + res.status);
  const data = await res.json();
  localStorage.setItem('reel_user_id', data.data.id);
  return data.data.id;
}

// ---------------------------------------------------------------------
// 5. UI STATE + RENDERING
// ---------------------------------------------------------------------
let currentFolder = null;
let currentVideo = null;
let currentVariantIndex = 0;

const el = (id) => document.getElementById(id);

function renderFolders() {
  const grid = el('folder-grid');
  const folders = loadFolderMap();
  el('folder-total').textContent = `${folders.length} فولدر`;
  grid.innerHTML = folders.map(f => `
    <div class="folder-card" data-id="${f.id}">
      <div class="perf"></div>
      <div class="count">${f.videos.length}</div>
      <div class="name">${f.name}</div>
    </div>
  `).join('');
  grid.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => openFolder(card.dataset.id));
  });
}

async function openFolder(folderId) {
  const folders = loadFolderMap();
  currentFolder = folders.find(f => f.id === folderId);
  el('folder-title').textContent = currentFolder.name;
  el('folders-view').classList.add('hidden');
  el('videos-view').classList.remove('hidden');
  el('player-screen').classList.remove('active');

  const list = el('video-list');
  const rows = await Promise.all(currentFolder.videos.map(async (vid) => {
    const v = MOCK_VIDEOS[vid];
    const cached = await isVideoCached(v);
    return `
      <div class="video-row" data-id="${v.id}">
        <div class="thumb">▶${cached ? '<span class="cache-badge">کش‌شده</span>' : ''}</div>
        <div class="video-meta">
          <div class="author">${v.author}</div>
          <div class="text">${v.text}</div>
          <div class="meta-row"><span>${v.variants.length} کیفیت موجود</span></div>
        </div>
      </div>`;
  }));
  list.innerHTML = rows.join('');
  list.querySelectorAll('.video-row').forEach(row => {
    row.addEventListener('click', () => openPlayer(row.dataset.id));
  });
}

async function openPlayer(videoId) {
  currentVideo = MOCK_VIDEOS[videoId];
  currentVariantIndex = currentVideo.variants.length - 1; // default: highest quality
  el('videos-view').classList.add('hidden');
  el('player-screen').classList.add('active');
  el('player-caption').textContent = `${currentVideo.author} — ${currentVideo.text}`;
  el('open-x-btn').onclick = () => window.open(currentVideo.tweetUrl, '_blank');
  renderQualitySelect();
  await loadVariant(currentVariantIndex);
  updateNetHint();
}

function renderQualitySelect() {
  const wrap = el('quality-select');
  wrap.innerHTML = currentVideo.variants.map((v, i) =>
    `<button data-i="${i}" class="${i === currentVariantIndex ? 'active' : ''}">${v.label}</button>`
  ).join('');
  wrap.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = Number(btn.dataset.i);
      if (i === currentVariantIndex) return;
      const t = el('video-el').currentTime; // preserve playback position across quality switch
      currentVariantIndex = i;
      renderQualitySelect();
      await loadVariant(i, t);
    });
  });
}

async function loadVariant(index, resumeAt = 0) {
  const variant = currentVideo.variants[index];
  const videoEl = el('video-el');
  const cachedUrl = await getCachedUrl(variant.url);
  videoEl.src = cachedUrl || variant.url;
  videoEl.currentTime = resumeAt;
  videoEl.play().catch(() => {}); // autoplay may be blocked until user gesture; fine on click-through
  el('cache-btn').textContent = cachedUrl ? 'ذخیره‌شده ✓' : 'ذخیره برای آفلاین';
}

function updateNetHint() {
  // navigator.connection is NOT available in iOS Safari — this degrades
  // gracefully to a static label there, which is why manual quality
  // selection (not auto ABR) is the right call for this app.
  const conn = navigator.connection || navigator.webkitConnection;
  el('net-label').textContent = conn?.effectiveType ? conn.effectiveType.toUpperCase() : 'نامشخص';
}

// ---------------------------------------------------------------------
// 6. OFFLINE CACHE — Cache Storage API (works in iOS Safari PWAs, with
// the caveat noted earlier: unused installed PWAs may have their cache
// evicted by WebKit after a period of inactivity).
// ---------------------------------------------------------------------
async function getCachedUrl(url) {
  if (!('caches' in window)) return null;
  const cache = await caches.open(CACHE_NAME);
  const match = await cache.match(url);
  return match ? url : null; // service worker serves cached response transparently on this URL
}

async function isVideoCached(video) {
  if (!('caches' in window)) return false;
  const cache = await caches.open(CACHE_NAME);
  for (const v of video.variants) {
    if (await cache.match(v.url)) return true;
  }
  return false;
}

el('cache-btn')?.addEventListener('click', async () => {
  if (!('caches' in window)) { alert('کش در این مرورگر پشتیبانی نمیشه'); return; }
  const variant = currentVideo.variants[currentVariantIndex];
  const cache = await caches.open(CACHE_NAME);
  el('cache-btn').textContent = 'در حال ذخیره…';
  try {
    await cache.add(variant.url);
    el('cache-btn').textContent = 'ذخیره‌شده ✓';
  } catch (e) {
    el('cache-btn').textContent = 'خطا در ذخیره';
  }
});

// ---------------------------------------------------------------------
// 7. NAVIGATION WIRING
// ---------------------------------------------------------------------
el('back-to-folders').addEventListener('click', () => {
  el('videos-view').classList.add('hidden');
  el('folders-view').classList.remove('hidden');
});
el('back-to-videos').addEventListener('click', () => {
  el('video-el').pause();
  el('player-screen').classList.remove('active');
  el('videos-view').classList.remove('hidden');
});
el('login-btn').addEventListener('click', startLogin);
el('demo-btn').addEventListener('click', () => {
  // Lets you test the whole UI/player/cache flow right now, with mock
  // data, before you have real X API credentials. Remove this button
  // once CONFIG.clientId is filled in and real login works.
  localStorage.setItem('reel_access_token', 'demo');
  el('login-screen').classList.add('hidden');
  el('app-screen').classList.add('active');
  renderFolders();
});
el('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('reel_access_token');
  el('video-el')?.pause();
  el('player-screen').classList.remove('active');
  el('videos-view').classList.add('hidden');
  el('folders-view').classList.remove('hidden');
  el('app-screen').classList.remove('active');
  el('login-screen').classList.remove('hidden');
});

// ---------------------------------------------------------------------
// 8. BOOTSTRAP
// ---------------------------------------------------------------------
async function bootstrap() {
  // Handle OAuth callback (?code=...&state=...)
  const params = new URLSearchParams(window.location.search);
  if (params.has('code')) {
    try {
      const token = await exchangeCodeForToken(params.get('code'));
      localStorage.setItem('reel_access_token', token.access_token);
      window.history.replaceState({}, '', CONFIG.redirectUri); // strip ?code from URL
    } catch (e) {
      console.error(e);
      alert('ورود ناموفق بود — کنسول رو برای جزئیات ببین');
    }
  }

  if (isLoggedIn()) {
    el('login-screen').classList.add('hidden');
    el('app-screen').classList.add('active');
    renderFolders();

    // Real login (not demo mode) → sync on open, not on a timer.
    const token = localStorage.getItem('reel_access_token');
    if (token && token !== 'demo') {
      try {
        const userId = localStorage.getItem('reel_user_id') || (await fetchMyUserId(token));
        const newCount = await syncBookmarks(userId, token);
        if (newCount) console.log(`${newCount} new bookmark(s) synced`);
      } catch (e) {
        console.error('Sync failed:', e); // e.g. rate-limited — safe to ignore, cached data still shows
      }
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  }
}

bootstrap();
