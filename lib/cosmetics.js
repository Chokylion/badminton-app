import { pathToFileURL } from 'node:url';
// lib/cosmetics.js — the one place frames, cards and their unlock rules live.
//
// Before this, the key list was duplicated in validate.js (whitelist) and
// app.js (picker UI), so adding a frame meant editing three files and any
// mismatch silently produced "invalid frame" on save. Everything now derives
// from the tables below.
//
// Unlocks are grouped into THEMES rather than one-per-achievement: a theme is
// a thing you are good at (defence, clutch, mixing with everyone), and it hands
// you a small matching family of cosmetics. That way earning a Mythic or a big
// milestone visibly changes how you look, without needing 180 separate frames.

/* --------------------------------------------------------------- themes */
// `test` runs against a model player + context, server-side only.
export const THEMES = [
  { key: 'free', name: 'Everyone', note: 'Free', test: () => true },
  // Never earned by playing — the only way in is the merchant's counter.
  { key: 'shop', name: 'Stall stock', note: 'Buy at the stall', test: () => false },

  // ladder standing
  { key: 'gold', name: 'Gold tier', note: 'Reach Gold', tier: 'gold' },
  { key: 'diamond', name: 'Diamond tier', note: 'Reach Diamond', tier: 'diamond' },
  { key: 'apex', name: 'Rank #1', note: 'Be the club #1', tier: 'apex' },
  { key: 'mythic', name: 'Mythic holder', note: 'Hold any Mythic', test: (p, c) => c.mythicsHeld > 0 },

  // how you play
  {
    key: 'wall', name: 'The Wall', note: 'Concede under 15 a game (6+ games)',
    test: (p) => p.gamesCount >= 6 && p.pointsAgainst / p.gamesCount < 15,
  },
  {
    key: 'clutch', name: 'Clutch', note: 'Win 3 deciders, or 2 comebacks',
    test: (p) => (p.game3Wins || 0) >= 3 || (p.comebackWins || 0) >= 2,
  },
  {
    key: 'scorer', name: 'Sharpshooter', note: 'Score 400 career points',
    test: (p) => (p.pointsFor || 0) >= 400,
  },
  {
    key: 'social', name: 'Web Weaver', note: 'Partner with 6 different players',
    test: (p) => (p.distinctPartners || 0) >= 6,
  },
  {
    key: 'night', name: 'Night Owl', note: 'Play 3 matches after 22:00',
    test: (p) => (p.nightMatches || 0) >= 3,
  },
  {
    key: 'iron', name: 'Ironclad', note: 'Play 25 matches',
    test: (p) => (p.matches || 0) >= 25,
  },
  {
    key: 'streak', name: 'Wildfire', note: 'Put together a 5-win streak',
    test: (p) => (p.longestWin || 0) >= 5,
  },
  {
    key: 'giant', name: 'Giant Killer', note: 'Beat 3 higher-rated opponents',
    test: (p, c) => (c.giantWins || 0) >= 3,
  },
  {
    key: 'perfect', name: 'Flawless', note: 'Win a game 21–0',
    test: (p, c) => (c.shutouts || 0) >= 1,
  },

  // time served
  {
    key: 'founder', name: 'Founding member', note: 'Be member #1',
    test: (p, c) => c.memberNo === 1,
  },
  {
    key: 'veteran', name: 'Veteran', note: '30 days since you joined',
    test: (p) => !!p.created_at && (Date.now() - new Date(p.created_at).getTime()) >= 30 * 86400000,
  },
];

export const THEME_BY_KEY = Object.fromEntries(THEMES.map(t => [t.key, t]));

// Which themes has this player earned? Tier-based ones are resolved by the
// caller (it owns the tier table) and passed in as `ctx.tierRank`.
export function earnedThemes(player, ctx) {
  const out = ['free'];
  for (const t of THEMES) {
    if (t.key === 'free') continue;
    if (t.tier) {
      if (t.tier === 'apex') { if (ctx.rank === 1) out.push(t.key); continue; }
      if (ctx.tierRank >= (ctx.tierIndex[t.tier] ?? 99)) out.push(t.key);
      continue;
    }
    try { if (t.test(player, ctx)) out.push(t.key); } catch { /* never block a save */ }
  }
  // being club #1 is a flex, so it opens everything below it too
  if (ctx.rank === 1 && !out.includes('apex')) out.push('apex');
  return [...new Set(out)];
}

