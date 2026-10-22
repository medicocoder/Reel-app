const ALLOWED_ORIGIN = 'https://medicocoder.github.io';

const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ---------------------------------------------------------------
    // Video proxy: intentionally NOT gated by the Origin check below.
    // <video> element requests often omit/alter the Origin header
    // (unlike fetch()/navigation), so gating this route by Origin was
    // silently 403-ing every playback request. Its own security
    // boundary is the twimg.com hostname allowlist a few lines down —
    // that's what stops this from being an open relay, not Origin.
    // ---------------------------------------------------------------
    if (path === '/video-proxy') {
      const target = url.searchParams.get('u');
      if (!target) return new Response('missing u param', { status: 400, headers: CORS });

      let t;
      try { t = new URL(target); } catch { return new Response('bad u param', { status: 400, headers: CORS }); }
      if (!/(^|\.)twimg\.com$/.test(t.hostname)) {
        return new Response('domain not allowed', { status: 403, headers: CORS });
      }

      const fwdHeaders = {};
      const range = request.headers.get('range');
      if (range) fwdHeaders['range'] = range; // needed for seeking

      const upstream = await fetch(target, { headers: fwdHeaders }); // server-side fetch: no browser Referer/Origin sent

      const headers = new Headers(upstream.headers);
      headers.set('Access-Control-Allow-Origin', '*'); // media doesn't need to match ALLOWED_ORIGIN specifically
      headers.set('Accept-Ranges', 'bytes');
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    // Everything below this line IS gated by Origin.
    if (request.headers.get('Origin') !== ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403 });
    }

    // Free mode: public FxTwitter API (no X credentials)
    const fx = path.match(/^\/fx\/2\/status\/(\d{2,20})$/);
    if (fx && request.method === 'GET') {
      const up = await fetch('https://api.fxtwitter.com/2/status/' + fx[1], {
        headers: { 'User-Agent': 'reel-app-personal/1.0' },
      });
      const resp = new Response(up.body, up);
      for (const [k, v] of Object.entries(CORS)) resp.headers.set(k, v);
      return resp;
    }

    // Official X API proxy (only needed if you ever use API mode)
    const allowed =
      path === '/2/oauth2/token' ||
      path === '/2/users/me' ||
      /^\/2\/users\/[^/]+\/bookmarks$/.test(path);
    if (!allowed) {
      return new Response('Not found', { status: 404, headers: CORS });
    }

    const headers = new Headers();
    for (const h of ['Authorization', 'Content-Type']) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }

    const upstream = await fetch('https://api.x.com' + path + url.search, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? await request.text() : undefined,
    });

    const resp = new Response(upstream.body, upstream);
    for (const [k, v] of Object.entries(CORS)) resp.headers.set(k, v);
    return resp;
  },
};
