// scripts/dev-server.js — local server that mirrors Vercel: static files from
// public/ + the same /api catch-all handler. Loads .env.local first.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECURITY_HEADERS } from '../lib/http.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');

// Load .env.local into process.env (only keys not already set).
const envPath = join(ROOT, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { default: apiHandler } = await import('../api/[...path].js');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

function applySecurity(res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';
  const full = normalize(join(PUBLIC, rel));
  if (!full.startsWith(PUBLIC)) { res.statusCode = 403; return res.end('forbidden'); }
  try {
    const s = await stat(full);
    if (s.isDirectory()) throw new Error('dir');
    const data = await readFile(full);
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[extname(full)] || 'application/octet-stream');
    return res.end(data);
  } catch {
    // SPA fallback
    const data = await readFile(join(PUBLIC, 'index.html'));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(data);
  }
}

const server = createServer((req, res) => {
  applySecurity(res);
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    apiHandler(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: 'server error' })); }
    });
    return;
  }
  serveStatic(req, res, pathname);
});

const PORT = process.env.PORT || 5199;
server.listen(PORT, () => console.log(`Gooseminton dev server → http://localhost:${PORT}`));
