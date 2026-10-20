// public/preboot.js — 3 lines, loaded from <head>, whose only job is to start
// the session request as early as humanly possible.
//
// Without it the cold-load waterfall is strictly serial:
//   index.html -> app.js (download+parse) -> fx.js (download+parse) -> /api/init
// so the very first byte of real data is three round trips deep. This fires
// /api/init while app.js is still downloading, and app.js just awaits the
// promise instead of starting its own request.
//
// It is a classic script rather than inline because the CSP is `script-src
// 'self'` (no unsafe-inline), and classic so it runs during parse.
window.__gmInit = fetch('/api/init', {
  method: 'GET',
  headers: { Accept: 'application/json' },
  credentials: 'same-origin',
}).then(async (res) => {
  // This bypasses app.js's api() wrapper, so it has to do the stale check
  // itself — otherwise the very first screen (which renders from this payload)
  // shows cached data with no indication that it is old.
  window.__gmInitStale = !!res.headers.get('X-GM-Offline');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'request failed (' + res.status + ')');
  return data;
});
// Nothing awaits this yet, so stop the browser reporting an unhandled
// rejection; boot() re-reads the same promise and handles the failure there.
window.__gmInit.catch(() => {});

// The full stylesheet is declared as `rel=preload` so it downloads at high
// priority without blocking the first paint (the shell styles are inlined in
// the HTML). Promote it to a real stylesheet as soon as it lands — it comes
// straight from the preload cache, so there is no second fetch.
//
// This runs from an external file because the CSP is `script-src 'self'`, which
// forbids the usual inline `onload="this.rel='stylesheet'"` attribute.
(function applyFullCss() {
  const link = document.getElementById('fullcss');
  if (!link) return;
  const swap = () => { if (link.rel !== 'stylesheet') link.rel = 'stylesheet'; };
  link.addEventListener('load', swap);
  link.addEventListener('error', swap);      // apply anyway; a broken sheet is better than none
  // Belt and braces: if the preload finished before this ran, or a browser
  // doesn't fire load on preload links, make sure it is applied regardless.
  document.addEventListener('DOMContentLoaded', swap);
  setTimeout(swap, 2000);
})();
