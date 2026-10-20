// lib/epithets.js — ฉายา (Chāyā), the tier above Mythic.
//
// Two rules make an epithet the rarest thing in the club:
//   1. exactly ONE holder per epithet, and
//   2. exactly ONE epithet per player.
// So if you top three boards you must CHOOSE one; the other two pass down to
// the next-best player. Glory spreads instead of one person hoarding it.

// Standard deviation of per-match point margin → 0..100 "how steady are you".
// Low spread = metronome, high spread = rollercoaster. Feeds the Metronome
// epithet; lives here because that is the only thing that reads it.
export function consistencyScore(marginSeq) {
  const xs = (marginSeq || []).filter(Number.isFinite);
  if (xs.length < 3) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const varr = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  const sd = Math.sqrt(varr);
  // 0 sd → 100, sd of 12+ points/game → ~0
  return Math.max(0, Math.min(100, Math.round(100 - (sd / 12) * 100)));
}

export const EPITHETS = [
  { key: 'ep_dragon', th: 'มังกรสนาม', en: 'Court Dragon', icon: '🐉',
    blurb: 'the highest rating this club has ever seen',
    min: 1, score: (p, c) => Math.round((c.standings.get(p.id) || {}).peak || 0) },

  { key: 'ep_thunder', th: 'สายฟ้าฟาด', en: 'Thunderclap', icon: '⚡',
    blurb: 'wins by the widest margins', min: 2, score: (p, c) => c.extra.blowouts.get(p.id) || 0 },

  { key: 'ep_cold', th: 'เลือดเย็น', en: 'Coldblood', icon: '🧊',
    blurb: 'never blinks in a deciding game', min: 60,
    score: (p) => (p.game3Played >= 3 ? Math.round((p.game3Wins / p.game3Played) * 100) : 0) },

  { key: 'ep_flame', th: 'ไฟไม่มอด', en: 'Everflame', icon: '🔥',
    blurb: 'the longest unbroken run of wins', min: 4, score: (p) => p.longestWin || 0 },

  { key: 'ep_swan', th: 'หงส์ทมิฬ', en: 'Black Swan', icon: '🦢',
    blurb: 'topples players rated far above them', min: 2, score: (p, c) => c.extra.giantWins.get(p.id) || 0 },

  { key: 'ep_wall', th: 'กำแพงเหล็ก', en: 'Iron Wall', icon: '🛡️',
    blurb: 'concedes fewer points than anyone', min: 1,
    score: (p) => (p.gamesCount >= 10 ? Math.round((30 - p.pointsAgainst / p.gamesCount) * 10) : 0) },

  { key: 'ep_assassin', th: 'มือสังหาร', en: 'The Assassin', icon: '🎯',
    blurb: 'the deadliest win rate in the club', min: 55,
    score: (p) => (p.matches >= 10 ? Math.round((p.wins / p.matches) * 100) : 0) },

  { key: 'ep_twin', th: 'คู่บารมี', en: 'Twin Fates', icon: '🤝',
    blurb: 'one half of the most devastating pair', min: 60,
    score: (p) => {
      let best = 0;
      for (const pr of p.partners.values()) if (pr.games >= 5) best = Math.max(best, Math.round((pr.wins / pr.games) * 100));
      return best;
    } },

  { key: 'ep_night', th: 'ราตรีกาล', en: 'Nightfall', icon: '🌙',
    blurb: 'rules the court after dark', min: 3, score: (p) => p.nightMatches || 0 },

  { key: 'ep_tireless', th: 'ไม่รู้จักเหนื่อย', en: 'Tireless', icon: '🏃',
    blurb: 'simply never stops playing', min: 10, score: (p) => p.matches || 0 },

  { key: 'ep_gem', th: 'เพชรน้ำหนึ่ง', en: 'Flawless Gem', icon: '💎',
    blurb: 'the most metronomic scorelines in the club', min: 40,
    score: (p, c) => (p.matches >= 6 ? (c.consistency(p) || 0) : 0) },

  { key: 'ep_hunter', th: 'นักล่าแต้ม', en: 'Point Hunter', icon: '🏹',
    blurb: 'has scored more points than anyone alive', min: 200, score: (p) => p.pointsFor || 0 },
];
export const EPITHET_BY_KEY = Object.fromEntries(EPITHETS.map(e => [e.key, e]));

// Extra aggregates the base model doesn't track.
export function buildEpithetExtra(model, standings, giantWins) {
  const blowouts = new Map();
  for (const m of model.matches) {
    if (m.winner == null) continue;
    const side = m.winner === 'A' ? m.teamA : m.teamB;
    for (const g of m.games || []) {
      if (Math.abs(g.a - g.b) >= 15) {
        for (const id of side) blowouts.set(id, (blowouts.get(id) || 0) + 1);
        break;
      }
    }
  }
  return { blowouts, giantWins: giantWins || new Map() };
}

/**
 * Assign epithets. `choices` maps playerId -> preferred epithet key.
 * Deterministic: honour explicit choices first, then fill the rest by rank.
 * @returns Map epithetKey -> {holderId, score}
 */
