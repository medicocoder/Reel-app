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
  // Must match the Callback URI in the X portal BYTE FOR BYTE, e.g.
  // https://USERNAME.github.io/reel-app/  (with trailing slash, no index.html).
  // Computed so that opening .../reel-app/index.html still yields the canonical URL.
  redirectUri: window.location.origin + window.location.pathname.replace(/index\.html$/, '').replace(/([^/])$/, '$1/'),
  authEndpoint: 'https://x.com/i/oauth2/authorize',
  apiBase: 'https://x-proxy.soheil-sptfy.workers.dev', // Cloudflare Worker proxy (NO trailing slash)
  tokenEndpoint: 'https://x-proxy.soheil-sptfy.workers.dev/2/oauth2/token',
  // tweet.read is required by the bookmarks endpoint; without it you get 403
  scopes: ['tweet.read', 'bookmark.read', 'users.read', 'offline.access'],
  maxPages: 8, // X returns at most ~800 bookmarks (8 pages x 100)
};

// Tweet text comes from the network and is rendered via innerHTML below,
// so it MUST be escaped.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
  try {
    await startLoginInner();
  } catch (e) {
    console.error(e);
    alert('خطا در شروع ورود: ' + e.message);
  }
}

async function startLoginInner() {
  if (location.protocol !== 'https:') {
    throw new Error('ورود X فقط روی آدرس https (همون GitHub Pages) کار می‌کنه، نه با باز کردن فایل روی کامپیوتر. آدرس فعلی: ' + location.href);
  }
  if (!crypto.subtle) throw new Error('crypto.subtle در این مرورگر/حالت در دسترس نیست');
  if (new URLSearchParams(location.search).has('debug')) {
    alert('redirect_uri که ارسال میشه:\n' + CONFIG.redirectUri + '\n\nباید دقیقاً همین در X Developer Portal ثبت شده باشه.');
  }
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(await sha256(verifier));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  localStorage.setItem('pkce_verifier', verifier);
  localStorage.setItem('pkce_state', state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    scope: CONFIG.scopes.join(' '),
    state,
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
  const verifier = localStorage.getItem('pkce_verifier');
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
  if (!res.ok) throw new Error('Token exchange failed: ' + res.status + ' ' + (await res.text()));
  return res.json(); // { access_token, refresh_token, expires_in, ... }
}

// X access tokens live ~2 hours. offline.access gives a refresh token;
// X rotates it on every use, so we must save the new one each time.
function saveTokens(t) {
  localStorage.setItem('reel_access_token', t.access_token);
  if (t.refresh_token) localStorage.setItem('reel_refresh_token', t.refresh_token);
  if (t.expires_in) localStorage.setItem('reel_token_expires_at', String(Date.now() + t.expires_in * 1000));
}

async function refreshAccessToken() {
  const rt = localStorage.getItem('reel_refresh_token');
  if (!rt) throw new Error('no refresh token — log in again');
  const res = await fetch(CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: CONFIG.clientId }),
  });
  if (!res.ok) throw new Error('Token refresh failed: ' + res.status);
  const t = await res.json();
  saveTokens(t);
  return t.access_token;
}

async function getValidToken() {
  const exp = Number(localStorage.getItem('reel_token_expires_at') || 0);
  if (exp && Date.now() > exp - 60000) return refreshAccessToken();
  return localStorage.getItem('reel_access_token');
}

// fetch wrapper for X API calls: attaches the token, retries once on 401.
async function xFetch(url, retry = true) {
  const token = await getValidToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 && retry) {
    await refreshAccessToken();
    return xFetch(url, false);
  }
  if (res.status === 429) throw new Error('Rate limited (429) — try again in 15 minutes');
  return res;
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
async function fetchBookmarksFromX(userId, paginationToken = null) {
  const url = new URL(`${CONFIG.apiBase}/2/users/${userId}/bookmarks`);
  url.searchParams.set('expansions', 'attachments.media_keys,author_id');
  url.searchParams.set('media.fields', 'variants,type,duration_ms');
  url.searchParams.set('tweet.fields', 'created_at,attachments,author_id');
  url.searchParams.set('user.fields', 'username');
  url.searchParams.set('max_results', '100');
  // NOTE: the bookmarks endpoint does NOT support since_id. Only
  // max_results + pagination_token. Results are newest-first.
  if (paginationToken) url.searchParams.set('pagination_token', paginationToken);
  const res = await xFetch(url);
  if (!res.ok) throw new Error('Bookmarks fetch failed: ' + res.status + ' ' + (await res.text()));
  return res.json(); // { data, includes: {media, users}, meta: {next_token} }
}

