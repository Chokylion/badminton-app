// lib/titles.js — the 40 deterministic titles. Pure functions over the model
// (lib/model.js) plus season Elo standings. Each title is a pure selector, so a
// title feels earned, not random. Rate-based titles have a minimum-sample gate.

import { buildModel, normalizeMatch, pairKey } from './model.js';

// tier: legendary | epic | rare | common ; group + scope per PRD §5.
export const TITLES = [
  // Prestige
  { key: 'goat',              name: 'The GOAT',            alias: null,                       group: 'prestige', tier: 'legendary', scope: 'Season',   roast: false },
  { key: 'smash_king',        name: 'Smash Monarch',       alias: 'High Gain',                group: 'prestige', tier: 'epic',      scope: 'Season',   roast: false },
  { key: 'consistent',        name: 'Mr./Ms. Consistent',  alias: 'Low Noise',                group: 'prestige', tier: 'rare',      scope: 'All-time', roast: false },
  { key: 'clutch',            name: 'Clutch',              alias: 'Deuce Closer',             group: 'prestige', tier: 'rare',      scope: 'All-time', roast: false },
  { key: 'comeback_kid',      name: 'Comeback Kid',        alias: 'Feedback Loop',            group: 'prestige', tier: 'rare',      scope: 'Season',   roast: false },
  { key: 'giant_slayer',      name: 'Giant Slayer',        alias: 'Overdrive',                group: 'prestige', tier: 'epic',      scope: 'Season',   roast: false },
  { key: 'iron_wall',         name: 'Iron Wall',           alias: 'Low Latency D',            group: 'prestige', tier: 'rare',      scope: 'Season',   roast: false },
  { key: 'streak_lord',       name: 'Streak Lord',         alias: 'Overclocked',              group: 'prestige', tier: 'epic',      scope: 'All-time', roast: false },
  { key: 'untouchable',       name: 'Untouchable',         alias: null,                       group: 'prestige', tier: 'legendary', scope: 'Season',   roast: false },
  { key: 'marathoner',        name: 'Marathoner',          alias: null,                       group: 'prestige', tier: 'rare',      scope: 'All-time', roast: false },
  // Duo
  { key: 'best_duo',          name: 'Best Duo',            alias: 'Perfect Signal',           group: 'duo',      tier: 'legendary', scope: 'Season',   roast: false },
  { key: 'ride_or_die',       name: 'Ride or Die',         alias: null,                       group: 'duo',      tier: 'epic',      scope: 'All-time', roast: false },
  { key: 'power_couple',      name: 'Power Couple',        alias: null,                       group: 'duo',      tier: 'rare',      scope: 'Season',   roast: false },
  { key: 'in_phase',          name: 'In Phase',            alias: null,                       group: 'duo',      tier: 'rare',      scope: 'Season',   roast: false },
  { key: 'chemistry_kings',   name: 'Chemistry Kings',     alias: 'Constructive Interference',group: 'duo',      tier: 'epic',      scope: 'All-time', roast: false },
  { key: 'two_body_problem',  name: 'Two-Body Problem',    alias: null,                       group: 'duo',      tier: 'common',    scope: 'All-time', roast: false },
  { key: 'oil_water',         name: 'Oil & Water',         alias: 'Out of Phase',             group: 'duo',      tier: 'common',    scope: 'Season',   roast: true  },
  // Individual impact
  { key: 'carry_certified',   name: 'Carry Certified',     alias: null,                       group: 'impact',   tier: 'epic',      scope: 'Season',   roast: false },
  { key: 'the_anchor',        name: 'The Anchor',          alias: 'Series Resistor',          group: 'impact',   tier: 'common',    scope: 'Season',   roast: true  },
  { key: 'kingmaker',         name: 'Kingmaker',           alias: null,                       group: 'impact',   tier: 'rare',      scope: 'All-time', roast: false },
  // Rivalry
  { key: 'the_rivalry',       name: 'The Rivalry',         alias: null,                       group: 'rivalry',  tier: 'epic',      scope: 'Season',   roast: false },
  { key: 'nemesis',           name: 'Your Nemesis',        alias: null,                       group: 'rivalry',  tier: 'epic',      scope: 'Personal', roast: false },
  { key: 'favorite_victim',   name: 'Favorite Victim',     alias: null,                       group: 'rivalry',  tier: 'rare',      scope: 'Personal', roast: false },
  { key: 'kryptonite',        name: 'Kryptonite',          alias: null,                       group: 'rivalry',  tier: 'epic',      scope: 'Personal', roast: false },
  { key: 'bogey_team',        name: 'Bogey Team',          alias: null,                       group: 'rivalry',  tier: 'rare',      scope: 'Personal', roast: false },
  { key: 'public_enemy',      name: 'Public Enemy',        alias: null,                       group: 'rivalry',  tier: 'rare',      scope: 'All-time', roast: false },
  // Roast (opt-in / self-view default)
  { key: 'cant_team_with',    name: "The One You Can't Team With", alias: 'Open Circuit',     group: 'roast',    tier: 'common',    scope: 'Season',   roast: true  },
  { key: 'heartbreak_kid',    name: 'Heartbreak Kid',      alias: null,                       group: 'roast',    tier: 'common',    scope: 'Season',   roast: true  },
  { key: 'choker',            name: 'The Choker',          alias: 'Thermal Runaway',          group: 'roast',    tier: 'common',    scope: 'Season',   roast: true  },
  { key: 'cold_streak',       name: 'Cold Streak',         alias: 'Power Down',               group: 'roast',    tier: 'common',    scope: 'Season',   roast: true  },
  { key: 'participation',     name: 'Participation Trophy',alias: null,                       group: 'roast',    tier: 'common',    scope: 'Season',   roast: true  },
  { key: 'free_points',       name: 'Free Points',         alias: null,                       group: 'roast',    tier: 'common',    scope: 'Season',   roast: true  },
  // Behavioral & activity
  { key: 'the_regular',       name: 'The Regular',         alias: null,                       group: 'activity', tier: 'common',    scope: 'Season',   roast: false },
  { key: 'the_grinder',       name: 'The Grinder',         alias: null,                       group: 'activity', tier: 'common',    scope: 'All-time', roast: false },
  { key: 'social_butterfly',  name: 'Social Butterfly',    alias: null,                       group: 'activity', tier: 'common',    scope: 'All-time', roast: false },
  { key: 'one_trick_pony',    name: 'One-Trick Pony',      alias: null,                       group: 'activity', tier: 'common',    scope: 'All-time', roast: false },
  { key: 'night_owl',         name: 'Night Owl / Early Bird', alias: null,                    group: 'activity', tier: 'common',    scope: 'Fun',      roast: false },
  { key: 'the_analyst',       name: 'The Analyst',         alias: null,                       group: 'activity', tier: 'common',    scope: 'Season',   roast: false },
  { key: 'rookie',            name: 'Rookie of the Month', alias: null,                       group: 'activity', tier: 'rare',      scope: 'Season',   roast: false },
  { key: 'deuce_magnet',      name: 'Deuce Magnet',        alias: null,                       group: 'activity', tier: 'common',    scope: 'All-time', roast: false },
];

/* ---- V2: +100 more titles, data-driven ---------------------------------- */
// helpers used by the generated computers
const _singles = p => p.matches - p.doublesMatches;
const _giant = (p, c) => c.extra.giantWins.get(p.id) || 0;
const _elo = (p, c) => c.standings.get(p.id)?.elo ?? 0;
const _oppMax = (p, sel) => { let m = 0; for (const o of p.opponents.values()) { const v = sel(o); if (v > m) m = v; } return m; };
const _runWin = seq => { let b = 0, k = 0; for (const s of seq) { if (s === 1) { k++; if (k > b) b = k; } else k = 0; } return b; };
const _pdpg = P => (P.games ? P.pointDiff / P.games : 0);

