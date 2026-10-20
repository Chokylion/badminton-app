# Gooseminton — work queue

Updated 2026-08-05 (security + performance pass).

## Everything from the previous queue is now BUILT and LIVE

- **Guest players** — admin adds someone who hasn't signed up (inline in the
  match logger, or Admin → Claims / Players). They get Elo, titles, everything;
  they just can't log in. On sign-up the app offers to claim an existing guest,
  and CK approves it in **Admin → Claims**. Verified in production: you created
  guest `NN` and logged a match against them.
- **Levels & XP** (`lib/level.js`) — derived from match history, so they can
  never drift. You gain XP win *or* lose. Levels never drop.
- **Arcade** (`lib/arcade.js`) — slots (93.4% RTP), blackjack (94.4% RTP, 3:2,
  dealer stands on 17), video poker (Jacks or Better). New tab beside Map.
- **Weekly arcade league** — net coins since Monday, resets weekly.

---

## Left to do

### 1. Cosmetics shop (the missing half of the coin loop)
Coins are earned and spent in the arcade, but there is still **nothing to buy**.
The rule agreed: **coins buy cosmetics only** — never Elo, titles or rank.
`lib/cosmetics.js` already has 36 frames + 30 cards with unlock themes; add a
`price` to a subset and a "buy with coins" path alongside the earned ones.

### 2. Guest polish
- Warn when a new guest nickname is close to an existing one (no two "Mint").
- Admin **merge** for the case where somebody signed up fresh *and* a guest of
  them exists — the `claim_guest()` SQL function already does exactly this, it
  just needs an admin-facing button that isn't tied to a pending claim.
- Badge in the admin console: "2 guests waiting to be claimed".

### 3. Poker: humans at the table (asked for, NOT built)
You asked twice for other **people** to join a table. What exists today is
bots only. The server-side hand state in `poker_hands` is the right
foundation, but a human table still needs:
- a lobby / join code (the rooms feature is a working model to copy),
- a turn timer with auto-fold, so one person can't stall the table,
- polling or realtime push so every phone sees the same board,
- disconnect handling (sit-out, then auto-fold).
That is its own piece of work, roughly the size of the rooms feature.

### 3b. Blackjack turn-by-turn
Still one-shot: you pick "stand on N" and the server plays it out. Real
hit/stand needs the same server-side hand state poker now has, so it is
much cheaper to add than it was.

### 4. Known-unpolished
- `#/you` and `#/p/:id` were only smoke-tested this session, not visually
  reviewed after the frame changes.
- The tab bar now has 5 tabs + the FAB. It fits at 440px but is tight; check on
  a genuinely small phone (360px).

---

## Facts worth keeping

- `match_players.user_id` is **ON DELETE CASCADE**. Never delete a user row that
  has matches — repoint first. `claim_guest()` does this in one transaction.
- Coins: `wallets.level_paid` is a watermark so levelling can never double-pay.
  `wallet_apply()` is a single statement, so bets can't be double-spent by
  racing requests, and the balance can never go negative.
- Arcade RNG is server-side and seeded; the browser only renders outcomes.
- Slot paytable is calibrated — changing a weight or a payout changes the RTP,
  and `node lib/arcade.js --test` asserts it stays between 88% and 100%.
- `npm test` now runs 9 suites (`lib/holdem.js --test` included). `npm run deploy` stamps assets then deploys —
  never use a bare `vercel deploy`.

## Poker facts worth keeping

- `score5()` packs a hand into one comparable integer: `cat * 15^5 + r1*15^4 ?`.
  Base 15 because the ace is 14. Groups sort by **count desc, then rank desc**,
  which *is* kicker order ? that is why kicker comparisons come out right.
- `evaluate()` brute-forces all C(7,5)=21 five-card subsets. Chosen over a
  lookup table because it is obviously correct and fast enough.
- The wheel (A-2-3-4-5) is scored with high = 5, so it ranks as the lowest
  straight.
