import { pathToFileURL } from 'node:url';
// lib/campaign.js — the Goose Trail: stages, bosses, eggs and relics.
//
// THE POINT: gear finally has somewhere to be used. Coin Find and XP Boost are
// numbers on a screen; POWER is the number that decides whether you clear a
// stage, so upgrading a racket becomes a thing you feel.
//
// THE RULE THAT KEEPS IT HONEST: attempts are paid for in Goose Eggs, and eggs
// come ONLY from playing real badminton. You cannot grind the trail without
// turning up to the court. Nothing here touches Elo, rank or titles.

// One match = this many eggs. Derived from match history, never stored, so it
// cannot be forged — same trick as XP.
export const EGGS_PER_MATCH = 2;
export const EGG_COST = 1;              // one egg per attempt

/* ------------------------------------------------------------------ power */
// A single number that says how kitted-out you are. Deliberately dominated by
// evolution and sockets rather than raw +level, so the long game matters most.
export const POWER = {
  perLevel: 10,          // +1 .. +9
  perStage: 40,          // awakened / ascended / transcendent
  wink: 30,
  perSocket: 25,         // a filled socket
  gradeBonus: { normal: 0, super: 15, heavenly: 35, omni: 70 },
  perCharm: 12,
  gildedCharm: 8,        // on top
};
const STAGE_ORDER = ['base', 'awakened', 'ascended', 'transcendent'];

export function powerOf({ items = [], charms = [] } = {}) {
  let p = 0;
  for (const g of items) {
    if (!g || !g.owned) continue;
    p += Math.max(0, Math.min(9, g.level | 0)) * POWER.perLevel;
    p += Math.max(0, STAGE_ORDER.indexOf(g.stage)) * POWER.perStage;
    if (g.wink) p += POWER.wink;
    for (const s of g.subs || []) {
      p += POWER.perSocket + (POWER.gradeBonus[s.grade] || 0);
    }
  }
  for (const c of charms) {
    p += POWER.perCharm + (c && c.gilded ? POWER.gildedCharm : 0);
  }
  return Math.round(p);
}

/* ----------------------------------------------------------------- stages */
// power = the recommended power. Below it you can still try; above it you are
// safe. Every fifth stage is a boss.
const st = (n, name, enemy, icon, power, note) => ({ n, name, enemy, icon, power, boss: n % 5 === 0, note });
export const STAGES = [
  st(1, 'Car Park', 'Warm-Up Cone', '🚧', 0, 'It has not moved in years. It will not start now.'),
  st(2, 'Car Park', 'Rogue Shuttlecock', '🏸', 25, 'Somebody hit it in 2019. It never came down.'),
  st(3, 'Car Park', 'The Puddle', '💧', 55, 'Deeper than it looks. Everything is, out here.'),
  st(4, 'Car Park', 'Squeaky Trolley', '🛒', 90, 'Announces your arrival to the entire postcode.'),
  st(5, 'Car Park', 'The Vending Machine', '🥤', 130, 'It ate your coin in 2021. Tonight it answers for that.'),

  st(6, 'Sports Hall', 'Overhead Fan', '🌀', 175, 'Redirects every clear. Claims innocence.'),
  st(7, 'Sports Hall', 'Sweaty Beginner', '😅', 220, 'No technique. Infinite enthusiasm. Genuinely dangerous.'),
  st(8, 'Sports Hall', 'The Wall', '🧱', 270, 'Returns everything. Says nothing.'),
  st(9, 'Sports Hall', 'Line Judge', '👁️', 325, 'Has never once been wrong. Ask them.'),
  st(10, 'Sports Hall', 'Coach Gary', '📋', 390, 'One tactic. One clipboard. Thirty years of being right.'),

  st(11, 'Regionals', 'Regional Semi-Finalist', '🥉', 460, 'Mentions it constantly. Earned the right to.'),
  st(12, 'Regionals', 'The Smasher', '💥', 535, 'One shot. No plan B. Rarely needs one.'),
  st(13, 'Regionals', 'Deuce Incarnate', '🔁', 615, 'The game will not end. That is the whole attack.'),
  st(14, 'Regionals', 'Photo Finish', '📸', 700, 'Wins by margins nobody can see.'),
  st(15, 'Regionals', 'The Undefeated Intern', '🧑‍💼', 800, 'Started last month. Has not lost. Nobody discusses it.'),

  st(16, 'Goose Realm', 'Feathered Sentinel', '🪶', 920, 'Guards the pond. Judges your footwork.'),
  st(17, 'Goose Realm', 'Migration Storm', '🌪️', 1050, 'Four thousand kilometres of accumulated opinion.'),
  st(18, 'Goose Realm', 'The Flock', '🦢', 1200, 'They have been planning this since spring.'),
  st(19, 'Goose Realm', 'Bread Guardian', '🍞', 1370, 'Between you and the loaf. Immovable.'),
  st(20, 'Goose Realm', 'The Apex Goose', '👑', 1600, 'The first goose to hold a racket. Still holding it.'),
];
export const STAGE_BY_N = Object.fromEntries(STAGES.map(s => [s.n, s]));
export const MAX_STAGE = STAGES.length;
export const CHAPTERS = [...new Set(STAGES.map(s => s.name))];
export const BOSSES = STAGES.filter(s => s.boss);