// MILESTONE titles: awarded to EVERY player who clears the threshold (multi-holder).
// scope defaults to 'All-time' (lifetime achievements you keep forever).
export const V2_MILESTONES = [
  // wins ladder
  { key: 'first_win',  name: 'First Blood',        tier: 'common',    get: p => p.wins, min: 1,   label: 'first win logged' },
  { key: 'win_10',     name: 'High Five',        tier: 'common',    get: p => p.wins, min: 5, label: '5 career wins' },
  { key: 'win_25',     name: 'Double Digits',    tier: 'rare',      get: p => p.wins, min: 10, label: '10 career wins' },
  { key: 'win_50',     name: 'Seasoned',           tier: 'epic',      get: p => p.wins, min: 20, label: '20 career wins' },
  { key: 'win_100',    name: 'Warlord',          tier: 'legendary', get: p => p.wins, min: 30, label: '30 career wins' },
  { key: 'win_200',    name: 'Dominator',     tier: 'legendary', get: p => p.wins, min: 45, label: '45 career wins' },
  { key: 'win_500',    name: 'Immortal',    tier: 'legendary', get: p => p.wins, min: 60, label: '60 career wins' },
  // matches played
  { key: 'play_10',    name: 'Getting Started',    tier: 'common',    get: p => p.matches, min: 5, label: '5 matches played' },
  { key: 'play_25',    name: 'Committed',          tier: 'common',    get: p => p.matches, min: 10, label: '10 matches played' },
  { key: 'play_50',    name: 'Veteran',            tier: 'rare',      get: p => p.matches, min: 20, label: '20 matches played' },
  { key: 'play_100',   name: 'Regular',         tier: 'epic',      get: p => p.matches, min: 35, label: '35 matches played' },
  { key: 'play_250',   name: 'Iron Goose',         tier: 'legendary', get: p => p.matches, min: 50, label: '50 matches played' },
  { key: 'play_500',   name: 'Eternal Goose',      tier: 'legendary', get: p => p.matches, min: 70, label: '70 matches played' },
  // games contested
  { key: 'games_50',   name: 'Game On',        tier: 'common',    get: p => p.gamesCount, min: 25, label: '25 games' },
  { key: 'games_150',  name: 'Court Fixture',      tier: 'rare',      get: p => p.gamesCount, min: 60, label: '60 games' },
  { key: 'games_350',  name: 'Court Marshal',      tier: 'epic',      get: p => p.gamesCount, min: 110, label: '110 games' },
  { key: 'games_700',  name: 'Court Immortal',     tier: 'legendary', get: p => p.gamesCount, min: 180, label: '180 games' },
  // doubles wins
  { key: 'duo10',      name: 'Tag Team',           tier: 'common',    get: p => p.doublesWins, min: 3, label: '3 doubles wins' },
  { key: 'duo25',      name: 'Sync Master',        tier: 'rare',      get: p => p.doublesWins, min: 8, label: '8 doubles wins' },
  { key: 'duo50',      name: 'Doubles Deity',      tier: 'epic',      get: p => p.doublesWins, min: 18, label: '18 doubles wins' },
  { key: 'duo100',     name: 'Doubles Immortal',   tier: 'legendary', get: p => p.doublesWins, min: 30, label: '30 doubles wins' },
  // comebacks
  { key: 'cb1',        name: 'Never Say Die',      tier: 'common',    get: p => p.comebackWins, min: 1,  label: 'first comeback win' },
  { key: 'cb3',        name: 'Reversal Artist',    tier: 'rare',      get: p => p.comebackWins, min: 1, label: '1 comeback wins' },
  { key: 'cb5',        name: 'Comeback Machine',   tier: 'epic',      get: p => p.comebackWins, min: 3, label: '3 comeback wins' },
  { key: 'cb10',       name: 'Phoenix',            tier: 'legendary', get: p => p.comebackWins, min: 5, label: '5 comeback wins' },
  // marathons (3-game wins)
  { key: 'mar1',       name: 'Went the Distance',  tier: 'common',    get: p => p.threeGameWins, min: 1,  label: 'won a 3-gamer' },
  { key: 'mar5',       name: 'Distance Runner',    tier: 'rare',      get: p => p.threeGameWins, min: 3, label: '3 three-game wins' },
  { key: 'mar10',      name: 'Endurance Icon',     tier: 'epic',      get: p => p.threeGameWins, min: 6, label: '6 three-game wins' },
  { key: 'mar20',      name: 'Marathon Legend',    tier: 'legendary', get: p => p.threeGameWins, min: 12, label: '12 three-game wins' },
  // deuce battles
  { key: 'deuce5',     name: 'Nerve of Steel',     tier: 'common',    get: p => p.deuceGamesInvolved, min: 3, label: '3 deuce games' },
  { key: 'deuce20',    name: 'Deuce Dweller',      tier: 'rare',      get: p => p.deuceGamesInvolved, min: 8, label: '8 deuce games' },
  { key: 'deuce40',    name: 'Overtime Addict',    tier: 'epic',      get: p => p.deuceGamesInvolved, min: 16, label: '16 deuce games' },
  { key: 'deuce75',    name: 'Deuce Deity',        tier: 'legendary', get: p => p.deuceGamesInvolved, min: 28, label: '28 deuce games' },
  // partners
  { key: 'part3',      name: 'Team Player',        tier: 'common',    get: p => p.distinctPartners, min: 2, label: '2 partners' },
  { key: 'part6',      name: 'Connector',          tier: 'rare',      get: p => p.distinctPartners, min: 4, label: '4 partners' },
  { key: 'part10',     name: 'Networker',          tier: 'epic',      get: p => p.distinctPartners, min: 6, label: '6 partners' },
  { key: 'part15',     name: 'Social Hub',         tier: 'legendary', get: p => p.distinctPartners, min: 9, label: '9 partners' },
  // win streaks
  { key: 'str3',       name: 'On a Roll',          tier: 'common',    get: p => p.longestWin, min: 3,  label: '3-win streak' },
  { key: 'str5',       name: 'Heater',             tier: 'rare',      get: p => p.longestWin, min: 5,  label: '5-win streak' },
  { key: 'str8',       name: 'Unstoppable',        tier: 'epic',      get: p => p.longestWin, min: 8,  label: '8-win streak' },
  { key: 'str12',      name: 'Juggernaut',         tier: 'legendary', get: p => p.longestWin, min: 12, label: '12-win streak' },
  // time of day
  { key: 'night5',     name: 'After Hours',        tier: 'common', scope: 'Fun', get: p => p.nightMatches, min: 3, label: '3 late-night games' },
  { key: 'night15',    name: 'Nocturnal',          tier: 'rare',   scope: 'Fun', get: p => p.nightMatches, min: 7, label: '7 late-night games' },
  { key: 'night30',    name: 'Vampire',            tier: 'epic',   scope: 'Fun', get: p => p.nightMatches, min: 14, label: '14 late-night games' },
  { key: 'morn5',      name: 'Dawn Patrol',        tier: 'common', scope: 'Fun', get: p => p.morningMatches, min: 3, label: '3 dawn games' },
  { key: 'morn15',     name: 'Sunrise Smasher',    tier: 'rare',   scope: 'Fun', get: p => p.morningMatches, min: 8, label: '8 dawn games' },
  // points scored
  { key: 'pts500',     name: 'Point Collector',           tier: 'common',    get: p => p.pointsFor, min: 250, label: '250 points scored' },
  { key: 'pts1500',    name: 'Point Machine',      tier: 'rare',      get: p => p.pointsFor, min: 700, label: '700 points scored' },
  { key: 'pts3000',    name: 'Point Titan',        tier: 'epic',      get: p => p.pointsFor, min: 1500, label: '1,500 points scored' },
  { key: 'pts6000',    name: 'Point Overlord',     tier: 'legendary', get: p => p.pointsFor, min: 2800, label: '2,800 points scored' },
  // scorekeeping
  { key: 'log10',      name: 'Scorekeeper',        tier: 'common',    get: p => p.logged, min: 5, label: '5 matches logged' },
  { key: 'log30',      name: 'Chief Scribe',       tier: 'rare',      get: p => p.logged, min: 15, label: '15 matches logged' },
  { key: 'log75',      name: 'Historian',          tier: 'epic',      get: p => p.logged, min: 35, label: '35 matches logged' },
  // clutch (deciders won)
  { key: 'clutch3',    name: 'Ice in the Veins',   tier: 'rare',      get: p => p.game3Wins, min: 2, label: '2 deciders won' },
  { key: 'clutch10',   name: 'Mr./Ms. Clutch',     tier: 'epic',      get: p => p.game3Wins, min: 5, label: '5 deciders won' },
  { key: 'clutch20',   name: 'Clutch Deity',       tier: 'legendary', get: p => p.game3Wins, min: 10, label: '10 deciders won' },
  // upsets
  { key: 'giant1',     name: 'David',              tier: 'common',    get: (p, c) => _giant(p, c), min: 1,  label: 'beat a higher seed' },
  { key: 'giant5',     name: 'Giant Toppler',      tier: 'rare',      get: (p, c) => _giant(p, c), min: 2, label: '2 upset wins' },
  { key: 'giant10',    name: 'Titan Hunter',       tier: 'epic',      get: (p, c) => _giant(p, c), min: 5, label: '5 upset wins' },
  { key: 'giant20',    name: 'Giant Slayer Prime', tier: 'legendary', get: (p, c) => _giant(p, c), min: 10, label: '10 upset wins' },
  // winrate (min 10 games)
  { key: 'wr60',       name: 'Sharp',              tier: 'rare',      get: p => p.matches >= 10 ? p.winrate : 0, min: 0.6,  label: '60%+ winrate (10+)' },
  { key: 'wr75',       name: 'Elite',              tier: 'epic',      get: p => p.matches >= 10 ? p.winrate : 0, min: 0.75, label: '75%+ winrate (10+)' },
  { key: 'wr90',       name: 'Nearly Flawless',    tier: 'legendary', get: p => p.matches >= 10 ? p.winrate : 0, min: 0.9,  label: '90%+ winrate (10+)' },
  // Elo tiers
  { key: 'elo1500',    name: 'Above the Curve',    tier: 'common',    get: (p, c) => _elo(p, c), min: 1500, label: 'rating 1500+' },
  { key: 'elo1600',    name: 'Rising Star',        tier: 'rare',      get: (p, c) => _elo(p, c), min: 1600, label: 'rating 1600+' },
  { key: 'elo1700',    name: 'Master Class',       tier: 'epic',      get: (p, c) => _elo(p, c), min: 1700, label: 'rating 1700+' },
  // format regularity
  { key: 'dm10',       name: 'Doubles Regular',    tier: 'common',    get: p => p.doublesMatches, min: 5, label: '5 doubles matches' },
  { key: 'dm25',       name: 'Doubles Devotee',    tier: 'rare',      get: p => p.doublesMatches, min: 12, label: '12 doubles matches' },
  { key: 'solo5',      name: 'Lone Wolf',          tier: 'common',    get: p => _singles(p), min: 3, label: '3 singles matches' },
  { key: 'solo20',     name: 'Singles Specialist', tier: 'rare',      get: p => _singles(p), min: 12, label: '12 singles matches' },
  // combo conditions
  { key: 'wellrounded',  name: 'Well-Rounded',     tier: 'rare',  get: p => (p.doublesMatches >= 5 && _singles(p) >= 5) ? 1 : 0, min: 1, label: 'plays both formats' },
  { key: 'ironman',      name: 'Iron Man',         tier: 'epic',  get: p => (p.matches >= 20 && p.winrate >= 0.5) ? 1 : 0, min: 1, label: '20+ matches, 50%+ WR' },
  { key: 'iceandfire',   name: 'Ice & Fire',       tier: 'rare',  get: p => (p.comebackWins >= 1 && p.game3Wins >= 1) ? 1 : 0, min: 1, label: 'comeback + clutch' },
  { key: 'franchise',    name: 'Franchise Player', tier: 'rare',  get: p => (p.matches >= 20 && p.logged >= 10) ? 1 : 0, min: 1, label: 'plays and keeps score' },
  { key: 'doubledouble', name: 'Double-Double',    tier: 'rare',  get: p => (p.wins >= 10 && p.doublesWins >= 10) ? 1 : 0, min: 1, label: '10 wins & 10 duo wins' },
  { key: 'nightandday',  name: 'Night & Day',      tier: 'rare',  scope: 'Fun', get: p => (p.nightMatches >= 3 && p.morningMatches >= 3) ? 1 : 0, min: 1, label: 'dawn and dusk grinder' },
  { key: 'predator',     name: 'Apex Predator',    tier: 'epic',  get: (p, c) => (_giant(p, c) >= 3 && p.longestWin >= 3) ? 1 : 0, min: 1, label: 'upsets on a streak' },
  { key: 'intheblack',   name: 'In the Black',     tier: 'rare',  get: p => (p.matches >= 10 && p.wins > p.losses) ? 1 : 0, min: 1, label: 'winning career record' },
  // roast milestones (opt-in visibility)
  { key: 'loss10',     name: 'Practice Dummy',        tier: 'common', roast: true, get: p => p.losses, min: 5, label: '5 losses' },
  { key: 'loss25',     name: 'Free-Points Dispenser', tier: 'common', roast: true, get: p => p.losses, min: 12, label: '12 losses' },
  { key: 'hb3',        name: 'Heartbreak Lite',       tier: 'common', roast: true, get: p => p.closeLosses, min: 3, label: '3 losses by ≤2' },
  { key: 'hb8',        name: 'Deuce-Cursed',          tier: 'rare',   roast: true, get: p => p.closeLosses, min: 8, label: '8 losses by ≤2' },
  { key: 'skid3',      name: 'Rough Patch',           tier: 'common', roast: true, get: p => p.longestLoss, min: 3, label: '3-loss skid' },
  { key: 'skid6',      name: 'Freefall',              tier: 'rare',   roast: true, get: p => p.longestLoss, min: 6, label: '6-loss skid' },
];