/* --------------------------------------------------------------- frames */
// group = how the picker is sectioned. req = theme key needed to equip.
export const FRAMES = [
  { key: 'auto', name: 'Rank Tier', group: 'Basics', req: 'free' },
  { key: 'none', name: 'Clean', group: 'Basics', req: 'free' },
  { key: 'neon', name: 'Neon Pulse', group: 'Basics', req: 'free' },
  { key: 'emerald', name: 'Emerald', group: 'Basics', req: 'free' },
  { key: 'ocean', name: 'Ocean', group: 'Basics', req: 'free' },
  { key: 'sunset', name: 'Sunset', group: 'Basics', req: 'free' },

  { key: 'ember', name: 'Ember', group: 'Elements', req: 'shop' },
  { key: 'frost', name: 'Frost', group: 'Elements', req: 'shop' },
  { key: 'toxic', name: 'Toxic', group: 'Elements', req: 'shop' },
  { key: 'sakura', name: 'Sakura', group: 'Elements', req: 'shop' },
  { key: 'ink', name: 'Ink', group: 'Elements', req: 'shop' },

  { key: 'bronzed', name: 'Bronze Leaf', group: 'Metals', req: 'gold' },
  { key: 'silvered', name: 'Silverwork', group: 'Metals', req: 'gold' },
  { key: 'gold', name: 'Golden Aura', group: 'Metals', req: 'gold' },
  { key: 'copper', name: 'Copperwire', group: 'Metals', req: 'gold' },
  { key: 'obsidian', name: 'Obsidian', group: 'Metals', req: 'gold' },

  { key: 'galaxyf', name: 'Galaxy', group: 'Cosmic', req: 'diamond' },
  { key: 'nebula', name: 'Nebula', group: 'Cosmic', req: 'diamond' },
  { key: 'solar', name: 'Solar Flare', group: 'Cosmic', req: 'diamond' },
  { key: 'voidf', name: 'Void', group: 'Cosmic', req: 'diamond' },
  { key: 'comet', name: 'Comet', group: 'Cosmic', req: 'diamond' },

  { key: 'fortress', name: 'Fortress', group: 'Earned', req: 'wall' },
  { key: 'overtime', name: 'Overtime', group: 'Earned', req: 'clutch' },
  { key: 'marksman', name: 'Marksman', group: 'Earned', req: 'scorer' },
  { key: 'weave', name: 'Weave', group: 'Earned', req: 'social' },
  { key: 'midnight', name: 'Midnight', group: 'Earned', req: 'night' },
  { key: 'ironclad', name: 'Ironclad', group: 'Earned', req: 'iron' },
  { key: 'wildfire', name: 'Wildfire', group: 'Earned', req: 'streak' },
  { key: 'slayer', name: 'Slayer', group: 'Earned', req: 'giant' },
  { key: 'flawless', name: 'Flawless', group: 'Earned', req: 'perfect' },
  { key: 'heritage', name: 'Heritage', group: 'Earned', req: 'veteran' },
  { key: 'origin', name: 'Origin', group: 'Earned', req: 'founder' },

  { key: 'rainbow', name: 'Rainbow Wave', group: 'Prestige', req: 'diamond' },
  { key: 'holo', name: 'Holo Foil', group: 'Prestige', req: 'diamond' },
  { key: 'eclipse', name: 'Eclipse', group: 'Prestige', req: 'mythic' },
  { key: 'crown', name: 'Sovereign', group: 'Prestige', req: 'apex' },
];

