// lib/room.js — pure logic for live play sessions ("rooms"). No I/O.
// Decides who plays on which court and how the teams are split, either
// balanced by rank or completely random, while keeping bench time fair.

import { expected } from './rating.js';

export const PER_DOUBLES = 4;
export const PER_SINGLES = 2;
export const MAX_COURTS = 5;
export const MODES = ['rank', 'random'];

// Deterministic RNG so a draw can be replayed/tested. Seeded per round.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

export function cleanCourts(list) {
  const set = new Set();
  for (const n of Array.isArray(list) ? list : []) {
    const v = Number(n);
    if (Number.isInteger(v) && v >= 1 && v <= MAX_COURTS) set.add(v);
  }
  return [...set].sort((a, b) => a - b);
}

// Unambiguous alphabet (no O/0, I/1) — codes get read aloud across a gym.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function roomCode(len = 5, rnd = Math.random) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
  return s;
}

// Bench fairness: whoever sat out most goes on first, then whoever has played
// least; ties broken randomly so the same faces don't always win the tiebreak.
export function playOrder(players, rnd) {
  return shuffle(players, rnd).sort((a, b) =>
    ((b.rounds_rested || 0) - (a.rounds_rested || 0)) ||
    ((a.rounds_played || 0) - (b.rounds_played || 0)));
}

function splitCourt(group, mode, rnd) {
  if (group.length === PER_SINGLES) return { teamA: [group[0]], teamB: [group[1]] };
  if (mode === 'rank') {
    // group arrives sorted strongest→weakest: pair 1st+4th vs 2nd+3rd, the
    // split that puts the two sides closest together.
    return { teamA: [group[0], group[3]], teamB: [group[1], group[2]] };
  }
  const s = shuffle(group, rnd);
  return { teamA: [s[0], s[1]], teamB: [s[2], s[3]] };
}

const avgElo = (side) => side.reduce((t, p) => t + (p.elo == null ? 1500 : p.elo), 0) / Math.max(1, side.length);

/**
 * Draw one round.
 * @param players [{id, elo, rounds_played, rounds_rested}]
 * @param courts  enabled court numbers, e.g. [1,3,5]
 * @param mode    'rank' (balanced) | 'random'
 * @returns {courts:[{court,format,teamA,teamB,eloA,eloB,balance}], resting:[id]}
 */
export function drawRound({ players = [], courts = [], mode = 'rank', seed = 1 } = {}) {
  const rnd = mulberry32((seed >>> 0) || 1);
  const courtNos = cleanCourts(courts);
  const useMode = MODES.includes(mode) ? mode : 'rank';
  if (!courtNos.length || players.length < PER_SINGLES) {
    return { courts: [], resting: players.map(p => p.id), mode: useMode };
  }

  const ordered = playOrder(players, rnd);
  const capacity = courtNos.length * PER_DOUBLES;
  const pool = ordered.slice(0, Math.min(ordered.length, capacity));

  // Fill as many doubles courts as possible; if a court is still free and 2+
  // players are left over, run it as singles rather than benching them.
  let fullCourts = Math.min(Math.floor(pool.length / PER_DOUBLES), courtNos.length);
  let used = fullCourts * PER_DOUBLES;
  let singlesCourt = 0;
  if (fullCourts < courtNos.length && pool.length - used >= PER_SINGLES) {
    singlesCourt = 1;
    used += PER_SINGLES;
  }

  const playing = pool.slice(0, used);
  const playingIds = new Set(playing.map(p => p.id));
  const resting = players.filter(p => !playingIds.has(p.id)).map(p => p.id);

  // Rank mode groups similar ratings onto the same court so every game is
  // competitive; random mode just scrambles everyone.
  const lineup = useMode === 'rank'
    ? playing.slice().sort((a, b) => (b.elo == null ? 1500 : b.elo) - (a.elo == null ? 1500 : a.elo))
    : shuffle(playing, rnd);

  const out = [];
  let i = 0;
  for (let c = 0; c < fullCourts + singlesCourt; c++) {
    const size = c < fullCourts ? PER_DOUBLES : PER_SINGLES;
    const group = lineup.slice(i, i + size);
    i += size;
    const { teamA, teamB } = splitCourt(group, useMode, rnd);
    const eloA = avgElo(teamA), eloB = avgElo(teamB);
    out.push({
      court: courtNos[c],
      format: size === PER_DOUBLES ? 'doubles' : 'singles',
      teamA: teamA.map(p => p.id),
      teamB: teamB.map(p => p.id),
      eloA: Math.round(eloA), eloB: Math.round(eloB),
      balance: Math.round(expected(eloA, eloB) * 100),
      matchId: null, scoreA: null, scoreB: null, winner: null,
    });
  }
  return { courts: out, resting, mode: useMode };
}

