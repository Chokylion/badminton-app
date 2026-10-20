# Smashboard — Product Requirements Document (PRD / MVP)

> A badminton club tracker for Analog Devices. Sign up with your employee number,
> log your doubles matches in 15 seconds, and watch the leaderboard, rivalries,
> and ridiculous titles write themselves.

- **Product name:** Smashboard *(alternates: Net Gains · Rally · Deuce · Shuttle Ledger — pick one)*
- **Owner:** you
- **Status:** Draft v1 for approval → build after sign-off
- **One-liner:** *"The office badminton ladder that turns every match into stats, rivalries, and bragging rights."*

---

## 0. TL;DR

A lightweight web app for the ADI badminton crew. Employees self-register with
their **employee number + nickname + password** and pick an **emoji avatar**. They
log matches (doubles-first, singles supported) — matches **count immediately**. The
app auto-computes a **skill rating**, a **leaderboard**, per-player **public,
clickable profiles** (including your Together/Against history with that person), a
**relationship map** of who-plays-with-and-against-who, and **40 auto-awarded
titles** ("Best Duo", "Nemesis", "The One You Can't Team With"). Employee
**1234567** is the **Admin**: fix or void any wrong score and adjust any player,
with every change audit-logged. The design is deliberately *not* generic-AI-slop:
real type hierarchy, disciplined color, sport-kinetic motion, and game-style badge rarity.

**What makes it good, not just functional:** it's built around the *emotional*
loop of amateur sport — status, rivalry, belonging, and the tiny dopamine hit of
watching your rating tick up. Every screen is designed for a phone held courtside
between games.

---

## 1. Why this exists

**Problem.** People play badminton at work every week. Nobody remembers who won,
who's actually good, or who your badminton soulmate is. Casual sport has no memory
— so it has no stakes, no progression, and no stories.

**Insight.** Amateur sport communities don't run on *fitness*. They run on
**identity and rivalry**. "I'm 3-0 against Ken" is worth more than any calorie
count. The product's job is to *remember* and *dramatize* what already happens.

**Why it wins.**
- **Zero-friction identity** — employee number = instant account, no email/verify.
- **Courtside-fast logging** — the whole reason apps like this die is a slow form. This one is 3 taps.
- **It gets funnier over time** — titles and rivalries only get sharper with more data. The app compounds.

---

## 2. Users & personas