export function assignEpithets(model, standings, ctx, choices = new Map()) {
  const players = [...model.players.values()].filter(p => p.matches > 0);
  const ranked = new Map();
  for (const e of EPITHETS) {
    const list = players
      .map(p => ({ id: p.id, s: Number(e.score(p, ctx)) || 0, matches: p.matches }))
      .filter(x => x.s >= e.min)
      .sort((a, b) => (b.s - a.s) || (b.matches - a.matches) || (a.id < b.id ? -1 : 1));
    ranked.set(e.key, list);
  }
  const out = new Map();
  const taken = new Set();

  // pass 1 — a player who explicitly chose this epithet gets first refusal
  for (const e of EPITHETS) {
    for (const c of ranked.get(e.key)) {
      if (taken.has(c.id)) continue;
      if (choices.get(c.id) === e.key) { out.set(e.key, { holderId: c.id, score: c.s }); taken.add(c.id); break; }
    }
  }
  // pass 2 — fill the rest, skipping anyone who wants a different epithet
  for (const e of EPITHETS) {
    if (out.has(e.key)) continue;
    for (const c of ranked.get(e.key)) {
      if (taken.has(c.id)) continue;
      const want = choices.get(c.id);
      if (want && want !== e.key && ranked.get(want) && ranked.get(want).some(x => x.id === c.id)) continue;
      out.set(e.key, { holderId: c.id, score: c.s }); taken.add(c.id); break;
    }
  }
  return out;
}

// Which epithets would this player top if nobody else were in the way?
export function eligibleFor(model, standings, ctx, userId) {
  const players = [...model.players.values()].filter(p => p.matches > 0);
  const me = model.players.get(userId);
  if (!me || me.matches <= 0) return [];
  const out = [];
  for (const e of EPITHETS) {
    const mine = Number(e.score(me, ctx)) || 0;
    if (mine < e.min) continue;
    const best = players.reduce((m, p) => Math.max(m, Number(e.score(p, ctx)) || 0), 0);
    if (mine >= best) out.push({ key: e.key, th: e.th, en: e.en, icon: e.icon, blurb: e.blurb, score: mine });
  }
  return out;
}

// ---- self-check ----
function demo() {
  const assert = (c, m) => { if (!c) throw new Error('epithets demo failed: ' + m); };
  const mk = (id, o = {}) => ({
    id, nickname: id, matches: o.matches ?? 12, wins: o.wins ?? 6, gamesCount: o.gamesCount ?? 20,
    pointsFor: o.pointsFor ?? 400, pointsAgainst: o.pointsAgainst ?? 300, longestWin: o.longestWin ?? 2,
    game3Played: o.g3p ?? 0, game3Wins: o.g3w ?? 0, nightMatches: o.night ?? 0,
    partners: o.partners ?? new Map(), marginSeq: o.marginSeq ?? [1, 2, 3],
  });
  const A = mk('a', { longestWin: 9, wins: 11, matches: 12 });
  const B = mk('b', { longestWin: 5, night: 9 });
  const C = mk('c', { longestWin: 2, night: 1, matches: 40 });
  const model = { players: new Map([['a', A], ['b', B], ['c', C]]), matches: [] };
  const standings = new Map([['a', { peak: 1900 }], ['b', { peak: 1600 }], ['c', { peak: 1500 }]]);
  const ctx = { standings, extra: buildEpithetExtra(model, standings, new Map()), consistency: () => 50 };

  const noChoice = assignEpithets(model, standings, ctx);
  const holders = [...noChoice.values()].map(v => v.holderId);
  assert(new Set(holders).size === holders.length, 'a player never holds two epithets');
  // A tops peak rating AND the streak board, but can only keep one — the
  // higher-prestige epithet wins and the streak passes down to B.
  assert(noChoice.get('ep_dragon').holderId === 'a', 'peak rating -> a');
  assert(noChoice.get('ep_flame').holderId === 'b', 'streak passed down to b, got ' + JSON.stringify(noChoice.get('ep_flame')));

  // If A explicitly chooses Assassin, Court Dragon must pass down instead.
  const chosen = assignEpithets(model, standings, ctx, new Map([['a', 'ep_assassin']]));
  assert(chosen.get('ep_assassin').holderId === 'a', 'explicit choice honoured');
  assert(chosen.get('ep_dragon').holderId !== 'a', 'unchosen epithet passed down');
  const h2 = [...chosen.values()].map(v => v.holderId);
  assert(new Set(h2).size === h2.length, 'still one epithet per player after choosing');

  const elig = eligibleFor(model, standings, ctx, 'a');
  assert(elig.some(e => e.key === 'ep_flame'), 'a is eligible for Everflame');
  assert(!elig.some(e => e.key === 'ep_night'), 'a is not eligible for Nightfall');

  console.log('epithets.js self-check: PASS (' + EPITHETS.length + ' epithets)');
}
if (process.argv.includes('--test')) demo();
