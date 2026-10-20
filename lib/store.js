// lib/store.js — the only module that talks to the database.
// EVERY query uses @supabase/supabase-js bound parameters (.eq/.in/.insert/…),
// so user input is transported as data, never concatenated into SQL. This is the
// structural guarantee against SQL injection.

import { getServiceClient } from './db.js';
import { webcrypto } from 'node:crypto';
import { buildModel, normalizeMatch } from './model.js';
import { runElo, eloTimeline } from './rating.js';
import { computeTitles, personalTitles, TITLES_BY_KEY, milestoneProgress, mythicAwards, buildExtra, milestoneRarity, memberNumbers } from './titles.js';
import { drawRound, sessionStandings, cleanCourts, roomCode, PER_SINGLES } from './room.js';
import { EPITHETS, EPITHET_BY_KEY, assignEpithets, buildEpithetExtra, eligibleFor, consistencyScore } from './epithets.js';
import { earnedThemes, shopItems, flashSale, priceNow, WEARABLE_KEYS, FRAME_KEYS, CARD_KEYS } from './cosmetics.js';
import { levelOf, levelFor, coinsForXp, COINS_PER_XP, COINS_PER_LEVEL, STARTING_COINS } from './level.js';
import {
  SLOT_KEYS, SLOT_BY_KEY, SLOTS, STAGES, STAGE_BY_KEY, STATS as FORGE_STATS,
  ELEMENTS, ELEMENT_BY_KEY, elementFx, SHOP_ELEMENTS, POUCH_ELEMENTS, STARTER_ELEMENT,
  itemsForSlot, fitsSlot,
  blankItem, forge as forgeRoll, evolve as evolveItem, canEvolve, evolveCost,
  forgeCost, successChance, winkChance, atCeiling, totalStats,
  multiplier, LEVEL_BONUS, MAX_LEVEL, WINK_MULT, SKINS, SKIN_BY_KEY, SKIN_POOL,
  bless as blessRoll, canBless, slotsFor, freeSlots, nextStage, gradeFx, BLESS_GRADES,
  evolveStone, stageAura, stageMult, GUARANTEE_STONE,
  STONES, STONE_KEYS, STONE_BY_KEY, SETS, setStatus, setBonuses,
  bagCapacity, bagUpgradeCost, bagFull, BAG_MAX, BAG_LEVELS,
} from './forge.js';
import {
  STAGES as TRAIL_STAGES, STAGE_BY_N, MAX_STAGE, RELICS, RELIC_BY_KEY, RELIC_SLOTS, RELIC_KEYS,
  EGG_COST, eggsEarned, powerOf, winChance, rollDrop, dropCount, stageCoins, loseCoins,
  canAttempt, unlockedUpTo, relicForBoss, hasRelic, activeRelics,
  rollEgg, combatOf, BOSS_EGG_DROPS,
} from './campaign.js';
import {
  CHARMS, CHARM_BY_KEY, CHARM_SLOTS, CHARM_STATS, POUCH_PRICE, POUCH_POOL,
  POUCH_TIERS, POUCH_TIER_BY_KEY, MAX_BATCH,
  pullCharm, pullPrize, resolvePull, equippedStats, charmStats, RARITY, SOURCES,
} from './charms.js';
import {
  spinSlots, dealBlackjack, dealerPlay, settleBlackjack, handValue,
  newSeed,
} from './arcade.js';
import {
  newHand, act, runBots, legalActions, callAmount, raiseRange, playRush,
} from './holdem.js';
import {
  hashPassword, verifyPassword, newSessionToken, hashToken, SESSION_DAYS,
} from './auth.js';
import { HttpError } from './validate.js';

const ADMIN_EMPLOYEE_NO = process.env.ADMIN_EMPLOYEE_NO || '1234567';
const PUBLIC_USER_COLS = 'id, nickname, avatar_emoji, avatar_color, role, created_at, is_active, settings_json';

function must(resp, msg) {
  if (resp.error) {
    const e = new Error((msg || 'database error') + ': ' + resp.error.message);
    e.cause = resp.error;
    throw e;
  }
  return resp.data;
}

function monthKey(d) {
  const dt = new Date(d);
  return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0');
}
function monthStartISO(key) { return key + '-01T00:00:00.000Z'; }

// ---------------------------------------------------------------------------
// LOAD CORE (active + flagged matches count; voided excluded)
// ---------------------------------------------------------------------------
// Every read endpoint needs the same full match history. Re-fetching ~1k rows
// per request was the dominant cost, so keep a very short-lived snapshot and
// drop it the moment anything is written.
let coreCache = null;
const CORE_TTL_MS = 8000;
export function invalidateCore() { coreCache = null; }

async function loadCore() {
  if (coreCache && Date.now() - coreCache.at < CORE_TTL_MS) return coreCache.data;
  const sb = getServiceClient();
  const users = must(await sb.from('users').select(PUBLIC_USER_COLS).range(0, 4999), 'load users');
  // PostgREST caps a plain select at 1000 rows — page explicitly so a busy club
  // doesn't silently lose matches from every rating/title calculation.
  const rawMatches = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const page = must(await sb.from('matches')
      .select('id, played_at, format, logged_by, status, location, match_players(user_id, team), games(game_no, score_a, score_b)')
      .in('status', ['active', 'flagged'])
      .order('played_at', { ascending: true })
      .range(from, from + PAGE - 1), 'load matches');
    rawMatches.push(...page);
    if (page.length < PAGE) break;
  }
  const normMatches = rawMatches.map(m => normalizeMatch({
    id: m.id, played_at: m.played_at, format: m.format, logged_by: m.logged_by,
    players: m.match_players || [], games: m.games || [],
  }));
  const data = { users, normMatches };
  coreCache = { at: Date.now(), data };
  return data;
}

function userMapOf(users) {
  const map = new Map();
  for (const u of users) map.set(u.id, u);
  return map;
}

// Mirrors the client TIERS table. Rank tiers are cosmetic, so this is the only
// server-side copy — it exists purely to decide which frames a player unlocked.
const TIER_MINS = [
  { key: 'bronze', min: 0 }, { key: 'silver', min: 1380 },
  { key: 'gold', min: 1460 }, { key: 'platinum', min: 1520 },
  { key: 'diamond', min: 1560 }, { key: 'conqueror', min: 1620 },
  { key: 'grandmaster', min: 1700 },
];
const TIER_KEYS = TIER_MINS.map(t => t.key);
function tierKeyFor(elo) {
  if (elo == null) return 'bronze';
  let key = 'bronze';
  for (const t of TIER_MINS) if (elo >= t.min) key = t.key;
  return key;
}

// ---------------------------------------------------------------------------
// RECOMPUTE + PERSIST ratings & titles (serialized within instance)
// ---------------------------------------------------------------------------
let chain = Promise.resolve();
export function recomputeAndPersist() {
  const next = chain.then(() => _recompute());
  chain = next.catch(() => {});
  return next;
}

async function _recompute() {
  invalidateCore();
  const sb = getServiceClient();
  const { users, normMatches } = await loadCore();
  const runAt = new Date().toISOString();

  // ---- all-time ----
  const modelAll = buildModel(users, normMatches);
  const standAll = runElo(users, normMatches);
  const titlesAll = computeTitles(modelAll, standAll, { scopes: ['All-time', 'Fun'], seasonStart: null });

  // ---- per month ----
  const byMonth = new Map();
  for (const m of normMatches) {
    const k = monthKey(m.played_at);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(m);
  }

  const ratingRows = [];
  const titleRows = [];

  const pushRatings = (standings, season) => {
    for (const [uid, r] of standings) {
      if (r.games <= 0) continue;
      ratingRows.push({
        user_id: uid, season, elo: r.elo, games: r.games, wins: r.wins,
        losses: r.losses, streak: r.streak, provisional: r.provisional, updated_at: runAt,
      });
    }
  };
  const pushTitles = (titles, season) => {
    for (const t of titles) {
      titleRows.push({
        title_key: t.title_key, season, holder_ids: t.holder_ids,
        value: t.value, meta_json: t.meta || null, computed_at: runAt,
      });
    }
  };

  pushRatings(standAll, 'all-time');
  pushTitles(titlesAll, 'all-time');
  // Mythics are titles now — persist them so reads never have to rebuild the
  // whole match model just to know who holds one.
  for (const m of mythicAwards(modelAll, standAll)) {
    if (!m.holderId) continue;
    titleRows.push({
      title_key: m.key, season: 'all-time', holder_ids: [m.holderId],
      value: 'secret condition · 1 holder only',
      meta_json: { mythic: true, icon: m.icon, name: m.name }, computed_at: runAt,
    });
  }

  for (const [k, ms] of byMonth) {
    const model = buildModel(users, ms);
    const stand = runElo(users, ms);
    const titles = computeTitles(model, stand, { scopes: ['Season'], seasonStart: monthStartISO(k) });
    pushRatings(stand, k);
    pushTitles(titles, k);
  }

  // ฉายา (Epithets) — their own system: one holder each AND one per player.
  // Persisted like titles so reads never rebuild the model.
  const epiChoices = new Map();
  for (const u of users) {
    const c = u.settings_json && u.settings_json.epithet;
    if (c) epiChoices.set(u.id, c);
  }
  const epiCtx = {
    standings: standAll,
    extra: buildEpithetExtra(modelAll, standAll, buildExtra(modelAll, standAll).giantWins),
    consistency: (p) => consistencyScore(p.marginSeq),
  };
  for (const [key, v] of assignEpithets(modelAll, standAll, epiCtx, epiChoices)) {
    const meta = EPITHET_BY_KEY[key];
    titleRows.push({
      title_key: key, season: 'all-time', holder_ids: [v.holderId],
      value: meta.blurb,
      meta_json: { epithet: true, icon: meta.icon, th: meta.th, en: meta.en, score: v.score },
      computed_at: runAt,
    });
  }

  // Upsert fresh rows (stamped runAt), then prune anything not touched this run.
  if (ratingRows.length) must(await sb.from('ratings').upsert(ratingRows, { onConflict: 'user_id,season' }), 'upsert ratings');
  must(await sb.from('ratings').delete().lt('updated_at', runAt), 'prune ratings');

  if (titleRows.length) must(await sb.from('titles_awarded').upsert(titleRows, { onConflict: 'title_key,season' }), 'upsert titles');
  must(await sb.from('titles_awarded').delete().lt('computed_at', runAt), 'prune titles');

  return { ratings: ratingRows.length, titles: titleRows.length };
}

// ---------------------------------------------------------------------------
// SIGNUP / LOGIN / SESSIONS
// ---------------------------------------------------------------------------
export async function signup({ employee_no, nickname, password, avatar_emoji, avatar_color, ip }) {
  const sb = getServiceClient();
  // Signup returns a distinguishable "already registered" error, which is good
  // UX but would let someone enumerate valid ADI employee numbers if they could
  // run it thousands of times. Same IP budget as failed logins.
  if (ip && await countFails('ip', ip) >= RATE_MAX_IP_FAILS) {
    throw new HttpError('too many attempts — wait a few minutes', 429);
  }
  const role = employee_no === ADMIN_EMPLOYEE_NO ? 'admin' : 'player';
  const row = {
    employee_no, nickname, password_hash: hashPassword(password),
    avatar_emoji, avatar_color, role,
    settings_json: { roast_visibility: 'self', notifs: true, theme: 'dark' },
  };
  const resp = await sb.from('users').insert(row).select(PUBLIC_USER_COLS).single();
  if (resp.error) {
    if (resp.error.code === '23505') {
      // Count the collision against the IP budget, otherwise the throttle above
      // never trips and enumeration stays free.
      await recordAttempt(String(employee_no), ip, false);
      const m = /nickname/.test(resp.error.message) ? 'that nickname is taken' : 'that employee number is already registered';
      throw new HttpError(m, 409);
    }
    throw new HttpError('could not create account', 400);
  }
  // Welcome purse, granted through the normal ledger so it shows up in the
  // coin history like any other transaction. Best-effort: a failure here must
  // never cost somebody their account.
  try {
    await sb.rpc('wallet_apply', {
      p_user: resp.data.id, p_delta: STARTING_COINS,
      p_reason: 'signup:welcome', p_meta: { grant: STARTING_COINS },
    });
  } catch { /* they can still earn coins by playing */ }
  return publicUser(resp.data);
}

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_FAILS = 8;
const RATE_MAX_IP_FAILS = 30;

// The account lookup below is case-INSENSITIVE (ilike), so the throttle key
// must be too. Keying on the raw string let "Mint"/"mint"/"MINT" each earn a
// fresh budget against the same account.
const rateKey = (id) => String(id || '').trim().toLowerCase().slice(0, 64);

async function recordAttempt(identifier, ip, success) {
  const sb = getServiceClient();
  await sb.from('login_attempts').insert({ identifier: rateKey(identifier), ip, success });
}

async function countFails(col, val) {
  if (!val) return 0;
  const sb = getServiceClient();
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const resp = await sb.from('login_attempts').select('id', { count: 'exact', head: true })
    .eq(col, val).eq('success', false).gte('created_at', since);
  return resp.error ? 0 : (resp.count || 0);
}

// Two independent ceilings: a tight one per account, a looser one per source
// address so rotating the casing (or the target) can't buy more guesses.
async function throttled(identifier, ip) {
  const [byId, byIp] = await Promise.all([
    countFails('identifier', rateKey(identifier)),
    countFails('ip', ip),
  ]);
  return byId >= RATE_MAX_FAILS || byIp >= RATE_MAX_IP_FAILS;
}

export async function login({ loginId, password, ip, ua }) {
  const sb = getServiceClient();
  if (await throttled(loginId, ip)) {
    throw new HttpError('too many attempts — wait a few minutes', 429);
  }
  // Look up by employee_no (exact) then by nickname (case-insensitive, wildcards escaped).
  let found = must(await sb.from('users').select('id, password_hash, is_active, is_guest, ' + PUBLIC_USER_COLS)
    .eq('employee_no', loginId).limit(1), 'login by emp');
  if (!found.length) {
    const safe = loginId.replace(/([%_\\])/g, '\\$1');
    found = must(await sb.from('users').select('id, password_hash, is_active, is_guest, ' + PUBLIC_USER_COLS)
      .ilike('nickname', safe).limit(1), 'login by nick');
  }
  const u = found[0];
  const ok = u && verifyPassword(password, u.password_hash);
  await recordAttempt(loginId, ip, !!ok);
  if (!ok) throw new HttpError('wrong login or password', 401);
  if (!u.is_active) throw new HttpError('this account is disabled', 403);
  // Guests hold a hash no password can produce, so verifyPassword already fails
  // them — but this is a trust boundary, so say it out loud rather than rely on
  // a detail of the hash format.
  if (u.is_guest) throw new HttpError('that profile has not been claimed yet — sign up and claim it', 403);
  await sb.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', u.id);
  return publicUser(u);
}

export async function createSession(userId, ip, ua) {
  const sb = getServiceClient();
  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400 * 1000).toISOString();
  must(await sb.from('sessions').insert({
    user_id: userId, token_hash: hashToken(token), expires_at: expires,
    ip, user_agent: (ua || '').slice(0, 300),
  }), 'create session');
  return token;
}

export async function getSessionUser(token) {
  if (!token) return null;
  const sb = getServiceClient();
  // ONE round trip: embed the user row through the sessions.user_id FK.
  // This runs on EVERY authenticated request, so a second query here cost
  // ~250ms app-wide.
  const rows = must(await sb.from('sessions')
    .select('id, expires_at, last_seen_at, users(' + PUBLIC_USER_COLS + ')')
    .eq('token_hash', hashToken(token)).limit(1), 'get session');
  const s = rows[0];
  if (!s || new Date(s.expires_at).getTime() < Date.now()) return null;
  const u = Array.isArray(s.users) ? s.users[0] : s.users;
  if (!u || !u.is_active) return null;
  // Touch last_seen at most every 5 min — it used to be a write per request.
  const seen = s.last_seen_at ? new Date(s.last_seen_at).getTime() : 0;
  if (Date.now() - seen > 300000) {
    sb.from('sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', s.id).then(() => {}, () => {});
  }
  return publicUser(u);
}

export async function destroySession(token) {
  if (!token) return;
  const sb = getServiceClient();
  await sb.from('sessions').delete().eq('token_hash', hashToken(token));
}

function publicUser(u) {
  return {
    id: u.id, nickname: u.nickname, avatar_emoji: u.avatar_emoji,
    avatar_color: u.avatar_color, role: u.role,
    settings: u.settings_json || {}, created_at: u.created_at,
  };
}

// ---------------------------------------------------------------------------
// MATCHES
// ---------------------------------------------------------------------------
// A real club night is a few dozen matches across everyone. This cap is
// generous for genuine play but stops a script farming XP -> levels -> coins by
// firing thousands of fabricated matches. Rooms report through here too, so it
// is deliberately well above any plausible session.
const MATCH_RATE_WINDOW_MS = 60 * 60 * 1000;
const MATCH_RATE_MAX = 40;

