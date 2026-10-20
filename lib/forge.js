import { pathToFileURL } from 'node:url';
// lib/forge.js — the Blacksmith Goose: gear, upgrading (+1..+9) and evolution.
//
// THE RULE THIS FILE EXISTS TO KEEP: gear NEVER touches Elo, rank, titles or a
// match result. It only speeds up the coin/XP loop and its own luck. If a stat
// here could change who is winning the ladder, it does not belong in this file.
//
// Every roll happens on the SERVER with crypto-grade randomness. Nothing in
// here reads or trusts client input beyond a slot name.

/* ------------------------------------------------------------------ stats */
// Three stats, one per slot, all self-contained:
//   coin — more coins minted per level
//   xp   — more XP per match (levels arrive sooner, so more coins too)
//   luck — better odds at this very forge (and better wink odds)
export const STATS = {
  coin: { key: 'coin', name: 'Coin Find', icon: '🪙', note: 'More coins each time you level up' },
  xp: { key: 'xp', name: 'XP Boost', icon: '📈', note: 'More XP from every match you play' },
  luck: { key: 'luck', name: 'Fortune', icon: '🍀', note: 'Better forge odds and a better shot at a Wink' },
};
export const STAT_KEYS = Object.keys(STATS);

export const SLOTS = [
  { key: 'racket', name: 'Racket', icon: '🏸', stat: 'coin' },
  { key: 'boots', name: 'Court Shoes', icon: '👟', stat: 'xp' },
  { key: 'shuttle', name: 'Shuttle', icon: '🪶', stat: 'luck' },
];
export const SLOT_KEYS = SLOTS.map(s => s.key);
export const SLOT_BY_KEY = Object.fromEntries(SLOTS.map(s => [s.key, s]));

/* ------------------------------------------------------------------ tiers */
// Kept only so old callers that ask for a "tier" get something sane. The real
// progression is ELEMENTS (what you buy) x STAGES (what evolving unlocks).
export const TIERS = [];
export const TIER_KEYS = [];
export const TIER_BY_KEY = {};

/* --------------------------------------------------------------- the ladder */
export const MAX_LEVEL = 9;
// Cumulative % the main stat is worth at each +N. Accelerating, so the last
// few levels are the ones worth gambling for. +9 lands exactly on 5.0%.
export const LEVEL_BONUS = [0, 0.4, 0.8, 1.2, 1.7, 2.2, 2.8, 3.4, 4.1, 5.0];
// Coins per attempt to reach +N.
export const FORGE_COST = [0, 50, 80, 120, 170, 240, 330, 460, 650, 900];
// Base chance (0..1) that an attempt to reach +N succeeds. Softened at the top
// end: the old 25% at +9 meant a bad run could eat thousands of coins and read
// as broken even when the maths was clean.
export const BASE_ODDS = [1, 1, 1, 0.95, 0.92, 0.85, 0.78, 0.66, 0.54, 0.42];

// PITY. Every consecutive failure on the same item adds this to the next
// attempt, resetting the moment you succeed. The odds stay honest — they are
// published and the UI shows the boost — but a cold streak cannot run away
// from you, which is what actually makes a forge feel rigged.
export const PITY_STEP = 0.06;
export const PITY_MAX = 0.36;

// A Wink is Cookie-Run's lucky spark. It can ONLY strike when you evolve —
// never on an ordinary swing — so it lands on the milestone worth reaching
// instead of on a random hammer blow. Once per item, permanently multiplies
// the item's main stat. Diamond +9 winked = 5.0 × 1.2 = 6.0%, the highest
// number in the game.
export const WINK_MULT = 1.2;
// There are only three evolutions in an item's life, so this has to be far
// higher than a per-swing rate would be or a Wink would be unreachable. ~12%
// per evolution works out to roughly one item in three ever winking, which the
// self-check measures rather than assumes.
export const WINK_BASE = 0.12;
// Failing an attempt from +6 or higher knocks one level off. Below that a
// failure only costs the coins. Nothing in this game is ever destroyed —
// losing a real item to a dice roll is where players quit.
export const FAIL_DROP_FROM = 6;
// Fortune helps, but +9 must never be a certainty.
export const ODDS_CAP = 0.95;
// Substats no longer come from levelling — a Bless Stone is the only source.

/* ----------------------------------------------------------------- items */
// Each slot has its OWN catalogue. A racket is a legendary weapon, shoes are
// about movement, a shuttle is a projectile — sharing one "Hell/Heaven" prefix
// across all three read like filler, so nothing is shared any more.
//
// Names are originals in the spirit of the genre, not lifted from anything.
// `source:'shop'` is purchasable (three per slot); everything else is
// Mystery-Pouch-only, which is what makes a good one worth having.
const it = (key, name, icon, rarity, source, price, fx, note, set = null) => ({ key, name, icon, rarity, source, price, fx, note, set });

const RACKETS = [
  it('plank', 'Wooden Plank', '🪵', 'common', 'shop', 300, 'el-wood', 'A plank with strings. Technically legal.'),
  it('fryingpan', 'Frying Pan', '🍳', 'rare', 'shop', 2500, 'el-ember', 'Certified in an entirely different genre.', 'what'),
  it('swatter', 'Royal Fly Swatter', '🪰', 'epic', 'shop', 9000, 'el-solar', 'Ceremonial. Devastating. Faintly ridiculous.'),

  it('bamboo', 'Bamboo Splitter', '🎋', 'common', 'pouch', 0, 'el-jade', 'Cut from the grove behind the hall. Nobody asked.'),
  it('broom', 'Enchanted Broom', '🧹', 'common', 'pouch', 0, 'el-moss', 'Sweeps the court and the opposition.'),
  it('baguette', 'Frozen Baguette', '🥖', 'common', 'pouch', 0, 'el-sand', 'Left in the freezer since April. Structurally sound.'),
  it('katana', 'Feathered Katana', '⚔️', 'rare', 'pouch', 0, 'el-shadow', 'Folded a thousand times. Strung once.'),
  it('chakra', 'Chakra Weave', '🌀', 'rare', 'pouch', 0, 'el-storm', 'Hums when you are about to lose. Unhelpfully.'),
  it('bonker', 'The Bonker', '🔨', 'rare', 'pouch', 0, 'el-bone', 'Subtle as a brick. Twice as effective.'),
  it('airguitar', 'Air Guitar', '🎸', 'rare', 'pouch', 0, 'el-venom', 'Every rally ends in an unnecessary solo.'),
  it('loadeddice', 'Loaded Dice', '🎲', 'rare', 'pouch', 0, 'el-tide', 'Six sides. All of them say "one more".', 'gamble'),
  it('infinity', 'Infinity Frame', '♾️', 'epic', 'pouch', 0, 'el-void', 'Nothing ever quite reaches it. Including your smashes.'),
  it('domain', 'Domain Racket', '🟣', 'epic', 'pouch', 0, 'el-hell', 'Declares the court its own. The court disagrees.'),
  it('excaliburd', 'Excaliburd', '🗡️', 'epic', 'pouch', 0, 'el-heaven', 'Pulled from a stone by a goose. Legally binding.', 'honour'),
  it('phoenixdown', 'Phoenix Down', '🔥', 'epic', 'pouch', 0, 'el-phoenix', 'Revives your form once per set. Then leaves.'),
  it('meteorframe', 'Meteor Frame', '☄️', 'epic', 'pouch', 0, 'el-meteor', 'Arrived at speed. Left a mark on the ceiling.'),
  it('sixseven', 'The 67', '🔢', 'legendary', 'pouch', 0, 'el-aurora', 'Six. Seven. Nobody knows why. Everybody says it.', 'brainrot'),
  it('ragnarok', 'Ragnarök', '🌩️', 'legendary', 'pouch', 0, 'el-dragon', 'Ends things. Sets, mostly.'),
  it('eventhorizon', 'Event Horizon', '🕳️', 'legendary', 'pouch', 0, 'el-abyss', 'The shuttle goes in. Something comes out. Not the shuttle.', 'endline'),
  it('goosehand', 'Goose Hand', '🪿', 'legendary', 'pouch', 0, 'el-cosmos', 'The final form. It is just a goose. It is enough.'),
];

