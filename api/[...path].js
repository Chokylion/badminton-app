// api/[...path].js — single catch-all API router.
// Framework-agnostic (req, res) so the SAME handler runs on Vercel and under
// scripts/dev-server.js. Security model:
//   * session auth via HttpOnly cookie (opaque token, hashed server-side)
//   * CSRF: mutations require a same-origin Origin/Referer
//   * all inputs pass through lib/validate.js before touching the data layer
//   * the data layer (lib/store.js) uses only bound-parameter queries

import { json, readBody, parseCookies, clientIp, apiSegments } from '../lib/http.js';
import { csrfOk, buildSessionCookie, clearCookie, sessionTokenFromCookies } from '../lib/auth.js';
import * as store from '../lib/store.js';
import {
  HttpError, cleanEmployeeNo, cleanNickname, cleanPassword, cleanLoginId,
  cleanEmoji, cleanColor, cleanUuid, cleanOptText, validateMatchInput,
  validateGames, validateSettings,
} from '../lib/validate.js';
import { emojiConfig } from '../lib/emoji.js';
import { FRAMES, CARDS, THEMES, GROUP_ORDER, WEARABLES, RARITIES, rarityOf, itemPrice } from '../lib/cosmetics.js';
import {
  SLOTS as FORGE_SLOTS, STAGES as FORGE_STAGES, STATS as FORGE_STATS,
  ELEMENTS, BLESS_GRADES, STONES, SETS, LEVEL_BONUS, MAX_LEVEL, WINK_MULT, WINK_BASE, FAIL_DROP_FROM, SKINS,
  BAG_BASE, BAG_MAX, GUARANTEE_STONE,
} from '../lib/forge.js';
import { CHARM_STATS, CHARM_SLOTS, RARITY as CHARM_RARITY, SOURCES as CHARM_SOURCES, POUCH_PRICE, POUCH_TIERS, MAX_BATCH } from '../lib/charms.js';
import { STAGES as TRAIL_STAGES, RELICS, RELIC_SLOTS, EGGS_PER_MATCH, EGG_COST, MAX_STAGE, COMBAT, BOSS_EGG_DROPS } from '../lib/campaign.js';

// The browser cannot import from lib/, so the cosmetic catalogue is served with
// the boot payload. That keeps lib/cosmetics.js the single source of truth for
// the picker UI, the save whitelist and the unlock rules all at once.
// Price + rarity ride along so the shop can filter free and trophy items too,
// not just the ones the storefront happens to sell.
const withRarity = (kind, list) => list.map(o => ({ ...o, price: itemPrice(kind, o.key), rarity: rarityOf(kind, o.key) }));
const cosmeticCatalog = () => ({
  frames: withRarity('frame', FRAMES),
  cards: withRarity('card', CARDS),
  wearables: withRarity('wear', WEARABLES),
  groups: GROUP_ORDER,
  rarities: RARITIES,
  themes: THEMES.map(t => ({ key: t.key, name: t.name, note: t.note })),
});
// The forge's rulebook, so the UI can show odds and costs without a round trip.
// It is reference data only — the server re-derives every number when it rolls.
const forgeCatalog = () => ({
  slots: FORGE_SLOTS, stages: FORGE_STAGES, elements: ELEMENTS, grades: BLESS_GRADES,
  stones: STONES, pouches: POUCH_TIERS, sets: SETS,
  bagBase: BAG_BASE, bagMax: BAG_MAX,
  relics: RELICS, relicSlots: RELIC_SLOTS, eggsPerMatch: EGGS_PER_MATCH, eggCost: EGG_COST, maxStage: MAX_STAGE,
  combat: COMBAT, bossEggs: BOSS_EGG_DROPS, maxBatch: MAX_BATCH, guaranteeStone: GUARANTEE_STONE,
  stats: FORGE_STATS, skins: SKINS,
  levelBonus: LEVEL_BONUS, maxLevel: MAX_LEVEL, winkMult: WINK_MULT, winkBase: WINK_BASE, dropFrom: FAIL_DROP_FROM,
  charmStats: CHARM_STATS, charmSlots: CHARM_SLOTS,
  charmRarity: CHARM_RARITY, charmSources: CHARM_SOURCES, pouchPrice: POUCH_PRICE,
});

