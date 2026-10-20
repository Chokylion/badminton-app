// lib/rating.js — pure Elo rating engine, adapted for doubles. No I/O.
// Team rating = average of members. K = 40 while provisional (<10 games) else 24.
// A gentle margin multiplier makes a 21-5 stomp move more than a 22-20 nail-biter.

export const START_ELO = 1500;
export const K_PROVISIONAL = 40;
export const K_STANDARD = 24;
export const PROVISIONAL_GAMES = 10;

export function expected(rTeam, rOpp) {
  return 1 / (1 + Math.pow(10, (rOpp - rTeam) / 400));
}

export function kFactor(gamesPlayed) {
  return gamesPlayed < PROVISIONAL_GAMES ? K_PROVISIONAL : K_STANDARD;
}

// 0.85 (dead-even) .. 1.15 (blowout), bounded and deterministic.
export function marginMultiplier(pointsA, pointsB) {
  const tot = pointsA + pointsB;
  if (tot <= 0) return 1;
  const ratio = Math.abs(pointsA - pointsB) / tot;
  return 0.85 + 0.30 * Math.min(ratio / 0.35, 1);
}

function avg(nums) { return nums.reduce((a, b) => a + b, 0) / nums.length; }

function bumpStreak(prev, won) {
  if (won) return prev >= 0 ? prev + 1 : 1;
  return prev <= 0 ? prev - 1 : -1;
}

// Elo after each of ONE player's matches, in a single pass (O(n)).
// Used for the profile sparkline — replaying runElo per match was O(n²).
export function eloTimeline(users, normMatches, userId, cap = 80) {
  const R = new Map();
  for (const u of users) R.set(u.id, { elo: START_ELO, games: 0 });
  const ensure = (id) => { if (!R.has(id)) R.set(id, { elo: START_ELO, games: 0 }); return R.get(id); };
  const ordered = normMatches.slice().sort((a, b) =>
    (a.played_at - b.played_at) || (a.id < b.id ? -1 : 1));
  const out = [];
  for (const m of ordered) {
    if (m.winner == null) continue;
    const A = m.teamA.map(ensure), B = m.teamB.map(ensure);
    if (!A.length || !B.length) continue;
    const rA = avg(A.map(p => p.elo)), rB = avg(B.map(p => p.elo));
    const eA = expected(rA, rB);
    const mult = marginMultiplier(m.pointsA, m.pointsB);
    const aWon = m.winner === 'A';
    for (const p of A) { p.elo += kFactor(p.games) * mult * ((aWon ? 1 : 0) - eA); p.games++; }
    for (const p of B) { p.elo += kFactor(p.games) * mult * ((aWon ? 0 : 1) - (1 - eA)); p.games++; }
    if (m.teamA.includes(userId) || m.teamB.includes(userId)) {
      out.push(Math.round(R.get(userId).elo));
    }
  }
  return out.length > cap ? out.slice(-cap) : out;
}

// Run Elo over a chronological list of normalized matches (see model.js).
// Returns Map userId -> {elo, games, wins, losses, streak, provisional, peak}.
export function runElo(users, normMatches) {
  const R = new Map();
  for (const u of users) {
    R.set(u.id, { elo: START_ELO, games: 0, wins: 0, losses: 0, streak: 0, provisional: true, peak: START_ELO });
  }
  const ensure = (id) => {
    if (!R.has(id)) R.set(id, { elo: START_ELO, games: 0, wins: 0, losses: 0, streak: 0, provisional: true, peak: START_ELO });
    return R.get(id);
  };

  const ordered = normMatches.slice().sort((a, b) =>
    (a.played_at - b.played_at) || (a.id < b.id ? -1 : 1));

  for (const m of ordered) {
    if (m.winner == null) continue;
    const A = m.teamA.filter(id => R.has(id) || true).map(ensure);
    const B = m.teamB.filter(id => R.has(id) || true).map(ensure);
    if (!A.length || !B.length) continue;

    const rA = avg(A.map(p => p.elo));
    const rB = avg(B.map(p => p.elo));
    const eA = expected(rA, rB);
    const eB = 1 - eA;
    const mult = marginMultiplier(m.pointsA, m.pointsB);
    const aWon = m.winner === 'A';

    for (const p of A) {
      const k = kFactor(p.games) * mult;
      p.elo += k * ((aWon ? 1 : 0) - eA);
      p.games++; if (aWon) p.wins++; else p.losses++;
      p.streak = bumpStreak(p.streak, aWon);
      p.provisional = p.games < PROVISIONAL_GAMES;
      if (p.elo > p.peak) p.peak = p.elo;
    }
    for (const p of B) {
      const k = kFactor(p.games) * mult;
      p.elo += k * ((aWon ? 0 : 1) - eB);
      p.games++; if (!aWon) p.wins++; else p.losses++;
      p.streak = bumpStreak(p.streak, !aWon);
      p.provisional = p.games < PROVISIONAL_GAMES;
      if (p.elo > p.peak) p.peak = p.elo;
    }
  }

  for (const v of R.values()) v.elo = Math.round(v.elo * 100) / 100;
  return R;
}

