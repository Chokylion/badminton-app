import { pathToFileURL } from 'node:url';
// forge.js imports nothing but node:url, so there is no cycle here — checked
// before adding this line. It is the single source of truth for set keys and
// for the real pouch element pool the self-check measures the bias against.
import { SET_KEYS, POUCH_ELEMENTS } from './forge.js';
// lib/charms.js — Charms: the hidden treasure layer (Cookie Run style).
//
// A charm is NOT worn — nothing about it shows on your avatar. It sits in one
// of three charm slots and quietly changes your numbers. You find them; you do
// not shop for a specific one. That is the whole point: the fun is the pull.
//
// SAME IRON RULE AS THE FORGE: a charm can never touch Elo, rank, titles or a
// match result. Every stat here feeds the coin/XP/forge loop and nothing else.

export const CHARM_SLOTS = 3;

// Four stats. The first three are the forge's; `save` is charm-only and exists
// so there is something to want that gear cannot give you.
export const CHARM_STATS = {
  coin: { name: 'Coin Find', icon: '🪙', note: 'More coins each time you level up' },
  xp: { name: 'XP Boost', icon: '📈', note: 'More XP from every match' },
  luck: { name: 'Fortune', icon: '🍀', note: 'Better forge odds and Wink chance' },
  save: { name: 'Temper', icon: '🛡️', note: 'Chance a failed forge does not cost you a level' },
};
export const CHARM_STAT_KEYS = Object.keys(CHARM_STATS);

export const RARITY = {
  common: { name: 'Common', order: 0, dust: 60, weight: 62 },
  rare: { name: 'Rare', order: 1, dust: 180, weight: 27 },
  epic: { name: 'Epic', order: 2, dust: 500, weight: 9 },
  legendary: { name: 'Legendary', order: 3, dust: 1600, weight: 2 },
};
export const RARITY_KEYS = Object.keys(RARITY);

// Gilding is the "golden" find — same charm, half again as strong, and it
// glitters in the locker. You cannot buy it; you either pull it gilded or you
// gild it later with a duplicate.
export const GILD_MULT = 1.5;
export const GILD_CHANCE = 0.07;

// How a charm can reach you. `pouch` is the coin gacha; the rest cannot be
// bought at any price, which is what makes them worth having.
export const SOURCES = {
  pouch: { name: 'Mystery Pouch', icon: '🎁', note: 'Bought from the merchant' },
  title: { name: 'Earned', icon: '🏅', note: 'Awarded for an achievement' },
  forge: { name: 'Forged', icon: '⚒️', note: 'Given by the blacksmith at a milestone' },
  arcade: { name: 'Won', icon: '🎰', note: 'A rare drop at the tables' },
  secret: { name: 'Secret', icon: '🤫', note: 'Nobody will tell you how' },
};
export const SOURCE_KEYS = Object.keys(SOURCES);

const c = (key, name, rarity, stats, source, note) => ({ key, name, rarity, stats, source, note });

// A charm is invisible on your avatar, but it still needs a face in the box.
// Kept as a lookup rather than a field so the catalogue above stays readable.
const ICONS = {
  bread_crust: '🍞', lucky_feather: '🪶', grip_tape: '🩹', bent_hairpin: '📎', squeaky_shoe: '👟',
  pocket_lint: '🧶', rusty_whistle: '📢', chipped_bottle: '🧴', warmup_sock: '🧦', snapped_string: '🎻',
  old_scoresheet: '📄', carpark_gravel: '🪨', faded_wristband: '⌚', spare_lace: '🪢', grip_powder: '🧂',
  pond_pebble: '🪨', down_tuft: '☁️', bent_shuttle: '🏸', bench_splinter: '🪵', dead_battery: '🔋',
  golden_crust: '🥐', compass: '🧭', clipboard: '📋', silver_shuttle: '🏸', clover: '🍀',
  focus_band: '🎯', honk_amp: '📣', night_key: '🗝️', metronome: '⏱️', coin_toss: '🪙',
  referee_pen: '🖊️', smash_counter: '🧮', warm_stone: '🌡️', broken_trophy: '🏆', tactical_towel: '🧺',
  first_win_pin: '📌', emperor_seal: '🦢', anvil_shard: '⚒️', champ_grip: '🤝', moonlit_shuttle: '🌙',
  golden_ratio: '🌀', migration_map: '🗺️', vault_key: '🔐', fame_splinter: '🎖️', gamblers_dice: '🎲',
  forge_ember: '🔥', golden_egg: '🥚', apex_feather: '👑', philosopher: '🔮', first_honk: '🔨',
  crown_shard: '💎', eternal_migration: '🌌',
};