// LEADER titles: single holder (or holding duo), the max of a stat behind a gate.
export const V2_LEADERS = [
  // player leaders
  { key: 'offense_engine', name: 'Offense Engine',   alias: 'High Output',  tier: 'epic',      scope: 'All-time', pick: 'max', gate: p => p.matches >= 6,  score: p => p.pointsFor,   value: p => p.pointsFor + ' pts scored' },
  { key: 'blowout_artist', name: 'Blowout Artist',   alias: null,           tier: 'epic',      scope: 'Season',   pick: 'max', gate: p => p.gamesCount >= 6, score: p => (p.pointsFor - p.pointsAgainst) / p.gamesCount, value: p => '+' + ((p.pointsFor - p.pointsAgainst) / p.gamesCount).toFixed(1) + ' pts/game' },
  { key: 'sharpshooter',   name: 'Sharpshooter',     alias: 'Precision',    tier: 'legendary', scope: 'All-time', pick: 'max', gate: p => p.matches >= 25, score: p => p.winrate, value: p => Math.round(p.winrate * 100) + '% over ' + p.matches },
  { key: 'survivor',       name: 'The Survivor',     alias: null,           tier: 'rare',      scope: 'All-time', pick: 'max', gate: p => p.game3Played >= 3, score: p => p.game3Played, value: p => p.game3Played + ' deciders played' },
  { key: 'rally_machine',  name: 'Rally Machine',    alias: null,           tier: 'rare',      scope: 'All-time', pick: 'max', gate: p => p.matches >= 6, score: p => p.pointsPlayed, value: p => p.pointsPlayed + ' points contested' },
  { key: 'on_fire',        name: 'On Fire',          alias: 'Live Streak',  tier: 'rare',      scope: 'Season',   pick: 'max', gate: p => p.currentStreak >= 2, score: p => p.currentStreak, value: p => p.currentStreak + '-win active streak' },
  { key: 'early_bird',     name: 'Early Bird',       alias: null,           tier: 'common',    scope: 'Fun',      pick: 'max', gate: p => p.morningMatches >= 2, score: p => p.morningMatches, value: p => p.morningMatches + ' dawn games 🌅' },
  { key: 'tormentor',      name: 'The Tormentor',    alias: null,           tier: 'epic',      scope: 'All-time', pick: 'max', gate: p => _oppMax(p, o => o.wins) >= 3, score: p => _oppMax(p, o => o.wins), value: p => 'owns one rival ' + _oppMax(p, o => o.wins) + '×' },
  // player roasts
  { key: 'most_dominated', name: 'Human Highlight Reel', alias: null,       tier: 'rare',      scope: 'Season',   pick: 'max', roast: true, gate: p => p.gamesCount >= 6 && (p.pointsAgainst - p.pointsFor) / p.gamesCount > 0, score: p => (p.pointsAgainst - p.pointsFor) / p.gamesCount, value: p => '-' + ((p.pointsAgainst - p.pointsFor) / p.gamesCount).toFixed(1) + ' pts/game' },
  { key: 'the_sieve',      name: 'The Sieve',        alias: 'Leaky D',      tier: 'common',    scope: 'Season',   pick: 'max', roast: true, gate: p => p.gamesCount >= 6, score: p => p.concededPerGame, value: p => p.concededPerGame.toFixed(1) + ' conceded/game' },
  { key: 'the_wildcard',   name: 'The Wildcard',     alias: null,           tier: 'common',    scope: 'All-time', pick: 'max', roast: true, gate: p => p.matches >= 10, score: p => p.variance, value: () => 'most unpredictable' },
  { key: 'whipping_boy',   name: 'Whipping Boy',     alias: null,           tier: 'common',    scope: 'All-time', pick: 'max', roast: true, gate: p => _oppMax(p, o => o.losses) >= 3, score: p => _oppMax(p, o => o.losses), value: p => 'lost ' + _oppMax(p, o => o.losses) + '× to one foe' },
  // partnership leaders
  { key: 'dream_team',     name: 'Dream Team',       alias: null,           tier: 'legendary', scope: 'Season',   domain: 'partnership', pick: 'max', gate: P => P.games >= 6, score: P => P.wins, value: P => P.wins + ' wins together' },
  { key: 'the_glue',       name: 'Locked In',        alias: null,           tier: 'epic',      scope: 'All-time', domain: 'partnership', pick: 'max', gate: P => P.games >= 6 && _runWin(P.seq) >= 3, score: P => _runWin(P.seq), value: P => _runWin(P.seq) + '-win duo run' },
  { key: 'demolition',     name: 'Demolition Duo',   alias: null,           tier: 'epic',      scope: 'Season',   domain: 'partnership', pick: 'max', gate: P => P.games >= 5, score: P => _pdpg(P), value: P => '+' + _pdpg(P).toFixed(1) + ' pts/game' },
  { key: 'cursed_duo',     name: 'Cursed Duo',       alias: null,           tier: 'common',    scope: 'Season',   domain: 'partnership', pick: 'max', roast: true, gate: P => P.games >= 6, score: P => P.losses, value: P => P.losses + ' losses together' },
];