const SHOES = [
  it('sandals', 'Rubber Sandals', '🩴', 'common', 'shop', 300, 'el-wood', 'Squeak on every step. Announce your intentions.'),
  it('runners', 'Court Runners', '👟', 'rare', 'shop', 2500, 'el-ember', 'Actual sports shoes. Revolutionary, apparently.'),
  it('jetheels', 'Jet Heels', '🚀', 'epic', 'shop', 9000, 'el-solar', 'Ignition on the third step. Insurance not included.'),

  it('luckysocks', 'Lucky Socks', '🧦', 'common', 'pouch', 0, 'el-moss', 'Unwashed since the winning streak began. Do not touch.', 'gamble'),
  it('oneflipflop', 'One Flip-Flop', '🩴', 'common', 'pouch', 0, 'el-sand', 'Its partner left for a better club. You cope.', 'what'),
  it('steeltoe', 'Steel Toecaps', '🥾', 'common', 'pouch', 0, 'el-bone', 'Built for a building site. Repurposed with confidence.'),
  it('bladerunners', 'Blade Runners', '🗡️', 'rare', 'pouch', 0, 'el-shadow', 'Cut corners. Literally. The floor has notes.'),
  it('springloaders', 'Spring Loaders', '🌀', 'rare', 'pouch', 0, 'el-storm', 'Every jump smash lands two courts away.'),
  it('iceskates', 'Ice Skates', '⛸️', 'rare', 'pouch', 0, 'el-frost', 'Terrible idea. Undefeated at the net.'),
  it('thundergeta', 'Thunder Clogs', '👘', 'rare', 'pouch', 0, 'el-storm', 'Audible from the car park. Feared in the hall.'),
  it('mosstreads', 'Moss Treads', '🍃', 'rare', 'pouch', 0, 'el-jade', 'Grew here. Refuses to be removed.'),
  it('afterimage', 'Afterimage', '💨', 'epic', 'pouch', 0, 'el-void', 'You are already elsewhere. So is your positioning.'),
  it('gravitycuffs', 'Gravity Cuffs', '🏋️', 'epic', 'pouch', 0, 'el-hell', 'Take them off before the decider. Everyone does.'),
  it('blinkstep', 'Blink Step', '✨', 'epic', 'pouch', 0, 'el-spirit', 'Arrives before it departs. Referees hate it.'),
  it('talaria', 'Talaria', '🪽', 'epic', 'pouch', 0, 'el-heaven', 'Winged sandals. Older than the sport. Still faster.', 'honour'),
  it('glacierwalk', 'Glacier Walk', '🧊', 'epic', 'pouch', 0, 'el-glacier', 'Slow. Inevitable. Reshapes the terrain.'),
  it('speedofsound', 'Speed of Sound', '🔊', 'legendary', 'pouch', 0, 'el-aurora', 'You hear the smash after it lands.', 'endline'),
  it('lightstep', 'Lightstep', '🌟', 'legendary', 'pouch', 0, 'el-celestial', 'Leaves no footprint. Leaves a scoreline.'),
  it('ohiosliders', 'Ohio Sliders', '🌽', 'legendary', 'pouch', 0, 'el-cosmos', 'Only in Ohio. Nobody has explained this.', 'brainrot'),
  it('apextalons', 'Apex Talons', '🦅', 'legendary', 'pouch', 0, 'el-dragon', 'Grip the floor like prey. Alarming to watch.'),
];

const SHUTTLES = [
  it('plasticbirdie', 'Plastic Birdie', '🏸', 'common', 'shop', 300, 'el-wood', 'The one from the school kit. Indestructible. Awful.'),
  it('goosefeather', 'Goose Feather', '🪶', 'rare', 'shop', 2500, 'el-ember', 'Locally sourced. The goose is fine. Mostly.'),
  it('cometcork', 'Comet Cork', '☄️', 'epic', 'shop', 9000, 'el-solar', 'Leaves a trail. Cleaning staff have complained.'),

  it('paperplane', 'Paper Plane', '✈️', 'common', 'pouch', 0, 'el-sand', 'Folded during a team talk. Nobody was listening.'),
  it('pingpong', 'Ping-Pong Ball', '🏓', 'common', 'pouch', 0, 'el-moss', 'Wrong sport. Correct attitude.', 'what'),
  it('oldcork', 'Old Cork', '🍾', 'common', 'pouch', 0, 'el-bone', 'From a bottle opened after a famous win.'),
  it('shuriken', 'Shuriken', '🌟', 'rare', 'pouch', 0, 'el-shadow', 'Returns. Occasionally to you.'),
  it('curveball', 'Curveball', '⚾', 'rare', 'pouch', 0, 'el-tide', 'Also the wrong sport. Also devastating.'),
  it('spiralsphere', 'Spiral Sphere', '🌀', 'rare', 'pouch', 0, 'el-storm', 'Spins for a worrying length of time.'),
  it('cherrybomb', 'Cherry Bomb', '🍒', 'rare', 'pouch', 0, 'el-hell', 'Loud on contact. The net flinches.', 'gamble'),
  it('boltbird', 'Bolt', '🏹', 'rare', 'pouch', 0, 'el-venom', 'Flat, fast and faintly rude.'),
  it('holloworb', 'Hollow Orb', '🟣', 'epic', 'pouch', 0, 'el-void', 'Weighs nothing. Lands like everything.'),
  it('meteorite', 'Meteorite', '☄️', 'epic', 'pouch', 0, 'el-meteor', 'Older than the club. Angrier than the club.'),
  it('singularity', 'Singularity', '⚫', 'epic', 'pouch', 0, 'el-abyss', 'Technically still arriving.'),
  it('gatheredlight', 'Gathered Light', '🔵', 'epic', 'pouch', 0, 'el-spirit', 'Everyone in the hall lent it a little. Nobody agreed to.'),
  it('tacticalbirdie', 'Tactical Birdie', '💣', 'epic', 'pouch', 0, 'el-phoenix', 'Deployed, not served. The umpire has questions.'),
  it('fallingstar', 'Falling Star', '💫', 'legendary', 'pouch', 0, 'el-celestial', 'Make a wish. It will not help your backhand.'),
  it('therizzler', 'The Rizzler', '😎', 'legendary', 'pouch', 0, 'el-aurora', 'Wins rallies purely on presence.', 'brainrot'),
  it('sacredbread', 'Sacred Bread', '🍞', 'legendary', 'pouch', 0, 'el-heaven', 'The holiest object a goose can conceive of.', 'honour'),
  it('omegashuttle', 'Omega', '🔆', 'legendary', 'pouch', 0, 'el-cosmos', 'The last shuttle. There is nothing after it.', 'endline'),
];

export const GEAR_ITEMS = { racket: RACKETS, boots: SHOES, shuttle: SHUTTLES };