| Persona | Wants | Pain we remove |
|---|---|---|
| **The Regular** (plays weekly) | rank, streaks, rivalries | "nobody keeps score" |
| **The Competitor** (wants to be #1) | rating, leaderboard, head-to-head | no objective ranking |
| **The Social Player** (there for fun) | titles, funny stats, playing with friends | feels invisible next to sweaties |
| **The Organizer** (runs the sessions) | who's coming, balanced teams | herding cats every week |
| **The Admin** (employee **1234567**, the league keeper) | trusted data, fix mistakes, keep it clean | one wrong score poisons everyone's rating & titles |

Design must serve the **Social Player** as much as the Competitor — that's where
most apps fail (they only reward winning, so 60% of users churn). See §6.
The **Admin** is a single trusted keeper (you, `1234567`) who guarantees the
data everyone is judged by is correct — see §4.8.

---

## 3. Core concept — the match model

Badminton doubles is the hero: **Team A (2 players) vs Team B (2 players)**.
Singles (1v1) is supported as a secondary mode.

**A logged match captures:**
- Format: `doubles` | `singles`
- The 4 (or 2) players, split into Team A / Team B
- Score: best-of-3 games to 21 (win by 2, cap 30). *Quick mode:* one game only.
- Winner (auto-derived from scores)
- `played_at`, `logged_by`, `status` (`active` | `flagged` | `void`)

**Trust model — count now, fix later (not a gate):** a logged match is `active`
**immediately** and counts toward everyone's rating and titles right away — no
waiting for approval (approval gates kill logging speed, the app's whole point).
Any player can **flag** a score they think is wrong; the **Admin** (`1234567`)
can **edit or void** any match at any time, and **every change is audit-logged**
(§4.8). Voiding recomputes affected ratings/titles cleanly because everything is
derived from the match rows (§9).

**Everything else is derived** from these rows: ratings, winrate, partnerships,
rivalries, streaks, titles. One clean source of truth → no double-entry.

> **Key product decision:** we store *games*, not just "who won", because deuce
> games, point differentials, and 3-game marathons power half the fun titles
> (Clutch, Heartbreak Kid, Marathoner) and a fairer rating.

---

## 4. Feature set

### 4.1 Identity & auth (MVP)
- **Sign up:** employee number (e.g., `1234567`) + nickname + password. Nickname is the display name.
- **Log in:** employee number **or** nickname, + password.
- Passwords hashed (`scrypt`), never stored plaintext. Session via signed cookie.
- **Emoji avatar picker** — choose your face from a **120+ emoji** grid at signup,
  organized by category (Animals · Sports · Faces · Food) with a live big-preview.
  No photo uploads in v1: zero friction, nothing to moderate, and emojis read
  instantly on the leaderboard, map, and match cards. Changeable later in Settings.
- **Privacy:** employee number is **private** (used only for login/identity). Only
  your **nickname + emoji** are ever shown to other players.
- **Roles:** everyone is a **Player**; employee **1234567** is also the **Admin**
  (§4.8). Role is a flag on the account, not a separate login.

### 4.2 Log a match (MVP) — *the most important screen*
- Toggle doubles/singles.
- **Recent players prefilled** as big tappable chips; search for the rest.
- Enter scores with a number pad; winner auto-highlights.
- Submit → match is **live immediately** (counts now — no approval wait) → **Result
  Moment**: animated rating deltas (`+18`), streak update, and any **newly unlocked
  titles** flip in like game achievements. This is the app's peak (see §6).
- Under 20 seconds courtside. No mandatory typing beyond scores.
- Wrong score? Anyone in the match can tap **Flag** → it surfaces to the Admin (§4.8).

### 4.3 Leaderboard (MVP)
- **Default sort = skill rating (Elo)**, not raw winrate. (Raw winrate is gameable — a
  1-0 player shouldn't top a 40-30 player. See §9.)
- Toggle sorts: Rating · Winrate · Matches · Current streak.
- **Season selector** (all-time + monthly seasons). Your own row is pinned/visible.
- Players below the match threshold show a **"Provisional"** badge instead of a rank.

### 4.4 Player profile (MVP) — *public & clickable*
- **Every player is tappable** — from the leaderboard, a match card, the map, or a
  title holder → open their public profile. Browsing others is a core loop, not a hidden page.
- Header: avatar, rating + rank, W-L, winrate%, current streak, **held titles** (badges).
- **"History with you"** — when you view someone else, the profile leads with your
  shared story:
  - **Together** card — win% as partners, games played, W-L, best-duo status.
  - **Against** card — head-to-head record, who leads, last result.
- **Their top partners** and **their nemeses** as mini-lists (each row tappable → that player).
- Full match history feed + a pinned **"Compare head-to-head"** action.
- Your *own* profile adds private bits (roast titles you've opted into, settings).
- Achievements/quest progress (v1.5).

### 4.5 Relationships — the link map (MVP)
- Interactive **force-directed graph**. Nodes = players (size = matches played).
- **Green edges = partnerships** (thickness = games together).
- **Red/orange edges = rivalries** (thickness = head-to-head meetings).
- Tap a player → dim everyone else, highlight their partners and rivals + a mini stat card.
- Filters: partners only / rivals only / this season.

### 4.6 Titles (MVP) — see the full list in §5.
Auto-computed, auto-awarded, recomputed after each match. Tiered by rarity like a
game. Some all-time, some seasonal. "Roast" titles are opt-in (§6, psychological safety).

### 4.7 Admin console (MVP) — *the league keeper*
Employee **1234567** gets an **Admin** tab that no one else sees. It exists so the
data everyone is ranked and titled by stays trustworthy — one wrong score would
poison ratings and hand out false titles.
- **Flagged queue** — scores players reported as wrong, shown first, with the
  claimed vs logged score side by side → **Review & fix** or **Void match**.
- **All matches** — edit any score/teams/date or **void** any match, anytime
  (the chosen model: matches count immediately, admin corrects afterward).
- **Manage players** — adjust anyone's record, fix a mislinked player, change an
  emoji, or **reset a season**. This is the "adjust the log of every player" you asked for.
- **Audit log** — *every* admin action is recorded (`who · what · before→after · when`)
  and shown in-app, so corrections are transparent, never silent tampering.
- Guardrails: destructive actions confirm; voids are reversible (soft-delete, not hard-delete).

### 4.8 Surprise & delight (phased — see §11)
- **Skill rating (Elo) with provisional state** — fair ranking from day one. *(MVP)*
- **Head-to-Head card** — pick any two players, full H2H breakdown. *(v1.5)*
- **Achievements / quests** — "win a deuce", "play 5 different partners" → unlock badges. *(v1.5)*
- **"Who's in today"** — RSVP so people know if there's enough for doubles. *(v1.5)*
- **Weekly digest** — auto recap: top mover, biggest upset, new titles, rivalry of the week. Posted to Teams/email. *(v1.5)* — the #1 retention hook.
- **Fair-Teams Matchmaker** — pick who's present → balanced 2v2 teams by rating. Solves the real "who plays who" problem. *(v2)*
- **Player flag → Admin fix** — one-tap "this score is wrong" that routes to the Admin queue. *(MVP)*
- **Match confirmation** — other players actively confirm/dispute a logged score before it hardens (extends flagging). *(v2)*
- **QR quick-join** — print a QR at the court for instant signup. *(v2)*

---

## 5. The Titles system — 40 titles

Titles are the soul of the app. Each is **deterministic** (pure function of the
data), so they feel earned, not random. Alias in parentheses = optional
Analog-Devices / engineering flavor to make it bespoke, not generic.

**Gating:** all rate-based titles require a minimum sample (noted) so a 1-0 fluke
can't win. **Scope:** `All-time`, `Season` (monthly), or `Personal` (shown on your
own profile relative to you).

### Prestige — badges of honor
| # | Title (alias) | How you earn it | Scope |
|---|---|---|---|
| 1 | **The GOAT** | #1 skill rating | Season |
| 2 | **Smash King/Queen** (High Gain) | Best winrate, min 15 matches | Season |
| 3 | **Mr./Ms. Consistent** (Low Noise) | Lowest performance variance | All-time |
| 4 | **Clutch** (Deuce Closer) | Best record in deciding 3rd games & deuce points | All-time |
| 5 | **Comeback Kid** (Feedback Loop) | Most matches won after losing game 1 | Season |
| 6 | **Giant Slayer** (Overdrive) | Most wins vs higher-rated opponents | Season |
| 7 | **Iron Wall** (Low Latency D) | Fewest points conceded per game | Season |
| 8 | **Streak Lord** (Overclocked) | Longest win streak ever | All-time |
| 9 | **Untouchable** | 100% winrate this season, min 8 matches | Season |
| 10 | **Marathoner** | Most 3-game matches won | All-time |

### Duo — partnership chemistry
| # | Title (alias) | How you earn it | Scope |
|---|---|---|---|
| 11 | **Best Duo** (Perfect Signal) | Top-winrate partnership, min 10 games together | Season |
| 12 | **Ride or Die** | Most games played together | All-time |
| 13 | **Power Couple** | Best combined point differential as a pair | Season |
| 14 | **In Phase** | Longest current duo win streak | Season |
| 15 | **Chemistry Kings** (Constructive Interference) | Biggest "better-together" lift vs each player's solo baseline | All-time |
| 16 | **Two-Body Problem** | Plays a lot together but **losing** record — great friends, terrible team | All-time |
| 17 | **Oil & Water** (Out of Phase) | Worst-winrate partnership, min 6 games | Season |

### Individual impact
| # | Title (alias) | How you earn it | Scope |
|---|---|---|---|
| 18 | **Carry Certified** | Your partners win a lot more **with** you than without you | Season |
| 19 | **The Anchor** (Series Resistor) | Partners win **less** with you (gentle roast) | Season |
| 20 | **Kingmaker** | Highest positive win-rate contribution to teammates | All-time |

### Rivalry
| # | Title (alias) | How you earn it | Scope |
|---|---|---|---|
| 21 | **The Rivalry** | The two players with most head-to-head games near a 50/50 record | Season |
| 22 | **Your Nemesis** | The opponent who beats *you* the most | Personal |
| 23 | **Favorite Victim** | The opponent *you* beat the most | Personal |
| 24 | **Kryptonite** | Highest winrate against *you* specifically | Personal |
| 25 | **Bogey Team** | The duo *you* personally lose to most | Personal |
| 26 | **Public Enemy** | Most head-to-head meetings across the whole club | All-time |

### Roast — affectionate, opt-in (see §6)
| # | Title (alias) | How you earn it | Scope |
|---|---|---|---|
| 27 | **The One You Can't Team With** (Open Circuit) | Worst winrate as a partner across *all* partners | Season |
| 28 | **Heartbreak Kid** | Most losses by ≤2 points — always *so* close | Season |
| 29 | **The Choker** (Thermal Runaway) | Worst record in game 3 | Season |
| 30 | **Cold Streak** (Power Down) | Longest *current* losing streak | Season |
| 31 | **Participation Trophy** | Plays the most, wins the least — effort > results | Season |
| 32 | **Free Points** | Most-beaten player this season | Season |

### Behavioral & activity
| # | Title (alias) | How you earn it | Scope |
|---|---|---|---|
| 33 | **The Regular** | Most matches played | Season |
| 34 | **The Grinder** | Most total games (points) played | All-time |
| 35 | **Social Butterfly** | Most distinct partners | All-time |
| 36 | **One-Trick Pony** | Highest partner concentration — basically one partner | All-time |
| 37 | **Night Owl / Early Bird** | Most matches logged late-night / early-morning | Fun |
| 38 | **The Analyst** | Logs the most matches (data hero — very ADI) | Season |
| 39 | **Rookie of the Month** | Best record in first 30 days | Season |
| 40 | **Deuce Magnet** | Involved in the most deuce games | All-time |

**Rarity tiers** (visual weight, like game loot): Legendary (GOAT, Best Duo),
Epic (Nemesis, Chemistry Kings), Rare (Clutch, Giant Slayer), Common (The Regular).
Only **one holder** per prestige/duo title per scope → scarcity = value.

---

## 6. UX / UI theory — how it should *feel*

Design goal: **status, rivalry, belonging.** Not "a form that stores scores."

### 6.1 Emotional design (Don Norman's 3 levels)
- **Visceral** (looks): kinetic sport aesthetic, satisfying score chips, badge shine → "this looks cool."
- **Behavioral** (usable): logging a match is 3 taps, thumb-reachable, forgiving → "this is easy."
- **Reflective** (identity): rating, titles, rivalries = *who I am in this club* → "this is *me*." This is what makes people come back.

### 6.2 The Hook Model (why they return)
**Trigger** ("who's in today" ping / weekly digest) → **Action** (log a match) →
**Variable reward** (rating moves ±, new title unlocks, leaderboard shuffle — *variable* = addictive) → **Investment** (your stats/history grow, raising the cost of leaving). Every feature maps to a stage; the weekly digest is the external trigger that restarts the loop.

### 6.3 Peak–End rule
People remember an experience by its **peak** and its **end**, not the average.
- **Peak** = the **Result Moment** after logging a win: rating `+18` counts up, streak flame grows, a title flips in with a sound. Invest disproportionately here.
- **End** = closing the app on your updated profile / a "see you next week" line — never on a dead form.

### 6.4 Psychological safety (the make-or-break)
Leaderboards + "bad" titles can **humiliate** weaker players → they quit → the club
dies. Loss aversion means one sting outweighs three wins. Mitigations, all real:
- **Roast titles are opt-in** and default to *self-view only* ("only you see your Cold Streak").
- **Seasons reset monthly** → everyone gets a fresh start; no permanent basement.
- **Provisional** state hides rank until enough games → newcomers aren't dunked on immediately.
- Frame progress **personally** ("your best month yet") alongside the global ladder.
- Celebrate **participation** (The Regular, Social Butterfly) so showing up is rewarded, not just winning.

### 6.5 Friction — what's good vs bad
| Good (do) | Bad (avoid) |
|---|---|
| 3-tap logging, recent players prefilled | long forms, typing names every time |
| number pad, big thumb targets (Fitts's law) | tiny desktop-first controls |
| smart defaults (last format, last court) | mandatory optional fields |
| auto-derive winner from score | asking "who won?" separately |
| offline-tolerant, saves drafts | losing a match entry on a bad court wifi |
| one clear primary action per screen | 5 equal buttons, decision paralysis |

### 6.6 Other principles applied
- **Aesthetic–usability effect:** a beautiful UI is *perceived* as more usable → the design system (§7) is a feature, not decoration.
- **Social proof & belonging:** the relationship map literally draws you into the community graph.
- **Fairness/trust:** transparent rating math + optional score confirmation → people trust the ladder, so they respect it.
- **Von Restorff (isolation):** the single accent color is reserved for the primary action and rating deltas so the eye always knows where to go.

---

## 7. Design system — deliberately not AI-slop

**Banned (the generic-AI-slop starter pack):** Inter-everywhere, purple→blue
gradients, glassmorphism blur cards, emoji soup, everything centered, three
identical rounded cards, drop-shadow on everything. If it looks like every other
demo, it's wrong.

**Instead:**

- **Type:** a characterful **display face** for numbers/headlines (condensed,
  sporty — e.g., *Archivo/Anton*-style), a clean **grotesk** for body (e.g.,
  *Söhne/Geist*-style), and **tabular mono** for all scores/ratings so digits
  never jitter. Big score typography is the visual hero.
- **Color:** neutral ink-on-paper base (works in light/dark) + **one confident
  brand accent** (electric lime or "smash orange" — energetic, not corporate-blue-default;
  can nod to ADI blue as a secondary). **Semantic only:** win = green, loss = red,
  used *nowhere else* so they stay meaningful.
- **Motion:** weighty and snappy, like a smash — spring physics, staggered reveals
  on the Result Moment, count-up numbers. Respect `prefers-reduced-motion`.
- **Graphic motif:** court lines, shuttlecock feathers, net texture as subtle
  structure — not stock illustrations.
- **Components with personality:** score chips (21 | 18), **rating delta pills**
  (`▲ +18` green / `▼ -12` red), **title badges** with rarity frames (Common→Legendary),
  streak flames, the H2H "versus" card.
- **Badge rarity = game-loot visual language:** foil/holographic treatment on
  Legendary titles. Makes intangible stats feel *collectible* (reflective design).

The vibe: **FIFA/2K player card meets a clean sports app**, not a SaaS dashboard.

---

## 8. Information architecture & key screens

```
Onboarding ─ Sign up (emoji-picker avatar) / Log in (employee no. or nickname)
   │
   ├── Home / Dashboard        ← your snapshot + quick-log + highlights
   ├── Log Match  ★            ← the money screen (3 taps → Result Moment, counts now)
   ├── Leaderboard             ← rating-sorted, seasonal, your row pinned
   ├── Player Profile          ← PUBLIC & clickable: stats, Together/Against, titles, history
   ├── Relationship Map        ← the link graph
   ├── Titles / Hall of Fame   ← all 40, current holders, criteria, rarity
   ├── Head-to-Head  (v1.5)    ← compare any two players
   ├── Admin Console  🛡        ← employee 1234567 only: flagged, edit/void, manage players, audit
   └── Settings                ← avatar, privacy (roast visibility), notifs
```

Any avatar/name anywhere (leaderboard row, match card, map node, title holder) is
a **tap target → that player's public profile**. The **Admin** tab is rendered
only for employee `1234567`.

**Lo-fi wireframes (hero screens):**

```
DASHBOARD (mobile)                 LOG MATCH → RESULT MOMENT
┌───────────────────────┐          ┌───────────────────────┐
│  🏸 Smashboard     ⚙︎  │          │   MATCH LOGGED        │
│  Ken · #4 · 1487 ▲     │          │                       │
│  ┌───────┬───────┐     │          │   Ken     ▲ +18  1505 │
│  │  W 24  │ 68% WR│     │          │   Nok     ▲ +15  1442 │
│  │  L 11  │ 🔥 x5 │     │          │   ─────────────────   │
│  └───────┴───────┘     │          │   Bank    ▼ -14  1390 │
│  [ + LOG A MATCH ]     │          │   Mai     ▼ -12  1355 │
│  Who's in today (6) →  │          │                       │
│  This week ▸ upsets    │          │  ✦ NEW TITLE UNLOCKED │
│  Recent matches ▾      │          │  「 Best Duo 」 Ken+Nok│
└───────────────────────┘          └───────────────────────┘

RELATIONSHIP MAP                    PLAYER PROFILE
┌───────────────────────┐          ┌───────────────────────┐
│  ● Ken ══green══ Nok   │          │ 🟢 Ken  #4  ★1487     │
│   ╲red        green╱   │          │ Titles: Best Duo·Clutch│
│    ● Bank ─── Mai      │          │ W24-L11 · 68% · 🔥5    │
│  [partners][rivals]    │          │ Best partner: Nok 82%  │
│  tap node → focus      │          │ Nemesis: Bank (2-7)    │
└───────────────────────┘          └───────────────────────┘
```

---

## 9. Data model & rating math

### 9.1 Tables (relational)
- **users**(id, employee_no ⧉unique, nickname ⧉unique, password_hash, avatar_emoji, avatar_color, **role** `player|admin`, settings_json, created_at)
- **matches**(id, played_at, format, logged_by, **status** `active|flagged|void`, location)
- **match_players**(match_id, user_id, team A|B)
- **games**(match_id, game_no, score_a, score_b)
- **flags**(id, match_id, raised_by, reason, claimed_score, created_at, resolved_at) ← player "this is wrong"
- **audit_log**(id, actor_id, action `edit|void|restore|adjust|reset`, entity, before_json, after_json, created_at) ← every admin change
- **ratings**(user_id, season, elo, games, provisional)  ← materialized
- **titles_awarded**(title_key, holder_ids, season, value, computed_at) ← recomputed

Partnerships, rivalries, streaks, and roast stats are **queries over these**, not
extra tables — one source of truth, no sync bugs. `status='void'` rows are excluded
from every derived stat, so an admin void cleanly reverses a match's effect on
ratings and titles. `role='admin'` is seeded for employee **1234567**.

### 9.2 Why not sort by winrate
Raw winrate rewards small samples and cherry-picked opponents. Beating a
Legendary player must be worth more than beating a rookie. So the **primary
ladder is Elo**; winrate is a secondary lens.

### 9.3 Rating (Elo, adapted for doubles)
- Team rating = **average of its two players' Elo**.
- Expected score `E = 1 / (1 + 10^((R_opp − R_team)/400))`.
- New Elo `R' = R + K·(actual − E)`, applied to **both** players on a team equally.
- **K-factor:** 40 while *provisional* (first 10 games), then 24 — so ratings settle fast then stabilize.
- Margin bonus (optional): scale K slightly by point differential so a 21-5 stomp moves more than a 22-20 nail-biter.

Deterministic, explainable, and cheap to recompute. `demo()` self-check will assert:
underdog beating favorite → underdog gains more than the favorite loses in a blowout, etc.

---

## 10. Tech architecture (for the build phase)

Chosen for **"works, no mistakes, minimal moving parts."**

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Node.js v24** (already installed) | no Python/.NET needed |
| Server | built-in `node:http` | no Express — fewer deps, fewer surprises |
| DB | built-in **`node:sqlite`** | real SQL for the partnership/rivalry queries, **zero external deps**, single file = trivial backup |
| Auth | `node:crypto` `scrypt` + signed-cookie session | secure, no library |
| Frontend | vanilla JS + one small CDN force-graph lib for the map | fast, no build step |
| Rating/titles | pure JS module with a `demo()` self-check | testable, deterministic |

**Runs with one command** (`node server.js`), stores everything in
`smashboard.db`, reachable by anyone on the office network. No cloud, no
accounts to provision, no monthly bill. Deploy later to a small VM/Render if it
takes off.

> Data-integrity guardrails (not simplified away): input validation on every
> field, unique constraints on employee_no + nickname, password hashing, and a
> self-check on the rating/title math.

---

## 11. MVP scope & phasing

**v1 — MVP (everything you asked for):**
signup/login (emp# or name) · **emoji-picker avatar** · log doubles+singles
(**counts immediately**) · dashboard · leaderboard (rating + winrate) · **public
clickable player profiles** with partner/rival + Together/Against stats · **all 40
titles** · relationship map · Elo rating with provisional · **flag a wrong score**
· **Admin console** (edit/void any match, manage any player, audit log) for `1234567`.

**v1.5 — the surprises:** achievements/quests · head-to-head card · "who's in
today" RSVP · weekly digest (Teams/email) · seasons UI.

**v2 — scale:** Fair-Teams matchmaker · score confirmation/disputes · QR
quick-join · richer analytics.

*Ship v1, learn, then layer. No feature in v2 blocks v1.*

---

## 12. Success metrics

- **Activation:** % of signups who log ≥1 match in week 1.
- **Core loop:** matches logged per active week.
- **Retention:** % returning the following week (target the weekly-digest lift).
- **Breadth:** % of players with ≥10 matches (needed for titles to fire).
- **Health:** roast-title opt-out rate (if high → we're hurting feelings, fix framing).

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Winrate/score gaming | Elo + provisional + optional confirmation |
| Fake or wrong scores | any player in the match can flag/dispute (v2); log-by is recorded |
| Feelings hurt by roast titles / ladder | opt-in + self-view default, seasons reset, celebrate participation |
| Cold start (no data → no fun) | seed a few historical matches; titles gate gracefully with "not enough games yet" |
| Nickname collisions | uniqueness enforced; employee_no is the real key |
| Employee-number privacy | it's only an internal login handle; never displayed publicly — nickname is what's shown |

---

## 14. Open decisions for you

1. **Name** — Smashboard, or one of Net Gains / Rally / Deuce / Shuttle Ledger?
2. **Scoring detail** — best-of-3 games (richer titles) or just a single final score per match (simpler)? *Recommend best-of-3 with a quick single-game option.*
3. **Roast titles** — ship them opt-in as designed, or keep everything wholesome?
4. **Engineering-alias flavor** (Open Circuit, Thermal Runaway…) — on or off?
5. **Reach** — office-network local app is enough for v1, or do you want it internet-hosted so people use it from anywhere?

---

## 15. Next steps

**Visual mockups are done** — 6 hand-crafted, pixel-accurate screens rendered to
PNG (no AI-image slop): **Signup (emoji picker)**, **Dashboard**, **Result Moment**,
**Relationship Map**, **Public Profile** (Together/Against), and **Admin Console**.
They live next to this doc in `…\Desktop\badminton-app\mock-*.png`.

On your approval I'll build **v1** in `…\OneDrive - Analog Devices, Inc\Desktop\badminton-app`:
zero-dependency Node app, one-command run, real signup/login with emoji avatars,
match logging (counts immediately), the leaderboard, public clickable profiles,
the relationship map, all 40 titles, score-flagging, and the **Admin console**
(edit/void + manage players + audit log) — verified with a self-check on the
rating/title math before I call it done.