/* ---------------------------------------------------------------- cards */
export const CARDS = [
  { key: 'none', name: 'Default', group: 'Basics', req: 'free' },
  { key: 'grass', name: 'Goose Grass', group: 'Basics', req: 'free' },
  { key: 'court', name: 'Night Court', group: 'Basics', req: 'free' },
  { key: 'aurora', name: 'Aurora', group: 'Basics', req: 'free' },
  { key: 'mesh', name: 'Mesh Flow', group: 'Basics', req: 'free' },
  { key: 'ember', name: 'Ember', group: 'Basics', req: 'free' },
  { key: 'ocean', name: 'Deep Ocean', group: 'Basics', req: 'free' },

  { key: 'dusk', name: 'Dusk', group: 'Moods', req: 'shop' },
  { key: 'mint', name: 'Mint Fizz', group: 'Moods', req: 'shop' },
  { key: 'plum', name: 'Plum', group: 'Moods', req: 'shop' },
  { key: 'slate', name: 'Slate', group: 'Moods', req: 'shop' },
  { key: 'sand', name: 'Sandstorm', group: 'Moods', req: 'shop' },

  { key: 'gold', name: 'Gold Leaf', group: 'Metals', req: 'gold' },
  { key: 'steel', name: 'Brushed Steel', group: 'Metals', req: 'gold' },
  { key: 'rust', name: 'Oxide', group: 'Metals', req: 'gold' },

  { key: 'galaxy', name: 'Galaxy', group: 'Cosmic', req: 'diamond' },
  { key: 'nebulac', name: 'Nebula', group: 'Cosmic', req: 'diamond' },
  { key: 'eclipsec', name: 'Total Eclipse', group: 'Cosmic', req: 'diamond' },

  { key: 'bastion', name: 'Bastion', group: 'Earned', req: 'wall' },
  { key: 'suddendeath', name: 'Sudden Death', group: 'Earned', req: 'clutch' },
  { key: 'bullseye', name: 'Bullseye', group: 'Earned', req: 'scorer' },
  { key: 'lattice', name: 'Lattice', group: 'Earned', req: 'social' },
  { key: 'witching', name: 'Witching Hour', group: 'Earned', req: 'night' },
  { key: 'forge', name: 'The Forge', group: 'Earned', req: 'iron' },
  { key: 'blaze', name: 'Blaze', group: 'Earned', req: 'streak' },
  { key: 'trophyroom', name: 'Trophy Room', group: 'Earned', req: 'giant' },
  { key: 'spotless', name: 'Spotless', group: 'Earned', req: 'perfect' },
  { key: 'founders', name: "Founder's Cloth", group: 'Earned', req: 'founder' },

  { key: 'rainbow', name: 'Prism', group: 'Prestige', req: 'apex' },
  { key: 'mythicc', name: 'Vault', group: 'Prestige', req: 'mythic' },
];

export const FRAME_KEYS = FRAMES.map(f => f.key);
export const CARD_KEYS = CARDS.map(c => c.key);
export const GROUP_ORDER = ['Basics', 'Elements', 'Moods', 'Metals', 'Cosmic', 'Earned', 'Prestige'];

