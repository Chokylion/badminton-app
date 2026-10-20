// lib/model.js — pure, dependency-free aggregation over match rows.
// Everything the leaderboard, profiles, map and titles need is derived here from
// the single source of truth (matches + games + match_players). No DB, no I/O.

export function pairKey(a, b) {
  return [a, b].slice().sort().join('|');
}

// Turn a raw DB match (with games[] and players[]) into a normalized shape.
export function normalizeMatch(m) {
  const teamA = m.players.filter(p => p.team === 'A').map(p => p.user_id);
  const teamB = m.players.filter(p => p.team === 'B').map(p => p.user_id);
  const games = (m.games || []).slice().sort((x, y) => x.game_no - y.game_no)
    .map(g => ({ a: g.score_a, b: g.score_b }));

  let gamesWonA = 0, gamesWonB = 0, pointsA = 0, pointsB = 0, deuceGames = 0;
  for (const g of games) {
    pointsA += g.a; pointsB += g.b;
    if (g.a > g.b) gamesWonA++; else if (g.b > g.a) gamesWonB++;
    if (Math.min(g.a, g.b) >= 20) deuceGames++;
  }
  const winner = gamesWonA === gamesWonB ? null : (gamesWonA > gamesWonB ? 'A' : 'B');
  const last = games[games.length - 1] || { a: 0, b: 0 };
  const first = games[0] || { a: 0, b: 0 };
  const deciderMargin = Math.abs(last.a - last.b);
  const wonGame1By = first.a === first.b ? null : (first.a > first.b ? 'A' : 'B');
  const wentTo3 = games.length >= 3;
  const g3 = games.length >= 3 ? games[2] : null;
  const game3Winner = g3 ? (g3.a > g3.b ? 'A' : (g3.b > g3.a ? 'B' : null)) : null;
  const playedAt = new Date(m.played_at);
  // Classify the play hour in the club's fixed timezone (Bangkok, UTC+7) so
  // morning/night stats + titles are identical everywhere — the serverless
  // runtime is UTC, a dev box may be local; getHours() would disagree.
  const bkkHour = Math.floor(((playedAt.getTime() + 7 * 3600000) % 86400000) / 3600000);

  return {
    id: m.id,
    played_at: playedAt,
    hour: bkkHour,
    format: m.format,
    logged_by: m.logged_by,
    teamA, teamB,
    games,
    gamesWonA, gamesWonB, winner,
    pointsA, pointsB,
    deuceGames, deciderMargin, wonGame1By, wentTo3, game3Winner,
  };
}

function teamOf(nm, userId) {
  if (nm.teamA.includes(userId)) return 'A';
  if (nm.teamB.includes(userId)) return 'B';
  return null;
}
function oppTeam(t) { return t === 'A' ? 'B' : 'A'; }