/* ------------------------------------------------------------------- sets */
// Wear a matching racket, shoes and shuttle and the whole locker gets louder.
// Two pieces is a small nudge; three is a real reward with a RULE attached, so
// a set is a genuine build decision rather than a slightly bigger number.
const set = (key, name, icon, note, two, three, perk) => ({ key, name, icon, note, two, three, perk });
export const SETS = [
  set('brainrot', 'The 67', '🔢',
    'Six. Seven. Ohio. Nobody involved can explain any of it.',
    { coin: 2 }, { coin: 5 },
    '+25% coins from every stage you clear.'),
  set('what', 'The What', '💀', 'A frying pan, one flip-flop and a ping-pong ball. Yes, really.',
    { luck: 2 }, { luck: 6 },
    'Nobody knows what you are doing. Neither do you. It is working.'),
  set('honour', 'Honour Guard', '⚜️', 'A sword from a stone, winged sandals and the holiest loaf.',
    { xp: 2 }, { xp: 5 },
    '+60 Power on the Goose Trail.'),
  set('gamble', "Gambler's Ruin", '🎲', 'Loaded dice, unwashed socks and something that explodes.',
    { luck: 2 }, { luck: 4 },
    'Every stage clear rolls one extra drop.'),
  set('endline', 'End of the Line', '🌌', 'The last racket, the last step and the last shuttle.',
    { coin: 2, xp: 2, luck: 2 }, { coin: 4, xp: 4, luck: 4 },
    '+120 Power on the Goose Trail.'),
];
export const SET_KEYS = SETS.map(s => s.key);
export const SET_BY_KEY = Object.fromEntries(SETS.map(s => [s.key, s]));
export const setPieces = (key) => ELEMENTS.filter(e => e.set === key);

// How many pieces of each set are currently worn, and what that is worth.
// Only OWNED, equipped gear counts, and a set caps at three — a corrupt row
// listing the same piece twice can never stack.
export function setStatus(items) {
  const seen = {};
  for (const g of items || []) {
    if (!g || !g.owned) continue;
    const def = ELEMENT_BY_KEY[g.element];
    if (!def || !def.set) continue;
    (seen[def.set] ||= new Set()).add(g.slot);       // a Set, so one slot counts once
  }
  return SETS.map(s => {
    const n = seen[s.key] ? Math.min(3, seen[s.key].size) : 0;
    return { ...s, pieces: n, active2: n >= 2, active3: n >= 3 };
  });
}
export function setBonuses(items) {
  const out = { coin: 0, xp: 0, luck: 0, save: 0 };
  const perks = new Set();
  let power = 0;
  for (const s of setStatus(items)) {
    if (s.pieces >= 2) for (const [k, v] of Object.entries(s.two)) out[k] = (out[k] || 0) + v;
    if (s.pieces >= 3) {
      for (const [k, v] of Object.entries(s.three)) out[k] = (out[k] || 0) + v;
      perks.add(s.key);
      if (s.key === 'honour') power += 60;
      if (s.key === 'endline') power += 120;
    }
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 100) / 100;
  return { stats: out, perks: [...perks], power };
}
// One flat list with the slot stamped on, because most callers want that.
export const ELEMENTS = Object.entries(GEAR_ITEMS).flatMap(([slot, list]) => list.map(x => ({ ...x, slot })));
export const ELEMENT_KEYS = ELEMENTS.map(e => e.key);
export const ELEMENT_BY_KEY = Object.fromEntries(ELEMENTS.map(e => [e.key, e]));
export const elementFx = (key) => (ELEMENT_BY_KEY[key] || {}).fx || 'el-wood';
export const itemsForSlot = (slot) => (GEAR_ITEMS[slot] || []).map(x => ({ ...x, slot }));
export const SHOP_ELEMENTS = ELEMENTS.filter(e => e.source === 'shop');
export const POUCH_ELEMENTS = ELEMENTS.filter(e => e.source === 'pouch');
export const STARTER_ELEMENT = 'plank';
// Does this item actually belong in that slot? The server checks this on buy.
export const fitsSlot = (key, slot) => !!ELEMENT_BY_KEY[key] && ELEMENT_BY_KEY[key].slot === slot;

/* -------------------------------------------------------------- the bag */
// Found items take up room. You start with a small bag and pay to enlarge it,
// which gives coins a use once your gear is already good.
export const BAG_BASE = 20, BAG_STEP = 5, BAG_MAX = 50;
export const BAG_LEVELS = (BAG_MAX - BAG_BASE) / BAG_STEP;          // 6 upgrades
export const bagCapacity = (level) => Math.min(BAG_MAX, BAG_BASE + Math.max(0, Math.min(BAG_LEVELS, level | 0)) * BAG_STEP);
// Rises steeply so the last few slots are a real goal.
const BAG_COSTS = [10000, 18000, 30000, 48000, 75000, 120000];
export const bagUpgradeCost = (level) => (level >= BAG_LEVELS ? 0 : BAG_COSTS[level] || 0);
export const bagFull = (level, held) => held >= bagCapacity(level);

/* -------------------------------------------------------------- evolution */
// Evolving is ONLY possible at +9, and the reward is a substat slot. That is
// the whole ladder: max it out, evolve, gain a socket, bless the socket.
// Evolving is the milestone. Each stage costs coins AND a specific stone, gets
// stronger, opens a socket the stone immediately fills, and wears a louder
// aura. The stone requirement climbs — Bless, then Sacred, then Divine — so
// the last evolution is gated on the rarest thing in the game.
export const STAGES = [
  { key: 'base', name: 'Base', icon: '', slots: 0, price: 0, stone: null, mult: 1, aura: '' },
  { key: 'awakened', name: 'Awakened', icon: '✦', slots: 1, price: 3000, stone: 'bless', mult: 1.15, aura: 'au-awakened' },
  { key: 'ascended', name: 'Ascended', icon: '✧', slots: 2, price: 9000, stone: 'sacred', mult: 1.3, aura: 'au-ascended' },
  { key: 'transcendent', name: 'Transcendent', icon: '❉', slots: 3, price: 24000, stone: 'divine', mult: 1.5, aura: 'au-transcendent' },
];
export const STAGE_KEYS = STAGES.map(s => s.key);
export const STAGE_BY_KEY = Object.fromEntries(STAGES.map(s => [s.key, s]));
export const stageIndex = (key) => STAGES.findIndex(s => s.key === key);
export const MAX_SUBSTATS = STAGES[STAGES.length - 1].slots;

/* --------------------------------------------------------------- blessing */
// A stone sockets ONE random substat into ONE empty slot. The GRADE is what
// everybody actually plays for — an Omniscient socket glows like a mythic
// frame and triples the line.
//
// The grade table below is just the payoff. The ODDS live on the stone, so a
// better stone is a straight upgrade rather than a different mechanic.
export const BLESS_GRADES = [
  { key: 'normal', name: 'Blessed', mult: 1, fx: '', note: 'A clean socket.' },
  { key: 'super', name: 'Super Blessed', mult: 1.5, fx: 'bl-super', note: '+50% — glows like Sovereign.' },
  { key: 'heavenly', name: 'Heavenly Blessed', mult: 2, fx: 'bl-heavenly', note: '+100% — glows like the Apex Goose.' },
  { key: 'omni', name: 'Omniscient', mult: 3, fx: 'bl-omni', note: '+200% — the mythic glow.' },
];
export const GRADE_KEYS = BLESS_GRADES.map(g => g.key);
export const GRADE_BY_KEY = Object.fromEntries(BLESS_GRADES.map(g => [g.key, g]));
export const gradeMult = (key) => (GRADE_BY_KEY[key] || GRADE_BY_KEY.normal).mult;
export const gradeFx = (key) => (GRADE_BY_KEY[key] || GRADE_BY_KEY.normal).fx;

