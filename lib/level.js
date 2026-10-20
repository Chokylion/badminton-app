import { pathToFileURL } from 'node:url';
// lib/level.js — XP and levels.
//
// Elo is zero-sum: you only climb if somebody else falls, which quietly pushes
// the bottom half of the club out of the app. Levels are the opposite — they
// only ever go up. Turn up, play, progress. Lose every match and you STILL
// level up, just slower.
//
// XP is DERIVED from the match model rather than stored as a running total, so
// it can never drift out of sync with reality: void a match and the XP for it
// disappears too. That also means no migration and no double-award bugs.

export const XP = {
  play: 10,          // just for turning up
  win: 15,           // winning is better, but showing up is most of it
  game: 3,           // per game contested — long matches are worth more
  deuce: 5,          // 20-20 games are the fun ones
  comeback: 25,      // lost the first game, won anyway
  decider: 12,       // won a third game
  newPartner: 20,    // first time playing with someone
  firstOfDay: 30,    // the "come back tomorrow" hook
  shutout: 40,       // 21-0
};

// Curve: early levels land fast (a beginner should see 2-3 quickly), then
// stretch. Level n needs 60*n^1.55 XP in total.
export function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.round(60 * ((level - 1) ** 1.55));
}

export function levelFor(xp) {
  const total = Math.max(0, Math.floor(xp || 0));
  let level = 1;
  while (level < 200 && xpForLevel(level + 1) <= total) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const span = Math.max(1, next - base);
  return {
    level,
    xp: total,
    into: total - base,
    need: span,
    next,
    pct: Math.max(0, Math.min(100, Math.round(((total - base) / span) * 100))),
  };
}

// Bangkok day key — the club's timezone is fixed, and the serverless runtime is
// UTC, so never use getDate() here.
const bkkDay = (d) => new Date(new Date(d).getTime() + 7 * 3600000).toISOString().slice(0, 10);

// Walk one player's matches (oldest first) and total their XP.
export function xpFor(model, userId) {
  const p = model.players.get(userId);
  if (!p) return { xp: 0, breakdown: {} };
  const mine = model.matches
    .filter(m => m.winner != null && [...m.teamA, ...m.teamB].includes(userId))
    .sort((a, b) => new Date(a.played_at) - new Date(b.played_at));

  const b = { play: 0, win: 0, game: 0, deuce: 0, comeback: 0, decider: 0, newPartner: 0, firstOfDay: 0, shutout: 0 };
  const seenPartners = new Set();
  const seenDays = new Set();

  for (const m of mine) {
    const side = m.teamA.includes(userId) ? 'A' : 'B';
    const won = side === m.winner;
    b.play += XP.play;
    b.game += XP.game * m.games.length;
    b.deuce += XP.deuce * (m.deuceGames || 0);
    if (won) b.win += XP.win;
    if (won && m.wonGame1By && m.wonGame1By !== side) b.comeback += XP.comeback;
    if (won && m.game3Winner === side) b.decider += XP.decider;
    for (const g of m.games) {
      const mine_ = side === 'A' ? g.a : g.b;
      const theirs = side === 'A' ? g.b : g.a;
      if (mine_ > theirs && theirs === 0) b.shutout += XP.shutout;
    }
    for (const mate of (side === 'A' ? m.teamA : m.teamB)) {
      if (mate === userId || seenPartners.has(mate)) continue;
      seenPartners.add(mate);
      b.newPartner += XP.newPartner;
    }
    const day = bkkDay(m.played_at);
    if (!seenDays.has(day)) { seenDays.add(day); b.firstOfDay += XP.firstOfDay; }
  }
  const xp = Object.values(b).reduce((s, n) => s + n, 0);
  return { xp, breakdown: b, activeDays: seenDays.size };
}

export function levelOf(model, userId) {
  const { xp, breakdown, activeDays } = xpFor(model, userId);
  return { ...levelFor(xp), breakdown, activeDays };
}