/* ------------------------------------------------------------- wearables */
// Overlay accessories worn ON the avatar (hat / eyewear / aura), bought with
// coins in the shop. Slot decides where the glyph sits; see .wear-* in the CSS.
export const WEARABLES = [
  { key: 'none', name: 'None', emoji: '', slot: 'none', group: 'None', price: 0 },

  { key: 'cap',    name: 'Goose Cap',    emoji: '🧢', slot: 'hat', group: 'Hats', price: 700 },
  { key: 'bow',    name: 'Ribbon',       emoji: '🎀', slot: 'hat', group: 'Hats', price: 1200 },
  { key: 'grad',   name: 'Scholar Cap',  emoji: '🎓', slot: 'hat', group: 'Hats', price: 1500 },
  { key: 'flower', name: 'Flower Crown', emoji: '🌸', slot: 'hat', group: 'Hats', price: 1800 },
  { key: 'tophat', name: 'Top Hat',      emoji: '🎩', slot: 'hat', group: 'Hats', price: 2500 },
  { key: 'crown',  name: 'Royal Crown',  emoji: '👑', slot: 'hat', group: 'Hats', price: 5000 },

  { key: 'glasses', name: 'Specs',    emoji: '👓', slot: 'face', group: 'Eyewear', price: 700 },
  { key: 'goggles', name: 'Goggles',  emoji: '🥽', slot: 'face', group: 'Eyewear', price: 1200 },
  { key: 'shades',  name: 'Cool Shades', emoji: '🕶️', slot: 'face', group: 'Eyewear', price: 1500 },

  { key: 'star',    name: 'Star Spark', emoji: '💫', slot: 'aura', group: 'Aura', price: 2200 },
  { key: 'frost',   name: 'Frost Aura', emoji: '❄️', slot: 'aura', group: 'Aura', price: 2500 },
  { key: 'spark',   name: 'Static Aura', emoji: '⚡', slot: 'aura', group: 'Aura', price: 2800 },
  { key: 'flame',   name: 'Flame Aura', emoji: '🔥', slot: 'aura', group: 'Aura', price: 3500 },
  { key: 'rainbow', name: 'Rainbow Aura', emoji: '🌈', slot: 'aura', group: 'Aura', price: 4000 },
  { key: 'wings',   name: 'Angel Wings', emoji: '🪽', slot: 'aura', group: 'Aura', price: 5000 },
];
export const WEARABLE_KEYS = WEARABLES.map(w => w.key);
export const WEARABLE_BY_KEY = Object.fromEntries(WEARABLES.map(w => [w.key, w]));
export const WEARABLE_GROUPS = ['Hats', 'Eyewear', 'Aura'];

/* ----------------------------------------------------------------- shop */
// Frames/cards from these families are BUYABLE. Basics are free from day one;
// the Earned family stays achievement-only, so coins can never mint a trophy
// frame — only the pretty-but-unremarkable ones are for sale.
const SHOP_GROUP_PRICE = { Elements: 500, Moods: 500, Metals: 2000, Cosmic: 5000, Prestige: 12000 };
const SALE_GROUPS = ['Metals', 'Cosmic', 'Prestige'];  // the rare pool that goes on flash sale

// Base coin price of any catalogue item (0 = not for sale / already free).
export function itemPrice(kind, key) {
  if (kind === 'wear') { const w = WEARABLE_BY_KEY[key]; return w ? (w.price || 0) : 0; }
  const it = (kind === 'frame' ? FRAMES : CARDS).find(x => x.key === key);
  return it ? (SHOP_GROUP_PRICE[it.group] || 0) : 0;
}

// One rarity ladder across frames, cards and wearables, so a filter chip means
// the same thing in every tab. Derived from price — pricing stays the only knob
// — except the Earned family, which coins can never buy at any price.
const PRICE_TIERS = [[0, 'free'], [900, 'common'], [2100, 'rare'], [6000, 'epic'], [Infinity, 'legendary']];
export const RARITIES = [
  { key: 'free', name: 'Free' }, { key: 'common', name: 'Common' }, { key: 'rare', name: 'Rare' },
  { key: 'epic', name: 'Epic' }, { key: 'legendary', name: 'Legendary' }, { key: 'trophy', name: 'Trophy' },
];
export function rarityOf(kind, key) {
  const it = kind === 'wear' ? WEARABLE_BY_KEY[key] : (kind === 'frame' ? FRAMES : CARDS).find(x => x.key === key);
  if (!it) return 'free';
  if (it.group === 'Earned') return 'trophy';
  const p = itemPrice(kind, key);
  return PRICE_TIERS.find(([max]) => p <= max)[1];
}