// ---------------------------------------------------------------------------
// V3 — 46 more titles (deep-cut milestones, roasts, and superlatives).
// ---------------------------------------------------------------------------
export const V3_MILESTONES = [
  { key: 'pts_500',   name: 'Point Farmer',        tier: 'common',    get: p => p.pointsFor, min: 250, label: '250 points scored' },
  { key: 'pts_1500',  name: 'Point Baron',         tier: 'rare',      get: p => p.pointsFor, min: 700, label: '700 points scored' },
  { key: 'pts_3000',  name: 'Point Tycoon',        tier: 'epic',      get: p => p.pointsFor, min: 1500, label: '1,500 points scored' },
  { key: 'pts_6000',  name: 'Point Emperor',       tier: 'legendary', get: p => p.pointsFor, min: 2800, label: '2,800 points scored' },
  // rallies contested
  { key: 'rally_2000', name: 'Rally Veteran',      tier: 'rare',      get: p => p.pointsPlayed, min: 900, label: '900 rallies played' },
  { key: 'rally_5000', name: 'Rally Legend',       tier: 'epic',      get: p => p.pointsPlayed, min: 2000, label: '2,000 rallies played' },
  // losses (roast)
  { key: 'loss_25',   name: 'Punching Bag',        tier: 'common',    roast: true, get: p => p.losses, min: 8, label: '8 career losses' },
  { key: 'loss_75',   name: 'Participation Legend',tier: 'rare',      roast: true, get: p => p.losses, min: 20, label: '20 career losses' },
  { key: 'loss_150',  name: 'Eternal Underdog',    tier: 'epic',      roast: true, get: p => p.losses, min: 40, label: '40 career losses' },
  // longest win streak
  { key: 'ws_5',      name: 'Hot Hand',            tier: 'common',    get: p => p.longestWin, min: 5,  label: '5-win streak' },
  { key: 'ws_8',      name: 'Blaze',               tier: 'rare',      get: p => p.longestWin, min: 8,  label: '8-win streak' },
  { key: 'ws_12',     name: 'Inferno',             tier: 'epic',      get: p => p.longestWin, min: 12, label: '12-win streak' },
  { key: 'ws_20',     name: 'Force of Nature',     tier: 'legendary', get: p => p.longestWin, min: 20, label: '20-win streak' },
  // longest loss streak (roast)
  { key: 'ls_5',      name: 'Cold Streak',         tier: 'common',    roast: true, get: p => p.longestLoss, min: 5,  label: '5-loss streak' },
  { key: 'ls_10',     name: 'Deep Freeze',         tier: 'rare',      roast: true, get: p => p.longestLoss, min: 10, label: '10-loss streak' },
  // night owl
  { key: 'night_5',   name: 'Night Owl',           tier: 'common',    get: p => p.nightMatches, min: 3, label: '3 late-night matches' },
  { key: 'night_15',  name: 'Moonlighter',         tier: 'rare',      get: p => p.nightMatches, min: 7, label: '7 late-night matches' },
  { key: 'night_30',  name: 'Creature of the Night',tier: 'epic',     get: p => p.nightMatches, min: 14, label: '14 late-night matches' },
  // early bird
  { key: 'morn_5',    name: 'Early Riser',         tier: 'common',    get: p => p.morningMatches, min: 3, label: '3 morning matches' },
  { key: 'morn_15',   name: 'Morning Regular',     tier: 'rare',      get: p => p.morningMatches, min: 8, label: '8 morning matches' },
  // close losses (roast)
  { key: 'cl_5',      name: 'So Close',            tier: 'common',    roast: true, get: p => p.closeLosses, min: 3, label: '3 nail-biter losses' },
  { key: 'cl_12',     name: 'Heartbreak Kid',      tier: 'rare',      roast: true, get: p => p.closeLosses, min: 8, label: '8 nail-biter losses' },
  // decider wins
  { key: 'g3_3',      name: 'Third-Set Specialist',tier: 'rare',      get: p => p.game3Wins, min: 3,  label: 'won 3 deciders' },
  { key: 'g3_10',     name: 'Mr. Clutch',          tier: 'epic',      get: p => p.game3Wins, min: 10, label: 'won 10 deciders' },
  // doubles played
  { key: 'dm_25',     name: 'Pairs Player',     tier: 'common',    get: p => p.doublesMatches, min: 12, label: '12 doubles matches' },
  { key: 'dm_75',     name: 'Doubles Fixture',     tier: 'rare',      get: p => p.doublesMatches, min: 30, label: '30 doubles matches' },
  { key: 'dm_150',    name: 'Doubles Lifer',       tier: 'epic',      get: p => p.doublesMatches, min: 60, label: '60 doubles matches' },
  // singles played
  { key: 'sm_10',     name: 'Solo Grinder',        tier: 'common',    get: _singles, min: 6, label: '6 singles matches' },
  { key: 'sm_30',     name: 'Solo Artist',         tier: 'rare',      get: _singles, min: 20, label: '20 singles matches' },
  { key: 'sm_60',     name: 'One-Man Army',        tier: 'epic',      get: _singles, min: 32, label: '32 singles matches' },
  // partner games
  { key: 'tpg_50',    name: 'Team Spirit',         tier: 'common',    get: p => p.totalPartnerGames, min: 20, label: '20 games with partners' },
  { key: 'tpg_150',   name: 'Brotherhood',         tier: 'rare',      get: p => p.totalPartnerGames, min: 55, label: '55 games with partners' },
  // comebacks
  { key: 'cb_15',     name: 'Escape Artist',       tier: 'epic',      get: p => p.comebackWins, min: 8, label: '8 comeback wins' },
  { key: 'cb_25',     name: 'Houdini',             tier: 'legendary', get: p => p.comebackWins, min: 12, label: '12 comeback wins' },
  // grand milestones
  { key: 'win_300',   name: 'Overlord',      tier: 'legendary', get: p => p.wins, min: 52, label: '52 career wins' },
  { key: 'games_1000',name: 'Court God',           tier: 'legendary', get: p => p.gamesCount, min: 260, label: '260 games played' },
  { key: 'deuce_120', name: 'Overtime Overlord',   tier: 'legendary', get: p => p.deuceGamesInvolved, min: 45, label: '45 deuce games' },
  { key: 'play_1000', name: 'Century Goose',    tier: 'legendary', get: p => p.matches, min: 100, label: '100 matches played' },
  { key: 'duo_200',   name: 'Doubles God',         tier: 'legendary', get: p => p.doublesWins, min: 45, label: '45 doubles wins' },
  { key: 'partners_20',name: 'People Person',      tier: 'epic',      get: p => p.distinctPartners, min: 12, label: '12 different partners' },
];
export const V3_LEADERS = [
  { key: 'night_king',    name: 'Night King',    alias: null, tier: 'epic',      scope: 'All-time', domain: 'player', pick: 'max', gate: p => p.nightMatches >= 3, score: p => p.nightMatches, value: p => p.nightMatches + ' night games 🌙' },
  { key: 'iron_will',     name: 'Iron Will',     alias: null, tier: 'epic',      scope: 'All-time', domain: 'player', pick: 'max', gate: p => p.matches >= 6,      score: p => p.longestWin, value: p => p.longestWin + '-win peak streak' },
  { key: 'the_workhorse', name: 'The Workhorse', alias: null, tier: 'rare',      scope: 'Season',   domain: 'player', pick: 'max', gate: p => p.matches >= 10,     score: p => p.matches, value: p => p.matches + ' matches — most active' },
  { key: 'the_closer',    name: 'The Closer',    alias: null, tier: 'epic',      scope: 'All-time', domain: 'player', pick: 'max', gate: p => p.game3Wins >= 2,    score: p => p.game3Wins, value: p => 'won ' + p.game3Wins + ' deciders' },
  { key: 'comeback_king', name: 'Comeback King', alias: null, tier: 'legendary', scope: 'All-time', domain: 'player', pick: 'max', gate: p => p.comebackWins >= 2, score: p => p.comebackWins, value: p => p.comebackWins + ' comeback wins 👑' },
  { key: 'the_wall',      name: 'The Wall',      alias: null, tier: 'legendary', scope: 'Season',   domain: 'player', pick: 'max', gate: p => p.gamesCount >= 6,   score: p => -p.concededPerGame, value: p => p.concededPerGame.toFixed(1) + ' conceded/game' },
];
// All milestone-style achievements (progress-trackable) for the achievements page.
export const ALL_MILESTONES = [...V2_MILESTONES, ...V3_MILESTONES];

