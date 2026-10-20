// lib/auth.js — password hashing, session tokens, cookies, CSRF.
// No secrets or user input ever touch a SQL string; everything here is crypto.

import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const N = 16384, R = 8, P = 1, KEYLEN = 64;
const COOKIE = 'sb_session';

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, salt, expected.length, { N: +n, r: +r, p: +p });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

// Opaque random session token; only its SHA-256 hash is stored server-side.
export function newSessionToken() { return randomBytes(32).toString('base64url'); }
export function hashToken(token) { return createHash('sha256').update(String(token)).digest('hex'); }

export const SESSION_DAYS = 30;

export function buildSessionCookie(token, { secure }) {
  const maxAge = SESSION_DAYS * 86400;
  const parts = [
    `${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie({ secure }) {
  const parts = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function sessionTokenFromCookies(cookies) { return cookies[COOKIE] || null; }

// CSRF defense for mutations: require a same-origin Origin/Referer header.
export function csrfOk(req, host) {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const source = origin || referer;
  if (!source) return false;
  try {
    const u = new URL(source);
    return u.host === host;
  } catch { return false; }
}

// Tiny self-check
if (process.argv[2] === '--test') {
  const h = hashPassword('correct horse');
  console.assert(verifyPassword('correct horse', h), 'verify ok');
  console.assert(!verifyPassword('wrong', h), 'reject wrong');
  const t = newSessionToken();
  console.assert(hashToken(t) === hashToken(t), 'hash stable');
  console.assert(hashToken(t) !== hashToken(newSessionToken()), 'unique');
  console.assert(csrfOk({ method: 'POST', headers: { origin: 'https://x.com' } }, 'x.com'), 'csrf same');
  console.assert(!csrfOk({ method: 'POST', headers: { origin: 'https://evil.com' } }, 'x.com'), 'csrf diff');
  console.assert(csrfOk({ method: 'GET', headers: {} }, 'x.com'), 'csrf get ok');
  console.log('auth.js self-check PASS');
}