// Three stones, all found in pouches, none for sale. Sacred carries the odds
// the game shipped with; Bless is the everyday one below it and Divine is the
// one people will hoard.
export const STONES = [
  {
    key: 'bless', name: 'Bless Stone', icon: '💠', rarity: 'rare',
    odds: { normal: 0.60, super: 0.30, heavenly: 0.08, omni: 0.02 },
    note: 'The common stone. Usually a clean socket, occasionally a gift.',
  },
  {
    key: 'sacred', name: 'Sacred Stone', icon: '🔯', rarity: 'epic',
    odds: { normal: 0.30, super: 0.40, heavenly: 0.20, omni: 0.10 },
    note: 'Twice the chance at Heavenly, five times the chance at Omniscient.',
  },
  {
    key: 'divine', name: 'Divine Stone', icon: '✴️', rarity: 'legendary',
    odds: { normal: 0.10, super: 0.35, heavenly: 0.35, omni: 0.20 },
    note: 'Nine times in ten it beats a plain blessing. One in five is Omniscient.',
  },
];
export const STONE_KEYS = STONES.map(s => s.key);
export const STONE_BY_KEY = Object.fromEntries(STONES.map(s => [s.key, s]));
export const BLESS_ROLLS = [0.3, 0.4, 0.5];

export const blankItem = (slot, element = 'wood') => ({ slot, element, stage: 'base', level: 0, wink: false, subs: [] });

export const slotsFor = (item) => (STAGE_BY_KEY[item.stage] || STAGES[0]).slots;
export const usedSlots = (item) => (item.subs || []).length;
export const freeSlots = (item) => Math.max(0, slotsFor(item) - usedSlots(item));
// Evolving fills the socket it opens, so there is normally nothing empty to
// bless. Blessing is therefore a REROLL of a socket you already have — which
// is why owning a socket, not an empty one, is the requirement.
export const canBless = (item) => slotsFor(item) > 0;
export const stageMult = (item) => (STAGE_BY_KEY[item && item.stage] || STAGES[0]).mult;
export const stageAura = (item) => (STAGE_BY_KEY[item && item.stage] || STAGES[0]).aura;
export const nextStage = (item) => STAGES[stageIndex(item.stage) + 1] || null;
// The one rule the whole system hangs off.
export const canEvolve = (item) => item.level >= MAX_LEVEL && !!nextStage(item);
export const evolveCost = (item) => (nextStage(item) ? nextStage(item).price : 0);
// Which stone the NEXT evolution demands. Fixed per stage, never a choice.
export const evolveStone = (item) => (nextStage(item) ? nextStage(item).stone : null);
export const atCeiling = (item) => item.level >= MAX_LEVEL;
export const maxLevelFor = () => MAX_LEVEL;
export const forgeCost = (item) => (atCeiling(item) ? 0 : FORGE_COST[item.level + 1]);
// Spending one of these on a swing makes it certain. It is the answer to "70%
// is too hard" without quietly lying about the odds.
export const GUARANTEE_STONE = 'bless';

// Roll one substat on a given stone's odds. Shared by evolving (which fills
// the socket it just opened) and blessing (which rerolls an existing one).
function rollSub(rng, stoneKey) {
  const stone = STONE_BY_KEY[stoneKey];
  if (!stone) throw new Error('unknown stone');
  const stat = STAT_KEYS[Math.floor(rng() * STAT_KEYS.length)] || 'coin';
  const base = BLESS_ROLLS[Math.floor(rng() * BLESS_ROLLS.length)] || BLESS_ROLLS[0];
  let roll = rng(), grade = BLESS_GRADES[0];
  for (const g of BLESS_GRADES) { roll -= (stone.odds[g.key] || 0); if (roll <= 0) { grade = g; break; } }
  return { stat, val: Math.round(base * grade.mult * 100) / 100, grade: grade.key, stone: stone.key };
}

// One stone, spent to REROLL one socket you already own. `index` picks which.
// The new line replaces the old one outright — better or worse, that is the
// gamble you paid for.
export function bless(item, rng, stoneKey = 'bless', index = null) {
  if (!canBless(item)) throw new Error('no socket — evolve first');
  const subs = [...(item.subs || [])];
  const i = index === null || index === undefined ? subs.length : Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= slotsFor(item)) throw new Error('no such socket');
  const sub = rollSub(rng, stoneKey);
  const prev = subs[i] || null;
  subs[i] = sub;
  return { sub, prev, grade: sub.grade, stone: sub.stone, reroll: !!prev, item: { ...item, subs } };
}

/* ------------------------------------------------------------------ skins */
// A skin repaints an item. It changes NOTHING about its stats — it exists so
// two players at diamond +9 don't look identical. Skins are found in Mystery
// Pouches, never sold, so a loud racket means you got lucky, not that you paid.
// `fx` is a CSS class the client already knows how to draw.
const sk = (key, name, rarity, fx, note) => ({ key, name, rarity, fx, note });
export const SKINS = [
  sk('none', 'Standard', 'common', '', 'Factory finish. Honest work.'),

  sk('ember', 'Ember Wrap', 'common', 'sk-ember', 'Warm to the touch. Slightly alarming.'),
  sk('frost', 'Frostbite', 'common', 'sk-frost', 'The shuttle arrives cold. So do you.'),
  sk('moss', 'Pondweed', 'common', 'sk-moss', 'Dredged up. Cleaned. Mostly.'),
  sk('clay', 'Terracotta', 'common', 'sk-clay', 'Baked in a kiln by a goose with a hobby.'),

  sk('neon', 'Neon Grip', 'rare', 'sk-neon', 'Visible from the car park at midnight.'),
  sk('carbon', 'Carbon Weave', 'rare', 'sk-carbon', 'Looks expensive. Was, briefly, somebody else\'s.'),
  sk('sakura', 'Sakura Drift', 'rare', 'sk-sakura', 'Petals fall. The shuttle does not.'),
  sk('tide', 'Riptide', 'rare', 'sk-tide', 'Blue on blue. Somewhere, a wave.'),

  sk('venom', 'Venom Coat', 'epic', 'sk-venom', 'Not actually venomous. Legally, we must say that.'),
  sk('aurora', 'Aurora Veil', 'epic', 'sk-aurora', 'Stolen from a sky far north of here.'),
  sk('magma', 'Magma Core', 'epic', 'sk-magma', 'Still cooling. It has been years.'),

  sk('void', 'Void Touch', 'legendary', 'sk-void', 'Light goes in. Nothing comes back.'),
  sk('prism', 'Prismatic', 'legendary', 'sk-prism', 'Every colour at once, which is really no colour at all.'),
  sk('goldleaf', 'Gilded Leaf', 'legendary', 'sk-goldleaf', 'Actual gold. Actually pointless. Actually magnificent.'),
];
export const SKIN_KEYS = SKINS.map(s => s.key);
export const SKIN_BY_KEY = Object.fromEntries(SKINS.map(s => [s.key, s]));
// 'none' is the default everyone starts with, so it is never a drop.
export const SKIN_POOL = SKINS.filter(s => s.key !== 'none');
export const skinFx = (key) => (SKIN_BY_KEY[key] || SKIN_BY_KEY.none).fx;

// Chance the NEXT attempt succeeds. `luck` is in percentage points (the
// Fortune stat), so 6% Fortune is +0.06 on the roll. `fails` is how many times
// in a row this item has already failed. The cap only ever limits what Fortune
// and pity add — it must never drag a guaranteed early level below 100%.
export function successChance(item, luck = 0, fails = 0) {
  if (atCeiling(item)) return 0;
  const base = BASE_ODDS[item.level + 1];
  const pity = Math.min(PITY_MAX, Math.max(0, fails | 0) * PITY_STEP);
  const bonus = Math.max(0, luck) / 100 + pity;
  return Math.min(Math.max(ODDS_CAP, base), base + bonus);
}
export function winkChance(item, luck = 0) {
  if (item.wink) return 0;
  return Math.min(0.5, WINK_BASE + Math.max(0, luck) / 200);
}
/* ------------------------------------------------------------------ stats */
// What one item contributes, as a map of stat key -> percent.
export function itemStats(item) {
  const out = {};
  if (!item || !SLOT_BY_KEY[item.slot]) return out;
  const lvl = Math.max(0, Math.min(MAX_LEVEL, item.level | 0));
  // Each evolution makes the main stat genuinely bigger, so evolving is an
  // upgrade in its own right and not just a socket unlock.
  const main = LEVEL_BONUS[lvl] * (item.wink ? WINK_MULT : 1) * stageMult(item);
  if (main > 0) out[SLOT_BY_KEY[item.slot].stat] = main;
  for (const s of item.subs || []) {
    if (!STATS[s.stat]) continue;
    out[s.stat] = (out[s.stat] || 0) + s.val;
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 100) / 100;
  return out;
}
// Everything the player has equipped, added up. This is the ONLY number the
// rest of the app should ever read.
export function totalStats(items) {
  const out = { coin: 0, xp: 0, luck: 0 };
  for (const it of items || []) {
    const s = itemStats(it);
    for (const k of STAT_KEYS) out[k] += s[k] || 0;
  }
  for (const k of STAT_KEYS) out[k] = Math.round(out[k] * 100) / 100;
  return out;
}
// Percent -> multiplier, clamped so a bad row in the DB can never mint a
// fortune. 30% is far above anything the ladder can actually reach.
export const STAT_CAP = 30;
export function multiplier(pct) {
  const p = Number.isFinite(pct) ? Math.max(0, Math.min(STAT_CAP, pct)) : 0;
  return 1 + p / 100;
}