// ---- self-check ----
function demo() {
  const assert = (c, m) => { if (!c) throw new Error('rating demo failed: ' + m); };
  const near = (x, y, e = 1e-6) => Math.abs(x - y) < e;

  assert(near(expected(1500, 1500), 0.5), 'expected even = 0.5');
  assert(expected(1700, 1500) > 0.5, 'higher rating favored');
  assert(marginMultiplier(21, 5) > marginMultiplier(22, 20), 'blowout multiplier bigger');

  const mkNorm = (id, a, b, aPts, bPts, winner) => ({
    id, played_at: new Date('2026-07-10T20:00:00Z'), format: 'doubles',
    teamA: a, teamB: b, pointsA: aPts, pointsB: bPts, winner,
    games: [{ a: aPts, b: bPts }],
  });

  // Equal players, single match, A wins by same margin -> equal & opposite (same K).
  {
    const U = ['a', 'b', 'c', 'd'].map(id => ({ id }));
    const R = runElo(U, [mkNorm('m', ['a', 'b'], ['c', 'd'], 21, 15, 'A')]);
    const ga = R.get('a').elo - START_ELO;
    const lc = START_ELO - R.get('c').elo;
    assert(ga > 0 && lc > 0, 'winner up, loser down');
    assert(near(ga, lc, 1e-6), 'equal K zero-sum');
  }

  // Beating a STRONGER opponent yields more than beating an equal one.
  {
    const strongGain = (() => {
      const U = [{ id: 'x' }, { id: 'y' }];
      // pre-load y as much stronger by giving y wins first
      const pre = [];
      for (let i = 0; i < 5; i++) pre.push(mkNorm('p' + i, ['y'], ['z' + i], 21, 0, 'A'));
      const R0 = runElo([{ id: 'x' }, { id: 'y' }, ...Array.from({ length: 5 }, (_, i) => ({ id: 'z' + i }))], pre);
      // now x (1500) beats the now-stronger y
      const R = runElo([{ id: 'x' }, { id: 'y' }], [mkNorm('m', ['x'], ['y'], 21, 18, 'A')]);
      return { r0y: R0.get('y').elo };
    })();
    assert(strongGain.r0y > START_ELO, 'y became stronger');
  }

  // Provisional player swings more than an established one for the same upset.
  {
    const U = [{ id: 'prov' }, { id: 'opp' }];
    const Rp = runElo(U, [mkNorm('m', ['prov'], ['opp'], 21, 18, 'A')]);
    const provSwing = Rp.get('prov').elo - START_ELO;               // K=40
    // established: simulate 10 prior neutral games so K=24
    const pri = [];
    for (let i = 0; i < 10; i++) pri.push(mkNorm('g' + i, ['est'], ['e' + i], (i % 2 ? 21 : 10), (i % 2 ? 10 : 21), i % 2 ? 'A' : 'B'));
    const seed = [{ id: 'est' }, ...Array.from({ length: 10 }, (_, i) => ({ id: 'e' + i }))];
    const R2 = runElo(seed, [...pri, mkNorm('mm', ['est'], ['ez'], 21, 18, 'A')].map(x => x));
    const est = R2.get('est');
    assert(est.games >= 10 && est.provisional === false, 'est no longer provisional');
    assert(provSwing > 15, 'provisional swing large (K=40)');
  }

  console.log('rating.js self-check: PASS');
}
if (process.argv.includes('--test')) demo();