- **RTP calibration bit once**: two pair happens 23.5% of the time in seven
  cards, so paying it 2x made Rush return 164%. It now pays the stake back and
  Rush sits at 93.2%. The 250x straight flush dominates variance ? the RTP test
  needs N >= 200,000 or it reads wildly wrong.
- The fuzz test asserts **chip conservation over 500 hands**; that is the
  assertion that catches side-pot bugs.
- `.won` is a **generic label class** (line ~185 of styles.css) that sets
  `display:inline-flex`. It silently reshaped the winning poker seat. Poker uses
  `.pkwin` instead, and `.pk-seat` now declares `display:block` so no utility
  class can reshape it again.
- CSS `content` escapes must not contain a space: `"\\1FA BF"` parses as
  U+01FA followed by the literal text "BF". Card backs are drawn with gradients
  now, not a glyph, because U+1F0A0 is missing from most fonts.
- Harnesses kept: `_pokertest.mjs` (24-check arcade e2e incl. a full hand to
  showdown) and `_sweep.mjs` (12-route console/overflow sweep). Both take a
  base URL and default to live.


---

## Security pass ? 2026-08-05

A full exploit-focused audit was run. **Injection, XSS, IDOR, CSRF, SSRF, path
traversal, poker card-leakage and mass assignment all came back clean.** Four
HIGH findings were real and are now fixed; `_sectest.mjs` attempts all of them
against live and must report **8 blocked, 0 exploitable**.

1. **Login brute force was uncapped.** The throttle keyed on the raw submitted
   string with a case-SENSITIVE match, but account lookup uses `ilike`. So
   `mint` / `Mint` / `MINT` each got a fresh 8-attempt budget against the same
   account, and the `ip` argument was accepted but never used. Now the key is
   lowercased (`rateKey()`) and there is a second, looser per-IP ceiling.
2. **Coin mint was a read-then-write race.** `walletOf` read `level_paid`,
   credited, then wrote the watermark ? three round trips. N parallel
   `GET /api/wallet` all read the stale watermark and all credited, minting N x
   the reward. Replaced with `wallet_sync_level()` (db/wallet_sync_level.sql),
   which takes a row lock so concurrent callers queue and the losers pay nothing.
   Verified: 30 parallel claims pay exactly once.
3. **A poker hand could be settled twice.** `pokerAct` checked
   `status === 'live'` in one round trip and wrote `'done'` in another with no
   guard. Two racing terminal actions both replayed the same deterministic
   result and both cashed out the stack. The status transition is now a
   compare-and-swap (`.eq('status','live').select('id')`); losing the race pays
   nothing.
4. **Anyone could log matches they were not in, and the coins were permanent.**
   Two fixes: the API now rejects a match you are not a player in (admins
   exempt), and `logMatch` caps a user at 40 matches/hour. Separately the level
   watermark is now **bidirectional** ? voiding matches lowers the derived level
   and claws the coins back (clamped to the balance they still hold), where
   before it only ever ratcheted up so a fabricated mint could never be undone.