async function assertMatchRate(loggedById) {
  if (!loggedById) return;
  const sb = getServiceClient();
  const since = new Date(Date.now() - MATCH_RATE_WINDOW_MS).toISOString();
  const resp = await sb.from('matches').select('id', { count: 'exact', head: true })
    .eq('logged_by', loggedById).gte('created_at', since);
  if (resp.error) return;                       // never block real play on a counter failure
  if ((resp.count || 0) >= MATCH_RATE_MAX) {
    throw new HttpError('too many matches logged in the last hour — take a breather', 429);
  }
}

export async function logMatch(input, loggedById) {
  const sb = getServiceClient();
  await assertMatchRate(loggedById);
  const ids = [...input.teamA, ...input.teamB];
  const found = must(await sb.from('users').select('id, is_active').in('id', ids), 'verify players');
  if (found.length !== ids.length || found.some(u => !u.is_active)) {
    throw new HttpError('one or more players do not exist', 400);
  }
  const matchRows = must(await sb.from('matches').insert({
    played_at: input.played_at || new Date().toISOString(),
    format: input.format, logged_by: loggedById || null,
    status: 'active', location: input.location,
  }).select('id'), 'insert match');
  const matchId = matchRows[0].id;

  try {
    const players = [
      ...input.teamA.map(uid => ({ match_id: matchId, user_id: uid, team: 'A' })),
      ...input.teamB.map(uid => ({ match_id: matchId, user_id: uid, team: 'B' })),
    ];
    must(await sb.from('match_players').insert(players), 'insert players');
    const games = input.games.map(g => ({ match_id: matchId, game_no: g.game_no, score_a: g.score_a, score_b: g.score_b }));
    must(await sb.from('games').insert(games), 'insert games');
  } catch (e) {
    await sb.from('matches').delete().eq('id', matchId); // cascade cleans children
    throw e;
  }

  await recomputeAndPersist();
  return { matchId };
}

async function fetchMatchesByIds(ids) {
  if (!ids.length) return [];
  const sb = getServiceClient();
  return must(await sb.from('matches')
    .select('id, played_at, format, status, logged_by, location, match_players(user_id, team), games(game_no, score_a, score_b)')
    .in('id', ids).order('played_at', { ascending: false }), 'fetch matches');
}

export async function recentMatches(limit = 20) {
  const sb = getServiceClient();
  const rows = must(await sb.from('matches')
    .select('id, played_at, format, status, logged_by, location, match_players(user_id, team), games(game_no, score_a, score_b)')
    .in('status', ['active', 'flagged']).order('played_at', { ascending: false }).limit(limit), 'recent matches');
  const users = must(await sb.from('users').select(PUBLIC_USER_COLS), 'users for feed');
  const umap = userMapOf(users);
  return rows.map(r => shapeMatch(r, umap));
}

function shapeMatch(r, umap) {
  const nm = normalizeMatch({ id: r.id, played_at: r.played_at, format: r.format, logged_by: r.logged_by, players: r.match_players || [], games: r.games || [] });
  const disp = (id) => {
    const u = umap.get(id);
    return u ? { id, nickname: u.nickname, avatar_emoji: u.avatar_emoji, avatar_color: u.avatar_color } : { id, nickname: '—', avatar_emoji: '❓', avatar_color: '#888' };
  };
  return {
    id: r.id, played_at: r.played_at, format: r.format, status: r.status, location: r.location,
    teamA: nm.teamA.map(disp), teamB: nm.teamB.map(disp),
    games: nm.games.map((g, i) => ({ game_no: i + 1, score_a: g.a, score_b: g.b })),
    gamesWonA: nm.gamesWonA, gamesWonB: nm.gamesWonB, winner: nm.winner,
  };
}