// Register V2 + V3 metadata into TITLES before the key index is built.
for (const m of [...V2_MILESTONES, ...V3_MILESTONES])
  TITLES.push({ key: m.key, name: m.name, alias: m.alias || null, group: 'milestone', tier: m.tier, scope: m.scope || 'All-time', roast: !!m.roast });
for (const l of [...V2_LEADERS, ...V3_LEADERS])
  TITLES.push({ key: l.key, name: l.name, alias: l.alias || null, group: l.domain === 'partnership' ? 'duo' : (l.roast ? 'roast' : 'leader'), tier: l.tier, scope: l.scope, roast: !!l.roast });

export const TITLES_BY_KEY = Object.fromEntries(TITLES.map(t => [t.key, t]));

// gates
const G = { smash: 15, consistent: 10, clutch3: 3, ironGames: 6, untouchable: 8,
  bestDuo: 10, oilWater: 6, chem: 6, twoBody: 6, carry: 8, rivalry: 4, kryptonite: 3,
  cantTeam: 6, choker3: 3, participation: 5, oneTrick: 6, rookie: 5, nemesis: 2 };

const pct = (w, g) => (g ? Math.round((100 * w) / g) : 0);
const trailingWins = (seq) => { let n = 0; for (let i = seq.length - 1; i >= 0 && seq[i] === 1; i--) n++; return n; };

function pickMax(list, score, filter) {
  let best = null, bs = -Infinity;
  for (const it of list) { if (filter && !filter(it)) continue; const s = score(it); if (s > bs) { bs = s; best = it; } }
  return best == null ? null : { item: best, score: bs };
}
function pickMin(list, score, filter) { return pickMax(list, (it) => -score(it), filter); }