/* ------------------------------------------------------------------- rolls */
// One swing of the hammer. Pure: hand it an item and it hands back the new one
// plus what the player should be told. Never mutates the input.
// Substats are NOT rolled here any more — the only way to socket one is a
// Bless Stone at the blacksmith. A Wink is NOT rolled here either: it can only
// happen when you evolve, so it is tied to the one milestone worth reaching.
export function forge(item, luck, rng, fails = 0, guaranteed = false) {
  if (atCeiling(item)) throw new Error('already at +' + MAX_LEVEL);
  const chance = guaranteed ? 1 : successChance(item, luck, fails);
  const ok = guaranteed || rng() < chance;
  const next = { ...item, subs: [...(item.subs || [])] };

  if (ok) {
    next.level = item.level + 1;
  } else if (item.level >= FAIL_DROP_FROM) {
    next.level = item.level - 1;
  }
  return { ok, guaranteed: !!guaranteed, wink: false, sub: null, item: next, from: item.level, to: next.level, chance, pity: Math.min(PITY_MAX, Math.max(0, fails | 0) * PITY_STEP) };
}

// Evolving is the ONLY way to open a substat socket, and it is only offered at
// +9. Level, element, skin and Wink all carry over.
//
// It is also the ONLY place a Wink can happen. Tying it to the one milestone
// worth reaching means a Wink is a moment, not background noise on a swing you
// were going to make anyway. Pass an rng to roll for one; without an rng this
// stays pure and simply carries the existing Wink over.
export function evolve(item, luck = 0, rng = null) {
  if (!canEvolve(item)) throw new Error('not ready to evolve');
  const target = nextStage(item);
  const next = { ...item, stage: target.key, subs: [...(item.subs || [])] };
  let wink = false, sub = null;
  if (rng) {
    // The stone this stage demands is spent here, and it immediately fills the
    // socket it just opened. That is the whole reason to save a Divine Stone.
    sub = rollSub(rng, target.stone);
    next.subs[target.slots - 1] = sub;
    if (!item.wink && rng() < winkChance(item, luck)) { next.wink = true; wink = true; }
  }
  next.wink = next.wink || false;
  return rng ? { item: next, wink, sub, stone: target.stone, stage: target } : next;
}