export async function flagMatch(matchId, user, reason, claimedScore) {
  const sb = getServiceClient();
  const rows = must(await sb.from('matches').select('id, status, match_players(user_id)').eq('id', matchId).limit(1), 'flag lookup');
  const m = rows[0];
  if (!m) throw new HttpError('match not found', 404);
  const isParticipant = (m.match_players || []).some(p => p.user_id === user.id);
  if (!isParticipant && user.role !== 'admin') throw new HttpError('only players in the match can flag it', 403);
  must(await sb.from('flags').insert({ match_id: matchId, raised_by: user.id, reason, claimed_score: claimedScore, status: 'open' }), 'insert flag');
  if (m.status === 'active') await sb.from('matches').update({ status: 'flagged' }).eq('id', matchId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// LEADERBOARD / PROFILE / MAP / TITLES
// ---------------------------------------------------------------------------
// Rank ACTIVE players (games > 0) from an Elo standings map. Ordering is
// deterministic: elo desc, then games desc, then nickname asc. Returns a Map
// userId -> rank (1..N).
function rankStandings(standings, umap) {
  const arr = [];
  for (const [id, r] of standings) {
    const u = umap.get(id);
    if (!u || !u.is_active || !(r.games > 0)) continue;
    arr.push({ id, elo: r.elo, games: r.games, nickname: u.nickname || '' });
  }
  arr.sort((a, b) =>
    (b.elo - a.elo) || (b.games - a.games) ||
    (a.nickname < b.nickname ? -1 : a.nickname > b.nickname ? 1 : 0));
  const map = new Map();
  arr.forEach((x, i) => map.set(x.id, i + 1));
  return map;
}

// Leaderboard ranked by CURRENT all-time Elo. `range` selects the movement
// comparison window: '1w' vs 7 days ago, '1m'/'all' vs 30 days ago.
// Fast path: read the precomputed ratings/titles tables instead of replaying
// the whole match history. Used by every screen that doesn't show ▲▼ movement.
// One round trip for the home screen instead of four — under concurrency each
// extra request is a separate serverless invocation.
export async function homeBootstrap(userId) {
  const [board, matches, titles, rooms] = await Promise.all([
    leaderboardFast(),
    recentMatches(8),
    titlesBoard(userId, 30),
    listOpenRooms().catch(() => ({ rooms: [] })),
  ]);
  // Home renders only YOUR row and the fair-opponent pick — shipping all ~100
  // rows was most of the payload. Compute both here instead.
  const me = board.rows.find(r => r.id === userId) || null;
  let fair = null;
  if (me) {
    let best = null;
    for (const r of board.rows) {
      if (r.id === userId) continue;
      const gap = Math.abs(r.elo - me.elo);
      if (!best || gap < best.gap) best = { gap, row: r };
    }
    if (best) {
      fair = {
        id: best.row.id, nickname: best.row.nickname, avatar_emoji: best.row.avatar_emoji,
        elo: best.row.elo, gap: best.gap,
      };
    }
  }
  return { me, fair, players: board.rows.length, matches, titles, rooms: rooms.rooms || [] };
}

export async function leaderboardFast() {
  const sb = getServiceClient();
  const [ratings, users, titleRows] = await Promise.all([
    sb.from('ratings').select('user_id, elo, games, wins, losses, streak, provisional')
      .eq('season', 'all-time').order('elo', { ascending: false }).range(0, 999),
    sb.from('users').select(PUBLIC_USER_COLS).range(0, 4999),
    sb.from('titles_awarded').select('title_key, holder_ids, meta_json').eq('season', 'all-time'),
  ]);
  const rs = must(ratings, 'fast ratings'), us = must(users, 'fast users'), ts = must(titleRows, 'fast titles');
  const umap = userMapOf(us);
  const held = new Map(), myth = new Map();
  for (const t of ts) {
    const isMyth = !!(t.meta_json && t.meta_json.mythic);
    for (const id of t.holder_ids || []) {
      if (!held.has(id)) held.set(id, new Set());
      held.get(id).add(t.title_key);
      if (isMyth) {
        if (!myth.has(id)) myth.set(id, new Map());
        myth.get(id).set(t.title_key, { name: t.meta_json.name, icon: t.meta_json.icon });
      }
    }
  }
  const ctx = { held, myth };
  const rows = [];
  let rank = 0;
  for (const r of rs) {
    const u = umap.get(r.user_id);
    if (!u || !u.is_active || r.games <= 0) continue;
    rank++;
    rows.push({
      id: r.user_id, nickname: u.nickname, avatar_emoji: u.avatar_emoji, avatar_color: u.avatar_color,
      frame: (u.settings_json && u.settings_json.frame) || 'auto',
      card: (u.settings_json && u.settings_json.card) || 'none',
      wear: (u.settings_json && u.settings_json.wear) || 'none',
      mythics: myth.get(r.user_id) ? myth.get(r.user_id).size : 0,
      badge: resolveBadge(u, ctx),
      elo: Math.round(r.elo), games: r.games, wins: r.wins, losses: r.losses,
      streak: r.streak, provisional: !!r.provisional,
      rank, prevRank: null, delta: null,
    });
  }
  return { range: 'all', rows, fast: true };
}

export async function leaderboard(range = 'all') {
  const validRange = ['all', '1w', '1m'].includes(range) ? range : 'all';
  const { users, normMatches } = await loadCore();
  const umap = userMapOf(users);

  const current = runElo(users, normMatches);
  const currentRanks = rankStandings(current, umap);

  // Mythic holders get the one-of-a-kind Eclipse frame on the board.
  const lbModel = buildModel(users, normMatches);
  const mythicCount = new Map();
  for (const m of mythicAwards(lbModel, current)) {
    if (m.holderId) mythicCount.set(m.holderId, (mythicCount.get(m.holderId) || 0) + 1);
  }
  const bctx = await badgeContext(getServiceClient(), lbModel, current);

  const windowMs = (validRange === '1w' ? 7 : 30) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - windowMs;
  const pastMatches = normMatches.filter(m => +new Date(m.played_at) <= cutoff);
  const past = runElo(users, pastMatches);
  const pastRanks = rankStandings(past, umap);

  const rows = [];
  for (const [id, rank] of currentRanks) {
    const r = current.get(id);
    const u = umap.get(id);
    const prevRank = pastRanks.has(id) ? pastRanks.get(id) : null;
    rows.push({
      id,
      nickname: u.nickname,
      avatar_emoji: u.avatar_emoji,
      avatar_color: u.avatar_color,
      frame: (u.settings_json && u.settings_json.frame) || 'auto',
      card: (u.settings_json && u.settings_json.card) || 'none',
      wear: (u.settings_json && u.settings_json.wear) || 'none',
      mythics: mythicCount.get(id) || 0,
      badge: resolveBadge(u, bctx),
      elo: Math.round(r.elo),
      games: r.games,
      wins: r.wins,
      losses: r.losses,
      streak: r.streak,
      provisional: r ? !!r.provisional : false,
      rank,
      prevRank,
      delta: prevRank != null ? prevRank - rank : null,
    });
  }
  rows.sort((a, b) => a.rank - b.rank);
  return { range: validRange, rows };
}

// Milestone progress for one player (drives the achievements screen). Every
// milestone in ALL_MILESTONES is returned, unlocked or not, in source order.
export async function achievements(userId) {
  const { users, normMatches } = await loadCore();
  const model = buildModel(users, normMatches);
  const standings = runElo(users, normMatches);
  const list = milestoneProgress(model, standings, userId);
  const rarity = milestoneRarity(model, standings);
  // Mythics are secret: only the holder sees the real name + how it was earned.
  const mythics = mythicAwards(model, standings).map(m => {
    const mine = m.holderId === userId;
    return {
      key: m.key, icon: m.icon, tier: 'mythic', mine,
      name: m.name,                       // public — mythics are titles now
      detail: mine ? m.reveal : m.hint,   // only the holder learns how it was earned
      holder: m.holder, claimed: !!m.holderId,
      rarity: m.rarity, holders: m.holders, pool: m.pool,
    };
  });
  return {
    achievements: list.map(a => {
      const r = rarity.get(a.key);
      const pool = r ? r.pool : model.players.size;
      return { ...a, rarity: r ? r.rarity : 0, holders: r ? r.holders : 0, pool };
    }),
    unlocked: list.filter(a => a.unlocked).length,
    total: list.length,
    mythics,
    mythicsHeld: mythics.filter(m => m.mine).length,
    memberNo: memberNumbers(model).get(userId) || null,
    memberTotal: model.players.size,
  };
}

export async function profile(userId) {
  const sb = getServiceClient();
  const uRows = must(await sb.from('users').select(PUBLIC_USER_COLS).eq('id', userId).limit(1), 'profile user');
  const user = uRows[0];
  if (!user) throw new HttpError('player not found', 404);

  const { users, normMatches } = await loadCore();
  const umap = userMapOf(users);
  const model = buildModel(users, normMatches);
  const standings = runElo(users, normMatches);   // needed for the unlock themes
  const p = model.players.get(userId) || null;

  const ratingRows = must(await sb.from('ratings').select('season, elo, games, wins, losses, streak, provisional').eq('user_id', userId), 'profile ratings');
  const allTime = ratingRows.find(r => r.season === 'all-time') || null;
  const thisMonth = ratingRows.find(r => r.season === monthKey(new Date())) || null;

  // global all-time rank (drives tier + avatar frame); mirrors leaderboard ordering
  let rank = null;
  if (allTime && allTime.games > 0) {
    const rankRows = must(await sb.from('ratings')
      .select('user_id, elo, games, users(is_active)')
      .eq('season', 'all-time').order('elo', { ascending: false }), 'profile rank');
    const ranked = rankRows.filter(r => r.users && r.users.is_active && r.games > 0);
    const idx = ranked.findIndex(r => r.user_id === userId);
    rank = idx >= 0 ? idx + 1 : null;
  }

  // titles held (materialized) where this user is a holder
  const heldRows = must(await sb.from('titles_awarded').select('title_key, season, holder_ids, value').contains('holder_ids', [userId]), 'held titles');
  const held = heldRows.map(t => ({ ...titleMeta(t.title_key), season: t.season, value: t.value }));
  const personal = personalTitles(model, userId).map(t => ({ ...titleMeta(t.title_key), holder: displayUser(umap.get(t.holder_ids[0])), value: t.value }));

  const together = p ? [...p.partners.entries()].map(([pid, s]) => ({ ...displayUser(umap.get(pid)), games: s.games, wins: s.wins, winrate: s.games ? s.wins / s.games : 0 })).sort((a, b) => b.games - a.games) : [];
  const against = p ? [...p.opponents.entries()].map(([oid, s]) => ({ ...displayUser(umap.get(oid)), games: s.games, wins: s.wins, losses: s.losses })).sort((a, b) => b.games - a.games) : [];

  // Recent matches: pick the ids from the in-memory history (already sorted)
  // instead of pulling every match_players row for this user.
  const recentIds = normMatches
    .filter(m => m.teamA.includes(userId) || m.teamB.includes(userId))
    .sort((a, b) => b.played_at - a.played_at)
    .slice(0, 15)
    .map(m => m.id);
  const recent = (await fetchMatchesByIds(recentIds)).map(r => shapeMatch(r, umap));
  const standAll = runElo(users, normMatches);
  const mythicList = mythicAwards(model, standAll);
  const mythicsOwned = mythicList.filter(m => m.holderId === userId)
    .map(m => ({ key: m.key, name: m.name, icon: m.icon }));
  const mythicsHeld = mythicsOwned.length;
  const bctx = await badgeContext(sb, model, standAll);
  const badge = resolveBadge(user, bctx);
  const joiner = joinerBadge(bctx.memberNo.get(userId) || null);

  // Elo after each of this player's matches — drives the profile sparkline.
  const eloHistory = eloTimeline(users, normMatches, userId);

  // Which cosmetic families this player has earned. Computed server-side so the
  // browser can never grant itself a frame it has not unlocked.
  const memberNo = memberNumbers(model).get(userId) || null;
  const extra = buildExtra(model, standings);
  const tierIndex = Object.fromEntries(TIER_KEYS.map((k, i) => [k, i]));
  const myTierRank = TIER_KEYS.findIndex(k => k === tierKeyFor(allTime ? allTime.elo : null));
  const unlocks = p
    ? earnedThemes(p, {
      tierRank: myTierRank < 0 ? 0 : myTierRank,
      tierIndex,
      rank,
      mythicsHeld,
      giantWins: extra.giantWins.get(userId) || 0,
      shutouts: extra.shutouts.get(userId) || 0,
      memberNo,
    })
    : ['free'];

  return {
    user: displayUser(user),
    stats: p ? {
      matches: p.matches, wins: p.wins, losses: p.losses, winrate: p.winrate,
      currentStreak: p.currentStreak, longestWin: p.longestWin, longestLoss: p.longestLoss,
      pointsFor: p.pointsFor, pointsAgainst: p.pointsAgainst, distinctPartners: p.distinctPartners,
      gamesCount: p.gamesCount, comebackWins: p.comebackWins, threeGameWins: p.threeGameWins,
      deuceGamesInvolved: p.deuceGamesInvolved, nightMatches: p.nightMatches, morningMatches: p.morningMatches,
      doublesWins: p.doublesWins, doublesMatches: p.doublesMatches,
    } : emptyStats(),
    elo: allTime ? Math.round(allTime.elo) : null,
    eloHistory,
    mythicsHeld,
    mythicsOwned,
    badge,
    joiner,
    rank,
    memberNo,
    memberTotal: model.players.size,
    unlocks,
    provisional: allTime ? allTime.provisional : true,
    season: thisMonth ? { elo: Math.round(thisMonth.elo), games: thisMonth.games } : null,
    titles: held, personalTitles: personal,
    together, against, recent,
    cosmetics: {
      frame: (user.settings_json && user.settings_json.frame) || 'auto',
      card: (user.settings_json && user.settings_json.card) || 'none',
      wear: (user.settings_json && user.settings_json.wear) || 'none',    },
    roastVisible: (user.settings_json && user.settings_json.roast_visibility) === 'public',
  };
}

export async function relationshipMap(viewerId, limit = 32) {
  const { users, normMatches } = await loadCore();
  const model = buildModel(users, normMatches);
  const standings = runElo(users, normMatches);
  const all = [];
  for (const [id, p] of model.players) {
    if (p.matches <= 0) continue;
    const r = standings.get(id);
    all.push({ id, nickname: p.nickname, avatar_emoji: p.avatar_emoji, avatar_color: p.avatar_color, elo: r ? Math.round(r.elo) : 1500, matches: p.matches });
  }
  // A 100-player web is unreadable (and a 300KB payload) — keep the busiest
  // players plus everyone the viewer has actually played with.
  const keep = new Set();
  if (viewerId && model.players.has(viewerId)) {
    keep.add(viewerId);
    const me = model.players.get(viewerId);
    const top = (map, n) => [...map.entries()].sort((a, b) => (b[1].games || 0) - (a[1].games || 0)).slice(0, n).map(e => e[0]);
    for (const pid of top(me.partners, 8)) keep.add(pid);
    for (const oid of top(me.opponents, 8)) keep.add(oid);
  }
  for (const n of all.slice().sort((a, b) => b.matches - a.matches)) {
    if (keep.size >= limit) break;
    keep.add(n.id);
  }
  const nodes = all.filter(n => keep.has(n.id));
  const edges = [];
  for (const pr of model.partnerships.values()) {
    if (keep.has(pr.ids[0]) && keep.has(pr.ids[1])) edges.push({ type: 'partner', a: pr.ids[0], b: pr.ids[1], games: pr.games, wins: pr.wins });
  }
  for (const rv of model.rivalries.values()) {
    if (keep.has(rv.ids[0]) && keep.has(rv.ids[1])) edges.push({ type: 'rival', a: rv.ids[0], b: rv.ids[1], meetings: rv.meetings });
  }
  return { nodes, edges, capped: all.length > nodes.length, totalPlayers: all.length };
}

export async function titlesBoard(viewerId = null, top = 0) {
  const sb = getServiceClient();
  const thisMonth = monthKey(new Date());
  const rows = must(await sb.from('titles_awarded').select('title_key, season, holder_ids, value, meta_json')
    .in('season', ['all-time', thisMonth]), 'titles board');
  const users = must(await sb.from('users').select('id, nickname, avatar_emoji, avatar_color'), 'titles users');
  const umap = userMapOf(users);
  const pool = users.length || 1;
  const normal = rows.map(t => ({
    ...titleMeta(t.title_key), season: t.season, value: t.value,
    ...(t.meta_json && t.meta_json.mythic
      ? { name: t.meta_json.icon + ' ' + t.meta_json.name, tier: 'mythic', scope: 'Mythic', group: 'mythic' }
      : {}),
    holders: (t.holder_ids || []).map(id => displayUser(umap.get(id))),
    // Rarity only reads sensibly for awards many players can hold. Mythics,
    // epithets and "best in the club" leader titles are one-holder-by-design,
    // so they report that instead of a meaningless 1-in-N percentage.
    sole: !!(t.meta_json && (t.meta_json.mythic || t.meta_json.epithet)) || (t.holder_ids || []).length === 1,
    holderCount: (t.holder_ids || []).length,
    pool,
    rarity: (t.holder_ids || []).length / pool,
  }));

  const all = normal.sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
  if (!top || all.length <= top) return all;
  // Home only needs the headline titles plus whatever the viewer holds —
  // sending all ~350 rows was a 300KB payload on every load.
  const mine = viewerId ? all.filter(t => (t.holders || []).some(h => h && h.id === viewerId)).slice(0, 12) : [];
  const head = all.slice(0, top);
  const seen = new Set();
  const picked = [...head, ...mine].filter(t => {
    const k = t.key + '|' + t.season;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  // slim shape — home only renders name/tier/value/holder nicknames
  return picked.map(t => ({
    key: t.key, name: t.name, tier: t.tier, scope: t.scope, season: t.season, value: t.value,
    rarity: t.rarity, holderCount: t.holderCount, pool: t.pool, sole: t.sole,
    holders: (t.holders || []).map(h => ({ id: h.id, nickname: h.nickname, avatar_emoji: h.avatar_emoji })),
  }));
}

function tierRank(t) { return { mythic: -1, legendary: 0, epic: 1, rare: 2, common: 3 }[t] ?? 4; }
function titleMeta(key) {
  const m = TITLES_BY_KEY[key] || { key, name: key, tier: 'common', group: 'misc', scope: 'Season', roast: false, alias: null };
  return { key: m.key, name: m.name, alias: m.alias, tier: m.tier, group: m.group, scope: m.scope, roast: m.roast };
}

// ---------------------------------------------------------------------------
// BADGE SLOT — one equippable badge (a title you hold, or a mythic you hold)
// shown next to your name. Ownership is verified HERE, every read: equipping a
// badge you no longer hold silently falls back to your rank tier.
// ---------------------------------------------------------------------------
async function badgeContext(sb, model, standings) {
  const rows = must(await sb.from('titles_awarded').select('title_key, holder_ids'), 'badge titles');
  const held = new Map();
  for (const r of rows) {
    for (const id of r.holder_ids || []) {
      if (!held.has(id)) held.set(id, new Set());
      held.get(id).add(r.title_key);
    }
  }
  const myth = new Map();
  for (const m of mythicAwards(model, standings)) {
    if (!m.holderId) continue;
    if (!myth.has(m.holderId)) myth.set(m.holderId, new Map());
    myth.get(m.holderId).set(m.key, { name: m.name, icon: m.icon });
  }
  return { held, myth, memberNo: memberNumbers(model) };
}

// Join order as a wearable badge: member #1 is the Founding Goose, everyone
// else is Joiner Goose #N. Nobody has to earn it and nobody can lose it, so it
// is the one badge a brand-new player can wear on day one.
export function joinerBadge(memberNo) {
  if (!memberNo) return null;
  return memberNo === 1
    ? { kind: 'joiner', key: 'joiner', name: 'Founding Goose', icon: '🪺', tier: 'mythic', memberNo }
    : { kind: 'joiner', key: 'joiner', name: 'Joiner Goose #' + memberNo, icon: '🪿', tier: 'rare', memberNo };
}

function resolveBadge(user, ctx) {
  const key = user && user.settings_json && user.settings_json.badge;
  if (!key || key === 'tier' || key === 'none') return null;
  if (key === 'joiner') return joinerBadge(ctx.memberNo ? ctx.memberNo.get(user.id) : null);
  const mine = ctx.myth.get(user.id);
  if (mine && mine.has(key)) {
    const m = mine.get(key);
    return { kind: 'mythic', key, name: m.name, icon: m.icon, tier: 'mythic' };
  }
  const titles = ctx.held.get(user.id);
  if (titles && titles.has(key)) {
    const meta = titleMeta(key);
    return { kind: 'title', key, name: meta.name, tier: meta.tier };
  }
  return null;
}
function displayUser(u) {
  if (!u) return { id: null, nickname: '—', avatar_emoji: '❓', avatar_color: '#888' };
  return { id: u.id, nickname: u.nickname, avatar_emoji: u.avatar_emoji, avatar_color: u.avatar_color };
}
function emptyStats() { return { matches: 0, wins: 0, losses: 0, winrate: 0, currentStreak: 0, longestWin: 0, longestLoss: 0, pointsFor: 0, pointsAgainst: 0, distinctPartners: 0, gamesCount: 0, comebackWins: 0, threeGameWins: 0, deuceGamesInvolved: 0, nightMatches: 0, morningMatches: 0, doublesWins: 0, doublesMatches: 0 }; }

// ---------------------------------------------------------------------------
// USER SELF-SERVICE
// ---------------------------------------------------------------------------
export async function updateSettings(userId, patch) {
  const sb = getServiceClient();
  const rows = must(await sb.from('users').select('settings_json').eq('id', userId).limit(1), 'settings get');
  const merged = { ...(rows[0]?.settings_json || {}), ...patch };
  must(await sb.from('users').update({ settings_json: merged }).eq('id', userId), 'settings set');
  return merged;
}

export async function updateAvatar(userId, avatar_emoji, avatar_color) {
  const sb = getServiceClient();
  must(await sb.from('users').update({ avatar_emoji, avatar_color }).eq('id', userId), 'avatar set');
  return { avatar_emoji, avatar_color };
}

// list of players for the "log a match" picker
export async function playerDirectory() {
  const sb = getServiceClient();
  const [users, ratings] = await Promise.all([
    sb.from('users').select('id, nickname, avatar_emoji, avatar_color, settings_json, is_guest').eq('is_active', true).order('nickname'),
    sb.from('ratings').select('user_id, elo, games').eq('season', 'all-time'),
  ]);
  // Elo rides along so the log screen can show live odds without a second call,
  // and the equipped frame so a player looks the same everywhere they appear.
  const rmap = new Map(must(ratings, 'directory ratings').map(r => [r.user_id, r]));
  const ranked = [...rmap.entries()].filter(([, r]) => r.games > 0)
    .sort((a, b) => b[1].elo - a[1].elo).map(([id]) => id);
  return must(users, 'directory').map(u => {
    const r = rmap.get(u.id);
    const s = u.settings_json || {};
    return {
      id: u.id, nickname: u.nickname, avatar_emoji: u.avatar_emoji, avatar_color: u.avatar_color,
      elo: r ? Math.round(r.elo) : 1500,
      games: r ? r.games : 0,
      rank: ranked.indexOf(u.id) + 1 || null,
      frame: s.frame || 'auto',
      card: s.card || 'none',
      wear: s.wear || 'none',
      guest: !!u.is_guest,
    };
  });
}

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------
async function logAudit(actorId, action, entity, entityId, before, after, note) {
  const sb = getServiceClient();
  await sb.from('audit_log').insert({ actor_id: actorId, action, entity, entity_id: entityId ? String(entityId) : null, before_json: before || null, after_json: after || null, note: note || null });
}

export async function adminPlayers() {
  const sb = getServiceClient();
  const users = must(await sb.from('users').select('id, employee_no, nickname, avatar_emoji, avatar_color, role, is_active, created_at, last_login_at').order('created_at'), 'admin players');
  const ratings = must(await sb.from('ratings').select('user_id, elo, games').eq('season', 'all-time'), 'admin ratings');
  const rmap = new Map(ratings.map(r => [r.user_id, r]));
  return users.map(u => ({ ...u, elo: rmap.get(u.id) ? Math.round(rmap.get(u.id).elo) : null, games: rmap.get(u.id)?.games || 0 }));
}

export async function adminFlags(status = 'open') {
  const sb = getServiceClient();
  const rows = must(await sb.from('flags')
    .select('id, match_id, reason, claimed_score, status, created_at, raised_by, users:raised_by(nickname, avatar_emoji)')
    .eq('status', status).order('created_at', { ascending: false }), 'admin flags');
  const matchIds = [...new Set(rows.map(r => r.match_id))];
  const users = must(await sb.from('users').select(PUBLIC_USER_COLS), 'flag users');
  const umap = userMapOf(users);
  const matches = await fetchMatchesByIds(matchIds);
  const mmap = new Map(matches.map(m => [m.id, shapeMatch(m, umap)]));
  return rows.map(r => ({
    id: r.id, status: r.status, reason: r.reason, claimed_score: r.claimed_score, created_at: r.created_at,
    raised_by: r.users ? { nickname: r.users.nickname, avatar_emoji: r.users.avatar_emoji } : null,
    match: mmap.get(r.match_id) || null,
  }));
}

export async function adminResolveFlag(flagId, adminId, action, note) {
  const sb = getServiceClient();
  const status = action === 'dismiss' ? 'dismissed' : 'resolved';
  const before = must(await sb.from('flags').select('*').eq('id', flagId).limit(1), 'flag before')[0];
  if (!before) throw new HttpError('flag not found', 404);
  must(await sb.from('flags').update({ status, resolved_at: new Date().toISOString(), resolved_by: adminId }).eq('id', flagId), 'resolve flag');
  await logAudit(adminId, action === 'dismiss' ? 'dismiss_flag' : 'resolve_flag', 'flag', flagId, before, { status }, note);
  return { ok: true };
}

export async function adminVoidMatch(matchId, adminId, reason) {
  const sb = getServiceClient();
  const before = must(await sb.from('matches').select('*').eq('id', matchId).limit(1), 'void before')[0];
  if (!before) throw new HttpError('match not found', 404);
  must(await sb.from('matches').update({ status: 'void', voided_by: adminId, voided_at: new Date().toISOString(), void_reason: reason || null }).eq('id', matchId), 'void match');
  await sb.from('flags').update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: adminId }).eq('match_id', matchId).eq('status', 'open');
  await logAudit(adminId, 'void', 'match', matchId, before, { status: 'void', reason }, reason);
  await recomputeAndPersist();
  return { ok: true };
}

export async function adminRestoreMatch(matchId, adminId) {
  const sb = getServiceClient();
  const before = must(await sb.from('matches').select('*').eq('id', matchId).limit(1), 'restore before')[0];
  if (!before) throw new HttpError('match not found', 404);
  must(await sb.from('matches').update({ status: 'active', voided_by: null, voided_at: null, void_reason: null }).eq('id', matchId), 'restore match');
  await logAudit(adminId, 'restore', 'match', matchId, before, { status: 'active' }, null);
  await recomputeAndPersist();
  return { ok: true };
}

export async function adminDeleteMatch(matchId, adminId) {
  const sb = getServiceClient();
  const before = must(await sb.from('matches').select('*').eq('id', matchId).limit(1), 'delete before')[0];
  if (!before) throw new HttpError('match not found', 404);
  await sb.from('flags').delete().eq('match_id', matchId);
  must(await sb.from('matches').delete().eq('id', matchId), 'delete match'); // FK cascade removes games + match_players
  await logAudit(adminId, 'delete', 'match', matchId, before, null, 'hard delete');
  await recomputeAndPersist();
  return { ok: true };
}

export async function adminResetAll(adminId) {
  const sb = getServiceClient();
  const deleted = must(await sb.from('matches').select('id'), 'reset count').length;
  await sb.from('flags').delete().not('id', 'is', null);
  must(await sb.from('matches').delete().not('id', 'is', null), 'reset delete matches'); // cascade clears games + match_players
  await logAudit(adminId, 'reset', 'system', null, { matches: deleted }, { matches: 0 }, 'reset all scores');
  await recomputeAndPersist(); // empties ratings + titles_awarded (no matches left)
  return { ok: true, deleted };
}

export async function adminEditGames(matchId, adminId, games) {
  const sb = getServiceClient();
  const before = must(await sb.from('games').select('game_no, score_a, score_b').eq('match_id', matchId).order('game_no'), 'edit before');
  await sb.from('games').delete().eq('match_id', matchId);
  const rows = games.map(g => ({ match_id: matchId, game_no: g.game_no, score_a: g.score_a, score_b: g.score_b }));
  must(await sb.from('games').insert(rows), 'edit insert games');
  await logAudit(adminId, 'edit', 'match', matchId, { games: before }, { games: rows.map(({ match_id, ...r }) => r) }, 'score edit');
  await recomputeAndPersist();
  return { ok: true };
}

export async function adminAdjustPlayer(userId, adminId, patch) {
  const sb = getServiceClient();
  const before = must(await sb.from('users').select('id, nickname, avatar_emoji, avatar_color, role, is_active').eq('id', userId).limit(1), 'adjust before')[0];
  if (!before) throw new HttpError('player not found', 404);
  const update = {};
  if (patch.nickname != null) update.nickname = patch.nickname;
  if (patch.avatar_emoji != null) update.avatar_emoji = patch.avatar_emoji;
  if (patch.avatar_color != null) update.avatar_color = patch.avatar_color;
  if (patch.is_active != null) update.is_active = !!patch.is_active;
  if (patch.role != null && ['player', 'admin'].includes(patch.role)) update.role = patch.role;
  if (!Object.keys(update).length) throw new HttpError('nothing to change', 400);
  const resp = await sb.from('users').update(update).eq('id', userId).select('id, nickname, avatar_emoji, avatar_color, role, is_active').single();
  if (resp.error) {
    if (resp.error.code === '23505') throw new HttpError('that nickname is taken', 409);
    throw new HttpError('could not update player', 400);
  }
  await logAudit(adminId, 'adjust', 'user', userId, before, resp.data, null);
  if (update.is_active != null && update.is_active !== before.is_active) await recomputeAndPersist();
  return resp.data;
}

export async function adminAudit(limit = 50) {
  const sb = getServiceClient();
  const rows = must(await sb.from('audit_log')
    .select('id, action, entity, entity_id, note, created_at, actor_id, users:actor_id(nickname, avatar_emoji)')
    .order('created_at', { ascending: false }).limit(limit), 'audit');
  return rows.map(r => ({
    id: r.id, action: r.action, entity: r.entity, entity_id: r.entity_id, note: r.note, created_at: r.created_at,
    actor: r.users ? { nickname: r.users.nickname, avatar_emoji: r.users.avatar_emoji } : null,
  }));
}


// ---------------------------------------------------------------------------
// ROOMS — live play sessions (courts on/off, auto-drawn teams, live scoreboard)
// ---------------------------------------------------------------------------
const ROOM_PLAYER_COLS = 'id, room_id, user_id, joined_at, left_at, rounds_played, rounds_rested';
const ROOM_COLS = 'id, code, name, host_id, status, courts, created_at, closed_at';

async function roomRow(sb, roomId) {
  const rows = must(await sb.from('rooms').select(ROOM_COLS).eq('id', roomId).limit(1), 'load room');
  const r = rows[0];
  if (!r) throw new HttpError('room not found', 404);
  return r;
}
function assertHost(room, userId) {
  if (room.host_id !== userId) throw new HttpError('only the host can do that', 403);
}
function assertOpen(room) {
  if (room.status !== 'open') throw new HttpError('this session has ended', 400);
}

export async function createRoom(hostId, name) {
  const sb = getServiceClient();
  // One live room per host keeps the join flow unambiguous.
  const open = must(await sb.from('rooms').select('id').eq('host_id', hostId).eq('status', 'open').limit(1), 'existing room');
  if (open[0]) return { roomId: open[0].id, existing: true };

  let room = null;
  for (let attempt = 0; attempt < 6 && !room; attempt++) {
    const code = roomCode();
    const taken = must(await sb.from('rooms').select('id').eq('code', code).limit(1), 'code check');
    if (taken[0]) continue;
    const ins = await sb.from('rooms')
      .insert({ code, name: name || null, host_id: hostId, status: 'open', courts: [1, 2, 3, 4] })
      .select(ROOM_COLS);
    if (ins.error) { if (attempt === 5) must(ins, 'create room'); continue; }
    room = ins.data[0];
  }
  if (!room) throw new HttpError('could not create a room, try again', 500);

  must(await sb.from('room_players').insert({ room_id: room.id, user_id: hostId }), 'host join');
  return { roomId: room.id, code: room.code, existing: false };
}

export async function listOpenRooms() {
  const sb = getServiceClient();
  const rooms = must(await sb.from('rooms').select(ROOM_COLS).eq('status', 'open').order('created_at', { ascending: false }).limit(20), 'open rooms');
  if (!rooms.length) return { rooms: [] };
  const ids = rooms.map(r => r.id);
  const players = must(await sb.from('room_players').select('room_id, user_id, left_at').in('room_id', ids), 'room players');
  const hosts = must(await sb.from('users').select('id, nickname, avatar_emoji').in('id', rooms.map(r => r.host_id)), 'room hosts');
  const hmap = new Map(hosts.map(u => [u.id, u]));
  return {
    rooms: rooms.map(r => ({
      id: r.id, code: r.code, name: r.name, status: r.status, courts: r.courts || [],
      created_at: r.created_at, host_id: r.host_id,
      host: hmap.get(r.host_id) ? { nickname: hmap.get(r.host_id).nickname, avatar_emoji: hmap.get(r.host_id).avatar_emoji } : null,
      players: players.filter(p => p.room_id === r.id && !p.left_at).length,
    })),
  };
}

export async function findRoomByCode(code) {
  const sb = getServiceClient();
  const rows = must(await sb.from('rooms').select('id, status').eq('code', code).limit(1), 'find code');
  if (!rows[0]) throw new HttpError('no session with that code', 404);
  return { roomId: rows[0].id, status: rows[0].status };
}

async function roomMembers(sb, roomId) {
  return must(await sb.from('room_players').select(ROOM_PLAYER_COLS).eq('room_id', roomId), 'room members');
}

export async function roomState(roomId, viewerId) {
  const sb = getServiceClient();
  const room = await roomRow(sb, roomId);
  const members = await roomMembers(sb, roomId);
  const active = members.filter(m => !m.left_at);

  const { users, normMatches } = await loadCore();
  const umap = userMapOf(users);
  const standAll = runElo(users, normMatches);

  // Everyone who was ever in the room, so a player who leaves mid-round still
  // renders with a name on the court card. `left` lets the UI show the roster.
  const players = members.map(m => {
    const u = umap.get(m.user_id) || {};
    const s = standAll.get(m.user_id);
    return {
      id: m.user_id, nickname: u.nickname || '—', avatar_emoji: u.avatar_emoji || '🏸',
      avatar_color: u.avatar_color || '#57b947',
      elo: s ? Math.round(s.elo) : 1500,
      rounds_played: m.rounds_played, rounds_rested: m.rounds_rested,
      joined_at: m.joined_at, left: !!m.left_at,
    };
  }).sort((a, b) => b.elo - a.elo);

  const rounds = must(await sb.from('room_rounds')
    .select('id, round_no, mode, courts_json, resting_ids, created_at')
    .eq('room_id', roomId).order('round_no', { ascending: false }).limit(25), 'room rounds');

  const nickOf = (id) => (umap.get(id) || {}).nickname || '—';
  const standings = sessionStandings(rounds).map(s => {
    const u = umap.get(s.id) || {};
    return { ...s, nickname: u.nickname || '—', avatar_emoji: u.avatar_emoji || '🏸', avatar_color: u.avatar_color || '#57b947' };
  });

  return {
    room: {
      id: room.id, code: room.code, name: room.name, status: room.status,
      courts: cleanCourts(room.courts || []), host_id: room.host_id,
      host: nickOf(room.host_id), created_at: room.created_at, closed_at: room.closed_at,
    },
    isHost: room.host_id === viewerId,
    isMember: active.some(m => m.user_id === viewerId),
    players,
    round: rounds[0] || null,
    history: rounds.slice(1, 10),
    standings,
    mvp: standings.length && standings[0].wins > 0 ? standings[0] : null,
  };
}

export async function joinRoom(roomId, userId) {
  const sb = getServiceClient();
  const room = await roomRow(sb, roomId);
  assertOpen(room);
  const existing = must(await sb.from('room_players').select('id, left_at').eq('room_id', roomId).eq('user_id', userId).limit(1), 'join check');
  if (existing[0]) {
    if (existing[0].left_at) must(await sb.from('room_players').update({ left_at: null }).eq('id', existing[0].id), 'rejoin');
  } else {
    must(await sb.from('room_players').insert({ room_id: roomId, user_id: userId }), 'join room');
  }
  return roomState(roomId, userId);
}

export async function leaveRoom(roomId, userId) {
  const sb = getServiceClient();
  must(await sb.from('room_players').update({ left_at: new Date().toISOString() })
    .eq('room_id', roomId).eq('user_id', userId), 'leave room');
  return { ok: true };
}

export async function setRoomCourts(roomId, hostId, courts) {
  const sb = getServiceClient();
  const room = await roomRow(sb, roomId);
  assertHost(room, hostId); assertOpen(room);
  const clean = cleanCourts(courts);
  must(await sb.from('rooms').update({ courts: clean }).eq('id', roomId), 'set courts');
  return roomState(roomId, hostId);
}

export async function drawRoomRound(roomId, hostId, mode) {
  const sb = getServiceClient();
  const room = await roomRow(sb, roomId);
  assertHost(room, hostId); assertOpen(room);

  const members = (await roomMembers(sb, roomId)).filter(m => !m.left_at);
  if (members.length < PER_SINGLES) throw new HttpError('need at least 2 players in the session', 400);
  const courts = cleanCourts(room.courts || []);
  if (!courts.length) throw new HttpError('turn on at least one court first', 400);

  const { users, normMatches } = await loadCore();
  const standAll = runElo(users, normMatches);
  const input = members.map(m => ({
    id: m.user_id,
    elo: standAll.get(m.user_id) ? standAll.get(m.user_id).elo : 1500,
    rounds_played: m.rounds_played, rounds_rested: m.rounds_rested,
  }));

  const draw = drawRound({ players: input, courts, mode, seed: Date.now() });
  if (!draw.courts.length) throw new HttpError('not enough players for a game', 400);

  const last = must(await sb.from('room_rounds').select('round_no').eq('room_id', roomId).order('round_no', { ascending: false }).limit(1), 'last round');
  const roundNo = (last[0] ? last[0].round_no : 0) + 1;

  must(await sb.from('room_rounds').insert({
    room_id: roomId, round_no: roundNo, mode: draw.mode,
    courts_json: draw.courts, resting_ids: draw.resting,
  }), 'insert round');

  // Bench fairness counters: playing resets the rest streak, sitting adds to it.
  const onCourt = new Set(draw.courts.flatMap(c => [...c.teamA, ...c.teamB]));
  const rows = members.map(m => ({
    id: m.id, room_id: m.room_id, user_id: m.user_id,
    rounds_played: m.rounds_played + (onCourt.has(m.user_id) ? 1 : 0),
    rounds_rested: onCourt.has(m.user_id) ? 0 : m.rounds_rested + 1,
  }));
  // ponytail: one upsert for the whole roster; a club session is <40 players.
  must(await sb.from('room_players').upsert(rows, { onConflict: 'id' }), 'update counters');

  return roomState(roomId, hostId);
}

export async function reportCourtResult(roomId, userId, roundId, court, games) {
  const sb = getServiceClient();
  const room = await roomRow(sb, roomId);
  assertOpen(room);

  const rows = must(await sb.from('room_rounds').select('id, room_id, round_no, courts_json').eq('id', roundId).limit(1), 'round lookup');
  const round = rows[0];
  if (!round || round.room_id !== roomId) throw new HttpError('round not found', 404);

  const list = Array.isArray(round.courts_json) ? round.courts_json : [];
  const idx = list.findIndex(c => Number(c.court) === Number(court));
  if (idx < 0) throw new HttpError('court not in this round', 404);
  const entry = list[idx];
  if (entry.matchId) throw new HttpError('this court is already reported', 400);

  const onCourt = [...(entry.teamA || []), ...(entry.teamB || [])];
  if (room.host_id !== userId && !onCourt.includes(userId)) {
    throw new HttpError('only the host or a player on that court can report it', 403);
  }

  const { matchId } = await logMatch({
    format: entry.format === 'singles' ? 'singles' : 'doubles',
    teamA: entry.teamA, teamB: entry.teamB, games,
    played_at: null, location: room.name || ('Court ' + entry.court),
  }, userId);

  let wonA = 0, wonB = 0, ptsA = 0, ptsB = 0;
  for (const g of games) {
    ptsA += g.score_a; ptsB += g.score_b;
    if (g.score_a > g.score_b) wonA++; else wonB++;
  }
  list[idx] = {
    ...entry, matchId, scoreA: ptsA, scoreB: ptsB,
    gamesA: wonA, gamesB: wonB, winner: wonA > wonB ? 'A' : 'B',
    reported_by: userId, reported_at: new Date().toISOString(),
  };
  must(await sb.from('room_rounds').update({ courts_json: list }).eq('id', roundId), 'save result');

  return roomState(roomId, userId);
}

export async function closeRoom(roomId, hostId) {
  const sb = getServiceClient();
  const room = await roomRow(sb, roomId);
  assertHost(room, hostId);
  must(await sb.from('rooms').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', roomId), 'close room');
  return roomState(roomId, hostId);
}

// ---------------------------------------------------------------------------
// HEAD TO HEAD ? the complete record between two players
// ---------------------------------------------------------------------------
export async function headToHead(viewerId, otherId) {
  if (viewerId === otherId) throw new HttpError('pick a different player', 400);
  const { users, normMatches } = await loadCore();
  const them = userMapOf(users).get(otherId);
  if (!them) throw new HttpError('player not found', 404);

  const sideOf = (m, id) => (m.teamA.includes(id) ? 'A' : (m.teamB.includes(id) ? 'B' : null));
  const versus = { played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
  const together = { played: 0, wins: 0 };
  const meetings = [];

  for (const m of normMatches) {
    if (m.winner == null) continue;
    const mine = sideOf(m, viewerId);
    const theirs = sideOf(m, otherId);
    if (!mine || !theirs) continue;
    if (mine === theirs) {                       // same team that night
      together.played++;
      if (mine === m.winner) together.wins++;
      continue;
    }
    const won = mine === m.winner;
    const pf = mine === 'A' ? m.pointsA : m.pointsB;
    const pa = mine === 'A' ? m.pointsB : m.pointsA;
    versus.played++;
    versus.pointsFor += pf;
    versus.pointsAgainst += pa;
    if (won) versus.wins++; else versus.losses++;
    meetings.push({
      id: m.id,
      played_at: m.played_at.toISOString(),
      format: m.format,
      won,
      pointsFor: pf,
      pointsAgainst: pa,
      games: m.games.map(g => (mine === 'A' ? [g.a, g.b] : [g.b, g.a])),
    });
  }

  // newest first for display, but streaks have to read oldest -> newest
  meetings.sort((x, y) => new Date(y.played_at) - new Date(x.played_at));
  const chrono = meetings.slice().reverse();

  let bestStreak = 0, run = 0, current = 0;
  for (const g of chrono) {
    run = g.won ? run + 1 : 0;
    if (run > bestStreak) bestStreak = run;
  }
  // current streak: count back from the most recent meeting while the result holds
  if (meetings.length) {
    const dir = meetings[0].won;
    for (const g of meetings) { if (g.won !== dir) break; current++; }
    if (!dir) current = -current;               // negative = losing streak
  }

  const margin = (g) => g.pointsFor - g.pointsAgainst;
  const wins = meetings.filter(g => g.won);
  const losses = meetings.filter(g => !g.won);
  const biggestWin = wins.length ? wins.reduce((a, b) => (margin(b) > margin(a) ? b : a)) : null;
  const worstLoss = losses.length ? losses.reduce((a, b) => (margin(b) < margin(a) ? b : a)) : null;

  return {
    opponent: {
      id: them.id, nickname: them.nickname,
      avatar_emoji: them.avatar_emoji, avatar_color: them.avatar_color,
    },
    versus, together, bestStreak, currentStreak: current,
    biggestWin, worstLoss,
    meetings: meetings.slice(0, 20),
  };
}

// ---------------------------------------------------------------------------
// GUEST PLAYERS — people who play but haven't signed up yet.
// A guest is a real row (so matches, Elo, titles all work) that simply cannot
// log in. When the person joins for real they CLAIM the profile and keep every
// match; an admin approves the claim so nobody can steal someone's history.
// ---------------------------------------------------------------------------
export async function createGuest(adminId, nickname, avatar_emoji, avatar_color) {
  const sb = getServiceClient();
  const dupe = must(await sb.from('users').select('id').ilike('nickname', nickname).limit(1), 'guest dupe');
  if (dupe.length) throw new HttpError('somebody already uses that name', 409);
  // employee_no is NOT NULL + unique, and password_hash is NOT NULL, so a guest
  // gets a synthetic number and a hash no password can ever produce.
  const rows = must(await sb.from('users').insert({
    employee_no: 'guest-' + newSessionToken().slice(0, 12),
    nickname,
    password_hash: 'guest$no-login',
    avatar_emoji,
    avatar_color,
    is_guest: true,
  }).select(PUBLIC_USER_COLS + ', is_guest'), 'create guest');
  const guest = rows[0];
  await logAudit(adminId, 'guest.create', 'user', guest.id, null, { nickname });
  invalidateCore();
  return { guest: displayUser(guest) };
}

// Unclaimed guests, for the "someone already added you?" picker on sign-in.
export async function listGuests() {
  const sb = getServiceClient();
  const rows = must(await sb.from('users')
    .select('id, nickname, avatar_emoji, avatar_color, claim_state')
    .eq('is_guest', true).order('nickname'), 'list guests');
  return { guests: rows.map(g => ({ ...displayUser(g), pending: g.claim_state === 'pending' })) };
}

export async function requestClaim(userId, guestId) {
  const sb = getServiceClient();
  const g = must(await sb.from('users').select('id, nickname, is_guest, claim_state').eq('id', guestId).limit(1), 'claim guest');
  if (!g.length || !g[0].is_guest) throw new HttpError('that profile cannot be claimed', 400);
  if (g[0].claim_state === 'pending') throw new HttpError('somebody already asked for this profile', 409);
  const me = must(await sb.from('users').select('id, is_guest').eq('id', userId).limit(1), 'claimer');
  if (!me.length || me[0].is_guest) throw new HttpError('guests cannot claim', 400);
  must(await sb.from('users').update({ claim_state: 'pending', claim_by: userId }).eq('id', guestId), 'request claim');
  await logAudit(userId, 'claim.request', 'user', guestId, null, { guest: g[0].nickname });
  return { ok: true, pending: true };
}

export async function listClaims() {
  const sb = getServiceClient();
  const rows = must(await sb.from('users')
    .select('id, nickname, avatar_emoji, avatar_color, claim_by')
    .eq('is_guest', true).eq('claim_state', 'pending'), 'list claims');
  if (!rows.length) return { claims: [] };
  // A self-referencing embed (users -> users) isn't resolvable through
  // PostgREST here, so look the claimers up in one extra bounded query.
  const ids = [...new Set(rows.map(r => r.claim_by).filter(Boolean))];
  const people = ids.length
    ? must(await sb.from('users').select('id, nickname, avatar_emoji, avatar_color').in('id', ids), 'claimers')
    : [];
  const pmap = userMapOf(people);
  return {
    claims: rows.map(r => ({
      guest: displayUser(r),
      claimer: r.claim_by ? displayUser(pmap.get(r.claim_by)) : null,
    })),
  };
}

export async function resolveClaim(adminId, guestId, action) {
  const sb = getServiceClient();
  const rows = must(await sb.from('users').select('id, nickname, is_guest, claim_state, claim_by').eq('id', guestId).limit(1), 'claim row');
  const g = rows[0];
  if (!g || !g.is_guest || g.claim_state !== 'pending') throw new HttpError('no pending claim', 404);

  if (action === 'reject') {
    must(await sb.from('users').update({ claim_state: null, claim_by: null }).eq('id', guestId), 'reject claim');
    await logAudit(adminId, 'claim.reject', 'user', guestId, null, { guest: g.nickname });
    return { ok: true, merged: false };
  }
  // One statement, one transaction: match_players is ON DELETE CASCADE, so the
  // rows MUST be repointed before the guest row disappears.
  const { error } = await sb.rpc('claim_guest', { p_guest: guestId, p_claimer: g.claim_by });
  if (error) throw new HttpError(error.message || 'merge failed', 400);
  await logAudit(adminId, 'claim.approve', 'user', g.claim_by, null, { guest: g.nickname });
  invalidateCore();
  await recomputeAndPersist();
  return { ok: true, merged: true };
}

export async function adminDeleteGuest(adminId, guestId) {
  const sb = getServiceClient();
  const rows = must(await sb.from('users').select('id, nickname, is_guest').eq('id', guestId).limit(1), 'guest row');
  if (!rows.length || !rows[0].is_guest) throw new HttpError('not a guest', 400);
  const played = must(await sb.from('match_players').select('match_id').eq('user_id', guestId).limit(1), 'guest matches');
  if (played.length) throw new HttpError('this guest has matches — merge them instead of deleting', 409);
  must(await sb.from('users').delete().eq('id', guestId), 'delete guest');
  await logAudit(adminId, 'guest.delete', 'user', guestId, { nickname: rows[0].nickname }, null);
  invalidateCore();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// LEVELS, COINS AND THE ARCADE
// Levels are DERIVED from match history (lib/level.js), so they can never drift
// from reality. Coins are minted once per level crossed — tracked by a
// watermark (wallets.level_paid) so a recompute can never pay twice.
// ---------------------------------------------------------------------------
export async function walletOf(userId) {
  const sb = getServiceClient();
  const { users, normMatches } = await loadCore();
  const model = buildModel(users, normMatches);
  const lvl = levelOf(model, userId);
  const boost = await loadoutStats(sb, userId);

  // Gear and charms speed the loop up; they never rewrite history. XP Boost
  // lifts the derived total (so levels arrive sooner AND coins follow) and Coin
  // Find lifts the exchange rate. Both feed one absolute target, which the RPC
  // below tops up monotonically — so toggling a charm can never mint anything.
  const boosted = Math.floor(lvl.xp * multiplier(boost.xp));
  const eff = boosted > lvl.xp ? { ...levelFor(boosted), breakdown: lvl.breakdown, activeDays: lvl.activeDays } : lvl;
  const target = Math.floor(coinsForXp(boosted) * multiplier(boost.coin));

  let coins;
  const claim = await sb.rpc('wallet_sync_earned', { p_user: userId, p_target: target });
  if (!claim.error) {
    coins = Number(claim.data);
  } else {
    const rows = must(await sb.from('wallets').select('coins').eq('user_id', userId).limit(1), 'wallet');
    coins = rows.length ? Number(rows[0].coins) : 0;
  }
  return {
    coins, level: eff, boost, baseXp: lvl.xp,
    coinsPerXp: COINS_PER_XP, coinsPerLevel: COINS_PER_LEVEL, earned: target,
  };
}

// ---------------------------------------------------------------------------
// THE BLACKSMITH GOOSE — gear (+0..+9) and charms.
//
// SECURITY MODEL, in one place so it cannot drift:
//  * Every random roll uses node:crypto, on the server. The client sends a slot
//    name and nothing else — never a level, a tier, a stat or an outcome.
//  * Coins are taken through wallet_apply, which is atomic and refuses to go
//    negative, so it is the affordability check and the charge in one call.
//  * Writes are conditional on the state we rolled against, so two taps racing
//    each other can never apply the same upgrade twice. A lost race is refunded.
//  * NOTHING here reads or writes Elo, rank, titles or match results.
// ---------------------------------------------------------------------------

// Uniform float in [0,1) from the CSPRNG — the arcade's own seeded RNG is fine
// for a slot reel, but real money-equivalent odds should not be predictable.
function secureRandom() {
  return webcrypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}

const rowToItem = (r) => ({
  slot: r.slot, element: r.element || 'wood', stage: r.tier || 'base',
  level: r.level, wink: r.wink, skin: r.skin || 'none',
  subs: Array.isArray(r.subs) ? r.subs : [],
  fails: r.fails | 0,
});

async function gearRows(sb, userId) {
  return must(await sb.from('player_gear').select('slot,tier,element,level,wink,skin,subs,fails').eq('user_id', userId), 'gear');
}
async function charmRows(sb, userId) {
  return must(await sb.from('player_charms').select('charm_key,gilded,slot').eq('user_id', userId), 'charms');
}
async function skinRows(sb, userId) {
  return must(await sb.from('player_skins').select('skin_key').eq('user_id', userId), 'skins');
}
async function elementRows(sb, userId) {
  return must(await sb.from('player_elements').select('element_key').eq('user_id', userId), 'elements');
}
// The five unbuyable eggs a player is holding. Zero rows means zero eggs.
async function bossEggRows(sb, userId) {
  const rows = must(await sb.from('player_eggs').select('egg_key,qty').eq('user_id', userId), 'eggs');
  const out = {};
  for (const r of rows) if (Number(r.qty) > 0) out[r.egg_key] = Number(r.qty);
  return out;
}
async function stoneCount(sb, userId, key = 'bless') {
  const rows = must(await sb.from('player_consumables').select('qty').eq('user_id', userId).eq('item_key', key).limit(1), 'stones');
  return rows.length ? Number(rows[0].qty) : 0;
}
async function stoneBag(sb, userId) {
  const rows = must(await sb.from('player_consumables').select('item_key,qty').eq('user_id', userId), 'stones');
  const bag = Object.fromEntries(STONE_KEYS.map(k => [k, 0]));
  for (const r of rows) if (Object.hasOwn(bag, r.item_key)) bag[r.item_key] = Number(r.qty);
  return bag;
}
async function grantStone(sb, userId, key = 'bless', n = 1) {
  const cur = await stoneCount(sb, userId, key);
  if (cur > 0) must(await sb.from('player_consumables').update({ qty: cur + n }).eq('user_id', userId).eq('item_key', key), 'stone grant');
  else {
    const ins = await sb.from('player_consumables').insert({ user_id: userId, item_key: key, qty: n });
    // lost the insert race — the row exists now, so top it up instead
    if (ins.error) must(await sb.from('player_consumables').update({ qty: (await stoneCount(sb, userId, key)) + n }).eq('user_id', userId).eq('item_key', key), 'stone grant retry');
  }
  return cur + n;
}

// The ONLY function the rest of the app should use to ask "what are this
// player's bonuses". Everything is clamped inside forge.js/charms.js, so even a
// hand-edited database row cannot mint a fortune.
export async function loadoutStats(sb, userId) {
  const [gear, charms] = await Promise.all([gearRows(sb, userId), charmRows(sb, userId)]);
  const items = gear.map(rowToItem).map(x => ({ ...x, owned: true }));
  const g = totalStats(items);
  const ch = equippedStats(charms.filter(r => r.slot != null).map(r => ({ key: r.charm_key, gilded: r.gilded })));
  const sets = setBonuses(items);
  const add = (k) => Math.round(((g[k] || 0) + (ch[k] || 0) + (sets.stats[k] || 0)) * 100) / 100;
  return { coin: add('coin'), xp: add('xp'), luck: add('luck'), save: add('save'), setPerks: sets.perks };
}

const cleanSlot = (s) => {
  if (!SLOT_KEYS.includes(s)) throw new HttpError('unknown slot', 400);
  return s;
};

// Everything the forge screen needs, in one trip.
export async function forgeState(userId) {
  const sb = getServiceClient();
  const [walletRows, gear, charms, skins, stones, elems] = await Promise.all([
    sb.from('wallets').select('coins').eq('user_id', userId).limit(1),
    gearRows(sb, userId),
    charmRows(sb, userId),
    skinRows(sb, userId),
    stoneBag(sb, userId),
    elementRows(sb, userId),
  ]);
  const wRows = must(walletRows, 'wallet');
  const coins = wRows.length ? Number(wRows[0].coins) : 0;
  const owned = new Map(gear.map(r => [r.slot, rowToItem(r)]));
  const stats = await loadoutStats(sb, userId);
  const haveSkins = new Set(['none', ...skins.map(r => r.skin_key)]);
  const haveElems = new Set(elems.map(r => r.element_key));

  const items = SLOTS.map(sl => {
    const it = owned.get(sl.key) || null;
    if (!it) return { slot: sl.key, owned: false };
    const st = STAGE_BY_KEY[it.stage] || STAGES[0];
    const nx = nextStage(it);
    return {
      slot: sl.key, owned: true, element: it.element, elementFx: elementFx(it.element),
      elementName: (ELEMENT_BY_KEY[it.element] || {}).name || it.element,
      stage: it.stage, stageName: st.name, stageIcon: st.icon,
      level: it.level, wink: it.wink, max: MAX_LEVEL, capped: atCeiling(it),
      subs: (it.subs || []).map(s => ({ ...s, fx: gradeFx(s.grade) })),
      sockets: slotsFor(it), freeSockets: freeSlots(it), canBless: canBless(it),
      skin: it.skin, fx: (SKIN_BY_KEY[it.skin] || SKIN_BY_KEY.none).fx,
      cost: forgeCost(it),
      odds: Math.round(successChance(it, stats.luck, it.fails) * 1000) / 10,
      baseOdds: Math.round(successChance(it, stats.luck, 0) * 1000) / 10,
      fails: it.fails | 0,
      pity: Math.round((successChance(it, stats.luck, it.fails) - successChance(it, stats.luck, 0)) * 1000) / 10,
      winkOdds: Math.round(winkChance(it, stats.luck) * 1000) / 10,
      nextBonus: LEVEL_BONUS[Math.min(MAX_LEVEL, it.level + 1)] * stageMult(it),
      bonus: LEVEL_BONUS[it.level] * (it.wink ? WINK_MULT : 1) * stageMult(it),
      aura: stageAura(it), stageMult: stageMult(it),
      canEvolve: canEvolve(it), evolveCost: evolveCost(it),
      evolveStone: evolveStone(it),
      evolveStoneName: evolveStone(it) ? STONE_BY_KEY[evolveStone(it)].name : null,
      evolveStoneIcon: evolveStone(it) ? STONE_BY_KEY[evolveStone(it)].icon : null,
      haveEvolveStone: evolveStone(it) ? (stones[evolveStone(it)] || 0) : 0,
      nextStageName: nx ? nx.name : null, nextSockets: nx ? nx.slots : st.slots,
      nextMult: nx ? nx.mult : st.mult,
      dropRisk: it.level >= 6,
    };
  });

  const held = new Map(charms.map(r => [r.charm_key, r]));
  return {
    coins, items, stats, stones,
    guaranteeStone: GUARANTEE_STONE,
    guaranteeHave: stones[GUARANTEE_STONE] || 0,
    bag: await bagState(sb, userId),
    pouches: POUCH_TIERS,
    eggs: await bossEggRows(sb, userId),
    maxBatch: MAX_BATCH,
    // Every item, flagged with whether you can actually use it. Locked
    // pouch-only ones still show their name so there is something to want.
    elements: ELEMENTS.map(e => ({ ...e, owned: haveElems.has(e.key) || e.source === 'shop', found: haveElems.has(e.key) })),
    elementsFound: haveElems.size, elementsTotal: ELEMENTS.length,
    skins: {
      owned: SKINS.filter(s => haveSkins.has(s.key)),
      total: SKINS.length,
      locked: SKINS.filter(s => !haveSkins.has(s.key)).map(s => ({ key: s.key, rarity: s.rarity })),
    },
    charms: {
      slots: CHARM_SLOTS, pouchPrice: POUCH_PRICE, total: CHARMS.length,
      owned: CHARMS.filter(x => held.has(x.key)).map(x => ({
        ...x, gilded: held.get(x.key).gilded, slot: held.get(x.key).slot,
        stats: charmStats({ key: x.key, gilded: held.get(x.key).gilded }),
      })),
      locked: CHARMS.filter(x => !held.has(x.key)).map(x => ({ key: x.key, rarity: x.rarity, source: x.source })),
    },
  };
}

// Fit an element into an empty slot. Shop elements are paid for here; found
// ones cost nothing because the pouch already charged you for the gamble.
export async function gearBuy(userId, slot, element) {
  const sb = getServiceClient();
  cleanSlot(slot);
  if (!Object.hasOwn(ELEMENT_BY_KEY, element)) throw new HttpError('unknown item', 400);
  // a Shuriken is a shuttle; it can never be fitted as shoes
  if (!fitsSlot(element, slot)) throw new HttpError('that item does not go in that slot', 400);
  const def = ELEMENT_BY_KEY[element];
  const existing = must(await sb.from('player_gear').select('slot,element').eq('user_id', userId).eq('slot', slot).limit(1), 'gear');

  // A found element must actually have been found. This is the whole reason
  // Hell and Dragon cannot be reached with coins.
  const ownedRow = must(await sb.from('player_elements').select('element_key').eq('user_id', userId).eq('element_key', element).limit(1), 'element');
  const alreadyOwn = ownedRow.length > 0;
  if (def.source !== 'shop' && !alreadyOwn) {
    throw new HttpError("you haven't found that item — it only drops from an egg or the Goose Trail", 400);
  }

  // Already wearing something in this slot? Then this is a SWAP, not a
  // purchase. Elements are a look and nothing else — they all hit exactly the
  // same — so swapping keeps every level, socket and blessing you have paid
  // for. Without this the slot locks forever after your first racket and the
  // other 19 are unreachable.
  if (existing.length) {
    if (existing[0].element === element) throw new HttpError('already equipped', 400);
    let coins = null;
    if (!alreadyOwn) {
      // a shop element you have never bought still has to be paid for once
      const paid = await sb.rpc('wallet_apply', { p_user: userId, p_delta: -def.price, p_reason: 'forge:buy:' + slot, p_meta: { slot, element } });
      if (paid.error) throw new HttpError('not enough coins', 400);
      coins = Number(paid.data);
      await sb.from('player_elements').insert({ user_id: userId, element_key: element });
    } else {
      const w = must(await sb.from('wallets').select('coins').eq('user_id', userId).limit(1), 'wallet');
      coins = w.length ? Number(w[0].coins) : 0;
    }
    const upd = await sb.from('player_gear').update({ element, updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('slot', slot).select('slot,tier,element,level,wink,skin,subs,fails');
    if (upd.error || !upd.data || !upd.data.length) throw new HttpError('could not swap that in', 400);
    return { ok: true, swap: true, slot, coins, item: rowToItem(upd.data[0]), price: alreadyOwn ? 0 : def.price };
  }

  const price = def.source === 'shop' && !alreadyOwn ? def.price : 0;
  let coins = null;
  if (price > 0) {
    const paid = await sb.rpc('wallet_apply', { p_user: userId, p_delta: -price, p_reason: 'forge:buy:' + slot, p_meta: { slot, element } });
    if (paid.error) throw new HttpError('not enough coins', 400);
    coins = Number(paid.data);
    // buying it also means you own it from now on
    await sb.from('player_elements').insert({ user_id: userId, element_key: element });
  } else {
    const w = must(await sb.from('wallets').select('coins').eq('user_id', userId).limit(1), 'wallet');
    coins = w.length ? Number(w[0].coins) : 0;
  }

  const item = blankItem(slot, element);
  const ins = await sb.from('player_gear').insert({ user_id: userId, slot, element, tier: 'base', level: 0, wink: false, subs: [] });
  if (ins.error) {
    if (price > 0) await sb.rpc('wallet_apply', { p_user: userId, p_delta: price, p_reason: 'forge:refund:' + slot, p_meta: { slot } });
    throw new HttpError('you already have one of those', 400);
  }
  return { ok: true, slot, coins, item, price };
}

// One swing of the hammer.
export async function gearForge(userId, slot, guarantee = false) {
  const sb = getServiceClient();
  cleanSlot(slot);
  const rows = must(await sb.from('player_gear').select('slot,tier,element,level,wink,skin,subs,fails').eq('user_id', userId).eq('slot', slot).limit(1), 'gear');
  if (!rows.length) throw new HttpError('buy one first', 400);
  const item = rowToItem(rows[0]);
  if (atCeiling(item)) throw new HttpError('already at +' + MAX_LEVEL + ' — evolve it instead', 400);

  const stats = await loadoutStats(sb, userId);
  const cost = forgeCost(item);

  // The guarantee: spend one Bless Stone and the swing simply cannot fail.
  // The stone is taken FIRST and atomically, so a failure downstream can never
  // hand it back for free.
  let usedStone = false;
  if (guarantee) {
    const spent = await sb.rpc('consume_item', { p_user: userId, p_key: GUARANTEE_STONE, p_n: 1 });
    if (spent.error || Number(spent.data) < 0) throw new HttpError('you have no ' + STONE_BY_KEY[GUARANTEE_STONE].name + ' to spend', 400);
    usedStone = true;
  }

  const paid = await sb.rpc('wallet_apply', { p_user: userId, p_delta: -cost, p_reason: 'forge:swing:' + slot, p_meta: { slot, from: item.level } });
  if (paid.error) {
    if (usedStone) await grantStone(sb, userId, GUARANTEE_STONE, 1);
    throw new HttpError('not enough coins', 400);
  }

  const res = forgeRoll(item, stats.luck, secureRandom, item.fails, usedStone);
  let saved = false;
  if (!res.ok && res.to < res.from && stats.save > 0 && secureRandom() < stats.save / 100) {
    saved = true; res.to = res.from; res.item.level = res.from;
  }

  // Pity is a consecutive-failure counter: it climbs on every failed swing
  // (a saved swing still failed) and resets the instant one lands.
  const newFails = res.ok ? 0 : (item.fails | 0) + 1;
  const upd = await sb.from('player_gear')
    .update({ level: res.item.level, wink: res.item.wink, fails: newFails, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('slot', slot).eq('level', item.level).eq('tier', item.stage).eq('fails', item.fails)
    .select('slot');
  if (upd.error || !upd.data || !upd.data.length) {
    await sb.rpc('wallet_apply', { p_user: userId, p_delta: cost, p_reason: 'forge:refund:' + slot, p_meta: { slot } });
    if (usedStone) await grantStone(sb, userId, GUARANTEE_STONE, 1);
    throw new HttpError('that item just changed — try again', 409);
  }

  // Exact Change: a failed swing gives the coins back.
  let coins = Number(paid.data), refunded = false;
  if (!res.ok) {
    const relics = (await relicRows(sb, userId)).filter(r => r.slot != null).map(r => r.relic_key);
    if (hasRelic(relics, 'exactchange') && cost > 0) {
      const back = await sb.rpc('wallet_apply', { p_user: userId, p_delta: cost, p_reason: 'relic:exactchange', p_meta: { slot } });
      if (!back.error) { coins = Number(back.data); refunded = true; }
    }
  }

  return {
    ok: res.ok, wink: res.wink, saved, refunded, guaranteed: usedStone,
    from: res.from, to: res.item.level, chance: Math.round(res.chance * 1000) / 10,
    pity: Math.round(res.pity * 1000) / 10, fails: newFails,
    cost, coins, item: { ...res.item, fails: newFails },
  };
}
// Evolve: ONLY at +9, and the whole point is that it opens a substat socket.
export async function gearEvolve(userId, slot) {
  const sb = getServiceClient();
  cleanSlot(slot);
  const rows = must(await sb.from('player_gear').select('slot,tier,element,level,wink,skin,subs,fails').eq('user_id', userId).eq('slot', slot).limit(1), 'gear');
  if (!rows.length) throw new HttpError('buy one first', 400);
  const item = rowToItem(rows[0]);
  if (item.level < MAX_LEVEL) throw new HttpError('forge it to +' + MAX_LEVEL + ' first', 400);
  if (!canEvolve(item)) throw new HttpError('this is already fully evolved', 400);

  const cost = evolveCost(item);
  const want = evolveStone(item);
  const stoneDef = STONE_BY_KEY[want];
  if (!stoneDef) throw new HttpError('this is already fully evolved', 400);

  // The stone this stage demands is taken FIRST and atomically, so a later
  // failure can never leave the player evolved without paying for it.
  const spent = await sb.rpc('consume_item', { p_user: userId, p_key: want, p_n: 1 });
  if (spent.error || Number(spent.data) < 0) {
    throw new HttpError('this evolution needs a ' + stoneDef.name + ' ' + stoneDef.icon + ' — find one on the Goose Trail or in an egg', 400);
  }

  const paid = await sb.rpc('wallet_apply', { p_user: userId, p_delta: -cost, p_reason: 'forge:evolve:' + slot, p_meta: { slot, from: item.stage } });
  if (paid.error) {
    await grantStone(sb, userId, want, 1);
    throw new HttpError('not enough coins', 400);
  }

  const stats = await loadoutStats(sb, userId);
  // A Wink can only ever happen here, and the stone fills the socket it opens.
  const { item: next, wink, sub } = evolveItem(item, stats.luck, secureRandom);
  const upd = await sb.from('player_gear')
    .update({ tier: next.stage, wink: next.wink, subs: next.subs, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('slot', slot).eq('tier', item.stage).eq('level', item.level)
    .select('slot');
  if (upd.error || !upd.data || !upd.data.length) {
    await sb.rpc('wallet_apply', { p_user: userId, p_delta: cost, p_reason: 'forge:refund:' + slot, p_meta: { slot } });
    await grantStone(sb, userId, want, 1);
    throw new HttpError('that item just changed — try again', 409);
  }
  return {
    ok: true, cost, coins: Number(paid.data), item: next, wink, sub,
    stone: want, stoneName: stoneDef.name, stoneIcon: stoneDef.icon,
    grade: sub ? sub.grade : null, sockets: slotsFor(next),
    stageName: (STAGE_BY_KEY[next.stage] || {}).name, aura: stageAura(next),
  };
}

// Spend one stone to REROLL one socket, at a grade rolled on THAT stone's
// odds. Evolving already filled every socket, so this is how you chase a
// better line. The stone is consumed atomically FIRST, so a failure can never
// duplicate it.
export async function gearBless(userId, slot, stone = 'bless', index = null) {
  const sb = getServiceClient();
  cleanSlot(slot);
  if (!Object.hasOwn(STONE_BY_KEY, stone)) throw new HttpError('unknown stone', 400);
  const rows = must(await sb.from('player_gear').select('slot,tier,element,level,wink,skin,subs,fails').eq('user_id', userId).eq('slot', slot).limit(1), 'gear');
  if (!rows.length) throw new HttpError('buy one first', 400);
  const item = rowToItem(rows[0]);
  if (!slotsFor(item)) throw new HttpError('evolve it first — that opens the socket', 400);
  const n = index === null || index === undefined ? (item.subs || []).length : Number(index);
  if (!Number.isInteger(n) || n < 0 || n >= slotsFor(item)) throw new HttpError('no such socket', 400);

  const spent = await sb.rpc('consume_item', { p_user: userId, p_key: stone, p_n: 1 });
  if (spent.error || Number(spent.data) < 0) {
    throw new HttpError(`you have no ${STONE_BY_KEY[stone].name}s — find them in Goose Eggs or on the Goose Trail`, 400);
  }

  const res = blessRoll(item, secureRandom, stone, n);
  // Coach's Whistle: your FIRST blessing each Bangkok day is Super or better.
  // Recorded in the ledger so retrying cannot re-trigger it.
  const relics = (await relicRows(sb, userId)).filter(r => r.slot != null).sort((a, b) => a.slot - b.slot).map(r => r.relic_key);
  if (hasRelic(relics, 'whistle') && res.grade === 'normal') {
    const dayStart = new Date(Math.floor((Date.now() + 7 * 3600000) / 86400000) * 86400000 - 7 * 3600000).toISOString();
    const today = must(await sb.from('coin_ledger').select('id').eq('user_id', userId).eq('reason', 'relic:whistle').gte('created_at', dayStart).limit(1), 'whistle');
    if (!today.length) {
      res.grade = 'super';
      res.sub = { ...res.sub, grade: 'super', val: Math.round(res.sub.val * 1.5 * 100) / 100 };
      res.item.subs[n] = res.sub;
      await sb.rpc('wallet_apply', { p_user: userId, p_delta: 0, p_reason: 'relic:whistle', p_meta: { slot } });
      res.whistle = true;
    }
  }
  const upd = await sb.from('player_gear')
    .update({ subs: res.item.subs, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('slot', slot).eq('tier', item.stage)
    .select('slot');
  if (upd.error || !upd.data || !upd.data.length) {
    await grantStone(sb, userId, stone, 1);          // give the stone back
    throw new HttpError('that item just changed — try again', 409);
  }
  return {
    ok: true, grade: res.grade, stone, sub: { ...res.sub, fx: gradeFx(res.grade) },
    stones: await stoneBag(sb, userId), item: res.item,
    sockets: slotsFor(res.item), free: freeSlots(res.item),
  };
}

// Open a Goose Egg of the given kind. The pull happens here and only here.
export async function charmPull(userId, tierKey = 'golden') {
  const sb = getServiceClient();
  const tier = POUCH_TIER_BY_KEY[tierKey];
  if (!tier) throw new HttpError('unknown egg', 400);

  const [ownedSkins, ownedElems, bag] = await Promise.all([skinRows(sb, userId), elementRows(sb, userId), bagState(sb, userId)]);
  const haveSkins = new Set(ownedSkins.map(r => r.skin_key));
  const haveElems = new Set(ownedElems.map(r => r.element_key));
  const skinPool = SKIN_POOL.filter(s => !haveSkins.has(s.key));
  // a full bag simply cannot receive another item — it rolls something else
  const elementPool = bag.full ? [] : POUCH_ELEMENTS.filter(e => !haveElems.has(e.key));

  // Two ways to pay, and only two. A shop egg costs coins. A boss egg is spent
  // from the inventory it was dropped into — it can never be bought, because
  // its odds are far too good.
  let coins;
  if (tier.source === 'shop') {
    const paid = await sb.rpc('wallet_apply', { p_user: userId, p_delta: -tier.price, p_reason: 'charm:pouch:' + tier.key, p_meta: { tier: tier.key } });
    if (paid.error) throw new HttpError('not enough coins', 400);
    coins = Number(paid.data);
  } else {
    const spent = await sb.rpc('spend_boss_egg', { p_user: userId, p_egg: tier.key, p_n: 1 });
    if (spent.error || Number(spent.data) < 0) throw new HttpError('you have no ' + tier.name + ' — beat a boss on the Goose Trail', 400);
    const w = must(await sb.from('wallets').select('coins').eq('user_id', userId).limit(1), 'wallet');
    coins = w.length ? Number(w[0].coins) : 0;
  }

  const prize = pullPrize(secureRandom, { skinPool, elementPool, tier });

  if (prize.kind === 'element') {
    const ins = await sb.from('player_elements').insert({ user_id: userId, element_key: prize.key });
    if (ins.error) {
      const refund = Math.min(RARITY[prize.rarity].dust, tier.price - 1);
      const back = await sb.rpc('wallet_apply', { p_user: userId, p_delta: refund, p_reason: 'element:dust:' + prize.key, p_meta: null });
      return { kind: 'dust', prize: 'element', key: prize.key, refund, coins: back.error ? coins : Number(back.data), def: ELEMENT_BY_KEY[prize.key], tier: tier.key };
    }
    return { kind: 'new', prize: 'element', key: prize.key, rarity: prize.rarity, coins, def: ELEMENT_BY_KEY[prize.key], tier: tier.key };
  }

  if (prize.kind === 'stone') {
    // the dearer egg hands out better stones
    const stone = tier.key === 'diamond' ? (secureRandom() < 0.5 ? 'divine' : 'sacred')
      : (secureRandom() < 0.5 ? 'sacred' : 'bless');
    const qty = await grantStone(sb, userId, stone, 1);
    return { kind: 'new', prize: 'stone', key: stone, rarity: STONE_BY_KEY[stone].rarity, coins, stones: qty,
      def: STONE_BY_KEY[stone], tier: tier.key };
  }

  if (prize.kind === 'skin') {
    const ins = await sb.from('player_skins').insert({ user_id: userId, skin_key: prize.key });
    if (ins.error) {
      const refund = Math.min(RARITY[prize.rarity].dust, tier.price - 1);
      const back = await sb.rpc('wallet_apply', { p_user: userId, p_delta: refund, p_reason: 'skin:dust:' + prize.key, p_meta: null });
      return { kind: 'dust', prize: 'skin', key: prize.key, refund, coins: back.error ? coins : Number(back.data), def: SKIN_BY_KEY[prize.key], tier: tier.key };
    }
    return { kind: 'new', prize: 'skin', key: prize.key, rarity: prize.rarity, coins, def: SKIN_BY_KEY[prize.key], tier: tier.key };
  }

  const have = must(await sb.from('player_charms').select('charm_key,gilded,slot').eq('user_id', userId).eq('charm_key', prize.key).limit(1), 'charm');
  const res = resolvePull(prize, have.length ? { key: prize.key, gilded: have[0].gilded } : null);

  if (res.kind === 'new') {
    const ins = await sb.from('player_charms').insert({ user_id: userId, charm_key: prize.key, gilded: prize.gilded, slot: null });
    if (ins.error) return { ...(await dustFallback(sb, userId, prize, coins)), prize: 'charm', def: CHARM_BY_KEY[prize.key], tier: tier.key };
  } else if (res.kind === 'gild') {
    must(await sb.from('player_charms').update({ gilded: true }).eq('user_id', userId).eq('charm_key', prize.key), 'gild');
  } else {
    const back = await sb.rpc('wallet_apply', { p_user: userId, p_delta: res.coins, p_reason: 'charm:dust:' + prize.key, p_meta: null });
    if (!back.error) coins = Number(back.data);
  }
  return { kind: res.kind, prize: 'charm', key: prize.key, gilded: res.gilded, refund: res.coins, coins, def: CHARM_BY_KEY[prize.key], tier: tier.key };
}

// Crack several eggs in one go. Sequential on purpose: each pull has to see the
// result of the one before it, or ten pulls could all hand you the same "new"
// charm and each of them would look new. Cost is charged per pull, so running
// out halfway simply stops — you are never billed for an egg you did not open.
export async function charmPullBatch(userId, tierKey = 'golden', n = 1) {
  const count = Math.max(1, Math.min(MAX_BATCH, Math.round(Number(n) || 1)));
  const results = [];
  let stopped = null;
  for (let i = 0; i < count; i++) {
    try {
      results.push(await charmPull(userId, tierKey));
    } catch (e) {
      // The first pull failing is a real error worth showing. A later one
      // failing just means the coins or the eggs ran out mid-batch.
      if (!results.length) throw e;
      stopped = e.message;
      break;
    }
  }
  const last = results[results.length - 1];
  return { batch: true, tier: tierKey, asked: count, opened: results.length, stopped, results, coins: last ? last.coins : 0 };
}

// Repaint a piece of gear with a skin you have actually found.
export async function gearSkin(userId, slot, skin) {
  const sb = getServiceClient();
  cleanSlot(slot);
  if (!Object.hasOwn(SKIN_BY_KEY, skin)) throw new HttpError('unknown skin', 400);
  if (skin !== 'none') {
    const owned = must(await sb.from('player_skins').select('skin_key').eq('user_id', userId).eq('skin_key', skin).limit(1), 'skin');
    if (!owned.length) throw new HttpError("you haven't found that skin", 400);
  }
  const upd = await sb.from('player_gear').update({ skin, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('slot', slot).select('slot');
  if (upd.error || !upd.data || !upd.data.length) throw new HttpError('buy one first', 400);
  return { ok: true, slot, skin, fx: SKIN_BY_KEY[skin].fx };
}
async function dustFallback(sb, userId, pull, coins) {
  const refund = Math.min(RARITY[CHARM_BY_KEY[pull.key].rarity].dust, POUCH_PRICE - 1);
  const back = await sb.rpc('wallet_apply', { p_user: userId, p_delta: refund, p_reason: 'charm:dust:' + pull.key, p_meta: null });
  return { kind: 'dust', key: pull.key, gilded: true, refund, coins: back.error ? coins : Number(back.data) };
}

// Slot a charm in, or take it out. `slot` null means "back in the box".
export async function charmEquip(userId, key, slot) {
  const sb = getServiceClient();
  // hasOwn, not a truthy lookup: 'constructor' and '__proto__' pass the router
  // regex and would otherwise resolve through the prototype chain.
  if (!Object.hasOwn(CHARM_BY_KEY, key)) throw new HttpError('unknown charm', 400);
  const n = slot === null || slot === undefined ? null : Number(slot);
  if (n !== null && (!Number.isInteger(n) || n < 0 || n >= CHARM_SLOTS)) throw new HttpError('unknown slot', 400);

  const mine = must(await sb.from('player_charms').select('charm_key').eq('user_id', userId).eq('charm_key', key).limit(1), 'charm');
  if (!mine.length) throw new HttpError("you don't have that charm", 400);

  if (n !== null) {
    // clear whoever is sitting there first — the partial unique index would
    // otherwise reject the write
    must(await sb.from('player_charms').update({ slot: null }).eq('user_id', userId).eq('slot', n), 'charm slot clear');
  }
  must(await sb.from('player_charms').update({ slot: n }).eq('user_id', userId).eq('charm_key', key), 'charm equip');
  return { ok: true, key, slot: n, stats: await loadoutStats(sb, userId) };
}

// ---------------------------------------------------------------------------
// THE GOOSE TRAIL — stages, bosses, eggs and relics.
//
// Eggs are EARNED from match history (derived, monotonic, unforgeable) and
// SPENT through an atomic RPC, so the trail can only ever be fuelled by real
// badminton. Every roll is server-side. Nothing here touches Elo or rank.
// ---------------------------------------------------------------------------
async function relicRows(sb, userId) {
  return must(await sb.from('player_relics').select('relic_key,slot').eq('user_id', userId), 'relics');
}
async function campaignRow(sb, userId) {
  const rows = must(await sb.from('player_campaign').select('cleared,eggs_spent,runs,bag_level,bonus_eggs').eq('user_id', userId).limit(1), 'campaign');
  return rows.length ? rows[0] : { cleared: 0, eggs_spent: 0, runs: 0, bag_level: 0, bonus_eggs: 0 };
}
// Eggs a player HAS: two per match played, plus any admin grant. Derived, not
// stored, so it cannot be forged — the bonus is the one sanctioned exception
// and only the service key can write it.
const eggsFor = (row, played, relics) => eggsEarned(played, relics) + Math.max(0, Number(row.bonus_eggs || 0));
// Room left in the bag. Found items take a slot; the three shop items do not,
// because you can always re-buy those.
async function bagState(sb, userId) {
  const [row, elems] = await Promise.all([campaignRow(sb, userId), elementRows(sb, userId)]);
  const level = Number(row.bag_level || 0);
  const held = elems.length;
  return {
    level, held, capacity: bagCapacity(level), max: BAG_MAX,
    full: bagFull(level, held), upgradeCost: bagUpgradeCost(level), maxLevel: BAG_LEVELS,
  };
}

// Pay to enlarge the bag.
export async function bagUpgrade(userId) {
  const sb = getServiceClient();
  const bag = await bagState(sb, userId);
  if (bag.level >= BAG_LEVELS) throw new HttpError('your bag is already as big as it gets', 400);
  const cost = bagUpgradeCost(bag.level);
  const paid = await sb.rpc('wallet_apply', { p_user: userId, p_delta: -cost, p_reason: 'bag:upgrade', p_meta: { to: bag.level + 1 } });
  if (paid.error) throw new HttpError('not enough coins', 400);

  await sb.from('player_campaign').insert({ user_id: userId }).select('user_id');
  const upd = await sb.from('player_campaign').update({ bag_level: bag.level + 1, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('bag_level', bag.level).select('user_id');
  if (upd.error || !upd.data || !upd.data.length) {
    await sb.rpc('wallet_apply', { p_user: userId, p_delta: cost, p_reason: 'bag:refund', p_meta: null });
    throw new HttpError('that just changed — try again', 409);
  }
  return { ok: true, cost, coins: Number(paid.data), bag: await bagState(sb, userId) };
}
// How many matches this player has actually finished — the egg source.
async function matchesPlayed(userId) {
  const { users, normMatches } = await loadCore();
  const model = buildModel(users, normMatches);
  return model.matches.filter(m => m.winner != null && [...m.teamA, ...m.teamB].includes(userId)).length;
}

export async function trailState(userId) {
  const sb = getServiceClient();
  const [gear, charms, relics, row, played, walletRows, eggRows] = await Promise.all([
    gearRows(sb, userId), charmRows(sb, userId), relicRows(sb, userId),
    campaignRow(sb, userId), matchesPlayed(userId),
    sb.from('wallets').select('coins').eq('user_id', userId).limit(1),
    bossEggRows(sb, userId),
  ]);
  const items = gear.map(rowToItem).map(x => ({ ...x, owned: true }));
  const worn = charms.filter(r => r.slot != null).map(r => ({ gilded: r.gilded }));
  const equippedRelics = relics.filter(r => r.slot != null).sort((a, b) => a.slot - b.slot).map(r => r.relic_key);
  const sets = setBonuses(items);
  const power = powerOf({ items, charms: worn }) + sets.power;
  const combat = combatOf({ items, charms: worn, perks: sets.perks, power });

  const earned = eggsFor(row, played, equippedRelics);
  const eggs = Math.max(0, earned - Number(row.eggs_spent || 0));
  const cleared = Number(row.cleared || 0);
  const held = new Set(relics.map(r => r.relic_key));

  return {
    coins: must(walletRows, 'wallet').length ? Number(must(walletRows, 'wallet')[0].coins) : 0,
    power, combat, cleared, runs: Number(row.runs || 0),
    eggs, eggsEarned: earned, eggsSpent: Number(row.eggs_spent || 0), eggCost: EGG_COST, matches: played,
    bossEggs: eggRows,
    unlocked: unlockedUpTo(cleared),
    sets: setStatus(items),
    stages: TRAIL_STAGES.map(s => ({
      ...s,
      cleared: s.n <= cleared,
      locked: !canAttempt(s.n, cleared),
      odds: Math.round(winChance(power, s) * 1000) / 10,
      coins: stageCoins(s),
      eggDrop: BOSS_EGG_DROPS[s.n] || null,
      relic: relicForBoss(s.n) ? { ...relicForBoss(s.n), held: held.has(relicForBoss(s.n).key) } : null,
    })),
    relics: {
      slots: RELIC_SLOTS,
      owned: RELICS.filter(r => held.has(r.key)).map(r => ({
        ...r, slot: (relics.find(x => x.relic_key === r.key) || {}).slot ?? null,
      })),
      locked: RELICS.filter(r => !held.has(r.key)).map(r => ({ key: r.key, name: r.name, icon: r.icon, boss: r.boss, rarity: r.rarity, perk: r.perk })),
    },
  };
}

// Run one stage. Costs an egg whether you win or lose — that is the wager.
export async function trailRun(userId, n) {
  const sb = getServiceClient();
  const stageNo = Math.round(Number(n));
  if (!Number.isInteger(stageNo) || !STAGE_BY_N[stageNo]) throw new HttpError('unknown stage', 400);
  const stage = STAGE_BY_N[stageNo];

  const [gear, charms, relics, row, played] = await Promise.all([
    gearRows(sb, userId), charmRows(sb, userId), relicRows(sb, userId),
    campaignRow(sb, userId), matchesPlayed(userId),
  ]);
  const cleared = Number(row.cleared || 0);
  if (!canAttempt(stageNo, cleared)) throw new HttpError('clear the stage before it first', 400);

  const items = gear.map(rowToItem).map(x => ({ ...x, owned: true }));
  const worn = charms.filter(r => r.slot != null).map(r => ({ gilded: r.gilded }));
  const equippedRelics = relics.filter(r => r.slot != null).sort((a, b) => a.slot - b.slot).map(r => r.relic_key);
  const sets = setBonuses(items);
  const power = powerOf({ items, charms: worn }) + sets.power;
  const combat = combatOf({ items, charms: worn, perks: sets.perks, power });
  const earned = eggsFor(row, played, equippedRelics);

  // Atomic: refuses if the eggs are not there, so two taps cannot buy one egg twice.
  const spend = await sb.rpc('spend_egg', { p_user: userId, p_earned: earned, p_cost: EGG_COST });
  if (spend.error || Number(spend.data) < 0) {
    throw new HttpError('no Goose Eggs left — play a match to earn more', 400);
  }

  const chance = winChance(power, stage);
  const won = secureRandom() < chance;
  // Lifesteal hands the egg straight back, win or lose — that is what makes a
  // shuttle build worth having. It rolls on every run, not just wins.
  const drained = secureRandom() * 100 < combat.lifesteal;
  if (drained) {
    await sb.from('player_campaign')
      .update({ eggs_spent: Math.max(0, Number(spend.data) - EGG_COST), updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  }
  const eggsLeft = Math.max(0, earned - (drained ? Number(spend.data) - EGG_COST : Number(spend.data)));
  const out = {
    stage: stageNo, boss: stage.boss, won, chance: Math.round(chance * 1000) / 10,
    power, combat, crit: false, lifesteal: drained, drops: [], coins: 0, relic: null, egg: null, firstClear: false,
  };

  if (!won) {
    const consolation = loseCoins(stage);
    const r = await sb.rpc('wallet_apply', { p_user: userId, p_delta: consolation, p_reason: 'trail:lose:' + stageNo, p_meta: { stage: stageNo } });
    out.coins = consolation;
    out.balance = r.error ? null : Number(r.data);
    out.eggs = eggsLeft;
    return out;
  }

  // --- won ---
  let coins = stageCoins(stage);
  if (sets.perks.includes('brainrot')) coins = Math.round(coins * 1.25);   // The 67 set
  // Crit doubles the payout and buys another roll on the drop table.
  out.crit = secureRandom() * 100 < combat.crit;
  if (out.crit) coins *= 2;
  const pay = await sb.rpc('wallet_apply', { p_user: userId, p_delta: coins, p_reason: 'trail:win:' + stageNo, p_meta: { stage: stageNo } });
  out.coins = coins;
  out.balance = pay.error ? null : Number(pay.data);

  const extra = (hasRelic(equippedRelics, 'lanyard') ? 1 : 0) + (sets.perks.includes('gamble') ? 1 : 0) + (out.crit ? 1 : 0);
  const rolls = dropCount(stage, extra);
  for (let i = 0; i < rolls; i++) {
    const d = rollDrop(stage, secureRandom);
    const got = await grantDrop(sb, userId, d, stage);
    if (got) out.drops.push(got);
  }

  // The five unbuyable eggs live here and nowhere else. Rolled apart from the
  // drop table so it never eats a stone or an element.
  const eggKey = rollEgg(stage, secureRandom);
  if (eggKey) {
    const g = await sb.rpc('grant_boss_egg', { p_user: userId, p_egg: eggKey, p_n: 1 });
    if (!g.error) {
      const def = POUCH_TIER_BY_KEY[eggKey];
      out.egg = { key: eggKey, name: def ? def.name : eggKey, icon: def ? def.icon : '🥚', qty: Number(g.data) };
    }
  }

  if (stageNo > cleared) {
    out.firstClear = true;
    must(await sb.from('player_campaign').update({ cleared: stageNo, updated_at: new Date().toISOString() })
      .eq('user_id', userId).lt('cleared', stageNo), 'campaign advance');
    const relic = relicForBoss(stageNo);
    if (relic) {
      const ins = await sb.from('player_relics').insert({ user_id: userId, relic_key: relic.key, slot: null });
      if (!ins.error) out.relic = relic;
    }
  }
  out.eggs = eggsLeft;
  return out;
}

// Turn one rolled drop into a real thing the player owns.
async function grantDrop(sb, userId, drop, stage) {
  if (drop.kind === 'coins') {
    const amt = Math.round(stageCoins(stage) * 0.5);
    const r = await sb.rpc('wallet_apply', { p_user: userId, p_delta: amt, p_reason: 'trail:drop:coins', p_meta: null });
    return { kind: 'coins', name: 'Coin Pile', icon: '🪙', amount: amt, balance: r.error ? null : Number(r.data) };
  }
  if (drop.kind === 'stone') {
    const qty = await grantStone(sb, userId, drop.tier, 1);
    const def = STONE_BY_KEY[drop.tier];
    return { kind: 'stone', key: drop.tier, name: def.name, icon: def.icon, rarity: def.rarity, qty };
  }
  if (drop.kind === 'element') {
    const bag = await bagState(sb, userId);
    if (bag.full) return coinFallback(sb, userId, stage, 'bag full — upgrade it in your inventory');
    const owned = new Set((await elementRows(sb, userId)).map(r => r.element_key));
    const pool = POUCH_ELEMENTS.filter(e => e.rarity === drop.rarity && !owned.has(e.key));
    if (!pool.length) return coinFallback(sb, userId, stage, 'every item of that rarity already found');
    const pickd = pool[Math.floor(secureRandom() * pool.length) % pool.length];
    const ins = await sb.from('player_elements').insert({ user_id: userId, element_key: pickd.key });
    if (ins.error) return coinFallback(sb, userId, stage, 'duplicate');
    return { kind: 'element', key: pickd.key, name: pickd.name, icon: pickd.icon, rarity: pickd.rarity, slot: pickd.slot };
  }
  if (drop.kind === 'skin') {
    const owned = new Set((await skinRows(sb, userId)).map(r => r.skin_key));
    const pool = SKIN_POOL.filter(s => !owned.has(s.key));
    if (!pool.length) return coinFallback(sb, userId, stage, 'every skin already found');
    const pickd = pool[Math.floor(secureRandom() * pool.length) % pool.length];
    const ins = await sb.from('player_skins').insert({ user_id: userId, skin_key: pickd.key });
    if (ins.error) return coinFallback(sb, userId, stage, 'duplicate');
    return { kind: 'skin', key: pickd.key, name: pickd.name, icon: '🎨', rarity: pickd.rarity };
  }
  // charm
  const pull = pullCharm(secureRandom, POUCH_POOL);
  if (!pull) return coinFallback(sb, userId, stage, 'no charm rolled');
  const have = must(await sb.from('player_charms').select('gilded').eq('user_id', userId).eq('charm_key', pull.key).limit(1), 'charm');
  const res = resolvePull(pull, have.length ? { key: pull.key, gilded: have[0].gilded } : null);
  const def = CHARM_BY_KEY[pull.key];
  if (res.kind === 'new') {
    const ins = await sb.from('player_charms').insert({ user_id: userId, charm_key: pull.key, gilded: pull.gilded, slot: null });
    if (ins.error) return coinFallback(sb, userId, stage, 'duplicate');
    return { kind: 'charm', key: pull.key, name: def.name, icon: def.icon, rarity: def.rarity, gilded: pull.gilded };
  }
  if (res.kind === 'gild') {
    must(await sb.from('player_charms').update({ gilded: true }).eq('user_id', userId).eq('charm_key', pull.key), 'gild');
    return { kind: 'charm', key: pull.key, name: def.name, icon: def.icon, rarity: def.rarity, gilded: true, upgraded: true };
  }
  const r = await sb.rpc('wallet_apply', { p_user: userId, p_delta: res.coins, p_reason: 'trail:dust:' + pull.key, p_meta: null });
  return { kind: 'coins', name: def.name + ' (duplicate)', icon: '🪙', amount: res.coins, balance: r.error ? null : Number(r.data) };
}
async function coinFallback(sb, userId, stage, why) {
  const amt = Math.round(stageCoins(stage) * 0.5);
  const r = await sb.rpc('wallet_apply', { p_user: userId, p_delta: amt, p_reason: 'trail:drop:coins', p_meta: { why } });
  return { kind: 'coins', name: 'Coin Pile', icon: '🪙', amount: amt, why, balance: r.error ? null : Number(r.data) };
}

// Slot a relic in, or take it out. Same shape as charms.
export async function relicEquip(userId, key, slot) {
  const sb = getServiceClient();
  if (!Object.hasOwn(RELIC_BY_KEY, key)) throw new HttpError('unknown relic', 400);
  const n = slot === null || slot === undefined || slot === '' ? null : Number(slot);
  if (n !== null && (!Number.isInteger(n) || n < 0 || n >= RELIC_SLOTS)) throw new HttpError('unknown slot', 400);
  const mine = must(await sb.from('player_relics').select('relic_key').eq('user_id', userId).eq('relic_key', key).limit(1), 'relic');
  if (!mine.length) throw new HttpError("you haven't won that relic — beat the boss that holds it", 400);
  if (n !== null) must(await sb.from('player_relics').update({ slot: null }).eq('user_id', userId).eq('slot', n), 'relic slot clear');
  must(await sb.from('player_relics').update({ slot: n }).eq('user_id', userId).eq('relic_key', key), 'relic equip');
  return { ok: true, key, slot: n };
}

// ---------------------------------------------------------------------------
// SHOP — the passing merchant. Cosmetic only: coins buy frames, cards and
// wearables, never Elo, a title or a rank. Ownership is DERIVED from the coin
// ledger (reason `shop:<kind>:<key>`), so there is no separate table to keep in
// sync and a purchase can never be forged client-side.
// ---------------------------------------------------------------------------
const SHOP_KIND_KEYS = { frame: new Set(FRAME_KEYS), card: new Set(CARD_KEYS), wear: new Set(WEARABLE_KEYS) };

async function ownedShopKeys(sb, userId) {
  const rows = must(await sb.from('coin_ledger').select('reason').eq('user_id', userId), 'ledger');
  const owned = new Set();
  for (const r of rows) {
    if (r.reason && r.reason.startsWith('shop:')) owned.add(r.reason.slice(5)); // "kind:key"
  }
  return owned;
}

export async function shopState(userId) {
  const sb = getServiceClient();
  const [walletRows, owned] = await Promise.all([
    sb.from('wallets').select('coins').eq('user_id', userId).limit(1),
    ownedShopKeys(sb, userId),
  ]);
  const coins = must(walletRows, 'wallet').length ? Number(must(walletRows, 'wallet')[0].coins) : 0;
  const sale = flashSale();
  const saleMap = new Map(sale.items.map(i => [i.kind + ':' + i.key, i.price]));
  const items = shopItems().map(it => {
    const id = it.kind + ':' + it.key;
    const price = saleMap.has(id) ? saleMap.get(id) : it.base;
    return { ...it, price, onSale: saleMap.has(id), owned: owned.has(id) };
  });
  return { coins, sale, items };
}

export async function shopBuy(userId, kind, key) {
  const sb = getServiceClient();
  if (!SHOP_KIND_KEYS[kind] || !SHOP_KIND_KEYS[kind].has(key)) throw new HttpError('unknown item', 400);
  const price = priceNow(kind, key);
  if (!(price > 0)) throw new HttpError('this item is not for sale', 400);

  const owned = await ownedShopKeys(sb, userId);
  if (owned.has(kind + ':' + key)) throw new HttpError('you already own this', 400);

  // wallet_apply debits atomically and errors if it would go negative, so it is
  // both the price check and the charge in one row-locked call. A double-tap
  // could in theory bill twice for the same item before the owned-check sees
  // the first row; the item is still only owned once, so the only cost is the
  // duplicate coins — acceptable, and the button disables itself after a buy.
  const r = await sb.rpc('wallet_apply', { p_user: userId, p_delta: -price, p_reason: 'shop:' + kind + ':' + key, p_meta: { name: key } });
  if (r.error) throw new HttpError('not enough coins', 400);
  return { ok: true, kind, key, price, coins: Number(r.data) };
}

// Table stakes. The big ones are here because people asked to actually risk
// something; every game scales linearly with the bet, so the returns measured
// in the self-checks hold at any size.
const BETS = [10, 25, 50, 100, 500, 1000, 5000, 10000];
const cleanBet = (v) => {
  const n = Math.round(Number(v));
  if (!BETS.includes(n)) throw new HttpError('invalid bet', 400);
  return n;
};

// Every game is resolved HERE. The browser sends a bet, never an outcome, and
// the seed never leaves the server until the round is already settled.
export async function arcadePlay(userId, game, body) {
  const sb = getServiceClient();
  const bet = cleanBet(body.bet);
  const stake = await sb.rpc('wallet_apply', { p_user: userId, p_delta: -bet, p_reason: game + ':bet', p_meta: null });
  if (stake.error) throw new HttpError('not enough coins', 400);
  let coins = Number(stake.data);
  const pay = async (amount, reason, meta) => {
    if (amount <= 0) return coins;
    const r = await sb.rpc('wallet_apply', { p_user: userId, p_delta: amount, p_reason: reason, p_meta: meta || null });
    if (!r.error) coins = Number(r.data);
    return coins;
  };

  if (game === 'slots') {
    const out = spinSlots(bet, newSeed());
    await pay(out.payout, 'slots:win', { line: out.line });
    return { game, bet, coins, reels: out.icons, payout: out.payout, net: out.net, line: out.line };
  }

  if (game === 'blackjack') {
    // A table, not a private hand: bots sit either side and are dealt from the
    // same shoe, so the cards you can see genuinely affect what's left.
    const st = dealBlackjack(newSeed());
    const seatCount = Math.max(0, Math.min(3, Math.round(Number(body.bots ?? 2))));
    let next = st.next;
    const others = [];
    for (let i = 0; i < seatCount; i++) {
      const cards = [st.deck[next], st.deck[next + 1]]; next += 2;
      others.push({ name: BOT_NAMES[i].name, emoji: BOT_NAMES[i].emoji, cards });
    }
    const player = [...st.player];
    const hitTo = Math.max(12, Math.min(20, Math.round(Number(body.stand_on) || 17)));
    while (handValue(player).total < hitTo && !handValue(player).bust) { player.push(st.deck[next]); next++; }
    // bots play basic strategy-ish so the table feels alive
    for (const o of others) {
      while (handValue(o.cards).total < 17) { o.cards.push(st.deck[next]); next++; }
      o.total = handValue(o.cards).total;
      o.bust = handValue(o.cards).bust;
    }
    const d = dealerPlay({ ...st, next });
    const res = settleBlackjack(player, d.dealer, bet);
    for (const o of others) {
      const r = settleBlackjack(o.cards, d.dealer, bet);
      o.result = r.result;
    }
    await pay(res.payout, 'blackjack:' + res.result, { detail: res.detail });
    return {
      game, bet, coins, player, dealer: d.dealer, others,
      playerTotal: handValue(player).total, dealerTotal: handValue(d.dealer).total,
      payout: res.payout, net: res.net, result: res.result, detail: res.detail,
    };
  }

  if (game === 'rush') {
    // Two hole cards, five community cards, paid on your best five.
    const out = playRush(bet, newSeed());
    await pay(out.payout, 'rush:' + (out.win || 'none'), { hand: out.name });
    return {
      game, bet, coins, hole: out.hole, board: out.board, best: out.best,
      payout: out.payout, net: out.net, win: out.win, hand: out.name,
    };
  }
  throw new HttpError('unknown game', 404);
}

// Weekly arcade league: who is up the most coins since Monday.
export async function arcadeLeague() {
  const sb = getServiceClient();
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 3600000);
  const dow = (bkk.getUTCDay() + 6) % 7;                       // Monday = 0
  const monday = new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate() - dow) - 7 * 3600000);

  const rows = must(await sb.from('coin_ledger')
    .select('user_id, delta, reason')
    .gte('created_at', monday.toISOString())
    .not('reason', 'eq', 'level')
    .limit(20000), 'league');
  const net = new Map();
  for (const r of rows) net.set(r.user_id, (net.get(r.user_id) || 0) + Number(r.delta));
  const ids = [...net.keys()];
  if (!ids.length) return { since: monday.toISOString(), rows: [] };
  const users = must(await sb.from('users').select('id, nickname, avatar_emoji, avatar_color').in('id', ids), 'league users');
  const umap = userMapOf(users);
  return {
    since: monday.toISOString(),
    rows: [...net.entries()]
      .map(([id, n]) => ({ ...displayUser(umap.get(id)), net: n }))
      .sort((a, b) => b.net - a.net)
      .slice(0, 20),
  };
}

// ---------------------------------------------------------------------------
// TEXAS HOLD'EM — Peace mode (a real table, betting rounds, bots)
// The hand state holds the bots' hole cards AND the undealt deck, so it lives
// server-side and only ever leaves here redacted.
// ---------------------------------------------------------------------------
const BOT_NAMES = [
  { name: 'Ava', emoji: '🦊' }, { name: 'Ben', emoji: '🐼' }, { name: 'Cleo', emoji: '🦉' },
  { name: 'Dex', emoji: '🐺' }, { name: 'Iris', emoji: '🦄' }, { name: 'Kai', emoji: '🐯' },
];

// What the browser is allowed to see. Opponents' cards stay face-down until
// showdown, and the deck never goes over the wire at all.
function redact(st, handId, viewerSeat = 0) {
  const showdown = st.done && st.result && !st.result.uncontested;
  return {
    handId,
    street: st.street,
    board: st.board,
    pot: st.pot,
    done: st.done,
    toAct: st.toAct,
    yourSeat: viewerSeat,
    currentBet: st.currentBet,
    button: st.button,
    log: st.log.slice(-6),
    players: st.players.map(p => ({
      seat: p.seat, name: p.name, emoji: p.emoji, bot: p.bot,
      chips: p.chips, bet: p.bet, folded: p.folded, allIn: p.allIn,
      // your own cards always; everyone else's only at a real showdown
      hole: (p.seat === viewerSeat || (showdown && !p.folded)) ? p.hole : null,
      cards: p.hole.length,
    })),
    you: st.done || st.toAct == null ? null : {
      canAct: st.players[st.toAct] && st.players[st.toAct].seat === viewerSeat,
      actions: st.toAct != null && st.players[st.toAct].seat === viewerSeat ? legalActions(st) : [],
      toCall: st.toAct != null && st.players[st.toAct].seat === viewerSeat ? callAmount(st) : 0,
      raise: st.toAct != null && st.players[st.toAct].seat === viewerSeat ? raiseRange(st) : null,
    },
    result: st.done ? {
      uncontested: st.result.uncontested,
      winners: st.result.winners,
      wins: st.result.wins,
      hands: st.result.hands || {},
    } : null,
  };
}

export async function pokerStart(userId, opts = {}) {
  const sb = getServiceClient();
  const buyIn = cleanBet(opts.buyIn || 100);
  const botCount = Math.max(1, Math.min(5, Math.round(Number(opts.bots ?? 3))));

  // one live hand at a time — abandoning a hand forfeits the stake, same as
  // standing up from a real table mid-hand
  await sb.from('poker_hands').update({ status: 'abandoned' }).eq('owner', userId).eq('status', 'live');

  const staked = await sb.rpc('wallet_apply', { p_user: userId, p_delta: -buyIn, p_reason: 'poker:buyin', p_meta: null });
  if (staked.error) throw new HttpError('not enough coins', 400);

  const users = must(await sb.from('users').select('nickname, avatar_emoji').eq('id', userId).limit(1), 'poker me');
  const me = users[0] || { nickname: 'You', avatar_emoji: '🙂' };
  const seats = [{ id: userId, name: me.nickname, emoji: me.avatar_emoji, chips: buyIn }];
  for (let i = 0; i < botCount; i++) {
    seats.push({ id: 'bot' + i, name: BOT_NAMES[i].name, emoji: BOT_NAMES[i].emoji, chips: buyIn, bot: true });
  }

  const st = newHand(seats, newSeed(), 0);
  runBots(st, 1);                                  // bots act until it's your turn
  const rows = must(await sb.from('poker_hands').insert({
    owner: userId, state: st, stake: buyIn, status: st.done ? 'done' : 'live',
  }).select('id'), 'poker insert');
  const handId = rows[0].id;

  let coins = Number(staked.data);
  if (st.done) coins = await pokerSettle(userId, handId, st, buyIn);
  return { ...redact(st, handId), coins, buyIn };
}

export async function pokerAct(userId, handId, action, amount) {
  const sb = getServiceClient();
  const rows = must(await sb.from('poker_hands').select('id, state, stake, status')
    .eq('id', handId).eq('owner', userId).limit(1), 'poker load');
  const row = rows[0];
  if (!row) throw new HttpError('hand not found', 404);
  if (row.status !== 'live') throw new HttpError('that hand is already over', 400);

  const st = reviveHand(row.state);
  if (st.done) throw new HttpError('that hand is already over', 400);
  // it must actually be your turn — the client asking nicely is not enough
  if (st.toAct == null || st.players[st.toAct].seat !== 0) throw new HttpError('not your turn', 400);
  if (!['fold', 'check', 'call', 'raise'].includes(action)) throw new HttpError('unknown action', 400);
  if (!legalActions(st).includes(action)) throw new HttpError('you cannot ' + action + ' right now', 400);

  act(st, action, Math.max(0, Math.round(Number(amount) || 0)));
  runBots(st, (st.log.length + 2) | 0);

  let coins = null;
  if (st.done) {
    // Compare-and-swap: the row transition IS the mutual exclusion. Two racing
    // requests both saw status 'live' above and both replay the same
    // deterministic result, so without the .eq('status','live') guard both
    // would settle and the stack would be paid out twice.
    const claimed = must(await sb.from('poker_hands')
      .update({ state: st, status: 'done', updated_at: new Date().toISOString() })
      .eq('id', handId).eq('owner', userId).eq('status', 'live')
      .select('id'), 'poker done');
    if (!claimed.length) throw new HttpError('that hand is already over', 400);
    coins = await pokerSettle(userId, handId, st, row.stake);
  } else {
    must(await sb.from('poker_hands').update({ state: st, updated_at: new Date().toISOString() })
      .eq('id', handId).eq('owner', userId).eq('status', 'live'), 'poker save');
  }
  const view = redact(st, handId);
  if (coins != null) view.coins = coins;
  return view;
}

// Whatever you're left sitting behind comes back to your wallet, plus the
// bounty for every bot you actually busted. The bounty is the only coin the
// table mints — it is a fixed slice of your buy-in per bot, disclosed in the
// paytable, so it can never scale into an infinite-money loop.
export const BOT_BOUNTY = 0.25;
async function pokerSettle(userId, handId, st, stake) {
  const sb = getServiceClient();
  const back = Math.max(0, Math.round(st.players[0].chips));
  const busted = (st.players || []).filter(p => p.bot && Math.round(p.chips) <= 0).length;
  // you only collect if you're still standing yourself
  const bounty = back > 0 ? Math.round(stake * BOT_BOUNTY) * busted : 0;
  const total = back + bounty;
  if (total > 0) {
    const r = await sb.rpc('wallet_apply', {
      p_user: userId, p_delta: total, p_reason: 'poker:cashout',
      p_meta: { hand: handId, stake, net: total - stake, bounty, busted },
    });
    if (!r.error) return Number(r.data);
  }
  const w = must(await sb.from('wallets').select('coins').eq('user_id', userId).limit(1), 'poker wallet');
  return w.length ? Number(w[0].coins) : 0;
}

// JSONB round-trips Dates to strings; nothing here depends on Date objects, but
// be explicit rather than relying on that staying true.
function reviveHand(state) {
  return typeof state === 'string' ? JSON.parse(state) : state;
}

export async function pokerState(userId) {
  const sb = getServiceClient();
  const rows = must(await sb.from('poker_hands').select('id, state').eq('owner', userId).eq('status', 'live')
    .order('created_at', { ascending: false }).limit(1), 'poker state');
  if (!rows.length) return { hand: null };
  return { hand: redact(reviveHand(rows[0].state), rows[0].id) };
}

// ---------------------------------------------------------------------------
// ฉายา (EPITHETS) — read the persisted board + let a holder pick which one to keep
// ---------------------------------------------------------------------------
export async function epithetBoard(userId) {
  const sb = getServiceClient();
  const [rows, users] = await Promise.all([
    sb.from('titles_awarded').select('title_key, holder_ids, value, meta_json').eq('season', 'all-time'),
    sb.from('users').select('id, nickname, avatar_emoji, avatar_color, settings_json').range(0, 4999),
  ]);
  const ts = must(rows, 'epithet rows').filter(t => t.meta_json && t.meta_json.epithet);
  const umap = userMapOf(must(users, 'epithet users'));
  const held = new Map(ts.map(t => [t.title_key, t]));
  const board = EPITHETS.map(e => {
    const t = held.get(e.key);
    const holderId = t ? (t.holder_ids || [])[0] : null;
    return {
      key: e.key, th: e.th, en: e.en, icon: e.icon, blurb: e.blurb,
      holder: holderId ? displayUser(umap.get(holderId)) : null,
      mine: holderId === userId,
      score: t && t.meta_json ? t.meta_json.score : null,
    };
  });
  const me = umap.get(userId);
  return {
    epithets: board,
    myEpithet: board.find(b => b.mine) || null,
    chosen: (me && me.settings_json && me.settings_json.epithet) || null,
  };
}

// Which epithets could this player claim right now (they top the board)?
export async function epithetOptions(userId) {
  const { users, normMatches } = await loadCore();
  const model = buildModel(users, normMatches);
  const standings = runElo(users, normMatches);
  const ctx = {
    standings,
    extra: buildEpithetExtra(model, standings, buildExtra(model, standings).giantWins),
    consistency: (p) => consistencyScore(p.marginSeq),
  };
  return { options: eligibleFor(model, standings, ctx, userId) };
}

export async function chooseEpithet(userId, key) {
  if (key && !EPITHET_BY_KEY[key]) throw new HttpError('unknown epithet', 400);
  const sb = getServiceClient();
  const rows = must(await sb.from('users').select('settings_json').eq('id', userId).limit(1), 'epithet get');
  const merged = { ...(rows[0]?.settings_json || {}), epithet: key || null };
  must(await sb.from('users').update({ settings_json: merged }).eq('id', userId), 'epithet set');
  await recomputeAndPersist();          // re-run the assignment so it passes down
  return epithetBoard(userId);
}