/* -------------------------------------------------------------- the hoard */
export const CHARMS = [
  // --- common: the pocket junk of a goose who plays badminton ---
  c('bread_crust', 'Half-Eaten Bread', 'common', { coin: 0.4 }, 'pouch', 'Soggy. Still legal tender in goose society.'),
  c('lucky_feather', 'Lucky Feather', 'common', { luck: 0.4 }, 'pouch', 'Plucked from a goose who was, briefly, luckier.'),
  c('grip_tape', 'Sweaty Grip Tape', 'common', { xp: 0.4 }, 'pouch', 'It has seen things. It will not discuss them.'),
  c('bent_hairpin', 'Bent Hairpin', 'common', { luck: 0.3 }, 'pouch', 'A hairpin net shot, frozen mid-regret.'),
  c('squeaky_shoe', 'Squeaky Court Shoe', 'common', { xp: 0.3 }, 'pouch', 'Announces every step. Stealth: zero.'),
  c('pocket_lint', 'Pocket Lint', 'common', { coin: 0.3 }, 'pouch', 'Worthless. Somehow still in your pocket.'),
  c('rusty_whistle', 'Rusty Whistle', 'common', { xp: 0.4 }, 'pouch', 'Only produces a noise resembling a honk.'),
  c('chipped_bottle', 'Chipped Bottle', 'common', { coin: 0.3 }, 'pouch', 'Leaks. Onto your bag. Every single time.'),
  c('warmup_sock', 'Odd Warm-Up Sock', 'common', { xp: 0.3 }, 'pouch', 'Its partner left for a better club.'),
  c('snapped_string', 'Snapped String', 'common', { luck: 0.3 }, 'pouch', 'It gave everything on one smash.'),
  c('old_scoresheet', 'Old Score Sheet', 'common', { xp: 0.4 }, 'pouch', 'A loss nobody remembers. Except this paper.'),
  c('carpark_gravel', 'Car Park Gravel', 'common', { coin: 0.3 }, 'pouch', 'Travelled here in a shoe. Stayed for the vibe.'),
  c('faded_wristband', 'Faded Wristband', 'common', { xp: 0.4 }, 'pouch', 'Once white. Now a colour with no name.'),
  c('spare_lace', 'Spare Shoelace', 'common', { luck: 0.4 }, 'pouch', 'Preparedness is a personality.'),
  c('grip_powder', 'Grip Powder', 'common', { coin: 0.4 }, 'pouch', 'For hands that betray you at 20-20.'),
  c('pond_pebble', 'Pond Pebble', 'common', { save: 0.3 }, 'pouch', 'Smooth. Cold. Weirdly reassuring.'),
  c('down_tuft', 'Goose Down Tuft', 'common', { luck: 0.4 }, 'pouch', 'Shed in anger. Kept for luck.'),
  c('bent_shuttle', 'Bent Shuttlecock', 'common', { coin: 0.4 }, 'pouch', 'Flies left. Always left. Adapt.'),
  c('bench_splinter', 'Bench Splinter', 'common', { xp: 0.3 }, 'pouch', 'A souvenir of every match you sat out.'),
  c('dead_battery', 'Dead Scoreboard Battery', 'common', { save: 0.4 }, 'pouch', 'Died at 19-19. The argument lasted an hour.'),

  // --- rare ---
  c('golden_crust', 'Golden Bread Crust', 'rare', { coin: 1.0 }, 'pouch', 'The crust the flock speaks of in whispers.'),
  c('compass', 'Migrating Compass', 'rare', { luck: 1.0 }, 'pouch', 'Points at bread, not north. Still useful.'),
  c('clipboard', "Coach's Clipboard", 'rare', { xp: 1.0 }, 'pouch', 'Contains one tactic: "hit it where they are not".'),
  c('silver_shuttle', 'Silver Shuttlecock', 'rare', { coin: 0.9 }, 'pouch', 'Too pretty to hit. Hit it anyway.'),
  c('clover', 'Four-Leaf Clover', 'rare', { luck: 1.2 }, 'pouch', 'Eaten twice. Recovered twice. Do not ask.'),
  c('focus_band', 'Sweatband of Focus', 'rare', { xp: 1.1 }, 'pouch', 'Absorbs sweat and, allegedly, doubt.'),
  c('honk_amp', 'Honk Amplifier', 'rare', { coin: 1.0 }, 'pouch', 'Banned from three leagues and one library.'),
  c('night_key', 'Night Court Key', 'rare', { xp: 1.0 }, 'arcade', 'Opens the hall at 23:00. Ask no questions.'),
  c('metronome', 'Rally Metronome', 'rare', { luck: 0.9 }, 'pouch', 'Tick. Tock. Smash. Apologise.'),
  c('coin_toss', 'Weighted Coin', 'rare', { luck: 1.1 }, 'arcade', 'Lands on the side you need. Nobody has proven it.'),
  c('referee_pen', "Referee's Pen", 'rare', { xp: 0.9 }, 'pouch', 'The score is whatever this pen wrote.'),
  c('smash_counter', 'Smash Counter', 'rare', { coin: 1.2 }, 'pouch', 'Counts smashes. Mostly counts attempts.'),
  c('warm_stone', 'Warm Pond Stone', 'rare', { save: 1.0 }, 'pouch', 'Holds heat. Holds nerves. Holds together.'),
  c('broken_trophy', 'Broken Trophy Base', 'rare', { xp: 1.2 }, 'title', 'The cup is long gone. The weight remains.'),
  c('tactical_towel', 'Tactical Towel', 'rare', { luck: 1.0 }, 'pouch', 'Buys eleven seconds of thinking. Legally.'),
  c('first_win_pin', 'First Win Pin', 'rare', { coin: 1.1 }, 'title', 'Small. Cheap. Absolutely priceless.'),

  // --- epic ---
  c('emperor_seal', 'Emperor Goose Seal', 'epic', { coin: 1.2, luck: 0.8 }, 'pouch', 'Authorises decrees no one obeys.'),
  c('anvil_shard', 'Anvil Fragment', 'epic', { luck: 1.5, save: 0.5 }, 'forge', 'Chipped off during a Wink. Still warm.'),
  c('champ_grip', "Champion's Grip", 'epic', { xp: 1.3, coin: 0.7 }, 'title', 'Moulded to a hand that never let go.'),
  c('moonlit_shuttle', 'Moonlit Shuttle', 'epic', { luck: 1.0, xp: 1.0 }, 'arcade', 'Glows faintly. Play at midnight to find out why.'),
  c('golden_ratio', 'Golden Ratio Racket', 'epic', { coin: 1.0, xp: 1.0 }, 'pouch', 'Strung at 1.618 kg. The spiral does the rest.'),
  c('migration_map', 'Migration Map', 'epic', { xp: 1.5, luck: 0.5 }, 'pouch', 'Every route ends at a badminton hall. Suspicious.'),
  c('vault_key', 'Bread Vault Key', 'epic', { coin: 2.0 }, 'secret', 'There is a vault. It is full of bread. That is all.'),
  c('fame_splinter', 'Hall of Fame Splinter', 'epic', { xp: 2.0 }, 'title', 'Prised off the honours board. Nobody noticed.'),
  c('gamblers_dice', "Gambler's Dice", 'epic', { luck: 2.0 }, 'arcade', 'Six sides. All of them say "one more".'),
  c('forge_ember', 'Forge Ember', 'epic', { save: 1.5, luck: 0.5 }, 'forge', 'Never cools. The blacksmith insists this is normal.'),

  // --- legendary ---
  c('golden_egg', 'The Golden Goose Egg', 'legendary', { coin: 3.5 }, 'secret', 'It has never hatched. It has never had to.'),
  c('apex_feather', 'Feather of the Apex', 'legendary', { xp: 3.0, luck: 0.5 }, 'title', 'Shed by whoever was #1 at the time.'),
  c('philosopher', "Philosopher's Shuttlecock", 'legendary', { coin: 1.5, xp: 1.5, luck: 0.5 }, 'secret', 'Turns effort into coins. Slowly. Like everything.'),
  c('first_honk', 'Anvil of the First Honk', 'legendary', { luck: 2.5, save: 1.0 }, 'forge', 'Struck once, at the beginning. Still ringing.'),
  c('crown_shard', 'Crown Shard', 'legendary', { coin: 2.0, xp: 1.5 }, 'title', 'A piece of a crown. The goose kept the rest.'),
  c('eternal_migration', 'Eternal Migration', 'legendary', { xp: 2.0, coin: 1.0, luck: 0.5 }, 'secret', 'Some geese never land. Some players never stop.'),
];