// The full storefront: every purchasable frame, card and wearable.
export function shopItems() {
  const out = [];
  for (const f of FRAMES) if (SHOP_GROUP_PRICE[f.group]) out.push({ kind: 'frame', key: f.key, name: f.name, group: f.group, base: SHOP_GROUP_PRICE[f.group] });
  for (const c of CARDS) if (SHOP_GROUP_PRICE[c.group]) out.push({ kind: 'card', key: c.key, name: c.name, group: c.group, base: SHOP_GROUP_PRICE[c.group] });
  for (const w of WEARABLES) if (w.price) out.push({ kind: 'wear', key: w.key, name: w.name, group: w.group, slot: w.slot, emoji: w.emoji, base: w.price });
  return out.map(it => ({ ...it, rarity: rarityOf(it.kind, it.key) }));
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The passing merchant's "Golden Time": a handful of rare frames/cards at a
// discount, rotating every 6h. Pure function of the clock, so every player
// sees the SAME deal and the server can trust the discounted price it charges.
const SALE_WINDOW_MS = 6 * 3600 * 1000;
export function flashSale(now = Date.now()) {
  const slot = Math.floor(now / SALE_WINDOW_MS);
  const rng = mulberry32((slot >>> 0) ^ 0x9e3779b9);
  const pool = [
    ...FRAMES.filter(f => SALE_GROUPS.includes(f.group)).map(f => ({ kind: 'frame', key: f.key, name: f.name, group: f.group })),
    ...CARDS.filter(c => SALE_GROUPS.includes(c.group)).map(c => ({ kind: 'card', key: c.key, name: c.name, group: c.group })),
  ];
  const picks = pool.map(p => ({ p, r: rng() })).sort((x, y) => x.r - y.r).map(x => x.p).slice(0, 3);
  const discount = [0.30, 0.40, 0.50][Math.floor(rng() * 3)];
  return {
    slot, discount, endsAt: (slot + 1) * SALE_WINDOW_MS,
    items: picks.map(p => {
      const base = SHOP_GROUP_PRICE[p.group];
      return { ...p, base, price: Math.max(1, Math.round(base * (1 - discount))) };
    }),
  };
}
// What a buyer pays right now for one item (flash-sale aware). Server-authoritative.
export function priceNow(kind, key, now = Date.now()) {
  const sale = flashSale(now);
  const hit = sale.items.find(i => i.kind === kind && i.key === key);
  return hit ? hit.price : itemPrice(kind, key);
}

/* ----------------------------------------------------------- self-check */
const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (IS_MAIN && process.argv.includes('--test')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };
  assert(new Set(FRAME_KEYS).size === FRAME_KEYS.length, 'frame keys unique');
  assert(new Set(CARD_KEYS).size === CARD_KEYS.length, 'card keys unique');
  for (const f of FRAMES) assert(THEME_BY_KEY[f.req], `frame ${f.key} has a real theme (${f.req})`);
  for (const c of CARDS) assert(THEME_BY_KEY[c.req], `card ${c.key} has a real theme (${c.req})`);
  for (const f of FRAMES) assert(GROUP_ORDER.includes(f.group), `frame ${f.key} group known`);
  for (const c of CARDS) assert(GROUP_ORDER.includes(c.group), `card ${c.key} group known`);
  // Never sell somebody something they already own for nothing.
  for (const it of shopItems()) {
    const req = it.kind === 'wear' ? 'shop' : ((it.kind === 'frame' ? FRAMES : CARDS).find(x => x.key === it.key) || {}).req;
    assert(req !== 'free', `priced ${it.kind} ${it.key} is not also free`);
    assert(it.group !== 'Earned', `${it.kind} ${it.key} is not an achievement reward for sale`);
    assert(RARITIES.some(r => r.key === it.rarity), `${it.kind} ${it.key} has a real rarity`);
  }
  assert(rarityOf('frame', 'auto') === 'free' && rarityOf('frame', 'fortress') === 'trophy', 'free + trophy rarities');
  assert(rarityOf('frame', 'ember') === 'common' && rarityOf('frame', 'gold') === 'rare', 'common + rare rarities');
  assert(rarityOf('frame', 'galaxyf') === 'epic' && rarityOf('frame', 'rainbow') === 'legendary', 'epic + legendary rarities');

  const tierIndex = { bronze: 0, silver: 1, gold: 2, platinum: 3, diamond: 4, conqueror: 5, grandmaster: 6 };
  const base = {
    gamesCount: 0, pointsAgainst: 0, pointsFor: 0, matches: 0, distinctPartners: 0,
    nightMatches: 0, longestWin: 0, game3Wins: 0, comebackWins: 0, created_at: new Date(),
  };
  const ctx = { tierRank: 0, tierIndex, rank: 5, mythicsHeld: 0, giantWins: 0, shutouts: 0, memberNo: 3 };

  const rookie = earnedThemes({ ...base }, ctx);
  assert(rookie.length === 1 && rookie[0] === 'free', 'a rookie only gets the free theme');

  const wallie = earnedThemes({ ...base, gamesCount: 8, pointsAgainst: 8 * 12 }, ctx);
  assert(wallie.includes('wall'), 'stingy defence unlocks wall');
  assert(!earnedThemes({ ...base, gamesCount: 8, pointsAgainst: 8 * 18 }, ctx).includes('wall'), 'leaky defence does not');
  assert(!earnedThemes({ ...base, gamesCount: 3, pointsAgainst: 3 }, ctx).includes('wall'), 'wall needs 6+ games');

  assert(earnedThemes({ ...base, distinctPartners: 6 }, ctx).includes('social'), 'social at 6 partners');
  assert(earnedThemes({ ...base, longestWin: 5 }, ctx).includes('streak'), 'streak at 5');
  assert(earnedThemes({ ...base }, { ...ctx, memberNo: 1 }).includes('founder'), 'member #1 is a founder');
  assert(!earnedThemes({ ...base }, ctx).includes('founder'), 'member #3 is not');
  assert(earnedThemes({ ...base }, { ...ctx, rank: 1 }).includes('apex'), 'club #1 unlocks apex');
  assert(earnedThemes({ ...base }, { ...ctx, mythicsHeld: 1 }).includes('mythic'), 'mythic holder');
  assert(earnedThemes({ ...base }, { ...ctx, tierRank: 4 }).includes('diamond'), 'diamond by tier rank');
  assert(!earnedThemes({ ...base }, { ...ctx, tierRank: 1 }).includes('diamond'), 'silver is not diamond');

  const old = new Date(Date.now() - 40 * 86400000);
  assert(earnedThemes({ ...base, created_at: old }, ctx).includes('veteran'), '40 days = veteran');

  // wearables + shop
  assert(new Set(WEARABLE_KEYS).size === WEARABLE_KEYS.length, 'wearable keys unique');
  for (const w of WEARABLES) assert(w.key === 'none' || (w.price > 0 && WEARABLE_GROUPS.includes(w.group)), `wearable ${w.key} priced + grouped`);
  const items = shopItems();
  assert(items.length > 20 && items.every(i => i.base > 0), 'shop items all priced');
  assert(items.some(i => i.kind === 'frame') && items.some(i => i.kind === 'card') && items.some(i => i.kind === 'wear'), 'shop mixes frames/cards/wear');
  assert(!items.some(i => i.kind === 'frame' && FRAMES.find(f => f.key === i.key && (f.group === 'Basics' || f.group === 'Earned'))), 'basics/earned frames never sold');
  assert(itemPrice('wear', 'crown') === 5000 && itemPrice('frame', 'galaxyf') === 5000, 'itemPrice reads the tables');

  const t0 = 1_000_000_000_000; // fixed instant → deterministic sale
  const s1 = flashSale(t0), s2 = flashSale(t0 + 1000), s3 = flashSale(t0 + SALE_WINDOW_MS + 1);
  assert(JSON.stringify(s1.items) === JSON.stringify(s2.items), 'flash sale stable within a window');
  assert(s1.slot !== s3.slot, 'flash sale rotates to a new window');
  assert(s1.items.length === 3 && s1.items.every(i => i.price < i.base), 'featured items are discounted');
  assert(s1.items.every(i => i.kind === 'frame' || i.kind === 'card'), 'featured items are frames or cards');
  assert(priceNow(s1.items[0].kind, s1.items[0].key, t0) === s1.items[0].price, 'priceNow honours the sale');

  // a broken predicate must never lock someone out of saving
  const bad = { key: 'boom', name: 'x', note: 'x', test: () => { throw new Error('boom'); } };
  THEMES.push(bad);
  earnedThemes({ ...base }, ctx);
  THEMES.pop();

  console.log(`cosmetics.js self-check: PASS (${FRAMES.length} frames, ${CARDS.length} cards, ${WEARABLES.length - 1} wearables, ${THEMES.length} themes)`);
}