// You may attempt anything up to one past your best clear.
export const unlockedUpTo = (cleared) => Math.min(MAX_STAGE, Math.max(1, (cleared | 0) + 1));
export const canAttempt = (n, cleared) => n >= 1 && n <= unlockedUpTo(cleared);

/* ------------------------------------------------------------------- odds */
export const MIN_WIN = 0.20, MAX_WIN = 0.95;
// Power ratio -> win chance. At the recommended power you are a coin flip and a
// bit; double it and you are nearly safe; half and it hurts.
export function winChance(power, stage) {
  const need = Math.max(1, stage.power);
  // Clamp first: a negative power would make Math.pow return NaN, and NaN
  // slides straight through Math.min/max into the odds.
  const p = Number.isFinite(power) ? Math.max(0, power) : 0;
  const ratio = (p + 40) / (need + 40);
  const raw = 0.5 * Math.pow(ratio, 1.35);
  const capped = stage.boss ? MAX_WIN - 0.08 : MAX_WIN;
  return Math.max(MIN_WIN, Math.min(capped, raw));
}

/* ---------------------------------------------------------------- rewards */
// Coins scale with the stage so late stages are worth the trip.
export const stageCoins = (stage) => 300 + stage.n * 120 + (stage.boss ? 1200 : 0);
export const loseCoins = (stage) => Math.round(stageCoins(stage) * 0.25);

// Drop table per stage band. `kind` is resolved by the caller against the real
// catalogues, so this file never needs to know what a "skin" is.
function dropTable(stage) {
  const t = [];
  const deep = stage.n / MAX_STAGE;                       // 0 .. 1
  t.push({ kind: 'stone', tier: stage.boss ? 'divine' : deep > 0.6 ? 'sacred' : deep > 0.3 ? 'sacred' : 'bless', w: 30 });
  t.push({ kind: 'element', rarity: stage.boss ? 'legendary' : deep > 0.7 ? 'epic' : deep > 0.35 ? 'rare' : 'common', w: 26 });
  t.push({ kind: 'charm', w: 22 });
  t.push({ kind: 'skin', w: 12 });
  t.push({ kind: 'coins', w: 10 });
  return t;
}
export function rollDrop(stage, rng) {
  const t = dropTable(stage);
  const total = t.reduce((s, x) => s + x.w, 0);
  let r = rng() * total;
  for (const x of t) { r -= x.w; if (r <= 0) return x; }
  return t[t.length - 1];
}
// A clear rolls this many drops. Bosses roll more; the Lucky Lanyard relic
// adds one on top.
export const dropCount = (stage, extra = 0) => (stage.boss ? 2 : 1) + (extra | 0);

/* -------------------------------------------------------------- boss eggs */
// The five unbuyable eggs come from here and nowhere else. Rolled SEPARATELY
// from the normal drop table so adding eggs never waters down stones and gear.
export const BOSS_EGG_DROPS = {
  5:  { chance: 0.35, pool: ['rainbow'] },
  10: { chance: 0.40, pool: ['meme', 'heaven'] },
  15: { chance: 0.45, pool: ['hell', 'heaven', 'meme'] },
  20: { chance: 0.55, pool: ['mythical', 'rainbow'] },
};
export function rollEgg(stage, rng) {
  const d = BOSS_EGG_DROPS[stage.n];
  if (!d || !stage.boss) return null;
  if (rng() >= d.chance) return null;
  return d.pool[Math.min(d.pool.length - 1, Math.floor(rng() * d.pool.length))];
}