for (const x of CHARMS) x.icon = ICONS[x.key] || '🔮';

export const CHARM_KEYS = CHARMS.map(x => x.key);export const CHARM_BY_KEY = Object.fromEntries(CHARMS.map(x => [x.key, x]));
export const isCharmKey = (k) => Object.prototype.hasOwnProperty.call(CHARM_BY_KEY, k);

// The gacha only ever draws from the pouch pool — everything else has to be
// earned, so no amount of coins can buy an Apex Feather.
export const POUCH_POOL = CHARMS.filter(x => x.source === 'pouch');
// Goose Eggs. Only two can be bought; the rest drop from bosses on the Goose
// Trail, and each of those leans toward a particular SET so a set is something
// you can actually hunt rather than pray for.
export const EGGS = [
  { key: 'golden', name: 'Golden Egg', icon: '🥚', price: 2000, source: 'shop', setBias: null,
    weights: { common: 45, rare: 38, epic: 14, legendary: 3 },
    note: 'The everyday egg. Rares are the norm.' },
  { key: 'diamond', name: 'Diamond Egg', icon: '💎', price: 8000, source: 'shop', setBias: null,
    weights: { common: 15, rare: 40, epic: 32, legendary: 13 },
    note: 'Epic-leaning. Roughly one in eight is legendary.' },

  { key: 'rainbow', name: 'Rainbow Egg', icon: '🌈', price: 0, source: 'boss', setBias: null,
    weights: { common: 0, rare: 25, epic: 45, legendary: 30 },
    note: 'Never common. Three in ten are legendary.' },
  { key: 'mythical', name: 'Mythical Egg', icon: '🔮', price: 0, source: 'boss', setBias: null,
    weights: { common: 0, rare: 10, epic: 40, legendary: 50 },
    note: 'Half of everything inside is legendary.' },
  { key: 'meme', name: 'Meme Egg', icon: '💀', price: 0, source: 'boss', setBias: ['brainrot', 'what'],
    weights: { common: 20, rare: 30, epic: 30, legendary: 20 },
    note: 'Heavily biased toward The 67 and The What.' },
  { key: 'heaven', name: 'Heaven Egg', icon: '😇', price: 0, source: 'boss', setBias: ['honour'],
    weights: { common: 10, rare: 30, epic: 40, legendary: 20 },
    note: 'Heavily biased toward the Honour Guard set.' },
  { key: 'hell', name: 'Hell Egg', icon: '😈', price: 0, source: 'boss', setBias: ['gamble', 'endline'],
    weights: { common: 10, rare: 30, epic: 35, legendary: 25 },
    note: "Heavily biased toward Gambler's Ruin and End of the Line." },
];
export const EGG_KEYS = EGGS.map(e => e.key);
export const EGG_BY_KEY = Object.fromEntries(EGGS.map(e => [e.key, e]));
export const SHOP_EGGS = EGGS.filter(e => e.source === 'shop');
export const BOSS_EGGS = EGGS.filter(e => e.source === 'boss');
// How strongly a biased egg favours its sets.
export const SET_BIAS_WEIGHT = 6;
// You may crack up to this many at once.
export const MAX_BATCH = 10;

// Older name, kept so nothing that already imported it breaks.
export const POUCH_TIERS = EGGS;
export const POUCH_TIER_BY_KEY = EGG_BY_KEY;
export const POUCH_PRICE = SHOP_EGGS[0].price;
export const DUPLICATE_REFUND = (rarity) => Math.min(RARITY[rarity].dust, POUCH_PRICE - 1);

/* --------------------------------------------------------------- the maths */
// What one owned charm is worth. Gilded charms are half again as strong.
export function charmStats(owned) {
  const def = owned && CHARM_BY_KEY[owned.key];
  const out = {};
  if (!def) return out;
  const mult = owned.gilded ? GILD_MULT : 1;
  for (const [k, v] of Object.entries(def.stats)) {
    if (!CHARM_STATS[k]) continue;
    out[k] = Math.round(v * mult * 100) / 100;
  }
  return out;
}
// Only equipped charms count, and only up to the slot limit — a corrupt row
// listing forty charms can never pay out forty charms.
export function equippedStats(list) {
  const out = { coin: 0, xp: 0, luck: 0, save: 0 };
  for (const owned of (list || []).slice(0, CHARM_SLOTS)) {
    const s = charmStats(owned);
    for (const k of CHARM_STAT_KEYS) out[k] += s[k] || 0;
  }
  for (const k of CHARM_STAT_KEYS) out[k] = Math.round(out[k] * 100) / 100;
  return out;
}
export const raritySort = (a, b) =>
  RARITY[b.rarity].order - RARITY[a.rarity].order || a.name.localeCompare(b.name);