// Build the full derived model from users + normalized matches (already filtered
// to the desired scope, e.g. all-time or one month). Chronological order matters
// for streaks, so we sort ascending by played_at then id.
export function buildModel(users, normMatches) {
  const matches = normMatches.slice().sort((a, b) =>
    (a.played_at - b.played_at) || (a.id < b.id ? -1 : 1));

  const players = new Map();
  for (const u of users) {
    players.set(u.id, {
      id: u.id,
      nickname: u.nickname,
      avatar_emoji: u.avatar_emoji,
      avatar_color: u.avatar_color,
      created_at: u.created_at ? new Date(u.created_at) : null,
      role: u.role,
      matches: 0, wins: 0, losses: 0,
      doublesMatches: 0, doublesWins: 0,
      gamesCount: 0, pointsFor: 0, pointsAgainst: 0,
      deuceGamesInvolved: 0,
      closeLosses: 0,            // deciding game lost by <=2
      game3Played: 0, game3Wins: 0,
      comebackWins: 0,           // won after losing game 1
      threeGameWins: 0,          // won a match that went to 3 games
      winsVsHigher: 0,           // filled later using elo map
      nightMatches: 0, morningMatches: 0,
      logged: 0,                 // matches this user logged
      resultSeq: [],             // chronological 1/0 win flags
      marginSeq: [],             // per-match (pointsFor-pointsAgainst)/gamesCount for variance
      firstMatchAt: null,
      partners: new Map(),       // partnerId -> {games, wins}
      opponents: new Map(),      // oppId -> {games, wins, losses}  (this player's view)
    });
  }

  const partnerships = new Map(); // pairKey -> {ids:[a,b], games, wins, losses, pointDiff, seq:[]}
  const rivalries = new Map();    // pairKey -> {ids:[a,b], meetings}
  const oppDuos = new Map();      // key: playerId + '>' + pairKey(duo) -> {games, losses} (for bogey team)

  for (const m of matches) {
    const roster = [...m.teamA, ...m.teamB].filter(id => players.has(id));
    if (m.logged_by && players.has(m.logged_by)) players.get(m.logged_by).logged++;
    if (m.winner == null) continue; // skip malformed

    for (const id of roster) {
      const p = players.get(id);
      const t = teamOf(m, id);
      const won = t === m.winner;
      const pf = t === 'A' ? m.pointsA : m.pointsB;
      const pa = t === 'A' ? m.pointsB : m.pointsA;

      p.matches++;
      p.gamesCount += m.games.length;
      p.pointsFor += pf; p.pointsAgainst += pa;
      p.deuceGamesInvolved += m.deuceGames;
      if (won) p.wins++; else p.losses++;
      p.resultSeq.push(won ? 1 : 0);
      p.marginSeq.push(m.games.length ? (pf - pa) / m.games.length : 0);
      if (!p.firstMatchAt || m.played_at < p.firstMatchAt) p.firstMatchAt = m.played_at;
      if (m.hour >= 22 || m.hour < 5) p.nightMatches++;
      if (m.hour >= 5 && m.hour < 9) p.morningMatches++;
      if (m.format === 'doubles') { p.doublesMatches++; if (won) p.doublesWins++; }

      // close loss on deciding game
      if (!won && m.deciderMargin <= 2) p.closeLosses++;
      // game 3
      if (m.wentTo3 && m.game3Winner) {
        p.game3Played++;
        if (m.game3Winner === t) p.game3Wins++;
      }
      // comeback: lost game 1 but won the match
      if (won && m.wonGame1By && m.wonGame1By !== t) p.comebackWins++;
      if (won && m.wentTo3) p.threeGameWins++;

      // partners (same team, doubles)
      const mates = (t === 'A' ? m.teamA : m.teamB).filter(x => x !== id && players.has(x));
      for (const mate of mates) {
        if (!p.partners.has(mate)) p.partners.set(mate, { games: 0, wins: 0 });
        const pr = p.partners.get(mate);
        pr.games++; if (won) pr.wins++;
      }
      // opponents
      const opps = (t === 'A' ? m.teamB : m.teamA).filter(x => players.has(x));
      for (const opp of opps) {
        if (!p.opponents.has(opp)) p.opponents.set(opp, { games: 0, wins: 0, losses: 0 });
        const o = p.opponents.get(opp);
        o.games++; if (won) o.wins++; else o.losses++;
      }
      // bogey duo: the opposing pair (doubles only)
      if (!won && m.format === 'doubles') {
        const oppPair = (t === 'A' ? m.teamB : m.teamA).filter(x => players.has(x));
        if (oppPair.length === 2) {
          const k = id + '>' + pairKey(oppPair[0], oppPair[1]);
          if (!oppDuos.has(k)) oppDuos.set(k, { player: id, duo: [oppPair[0], oppPair[1]].sort(), games: 0, losses: 0 });
          const bd = oppDuos.get(k); bd.games++; bd.losses++;
        }
      }
    }

    // partnership pairs (doubles, per team of 2)
    for (const team of [m.teamA, m.teamB]) {
      const t = team === m.teamA ? 'A' : 'B';
      const pr = team.filter(x => players.has(x));
      if (m.format === 'doubles' && pr.length === 2) {
        const k = pairKey(pr[0], pr[1]);
        if (!partnerships.has(k)) partnerships.set(k, { ids: [pr[0], pr[1]].sort(), games: 0, wins: 0, losses: 0, pointDiff: 0, seq: [] });
        const P = partnerships.get(k);
        const won = t === m.winner;
        const pf = t === 'A' ? m.pointsA : m.pointsB;
        const pa = t === 'A' ? m.pointsB : m.pointsA;
        P.games++; if (won) P.wins++; else P.losses++;
        P.pointDiff += (pf - pa);
        P.seq.push(won ? 1 : 0);
      }
    }

    // rivalries (each cross-team pair meets)
    for (const a of m.teamA) for (const b of m.teamB) {
      if (!players.has(a) || !players.has(b)) continue;
      const k = pairKey(a, b);
      if (!rivalries.has(k)) rivalries.set(k, { ids: [a, b].sort(), meetings: 0 });
      rivalries.get(k).meetings++;
    }
  }

  // finalize per-player derived fields
  for (const p of players.values()) {
    p.winrate = p.matches ? p.wins / p.matches : 0;
    p.doublesWinrate = p.doublesMatches ? p.doublesWins / p.doublesMatches : 0;
    p.pointsPlayed = p.pointsFor + p.pointsAgainst;
    p.concededPerGame = p.gamesCount ? p.pointsAgainst / p.gamesCount : 0;
    p.distinctPartners = p.partners.size;
    p.game3Winrate = p.game3Played ? p.game3Wins / p.game3Played : 0;
    // current streak (sign = W+/L-), longest win & loss streaks
    p.currentStreak = currentStreak(p.resultSeq);
    p.longestWin = longestRun(p.resultSeq, 1);
    p.longestLoss = longestRun(p.resultSeq, 0);
    p.variance = variance(p.marginSeq);
    // partner concentration
    let maxP = 0, totP = 0;
    for (const pr of p.partners.values()) { totP += pr.games; if (pr.games > maxP) maxP = pr.games; }
    p.partnerConcentration = totP ? maxP / totP : 0;
    p.totalPartnerGames = totP;
  }

  return { players, matches, partnerships, rivalries, oppDuos };
}

