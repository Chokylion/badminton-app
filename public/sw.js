// public/sw.js — offline shell + instant repeat loads.
//
// Deliberately NOT stale-while-revalidate for API data: showing a rating that
// is one visit old after logging a match is exactly the kind of "it didn't
// save" confusion we already fixed once. Network wins when it's available;
// the cache is a fallback so the app still opens with no signal.
//
// BUILD and PRECACHE are rewritten by scripts/stamp-assets.mjs on every deploy,
// so a new build gets a brand-new cache generation and the old one is dropped.
const BUILD = '565f29b6';
const PRECACHE = ["/","/app.js?v=b5bc00f5","/fx.js?v=d01e628b","/preboot.js?v=48a23bf7","/styles.css?v=09506740","/fonts/space-grotesk.woff2","/fonts/archivo.woff2","/fonts/anton.woff2","/fonts/jetbrains-mono.woff2"];

const SHELL = `gm-${BUILD}-shell`;
const DATA = `gm-${BUILD}-data`;
const MINE = new Set([SHELL, DATA]);

// Same-origin assets that never change under a given URL (hashed js/css, fonts).
const isImmutable = (url) =>
  /\/fonts\/.+\.woff2$/.test(url.pathname) ||
  /\.(js|css)$/.test(url.pathname) ||
  /\.(svg|png|ico|webp|webmanifest)$/.test(url.pathname);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      // one bad URL must not fail the whole install, so add them individually
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !MINE.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  // logout: drop the cached personal API responses from disk
  if (e.data === 'dropData') caches.delete(DATA);
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // never touch writes
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;        // let third parties through
  if (url.pathname === '/sw.js') return;                  // never cache the worker

  // Cache writes MUST be held open with waitUntil. Without it the browser is
  // free to kill the worker as soon as respondWith settles, which silently
  // drops the pending put — the data cache then stays empty forever and the
  // "works offline" promise quietly isn't true.
  const store = (cacheName, request, res) => {
    if (!res || !res.ok) return res;
    const copy = res.clone();
    e.waitUntil(caches.open(cacheName).then((c) => c.put(request, copy)).catch(() => {}));
    return res;
  };

  // 1. immutable assets -> cache first, network only on a miss
  if (isImmutable(url)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => store(SHELL, req, res))),
    );
    return;
  }

  // 2. API -> network first, cached copy only if the network fails (offline)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(req).then((res) => store(DATA, req, res)).catch(() => caches.match(req).then(async (hit) => {
        if (!hit) {
          return new Response(
            JSON.stringify({ error: 'You are offline.' }),
            { status: 503, headers: { 'content-type': 'application/json' } },
          );
        }
        // Tag the fallback so the app can say it is showing old data. Without
        // this a stale rating is indistinguishable from a live one.
        const headers = new Headers(hit.headers);
        headers.set('X-GM-Offline', '1');
        return new Response(await hit.blob(), { status: hit.status, statusText: hit.statusText, headers });
      })),
    );
    return;
  }

  // 3. navigations -> network first, shell fallback so the app opens offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => store(SHELL, '/', res))
        .catch(() => caches.match('/').then((hit) => hit || Response.error())),
    );
  }
});