// Turn raw tweets + includes into the same shape the UI already uses
// for MOCK_VIDEOS. Tweets without video/GIF are skipped.
function toVideoRecords(tweets, includes) {
  const media = new Map((includes?.media || []).map(m => [m.media_key, m]));
  const users = new Map((includes?.users || []).map(u => [u.id, u]));
  const out = [];
  for (const t of tweets) {
    const m = (t.attachments?.media_keys || []).map(k => media.get(k))
      .find(x => x && (x.type === 'video' || x.type === 'animated_gif'));
    if (!m) continue;
    const variants = (m.variants || [])
      .filter(v => v.content_type === 'video/mp4') // skip m3u8 playlists
      .sort((a, b) => (a.bit_rate || 0) - (b.bit_rate || 0)) // low → high
      .map(v => {
        const r = v.url.match(/\/(\d+)x(\d+)\//); // e.g. .../vid/avc1/720x1280/...
        const label = r ? Math.min(+r[1], +r[2]) + 'p' : (m.type === 'animated_gif' ? 'GIF' : 'MP4');
        return { label, bitrate: v.bit_rate || 0, url: v.url };
      });
    if (!variants.length) continue;
    const username = users.get(t.author_id)?.username;
    out.push({
      id: t.id,
      author: username ? '@' + username : '@unknown',
      text: t.text || '',
      tweetUrl: `https://x.com/${username || 'i'}/status/${t.id}`,
      variants,
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// 4b. INCREMENTAL SYNC — page through bookmarks (newest first) and stop
// at the first tweet we've already seen. We remember ALL seen tweet IDs
// (not just videos), so non-video bookmarks don't force re-paging.
// ---------------------------------------------------------------------
async function syncBookmarks(userId) {
  const seen = new Set(JSON.parse(localStorage.getItem('reel_seen_ids') || '[]'));
  const store = JSON.parse(localStorage.getItem('reel_video_store') || '[]');
  const fresh = [];
  const newSeen = [];
  let token = null;
  let reachedKnown = false;

  for (let p = 0; p < CONFIG.maxPages && !reachedKnown; p++) {
    const page = await fetchBookmarksFromX(userId, token);
    const tweets = [];
    for (const t of page.data || []) {
      if (seen.has(t.id)) { reachedKnown = true; break; }
      tweets.push(t);
      newSeen.push(t.id);
    }
    fresh.push(...toVideoRecords(tweets, page.includes));
    token = page.meta?.next_token;
    if (!token) break;
  }

  if (newSeen.length) {
    localStorage.setItem('reel_seen_ids', JSON.stringify([...newSeen, ...seen]));
    localStorage.setItem('reel_video_store', JSON.stringify([...fresh, ...store]));
  }
  return fresh.length; // number of new VIDEOS
}

// --- data source: demo → mock, real login → synced store -------------
function isDemo() { return localStorage.getItem('reel_access_token') === 'demo'; }

function getAllVideos() {
  if (isDemo()) return MOCK_VIDEOS;
  const list = JSON.parse(localStorage.getItem('reel_video_store') || '[]');
  return Object.fromEntries(list.map(v => [v.id, v]));
}
function getVideo(id) { return getAllVideos()[id]; }

function loadFolderMap() {
  if (isDemo()) return MOCK_FOLDERS;
  // TODO: user-defined folders. For now one automatic folder with everything.
  return [{ id: 'all', name: 'همه ویدیوها', videos: Object.keys(getAllVideos()) }];
}

async function fetchMyUserId() {
  const res = await xFetch(`${CONFIG.apiBase}/2/users/me`);
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
      <div class="name">${esc(f.name)}</div>
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
    const v = getVideo(vid);
    const cached = await isVideoCached(v);
    return `
      <div class="video-row" data-id="${v.id}">
        <div class="thumb">▶${cached ? '<span class="cache-badge">کش‌شده</span>' : ''}</div>
        <div class="video-meta">
          <div class="author">${esc(v.author)}</div>
          <div class="text">${esc(v.text)}</div>
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
  currentVideo = getVideo(videoId);
  currentVariantIndex = currentVideo.variants.length - 1; // default: highest quality
  el('videos-view').classList.add('hidden');
  el('player-screen').classList.add('active');
  el('player-caption').textContent = `${currentVideo.author} — ${currentVideo.text}`;
  el('open-x-btn').onclick = () => window.open(currentVideo.tweetUrl, '_blank', 'noopener');
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
  ['reel_access_token', 'reel_refresh_token', 'reel_token_expires_at', 'reel_user_id']
    .forEach(k => localStorage.removeItem(k));
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
    // Stored in localStorage (not sessionStorage) so the flow survives a new
    // tab/window. Consumed exactly once: a duplicate load of the same callback
    // URL finds nothing pending and is ignored silently.
    const pendingState = localStorage.getItem('pkce_state');
    try {
      if (pendingState) {
        if (params.get('state') !== pendingState) throw new Error('state mismatch');
        const token = await exchangeCodeForToken(params.get('code'));
        localStorage.removeItem('pkce_state');
        localStorage.removeItem('pkce_verifier');
        saveTokens(token);
      }
    } catch (e) {
      console.error(e);
      localStorage.removeItem('pkce_state');
      localStorage.removeItem('pkce_verifier');
      alert('ورود ناموفق بود:\n' + String(e.message).slice(0, 400));
    } finally {
      window.history.replaceState({}, '', CONFIG.redirectUri); // strip ?code from URL
    }
  }

  if (isLoggedIn()) {
    el('login-screen').classList.add('hidden');
    el('app-screen').classList.add('active');
    renderFolders();

    // Real login (not demo mode) → sync on open, not on a timer.
    if (!isDemo()) {
      try {
        const userId = localStorage.getItem('reel_user_id') || (await fetchMyUserId());
        const newCount = await syncBookmarks(userId);
        if (newCount) console.log(`${newCount} new video bookmark(s) synced`);
        renderFolders(); // re-render with synced data
      } catch (e) {
        console.error('Sync failed:', e); // cached data still shows
      }
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  }
}

bootstrap();
