import { pathToFileURL } from 'node:url';
import { randomInt } from 'node:crypto';
// lib/arcade.js — pure, seeded game engines for the coin arcade.
//
// Everything here is deterministic given a seed, and the SERVER owns the seed.
// The browser only ever renders an outcome it was handed; it can't roll its own
// dice, replay a good spin, or peek at the next card.
//
// House edge is deliberately gentle (~4-8%): coins are earned by playing
// badminton, so the arcade is a place to spend them, not a tax.

/* ---------------------------------------------------------------- rng */
// mulberry32 — small, fast, good enough for games, and reproducible so a bad
// payout can always be replayed from its seed during a dispute.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Seed from the CSPRNG, not Math.random. The seed fully determines every
// outcome of a spin/hand, so a predictable one is a predictable payout — V8's
// Math.random state is recoverable from a handful of observed outputs.
export const newSeed = () => randomInt(0, 4294967296) >>> 0;

/* -------------------------------------------------------------- slots */
// Weighted reel: rarer symbols sit at the top of the paytable. The numbers are
// calibrated (see the RTP assertion below) to ~93% return with a win roughly
// every other spin — frequent small wins, a genuine 106x jackpot on the goose.
export const SLOT_SYMBOLS = [
  { key: 'goose', icon: '🪿', weight: 1, three: 106, two: 12 },
  { key: 'trophy', icon: '🏆', weight: 2, three: 53, two: 8 },
  { key: 'shuttle', icon: '🏸', weight: 4, three: 21, two: 4 },
  { key: 'fire', icon: '🔥', weight: 6, three: 12, two: 2 },
  { key: 'star', icon: '⭐', weight: 8, three: 7, two: 1.5 },
  { key: 'leaf', icon: '🍀', weight: 10, three: 5, two: 1 },
  { key: 'ball', icon: '🥎', weight: 12, three: 4, two: 1 },
];
const SLOT_POOL = SLOT_SYMBOLS.flatMap(s => Array(s.weight).fill(s.key));
export const SLOT_BY_KEY = Object.fromEntries(SLOT_SYMBOLS.map(s => [s.key, s]));

export function spinSlots(bet, seed) {
  const rnd = mulberry32(seed);
  const reels = [0, 1, 2].map(() => SLOT_POOL[Math.floor(rnd() * SLOT_POOL.length)]);
  const [a, b, c] = reels;
  let payout = 0, line = 'no win';
  if (a === b && b === c) {
    payout = Math.round(bet * SLOT_BY_KEY[a].three);
    line = 'THREE ' + SLOT_BY_KEY[a].icon;
  } else {
    const pairKey = a === b ? a : (b === c ? b : (a === c ? a : null));
    if (pairKey && SLOT_BY_KEY[pairKey].two > 0) {
      payout = Math.round(bet * SLOT_BY_KEY[pairKey].two);
      line = 'PAIR ' + SLOT_BY_KEY[pairKey].icon;
    }
  }
  return { reels, icons: reels.map(k => SLOT_BY_KEY[k].icon), payout, net: payout - bet, line, seed };
}

/* ---------------------------------------------------------- blackjack */
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

