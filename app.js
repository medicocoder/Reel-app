// =====================================================================
// Reel — personal X bookmark video viewer (PWA skeleton / vibe-coding base)
// =====================================================================

const CACHE_NAME = 'reel-video-cache-v1';

const CONFIG = {
  clientId: 'TkhiM2N1SXJ3RC1CZ2dhMnEtZ246MTpjaQ',
  redirectUri: window.location.origin + window.location.pathname.replace(/index\.html$/, '').replace(/([^/])$/, '$1/'),
  authEndpoint: 'https://x.com/i/oauth2/authorize',
  apiBase: 'https://x-proxy.soheil-sptfy.workers.dev',
  tokenEndpoint: 'https://x-proxy.soheil-sptfy.workers.dev/2/oauth2/token',
  scopes: ['tweet.read', 'bookmark.read', 'users.read', 'offline.access'],
  enableApiLogin: false,
  includeAuthors: false,
  fxPath: '/fx/2/status/',
  maxPages: 8,
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const MOCK_FOLDERS = [
  { id: 'f1', name: 'آموزشی', videos: ['v1', 'v2'] },
  { id: 'f2', name: 'طنز', videos: ['v3'] },
  { id: 'f3', name: 'مستند', videos: ['v4'] },
  { id: 'f4', name: 'برای بعد', videos: ['v2', 'v3'] },
];

const MOCK_VIDEOS = {
  v1: { id: 'v1', author: '@design_notes', text: 'یک ترد کوتاه درباره‌ی سیستم‌های تایپوگرافی.', tweetUrl: 'https://x.com/i/status/1',
    variants: [
      { label: '360p', bitrate: 360, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
      { label: '720p', bitrate: 720, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
    ] },
  v2: { id: 'v2', author: '@field_notes', text: 'کلیپ کوتاه از فرآیند رندر یک صحنه انیمیشن.', tweetUrl: 'https://x.com/i/status/2',
    variants: [
      { label: '360p', bitrate: 360, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
      { label: '480p', bitrate: 480, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
    ] },
  v3: { id: 'v3', author: '@daily_clip', text: 'یه کلیپ خنده‌دار برای بایگانی.', tweetUrl: 'https://x.com/i/status/3',
    variants: [ { label: '360p', bitrate: 360, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4' } ] },
  v4: { id: 'v4', author: '@archive_reel', text: 'بخشی از یک مستند کوتاه درباره‌ی معماری.', tweetUrl: 'https://x.com/i/status/4',
    variants: [
      { label: '480p', bitrate: 480, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4' },
      { label: '1080p', bitrate: 1080, url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4' },
    ] },
};

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(str) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); }

async function startLogin() {
  try { await startLoginInner(); } catch (e) { console.error(e); alert('خطا در شروع ورود: ' + e.message); }
}
async function startLoginInner() {
  if (location.protocol !== 'https:') throw new Error('ورود X فقط روی آدرس https کار می‌کنه. آدرس فعلی: ' + location.href);
  if (!crypto.subtle) throw new Error('crypto.subtle در این مرورگر/حالت در دسترس نیست');
  if (new URLSearchParams(location.search).has('debug')) alert('redirect_uri:\n' + CONFIG.redirectUri);
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(await sha256(verifier));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  localStorage.setItem('pkce_verifier', verifier);
  localStorage.setItem('pkce_state', state);
  const params = new URLSearchParams({ response_type: 'code', client_id: CONFIG.clientId, redirect_uri: CONFIG.redirectUri, scope: CONFIG.scopes.join(' '), state, code_challenge: challenge, code_challenge_method: 'S256' });
  window.location.href = `${CONFIG.authEndpoint}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem('pkce_verifier');
  const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: CONFIG.clientId, redirect_uri: CONFIG.redirectUri, code, code_verifier: verifier });
  const res = await fetch(CONFIG.tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error('Token exchange failed: ' + res.status + ' ' + (await res.text()));
  return res.json();
}
function saveTokens(t) {
  localStorage.setItem('reel_access_token', t.access_token);
  if (t.refresh_token) localStorage.setItem('reel_refresh_token', t.refresh_token);
  if (t.expires_in) localStorage.setItem('reel_token_expires_at', String(Date.now() + t.expires_in * 1000));
}
async function refreshAccessToken() {
  const rt = localStorage.getItem('reel_refresh_token');
  if (!rt) throw new Error('no refresh token — log in again');
  const res = await fetch(CONFIG.tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: CONFIG.clientId }) });
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
async function xFetch(url, retry = true) {
  const token = await getValidToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 && retry) { await refreshAccessToken(); return xFetch(url, false); }
  if (res.status === 429) { const e = new Error('Rate limited (429)'); e.status = 429; throw e; }
  return res;
}
function isLoggedIn() { return !!localStorage.getItem('reel_access_token'); }

async function fetchBookmarksFromX(userId, paginationToken = null) {
  const url = new URL(`${CONFIG.apiBase}/2/users/${userId}/bookmarks`);
  url.searchParams.set('expansions', CONFIG.includeAuthors ? 'attachments.media_keys,author_id' : 'attachments.media_keys');
  url.searchParams.set('media.fields', 'variants,type,duration_ms');
  url.searchParams.set('tweet.fields', CONFIG.includeAuthors ? 'attachments,author_id' : 'attachments');
  if (CONFIG.includeAuthors) url.searchParams.set('user.fields', 'username');
  url.searchParams.set('max_results', '100');
  if (paginationToken) url.searchParams.set('pagination_token', paginationToken);
  const res = await xFetch(url);
  if (!res.ok) throw await httpError('Bookmarks fetch', res);
  return res.json();
}

function toVideoRecords(tweets, includes) {
  const media = new Map((includes?.media || []).map(m => [m.media_key, m]));
  const users = new Map((includes?.users || []).map(u => [u.id, u]));
  const out = [];
  for (const t of tweets) {
    const m = (t.attachments?.media_keys || []).map(k => media.get(k)).find(x => x && (x.type === 'video' || x.type === 'animated_gif'));
    if (!m) continue;
    const variants = (m.variants || []).filter(v => v.content_type === 'video/mp4').sort((a, b) => (a.bit_rate || 0) - (b.bit_rate || 0)).map(v => {
      const r = v.url.match(/\/(\d+)x(\d+)\//);
      const label = r ? Math.min(+r[1], +r[2]) + 'p' : (m.type === 'animated_gif' ? 'GIF' : 'MP4');
      return { label, bitrate: v.bit_rate || 0, url: v.url };
    });
    if (!variants.length) continue;
    const username = users.get(t.author_id)?.username;
    out.push({ id: t.id, author: username ? '@' + username : 'ویدیوی X', text: t.text || '', tweetUrl: `https://x.com/${username || 'i'}/status/${t.id}`, variants });
  }
  return out;
}

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
  return { videos: fresh.length, scanned: newSeen.length };
}

function isDemo() { return localStorage.getItem('reel_access_token') === 'demo'; }
function isLocal() { return localStorage.getItem('reel_access_token') === 'local'; }
function getVideoList() { try { return JSON.parse(localStorage.getItem('reel_video_store') || '[]'); } catch { return []; } }
function getAllVideos() { if (isDemo()) return MOCK_VIDEOS; return Object.fromEntries(getVideoList().map(v => [v.id, v])); }
function getVideo(id) { return getAllVideos()[id]; }

function loadCustomFolders() { try { return JSON.parse(localStorage.getItem('reel_folders') || '[]'); } catch { return []; } }
function saveCustomFolders(list) { localStorage.setItem('reel_folders', JSON.stringify(list)); }
function loadFolderMap() {
  if (isDemo()) return MOCK_FOLDERS;
  const list = getVideoList();
  const known = new Set(list.map(v => v.id));
  const custom = loadCustomFolders().map(f => ({ ...f, videos: f.videos.filter(id => known.has(id)) }));
  return [{ id: 'all', name: 'همه ویدیوها', videos: list.map(v => v.id), builtin: true }, ...custom];
}
function newFolderId() { return 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function addToFolderByName(ids, name) {
  const folders = loadCustomFolders();
  let f = folders.find(x => x.name === name);
  if (!f) { f = { id: newFolderId(), name, videos: [] }; folders.push(f); }
  for (const id of ids) if (!f.videos.includes(id)) f.videos.unshift(id);
  saveCustomFolders(folders);
  renderFolders();
  return f;
}
function createFolder() {
  const name = (prompt('اسم فولدر جدید:') || '').trim();
  if (!name) return null;
  const list = loadCustomFolders();
  const f = { id: newFolderId(), name, videos: [] };
  list.push(f);
  saveCustomFolders(list);
  renderFolders();
  return f;
}
function renameFolder(id) {
  const list = loadCustomFolders();
  const f = list.find(x => x.id === id);
  if (!f) return;
  const name = (prompt('اسم جدید فولدر:', f.name) || '').trim();
  if (!name) return;
  f.name = name;
  saveCustomFolders(list);
  el('folder-title').textContent = name;
  renderFolders();
}
function deleteFolder(id) {
  const f = loadCustomFolders().find(x => x.id === id);
  if (!f || !confirm(`فولدر «${f.name}» حذف بشه؟ (ویدیوها حذف نمیشن، فقط فولدر)`)) return;
  saveCustomFolders(loadCustomFolders().filter(x => x.id !== id));
  renderFolders();
  el('back-to-folders').click();
}
function addToFolderFlow(videoIds) {
  const ids = [].concat(videoIds);
  let folders = loadCustomFolders();
  const lines = folders.map((f, i) => `${i + 1}) ${f.name}`).join('\n');
  const ans = prompt(`افزودن به کدوم فولدر؟ شماره رو بنویس:\n${lines}\n0) ساخت فولدر جدید`, folders.length ? '1' : '0');
  if (ans === null) return;
  const n = parseInt(ans, 10);
  let target;
  if (n === 0) {
    const created = createFolder();
    if (!created) return;
    folders = loadCustomFolders();
    target = folders.find(f => f.id === created.id);
  } else { target = folders[n - 1]; }
  if (!target) return;
  for (const id of ids) if (!target.videos.includes(id)) target.videos.unshift(id);
  saveCustomFolders(folders);
  renderFolders();
  alert(`${ids.length} ویدیو به «${target.name}» اضافه شد`);
}
function removeFromFolder(folderId, videoId) {
  const folders = loadCustomFolders();
  const f = folders.find(x => x.id === folderId);
  if (!f) return;
  f.videos = f.videos.filter(id => id !== videoId);
  saveCustomFolders(folders);
  renderFolders();
  openFolder(folderId);
}

async function httpError(label, res) {
  const body = await res.text().catch(() => '');
  const e = new Error(`${label} failed: ${res.status} ${body}`);
  e.status = res.status;
  e.body = body;
  return e;
}
function explainError(e) {
  const detail = String(e.body || e.message || e).slice(0, 250);
  const hints = {
    401: 'توکن معتبر نیست. خروج بزن و دوباره وارد شو.',
    402: 'معمولاً یعنی اعتبار (credit) حساب توسعه‌دهنده‌ی X خریداری نشده یا تموم شده.',
    403: 'دسترسی رد شد: احتمالاً اسکوپ، پلن/اعتبار API یا اینکه اپ داخل یک Project نیست.',
    429: 'محدودیت تعداد درخواست. چند دقیقه بعد دوباره امتحان کن.',
  };
  return (hints[e.status] ? `خطا ${e.status}: ${hints[e.status]}\n` : '') + detail;
}
function showUsername() {
  const label = isLocal() ? 'حالت رایگان' : (localStorage.getItem('reel_username') ? '@' + localStorage.getItem('reel_username') : null);
  const root = el('app-screen');
  if (!label || !root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) { if (/\byou@\w*/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/\byou@\w*/, label); }
}
async function ensureUser() {
  let id = localStorage.getItem('reel_user_id');
  if (!id || !localStorage.getItem('reel_username')) {
    const res = await xFetch(`${CONFIG.apiBase}/2/users/me`);
    if (!res.ok) throw await httpError('users/me', res);
    const d = (await res.json()).data;
    localStorage.setItem('reel_user_id', d.id);
    localStorage.setItem('reel_username', d.username);
    id = d.id;
  }
  showUsername();
  return id;
}

function extractStatusIds(text) {
  const ids = new Set();
  let m;
  const re = /status(?:es)?\/(\d{5,20})/g;
  while ((m = re.exec(text))) ids.add(m[1]);
  for (const tok of String(text).split(/\s+/)) if (/^\d{15,20}$/.test(tok)) ids.add(tok);
  return [...ids];
}

// ---------------------------------------------------------------------
// FIXED: resolution labels. FxTwitter's per-format objects don't always
// carry width/height — only the parent video object reliably does, and
// the resolution is also embedded in the CDN url path (.../WIDTHxHEIGHT/...).
// The old code only checked format.width/format.height, which is almost
// always undefined, so everything fell back to the literal string "MP4".
// This version tries: format dimensions → dimensions parsed from the
// format's own URL → the parent video's dimensions → a bitrate-based
// label — and only says "MP4" if truly nothing else is available.
// ---------------------------------------------------------------------
function resFromUrl(url) {
  const m = String(url || '').match(/\/(\d{2,5})x(\d{2,5})\//);
  return m ? { w: +m[1], h: +m[2] } : null;
}
// Normalizes common broken-URL shapes seen from proxied/rewritten APIs:
//  - protocol-relative "//video.twimg.com/..." → add "https:"
//  - bare path "video.twimg.com/..." (no scheme at all) → add "https://"
//  - relative path like "/video/..." with no host → resolve against apiBase
// Anything already a normal absolute http(s) URL passes through untouched.
function normalizeMediaUrl(u) {
  if (!u) return u;
  u = String(u).trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return CONFIG.apiBase.replace(/\/$/, '') + u;
  return 'https://' + u;
}
function fxToRecord(st) {
  const v = (st.media?.videos || [])[0];
  if (!v) return null;
  let fmts = (v.formats || []).filter(f => f.container === 'mp4' && f.url);
  if (fmts.some(f => f.codec === 'h264')) fmts = fmts.filter(f => f.codec === 'h264');

  const labelOf = (f) => {
    const fromUrl = resFromUrl(f.url);
    const w = f.width || fromUrl?.w || v.width;
    const h = f.height || fromUrl?.h || v.height;
    if (w && h) return Math.min(w, h) + 'p';
    if (v.type === 'gif') return 'GIF';
    if (f.bitrate) return Math.round(f.bitrate / 1000) + 'kbps';
    return 'MP4';
  };

  let variants = fmts.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0)).map(f => ({ label: labelOf(f), bitrate: f.bitrate || 0, url: normalizeMediaUrl(f.url) }));
  if (!variants.length && v.url) variants = [{ label: labelOf({ url: v.url, width: v.width, height: v.height, bitrate: 0 }), bitrate: 0, url: normalizeMediaUrl(v.url) }];
  if (!variants.length) return null;

  // If two variants still ended up with the same label (e.g. same
  // resolution, different bitrate), disambiguate with the bitrate.
  const counts = {};
  variants.forEach(x => counts[x.label] = (counts[x.label] || 0) + 1);
  variants = variants.map(x => counts[x.label] > 1 && x.bitrate ? { ...x, label: `${x.label} (${Math.round(x.bitrate / 1000)}k)` } : x);

  const user = st.author?.screen_name;
  return { id: st.id, author: user ? '@' + user : 'ویدیوی X', text: st.text || '', tweetUrl: st.url || `https://x.com/${user || 'i'}/status/${st.id}`, variants };
}

async function importLinks(text) {
  const ids = extractStatusIds(text);
  if (!ids.length) return { msg: 'لینک توییت پیدا نشد. لینک باید شبیه x.com/…/status/123… باشه.', ids: [] };
  const store = getVideoList();
  const known = new Set(store.map(v => v.id));
  const todo = ids.filter(id => !known.has(id));
  const added = [];
  let noVideo = 0;
  const errors = [];
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async (id) => {
      try {
        const res = await fetch(`${CONFIG.apiBase}${CONFIG.fxPath}${id}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        console.log('fx response for', id, j); // inspect in devtools if available
        const rec = fxToRecord(j.status || {});
        if (rec) added.push(rec); else noVideo++;
      } catch (e) { errors.push(`${id}: ${e.message}`); }
    }));
  }
  if (added.length) {
    localStorage.setItem('reel_video_store', JSON.stringify([...added, ...store]));
    const seen = JSON.parse(localStorage.getItem('reel_seen_ids') || '[]');
    localStorage.setItem('reel_seen_ids', JSON.stringify([...added.map(v => v.id), ...seen]));
  }
  renderFolders();
  let msg = `${added.length} ویدیو اضافه شد`;
  if (ids.length - todo.length) msg += `، ${ids.length - todo.length} تکراری`;
  if (noVideo) msg += `، ${noVideo} توییت بدون ویدیو`;
  if (errors.length) msg += `\nخطا (${errors.length}): ${errors[0]}${/HTTP 403|Forbidden/.test(errors[0]) ? ' — Worker رو با کد جدید Deploy کردی؟' : ''}`;
  const have = new Set(getVideoList().map(v => v.id));
  return { msg, ids: ids.filter(id => have.has(id)) };
}

async function addLinksFlow() {
  const text = prompt('لینک توییت(ها) رو Paste کن (چندتا هم می‌تونی، با فاصله یا خط جدید):');
  if (!text) return;
  setStatus('در حال دریافت اطلاعات ویدیو…');
  const r = await importLinks(text);
  setStatus(r.msg);
  if (r.ids.length) addToFolderFlow(r.ids);
}

let syncing = false;
function setStatus(msg, isError = false) {
  const st = el('sync-status');
  if (!st) return;
  st.textContent = msg;
  st.style.color = isError ? '#e5484d' : '';
}

async function runSync() {
  if (isDemo() || isLocal() || syncing) return;
  syncing = true;
  const btn = el('sync-btn');
  if (btn) btn.disabled = true;
  setStatus('در حال همگام‌سازی…');
  try {
    const userId = await ensureUser();
    const r = await syncBookmarks(userId);
    const total = getVideoList().length;
    let msg = `همگام‌سازی شد — ${r.scanned} بوکمارک جدید بررسی شد، ${r.videos} ویدیوی جدید. مجموع: ${total} ویدیو.`;
    if (r.scanned > 0 && total === 0) msg += '\nبوکمارک‌ها اومدن ولی ویدیوی مستقیم توشون نبود.';
    if (r.scanned === 0 && total === 0) msg += '\nX هیچ بوکمارکی برنگردوند.';
    setStatus(msg);
    renderFolders();
  } catch (e) { console.error(e); setStatus(explainError(e), true); }
  finally { syncing = false; if (btn) btn.disabled = false; }
}

const BTN_STYLE = 'background:none;color:inherit;border:1px solid rgba(128,128,128,.45);border-radius:10px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer';
function ensureToolbar() {
  let bar = el('reel-toolbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'reel-toolbar';
    bar.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 12px';
    bar.innerHTML = `
      <button id="new-folder-btn" style="${BTN_STYLE}">+ فولدر جدید</button>
      <button id="add-link-btn" style="${BTN_STYLE}">🔗 افزودن با لینک</button>
      <button id="sync-btn" style="${BTN_STYLE}">↻ همگام‌سازی</button>
      <div id="sync-status" style="flex-basis:100%;font-size:12px;opacity:.85;white-space:pre-wrap"></div>`;
    el('folder-grid').insertAdjacentElement('beforebegin', bar);
    el('new-folder-btn').addEventListener('click', createFolder);
    el('sync-btn').addEventListener('click', runSync);
    el('add-link-btn').addEventListener('click', addLinksFlow);
  }
  const mode = isDemo() ? 'demo' : isLocal() ? 'local' : 'api';
  if (bar.dataset.mode !== mode) { bar.dataset.mode = mode; setStatus(''); }
  const hide = isDemo();
  el('new-folder-btn').style.display = hide ? 'none' : '';
  el('sync-btn').style.display = (hide || isLocal()) ? 'none' : '';
  el('add-link-btn').style.display = hide ? 'none' : '';
}
function renderFolderActions() {
  let box = el('folder-actions');
  if (!box) {
    box = document.createElement('div');
    box.id = 'folder-actions';
    box.style.cssText = 'display:flex;gap:8px;margin:8px 0';
    el('folder-title').insertAdjacentElement('afterend', box);
  }
  if (isDemo() || !currentFolder || currentFolder.builtin) { box.innerHTML = ''; return; }
  box.innerHTML = `<button id="rename-folder-btn" style="${BTN_STYLE}">تغییر نام</button><button id="delete-folder-btn" style="${BTN_STYLE}">حذف فولدر</button>`;
  el('rename-folder-btn').onclick = () => renameFolder(currentFolder.id);
  el('delete-folder-btn').onclick = () => deleteFolder(currentFolder.id);
}
function rowActionBtn(videoId) {
  if (isDemo()) return '';
  const remove = currentFolder && !currentFolder.builtin;
  return `<button class="row-act" data-act="${remove ? 'remove' : 'add'}" data-id="${videoId}" style="${BTN_STYLE};padding:3px 8px;font-size:12px;margin-inline-start:auto">${remove ? '✕ حذف از فولدر' : '📁 افزودن به فولدر'}</button>`;
}

let currentFolder = null;
let currentVideo = null;
let currentVariantIndex = 0;
const el = (id) => document.getElementById(id);

function renderFolders() {
  const grid = el('folder-grid');
  const folders = loadFolderMap();
  ensureToolbar();
  el('folder-total').textContent = `${folders.length} فولدر`;
  grid.innerHTML = folders.map(f => `
    <div class="folder-card" data-id="${f.id}">
      <div class="perf"></div>
      <div class="count">${f.videos.length}</div>
      <div class="name">${esc(f.name)}</div>
    </div>`).join('');
  grid.querySelectorAll('.folder-card').forEach(card => card.addEventListener('click', () => openFolder(card.dataset.id)));
}

async function openFolder(folderId) {
  const folders = loadFolderMap();
  currentFolder = folders.find(f => f.id === folderId);
  el('folder-title').textContent = currentFolder.name;
  renderFolderActions();
  el('folders-view').classList.add('hidden');
  el('videos-view').classList.remove('hidden');
  el('player-screen').classList.remove('active');
  const list = el('video-list');
  const rows = await Promise.all(currentFolder.videos.map(async (vid) => {
    const v = getVideo(vid);
    const cached = await isVideoCached(v);
    return `<div class="video-row" data-id="${v.id}">
        <div class="thumb">▶${cached ? '<span class="cache-badge">کش‌شده</span>' : ''}</div>
        <div class="video-meta">
          <div class="author">${esc(v.author)}</div>
          <div class="text">${esc(v.text)}</div>
          <div class="meta-row"><span>${v.variants.length} کیفیت موجود</span>${rowActionBtn(v.id)}</div>
        </div></div>`;
  }));
  list.innerHTML = rows.join('');
  list.querySelectorAll('.video-row').forEach(row => row.addEventListener('click', () => openPlayer(row.dataset.id)));
  list.querySelectorAll('.row-act').forEach(btn => btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (btn.dataset.act === 'add') addToFolderFlow(btn.dataset.id); else removeFromFolder(currentFolder.id, btn.dataset.id);
  }));
}

async function openPlayer(videoId) {
  currentVideo = getVideo(videoId);
  currentVariantIndex = currentVideo.variants.length - 1;
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
  wrap.innerHTML = currentVideo.variants.map((v, i) => `<button data-i="${i}" class="${i === currentVariantIndex ? 'active' : ''}">${v.label}</button>`).join('');
  wrap.querySelectorAll('button').forEach(btn => btn.addEventListener('click', async () => {
    const i = Number(btn.dataset.i);
    if (i === currentVariantIndex) return;
    const t = el('video-el').currentTime;
    currentVariantIndex = i;
    renderQualitySelect();
    await loadVariant(i, t);
  }));
}

// ---------------------------------------------------------------------
// PLAYBACK DEBUGGING: the video element now surfaces the real browser
// error (wrong format, network failure, blocked URL, etc.) directly in
// the caption area instead of failing silently — this is the fastest
// way to see WHY playback fails without needing desktop devtools.
// MediaError codes: 1 aborted, 2 network error, 3 decode error
// (format/codec not supported), 4 src not supported (bad/dead URL).
// ---------------------------------------------------------------------
const MEDIA_ERROR_MSG = {
  1: 'بارگذاری متوقف شد (ABORTED)',
  2: 'خطای شبکه هنگام دریافت ویدیو (NETWORK) — لینک رو در تب جدید تست کن',
  3: 'مرورگر نتونست این فایل رو دیکد کنه (DECODE) — احتمالاً کدک/فرمت پشتیبانی نمیشه',
  4: 'منبع ویدیو پشتیبانی نمیشه یا لینک نامعتبر/منقضی‌شده است (SRC_NOT_SUPPORTED)',
};
function wireVideoDiagnostics() {
  const videoEl = el('video-el');
  videoEl.addEventListener('error', () => {
    const code = videoEl.error?.code;
    const msg = MEDIA_ERROR_MSG[code] || 'خطای نامشخص پخش';
    el('player-caption').textContent = `▲ پخش نشد — ${msg}`;
    console.error('video error code', code, videoEl.src);
  });
}

async function loadVariant(index, resumeAt = 0) {
  const variant = currentVideo.variants[index];
  const videoEl = el('video-el');
  const cachedUrl = await getCachedUrl(variant.url);
  videoEl.src = cachedUrl || variant.url;
  videoEl.currentTime = resumeAt;
  videoEl.play().catch((e) => console.warn('autoplay blocked or failed:', e.message));
  el('cache-btn').textContent = cachedUrl ? 'ذخیره‌شده ✓' : 'ذخیره برای آفلاین';
  const testLink = el('test-url-btn');
  if (testLink) testLink.href = variant.url;
  // Show the raw URL on screen (selectable) — the fastest way to debug a
  // bad/malformed URL from the Worker without needing browser devtools.
  const dbg = el('debug-url');
  if (dbg) dbg.textContent = 'URL: ' + String(variant.url);
}

function updateNetHint() {
  const conn = navigator.connection || navigator.webkitConnection;
  el('net-label').textContent = conn?.effectiveType ? conn.effectiveType.toUpperCase() : 'نامشخص';
}

async function getCachedUrl(url) {
  if (!('caches' in window)) return null;
  const cache = await caches.open(CACHE_NAME);
  const match = await cache.match(url);
  return match ? url : null;
}
async function isVideoCached(video) {
  if (!('caches' in window)) return false;
  const cache = await caches.open(CACHE_NAME);
  for (const v of video.variants) if (await cache.match(v.url)) return true;
  return false;
}

document.addEventListener('DOMContentLoaded', () => {
  el('cache-btn')?.addEventListener('click', async () => {
    if (!('caches' in window)) { alert('کش در این مرورگر پشتیبانی نمیشه'); return; }
    const variant = currentVideo.variants[currentVariantIndex];
    const cache = await caches.open(CACHE_NAME);
    el('cache-btn').textContent = 'در حال ذخیره…';
    try { await cache.add(variant.url); el('cache-btn').textContent = 'ذخیره‌شده ✓'; }
    catch (e) { el('cache-btn').textContent = 'خطا در ذخیره'; console.error('cache.add failed:', e); }
  });
});

el('back-to-folders').addEventListener('click', () => { el('videos-view').classList.add('hidden'); el('folders-view').classList.remove('hidden'); });
el('back-to-videos').addEventListener('click', () => { el('video-el').pause(); el('player-screen').classList.remove('active'); el('videos-view').classList.remove('hidden'); });
el('login-btn').addEventListener('click', startLogin);
el('demo-btn').addEventListener('click', () => {
  localStorage.setItem('reel_access_token', 'demo');
  el('login-screen').classList.add('hidden');
  el('app-screen').classList.add('active');
  renderFolders();
});
(function addFreeModeButton() {
  const demo = el('demo-btn');
  if (!demo) return;
  if (!CONFIG.enableApiLogin && el('login-btn')) el('login-btn').style.display = 'none';
  const b = document.createElement('button');
  b.id = 'free-btn';
  b.className = demo.className;
  b.textContent = 'ورود رایگان (بدون X) — افزودن با لینک';
  b.addEventListener('click', () => {
    localStorage.setItem('reel_access_token', 'local');
    el('login-screen').classList.add('hidden');
    el('app-screen').classList.add('active');
    renderFolders();
    showUsername();
  });
  demo.insertAdjacentElement('beforebegin', b);
})();
el('logout-btn').addEventListener('click', () => {
  ['reel_access_token', 'reel_refresh_token', 'reel_token_expires_at', 'reel_user_id', 'reel_username'].forEach(k => localStorage.removeItem(k));
  el('video-el')?.pause();
  el('player-screen').classList.remove('active');
  el('videos-view').classList.add('hidden');
  el('folders-view').classList.remove('hidden');
  el('app-screen').classList.remove('active');
  el('login-screen').classList.remove('hidden');
});

async function bootstrap() {
  wireVideoDiagnostics();
  const params = new URLSearchParams(window.location.search);
  if (params.has('code')) {
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
      window.history.replaceState({}, '', CONFIG.redirectUri);
    }
  }
  if (!CONFIG.enableApiLogin && isLoggedIn() && !isDemo() && !isLocal()) {
    ['reel_refresh_token', 'reel_token_expires_at', 'reel_user_id', 'reel_username'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem('reel_access_token', 'local');
  }
  const addParam = params.get('add');
  if (addParam && !isLoggedIn()) localStorage.setItem('reel_access_token', 'local');

  if (isLoggedIn()) {
    el('login-screen').classList.add('hidden');
    el('app-screen').classList.add('active');
    renderFolders();
    if (isLocal()) showUsername();
    if (!isDemo() && !isLocal()) { showUsername(); runSync(); }
    if (addParam && !isDemo()) {
      window.history.replaceState({}, '', CONFIG.redirectUri);
      setStatus('در حال دریافت اطلاعات ویدیو…');
      const r = await importLinks(addParam);
      setStatus(r.msg);
      if (r.ids.length) {
        const folderName = (params.get('folder') || '').trim();
        if (folderName) addToFolderByName(r.ids, folderName);
        else addToFolderFlow(r.ids);
      }
    }
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);
}

bootstrap();
