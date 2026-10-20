// lib/validate.js — strict input validation. Every field a user can send is
// bounded and type-checked here before it ever reaches the data layer.

import { EMOJI_SET, COLOR_SET } from './emoji.js';
import { FRAME_KEYS, CARD_KEYS, WEARABLE_KEYS } from './cosmetics.js';

export class HttpError extends Error {
  constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; }
}
const fail = (msg, code = 400) => { throw new HttpError(msg, code); };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanUuid(v, label = 'id') {
  if (typeof v !== 'string' || !UUID.test(v)) fail('invalid ' + label);
  return v.toLowerCase();
}

export function cleanEmployeeNo(v) {
  if (typeof v !== 'string') fail('employee number required');
  const s = v.trim();
  if (!/^[A-Za-z0-9]{3,32}$/.test(s)) fail('employee number must be 3–32 letters/digits');
  return s;
}

export function cleanNickname(v) {
  if (typeof v !== 'string') fail('nickname required');
  const s = v.trim();
  if (s.length < 2 || s.length > 24) fail('nickname must be 2–24 characters');
  if (!/^[\p{L}\p{N} ._'\-]+$/u.test(s)) fail('nickname has invalid characters');
  if (/\s{2,}/.test(s)) fail('nickname cannot contain double spaces');
  return s;
}

export function cleanPassword(v) {
  if (typeof v !== 'string') fail('password required');
  if (v.length < 6) fail('password must be at least 6 characters');
  if (v.length > 128) fail('password too long');
  return v;
}

export function cleanLoginId(v) {
  if (typeof v !== 'string') fail('login required');
  const s = v.trim();
  if (s.length < 2 || s.length > 32) fail('invalid login');
  if (!/^[\p{L}\p{N} ._'\-]+$/u.test(s)) fail('invalid login');
  return s;
}

export function cleanEmoji(v) {
  if (typeof v !== 'string' || !EMOJI_SET.has(v)) fail('pick an avatar from the grid');
  return v;
}

export function cleanColor(v) {
  if (typeof v !== 'string' || !COLOR_SET.has(v)) fail('pick a color from the palette');
  return v;
}

export function cleanOptText(v, max, label) {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') fail(label + ' must be text');
  const s = v.trim();
  if (s.length > max) fail(label + ' too long');
  return s || null;
}

function cleanScore(v) {
  if (!Number.isInteger(v) || v < 0 || v > 30) fail('scores must be whole numbers 0–30');
  return v;
}

// Validate a 1–3 game best-of-3 sequence. Returns cleaned games + who won.
export function validateGames(games) {
  if (!Array.isArray(games)) fail('games required');
  if (games.length < 1 || games.length > 3) fail('a match has 1–3 games');
  let wonA = 0, wonB = 0;
  const cleanGames = games.map((g, i) => {
    const a = cleanScore(g?.score_a), b = cleanScore(g?.score_b);
    if (a === b) fail(`game ${i + 1} cannot be a tie`);
    if (a > b) wonA++; else wonB++;
    return { game_no: i + 1, score_a: a, score_b: b };
  });
  if (wonA === wonB) fail('match is not decided — one side must win more games');
  const winnerGames = Math.max(wonA, wonB), loserGames = Math.min(wonA, wonB);
  if (winnerGames > 2 || loserGames >= winnerGames) fail('invalid best-of-3 game sequence');
  if (games.length !== winnerGames + loserGames) fail('unexpected number of games');
  return { cleanGames, wonA, wonB };
}

// A submitted match: validate shape + that the result is decisive & best-of-3 sane.
export function validateMatchInput(body) {
  const format = body?.format;
  if (format !== 'doubles' && format !== 'singles') fail('format must be doubles or singles');
  const per = format === 'doubles' ? 2 : 1;

  const teamA = Array.isArray(body.teamA) ? body.teamA.map(x => cleanUuid(x, 'player')) : fail('teamA required');
  const teamB = Array.isArray(body.teamB) ? body.teamB.map(x => cleanUuid(x, 'player')) : fail('teamB required');
  if (teamA.length !== per || teamB.length !== per) fail(`${format} needs ${per} player(s) per side`);
  const all = [...teamA, ...teamB];
  if (new Set(all).size !== all.length) fail('a player cannot appear twice');

  const { cleanGames } = validateGames(body.games);

  let played_at = null;
  if (body.played_at != null && body.played_at !== '') {
    const d = new Date(body.played_at);
    if (isNaN(d.getTime())) fail('invalid date');
    const now = Date.now();
    if (d.getTime() > now + 86400000) fail('date cannot be in the future');
    if (d.getTime() < Date.parse('2020-01-01')) fail('date too old');
    played_at = d.toISOString();
  }
  const location = cleanOptText(body.location, 80, 'location');
  return { format, teamA, teamB, games: cleanGames, played_at, location };
}

const ACCENT_KEYS = ['grass', 'violet', 'amber', 'cyan', 'rose'];

export function validateSettings(body) {
  const out = {};
  if (body.roast_visibility != null) {
    if (!['self', 'public'].includes(body.roast_visibility)) fail('invalid roast visibility');
    out.roast_visibility = body.roast_visibility;
  }
  if (body.notifs != null) out.notifs = !!body.notifs;
  if (body.theme != null) {
    if (!['dark', 'light'].includes(body.theme)) fail('invalid theme');
    out.theme = body.theme;
  }
  if (body.frame != null) {
    if (!FRAME_KEYS.includes(body.frame)) fail('invalid frame');
    out.frame = body.frame;
  }
  if (body.card != null) {
    if (!CARD_KEYS.includes(body.card)) fail('invalid card');
    out.card = body.card;
  }
  if (body.wear != null) {
    // Cosmetic only. Ownership isn't re-checked here (frames aren't either) —
    // it's purely how the avatar looks, never anything economic.
    if (!WEARABLE_KEYS.includes(body.wear)) fail('invalid wearable');
    out.wear = body.wear;
  }
  if (body.accent != null) {
    if (!ACCENT_KEYS.includes(body.accent)) fail('invalid accent');
    out.accent = body.accent;
  }
  if (body.motion != null) {
    if (!['auto', 'on', 'off'].includes(body.motion)) fail('invalid motion setting');
    out.motion = body.motion;
  }
  if (body.badge != null) {
    // Badge keys are dynamic (title/mythic keys), so only the SHAPE is checked
    // here — store.js re-verifies you actually hold it on every read.
    const b = String(body.badge);
    if (!/^[a-z0-9_]{1,40}$/.test(b)) fail('invalid badge');
    out.badge = b;
  }
  return out;
}