// Deterministic RNG for the self-check. Production uses node:crypto.
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
const RARITY_ORDER_F = ['common', 'rare', 'epic', 'legendary'];
if (IS_MAIN && process.argv.includes('--test')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };

  // --- the ladder ---
  assert(LEVEL_BONUS.length === MAX_LEVEL + 1 && FORGE_COST.length === MAX_LEVEL + 1 && BASE_ODDS.length === MAX_LEVEL + 1, 'tables line up');
  for (let l = 1; l <= MAX_LEVEL; l++) {
    assert(LEVEL_BONUS[l] > LEVEL_BONUS[l - 1], 'bonus rises at +' + l);
    assert(FORGE_COST[l] > FORGE_COST[l - 1], 'cost rises at +' + l);
    assert(BASE_ODDS[l] <= BASE_ODDS[l - 1], 'odds never improve at +' + l);
  }
  assert(LEVEL_BONUS[MAX_LEVEL] === 5.0, '+9 is worth exactly 5%');
  assert(Math.round(LEVEL_BONUS[MAX_LEVEL] * WINK_MULT * 10) / 10 === 6.0, 'a winked +9 is worth exactly 6%');
  assert(SLOTS.length === new Set(SLOTS.map(s => s.stat)).size, 'each slot owns a different stat');

  // --- items: per-slot catalogues, mostly FOUND, three per slot for sale ---
  assert(ELEMENTS.length >= 55, 'a real hoard of items, got ' + ELEMENTS.length);
  assert(new Set(ELEMENT_KEYS).size === ELEMENTS.length, 'item keys are globally unique');
  assert(new Set(ELEMENTS.map(e => e.name)).size === ELEMENTS.length, 'item names are unique');
  for (const sl of SLOTS) {
    const list = itemsForSlot(sl.key);
    assert(list.length >= 18, `${sl.key} has a real catalogue, got ${list.length}`);
    assert(list.filter(x => x.source === 'shop').length === 3, `${sl.key} sells exactly three`);
    assert(list.filter(x => x.source === 'pouch').length >= 15, `${sl.key} keeps 15+ behind the pouch`);
    for (const r of ['common', 'rare', 'epic', 'legendary']) {
      assert(list.some(x => x.rarity === r), `${sl.key} has a ${r}`);
    }
    assert(!list.some(x => x.source === 'shop' && x.rarity === 'legendary'), `no legendary ${sl.key} is for sale`);
  }
  // the three catalogues must not share a single name — that was the complaint
  const names = {};
  for (const sl of SLOTS) names[sl.key] = new Set(itemsForSlot(sl.key).map(x => x.name));
  for (let i = 0; i < SLOTS.length; i++) {
    for (let j = i + 1; j < SLOTS.length; j++) {
      const a = names[SLOTS[i].key], b = names[SLOTS[j].key];
      const shared = [...a].filter(n => b.has(n));
      assert(shared.length === 0, `${SLOTS[i].key} and ${SLOTS[j].key} share no names (${shared.join(',')})`);
    }
  }
  for (const e of ELEMENTS) {
    assert(/^[a-z0-9_]{2,20}$/.test(e.key), `${e.key} is a safe key`);
    assert(/^el-[a-z]+$/.test(e.fx), `${e.key} maps to a safe css class`);
    assert(e.note && e.icon && RARITY_ORDER_F.includes(e.rarity), `${e.key} is described and ranked`);
    assert(e.stats === undefined, `${e.key} carries no stats — items are looks only`);
    assert(e.source === 'shop' ? e.price > 0 : e.price === 0, `${e.key} is priced correctly for its source`);
    assert(GEAR_ITEMS[e.slot], `${e.key} belongs to a real slot`);
  }
  assert(fitsSlot('infinity', 'racket') && !fitsSlot('infinity', 'boots'), 'an item only fits its own slot');

  // --- sets ---
  assert(SETS.length === 5, 'five sets, got ' + SETS.length);
  for (const s of SETS) {
    const pieces = setPieces(s.key);
    assert(pieces.length === 3, `${s.key} is exactly three pieces, got ${pieces.length}`);
    assert(new Set(pieces.map(p => p.slot)).size === 3, `${s.key} spans all three slots`);
    assert(s.perk && s.note && s.icon, `${s.key} explains itself`);
    const two = Object.values(s.two).reduce((a, b) => a + b, 0);
    const three = Object.values(s.three).reduce((a, b) => a + b, 0);
    assert(three > two, `${s.key} three-piece beats two-piece`);
    for (const k of Object.keys({ ...s.two, ...s.three })) assert(STATS[k], `${s.key} bonus stat ${k} is real`);
  }
  assert(new Set(ELEMENTS.filter(e => e.set).map(e => e.key)).size === SETS.length * 3, 'no item belongs to two sets');
  for (const key of ['brainrot', 'what', 'honour', 'gamble', 'endline']) assert(SET_BY_KEY[key], `the ${key} set exists`);
  const six = setPieces('brainrot').map(p => p.name);
  assert(six.includes('The 67') && six.includes('Ohio Sliders') && six.includes('The Rizzler'), 'The 67 set is the meme set: ' + six.join(', '));

  const wear = (keys) => keys.map(k => ({ owned: true, element: k, slot: ELEMENT_BY_KEY[k].slot }));
  assert(setBonuses([]).power === 0 && setBonuses([]).perks.length === 0, 'wearing nothing is no set bonus');
  const one = setBonuses(wear(['sixseven']));
  assert(one.stats.coin === 0, 'one piece is not a set');
  const two2 = setBonuses(wear(['sixseven', 'ohiosliders']));
  assert(two2.stats.coin === 2 && two2.perks.length === 0, 'two pieces gives the small bonus, no perk');
  const three3 = setBonuses(wear(['sixseven', 'ohiosliders', 'therizzler']));
  assert(three3.stats.coin === 7, 'three pieces stacks 2pc + 3pc, got ' + three3.stats.coin);
  assert(three3.perks.includes('brainrot'), 'three pieces switches the perk on');
  assert(setBonuses(wear(['excaliburd', 'talaria', 'sacredbread'])).power === 60, 'the honour set grants Power');
  assert(setBonuses(wear(['eventhorizon', 'speedofsound', 'omegashuttle'])).power === 120, 'the end-of-the-line set grants more');
  // a corrupt row cannot stack the same slot twice
  const dupe = setBonuses([
    { owned: true, element: 'sixseven', slot: 'racket' },
    { owned: true, element: 'sixseven', slot: 'racket' },
    { owned: true, element: 'ohiosliders', slot: 'boots' },
  ]);
  assert(dupe.stats.coin === 2 && !dupe.perks.includes('brainrot'), 'the same slot twice is still two pieces');
  assert(setBonuses([{ owned: false, element: 'sixseven', slot: 'racket' }]).stats.coin === 0, 'unowned gear is not worn');
  assert(setBonuses([{ owned: true, element: 'made_up', slot: 'racket' }]).stats.coin === 0, 'a junk item joins no set');
  // set bonuses must not blow past the hard cap
  const allSets = setBonuses(wear(['eventhorizon', 'speedofsound', 'omegashuttle']));
  for (const k of STAT_KEYS) assert((allSets.stats[k] || 0) <= 10, `set bonus for ${k} stays modest`);
  assert(!fitsSlot('made_up', 'racket'), 'an unknown key fits nothing');

  // --- the bag ---
  assert(bagCapacity(0) === BAG_BASE, 'a new bag holds ' + BAG_BASE);
  assert(bagCapacity(BAG_LEVELS) === BAG_MAX, 'a fully upgraded bag holds ' + BAG_MAX);
  assert(bagCapacity(999) === BAG_MAX, 'a corrupt level cannot exceed the cap');
  assert(bagCapacity(-5) === BAG_BASE, 'a negative level falls back to the base');
  for (let l = 1; l <= BAG_LEVELS; l++) assert(bagCapacity(l) > bagCapacity(l - 1), 'each upgrade adds room at ' + l);
  assert(bagUpgradeCost(0) === 10000, 'the first upgrade is 10,000');
  for (let l = 1; l < BAG_LEVELS; l++) assert(bagUpgradeCost(l) > bagUpgradeCost(l - 1), 'each upgrade costs more at ' + l);
  assert(bagUpgradeCost(BAG_LEVELS) === 0, 'a maxed bag cannot be upgraded again');
  assert(bagFull(0, BAG_BASE) && !bagFull(0, BAG_BASE - 1), 'the bag reports full at capacity');
  assert(bagFull(BAG_LEVELS, BAG_MAX), 'even a maxed bag can fill up');
  assert(ELEMENTS.length > BAG_MAX, 'there are more items than any bag can hold — storage is a real choice');
  assert(elementFx('nonsense') === 'el-wood', 'an unknown item falls back safely');
  const a9 = { ...blankItem('racket', 'goosehand'), level: 9 };
  const b9 = { ...blankItem('racket', 'plank'), level: 9 };
  assert(itemStats(a9).coin === itemStats(b9).coin, 'a found legendary and a 300-coin plank hit identically');

  // --- evolution: ONLY at +9, and the reward is a socket ---
  const fresh = blankItem('racket', 'fire');
  assert(slotsFor(fresh) === 0 && !canBless(fresh), 'a base item has no sockets');
  assert(!canEvolve(fresh), 'cannot evolve at +0');
  for (let l = 0; l < MAX_LEVEL; l++) {
    assert(!canEvolve({ ...fresh, level: l }), 'cannot evolve at +' + l);
  }
  const maxed = { ...fresh, level: MAX_LEVEL };
  assert(canEvolve(maxed), 'CAN evolve at +9');
  let threw = false; try { evolve({ ...fresh, level: 8 }); } catch { threw = true; }
  assert(threw, 'evolving below +9 throws rather than quietly working');

  let item = { ...blankItem('racket', 'heaven'), level: MAX_LEVEL, wink: true };
  const seen = [];
  for (let i = 0; i < STAGES.length - 1; i++) {
    assert(canEvolve(item), 'still evolvable at stage ' + item.stage);
    const cost = evolveCost(item);
    item = evolve(item);
    seen.push([item.stage, slotsFor(item), cost]);
    assert(item.level === MAX_LEVEL, 'evolving keeps the level');
    assert(item.wink === true, 'evolving keeps the Wink');
    assert(item.element === 'heaven', 'evolving keeps the element');
  }
  assert(slotsFor(item) === MAX_SUBSTATS, 'three evolutions = three sockets, got ' + slotsFor(item));
  assert(!canEvolve(item) && !nextStage(item), 'transcendent is the end of the road');
  assert(seen.every(([, , c]) => c > 0), 'every evolution costs coins: ' + JSON.stringify(seen));
  for (let i = 1; i < STAGES.length; i++) {
    assert(STAGES[i].slots === STAGES[i - 1].slots + 1, 'each stage adds exactly one socket');
    assert(STAGES[i].price > STAGES[i - 1].price, 'each stage costs more');
  }

  // --- forging no longer hands out substats ---
  const rngA = mulberry32(4);
  let f = blankItem('racket', 'fire');
  for (let i = 0; i < 400; i++) {
    if (atCeiling(f)) break;
    const r = forge(f, 999, rngA);
    assert(r.sub === null, 'forging never sockets a substat');
    f = r.item;
  }
  assert(f.level === MAX_LEVEL && f.subs.length === 0, 'a +9 item still has zero substats without stones');

  // --- blessing is now a REROLL of a socket you already own ---
  let noSocket = false; try { bless(f, () => 0); } catch { noSocket = true; }
  assert(noSocket, 'cannot bless an item with no socket at all');
  let socketed = evolve(f);
  assert(freeSlots(socketed) === 1, 'evolving without an rng leaves the socket empty');
  const rngB = mulberry32(9);
  const res = bless(socketed, rngB);
  assert(res.item.subs.length === 1, 'blessing fills the socket');
  assert(STATS[res.sub.stat] && res.sub.val > 0, 'the socket holds a real stat');
  assert(GRADE_BY_KEY[res.sub.grade], 'the socket records its grade');
  assert(freeSlots(res.item) === 0, 'the socket is now taken');
  assert(socketed.subs.length === 0, 'bless never mutates the item it was given');
  assert(res.reroll === false, 'filling an empty socket is not a reroll');
  // rerolling REPLACES rather than stacking — this is the part that used to throw
  const again = bless(res.item, mulberry32(21), 'divine', 0);
  assert(again.item.subs.length === 1, 'rerolling replaces the line instead of adding one');
  assert(again.reroll === true && again.prev, 'a reroll knows what it overwrote');
  assert(again.item.subs[0].stone === 'divine', 'the reroll used the stone you actually spent');
  let badSlot = false; try { bless(res.item, () => 0, 'bless', 7); } catch { badSlot = true; }
  assert(badSlot, 'cannot bless a socket that does not exist');
  let badSlot2 = false; try { bless(res.item, () => 0, 'bless', -1); } catch { badSlot2 = true; }
  assert(badSlot2, 'a negative socket index is refused');

  // --- evolving spends a stone and fills the socket it opens ---
  const evoRng = mulberry32(55);
  let evo = { ...blankItem('shuttle', 'fire'), level: MAX_LEVEL };
  const stonesUsed = [];
  for (let i = 0; i < STAGES.length - 1; i++) {
    const want = evolveStone(evo);
    const r = evolve(evo, 0, evoRng);
    stonesUsed.push(r.stone);
    assert(r.stone === want, 'evolveStone tells the truth about what will be spent');
    assert(r.sub && GRADE_BY_KEY[r.sub.grade], 'evolving rolls the substat there and then');
    assert(r.sub.stone === want, 'the substat was rolled on the stone the stage demanded');
    assert(r.item.subs.length === i + 1, 'evolving leaves no empty socket');
    assert(freeSlots(r.item) === 0, 'the socket it opened is already filled');
    evo = r.item;
  }
  assert(stonesUsed.join(',') === 'bless,sacred,divine', 'stones climb bless -> sacred -> divine, got ' + stonesUsed.join(','));
  assert(evolveStone(evo) === null, 'a fully evolved item demands no more stones');
  assert(evolveStone(blankItem('racket')) === 'bless', 'the first evolution wants a Bless Stone');

  // --- the guarantee ---
  const hardItem = { ...blankItem('racket', 'fire'), level: 8 };
  assert(successChance(hardItem) < 1, 'the last level is genuinely uncertain');
  const g1 = forge(hardItem, 0, () => 0.999, 0, true);
  assert(g1.ok && g1.to === 9 && g1.chance === 1 && g1.guaranteed, 'a guaranteed swing cannot fail, even on the worst roll');
  const g2 = forge(hardItem, 0, () => 0.999, 0, false);
  assert(!g2.ok, 'without the guarantee that same roll fails');
  for (let i = 0; i < 200; i++) {
    const r = forge({ ...blankItem('racket'), level: 8 }, 0, mulberry32(i), 0, true);
    assert(r.ok && r.item.level === 9, 'the guarantee holds for every seed');
  }
  assert(STONE_BY_KEY[GUARANTEE_STONE], 'the guarantee is paid for with a real stone');

  // grade table + the three stones
  assert(GRADE_BY_KEY.super.mult === 1.5 && GRADE_BY_KEY.heavenly.mult === 2 && GRADE_BY_KEY.omni.mult === 3,
    'Super +50%, Heavenly +100%, Omniscient +200%');
  for (let i = 1; i < BLESS_GRADES.length; i++) assert(BLESS_GRADES[i].mult > BLESS_GRADES[i - 1].mult, 'each grade beats the last');
  for (const g of BLESS_GRADES) assert(g.fx === '' || /^bl-[a-z]+$/.test(g.fx), `${g.key} maps to a safe css class`);

  assert(STONES.length === 3, 'three stones, got ' + STONES.length);
  for (const s of STONES) {
    assert(/^[a-z]{2,12}$/.test(s.key) && s.icon && s.note, `${s.key} is a real stone`);
    const tot = GRADE_KEYS.reduce((a, k) => a + (s.odds[k] || 0), 0);
    assert(Math.abs(tot - 1) < 1e-9, `${s.key} odds sum to exactly 1, got ${tot}`);
    for (const k of GRADE_KEYS) assert(s.odds[k] >= 0, `${s.key}.${k} is not negative`);
  }
  // Sacred must carry exactly the rates the game shipped with
  assert(STONE_BY_KEY.sacred.odds.normal === 0.30 && STONE_BY_KEY.sacred.odds.super === 0.40
    && STONE_BY_KEY.sacred.odds.heavenly === 0.20 && STONE_BY_KEY.sacred.odds.omni === 0.10,
    'the Sacred Stone carries the original 30/40/20/10 rates');
  // and each stone must be a straight upgrade on the one below
  for (let i = 1; i < STONES.length; i++) {
    const a = STONES[i - 1].odds, b = STONES[i].odds;
    assert(b.omni > a.omni, `${STONES[i].key} beats ${STONES[i - 1].key} on Omniscient`);
    assert(b.heavenly > a.heavenly, `${STONES[i].key} beats ${STONES[i - 1].key} on Heavenly`);
    assert(b.normal < a.normal, `${STONES[i].key} rolls plain less often`);
    const ev = (o) => GRADE_KEYS.reduce((s, k) => s + o[k] * GRADE_BY_KEY[k].mult, 0);
    assert(ev(b) > ev(a), `${STONES[i].key} is worth more on average (${ev(a).toFixed(2)} -> ${ev(b).toFixed(2)})`);
  }
  let noStone = false; try { bless({ ...blankItem('racket'), stage: 'awakened' }, () => 0, 'made_up'); } catch { noStone = true; }
  assert(noStone, 'an unknown stone throws rather than silently defaulting');

  // measured grade distribution per stone — the headline odds must be real
  const target0 = { ...blankItem('racket', 'void'), level: 9, stage: 'transcendent' };
  for (const stone of STONES) {
    const tally = {}; const rngC = mulberry32(31); const N = 40000;
    for (let i = 0; i < N; i++) {
      const r = bless({ ...target0, subs: [] }, rngC, stone.key);
      tally[r.grade] = (tally[r.grade] || 0) + 1;
      assert(r.stone === stone.key, 'the socket records which stone made it');
      assert(r.sub.stone === stone.key, 'the stone is stamped on the line too');
    }
    for (const k of GRADE_KEYS) {
      const got = (tally[k] || 0) / N;
      assert(Math.abs(got - stone.odds[k]) < 0.012, `${stone.key}/${k} lands at ${(got * 100).toFixed(1)}% (want ${stone.odds[k] * 100}%)`);
    }
  }
  // and the multiplier really is applied to the rolled value
  const grades = new Set();
  const rngD = mulberry32(77);
  for (let i = 0; i < 4000; i++) {
    const r = bless({ ...target0, subs: [] }, rngD, 'divine');
    grades.add(r.sub.grade);
    const base = r.sub.val / gradeMult(r.sub.grade);
    assert(BLESS_ROLLS.some(v => Math.abs(v - base) < 1e-6), `${r.sub.grade} value ${r.sub.val} is a base roll x its multiplier`);
  }
  assert(grades.size === BLESS_GRADES.length, 'every grade is reachable');

  // --- what it is all worth ---
  assert(Object.values(itemStats(blankItem('racket'))).length === 0, 'a +0 item is worth nothing');
  const plain9 = { ...blankItem('racket', 'fire'), level: 9 };
  assert(itemStats(plain9).coin === 5.0, 'a +9 racket gives 5% coin find');
  assert(itemStats({ ...plain9, wink: true }).coin === 6.0, 'a winked +9 racket gives 6%');
  assert(itemStats({ ...plain9, slot: 'boots' }).xp === 5.0, 'shoes feed XP, not coins');
  assert(itemStats({ slot: 'nonsense', level: 9 }).coin === undefined, 'an unknown slot is worth nothing');
  assert(itemStats({ ...plain9, subs: [{ stat: 'evil', val: 999 }] }).evil === undefined, 'a junk substat is ignored');
  assert(itemStats({ ...plain9, level: 99 }).coin === 5.0, 'a corrupt level cannot exceed the table');
  assert(itemStats({ ...plain9, level: -5 }).coin === undefined, 'a negative level is worth nothing');

  // the best legal item: winked +9, transcendent, three omniscient max rolls
  const bestSub = Math.max(...BLESS_ROLLS) * GRADE_BY_KEY.omni.mult;
  const perfect = {
    ...blankItem('racket', 'celestial'), level: 9, wink: true, stage: 'transcendent',
    subs: Array.from({ length: MAX_SUBSTATS }, () => ({ stat: 'coin', val: bestSub, grade: 'omni' })),
  };
  const top = itemStats(perfect).coin;
  const perfectMain = Math.round(6 * STAGE_BY_KEY.transcendent.mult * 100) / 100;
  assert(top === Math.round((perfectMain + bestSub * MAX_SUBSTATS) * 100) / 100,
    'a perfect racket is main + three omni sockets, got ' + top);
  assert(top < STAT_CAP, 'even a perfect item stays under the hard stat cap (' + top + ' < ' + STAT_CAP + ')');
  const locker = totalStats(SLOTS.map(sl => ({ ...perfect, slot: sl.key })));
  for (const k of STAT_KEYS) assert(multiplier(locker[k]) <= 1 + STAT_CAP / 100, `a perfect locker's ${k} stays clamped`);

  // --- evolving is itself an upgrade, not just a socket unlock ---
  let prevMain = 0;
  for (const st of STAGES) {
    const m = itemStats({ ...plain9, stage: st.key }).coin;
    assert(m > prevMain, `${st.name} beats the stage below it (${m})`);
    prevMain = m;
  }
  assert(itemStats({ ...plain9, stage: 'transcendent' }).coin === Math.round(5 * 1.5 * 100) / 100, 'transcendent is 1.5x the base stat');
  assert(stageMult({ stage: 'nonsense' }) === 1 && stageAura({ stage: 'nonsense' }) === '', 'an unknown stage is treated as base');
  assert(STAGES.every(s => s.key === 'base' || s.aura), 'every evolved stage has an aura to draw');
  assert(STAGES.every(s => s.key === 'base' || STONE_BY_KEY[s.stone]), 'every evolution demands a real stone');
  assert(STAGES.map(s => s.stone).slice(1).join(',') === 'bless,sacred,divine', 'the stone ladder is bless -> sacred -> divine');

  // --- multipliers are clamped ---
  assert(multiplier(0) === 1 && multiplier(6) === 1.06, 'multipliers read correctly');
  assert(multiplier(1e9) === 1 + STAT_CAP / 100, 'an absurd stat is capped');
  assert(multiplier(-100) === 1 && multiplier(NaN) === 1, 'junk is treated as zero');

  // --- failure never destroys ---
  const lo = { ...blankItem('racket', 'fire'), level: 4 };
  assert(forge(lo, 0, () => 0.999).item.level === 4, 'failing below +6 costs only coins');
  const hi = { ...blankItem('racket', 'fire'), level: 6 };
  assert(forge(hi, 0, () => 0.999).item.level === 5, 'failing from +6 knocks one level off');
  assert(hi.level === 6, 'forge never mutates its input');
  let survive = blankItem('racket', 'void');
  const rngE = mulberry32(7);
  for (let i = 0; i < 4000; i++) {
    if (atCeiling(survive)) { survive = { ...survive, level: survive.level - 1 }; continue; }
    const r = forge(survive, 3, rngE);
    assert(r.item.level >= 0 && r.item.level <= MAX_LEVEL, 'level stays in range');
    survive = r.item;
  }

  // --- odds ---
  assert(successChance(blankItem('racket')) === 1, '+1 always works');
  const hard = { ...blankItem('racket', 'fire'), level: 8 };
  assert(successChance(hard) === BASE_ODDS[9], 'the last level is the base 25%');
  assert(successChance(hard, 6) > BASE_ODDS[9], 'fortune improves the odds');
  assert(successChance(hard, 999) === ODDS_CAP, 'fortune can never make it certain');
  assert(successChance(hard, -50) === BASE_ODDS[9], 'negative fortune cannot sabotage the roll');
  const winked = evolve({ ...blankItem('racket'), level: MAX_LEVEL }, 0, () => 0);
  assert(winked.wink === true && winked.item.wink === true, 'a wink can strike on an evolution');
  assert(winkChance(winked.item, 50) === 0, 'a wink strikes once, then never again');
  // --- a Wink is an EVOLUTION event and nothing else ---
  const rngW = mulberry32(31);
  let noWink = blankItem('racket', 'fire');
  for (let i = 0; i < 5000; i++) {
    if (atCeiling(noWink)) { noWink = { ...noWink, level: noWink.level - 1 }; continue; }
    const r = forge(noWink, 999, rngW);
    assert(r.wink === false && r.item.wink === false, 'forging can NEVER wink, however lucky you are');
    noWink = r.item;
  }
  // and it must actually be reachable across a full life of three evolutions
  let winks = 0;
  const rngW2 = mulberry32(77);
  for (let n = 0; n < 4000; n++) {
    let it = { ...blankItem('racket', 'fire'), level: MAX_LEVEL };
    for (let e = 0; e < STAGES.length - 1; e++) {
      const r = evolve(it, 0, rngW2);
      it = r.item;
    }
    if (it.wink) winks++;
  }
  const winkRate = winks / 4000;
  assert(winkRate > 0.2 && winkRate < 0.5, `a fully evolved item winks about a third of the time, measured ${(winkRate * 100).toFixed(1)}%`);
  assert(evolve({ ...blankItem('racket'), level: MAX_LEVEL }).wink === false, 'without an rng, evolve stays pure and cannot wink');

  // --- skins stay paint ---
  assert(SKINS.length >= 12 && SKIN_BY_KEY.none.fx === '', 'skins exist and the default draws nothing');
  for (const s of SKINS) assert(s.key === 'none' || /^sk-[a-z]+$/.test(s.fx), `${s.key} maps to a safe css class`);
  assert(itemStats({ ...plain9, skin: 'void' }).coin === LEVEL_BONUS[9], 'a skin does not change what an item is worth');

  // --- the economy, measured ---
  const runs = 3000; const rngF = mulberry32(99);
  let spend = 0, reached = 0;
  for (let r = 0; r < runs; r++) {
    let g = blankItem('racket', 'fire'), guard = 0;
    while (g.level < MAX_LEVEL && guard++ < 500) { spend += forgeCost(g); g = forge(g, 0, rngF).item; }
    if (g.level === MAX_LEVEL) reached++;
  }
  assert(reached === runs, 'every run eventually reaches +9 (no dead ends)');
  const avg = Math.round(spend / runs);
  assert(avg > FORGE_COST.reduce((a, b) => a + b, 0) && avg < 200000, 'failures cost more than the sticker price, got ' + avg);

  const stages = STAGES.slice(1).reduce((s, x) => s + x.price, 0);
  console.log(`forge.js self-check: PASS (${ELEMENTS.length} items across ${SLOTS.length} slots — ` +
    `${SHOP_ELEMENTS.length} for sale, ${POUCH_ELEMENTS.length} found only; ` +
    `${STAGES.length} stages -> ${MAX_SUBSTATS} sockets, ` +
    `stones ${STONES.map(s => s.key + ' ' + Math.round(s.odds.omni * 100) + '% omni').join(' / ')}, ` +
    `~${avg} coins to +9, ${stages} to fully evolve)`);
}