// Tonight-only W/L, built from the rounds that already have a reported score.
export function sessionStandings(rounds) {
  const tally = new Map();
  const bump = (id, won, pf, pa) => {
    if (!tally.has(id)) tally.set(id, { id, wins: 0, losses: 0, played: 0, pointsFor: 0, pointsAgainst: 0 });
    const t = tally.get(id);
    t.played++; t.pointsFor += pf; t.pointsAgainst += pa;
    if (won) t.wins++; else t.losses++;
  };
  for (const r of rounds || []) {
    for (const c of r.courts_json || []) {
      if (!c.winner) continue;
      const a = Number(c.scoreA) || 0, b = Number(c.scoreB) || 0;
      for (const id of c.teamA || []) bump(id, c.winner === 'A', a, b);
      for (const id of c.teamB || []) bump(id, c.winner === 'B', b, a);
    }
  }
  return [...tally.values()].sort((x, y) =>
    (y.wins - x.wins) ||
    ((y.pointsFor - y.pointsAgainst) - (x.pointsFor - x.pointsAgainst)) ||
    (x.played - y.played));
}

// ---- self-check ----
function demo() {
  const assert = (c, m) => { if (!c) throw new Error('room demo failed: ' + m); };
  const mk = (id, elo, played = 0, rested = 0) => ({ id, elo, rounds_played: played, rounds_rested: rested });
  const flat = (d) => d.courts.flatMap(c => [...c.teamA, ...c.teamB]);

  // 8 players, 2 courts -> two full doubles courts, nobody benched.
  {
    const players = Array.from({ length: 8 }, (_, i) => mk('p' + i, 1500 + i * 20));
    const d = drawRound({ players, courts: [1, 2], mode: 'rank', seed: 7 });
    assert(d.courts.length === 2, 'two courts used');
    assert(d.courts.every(c => c.format === 'doubles'), 'both doubles');
    assert(flat(d).length === 8 && new Set(flat(d)).size === 8, 'all 8 play once');
    assert(d.resting.length === 0, 'nobody rests');
  }

  // 6 players, 2 courts -> 1 doubles + 1 singles instead of benching two.
  {
    const players = Array.from({ length: 6 }, (_, i) => mk('p' + i, 1500));
    const d = drawRound({ players, courts: [1, 2], mode: 'random', seed: 3 });
    assert(d.courts.length === 2, 'singles fallback opens 2nd court');
    assert(d.courts.filter(c => c.format === 'singles').length === 1, 'exactly one singles');
    assert(flat(d).length === 6 && d.resting.length === 0, 'all six on court');
  }

  // 5 players, 1 court -> 4 play, 1 benched; no duplicates anywhere.
  {
    const players = Array.from({ length: 5 }, (_, i) => mk('p' + i, 1500));
    const d = drawRound({ players, courts: [3], mode: 'rank', seed: 11 });
    assert(d.courts.length === 1 && d.resting.length === 1, '4 play 1 rests');
    assert(!flat(d).includes(d.resting[0]), 'bench player not on court');
    assert(d.courts[0].court === 3, 'uses the enabled court number');
  }

  // Capacity: 20 players but only 1 court -> still only 4 on court.
  {
    const players = Array.from({ length: 20 }, (_, i) => mk('p' + i, 1500));
    const d = drawRound({ players, courts: [1], mode: 'random', seed: 5 });
    assert(flat(d).length === 4 && d.resting.length === 16, 'capacity respected');
  }

  // Rank mode makes even teams: 1800/1700/1300/1200 -> 1500 vs 1500.
  {
    const players = [mk('a', 1800), mk('b', 1700), mk('c', 1300), mk('d', 1200)];
    const d = drawRound({ players, courts: [1], mode: 'rank', seed: 1 });
    const c = d.courts[0];
    assert(c.eloA === 1500 && c.eloB === 1500, 'balanced pairing 1st+4th vs 2nd+3rd');
    assert(c.balance === 50, 'even balance reads 50%');
  }

  // Determinism: same seed same draw, and rank mode is stable.
  {
    const players = Array.from({ length: 8 }, (_, i) => mk('p' + i, 1400 + i * 30));
    const x = drawRound({ players, courts: [1, 2], mode: 'random', seed: 42 });
    const y = drawRound({ players, courts: [1, 2], mode: 'random', seed: 42 });
    assert(JSON.stringify(x) === JSON.stringify(y), 'same seed -> same draw');
  }

  // Bench fairness: whoever sat out gets picked next round.
  {
    let players = Array.from({ length: 6 }, (_, i) => mk('p' + i, 1500));
    for (let round = 0; round < 12; round++) {
      const d = drawRound({ players, courts: [1], mode: 'random', seed: round + 1 });
      const on = new Set(flat(d));
      players = players.map(p => on.has(p.id)
        ? { ...p, rounds_played: p.rounds_played + 1, rounds_rested: 0 }
        : { ...p, rounds_rested: p.rounds_rested + 1 });
    }
    const counts = players.map(p => p.rounds_played);
    assert(Math.max(...counts) - Math.min(...counts) <= 1, 'bench time stays fair, spread=' + (Math.max(...counts) - Math.min(...counts)));
  }

  // No courts enabled -> everyone rests, no crash.
  {
    const d = drawRound({ players: [mk('a', 1500), mk('b', 1500)], courts: [], mode: 'rank', seed: 2 });
    assert(d.courts.length === 0 && d.resting.length === 2, 'no courts -> all rest');
  }

  // cleanCourts rejects junk and dedupes.
  {
    const c = cleanCourts([3, 3, 1, 9, 0, -2, '2', null, 5.5]);
    assert(JSON.stringify(c) === JSON.stringify([1, 2, 3]), 'cleanCourts got ' + JSON.stringify(c));
  }

  // Standings tally + ordering.
  {
    const rounds = [{
      courts_json: [
        { teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 21, scoreB: 10, winner: 'A' },
        { teamA: ['e'], teamB: ['f'], scoreA: 15, scoreB: 21, winner: 'B' },
        { teamA: ['x'], teamB: ['y'], scoreA: null, scoreB: null, winner: null },
      ],
    }];
    const s = sessionStandings(rounds);
    assert(s.length === 6, 'unplayed court ignored, got ' + s.length);
    assert(s[0].wins === 1 && s[0].pointsFor === 21, 'winner on top');
    assert(s.find(r => r.id === 'c').losses === 1, 'loser recorded');
    assert(!s.some(r => r.id === 'x'), 'no-score court excluded');
  }

  // Codes are the right shape and avoid lookalike characters.
  {
    const code = roomCode(5, mulberry32(9));
    assert(code.length === 5 && /^[A-Z2-9]+$/.test(code), 'code shape ' + code);
    assert(!/[OI01]/.test(code), 'no ambiguous chars');
  }

  console.log('room.js self-check: PASS');
}
if (process.argv.includes('--test')) demo();