export function freshDeck(seed) {
  const rnd = mulberry32(seed);
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  for (let i = deck.length - 1; i > 0; i--) {          // Fisher-Yates
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export const rankOf = (card) => card.slice(0, -1);

export function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    const r = rankOf(c);
    if (r === 'A') { aces++; total += 11; } else if (['K', 'Q', 'J', '10'].includes(r)) total += 10; else total += Number(r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }        // aces soften
  return { total, soft: aces > 0, blackjack: cards.length === 2 && total === 21, bust: total > 21 };
}

export function dealBlackjack(seed) {
  const deck = freshDeck(seed);
  return {
    deck, next: 4,
    player: [deck[0], deck[2]],
    dealer: [deck[1], deck[3]],
  };
}

// Dealer stands on all 17 (including soft 17) — the player-friendlier rule.
export function dealerPlay(state) {
  const dealer = [...state.dealer];
  let next = state.next;
  while (handValue(dealer).total < 17) { dealer.push(state.deck[next]); next++; }
  return { dealer, next };
}

export function settleBlackjack(playerCards, dealerCards, bet) {
  const p = handValue(playerCards);
  const d = handValue(dealerCards);
  if (p.bust) return { payout: 0, net: -bet, result: 'bust', detail: 'You went over 21' };
  if (p.blackjack && !d.blackjack) return { payout: Math.round(bet * 2.5), net: Math.round(bet * 1.5), result: 'blackjack', detail: 'Blackjack! 3:2' };
  if (d.bust) return { payout: bet * 2, net: bet, result: 'win', detail: 'Dealer bust' };
  if (p.total > d.total) return { payout: bet * 2, net: bet, result: 'win', detail: p.total + ' beats ' + d.total };
  if (p.total < d.total) return { payout: 0, net: -bet, result: 'lose', detail: d.total + ' beats ' + p.total };
  return { payout: bet, net: 0, result: 'push', detail: 'Push on ' + p.total };
}

/* --------------------------------------------------- video poker (JoB) */
export const POKER_PAYS = [
  { key: 'royal', name: 'Royal Flush', pay: 250 },
  { key: 'sf', name: 'Straight Flush', pay: 50 },
  { key: 'quads', name: 'Four of a Kind', pay: 25 },
  { key: 'boat', name: 'Full House', pay: 9 },
  { key: 'flush', name: 'Flush', pay: 6 },
  { key: 'straight', name: 'Straight', pay: 4 },
  { key: 'trips', name: 'Three of a Kind', pay: 3 },
  { key: 'twopair', name: 'Two Pair', pay: 2 },
  { key: 'jacks', name: 'Jacks or Better', pay: 1 },
];
const RANK_ORDER = { A: 14, K: 13, Q: 12, J: 11, 10: 10, 9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2 };

export function scorePoker(cards) {
  const vals = cards.map(c => RANK_ORDER[rankOf(c)]).sort((a, b) => a - b);
  const suits = cards.map(c => c.slice(-1));
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts).map(([v, n]) => ({ v: +v, n })).sort((a, b) => b.n - a.n || b.v - a.v);
  const flush = suits.every(s => s === suits[0]);
  const uniq = [...new Set(vals)];
  let straight = uniq.length === 5 && uniq[4] - uniq[0] === 4;
  // the wheel: A-2-3-4-5
  const wheel = uniq.length === 5 && uniq.join(',') === '2,3,4,5,14';
  if (wheel) straight = true;
  const high = wheel ? 5 : vals[4];

  if (straight && flush && high === 14) return POKER_PAYS[0];
  if (straight && flush) return POKER_PAYS[1];
  if (groups[0].n === 4) return POKER_PAYS[2];
  if (groups[0].n === 3 && groups[1] && groups[1].n === 2) return POKER_PAYS[3];
  if (flush) return POKER_PAYS[4];
  if (straight) return POKER_PAYS[5];
  if (groups[0].n === 3) return POKER_PAYS[6];
  if (groups[0].n === 2 && groups[1] && groups[1].n === 2) return POKER_PAYS[7];
  if (groups[0].n === 2 && groups[0].v >= 11) return POKER_PAYS[8];
  return null;
}

export function dealPoker(seed) {
  const deck = freshDeck(seed);
  return { deck, hand: deck.slice(0, 5), next: 5 };
}

export function drawPoker(state, holds) {
  const hand = [...state.hand];
  let next = state.next;
  for (let i = 0; i < 5; i++) if (!holds.includes(i)) { hand[i] = state.deck[next]; next++; }
  const win = scorePoker(hand);
  return { hand, next, win };
}