/* ----------------------------------------------------------------- pulling */
// Weighted by rarity, so a legendary from a pouch is a genuine event. Pass a
// weights table to bias the roll — that is what the pouch tiers do.
export function pullCharm(rng, pool = POUCH_POOL, weights = null) {
  const byRarity = {};
  for (const x of pool) (byRarity[x.rarity] ||= []).push(x);
  const w = (r) => (weights ? (weights[r] || 0) : RARITY[r].weight);
  const live = RARITY_KEYS.filter(r => byRarity[r] && byRarity[r].length && w(r) > 0);
  if (!live.length) return null;
  const total = live.reduce((s, r) => s + w(r), 0);
  let roll = rng() * total;
  let picked = live[live.length - 1];
  for (const r of live) { roll -= w(r); if (roll <= 0) { picked = r; break; } }
  const bucket = byRarity[picked];
  const charm = bucket[Math.floor(rng() * bucket.length) % bucket.length];
  return { key: charm.key, rarity: charm.rarity, gilded: rng() < GILD_CHANCE };
}
// Pick one thing out of a pool by the egg's own rarity curve. When the egg is
// set-biased, items whose `.set` is one of the biased sets are SET_BIAS_WEIGHT
// times likelier WITHIN their rarity bucket — the bias never distorts the
// rarity odds, only which item of that rarity you land on.
function pickWeighted(rng, pool, weights, setBias = null) {
  const byRarity = {};
  for (const x of pool) (byRarity[x.rarity] ||= []).push(x);
  const w = (r) => (weights ? (weights[r] || 0) : RARITY[r].weight);
  const live = RARITY_KEYS.filter(r => byRarity[r] && byRarity[r].length && w(r) > 0);
  if (!live.length) return null;
  const total = live.reduce((s, r) => s + w(r), 0);
  let roll = rng() * total;
  let picked = live[live.length - 1];
  for (const r of live) { roll -= w(r); if (roll <= 0) { picked = r; break; } }
  return pickBiased(rng, byRarity[picked], setBias);
}
// Choose one item from a single-rarity bucket, favouring the biased sets.
function pickBiased(rng, bucket, setBias) {
  if (!bucket || !bucket.length) return null;
  if (!setBias || !setBias.length) return bucket[Math.floor(rng() * bucket.length) % bucket.length];
  const want = new Set(setBias);
  const wt = (x) => (x.set && want.has(x.set) ? SET_BIAS_WEIGHT : 1);
  const total = bucket.reduce((s, x) => s + wt(x), 0);
  let roll = rng() * total;
  for (const x of bucket) { roll -= wt(x); if (roll <= 0) return x; }
  return bucket[bucket.length - 1];
}

// A pouch holds one of four things: an ELEMENT for your gear, a charm, a skin,
// or a Bless Stone. Elements are the headline — they cannot be bought.
export const SKIN_ODDS = 0.18;
export const STONE_ODDS = 0.18;
export const ELEMENT_ODDS = 0.24;
export function pullPrize(rng, opts = {}) {
  const { skinPool = [], elementPool = [] } = opts;
  const egg = opts.egg || opts.tier || null;          // the caller may pass either name
  const weights = egg ? egg.weights : null;
  const setBias = egg ? egg.setBias : null;
  const roll = rng();
  if (elementPool.length && roll < ELEMENT_ODDS) {
    const e = pickWeighted(rng, elementPool, weights, setBias);
    // `set` is passed through so the caller can say "that is a set piece"
    // without a second lookup. Existing callers that ignore it are unaffected.
    if (e) return { kind: 'element', key: e.key, rarity: e.rarity, set: e.set || null };
  }
  if (roll < ELEMENT_ODDS + STONE_ODDS) return { kind: 'stone', key: 'bless', rarity: 'rare' };
  if (skinPool.length && roll < ELEMENT_ODDS + STONE_ODDS + SKIN_ODDS) {
    const s = pickWeighted(rng, skinPool, weights, setBias);
    if (s) return { kind: 'skin', key: s.key, rarity: s.rarity };
  }
  const c = pullCharm(rng, POUCH_POOL, weights);
  // a rare-heavy egg cannot roll a common charm; fall back to a stone rather
  // than returning nothing at all
  return c ? { kind: 'charm', ...c } : { kind: 'stone', key: 'bless', rarity: 'rare' };
}

// Crack several eggs at once. Pure and stateless: it is exactly n calls to
// pullPrize with the same rng, so a batch of n is identical to n singles from
// the same seed. Never returns more than was asked for and never more than
// MAX_BATCH; anything that is not a sane count buys nothing at all.
export function pullBatch(rng, n, opts = {}) {
  const want = Math.floor(Number(n));
  if (!Number.isFinite(want) || want < 1) return [];
  const count = Math.min(want, MAX_BATCH);
  const out = [];
  for (let i = 0; i < count; i++) out.push(pullPrize(rng, opts));
  return out;
}