export function currentStreak(seq) {
  if (!seq.length) return 0;
  const last = seq[seq.length - 1];
  let n = 0;
  for (let i = seq.length - 1; i >= 0 && seq[i] === last; i--) n++;
  return last === 1 ? n : -n;
}
export function longestRun(seq, val) {
  let best = 0, cur = 0;
  for (const s of seq) { if (s === val) { cur++; if (cur > best) best = cur; } else cur = 0; }
  return best;
}
export function variance(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
}

// ---- self-check ----
function demo() {
  const U = ['ken', 'nok', 'bank', 'mai'].map(id => ({ id, nickname: id, avatar_emoji: '🦅', avatar_color: '#F97316', created_at: '2026-07-01' }));
  const mk = (id, a, b, games, when) => ({
    id, played_at: when, format: 'doubles', logged_by: a[0],
    players: [...a.map(u => ({ user_id: u, team: 'A' })), ...b.map(u => ({ user_id: u, team: 'B' }))],
    games: games.map((g, i) => ({ game_no: i + 1, score_a: g[0], score_b: g[1] })),
  });
  const raw = [
    mk('m1', ['ken', 'nok'], ['bank', 'mai'], [[21, 18], [21, 15]], '2026-07-10T20:00:00Z'),
    mk('m2', ['ken', 'nok'], ['bank', 'mai'], [[19, 21], [21, 19], [24, 22]], '2026-07-11T20:00:00Z'),
    mk('m3', ['bank', 'mai'], ['ken', 'nok'], [[21, 10], [21, 12]], '2026-07-12T20:00:00Z'),
  ];
  const norm = raw.map(normalizeMatch);
  const model = buildModel(U, norm);
  const ken = model.players.get('ken');
  const assert = (c, m) => { if (!c) throw new Error('model demo failed: ' + m); };
  assert(ken.matches === 3, 'ken matches');
  assert(ken.wins === 2 && ken.losses === 1, 'ken w/l');
  assert(model.partnerships.get(pairKey('ken', 'nok')).games === 3, 'ken-nok games');
  assert(norm[1].wentTo3 && norm[1].deuceGames === 1, 'm2 deuce/3');
  assert(norm[1].winner === 'A', 'm2 winner A');   // ken/nok win 2-1
  assert(ken.comebackWins === 1, 'ken comeback (m2 lost g1 won match)');
  assert(model.rivalries.get(pairKey('ken', 'bank')).meetings === 3, 'ken-bank meetings');
  assert(ken.currentStreak === -1, 'ken current streak (lost m3)');
  console.log('model.js self-check: PASS');
}
if (process.argv.includes('--test')) demo();