/* ----------------------------------------------------------- self-check */
const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (IS_MAIN && process.argv.includes('--test')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };

  // determinism — same seed, same everything
  assert(JSON.stringify(spinSlots(10, 42)) === JSON.stringify(spinSlots(10, 42)), 'slots are deterministic');
  assert(JSON.stringify(freshDeck(7)) === JSON.stringify(freshDeck(7)), 'deck is deterministic');
  assert(JSON.stringify(freshDeck(7)) !== JSON.stringify(freshDeck(8)), 'different seeds differ');
  const deck = freshDeck(3);
  assert(deck.length === 52 && new Set(deck).size === 52, 'deck is a real 52-card deck');

  // hand values
  assert(handValue(['A♠', 'K♦']).total === 21 && handValue(['A♠', 'K♦']).blackjack, 'A+K is blackjack');
  assert(handValue(['A♠', 'A♦', '9♣']).total === 21, 'two aces soften correctly');
  assert(handValue(['K♠', 'Q♦', '5♣']).bust, '25 busts');
  assert(handValue(['A♠', '6♦']).soft, 'A+6 is soft 17');

  // poker hands
  assert(scorePoker(['10♠', 'J♠', 'Q♠', 'K♠', 'A♠']).key === 'royal', 'royal flush');
  assert(scorePoker(['2♥', '3♥', '4♥', '5♥', '6♥']).key === 'sf', 'straight flush');
  assert(scorePoker(['A♥', '2♥', '3♥', '4♥', '5♥']).key === 'sf', 'the wheel is a straight flush');
  assert(scorePoker(['9♠', '9♦', '9♣', '9♥', '2♠']).key === 'quads', 'quads');
  assert(scorePoker(['9♠', '9♦', '9♣', '2♥', '2♠']).key === 'boat', 'full house');
  assert(scorePoker(['2♠', '5♠', '9♠', 'J♠', 'K♠']).key === 'flush', 'flush');
  assert(scorePoker(['5♠', '6♦', '7♣', '8♥', '9♠']).key === 'straight', 'straight');
  assert(scorePoker(['A♠', '2♦', '3♣', '4♥', '5♠']).key === 'straight', 'wheel straight');
  assert(scorePoker(['J♠', 'J♦', '4♣', '7♥', '9♠']).key === 'jacks', 'jacks or better pays');
  assert(scorePoker(['9♠', '9♦', '4♣', '7♥', '2♠']) === null, 'low pair pays nothing');
  assert(scorePoker(['K♠', 'Q♦', '4♣', '7♥', '2♠']) === null, 'junk pays nothing');

  // settlement
  assert(settleBlackjack(['K♠', 'Q♦', '5♣'], ['9♠', '8♦'], 10).net === -10, 'bust loses the bet');
  assert(settleBlackjack(['A♠', 'K♦'], ['9♠', '8♦'], 10).net === 15, 'blackjack pays 3:2');
  assert(settleBlackjack(['K♠', '9♦'], ['K♣', '9♥'], 10).net === 0, 'push returns the bet');
  assert(settleBlackjack(['K♠', '9♦'], ['K♣', '8♥'], 10).net === 10, 'higher total wins');
  assert(settleBlackjack(['K♠', '9♦'], ['K♣', 'Q♥', '5♠'], 10).net === 10, 'dealer bust wins');

  // dealer never stops under 17, never hits on 17+
  for (let s = 0; s < 300; s++) {
    const st = dealBlackjack(s);
    const { dealer } = dealerPlay(st);
    const v = handValue(dealer).total;
    assert(v >= 17 || handValue(dealer).bust, 'dealer drew to 17+ (seed ' + s + ')');
  }

  // RTP: the house must have an edge, but a small one. Anything that returns
  // >100% is a money printer; anything under ~85% feels like a scam.
  const BET = 10, N = 200000;
  let staked = 0, returned = 0;
  for (let i = 0; i < N; i++) { staked += BET; returned += spinSlots(BET, i).payout; }
  const slotRtp = returned / staked;
  assert(slotRtp > 0.88 && slotRtp < 1.0, 'slot RTP is sane, got ' + (slotRtp * 100).toFixed(1) + '%');

  let bjStake = 0, bjBack = 0;
  for (let s = 0; s < 20000; s++) {
    const st = dealBlackjack(s);
    // basic-strategy-ish: hit under 17
    let player = [...st.player], next = st.next;
    while (handValue(player).total < 17) { player.push(st.deck[next]); next++; }
    const d = dealerPlay({ ...st, next });
    bjStake += BET;
    bjBack += settleBlackjack(player, d.dealer, BET).payout;
  }
  const bjRtp = bjBack / bjStake;
  assert(bjRtp > 0.85 && bjRtp < 1.05, 'blackjack RTP is sane, got ' + (bjRtp * 100).toFixed(1) + '%');

  // holds are respected
  const pk = dealPoker(11);
  const drawn = drawPoker(pk, [0, 2]);
  assert(drawn.hand[0] === pk.hand[0] && drawn.hand[2] === pk.hand[2], 'held cards stay');
  assert(drawn.hand.length === 5 && new Set(drawn.hand).size === 5, 'no duplicate cards after the draw');

  console.log(`arcade.js self-check: PASS (slots RTP ${(slotRtp * 100).toFixed(1)}%, blackjack RTP ${(bjRtp * 100).toFixed(1)}%)`);
}