/* ------------------------------------------------------- combat: the build */
// Three numbers, so a build is a CHOICE and not just "more power".
//   Damage    = Power. Decides whether you win at all.
//   Crit      = a won stage pays double coins and rolls an extra drop.
//   Lifesteal = the Goose Egg is handed back, win or lose.
// Every one of them rises when you forge, evolve, bless or wear a charm, which
// is the whole point: upgrading gear has to be visible on this screen.
export const COMBAT = {
  crit: { base: 5, perLevel: 1.5, perStage: 5, perSub: 2, wink: 4, perGild: 1, cap: 60 },
  life: { base: 2, perLevel: 1.0, perStage: 3, perSub: 2, wink: 3, perGild: 0.5, cap: 40 },
  // Which slot feeds which stat. Boots feed neither — they are pure Damage.
  from: { crit: 'racket', life: 'shuttle' },
  // Set perks that pay out in combat rather than in coins.
  setCrit: { gamble: 15, brainrot: 5 },
  setLife: { endline: 12, honour: 6 },
};
const contrib = (g, c) => {
  if (!g || !g.owned) return 0;
  return Math.max(0, Math.min(9, g.level | 0)) * c.perLevel
    + Math.max(0, STAGE_ORDER.indexOf(g.stage)) * c.perStage
    + (g.subs || []).length * c.perSub
    + (g.wink ? c.wink : 0);
};
export function combatOf({ items = [], charms = [], perks = [], power = null } = {}) {
  const find = (slot) => items.find(g => g && g.owned && g.slot === slot) || null;
  const gild = charms.filter(c => c && c.gilded).length;
  const mk = (c, slot, setMap) => {
    let v = c.base + contrib(find(slot), c) + gild * c.perGild;
    for (const p of perks) v += setMap[p] || 0;
    return Math.round(Math.max(0, Math.min(c.cap, v)) * 10) / 10;
  };
  return {
    damage: power == null ? powerOf({ items, charms }) : Math.round(power),
    crit: mk(COMBAT.crit, COMBAT.from.crit, COMBAT.setCrit),
    lifesteal: mk(COMBAT.life, COMBAT.from.life, COMBAT.setLife),
  };
}

/* ----------------------------------------------------------------- relics */
// The boss reward, and the reason to fight one. A relic bends a RULE rather
// than adding another percentage — that is what makes it feel different from
// gear and charms. Two may be equipped at once.
export const RELIC_SLOTS = 2;
export const RELICS = [
  {
    key: 'exactchange', name: 'Exact Change', icon: '🪙', boss: 5, rarity: 'rare',
    note: 'Prised out of the vending machine that ate your money.',
    perk: 'A failed forge gives the coins back.',
  },
  {
    key: 'whistle', name: "Coach's Whistle", icon: '📣', boss: 10, rarity: 'epic',
    note: 'Thirty years of being right, in brass.',
    perk: 'Your first blessing each day is Super Blessed or better.',
  },
  {
    key: 'lanyard', name: 'Intern Lanyard', icon: '🎫', boss: 15, rarity: 'epic',
    note: 'Access all areas. Nobody checked.',
    perk: 'Every stage clear rolls one extra drop.',
  },
  {
    key: 'apexcrown', name: 'Apex Crown', icon: '👑', boss: 20, rarity: 'legendary',
    note: 'Taken from the first goose to hold a racket.',
    perk: '+1 Goose Egg from every match you play.',
  },
];
export const RELIC_KEYS = RELICS.map(r => r.key);
export const RELIC_BY_KEY = Object.fromEntries(RELICS.map(r => [r.key, r]));
export const relicForBoss = (n) => RELICS.find(r => r.boss === n) || null;
// Only EQUIPPED relics do anything, capped at the slot count so a bad row can
// never switch on all four.
export function activeRelics(equipped) {
  const out = new Set();
  for (const k of (equipped || []).slice(0, RELIC_SLOTS)) if (RELIC_BY_KEY[k]) out.add(k);
  return out;
}
export const hasRelic = (equipped, key) => activeRelics(equipped).has(key);