const cleanRange = (r) => (['all', '1w', '1m'].includes(r) ? r : 'all');
const cleanFlagStatus = (s) => (['open', 'resolved', 'dismissed'].includes(s) ? s : 'open');
const cleanDrawMode = (m) => (['rank', 'random'].includes(m) ? m : 'rank');
function cleanCourtNo(v) {
  const n = parseInt(v, 10);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new HttpError('invalid court', 400);
  return n;
}
function cleanRoomCode(v) {
  const s = String(v == null ? '' : v).trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(s)) throw new HttpError('enter a valid join code', 400);
  return s;
}
function clampLimit(v, def, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(max, n));
}
function sanitizePlayerPatch(body) {
  const patch = {};
  if (body.nickname != null) patch.nickname = cleanNickname(body.nickname);
  if (body.avatar_emoji != null) patch.avatar_emoji = cleanEmoji(body.avatar_emoji);
  if (body.avatar_color != null) patch.avatar_color = cleanColor(body.avatar_color);
  if (body.is_active != null) patch.is_active = !!body.is_active;
  if (body.role != null) {
    if (!['player', 'admin'].includes(body.role)) throw new HttpError('invalid role', 400);
    patch.role = body.role;
  }
  return patch;
}

export default async function handler(req, res) {
  const method = (req.method || 'GET').toUpperCase();
  try {
    if (method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

    const { segments, query } = apiSegments(req);
    const [a, b, c, d] = segments;
    const host = req.headers.host;
    const secure = req.headers['x-forwarded-proto'] === 'https';
    const cookies = parseCookies(req);
    const token = sessionTokenFromCookies(cookies);

    // CSRF: block cross-origin mutations before doing any work.
    if (!csrfOk(req, host)) return json(res, 403, { error: 'cross-origin request blocked' });

    const body = (method === 'GET' || method === 'HEAD') ? {} : await readBody(req);

    // ---------- open routes ----------
    if (method === 'GET' && a === 'health' && !b) return json(res, 200, { ok: true, ts: Date.now() });
    if (method === 'GET' && a === 'config' && !b) return json(res, 200, { app: 'Gooseminton', emoji: emojiConfig() });

    if (method === 'POST' && a === 'signup' && !b) {
      const user = await store.signup({
        employee_no: cleanEmployeeNo(body.employee_no),
        nickname: cleanNickname(body.nickname),
        password: cleanPassword(body.password),
        avatar_emoji: cleanEmoji(body.avatar_emoji),
        avatar_color: cleanColor(body.avatar_color),
        ip: clientIp(req),
      });
      const tok = await store.createSession(user.id, clientIp(req), req.headers['user-agent']);
      return json(res, 200, { user }, { 'Set-Cookie': buildSessionCookie(tok, { secure }) });
    }

    if (method === 'POST' && a === 'login' && !b) {
      const user = await store.login({
        loginId: cleanLoginId(body.login),
        password: cleanPassword(body.password),
        ip: clientIp(req), ua: req.headers['user-agent'],
      });
      const tok = await store.createSession(user.id, clientIp(req), req.headers['user-agent']);
      return json(res, 200, { user }, { 'Set-Cookie': buildSessionCookie(tok, { secure }) });
    }

    if (method === 'POST' && a === 'logout' && !b) {
      await store.destroySession(token);
      return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie({ secure }) });
    }

    const me = await store.getSessionUser(token);
    if (method === 'GET' && a === 'me' && !b) return json(res, 200, { user: me });

    // Everything the very first paint needs, in ONE round trip: config + who
    // you are + the home payload. Saves a serial wave (and a cold start).
    if (method === 'GET' && a === 'init' && !b) {
      const out = { app: 'Gooseminton', emoji: emojiConfig(), cosmetics: cosmeticCatalog(), forge: forgeCatalog(), user: me };
      if (me) { try { out.home = await store.homeBootstrap(me.id); } catch { out.home = null; } }
      return json(res, 200, out);
    }

    // ---------- everything below requires a session ----------
    if (!me) return json(res, 401, { error: 'sign in first' });

    if (method === 'GET' && a === 'bootstrap' && !b) return json(res, 200, await store.homeBootstrap(me.id));
    if (method === 'GET' && a === 'leaderboard' && !b) {
      // home doesn't render ▲▼ movement — serve it from the precomputed tables
      if (query.get('fast')) return json(res, 200, await store.leaderboardFast());
      const range = cleanRange(query.get('range'));
      return json(res, 200, await store.leaderboard(range));
    }
    if (method === 'GET' && a === 'players' && !b) return json(res, 200, { players: await store.playerDirectory() });
    if (method === 'GET' && a === 'matches' && !b) return json(res, 200, { matches: await store.recentMatches(clampLimit(query.get('limit'), 20, 50)) });
    if (method === 'GET' && a === 'map' && !b) return json(res, 200, await store.relationshipMap(me.id));
    if (method === 'GET' && a === 'titles' && !b) {
      const top = clampLimit(query.get('top'), 0, 400);
      return json(res, 200, { titles: await store.titlesBoard(me.id, query.get('top') ? top : 0) });
    }
    if (method === 'GET' && a === 'profile' && b) return json(res, 200, await store.profile(cleanUuid(b, 'player')));
    if (method === 'GET' && a === 'achievements' && b) return json(res, 200, await store.achievements(cleanUuid(b, 'player')));
    if (method === 'GET' && a === 'h2h' && b) return json(res, 200, await store.headToHead(me.id, cleanUuid(b, 'player')));

    // ---------- guest players ----------
    // Unclaimed guests are listed to any signed-in user (that's the claim
    // picker); creating and approving is admin-only.
    if (method === 'GET' && a === 'guests' && !b) return json(res, 200, await store.listGuests());
    if (method === 'POST' && a === 'guests' && !b) {
      if (me.role !== 'admin') return json(res, 403, { error: 'only admins can add players' });
      return json(res, 200, await store.createGuest(
        me.id, cleanNickname(body.nickname), cleanEmoji(body.avatar_emoji), cleanColor(body.avatar_color)));
    }
    if (method === 'POST' && a === 'guests' && b && c === 'claim') {
      return json(res, 200, await store.requestClaim(me.id, cleanUuid(b, 'player')));
    }
    if (method === 'DELETE' && a === 'guests' && b) {
      if (me.role !== 'admin') return json(res, 403, { error: 'admins only' });
      return json(res, 200, await store.adminDeleteGuest(me.id, cleanUuid(b, 'player')));
    }
    if (method === 'GET' && a === 'admin' && b === 'claims') {
      if (me.role !== 'admin') return json(res, 403, { error: 'admins only' });
      return json(res, 200, await store.listClaims());
    }
    if (method === 'POST' && a === 'admin' && b === 'claims' && c) {
      if (me.role !== 'admin') return json(res, 403, { error: 'admins only' });
      const action = d === 'reject' ? 'reject' : 'approve';
      return json(res, 200, await store.resolveClaim(me.id, cleanUuid(c, 'player'), action));
    }

    // ---------- shop (cosmetics for coins) ----------
    if (method === 'GET' && a === 'shop' && !b) return json(res, 200, await store.shopState(me.id));
    if (method === 'POST' && a === 'shop' && b === 'buy') {
      const kind = String(body.kind || '');
      const key = String(body.key || '');
      if (!['frame', 'card', 'wear'].includes(kind)) return json(res, 400, { error: 'unknown item kind' });
      if (!/^[a-z0-9_]{1,40}$/.test(key)) return json(res, 400, { error: 'invalid item' });
      return json(res, 200, await store.shopBuy(me.id, kind, key));
    }

    // ---------- the blacksmith: gear + charms ----------
    // The client never sends an outcome, a level or a stat — only which slot it
    // is pointing at. Everything else is decided server-side.
    if (method === 'GET' && a === 'forge' && !b) return json(res, 200, await store.forgeState(me.id));
    if (method === 'POST' && a === 'forge' && b) {
      const slot = String(body.slot || '');
    if (b === 'buy') {
      const element = String(body.element || 'wood');
      if (!/^[a-z0-9_]{1,20}$/.test(element)) return json(res, 400, { error: 'invalid element' });
      return json(res, 200, await store.gearBuy(me.id, slot, element));
    }
    if (b === 'swing') return json(res, 200, await store.gearForge(me.id, slot, body.guarantee === true));
      if (b === 'evolve') return json(res, 200, await store.gearEvolve(me.id, slot));
      if (b === 'pouch') {
        const tier = String(body.tier || 'golden');
        if (!/^[a-z]{1,12}$/.test(tier)) return json(res, 400, { error: 'invalid egg' });
        const n = body.n === undefined ? 1 : Number(body.n);
        if (!Number.isFinite(n) || n < 1 || n > 50) return json(res, 400, { error: 'invalid count' });
        if (n > 1) return json(res, 200, await store.charmPullBatch(me.id, tier, n));
        return json(res, 200, await store.charmPull(me.id, tier));
      }
      if (b === 'bless') {
        const stone = String(body.stone || 'bless');
        if (!/^[a-z]{1,12}$/.test(stone)) return json(res, 400, { error: 'invalid stone' });
        const raw = body.socket;
        const idx = raw === null || raw === undefined || raw === '' ? null : Number(raw);
        if (idx !== null && (!Number.isInteger(idx) || idx < 0 || idx > 2)) return json(res, 400, { error: 'invalid socket' });
        return json(res, 200, await store.gearBless(me.id, slot, stone, idx));
      }
      if (b === 'skin') {
        const skin = String(body.skin || '');
        if (!/^[a-z0-9_]{1,20}$/.test(skin)) return json(res, 400, { error: 'invalid skin' });
        return json(res, 200, await store.gearSkin(me.id, slot, skin));
      }
      if (b === 'charm') {
        const key = String(body.key || '');
        if (!/^[a-z0-9_]{1,40}$/.test(key)) return json(res, 400, { error: 'invalid charm' });
        const raw = body.slot;
        const slotNo = raw === null || raw === undefined || raw === '' ? null : Number(raw);
        return json(res, 200, await store.charmEquip(me.id, key, slotNo));
      }
      return json(res, 404, { error: 'not found' });
    }

    // ---------- the goose trail ----------
    if (method === 'GET' && a === 'trail' && !b) return json(res, 200, await store.trailState(me.id));
    if (method === 'POST' && a === 'trail' && b) {
      if (b === 'run') return json(res, 200, await store.trailRun(me.id, body.stage));
      if (b === 'relic') {
        const key = String(body.key || '');
        if (!/^[a-z0-9_]{1,20}$/.test(key)) return json(res, 400, { error: 'invalid relic' });
        const raw = body.slot;
        return json(res, 200, await store.relicEquip(me.id, key, raw === null || raw === undefined || raw === '' ? null : Number(raw)));
      }
      return json(res, 404, { error: 'not found' });
    }
    if (method === 'POST' && a === 'bag' && b === 'upgrade') return json(res, 200, await store.bagUpgrade(me.id));

    // ---------- arcade ----------
    if (method === 'GET' && a === 'wallet' && !b) return json(res, 200, await store.walletOf(me.id));
    if (method === 'GET' && a === 'arcade' && b === 'league') return json(res, 200, await store.arcadeLeague());
    if (method === 'POST' && a === 'arcade' && b) {
      if (b === 'poker') {
        // Peace mode is a real hand with betting rounds, so it has its own
        // start/act pair rather than the one-shot the other games use.
        if (c === 'start') return json(res, 200, await store.pokerStart(me.id, body || {}));
        if (c === 'act') {
          return json(res, 200, await store.pokerAct(
            me.id, cleanUuid(body.hand, 'hand'), String(body.action || ''), body.amount));
        }
        return json(res, 404, { error: 'unknown poker action' });
      }
      if (!['slots', 'blackjack', 'rush'].includes(b)) return json(res, 404, { error: 'unknown game' });
      return json(res, 200, await store.arcadePlay(me.id, b, body || {}));
    }
    if (method === 'GET' && a === 'arcade' && b === 'poker') return json(res, 200, await store.pokerState(me.id));

    // ---------- ฉายา / epithets ----------
    if (a === 'epithets') {
      if (method === 'GET' && !b) return json(res, 200, await store.epithetBoard(me.id));
      if (method === 'GET' && b === 'options') return json(res, 200, await store.epithetOptions(me.id));
      if (method === 'POST' && b === 'choose') {
        const key = body.key == null || body.key === '' ? null : String(body.key);
        if (key && !/^[a-z0-9_]{1,40}$/.test(key)) return json(res, 400, { error: 'invalid epithet' });
        return json(res, 200, await store.chooseEpithet(me.id, key));
      }
    }

    if (method === 'POST' && a === 'matches' && !b) {
      const input = validateMatchInput(body);
      // You may only log a match you were on court for. Without this any user
      // could fabricate unlimited matches for other people, which rewrites
      // everyone's Elo and — because XP and coins derive from match history —
      // mints coins. Admins are exempt so they can still enter a match on
      // someone's behalf.
      if (me.role !== 'admin' && ![...input.teamA, ...input.teamB].includes(me.id)) {
        return json(res, 403, { error: 'you can only log matches you played in' });
      }
      return json(res, 200, await store.logMatch(input, me.id));
    }
    if (method === 'POST' && a === 'matches' && b && c === 'flag') {
      const reason = cleanOptText(body.reason, 300, 'reason');
      const claimed = cleanOptText(body.claimed_score, 60, 'score');
      return json(res, 200, await store.flagMatch(cleanUuid(b, 'match'), me, reason, claimed));
    }
    if (method === 'POST' && a === 'settings' && !b) {
      return json(res, 200, { settings: await store.updateSettings(me.id, validateSettings(body)) });
    }
    if (method === 'POST' && a === 'avatar' && !b) {
      return json(res, 200, await store.updateAvatar(me.id, cleanEmoji(body.avatar_emoji), cleanColor(body.avatar_color)));
    }

    // ---------- rooms (live sessions) ----------
    if (a === 'rooms') {
      if (method === 'GET' && !b) return json(res, 200, await store.listOpenRooms());
      if (method === 'POST' && !b) {
        if (me.role !== 'admin') return json(res, 403, { error: 'only admins can start a session' });
        return json(res, 200, await store.createRoom(me.id, cleanOptText(body.name, 60, 'name')));
      }
      if (method === 'POST' && b === 'code' && !c) {
        return json(res, 200, await store.findRoomByCode(cleanRoomCode(body.code)));
      }
      if (method === 'GET' && b && !c) return json(res, 200, await store.roomState(cleanUuid(b, 'room'), me.id));
      if (method === 'POST' && b && c === 'join') return json(res, 200, await store.joinRoom(cleanUuid(b, 'room'), me.id));
      if (method === 'POST' && b && c === 'leave') return json(res, 200, await store.leaveRoom(cleanUuid(b, 'room'), me.id));
      if (method === 'POST' && b && c === 'courts') {
        return json(res, 200, await store.setRoomCourts(cleanUuid(b, 'room'), me.id, body.courts));
      }
      if (method === 'POST' && b && c === 'draw') {
        return json(res, 200, await store.drawRoomRound(cleanUuid(b, 'room'), me.id, cleanDrawMode(body.mode)));
      }
      if (method === 'POST' && b && c === 'result') {
        const { cleanGames } = validateGames(body.games);
        return json(res, 200, await store.reportCourtResult(
          cleanUuid(b, 'room'), me.id, cleanUuid(body.round_id, 'round'), cleanCourtNo(body.court), cleanGames));
      }
      if (method === 'POST' && b && c === 'close') return json(res, 200, await store.closeRoom(cleanUuid(b, 'room'), me.id));
    }

    // ---------- admin ----------
    if (a === 'admin') {
      if (me.role !== 'admin') return json(res, 403, { error: 'admins only' });
      if (method === 'GET' && b === 'players' && !c) return json(res, 200, { players: await store.adminPlayers() });
      if (method === 'GET' && b === 'flags' && !c) return json(res, 200, { flags: await store.adminFlags(cleanFlagStatus(query.get('status'))) });
      if (method === 'GET' && b === 'audit' && !c) return json(res, 200, { audit: await store.adminAudit(clampLimit(query.get('limit'), 50, 200)) });
      if (method === 'POST' && b === 'flags' && c && d === 'resolve') {
        const action = body.action === 'dismiss' ? 'dismiss' : 'resolve';
        return json(res, 200, await store.adminResolveFlag(cleanUuid(c, 'flag'), me.id, action, cleanOptText(body.note, 300, 'note')));
      }
      if (method === 'POST' && b === 'matches' && c && d === 'void') {
        return json(res, 200, await store.adminVoidMatch(cleanUuid(c, 'match'), me.id, cleanOptText(body.reason, 300, 'reason')));
      }
      if (method === 'POST' && b === 'matches' && c && d === 'restore') {
        return json(res, 200, await store.adminRestoreMatch(cleanUuid(c, 'match'), me.id));
      }
      if (method === 'POST' && b === 'matches' && c && d === 'games') {
        const { cleanGames } = validateGames(body.games);
        return json(res, 200, await store.adminEditGames(cleanUuid(c, 'match'), me.id, cleanGames));
      }
      if (method === 'POST' && b === 'matches' && c && d === 'delete') {
        return json(res, 200, await store.adminDeleteMatch(cleanUuid(c, 'match'), me.id));
      }
      if (method === 'POST' && b === 'reset' && !c) {
        if (body.confirm !== 'RESET') return json(res, 400, { error: 'type RESET to confirm' });
        return json(res, 200, await store.adminResetAll(me.id));
      }
      if (method === 'POST' && b === 'players' && c && !d) {
        return json(res, 200, await store.adminAdjustPlayer(cleanUuid(c, 'player'), me.id, sanitizePlayerPatch(body)));
      }
      return json(res, 404, { error: 'not found' });
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    const code = e.statusCode || (e instanceof HttpError ? e.statusCode : 500);
    if (code >= 500) console.error('API error:', e);
    return json(res, code, { error: e.message || 'server error' });
  }
}