// Registry of computers. ctx = { model, standings, players, partnerships, extra, seasonStart }
const COMPUTERS = {
  // ---- Prestige ----
  goat: (c) => {
    const r = pickMax(c.players, p => (c.standings.get(p.id)?.elo ?? 0), p => (c.standings.get(p.id)?.games ?? 0) > 0);
    return r && { holders: [r.item.id], value: '★ ' + Math.round(r.score) };
  },
  smash_king: (c) => {
    const r = pickMax(c.players, p => p.winrate, p => p.matches >= G.smash);
    return r && { holders: [r.item.id], value: pct(r.item.wins, r.item.matches) + '% WR · ' + r.item.matches };
  },
  consistent: (c) => {
    const r = pickMin(c.players, p => p.variance, p => p.matches >= G.consistent);
    return r && { holders: [r.item.id], value: 'lowest variance · ' + r.item.matches + ' games' };
  },
  clutch: (c) => {
    const r = pickMax(c.players, p => p.game3Winrate + p.game3Wins / 1000, p => p.game3Played >= G.clutch3);
    return r && { holders: [r.item.id], value: r.item.game3Wins + '/' + r.item.game3Played + ' deciders' };
  },
  comeback_kid: (c) => {
    const r = pickMax(c.players, p => p.comebackWins, p => p.comebackWins > 0);
    return r && { holders: [r.item.id], value: r.item.comebackWins + ' comebacks' };
  },
  giant_slayer: (c) => {
    const r = pickMax(c.players, p => c.extra.giantWins.get(p.id) || 0, p => (c.extra.giantWins.get(p.id) || 0) > 0);
    return r && { holders: [r.item.id], value: r.score + ' upsets' };
  },
  iron_wall: (c) => {
    const r = pickMin(c.players, p => p.concededPerGame, p => p.gamesCount >= G.ironGames);
    return r && { holders: [r.item.id], value: r.item.concededPerGame.toFixed(1) + ' conceded/game' };
  },
  streak_lord: (c) => {
    const r = pickMax(c.players, p => p.longestWin, p => p.longestWin >= 2);
    return r && { holders: [r.item.id], value: r.item.longestWin + '-win streak' };
  },
  untouchable: (c) => {
    const r = pickMax(c.players, p => p.matches, p => p.matches >= G.untouchable && p.winrate === 1);
    return r && { holders: [r.item.id], value: 'perfect ' + r.item.wins + '-0' };
  },
  marathoner: (c) => {
    const r = pickMax(c.players, p => p.threeGameWins, p => p.threeGameWins > 0);
    return r && { holders: [r.item.id], value: r.item.threeGameWins + ' marathons won' };
  },
  // ---- Duo ----
  best_duo: (c) => {
    const r = pickMax(c.partnerships, P => P.wins / P.games + P.games / 100000, P => P.games >= G.bestDuo);
    return r && { holders: r.item.ids, value: pct(r.item.wins, r.item.games) + '% · ' + r.item.games + ' games' };
  },
  ride_or_die: (c) => {
    const r = pickMax(c.partnerships, P => P.games);
    return r && { holders: r.item.ids, value: r.item.games + ' games together' };
  },
  power_couple: (c) => {
    const r = pickMax(c.partnerships, P => P.pointDiff, P => P.games >= 4);
    return r && { holders: r.item.ids, value: (r.score >= 0 ? '+' : '') + r.score + ' point diff' };
  },
  in_phase: (c) => {
    const r = pickMax(c.partnerships, P => trailingWins(P.seq), P => trailingWins(P.seq) >= 2);
    return r && { holders: r.item.ids, value: trailingWins(r.item.seq) + '-win duo streak' };
  },
  chemistry_kings: (c) => {
    const r = pickMax(c.partnerships, P => chemLift(c, P), P => P.games >= G.chem);
    return r && { holders: r.item.ids, value: '+' + Math.round(chemLift(c, r.item) * 100) + '% together' };
  },
  two_body_problem: (c) => {
    const r = pickMax(c.partnerships, P => P.games, P => P.games >= G.twoBody && P.wins / P.games < 0.5);
    return r && { holders: r.item.ids, value: pct(r.item.wins, r.item.games) + '% over ' + r.item.games + ' games' };
  },
  oil_water: (c) => {
    const r = pickMin(c.partnerships, P => P.wins / P.games, P => P.games >= G.oilWater);
    return r && { holders: r.item.ids, value: pct(r.item.wins, r.item.games) + '% together' };
  },
  // ---- Impact ----
  carry_certified: (c) => {
    const r = pickMax(c.players, p => carryScore(c, p).avg, p => carryScore(c, p).games >= G.carry && carryScore(c, p).avg > 0);
    return r && { holders: [r.item.id], value: '+' + Math.round(carryScore(c, r.item).avg * 100) + '% partner lift' };
  },
  the_anchor: (c) => {
    const r = pickMin(c.players, p => carryScore(c, p).avg, p => carryScore(c, p).games >= G.carry && carryScore(c, p).avg < 0);
    return r && { holders: [r.item.id], value: Math.round(carryScore(c, r.item).avg * 100) + '% partner lift' };
  },
  kingmaker: (c) => {
    const r = pickMax(c.players, p => carryScore(c, p).total, p => carryScore(c, p).games >= G.carry && carryScore(c, p).total > 0);
    return r && { holders: [r.item.id], value: '+' + carryScore(c, r.item).total.toFixed(1) + ' wins created' };
  },
  // ---- Rivalry ----
  the_rivalry: (c) => {
    let best = null, bs = -Infinity;
    for (const rv of c.model.rivalries.values()) {
      if (rv.meetings < G.rivalry) continue;
      const sp = splitOf(c.model, rv.ids[0], rv.ids[1]);
      if (!sp) continue;
      const bal = 1 - Math.abs(sp.wins - sp.losses) / rv.meetings; // 1 = perfectly even
      if (bal < 0.5) continue;
      const s = rv.meetings + bal;
      if (s > bs) { bs = s; best = { ids: rv.ids, meetings: rv.meetings, sp }; }
    }
    return best && { holders: best.ids, value: best.sp.wins + '–' + best.sp.losses + ' · ' + best.meetings + ' games' };
  },
  public_enemy: (c) => {
    let best = null, bm = -1;
    for (const rv of c.model.rivalries.values()) if (rv.meetings > bm) { bm = rv.meetings; best = rv; }
    return best && bm >= 3 && { holders: best.ids, value: bm + ' meetings' };
  },
  // ---- Roast ----
  cant_team_with: (c) => {
    const r = pickMin(c.players, p => p.doublesWinrate, p => p.doublesMatches >= G.cantTeam);
    return r && { holders: [r.item.id], value: pct(r.item.doublesWins, r.item.doublesMatches) + '% as a partner' };
  },
  heartbreak_kid: (c) => {
    const r = pickMax(c.players, p => p.closeLosses, p => p.closeLosses > 0);
    return r && { holders: [r.item.id], value: r.item.closeLosses + ' losses by ≤2' };
  },
  choker: (c) => {
    const r = pickMin(c.players, p => p.game3Winrate, p => p.game3Played >= G.choker3);
    return r && { holders: [r.item.id], value: r.item.game3Wins + '/' + r.item.game3Played + ' deciders won' };
  },
  cold_streak: (c) => {
    const r = pickMin(c.players, p => p.currentStreak, p => p.currentStreak <= -2);
    return r && { holders: [r.item.id], value: Math.abs(r.item.currentStreak) + '-loss streak' };
  },
  participation: (c) => {
    const r = pickMax(c.players, p => p.matches * (1 - p.winrate), p => p.matches >= G.participation && p.winrate < 0.5);
    return r && { holders: [r.item.id], value: r.item.matches + ' played · ' + pct(r.item.wins, r.item.matches) + '%' };
  },
  free_points: (c) => {
    const r = pickMax(c.players, p => p.losses, p => p.losses > 0);
    return r && { holders: [r.item.id], value: r.item.losses + ' losses' };
  },
  // ---- Activity ----
  the_regular: (c) => {
    const r = pickMax(c.players, p => p.matches, p => p.matches > 0);
    return r && { holders: [r.item.id], value: r.item.matches + ' matches' };
  },
  the_grinder: (c) => {
    const r = pickMax(c.players, p => p.gamesCount + p.pointsPlayed / 1e6, p => p.gamesCount > 0);
    return r && { holders: [r.item.id], value: r.item.gamesCount + ' games played' };
  },
  social_butterfly: (c) => {
    const r = pickMax(c.players, p => p.distinctPartners, p => p.distinctPartners > 0);
    return r && { holders: [r.item.id], value: r.item.distinctPartners + ' partners' };
  },
  one_trick_pony: (c) => {
    const r = pickMax(c.players, p => p.partnerConcentration, p => p.totalPartnerGames >= G.oneTrick);
    return r && { holders: [r.item.id], value: Math.round(r.item.partnerConcentration * 100) + '% one partner' };
  },
  night_owl: (c) => {
    const r = pickMax(c.players, p => p.nightMatches + p.morningMatches, p => (p.nightMatches + p.morningMatches) > 0);
    if (!r) return null;
    const owl = r.item.nightMatches >= r.item.morningMatches;
    return { holders: [r.item.id], value: owl ? (r.item.nightMatches + ' night games 🦉') : (r.item.morningMatches + ' dawn games 🌅'), meta: { kind: owl ? 'owl' : 'bird' } };
  },
  the_analyst: (c) => {
    const r = pickMax(c.players, p => p.logged, p => p.logged > 0);
    return r && { holders: [r.item.id], value: r.item.logged + ' matches logged' };
  },
  rookie: (c) => {
    const start = c.seasonStart ? new Date(c.seasonStart) : null;
    const elig = c.players.filter(p => p.matches >= G.rookie && (!start || (p.firstMatchAt && p.firstMatchAt >= start)));
    const r = pickMax(elig, p => p.winrate);
    return r && { holders: [r.item.id], value: pct(r.item.wins, r.item.matches) + '% in ' + r.item.matches + ' games' };
  },
  deuce_magnet: (c) => {
    const r = pickMax(c.players, p => p.deuceGamesInvolved, p => p.deuceGamesInvolved > 0);
    return r && { holders: [r.item.id], value: r.item.deuceGamesInvolved + ' deuce games' };
  },
};

// Generate computers for the V2 + V3 milestone/leader titles from their data tables.
for (const m of [...V2_MILESTONES, ...V3_MILESTONES]) {
  COMPUTERS[m.key] = (c) => {
    const holders = c.players.filter(p => m.get(p, c) >= m.min).map(p => p.id);
    return holders.length ? { holders, value: m.label } : null;
  };
}
for (const l of [...V2_LEADERS, ...V3_LEADERS]) {
  COMPUTERS[l.key] = (c) => {
    const list = l.domain === 'partnership' ? c.partnerships : c.players;
    const r = pickMax(list, it => l.score(it, c), it => l.gate(it, c));
    if (!r) return null;
    const holders = l.domain === 'partnership' ? r.item.ids : [r.item.id];
    return { holders, value: l.value(r.item, c) };
  };
}

function splitOf(model, a, b) {
  const p = model.players.get(a); if (!p) return null;
  const o = p.opponents.get(b); if (!o) return null;
  return { wins: o.wins, losses: o.losses }; // a's record vs b
}
function chemLift(c, P) {
  const [a, b] = P.ids;
  const pa = c.model.players.get(a), pb = c.model.players.get(b);
  if (!pa || !pb) return -1;
  const solo = (pa.winrate + pb.winrate) / 2;
  return (P.wins / P.games) - solo;
}
// carry: how much better a player's partners do WITH them vs without them.
function carryScore(c, x) {
  let wsum = 0, gsum = 0, total = 0;
  for (const [pid, pr] of x.partners) {
    const T = c.model.players.get(pid); if (!T) continue;
    const withG = pr.games, withW = pr.wins;
    const woG = T.matches - withG, woW = T.wins - withW;
    if (withG < 2 || woG < 1) continue;
    const lift = (withW / withG) - (woW / woG);
    wsum += lift * withG; gsum += withG; total += lift * withG;
  }
  return { avg: gsum ? wsum / gsum : 0, total, games: gsum };
}

