// lib/http.js — framework-agnostic request/response helpers. Works identically
// under Vercel Node functions and the local dev server (scripts/dev-server.js).

// Strong security headers. Applied in production via vercel.json and locally via
// the dev server; exported here as the single source of truth.
export const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; " +
    "base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

const MAX_BODY = 256 * 1024; // 256 KB

export function json(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body ?? {});
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(payload);
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve({});
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('payload too large'), { statusCode: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('invalid JSON'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

export function parseCookies(req) {
  const out = {};
  const raw = req.headers?.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function clientIp(req) {
  const xf = req.headers?.['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

// Path after /api, as clean segments. Works in three cases:
//   * local dev server: parse req.url pathname
//   * Vercel single-segment auto-route: req.query.path is a string/array
//   * Vercel explicit rewrite (/api/:path* -> /api/[...path]): req.query.path array
export function apiSegments(req) {
  const url = new URL(req.url, 'http://x');
  const query = url.searchParams; // original ?a=b params (preserved by Vercel through rewrites)
  const q = req.query;
  if (q && q.path != null && q.path !== '') {
    const parts = Array.isArray(q.path) ? q.path : String(q.path).split('/');
    for (const [k, v] of Object.entries(q)) {
      if (k !== 'path' && !query.has(k) && typeof v === 'string') query.set(k, v);
    }
    return { segments: parts.filter(Boolean), query };
  }
  let p = url.pathname;
  if (p.startsWith('/api/')) p = p.slice(5);
  else if (p === '/api') p = '';
  else if (p.startsWith('/')) p = p.slice(1);
  return { segments: p.split('/').filter(Boolean), query };
}