// Coins are the arcade currency. They are minted ONLY from XP, and XP comes
// ONLY from playing badminton — so the only way to get rich is to turn up.
//
// Paying per XP rather than per level matters: levels get further apart as you
// climb, so a level-based mint quietly pays veterans less and less for the same
// match. Per-XP keeps one honest exchange rate for everybody, forever.
export const COINS_PER_XP = 30;
// Kept for the level card in the arcade header — levels are still a thing you
// see, they just are not the thing that pays.
export const COINS_PER_LEVEL = 100;
export const coinsForLevel = (level) => Math.max(0, (level - 1)) * COINS_PER_LEVEL;
// What the whole history is worth, before any gear bonus.
export const coinsForXp = (xp) => Math.max(0, Math.floor(xp || 0)) * COINS_PER_XP;

// What a brand-new account starts with, so the shop and the blacksmith are not
// a locked door on day one. Granted once, at signup, through the normal ledger.
export const STARTING_COINS = 5000;

/* ----------------------------------------------------------- self-check */
const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (IS_MAIN && process.argv.includes('--test')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };

  assert(xpForLevel(1) === 0, 'level 1 costs nothing');
  for (let l = 2; l < 60; l++) assert(xpForLevel(l) > xpForLevel(l - 1), 'curve rises at ' + l);
  assert(levelFor(0).level === 1, 'no xp = level 1');
  assert(levelFor(-5).level === 1, 'negative xp cannot break it');
  assert(levelFor(xpForLevel(5)).level === 5, 'exact threshold lands on the level');
  assert(levelFor(xpForLevel(5) - 1).level === 4, 'one short stays below');
  const l3 = levelFor(xpForLevel(3));
  assert(l3.pct === 0 && l3.into === 0, 'just levelled = 0% into the next');
  assert(levelFor(1e9).level <= 200, 'level is capped, no infinite loop');

  // a single ordinary win
  const mk = (over) => ({
    id: 'm1', played_at: new Date('2026-08-01T10:00:00Z'), winner: 'A',
    teamA: ['me'], teamB: ['opp'], games: [{ a: 21, b: 15 }],
    deuceGames: 0, wonGame1By: 'A', game3Winner: null, ...over,
  });
  const model = (matches) => ({ players: new Map([['me', { id: 'me' }]]), matches });

  const one = xpFor(model([mk()]), 'me');
  assert(one.xp === XP.play + XP.win + XP.game + XP.firstOfDay, 'single win totals correctly, got ' + one.xp);

  // losing still pays
  const lost = xpFor(model([mk({ winner: 'B' })]), 'me');
  assert(lost.breakdown.win === 0 && lost.xp > 0, 'a loss still earns XP');
  assert(lost.xp < one.xp, 'but less than a win');

  // same day twice -> firstOfDay once
  const twoSameDay = xpFor(model([mk(), mk({ id: 'm2' })]), 'me');
  assert(twoSameDay.breakdown.firstOfDay === XP.firstOfDay, 'first-of-day pays once per day');
  const twoDays = xpFor(model([mk(), mk({ id: 'm2', played_at: new Date('2026-08-02T10:00:00Z') })]), 'me');
  assert(twoDays.breakdown.firstOfDay === XP.firstOfDay * 2, 'two days pays twice');

  // Bangkok rollover: 16:00Z is 23:00 the same day in Bangkok, 18:00Z is 01:00
  // the NEXT day — the boundary UTC would miss entirely.
  const tz = xpFor(model([
    mk({ played_at: new Date('2026-08-01T16:00:00Z') }),
    mk({ id: 'm2', played_at: new Date('2026-08-01T18:00:00Z') }),
  ]), 'me');
  assert(tz.breakdown.firstOfDay === XP.firstOfDay * 2, 'day boundary uses Bangkok time');
  const sameBkkDay = xpFor(model([
    mk({ played_at: new Date('2026-08-01T20:00:00Z') }),
    mk({ id: 'm2', played_at: new Date('2026-08-01T23:00:00Z') }),
  ]), 'me');
  assert(sameBkkDay.breakdown.firstOfDay === XP.firstOfDay, 'both already tomorrow in Bangkok = one day');

  // new partner pays once per person
  const dbl = (mate, id, at) => mk({ id, teamA: ['me', mate], teamB: ['x', 'y'], played_at: at || new Date('2026-08-01T10:00:00Z') });
  const p1 = xpFor(model([dbl('bob', 'm1'), dbl('bob', 'm2')]), 'me');
  assert(p1.breakdown.newPartner === XP.newPartner, 'same partner pays once');
  const p2 = xpFor(model([dbl('bob', 'm1'), dbl('sue', 'm2')]), 'me');
  assert(p2.breakdown.newPartner === XP.newPartner * 2, 'each new partner pays');

  // shutout + comeback + decider
  const sh = xpFor(model([mk({ games: [{ a: 21, b: 0 }] })]), 'me');
  assert(sh.breakdown.shutout === XP.shutout, '21-0 pays the shutout bonus');
  const cb = xpFor(model([mk({ wonGame1By: 'B', game3Winner: 'A', games: [{ a: 15, b: 21 }, { a: 21, b: 10 }, { a: 21, b: 18 }] })]), 'me');
  assert(cb.breakdown.comeback === XP.comeback, 'comeback pays');
  assert(cb.breakdown.decider === XP.decider, 'winning the decider pays');

  // unknown player and unfinished matches are safe
  assert(xpFor(model([mk()]), 'ghost').xp === 0, 'unknown player earns nothing');
  assert(xpFor(model([mk({ winner: null })]), 'me').xp === 0, 'unfinished matches are skipped');

  // XP only ever grows as matches accumulate
  let prev = 0;
  for (let n = 1; n <= 12; n++) {
    const ms = Array.from({ length: n }, (_, i) => mk({ id: 'm' + i, played_at: new Date(Date.UTC(2026, 7, 1 + i)) }));
    const x = xpFor(model(ms), 'me').xp;
    assert(x > prev, 'xp is monotonic at ' + n);
    prev = x;
  }
  assert(coinsForLevel(1) === 0 && coinsForLevel(5) === 400, 'coins track levels gained');
  assert(STARTING_COINS > 0, 'a new account starts with something to spend');

  // --- what a match is actually worth, measured rather than guessed ---
  const oneWin = xpFor(model([mk()]), 'me').xp;                       // first of the day, won
  const laterWin = xpFor(model([mk(), mk({ id: 'm2' })]), 'me').xp - oneWin;   // second match same day
  assert(coinsForXp(oneWin) >= 1000, `the first match of the day pays 1000+ (${coinsForXp(oneWin)})`);
  assert(coinsForXp(laterWin) >= 500, `a follow-up match still pays properly (${coinsForXp(laterWin)})`);
  assert(coinsForXp(0) === 0, 'no XP is no coins');
  assert(coinsForXp(-50) === 0 && coinsForXp(undefined) === 0, 'junk XP cannot mint coins');
  // and it must be monotonic, or the wallet watermark would claw back
  let lastCoins = 0;
  for (let n = 1; n <= 10; n++) {
    const ms = Array.from({ length: n }, (_, i) => mk({ id: 'm' + i, played_at: new Date(Date.UTC(2026, 7, 1 + i)) }));
    const c = coinsForXp(xpFor(model(ms), 'me').xp);
    assert(c > lastCoins, 'coins only ever go up as you play (' + n + ')');
    lastCoins = c;
  }

  const sample = levelFor(xpFor(model(Array.from({ length: 20 }, (_, i) =>
    mk({ id: 'm' + i, played_at: new Date(Date.UTC(2026, 7, 1 + i)) }))), 'me').xp);
  console.log(`level.js self-check: PASS (20 played-and-won days = level ${sample.level}, ${sample.xp} xp, ` +
    `${coinsForXp(sample.xp).toLocaleString()} coins · a match pays ${coinsForXp(laterWin)}-${coinsForXp(oneWin)})`);
}