export function buildExtra(model, standings) {
  const giantWins = new Map();
  const shutouts = new Map();
  for (const m of model.matches) {
    if (m.winner == null) continue;
    for (const g of m.games || []) {
      if (g.a === 0 || g.b === 0) {
        const side = g.a > g.b ? m.teamA : m.teamB;
        for (const id of side) shutouts.set(id, (shutouts.get(id) || 0) + 1);
      }
    }
  }
  for (const m of model.matches) {
    if (m.winner == null) continue;
    const eloOf = (id) => standings.get(id)?.elo ?? 1500;
    const avg = (ids) => ids.length ? ids.reduce((s, i) => s + eloOf(i), 0) / ids.length : 1500;
    const aAvg = avg(m.teamA), bAvg = avg(m.teamB);
    const winTeam = m.winner === 'A' ? m.teamA : m.teamB;
    const winAvg = m.winner === 'A' ? aAvg : bAvg;
    const loseAvg = m.winner === 'A' ? bAvg : aAvg;
    if (loseAvg > winAvg) for (const id of winTeam) giantWins.set(id, (giantWins.get(id) || 0) + 1);
  }
  return { giantWins, shutouts };
}

// Compute the singleton (global/season/fun) titles for a given scope set.
export function computeTitles(model, standings, { scopes, seasonStart } = {}) {
  const players = [...model.players.values()].filter(p => p.matches > 0);
  const partnerships = [...model.partnerships.values()];
  const extra = buildExtra(model, standings);
  const ctx = { model, standings, players, partnerships, extra, seasonStart };
  const want = new Set(scopes || ['Season', 'All-time', 'Fun']);
  const out = [];
  for (const meta of TITLES) {
    if (!want.has(meta.scope)) continue;
    const fn = COMPUTERS[meta.key];
    if (!fn) continue;
    const res = fn(ctx);
    if (res && res.holders && res.holders.length) {
      out.push({ title_key: meta.key, holder_ids: res.holders, value: res.value || null, meta: res.meta || null });
    }
  }
  return out;
}

// Milestone progress for one player (drives the achievements screen). Every
// milestone in ALL_MILESTONES is evaluated with the full ctx (some read
// standings/upset-wins), preserving source order. Rate thresholds (min < 1,
// e.g. winrate) are kept fractional; count thresholds are floored to ints.
export function milestoneProgress(model, standings, userId) {
  const player = model.players.get(userId) || null;
  const extra = buildExtra(model, standings);
  const ctx = {
    model, standings,
    players: [...model.players.values()].filter(p => p.matches > 0),
    partnerships: [...model.partnerships.values()],
    extra,
  };
  return ALL_MILESTONES.map(m => {
    let raw = 0;
    if (player) { try { raw = Number(m.get(player, ctx)); } catch { raw = 0; } }
    const val = Number.isFinite(raw) ? raw : 0;
    const isRate = !Number.isInteger(m.min);
    const current = isRate ? Math.round(val * 100) / 100 : Math.floor(val);
    const pct = m.min > 0 ? Math.max(0, Math.min(100, Math.round(val / m.min * 100))) : 100;
    return {
      key: m.key, name: m.name, tier: m.tier, label: m.label, roast: !!m.roast,
      current, min: m.min, pct, unlocked: val >= m.min,
    };
  });
}

// ---------------------------------------------------------------------------
// MYTHIC — 7 secret, single-holder achievements. Only ONE player can hold each
// at a time (highest score wins it), and the unlock condition stays hidden from
// everyone except the holder. `hint` is the public tease, `reveal` is the truth.
// ---------------------------------------------------------------------------
export const MYTHICS = [
  {
    key: 'myth_egg', name: 'Golden Goose Egg', icon: '🥚', min: 1,
    hint: 'Somebody, somewhere, scored nothing at all.',
    reveal: 'Win a game 21–0. Most shutouts keeps the egg.',
    score: (p, c) => c.extra.shutouts.get(p.id) || 0,
  },
  {
    key: 'myth_untouchable', name: 'The Untouchable', icon: '👑', min: 5,
    hint: 'A run nobody could end.',
    reveal: 'Hold the longest win streak ever recorded (5+).',
    score: (p) => p.longestWin || 0,
  },
  {
    key: 'myth_kingslayer', name: 'Kingslayer', icon: '🗡️', min: 3,
    hint: 'The bigger they are…',
    reveal: 'Beat higher-rated opposition more than anyone (3+ giant kills).',
    score: (p, c) => c.extra.giantWins.get(p.id) || 0,
  },
  {
    key: 'myth_midnight', name: 'Midnight Sovereign', icon: '🌑', min: 3,
    hint: 'Earned while the rest of the club was asleep.',
    reveal: 'Play the most matches after 22:00 Bangkok time (3+).',
    score: (p) => p.nightMatches || 0,
  },
  {
    key: 'myth_phoenix', name: 'Phoenix Ascendant', icon: '🔥', min: 2,
    hint: 'Death, then something worse for your opponent.',
    reveal: 'Win the most matches after losing the first game (2+ comebacks).',
    score: (p) => p.comebackWins || 0,
  },
  {
    key: 'myth_iron', name: 'Iron Goose', icon: '⚙️', min: 20,
    hint: 'Simply refused to go home.',
    reveal: 'Play more matches than anyone else in the club (20+).',
    score: (p) => p.matches || 0,
  },
  {
    key: 'myth_symbiosis', name: 'Perfect Symbiosis', icon: '💎', min: 70,
    hint: 'Two people, one brain.',
    reveal: 'Best win-rate with one partner over 6+ games together.',
    score: (p) => {
      let best = 0;
      for (const pr of p.partners.values()) {
        if (pr.games >= 6) best = Math.max(best, Math.round((pr.wins / pr.games) * 100));
      }
      return best;
    },
  },
  // --- the welcome mat -----------------------------------------------------
  // Deliberately the one Mythic anybody can hold on day one: play a single
  // match and it is yours until the next new face turns up. Costs nothing to
  // win, stings just enough to lose, and gives a brand-new player a reason to
  // come back and chase a permanent one.
  {
    key: 'myth_fresh', name: 'Fresh Feather', icon: '🐣', min: 1,
    hint: 'The newest wings in the flock.',
    reveal: 'Held by whoever played their first match most recently. Play one match and it is yours — until somebody newer arrives.',
    score: (p) => (p.firstMatchAt ? new Date(p.firstMatchAt).getTime() : 0),
  },
  {
    key: 'myth_founder', name: 'Founding Goose', icon: '🪺', min: 1,
    hint: 'Was here before there was anything to be here for.',
    reveal: 'Member #1 — the very first person to join Gooseminton. Can never change hands.',
    score: (p, c) => (c.memberNo.get(p.id) === 1 ? 1 : 0),
  },
  {
    key: 'myth_deuce', name: 'Deuce Demon', icon: '😈', min: 3,
    hint: 'Never once made it simple.',
    reveal: 'Play the most games that reached 20–20 (3+).',
    score: (p) => p.deuceGamesInvolved || 0,
  },
  {
    key: 'myth_wall', name: 'The Wall', icon: '🧱', min: 1,
    hint: 'Points went in. Nothing came out.',
    reveal: 'Concede the fewest points per game across 6+ games.',
    // stored as (21 − conceded/game) × 100 so that stingier defence ranks higher
    score: (p) => (p.gamesCount >= 6 ? Math.round((21 - p.pointsAgainst / p.gamesCount) * 100) : 0),
  },
  {
    key: 'myth_weaver', name: 'Web Weaver', icon: '🕸️', min: 4,
    hint: 'Has played with absolutely everyone.',
    reveal: 'Partner with the most different players (4+).',
    score: (p) => p.distinctPartners || 0,
  },
  {
    key: 'myth_clutch', name: 'Clutch Sovereign', icon: '⏱️', min: 2,
    hint: 'Third game. No nerves.',
    reveal: 'Win the most deciding third games (2+).',
    score: (p) => p.game3Wins || 0,
  },
];