/* ------------------------------------------------------------------ eggs */
export function eggsEarned(matchesPlayed, equipped) {
  const per = EGGS_PER_MATCH + (hasRelic(equipped, 'apexcrown') ? 1 : 0);
  return Math.max(0, matchesPlayed | 0) * per;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------- self-check */
const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (IS_MAIN && process.argv.includes('--test')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };

  // --- the trail ---
  assert(STAGES.length === 20, '20 stages, got ' + STAGES.length);
  assert(STAGES.every((s, i) => s.n === i + 1), 'stages are numbered 1..20 in order');
  assert(new Set(STAGES.map(s => s.enemy)).size === STAGES.length, 'every enemy is unique');
  assert(BOSSES.length === 4 && BOSSES.every(b => b.n % 5 === 0), 'a boss every fifth stage');
  assert(CHAPTERS.length === 4, 'four chapters, got ' + CHAPTERS.length);
  for (let i = 1; i < STAGES.length; i++) assert(STAGES[i].power > STAGES[i - 1].power, 'power requirement rises at ' + STAGES[i].n);
  for (const s of STAGES) assert(s.icon && s.note && s.name, `stage ${s.n} is described`);

  // --- unlocking ---
  assert(unlockedUpTo(0) === 1, 'a new player can only attempt stage 1');
  assert(canAttempt(1, 0) && !canAttempt(2, 0), 'stage 2 is locked until stage 1 is cleared');
  assert(canAttempt(2, 1) && !canAttempt(3, 1), 'clearing 1 unlocks exactly 2');
  assert(!canAttempt(0, 5) && !canAttempt(999, 5), 'out-of-range stages are refused');
  assert(unlockedUpTo(MAX_STAGE) === MAX_STAGE, 'the trail ends at the last stage');
  assert(canAttempt(3, 19) && canAttempt(MAX_STAGE, 19), 'cleared stages can be replayed for farm');

  // --- power ---
  assert(powerOf() === 0 && powerOf({}) === 0, 'no gear is no power');
  assert(powerOf({ items: [{ owned: false, level: 9 }] }) === 0, 'unowned gear is no power');
  const bare = { owned: true, level: 0, stage: 'base', subs: [] };
  assert(powerOf({ items: [bare] }) === 0, 'a +0 base item is no power');
  const p1 = powerOf({ items: [{ ...bare, level: 9 }] });
  assert(p1 === 90, 'a +9 base item is 90 power, got ' + p1);
  const p2 = powerOf({ items: [{ ...bare, level: 9, stage: 'transcendent' }] });
  assert(p2 === 90 + 3 * POWER.perStage, 'evolving is worth more than levelling');
  const p3 = powerOf({ items: [{ ...bare, level: 9, stage: 'transcendent', wink: true, subs: [{ grade: 'omni' }, { grade: 'omni' }, { grade: 'omni' }] }] });
  assert(p3 > p2, 'sockets and a wink add power');
  assert(powerOf({ items: [{ ...bare, level: 99 }] }) === 90, 'a corrupt level cannot inflate power');
  assert(powerOf({ items: [{ ...bare, level: -5 }] }) === 0, 'a negative level cannot go negative');
  assert(powerOf({ items: [{ ...bare, stage: 'nonsense' }] }) === 0, 'an unknown stage is worth nothing');
  assert(powerOf({ charms: [{ gilded: true }, {}] }) === POWER.perCharm * 2 + POWER.gildedCharm, 'charms add power, gilded more');
  // a fully maxed locker should comfortably clear the last stage
  const maxed = Array.from({ length: 3 }, () => ({
    owned: true, level: 9, stage: 'transcendent', wink: true,
    subs: [{ grade: 'omni' }, { grade: 'omni' }, { grade: 'omni' }],
  }));
  const best = powerOf({ items: maxed, charms: [{ gilded: true }, { gilded: true }] });
  assert(best > STAGES[MAX_STAGE - 1].power * 0.6, `a perfect locker (${best}) is in range of the last boss (${STAGES[MAX_STAGE - 1].power})`);

  // --- odds ---
  for (const s of STAGES) {
    const w = winChance(0, s);
    assert(w >= MIN_WIN && w <= MAX_WIN, `stage ${s.n} odds stay in range at zero power (${w})`);
    assert(winChance(1e9, s) <= MAX_WIN, `stage ${s.n} can never be a certainty`);
    assert(winChance(-500, s) >= MIN_WIN, 'negative power cannot go below the floor');
    assert(Number.isFinite(winChance(NaN, s)) && Number.isFinite(winChance(undefined, s)), 'junk power never produces NaN odds');
  }
  assert(winChance(0, STAGES[0]) > 0.4, 'stage 1 is beatable with nothing');
  const s20 = STAGE_BY_N[20];
  assert(winChance(0, s20) === MIN_WIN, 'the last boss with no gear is the floor');
  assert(winChance(s20.power, s20) > winChance(s20.power / 2, s20), 'more power is always better');
  assert(winChance(1e9, s20) < MAX_WIN, 'a boss is never as safe as a normal stage');
  for (const s of STAGES) {
    let prev = 0;
    for (const p of [0, 100, 400, 900, 2000]) {
      const w = winChance(p, s);
      assert(w >= prev - 1e-9, `odds are monotonic in power at stage ${s.n}`);
      prev = w;
    }
  }

  // --- rewards ---
  // Bosses pay a lump on top, so totals legitimately dip on the stage AFTER a
  // boss. What must hold is that like-for-like stages rise, and a boss always
  // beats its neighbours.
  const normals = STAGES.filter(s => !s.boss);
  for (let i = 1; i < normals.length; i++) {
    assert(stageCoins(normals[i]) > stageCoins(normals[i - 1]), 'coins rise across normal stages at ' + normals[i].n);
  }
  for (let i = 1; i < BOSSES.length; i++) {
    assert(stageCoins(BOSSES[i]) > stageCoins(BOSSES[i - 1]), 'coins rise across bosses at ' + BOSSES[i].n);
  }
  for (const b of BOSSES) {
    const before = STAGE_BY_N[b.n - 1], after = STAGE_BY_N[b.n + 1];
    if (before) assert(stageCoins(b) > stageCoins(before), `boss ${b.n} pays more than the stage before it`);
    if (after) assert(stageCoins(b) > stageCoins(after), `boss ${b.n} pays more than the stage after it`);
  }
  assert(stageCoins(STAGE_BY_N[20]) > stageCoins(STAGE_BY_N[1]) * 5, 'the last boss is worth the trip');
  assert(loseCoins(STAGES[0]) > 0 && loseCoins(STAGES[0]) < stageCoins(STAGES[0]), 'losing pays something, but less');
  assert(dropCount(STAGE_BY_N[1]) === 1 && dropCount(STAGE_BY_N[5]) === 2, 'bosses drop more');
  assert(dropCount(STAGE_BY_N[1], 1) === 2, 'the lanyard relic adds a drop');
  const rng = mulberry32(9);
  const kinds = {};
  for (let i = 0; i < 20000; i++) { const d = rollDrop(STAGE_BY_N[7], rng); kinds[d.kind] = (kinds[d.kind] || 0) + 1; }
  assert(Object.keys(kinds).length === 5, 'every drop kind is reachable: ' + JSON.stringify(kinds));
  assert(kinds.stone > kinds.coins, 'stones are the headline drop, not filler coins');
  assert(rollDrop(STAGE_BY_N[20], mulberry32(1)).kind, 'the last boss has a table too');
  // boss tables must be the generous ones
  const bossEl = [];
  const rng2 = mulberry32(4);
  for (let i = 0; i < 4000; i++) { const d = rollDrop(STAGE_BY_N[20], rng2); if (d.kind === 'element') bossEl.push(d.rarity); }
  assert(bossEl.length && bossEl.every(r => r === 'legendary'), 'a boss only drops legendary items');
  const earlyEl = [];
  const rng3 = mulberry32(6);
  for (let i = 0; i < 4000; i++) { const d = rollDrop(STAGE_BY_N[1], rng3); if (d.kind === 'element') earlyEl.push(d.rarity); }
  assert(earlyEl.every(r => r === 'common'), 'stage 1 only drops commons');

  // --- relics ---
  assert(RELICS.length === BOSSES.length, 'one relic per boss');
  assert(new Set(RELIC_KEYS).size === RELICS.length, 'relic keys unique');
  for (const r of RELICS) {
    assert(/^[a-z]{2,20}$/.test(r.key), `${r.key} is a safe key`);
    assert(STAGE_BY_N[r.boss] && STAGE_BY_N[r.boss].boss, `${r.key} is tied to a real boss`);
    assert(r.perk && r.note && r.icon, `${r.key} explains itself`);
  }
  for (const b of BOSSES) assert(relicForBoss(b.n), `boss ${b.n} awards a relic`);
  assert(!relicForBoss(3), 'a normal stage awards no relic');
  assert(activeRelics([]).size === 0, 'nothing equipped, nothing active');
  assert(activeRelics(['whistle']).has('whistle'), 'an equipped relic is active');
  assert(!activeRelics(['made_up']).has('made_up'), 'a junk key is never active');
  assert(activeRelics(RELIC_KEYS).size === RELIC_SLOTS, `only ${RELIC_SLOTS} relics can ever be active, got ` + activeRelics(RELIC_KEYS).size);
  assert(activeRelics(null).size === 0, 'a missing loadout does not throw');

  // --- eggs ---
  assert(eggsEarned(0) === 0, 'no matches, no eggs');
  assert(eggsEarned(10) === 20, 'ten matches = twenty eggs');
  assert(eggsEarned(10, ['apexcrown']) === 30, 'the Apex Crown adds one egg per match');
  assert(eggsEarned(10, ['whistle']) === 20, 'an unrelated relic changes nothing');
  assert(eggsEarned(-5) === 0, 'negative matches cannot mint eggs');
  // eggs must be monotonic in matches, or the spend watermark would break
  let prevEggs = -1;
  for (let m = 0; m < 50; m++) { const e = eggsEarned(m); assert(e >= prevEggs, 'eggs never go down'); prevEggs = e; }

  // --- a full playthrough, measured ---
  const rng4 = mulberry32(2026);
  let cleared = 0, eggs = 0, attempts = 0;
  const gearAt = (c) => ({ items: Array.from({ length: 3 }, () => ({
    owned: true, level: Math.min(9, Math.floor(c / 2)), stage: STAGE_ORDER[Math.min(3, Math.floor(c / 6))], subs: [],
  })) });
  for (let match = 0; match < 400 && cleared < MAX_STAGE; match++) {
    eggs += EGGS_PER_MATCH;
    while (eggs >= EGG_COST && cleared < MAX_STAGE) {
      eggs -= EGG_COST; attempts++;
      const next = STAGE_BY_N[unlockedUpTo(cleared)];
      if (rng4() < winChance(powerOf(gearAt(cleared)), next)) cleared = Math.max(cleared, next.n);
    }
  }
  assert(cleared === MAX_STAGE, `the trail is completable by playing badminton (cleared ${cleared} in ${attempts} attempts)`);
  assert(attempts > MAX_STAGE, 'but not on the first try every time');

  // --- boss eggs ---
  assert(rollEgg(STAGE_BY_N[3], () => 0) === null, 'a normal stage never drops an egg');
  assert(rollEgg(STAGE_BY_N[4], () => 0) === null, 'the stage before a boss never drops an egg');
  for (const b of BOSSES) assert(BOSS_EGG_DROPS[b.n], `boss ${b.n} has an egg table`);
  for (const [n, d] of Object.entries(BOSS_EGG_DROPS)) {
    assert(STAGE_BY_N[n] && STAGE_BY_N[n].boss, `egg table ${n} is a real boss`);
    assert(d.chance > 0 && d.chance < 1, `boss ${n} egg is a chance, never guaranteed`);
    assert(d.pool.length, `boss ${n} has an egg pool`);
    assert(rollEgg(STAGE_BY_N[n], () => 0.999) === null, `boss ${n} can miss`);
  }
  const eggRng = mulberry32(11);
  const seen = {};
  let eggHits = 0;
  for (let i = 0; i < 20000; i++) { const e = rollEgg(STAGE_BY_N[15], eggRng); if (e) { eggHits++; seen[e] = (seen[e] || 0) + 1; } }
  const eggRate = eggHits / 20000;
  assert(Math.abs(eggRate - BOSS_EGG_DROPS[15].chance) < 0.02, `boss 15 egg rate is honest (${(eggRate * 100).toFixed(1)}%)`);
  assert(Object.keys(seen).length === BOSS_EGG_DROPS[15].pool.length, 'every egg in the pool is reachable');
  const allEggs = new Set(Object.values(BOSS_EGG_DROPS).flatMap(d => d.pool));
  assert(allEggs.size === 5, 'all five unbuyable eggs drop somewhere, got ' + [...allEggs].join(','));
  assert(rollEgg(STAGE_BY_N[20], () => 0) === 'mythical', 'the last boss leads with the Mythical Egg');

  // --- combat: damage / crit / lifesteal ---
  const zero = combatOf({});
  assert(zero.damage === 0, 'no gear is no damage');
  assert(zero.crit === COMBAT.crit.base && zero.lifesteal === COMBAT.life.base, 'you start with the base rates only');
  const rack = (over) => ({ owned: true, slot: 'racket', level: 0, stage: 'base', subs: [], ...over });
  const shut = (over) => ({ owned: true, slot: 'shuttle', level: 0, stage: 'base', subs: [], ...over });
  assert(combatOf({ items: [rack({ level: 9 })] }).crit > zero.crit, 'forging the racket raises crit');
  assert(combatOf({ items: [rack({ stage: 'transcendent' })] }).crit > combatOf({ items: [rack({})] }).crit, 'evolving raises crit');
  assert(combatOf({ items: [rack({ subs: [{ grade: 'omni' }] })] }).crit > zero.crit, 'a blessing raises crit');
  assert(combatOf({ items: [rack({ wink: true })] }).crit > zero.crit, 'a wink raises crit');
  assert(combatOf({ items: [shut({ level: 9 })] }).lifesteal > zero.lifesteal, 'forging the shuttle raises lifesteal');
  assert(combatOf({ items: [rack({ level: 9 })] }).lifesteal === zero.lifesteal, 'the racket does not feed lifesteal');
  assert(combatOf({ items: [shut({ level: 9 })] }).crit === zero.crit, 'the shuttle does not feed crit');
  assert(combatOf({ items: [rack({ owned: false, level: 9 })] }).crit === zero.crit, 'unowned gear gives nothing');
  assert(combatOf({ charms: [{ gilded: true }] }).crit > zero.crit, 'a gilded charm helps');
  assert(combatOf({ perks: ['gamble'] }).crit === zero.crit + COMBAT.setCrit.gamble, "Gambler's Ruin is a crit set");
  assert(combatOf({ perks: ['endline'] }).lifesteal === zero.lifesteal + COMBAT.setLife.endline, 'End of the Line is a lifesteal set');
  assert(combatOf({ perks: ['made_up'] }).crit === zero.crit, 'an unknown perk is ignored');
  // a maxed build must be strong but never a certainty
  const maxCombat = combatOf({
    items: [rack({ level: 9, stage: 'transcendent', wink: true, subs: [{}, {}, {}] }),
      shut({ level: 9, stage: 'transcendent', wink: true, subs: [{}, {}, {}] })],
    charms: [{ gilded: true }, { gilded: true }, { gilded: true }],
    perks: ['gamble', 'endline'],
  });
  assert(maxCombat.crit <= COMBAT.crit.cap && maxCombat.lifesteal <= COMBAT.life.cap, 'both stats are capped');
  assert(maxCombat.crit > 40 && maxCombat.lifesteal > 25, `a perfect build is felt (crit ${maxCombat.crit}%, lifesteal ${maxCombat.lifesteal}%)`);
  assert(combatOf({ items: [rack({ level: 999, stage: 'transcendent', subs: Array(99).fill({}) })], perks: ['gamble', 'brainrot'] }).crit <= COMBAT.crit.cap,
    'corrupt gear cannot break the cap');
  assert(combatOf({ items: [rack({ level: -9 })] }).crit >= 0, 'a negative level cannot go negative');
  assert(combatOf({ power: 1234 }).damage === 1234, 'a precomputed power (with set bonuses) is used as damage');
  // crit must climb smoothly with investment, not jump
  let prevCrit = -1;
  for (let lv = 0; lv <= 9; lv++) {
    const c = combatOf({ items: [rack({ level: lv })] }).crit;
    assert(c >= prevCrit, 'crit is monotonic in racket level');
    prevCrit = c;
  }

  console.log(`campaign.js self-check: PASS (${STAGES.length} stages, ${BOSSES.length} bosses, ${RELICS.length} relics, ` +
    `${EGGS_PER_MATCH} eggs/match, full clear in ~${attempts} attempts, ` +
    `maxed build ${maxCombat.crit}% crit / ${maxCombat.lifesteal}% lifesteal, 5 boss eggs)`);
}