Also: arcade RNG seeds now come from `crypto.randomInt` instead of
`Math.random` (V8's state is recoverable from a few observed outputs), and
signup is rate-limited per IP so the "employee number already registered"
message can't be used to enumerate staff numbers at scale.

**Behaviour change to be aware of:** a non-admin can no longer log a match they
did not play in. If the club wants organisers to log on others' behalf, delete
the participant check in `api/[...path].js` (~line 204) ? the coin exposure it
guarded is now independently fixed by the bidirectional watermark.

## Performance pass ? 2026-08-05

Measured first, then fixed. `_webperf.mjs` reproduces all of it (cold / warm /
throttled-phone), `_load.mjs` covers concurrency.

**First contentful paint on a cold 3G phone: 4772ms -> ~350ms (roughly 14x).**
Time to interactive on the same profile: 4420ms -> ~1200ms. Warm repeat visits
were already good (~200ms) and are unchanged.

What actually mattered, in order:
- **131KB of render-blocking CSS.** The app cannot paint real UI until app.js
  and /api/init land anyway, so blocking on the full stylesheet was pure waste.
  Everything above the `critical:end` marker in styles.css (2.8KB: fonts,
  custom properties, reset, frame, boot screen) is now inlined into index.html
  by the stamper, and the full sheet loads via `rel=preload` + promotion to
  `rel=stylesheet` in preboot.js. **This alone was 4772 -> 1764ms.**
- **preboot.js was a blocking `<head>` script** and became the next bottleneck
  at 1345ms. Now `async` + a `rel=preload` hint (async scripts are fetched at
  Low priority, and this one gates the app's data). 1764 -> 644ms.
- **Two font preloads were competing with app.js at top priority.** All four
  fonts use `font-display:swap` and the service worker precaches them, so the
  fallback-font window only ever happens on a person's first visit. Dropping
  the preloads gave app.js ~500ms of its bandwidth back. 644 -> ~350ms.
- **/api/init was being requested twice** once preboot went async, because
  app.js's fallback fired when it won the race. It now waits up to 500ms for
  preboot before duplicating. Verified 1x over three cold runs.

Not done, and why: bulk dead-CSS removal (a static reachability walk said 84KB
never matches, but that walk cannot see modal/form rules that were not open ?
deleting on that evidence would break things), and code-splitting app.js
(179KB raw is the biggest remaining parse cost, but splitting a vanilla SPA by
route is real surgery for a file that is already only 51KB on the wire).


## "Does Elo update when my computer is off?" ? 2026-08-05

**Yes. It always did.** The app is hosted on Vercel + Supabase; no part of it
runs on anyone's laptop, and there is **no cron job anywhere** in the project,
so nothing needs a scheduler either. `_elocheck.mjs` proves it: it creates two
throwaway guests, logs two matches **purely over HTTP**, and watches Elo go
1500 -> 1522 -> 1499 (up on a win, down on a loss), then cleans up after itself.

Chasing the symptom did turn up two genuine bugs:

1. **The service worker never actually cached API responses.** The cache writes
   were fire-and-forget outside `e.waitUntil()`, so the browser was free to kill
   the worker before they completed. The data cache was permanently empty, which
   means the app's "works offline" promise was quietly untrue. Verified: 0 -> 3
   cached entries after the fix.
2. **A stale read was indistinguishable from a live one.** When the network
   fails the worker serves its cached copy ? correct, but silent. On flaky wifi
   you would see an old rating with no hint it was old, which reads exactly as
   "my rating isn't updating". The worker now tags those responses
   `X-GM-Offline: 1` and the app shows a persistent bar: *"Offline ? showing
   your last saved data"*. It clears itself the moment a live response arrives.
   - It is a **bar, not a toast**: this is a persistent condition, and a toast
     that vanishes after 2.6s is the wrong primitive ? you might look at your
     rating a minute after the request that went stale.
   - It sits at **top:0**, because `.tabs` is fixed at `bottom:0` and the first
     version covered the navigation.
   - `preboot.js` fetches `/api/init` outside app.js's `api()` wrapper, so it
     has to do its own stale check (`window.__gmInitStale`) ? otherwise the very
     first screen, which renders from that payload, misses the warning.

**Testing note:** CDP's `Network.setBlockedURLs` and
`emulateNetworkConditions({offline:true})` both intercept *before* the service
worker, so neither can exercise the offline path ? they just make the fetch
reject. The only honest test is `_offline_real.mjs`, which caches against a
local dev server, **kills the server process**, and reloads. 5/5.

If a match ever really does go missing, the likely causes are, in order: the
POST failed and the error toast was missed; the browser was offline (now
visible); or the app bundle was stale (one hard refresh fixes it).