// Join order across the whole club: member #1 is whoever signed up first.
// Everyone gets a number, and it never changes — it is the one stat you cannot
// train for. Returns Map(userId -> 1-based join number).
export function memberNumbers(model) {
  return new Map([...model.players.values()]
    .sort((a, b) => {
      const at = a.created_at ? new Date(a.created_at).getTime() : Infinity;
      const bt = b.created_at ? new Date(b.created_at).getTime() : Infinity;
      return at - bt || (a.id < b.id ? -1 : 1);
    })
    .map((p, i) => [p.id, i + 1]));
}

// Resolve the single holder of each mythic. Deterministic: highest score, then
// more matches played, then id — so the same data always yields the same holder.
export function mythicAwards(model, standings) {
  const extra = buildExtra(model, standings);
  const players = [...model.players.values()].filter(p => p.matches > 0);
  const ctx = { extra, standings, model, memberNo: memberNumbers(model) };
  const pool = players.length || 1;
  return MYTHICS.map(m => {
    const ranked = players
      .map(p => ({ p, s: Number(m.score(p, ctx)) || 0 }))
      .filter(x => x.s >= m.min)
      .sort((a, b) => (b.s - a.s) || (b.p.matches - a.p.matches) || (a.p.id < b.p.id ? -1 : 1));
    const top = ranked[0] || null;
    return {
      key: m.key, name: m.name, icon: m.icon, min: m.min,
      hint: m.hint, reveal: m.reveal,
      holderId: top ? top.p.id : null,
      holder: top ? top.p.nickname : null,
      score: top ? top.s : 0,
      // a Mythic has at most one holder, so rarity is simply 1-in-the-club
      rarity: top ? 1 / pool : 0,
      holders: top ? 1 : 0,
      pool,
    };
  });
}

// How many players hold each milestone → the "12.4% of players have this" chip.
// O(players x milestones) on already-loaded data; no extra queries.
export function milestoneRarity(model, standings) {
  const players = [...model.players.values()].filter(p => p.matches > 0);
  const pool = players.length || 1;
  const counts = new Map();
  for (const p of players) {
    for (const m of milestoneProgress(model, standings, p.id)) {
      if (m.unlocked) counts.set(m.key, (counts.get(m.key) || 0) + 1);
    }
  }
  const out = new Map();
  for (const [k, n] of counts) out.set(k, { holders: n, pool, rarity: n / pool });
  return out;
}

// Personal titles for one viewer, computed from the all-time model.
export function personalTitles(model, userId) {
  const p = model.players.get(userId);
  if (!p) return [];
  const out = [];
  // nemesis: opponent who beats you most (your losses to them)
  let nem = null, nemL = 0;
  for (const [oid, o] of p.opponents) if (o.games >= G.nemesis && o.losses > nemL) { nemL = o.losses; nem = { oid, o }; }
  if (nem) out.push({ title_key: 'nemesis', holder_ids: [nem.oid], value: 'you ' + nem.o.wins + '–' + nem.o.losses });
  // favorite victim: opponent you beat most
  let fav = null, favW = 0;
  for (const [oid, o] of p.opponents) if (o.games >= G.nemesis && o.wins > favW) { favW = o.wins; fav = { oid, o }; }
  if (fav) out.push({ title_key: 'favorite_victim', holder_ids: [fav.oid], value: 'you ' + fav.o.wins + '–' + fav.o.losses });
  // kryptonite: highest winrate against you (min meetings)
  let kry = null, kryR = -1;
  for (const [oid, o] of p.opponents) { if (o.games < G.kryptonite) continue; const r = o.losses / o.games; if (r > kryR) { kryR = r; kry = { oid, o }; } }
  if (kry && kryR > 0.5) out.push({ title_key: 'kryptonite', holder_ids: [kry.oid], value: Math.round(kryR * 100) + '% vs you' });
  // bogey team: opposing duo you lose to most
  let bog = null, bogL = 0;
  for (const bd of model.oppDuos.values()) if (bd.player === userId && bd.losses > bogL) { bogL = bd.losses; bog = bd; }
  if (bog && bogL >= 2) out.push({ title_key: 'bogey_team', holder_ids: bog.duo, value: bogL + ' losses to them' });
  return out;
}

// ---- self-check ----
function demo() {
  const assert = (c, m) => { if (!c) throw new Error('titles demo failed: ' + m); };
  const U = ['ken', 'nok', 'bank', 'mai', 'jo'].map(id => ({ id, nickname: id, avatar_emoji: '🦅', avatar_color: '#F97316', created_at: '2026-07-01' }));
  const mk = (id, a, b, games, when, by) => ({
    id, played_at: when, format: a.length === 2 ? 'doubles' : 'singles', logged_by: by || a[0],
    players: [...a.map(u => ({ user_id: u, team: 'A' })), ...b.map(u => ({ user_id: u, team: 'B' }))],
    games: games.map((g, i) => ({ game_no: i + 1, score_a: g[0], score_b: g[1] })),
  });
  const raw = [];
  // ken+nok dominate bank+mai (12 games together, mostly wins) -> Best Duo / Ride or Die
  for (let i = 0; i < 12; i++) raw.push(mk('d' + i, ['ken', 'nok'], ['bank', 'mai'], i < 10 ? [[21, 15], [21, 17]] : [[15, 21], [17, 21]], '2026-07-' + (String(10 + i).padStart(2, '0')) + 'T20:00:00Z'));
  const norm = raw.map(normalizeMatch);
  const model = buildModel(U, norm);
  // fake standings: ken highest
  const standings = new Map(U.map(u => [u.id, { elo: 1500, games: model.players.get(u.id).matches }]));
  standings.get('ken').elo = 1600; standings.get('nok').elo = 1580;
  const titles = computeTitles(model, standings, { scopes: ['Season', 'All-time', 'Fun'], seasonStart: '2026-07-01' });
  const byKey = Object.fromEntries(titles.map(t => [t.title_key, t]));
  assert(byKey.goat && byKey.goat.holder_ids[0] === 'ken', 'GOAT is ken');
  assert(byKey.best_duo && byKey.best_duo.holder_ids.slice().sort().join() === 'ken,nok', 'Best Duo ken+nok');
  assert(byKey.ride_or_die && byKey.ride_or_die.holder_ids.slice().sort().join() === 'ken,nok', 'Ride or Die ken+nok');
  assert(byKey.the_regular, 'the_regular exists');
  assert(TITLES.length === 186, 'exactly 186 titles defined (40 base + 100 V2 + 46 V3), got ' + TITLES.length);
  assert(new Set(TITLES.map(t => t.key)).size === 186, 'all title keys are unique');
  assert(V2_MILESTONES.length + V2_LEADERS.length === 100, '100 V2 titles, got ' + (V2_MILESTONES.length + V2_LEADERS.length));
  assert(V3_MILESTONES.length + V3_LEADERS.length === 46, '46 V3 titles, got ' + (V3_MILESTONES.length + V3_LEADERS.length));
  // V2 milestones: ken & nok each won 10 -> win_10; everyone with a win -> first_win
  assert(byKey.win_10 && byKey.win_10.holder_ids.slice().sort().join() === 'ken,nok', 'win_10 held by ken+nok');
  assert(byKey.first_win && byKey.first_win.holder_ids.length >= 2, 'first_win is multi-holder');
  assert(byKey.play_10 && byKey.play_10.holder_ids.length === 4, 'play_10 held by all 4 active players');
  // V2 leaders: someone leads points scored
  assert(byKey.offense_engine && byKey.offense_engine.holder_ids.length === 1, 'offense_engine has a single holder');
  // every awarded title resolves to real metadata
  for (const t of titles) assert(TITLES_BY_KEY[t.title_key], 'awarded title ' + t.title_key + ' has metadata');
  // personal: bank's nemesis should be ken or nok (they beat bank a lot)
  const pt = personalTitles(model, 'bank');
  assert(pt.find(t => t.title_key === 'nemesis'), 'bank has a nemesis');
  console.log('titles.js self-check: PASS (186 titles, ' + titles.length + ' currently awarded in demo)');
}
if (process.argv.includes('--test')) demo();