// What happens when a pull lands on something you already have. A duplicate is
// never simply binned: it either gilds the one you own or pays you out.
export function resolvePull(pull, existing) {
  if (!existing) return { kind: 'new', key: pull.key, gilded: pull.gilded, coins: 0 };
  if (!existing.gilded) return { kind: 'gild', key: pull.key, gilded: true, coins: 0 };
  return { kind: 'dust', key: pull.key, gilded: true, coins: DUPLICATE_REFUND(CHARM_BY_KEY[pull.key].rarity) };
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
  const assert = (c_, m) => { if (!c_) { console.error('FAIL: ' + m); process.exit(1); } };

  // --- the catalogue is sane ---
  assert(CHARMS.length >= 50, 'at least 50 charms, got ' + CHARMS.length);
  assert(new Set(CHARM_KEYS).size === CHARMS.length, 'charm keys are unique');
  assert(new Set(CHARMS.map(x => x.name)).size === CHARMS.length, 'charm names are unique');
  for (const x of CHARMS) {
    assert(/^[a-z0-9_]{2,40}$/.test(x.key), `${x.key} is a safe key`);
    assert(ICONS[x.key], `${x.key} has its own icon (not the fallback)`);
    assert(RARITY[x.rarity], `${x.key} has a real rarity`);
    assert(SOURCES[x.source], `${x.key} has a real source`);
    assert(x.note && x.note.length > 8, `${x.key} has flavour text`);
    const keys = Object.keys(x.stats);
    assert(keys.length >= 1 && keys.length <= 3, `${x.key} carries 1-3 stats`);
    for (const k of keys) {
      assert(CHARM_STATS[k], `${x.key} stat ${k} is real`);
      assert(x.stats[k] > 0 && x.stats[k] <= 3.5, `${x.key} stat ${k} stays small`);
    }
  }
  for (const r of RARITY_KEYS) assert(CHARMS.some(x => x.rarity === r), `${r} rarity is populated`);
  for (const s of SOURCE_KEYS) assert(CHARMS.some(x => x.source === s), `${s} source is populated`);

  // --- rarity actually means something ---
  const avg = (r) => {
    const set = CHARMS.filter(x => x.rarity === r);
    return set.reduce((s, x) => s + Object.values(x.stats).reduce((a, b) => a + b, 0), 0) / set.length;
  };
  for (let i = 1; i < RARITY_KEYS.length; i++) {
    assert(avg(RARITY_KEYS[i]) > avg(RARITY_KEYS[i - 1]), `${RARITY_KEYS[i]} beats ${RARITY_KEYS[i - 1]} on average`);
    assert(RARITY[RARITY_KEYS[i]].dust > RARITY[RARITY_KEYS[i - 1]].dust, 'rarer duplicates refund more');
    assert(RARITY[RARITY_KEYS[i]].weight < RARITY[RARITY_KEYS[i - 1]].weight, 'rarer charms are rarer');
  }

  // --- coins must never reach the earned charms ---
  assert(POUCH_POOL.length > 15, 'the pouch has a real pool, got ' + POUCH_POOL.length);
  assert(POUCH_POOL.every(x => x.source === 'pouch'), 'only pouch charms are in the pouch');
  for (const locked of CHARMS.filter(x => x.source !== 'pouch')) {
    assert(!POUCH_POOL.some(p => p.key === locked.key), `${locked.key} cannot be bought`);
  }
  assert(!POUCH_POOL.some(x => x.rarity === 'legendary'), 'no legendary is purchasable at any price');

  // --- the maths ---
  assert(Object.keys(charmStats(null)).length === 0, 'nothing is worth nothing');
  assert(Object.keys(charmStats({ key: 'made_up' })).length === 0, 'an unknown charm is worth nothing');
  const plain = charmStats({ key: 'golden_egg', gilded: false });
  const gild = charmStats({ key: 'golden_egg', gilded: true });
  assert(plain.coin === 3.5 && gild.coin === 5.25, 'gilding is +50%, got ' + gild.coin);
  const multi = charmStats({ key: 'philosopher' });
  assert(multi.coin === 1.5 && multi.xp === 1.5 && multi.luck === 0.5, 'multi-stat charms read correctly');

  const three = equippedStats([{ key: 'golden_egg' }, { key: 'apex_feather' }, { key: 'crown_shard' }]);
  assert(three.coin === 5.5 && three.xp === 4.5 && three.luck === 0.5, 'three charms add up, got ' + JSON.stringify(three));
  const over = equippedStats(Array.from({ length: 40 }, () => ({ key: 'golden_egg', gilded: true })));
  assert(over.coin === 5.25 * CHARM_SLOTS, 'only three slots ever pay out, got ' + over.coin);
  assert(equippedStats([]).coin === 0 && equippedStats(null).xp === 0, 'an empty locker is safe');
  assert(equippedStats([{ key: 'nope' }]).coin === 0, 'junk in the locker pays nothing');

  // the strongest legal loadout — the number to sanity-check against the forge
  const best = {};
  for (const k of CHARM_STAT_KEYS) {
    const top = [...CHARMS].sort((a, b) => (b.stats[k] || 0) - (a.stats[k] || 0)).slice(0, CHARM_SLOTS);
    best[k] = Math.round(top.reduce((s, x) => s + (x.stats[k] || 0), 0) * GILD_MULT * 100) / 100;
  }
  for (const k of CHARM_STAT_KEYS) assert(best[k] <= 15, `a perfect ${k} loadout stays under 15%, got ${best[k]}`);

  // --- pulling ---
  const rng = mulberry32(42);
  const counts = {}; let gilded = 0; const N = 40000;
  for (let i = 0; i < N; i++) {
    const p = pullCharm(rng);
    assert(isCharmKey(p.key), 'every pull is a real charm');
    assert(CHARM_BY_KEY[p.key].source === 'pouch', 'every pull comes from the pouch pool');
    counts[CHARM_BY_KEY[p.key].rarity] = (counts[CHARM_BY_KEY[p.key].rarity] || 0) + 1;
    if (p.gilded) gilded++;
  }
  const pct = (r) => (100 * (counts[r] || 0)) / N;
  assert(pct('common') > pct('rare') && pct('rare') > pct('epic'), 'pull rates follow rarity: ' + JSON.stringify(counts));
  assert(Math.abs(gilded / N - GILD_CHANCE) < 0.01, 'gild rate matches the constant, got ' + (gilded / N).toFixed(3));
  // every purchasable charm must actually be reachable, or it is dead content
  const seen = new Set(); const rng2 = mulberry32(5);
  for (let i = 0; i < 60000; i++) seen.add(pullCharm(rng2).key);
  assert(seen.size === POUCH_POOL.length, `every pouch charm is reachable (${seen.size}/${POUCH_POOL.length})`);

  // --- duplicates ---
  const pull = { key: 'golden_crust', rarity: 'rare', gilded: false };
  assert(resolvePull(pull, null).kind === 'new', 'a first copy is new');
  assert(resolvePull(pull, { key: 'golden_crust', gilded: false }).kind === 'gild', 'a second copy gilds it');
  const dust = resolvePull(pull, { key: 'golden_crust', gilded: true });
  assert(dust.kind === 'dust' && dust.coins === DUPLICATE_REFUND('rare'), 'a third copy pays dust, got ' + dust.coins);
  const legDust = resolvePull({ key: 'golden_egg', rarity: 'legendary' }, { key: 'golden_egg', gilded: true }).coins;
  assert(legDust === DUPLICATE_REFUND('legendary'), 'legendary dust is the biggest');
  // A refund must never exceed what the egg cost, whatever the rarity table
  // says — a duplicate that pays back more than the pull is a coin printer.
  // The cheapest thing coins can buy sets that ceiling.
  const cheapestEgg = Math.min(...SHOP_EGGS.map(e => e.price));
  assert(cheapestEgg > 0, 'the cheapest buyable egg has a real price');
  assert(POUCH_PRICE === cheapestEgg, `the legacy POUCH_PRICE (${POUCH_PRICE}) is the cheapest egg (${cheapestEgg})`);
  for (const r of RARITY_KEYS) {
    assert(RARITY[r].dust < cheapestEgg, `${r} dust (${RARITY[r].dust}) is under the ${cheapestEgg} egg before the cap even applies`);
    assert(DUPLICATE_REFUND(r) < cheapestEgg, `${r} refund (${DUPLICATE_REFUND(r)}) stays under the ${cheapestEgg} egg`);
  }
  for (let i = 1; i < RARITY_KEYS.length; i++) {
    assert(DUPLICATE_REFUND(RARITY_KEYS[i]) >= DUPLICATE_REFUND(RARITY_KEYS[i - 1]), 'refunds still rise with rarity');
  }

  // the pouch must be a coin SINK, not a source, or the economy inflates
  const rng3 = mulberry32(77);
  const held = new Map(); let spent = 0, back = 0;
  for (let i = 0; i < 20000; i++) {
    spent += POUCH_PRICE;
    const p = pullCharm(rng3);
    const r = resolvePull(p, held.get(p.key));
    back += r.coins;
    held.set(p.key, { key: p.key, gilded: r.gilded });
  }
  assert(back < spent, `the pouch drains coins overall (${back} back vs ${spent} spent)`);
  const ret = Math.round((100 * back) / spent);
  assert(ret < 50, 'long-run dust return stays well under half, got ' + ret + '%');

  // ------------------------------------------------------------- Goose Eggs
  // The gacha was renamed from "pouches" to eggs. Seven of them: two you can
  // buy from the merchant, five that only ever drop from a Trail boss.
  assert(EGGS.length === 7, 'seven eggs, got ' + EGGS.length);
  assert(new Set(EGG_KEYS).size === EGGS.length, 'egg keys are unique');
  assert(new Set(EGGS.map(e => e.name)).size === EGGS.length, 'egg names are unique');
  assert(POUCH_TIERS === EGGS && POUCH_TIER_BY_KEY === EGG_BY_KEY, 'the old pouch name still aliases the eggs');
  for (const e of EGGS) {
    assert(/^[a-z]{2,12}$/.test(e.key), `${e.key} is a safe key`);
    assert(e.name && e.icon && e.note && e.note.length > 8, `${e.key} is a real egg with flavour`);
    assert(e.source === 'shop' || e.source === 'boss', `${e.key} has a real source`);
    const tot = RARITY_KEYS.reduce((s, r) => s + (e.weights[r] || 0), 0);
    assert(Math.abs(tot - 100) < 1e-9, `${e.key} weights sum to 100, got ${tot}`);
    for (const r of RARITY_KEYS) assert((e.weights[r] || 0) >= 0, `${e.key} has no negative weight`);
  }

  // --- exactly two can be bought; the five boss eggs never can ---
  const buyableEggs = EGGS.filter(e => e.source === 'shop');
  const bossEggs = EGGS.filter(e => e.source === 'boss');
  assert(buyableEggs.length === 2, 'exactly two eggs are buyable, got ' + buyableEggs.length);
  assert(buyableEggs.every(e => e.price > 0), 'a buyable egg has a real price');
  assert(bossEggs.length === 5, 'five eggs are boss-only, got ' + bossEggs.length);
  assert(bossEggs.every(e => e.price === 0), 'a boss egg is never priced — it cannot be bought');
  assert(SHOP_EGGS.length === 2 && BOSS_EGGS.length === 5, 'the shop/boss split is exported');
  assert(SHOP_EGGS.every(e => buyableEggs.includes(e)) && BOSS_EGGS.every(e => bossEggs.includes(e)), 'the exported lists match the source rows');
  assert(POUCH_PRICE === EGG_BY_KEY.golden.price, 'the legacy pouch price is the golden egg');

  // --- THE ECONOMY RULE: no amount of coins ever reaches a boss egg ---
  // A price of 0 must never read as "free to buy". Anything a merchant can
  // sell has to come off the shop list, and the shop list is shop-only.
  for (const e of bossEggs) {
    assert(!SHOP_EGGS.includes(e), `${e.key} is not on the shop shelf`);
    assert(!SHOP_EGGS.some(s => s.key === e.key), `${e.key} cannot be bought by key either`);
    assert(e.source !== 'shop' && e.price === 0, `${e.key} has no purchase path`);
  }
  // the only way to spend coins is to look an egg up in the shop list, so
  // simulate exactly that for every key a client could ever post
  for (const key of EGG_KEYS) {
    const onSale = SHOP_EGGS.find(e => e.key === key) || null;
    const isBoss = EGG_BY_KEY[key].source === 'boss';
    assert(isBoss ? onSale === null : (onSale && onSale.price > 0), `${key} is ${isBoss ? 'unbuyable' : 'buyable'} exactly as its source says`);
  }
  assert(EGGS.filter(e => e.price > 0).length === 2, 'only two eggs carry a price at all');
  assert(EGGS.every(e => e.price >= 0 && Number.isFinite(e.price)), 'no egg has a negative or junk price');

  // --- dearer / rarer eggs really are strictly better than the golden ---
  const golden = EGG_BY_KEY.golden, diamond = EGG_BY_KEY.diamond;
  assert(diamond.price > golden.price, 'the diamond egg costs more than the golden');
  assert(diamond.weights.legendary > golden.weights.legendary, 'the diamond egg beats the golden on legendaries');
  assert(diamond.weights.common < golden.weights.common, 'the diamond egg leans less common');
  for (const e of EGGS) {
    if (e.key === 'golden') continue;
    assert(e.weights.legendary > golden.weights.legendary,
      `the ${e.key} egg has strictly better legendary odds than the golden (${e.weights.legendary} vs ${golden.weights.legendary})`);
  }
  // --- and the mythical egg is the top of the ladder, outright ---
  const bestLeg = Math.max(...EGGS.map(e => e.weights.legendary));
  assert(EGG_BY_KEY.mythical.weights.legendary === bestLeg,
    `the mythical egg holds the best legendary odds (${EGG_BY_KEY.mythical.weights.legendary} vs best ${bestLeg})`);
  assert(EGGS.filter(e => e.weights.legendary === bestLeg).length === 1, 'nothing ties the mythical egg for legendaries');
  assert(EGG_BY_KEY.mythical.weights.legendary > diamond.weights.legendary, 'a boss egg beats the dearest shop egg — coins are not the top of the ladder');

  // --- a set-biased egg only ever names real sets ---
  const biasedEggs = EGGS.filter(e => e.setBias);
  assert(biasedEggs.length >= 1, 'at least one egg is set-biased');
  assert(EGGS.some(e => !e.setBias), 'at least one egg is unbiased');
  for (const e of biasedEggs) {
    assert(Array.isArray(e.setBias) && e.setBias.length >= 1, `${e.key} bias is a non-empty array`);
    for (const s of e.setBias) {
      assert(/^[a-z]+$/.test(s), `${e.key} bias name "${s}" is a safe lower-case string`);
      assert(SET_KEYS.includes(s), `${e.key} biases a real set (${s})`);
    }
  }

  // --- measured: every egg's real drops match its own weight table ---
  const skinsPool = [
    { key: 'ember', rarity: 'common' }, { key: 'neon', rarity: 'rare' },
    { key: 'venom', rarity: 'epic' }, { key: 'void', rarity: 'legendary' },
  ];
  // one plain + one set-biased item at every rarity, so the bias has something
  // to grab while the rarity split stays driven purely by the egg weights.
  const elemPool = [
    { key: 'fire', rarity: 'common' }, { key: 'gale', rarity: 'common', set: 'brainrot' },
    { key: 'storm', rarity: 'rare' }, { key: 'rizz', rarity: 'rare', set: 'brainrot' },
    { key: 'blaze', rarity: 'epic' }, { key: 'sigma', rarity: 'epic', set: 'brainrot' },
    { key: 'drake', rarity: 'legendary' }, { key: 'skibidi', rarity: 'legendary', set: 'brainrot' },
  ];
  const within = (a, b, tol) => Math.abs(a - b) <= tol;
  for (const egg of EGGS) {
    const rng = mulberry32(2024);
    const elemRarity = { common: 0, rare: 0, epic: 0, legendary: 0 };
    let elems = 0; const N = 40000;
    for (let i = 0; i < N; i++) {
      const p = pullPrize(rng, { skinPool: skinsPool, elementPool: elemPool, egg });
      if (p.kind === 'element') { elems++; elemRarity[p.rarity]++; assert(elemPool.some(e => e.key === p.key), 'an element drop is from the pool'); }
      if (p.kind === 'skin') assert(skinsPool.some(s => s.key === p.key), 'a skin drop is from the pool');
      if (p.kind === 'charm') assert(isCharmKey(p.key), 'a charm drop is a real charm');
      if (p.kind === 'stone') assert(p.key === 'bless', 'the only stone is a Bless Stone');
    }
    assert(elems > 2000, `${egg.key}: enough element drops to measure (${elems})`);
    for (const r of RARITY_KEYS) {
      const obs = 100 * (elemRarity[r] || 0) / elems;
      assert(within(obs, egg.weights[r] || 0, 1.5),
        `${egg.key}: measured ${r} ${obs.toFixed(1)}% ~ stated ${egg.weights[r] || 0}%`);
    }
  }

  // --- every prize kind is reachable through an ordinary golden egg ---
  {
    const rng = mulberry32(21); const kinds = { skin: 0, charm: 0, stone: 0, element: 0 };
    for (let i = 0; i < 40000; i++) kinds[pullPrize(rng, { skinPool: skinsPool, elementPool: elemPool, egg: golden }).kind]++;
    assert(Math.abs(kinds.element / 40000 - ELEMENT_ODDS) < 0.02, 'elements drop at the stated rate, got ' + (kinds.element / 40000).toFixed(3));
    assert(kinds.charm > 0 && kinds.stone > 0 && kinds.skin > 0, 'every prize kind is reachable: ' + JSON.stringify(kinds));
  }

  // --- measured: a biased egg really does favour its sets ---
  const brainrotFrac = (egg) => {
    const rng = mulberry32(99); let inSet = 0, total = 0;
    for (let i = 0; i < 60000; i++) {
      const p = pullPrize(rng, { skinPool: [], elementPool: elemPool, egg });
      if (p.kind === 'element') { total++; if (elemPool.find(e => e.key === p.key).set === 'brainrot') inSet++; }
    }
    return total ? inSet / total : 0;
  };
  const memeFrac = brainrotFrac(EGG_BY_KEY.meme);   // biases The 67 (brainrot) + The What
  const goldFrac = brainrotFrac(golden);            // no bias at all
  assert(Math.abs(goldFrac - 0.5) < 0.05, `an unbiased egg splits the two items evenly (${(goldFrac * 100).toFixed(0)}%)`);
  assert(memeFrac > goldFrac + 0.2, `the meme egg returns set items far more often (${(memeFrac * 100).toFixed(0)}% vs ${(goldFrac * 100).toFixed(0)}%)`);

  // --- measured on the REAL pouch pool: the bias is worth exactly what the
  // constant claims. The toy pool above proves the mechanism; this proves it
  // against the live gear list, where every rarity bucket holds a different
  // mix of set pieces. The prediction is derived from the pool itself
  // (SET_BIAS_WEIGHT*b / (SET_BIAS_WEIGHT*b + u) inside each rarity, weighted
  // by the egg's own curve), so this measures the code instead of restating it.
  let biasSummary = '';
  {
    const realPool = POUCH_ELEMENTS;
    assert(realPool.length > 30, 'the real element pool is populated, got ' + realPool.length);
    assert(realPool.some(e => e.set), 'the real element pool actually contains set pieces');
    const byKey = new Map(realPool.map(e => [e.key, e]));

    const share = (egg, seed, wantKeys = egg.setBias) => {
      const r = mulberry32(seed);
      const want = new Set(wantKeys || []);
      let hit = 0, total = 0;
      for (let i = 0; i < 50000; i++) {
        const p = pullPrize(r, { skinPool: [], elementPool: realPool, egg });
        if (p.kind !== 'element') continue;
        total++;
        const def = byKey.get(p.key);
        assert(def, 'a real-pool drop is a real element');
        assert(p.set === (def.set || null), `${p.key} reports its own set on the prize`);
        if (def.set && want.has(def.set)) hit++;
      }
      return { pct: total ? hit / total : 0, total };
    };
    const predict = (egg, factor) => {
      const want = new Set(egg.setBias || []);
      const byR = {};
      for (const x of realPool) (byR[x.rarity] ||= []).push(x);
      const live = RARITY_KEYS.filter(r => byR[r] && byR[r].length && (egg.weights[r] || 0) > 0);
      const tot = live.reduce((s, r) => s + egg.weights[r], 0);
      let out = 0;
      for (const r of live) {
        const b = byR[r].filter(x => x.set && want.has(x.set)).length;
        const u = byR[r].length - b;
        if (b) out += (egg.weights[r] / tot) * ((factor * b) / (factor * b + u));
      }
      return out;
    };

    const lines = [];
    for (const e of biasedEggs) {
      const got = share(e, 1337);
      const flat = share({ ...e, setBias: null }, 1337, e.setBias);   // same weights, bias removed, same sets counted
      const wantPct = predict(e, SET_BIAS_WEIGHT);
      const flatPct = predict(e, 1);
      assert(got.total > 8000, `${e.key}: enough real-pool drops to measure (${got.total})`);
      assert(Math.abs(got.pct - wantPct) < 0.02,
        `${e.key}: measured set share ${(got.pct * 100).toFixed(1)}% ~ predicted ${(wantPct * 100).toFixed(1)}% at x${SET_BIAS_WEIGHT}`);
      assert(Math.abs(flat.pct - flatPct) < 0.02,
        `${e.key}: with the bias removed it falls back to a flat draw (${(flat.pct * 100).toFixed(1)}% ~ ${(flatPct * 100).toFixed(1)}%)`);
      assert(got.pct > flat.pct * 1.5 && got.pct - flat.pct > 0.08,
        `${e.key}: the bias is actually worth hunting (${(flat.pct * 100).toFixed(1)}% -> ${(got.pct * 100).toFixed(1)}%)`);
      lines.push(`${e.key} ${(flat.pct * 100).toFixed(0)}→${(got.pct * 100).toFixed(0)}%`);
    }
    biasSummary = lines.join(', ');

    // the bias picks WHICH item, never HOW RARE — the egg alone owns that
    const biased = EGG_BY_KEY.meme;
    const rb = mulberry32(808); const seenR = { common: 0, rare: 0, epic: 0, legendary: 0 }; let nb = 0;
    for (let i = 0; i < 60000; i++) {
      const p = pullPrize(rb, { skinPool: [], elementPool: realPool, egg: biased });
      if (p.kind === 'element') { nb++; seenR[p.rarity]++; }
    }
    for (const r of RARITY_KEYS) {
      assert(Math.abs(100 * seenR[r] / nb - biased.weights[r]) < 1.5,
        `a biased egg still obeys its own rarity curve (${r}: ${(100 * seenR[r] / nb).toFixed(1)}% ~ ${biased.weights[r]}%)`);
    }
  }

  // --- cracking a batch: the cap is the cap ---
  {
    assert(Number.isInteger(MAX_BATCH) && MAX_BATCH >= 1, 'MAX_BATCH is a real cap, got ' + MAX_BATCH);
    const opts = { skinPool: skinsPool, elementPool: elemPool, egg: golden };
    for (let n = 1; n <= MAX_BATCH; n++) {
      assert(pullBatch(mulberry32(n), n, opts).length === n, `a batch of ${n} is exactly ${n}`);
    }
    for (const n of [MAX_BATCH + 1, 25, 1e6]) {
      assert(pullBatch(mulberry32(3), n, opts).length === MAX_BATCH, `asking for ${n} still yields ${MAX_BATCH}`);
    }
    for (const bad of [0, -1, -50, 0.9, NaN, Infinity, null, undefined, 'lots', {}]) {
      assert(pullBatch(mulberry32(3), bad, opts).length === 0, `a batch of ${String(bad)} is empty`);
    }
    assert(pullBatch(mulberry32(3), 3.9, opts).length === 3, 'a fractional ask is floored, never rounded up');
    // pure and stateless: a batch is exactly n singles off the same seed
    const batched = pullBatch(mulberry32(2610), MAX_BATCH, opts);
    const singles = []; const rs = mulberry32(2610);
    for (let i = 0; i < MAX_BATCH; i++) singles.push(pullPrize(rs, opts));
    assert(JSON.stringify(batched) === JSON.stringify(singles), 'a batch is exactly n singles from the same seed');
    for (const p of batched) assert(['element', 'charm', 'skin', 'stone'].includes(p.kind), 'every prize in a batch is a real prize');
    // a boss egg batches too, and a mythical one still cannot hand out a common
    const bossBatch = pullBatch(mulberry32(11), MAX_BATCH, { skinPool: skinsPool, elementPool: elemPool, egg: EGG_BY_KEY.mythical });
    assert(bossBatch.length === MAX_BATCH && bossBatch.every(p => p.rarity !== 'common'), 'a mythical batch never contains a common');
    assert(pullBatch(mulberry32(4), 5, { skinPool: [], elementPool: [], egg: golden }).length === 5, 'an exhausted egg still fills the batch');
  }

  // with nothing left to find, an egg still gives you something
  const empty = pullPrize(mulberry32(1), { skinPool: [], elementPool: [], egg: golden });
  assert(empty && (empty.kind === 'charm' || empty.kind === 'stone'), 'an exhausted egg still pays out');

  console.log(`charms.js self-check: PASS (${CHARMS.length} charms, ${POUCH_POOL.length} pullable, ${CHARM_SLOTS} slots, ` +
    `gild ${Math.round(GILD_CHANCE * 100)}%, dust return ${ret}%, ` +
    `${EGGS.length} Goose Eggs [buy: ${SHOP_EGGS.map(e => e.key + ' ' + e.price).join(', ')}; ` +
    `${BOSS_EGGS.length} boss-only, unbuyable], up to ${MAX_BATCH} at once, ` +
    `set-bias x${SET_BIAS_WEIGHT} measured on the real pool: ${biasSummary}, ` +
    `drops ${Math.round(ELEMENT_ODDS * 100)}%/${Math.round(STONE_ODDS * 100)}%/${Math.round(SKIN_ODDS * 100)}% el/st/sk)`);}
