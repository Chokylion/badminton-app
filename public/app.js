// public/app.js — Smashboard SPA. Vanilla ES module, no external libraries
// (CSP script-src 'self'). All user-supplied strings are inserted via
// textContent (never innerHTML), so the client is XSS-safe by construction.

import { initAmbient, initRipple, confetti, countUp, tilt, sparkline, reveal, reduced, pauseOffscreen, dealFrom } from './fx.js?v=d01e628b';

const state = { me: null, config: null, players: null, lastResult: null, preboot: null };

/* ------------------------------------------------------------- celebration */
function party(kicker, name, sub, colors) {
  const el = h('div', { class: 'party' },
    h('div', { class: 'pt' }, kicker),
    h('div', { class: 'pn' }, name),
    sub ? h('div', { class: 'ps' }, sub) : null);
  document.body.append(el);
  confetti({ count: 120, colors });
  setTimeout(() => el.remove(), 3000);
}
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// Notice new unlocks / rank climbs since the last visit and celebrate them.
function celebrateProgress(myRow, achData) {
  if (myRow) {
    const prev = Number(lsGet('gm_rank'));
    if (Number.isFinite(prev) && prev > 0 && myRow.rank < prev) {
      party('RANK UP', '#' + prev + ' → #' + myRow.rank, 'You climbed the ladder', ['#ffd36a', '#a6e394', '#fff6d0']);
    }
    lsSet('gm_rank', String(myRow.rank));
  }
  if (achData) {
    const prev = Number(lsGet('gm_unlocked'));
    if (Number.isFinite(prev) && achData.unlocked > prev) {
      party('ACHIEVEMENT', '+' + (achData.unlocked - prev) + ' unlocked', 'Tap Achievements to see them');
    }
    lsSet('gm_unlocked', String(achData.unlocked));
    const pm = Number(lsGet('gm_myth'));
    if (Number.isFinite(pm) && (achData.mythicsHeld || 0) > pm) {
      party('🔮 MYTHIC CLAIMED', 'One of a kind', 'Nobody else can hold it', ['#ba8cff', '#ffd36a', '#fff6d0']);
    }
    lsSet('gm_myth', String(achData.mythicsHeld || 0));
  }
}

/* ------------------------------------------------------------------ helpers */
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;          // trusted static markup only (icons)
    else if (k === 'style') e.setAttribute('style', v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}
const ICON = {
  logo: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3c4 0 8 3 9 8-3 1-5 3-6 6-3 1-6 1-9-1" stroke="#1a0d05" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="16" r="3" stroke="#1a0d05" stroke-width="2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrowUR: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H8M17 7v9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrowR: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  board: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 4h10v4a5 5 0 0 1-10 0V4ZM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M9 18h6M12 13v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none"><circle cx="6" cy="7" r="2.4" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="9" r="2.4" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="18" r="2.4" stroke="currentColor" stroke-width="1.5"/><path d="M8 8.5 15.5 9.5M8.5 16 16 10.5" stroke="currentColor" stroke-width="1.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="2.6" stroke="currentColor" stroke-width="1.6"/><circle cx="6" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="19" r="2.6" stroke="currentColor" stroke-width="1.6"/><path d="M8.3 10.7 15.7 6.3M8.3 13.3l7.4 4.4" stroke="currentColor" stroke-width="1.6"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 21V4M5 4h11l-1.5 3L16 10H5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4L18 10l-4-4L4 16v4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="1.6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9 7V5h6v2M8 7l1 12h6l1-12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.6"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.2-2.8 8-7 10-4.2-2-7-5.8-7-10V6l7-3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 8v4l3 2M21 12a9 9 0 1 1-9-9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M17 3v4h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 4h12v3a6 6 0 0 1-12 0V4ZM4 5H2v1.5A3.5 3.5 0 0 0 5.5 10M20 5h2v1.5A3.5 3.5 0 0 1 18.5 10M9 19h6M12 13.5V19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none"><path d="M4.5 8h15l-1 12h-13l-1-12Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8.5 10V6.5a3.5 3.5 0 0 1 7 0V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  anvil: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 9h7l3 3h6a5 5 0 0 1-5 4h-6l-2-4H3V9Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 16v3M15 19H6l1.5-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  dice: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" stroke-width="1.5"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.4" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.4" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.4" fill="currentColor"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" stroke="currentColor" stroke-width="1.5"/></svg>',
  news: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M7 9h10M7 12.5h10M7 16h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};
const svgSpan = (name, cls) => h('span', { class: cls, html: ICON[name] });

// When the network is unreachable the service worker falls back to its cached
// copy of a response. That is what keeps the app usable with no signal, but
// served silently it looks identical to live data — so a rating that hasn't
// moved reads as "the app is broken" rather than "you're offline".
//
// This is a persistent condition, so it gets a persistent bar rather than a
// toast: you might only look at your rating a minute after the request that
// went stale, long after a toast would have vanished.
let servingStale = false;
function showStale(on) {
  const existing = document.getElementById('offbar');
  if (on && !existing) {
    document.body.append(h('div', { id: 'offbar', class: 'offbar' },
      'Offline — showing your last saved data'));
  } else if (!on && existing) {
    existing.remove();
  }
}
async function api(path, opts = {}) {
  const o = { method: opts.method || 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin' };
  if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  const res = await fetch('/api/' + path, o);
  const stale = !!res.headers.get('X-GM-Offline');
  if (stale !== servingStale) { servingStale = stale; showStale(stale); }
  let data = {}; try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || ('request failed (' + res.status + ')'));
  return data;
}
function toast(msg, type = '') {
  const t = h('div', { class: 'toast ' + type }, msg);
  document.getElementById('toast').append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, 2600);
}
function openModal(builder, opts = {}) {
  const root = document.getElementById('modal-root');
  const close = () => back.remove();
  const modal = h('div', { class: 'modal', style: 'position:relative' },
    opts.noClose ? null : h('button', { class: 'close icnbtn', onClick: close, html: ICON.x }));
  const back = h('div', { class: 'modal-back', onClick: (e) => { if (e.target === back && !opts.locked) close(); } }, modal);
  modal.append(builder(close));
  root.append(back);
  return close;
}
function navigate(hash) { if (location.hash === hash) render(); else location.hash = hash; }
// Native replaceChildren/append coerce null/false args to literal "null"/"false"
// text nodes (unlike h(), which skips them). Use this for any parent whose
// children include conditional (`cond ? node : null`) entries.
function setKids(el, ...kids) { el.replaceChildren(...kids.flat().filter(k => k != null && k !== false)); }
function monthKeyNow() { const d = new Date(); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
function fmtWhen(iso) {
  const d = new Date(iso), diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 172800) return 'Yesterday';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString();
}
// Returns the ring class for an avatar: a cosmetic frame overrides the auto
// rank-tier frame. frame='auto' → tier frame; 'none' → no ring; else cf-<key>.
function frameClass(tier, frame = 'auto') {
  if (frame && frame !== 'auto') return frame === 'none' ? '' : ' framed cf-' + frame;
  return tier ? ' framed frame-' + tier.key : '';
}
function avatar(u, cls = 'ava', tier = null, frame = 'auto') {
  const color = (u && u.avatar_color) || '#57b947';
  const ring = frameClass(tier, frame);
  const attrs = { class: cls + ring, style: `box-shadow:inset 0 0 0 2px ${color}99, 0 8px 18px -8px rgba(0,0,0,.6)` };
  if (tier && (!frame || frame === 'auto')) attrs.title = tier.name;
  return h('div', attrs, (u && u.avatar_emoji) || '🏸', ...wearParts(wearKeyOf(u)));
}
// Wearables: an accessory glyph layered ON an avatar (hat / eyewear / aura).
// The catalogue rides in on /api/init, so this stays a lookup, never a copy.
function wearKeyOf(u) { return (u && (u.wear || (u.settings && u.settings.wear))) || 'none'; }
function wearMeta(key) {
  const cat = (state.config && state.config.cosmetics && state.config.cosmetics.wearables) || [];
  return cat.find(x => x.key === key) || null;
}
function wearParts(key) {
  const w = wearMeta(key);
  if (!w || !w.emoji) return [];
  return [h('span', { class: 'wear wear-' + w.slot, 'aria-hidden': 'true' }, w.emoji)];
}
// A player straight from /api/players already carries their equipped frame and
// enough rating to derive their tier, so they can be drawn with the exact ring
// they wear on their profile — anywhere a player appears.
function playerAvatar(p, cls = 'ava') {
  if (!p) return avatar(null, cls);
  const tier = p.games ? tierFor(p.elo, p.rank, p.games) : TIERS[0];
  return avatar(p, cls, tier, p.frame || 'auto');
}
// ---- rank tiers: cosmetic, derived purely from Elo + leaderboard rank ----
const TIERS = [
  { key: 'bronze',    name: 'Bronze',    min: 0,    color: '#b3763e' },
  { key: 'silver',    name: 'Silver',    min: 1440, color: '#c8ccd4' },
  { key: 'gold',      name: 'Gold',      min: 1480, color: '#f6c453' },
  { key: 'platinum',  name: 'Platinum',  min: 1520, color: '#6fe0d0' },
  { key: 'diamond',   name: 'Diamond',   min: 1560, color: '#5ac8fa' },
  { key: 'conqueror', name: 'Conqueror', min: 1620, color: '#ff5470' },
  { key: 'grandmaster', name: 'Grandmaster', min: 1700, color: '#b06bff' },
];
function tierFor(elo, rank, games) {
  if (games > 0 && rank === 1) return { key: 'apex', name: 'Apex Goose', color: '#ffd36a', apex: true };
  const e = elo == null ? 0 : elo;
  let t = TIERS[0];
  for (const x of TIERS) if (e >= x.min) t = x;
  return t;
}
function tierBadge(tier) {
  if (!tier) return null;
  return h('span', { class: 'tierbadge tb-' + tier.key }, (tier.apex ? '👑 ' : '◆ ') + tier.name);
}
// The equipped name badge, shown to everyone. Falls back to the rank tier.
function nameBadge(badge, tier) {
  if (!badge) return tierBadge(tier);
  return h('span', { class: 'nbadge nb-' + badge.kind + ' t-' + (badge.tier || 'common') },
    badge.icon ? (badge.icon + ' ' + badge.name) : badge.name);
}
const names = (arr) => (arr || []).map(p => p.nickname).join(' · ');

/* --------------------------------------------------------------------- auth */
function buildAvatarPicker(sel) {
  const cfg = state.config.emoji;
  let cat = cfg.categories[0];
  const pava = h('div', { class: 'pava' }, sel.emoji);
  const grid = h('div', { class: 'egrid' });
  const colorGrid = h('div', { class: 'egrid colors' });
  function paintEmojis() {
    grid.replaceChildren(...cfg.emojis.filter(e => e.cat === cat).map(e =>
      h('button', { class: 'e' + (e.char === sel.emoji ? ' sel' : ''), onClick: () => { sel.emoji = e.char; pava.textContent = e.char; paintEmojis(); } }, e.char)));
  }
  const cats = h('div', { class: 'cats' }, ...cfg.categories.map(c =>
    h('button', { class: 'cat' + (c === cat ? ' on' : ''), onClick: (ev) => { cat = c; [...cats.children].forEach(x => x.classList.remove('on')); ev.target.classList.add('on'); paintEmojis(); } }, c)));
  function paintColors() {
    colorGrid.replaceChildren(...cfg.colors.map(c =>
      h('button', { class: 'swatch' + (c === sel.color ? ' sel' : ''), style: `background:${c};color:${c}`, onClick: () => { sel.color = c; paintColors(); pava.style.boxShadow = `inset 0 0 0 2.5px ${c},0 14px 30px -12px ${c}88`; } })));
  }
  paintEmojis(); paintColors();
  pava.style.boxShadow = `inset 0 0 0 2.5px ${sel.color},0 14px 30px -12px ${sel.color}88`;
  return h('div', {},
    h('div', { class: 'preview' }, pava),
    h('div', { class: 'lab' }, h('span', {}, 'Choose your avatar')),
    cats, grid,
    h('div', { class: 'lab' }, h('span', {}, 'Card color')),
    colorGrid);
}

function renderAuth() {
  let mode = 'signup';
  const wrap = h('div', { class: 'view' });
  function paint() {
    wrap.replaceChildren(mode === 'signup' ? signupForm() : loginForm());
  }
  function field(label, input) {
    const f = h('div', { class: 'field' }, h('div', { class: 'fin' }, h('div', { class: 'k' }, label), input));
    input.addEventListener('focus', () => f.classList.add('focus'));
    input.addEventListener('blur', () => f.classList.remove('focus'));
    return f;
  }
  function signupForm() {
    const sel = { emoji: state.config.emoji.emojis[0].char, color: state.config.emoji.colors[0] };
    const emp = h('input', { placeholder: 'e.g. 1234567', autocomplete: 'off', maxlength: '32' });
    const nick = h('input', { placeholder: 'shown to everyone', maxlength: '24' });
    const pass = h('input', { type: 'password', placeholder: 'min 6 characters', maxlength: '128' });
    const btn = h('button', { class: 'cta', onClick: submit }, h('div', { class: 'ctain' }, h('span', {}, 'Create account'), h('span', { class: 'arw', html: ICON.arrowR })));
    async function submit() {
      btn.setAttribute('disabled', '');
      try {
        const r = await api('signup', { method: 'POST', body: { employee_no: emp.value.trim(), nickname: nick.value.trim(), password: pass.value, avatar_emoji: sel.emoji, avatar_color: sel.color } });
        state.me = r.user; toast('Welcome to Gooseminton, ' + r.user.nickname + '!', 'ok');
        // Somebody may already have been logging matches for them.
        try {
          const gs = await api('guests');
          const open = (gs.guests || []).filter(g => !g.pending);
          if (open.length) { offerClaim(open); return; }
        } catch { /* claiming is a bonus, never block the sign-up */ }
        navigate('#/');
      } catch (e) { toast(e.message, 'err'); btn.removeAttribute('disabled'); }
    }
    return h('div', { class: 'app' },
      h('div', { class: 'brand', style: 'justify-content:center;margin:8px 0 12px' }, h('div', { class: 'logo', html: ICON.logo }), h('div', { class: 'name' }, 'Gooseminton')),
      h('h1', { style: 'text-align:center' }, 'Create your account'),
      h('div', { class: 'pagehead', style: 'text-align:center' }, h('div', { class: 'subtle' }, 'Join the ADI badminton ladder')),
      buildAvatarPicker(sel),
      h('div', { class: 'fields', style: 'margin-top:16px' }, field('Employee number · private', emp), field('Nickname · shown to everyone', nick), field('Password', pass)),
      btn,
      h('div', { style: 'text-align:center;margin-top:14px' },
        h('div', { class: 'subtle', style: 'font-size:12.5px' }, 'Already have an account? ', h('b', { style: 'color:var(--accent2);cursor:pointer', onClick: () => { mode = 'login'; paint(); } }, 'Log in')),
        h('div', { class: 'formnote' }, 'Employee number is private — only your nickname is shown')));
  }
  function loginForm() {
    const id = h('input', { placeholder: 'employee number or nickname', maxlength: '32' });
    const pass = h('input', { type: 'password', placeholder: 'your password', maxlength: '128' });
    const btn = h('button', { class: 'cta', onClick: submit }, h('div', { class: 'ctain' }, h('span', {}, 'Log in'), h('span', { class: 'arw', html: ICON.arrowR })));
    async function submit() {
      btn.setAttribute('disabled', '');
      try {
        const r = await api('login', { method: 'POST', body: { login: id.value.trim(), password: pass.value } });
        state.me = r.user; toast('Welcome back, ' + r.user.nickname + '!', 'ok'); navigate('#/');
      } catch (e) { toast(e.message, 'err'); btn.removeAttribute('disabled'); }
    }
    pass.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    return h('div', { class: 'app' },
      h('div', { class: 'brand', style: 'justify-content:center;margin:24px 0 16px' }, h('div', { class: 'logo', html: ICON.logo }), h('div', { class: 'name' }, 'Gooseminton')),
      h('h1', { style: 'text-align:center' }, 'Welcome back'),
      h('div', { class: 'pagehead', style: 'text-align:center' }, h('div', { class: 'subtle' }, 'Log in to the ADI badminton ladder')),
      h('div', { class: 'fields', style: 'margin-top:20px' }, field('Employee number or nickname', id), field('Password', pass)),
      btn,
      h('div', { style: 'text-align:center;margin-top:14px' },
        h('div', { class: 'subtle', style: 'font-size:12.5px' }, 'New here? ', h('b', { style: 'color:var(--accent2);cursor:pointer', onClick: () => { mode = 'signup'; paint(); } }, 'Create an account'))));
  }
  paint();
  return wrap;
}

/* -------------------------------------------------------------------- chrome */
/* ----------------------------------------------------------------- changelog */
// Newest first. Bump CHANGELOG[0].date when shipping so the bell re-dots.
const CHANGELOG = [
  {
    date: '2026-08-04', title: 'Guests, levels & the Arcade',
    items: [
      '🪿 Add players who haven’t signed up — log their scores straight away',
      '✅ When they join, they claim that profile and keep every match (you approve it)',
      '⭐ Levels & XP — you gain a level just for turning up, win or lose',
      '🎰 Arcade: slots, blackjack and video poker, paid for with coins from levelling',
      '🏆 Weekly arcade league — most coins won since Monday',
      '🏅 Podium for the top 3, with pillars that match each player’s frame',
      '🖼️ Frames now show everywhere: match logger, player picker, podium',
      '🎖️ Joiner Goose #N — your join number, and nobody can ever take it',
      '📊 Rarity on every achievement: “34% have this”',
      '🎨 36 frames and 30 card backgrounds, grouped by how you earned them',
      '🎯 Every milestone rebalanced for a real club season, not 1,000 matches',
    ],
  },
  {
    date: '2026-08-04', title: 'Match cards, odds & rivalries',
    items: [
      '📸 Share card — every logged match becomes a poster you can send to the group',
      '🔮 Win predictor — see the odds from both sides’ ratings before you play',
      '⚡ Upset callout when the underdog wins anyway',
      '⚔️ Rivalry card — full record vs any player: streaks, biggest win, worst loss',
      '🧹 Cleared out all the demo players and demo matches — the club is real data only',
      '✂️ Removed challenges, tournaments, deep stats and daily quests to keep things simple',
      '⚡ Much smoother scrolling — off-screen animations now rest instead of running',
      '📱 Install Gooseminton to your home screen, and it opens offline',
      '🔄 The app now updates itself when a new version ships',
    ],
  },
  {
    date: '2026-08-03', title: 'Mythic Vault & Live Sessions',
    items: [
      '🔮 Mythic Vault — 7 secret achievements, only ONE player can hold each',
      '🏟️ Play sessions: create a room, share a code, courts 1–5 on/off',
      '⚖️🎲 Auto-draw teams by rank or fully random, with fair bench rotation',
      '📝 Report a score straight from the court card — ratings update instantly',
      '🏅 Tonight-only standings + MVP of the night',
      '🖼️ Board now shows every player’s own equipped frame + card background',
      '🌗 Eclipse frame — unlocked only by holding a Mythic',
      '🗺️ Map: brighter lines, duo and rival lines no longer overlap',
      '🎨 Customize page previews actually render now',
      '🏆 Achievements grouped and filterable by rarity',
    ],
  },
  {
    date: '2026-08-02', title: 'Achievements & Movement',
    items: [
      '🏆 Achievements page with 124 milestones and progress bars',
      '📈 Leaderboard timeline: all-time / month / week with ▲▼ rank movement',
      '✨ Animated equippable frames and card backgrounds',
      '🎖️ 186 titles total',
      '🐣 Avatar picker: goose + 30 more icons',
    ],
  },
  {
    date: '2026-08-01', title: 'Gooseminton',
    items: [
      '🪿 Renamed to Gooseminton with the grass-green theme',
      '🛡️ Admin console: edit, void, delete matches and reset scores',
      '👑 Rank tiers bronze → Apex Goose, with avatar frames',
    ],
  },
  {
    date: '2026-07-31', title: 'Launch',
    items: ['🏸 Log matches, Elo ratings, profiles, relationship map, titles'],
  },
];
function openChangelog() {
  openModal(() => h('div', {},
    h('h2', {}, '📋 What’s new'),
    h('div', { class: 'msub' }, 'Every update, newest first'),
    h('div', { class: 'cloglist' }, ...CHANGELOG.map((r, i) => h('div', { class: 'clog' + (i === 0 ? ' latest' : '') },
      h('div', { class: 'cl-head' },
        h('div', { class: 'cl-date tnum' }, r.date),
        h('div', { class: 'cl-title' }, r.title),
        i === 0 ? h('div', { class: 'cl-new' }, 'NEW') : null),
      h('ul', { class: 'cl-items' }, ...r.items.map(it => h('li', {}, it))))))));
}

// One button, not five. Everything that used to crowd the top-right now lives
// behind this menu, so the header is a title and a single affordance.
function openMenu() {
  const seen = (() => { try { return localStorage.getItem('gm_seen_update'); } catch { return null; } })();
  const fresh = seen !== CHANGELOG[0].date;
  openModal((close) => {
    const go = (hash) => () => { close(); navigate(hash); };
    const row = (icon, label, note, onClick, extra) => h('button', { class: 'mrow', onClick },
      h('span', { class: 'mr-ic', html: ICON[icon] }),
      h('span', { class: 'mr-b' }, h('span', { class: 'mr-l' }, label), note ? h('span', { class: 'mr-n' }, note) : null),
      extra || h('span', { class: 'mr-go', html: ICON.arrowR }));
    return h('div', {},
      h('h2', {}, 'Menu'),
      h('div', { class: 'mlist' },
        row('bag', 'Shop', 'Gear, eggs, blacksmith and the Goose Trail', go('#/shop')),
        row('box', 'Inventory', 'Your kit, charms and skins', go('#/inventory')),
        row('anvil', 'Blacksmith', 'Upgrade and evolve your gear', go('#/forge')),
        row('dice', 'Arcade', 'Spend coins at the tables', go('#/arcade')),
        state.me && state.me.role === 'admin' ? row('shield', 'Admin console', 'Matches, flags and audit', go('#/admin')) : null,
        row('news', 'What’s new', CHANGELOG[0].title, () => {
          try { localStorage.setItem('gm_seen_update', CHANGELOG[0].date); } catch {}
          close(); openChangelog();
        }, fresh ? h('span', { class: 'mr-dot' }) : null),
        row('globe', 'Language', lang() === 'th' ? 'ไทย · tap for English' : 'English · tap for ไทย', () => {
          lsSet('gm_lang', lang() === 'th' ? 'en' : 'th'); close(); render();
        }, h('span', { class: 'mr-tag' }, lang() === 'th' ? 'ไทย' : 'EN')),
        row('gear', 'Settings', 'Avatar, privacy, log out', () => { close(); openSettings(); })));
  });
}
function menuBtn() {
  const seen = (() => { try { return localStorage.getItem('gm_seen_update'); } catch { return null; } })();
  return h('button', {
    class: 'icnbtn news' + (seen !== CHANGELOG[0].date ? ' fresh' : ''),
    title: 'Menu', html: ICON.menu, onClick: openMenu,
  });
}

function topBar(title, right) {
  return h('div', { class: 'top' },
    h('div', { class: 'brand' }, h('div', { class: 'logo', html: ICON.logo }), h('div', { class: 'name' }, title || 'Gooseminton')),
    h('div', { class: 'topact' }, right || null, menuBtn()));
}
function backNav(title, right) {
  return h('div', { class: 'nav' },
    h('button', { class: 'icnbtn', html: ICON.back, onClick: () => (history.length > 1 ? history.back() : navigate('#/')) }),
    h('div', { class: 't' }, title),
    h('div', { class: 'navact' }, right || null, menuBtn()));
}
function tabs(active) {
  const mk = (name, ic, label, hash) => h('button', { class: 'tab' + (active === name ? ' on' : ''), onClick: () => navigate(hash) }, svgSpan(ic), h('span', {}, label));
  // 4 tabs + the action button: 2 either side so it sits dead centre.
  return h('div', { class: 'tabs' },
    mk('home', 'home', 'Home', '#/'),
    mk('board', 'board', 'Board', '#/board'),
    h('button', { class: 'fab', html: ICON.plus, onClick: () => navigate('#/log'), title: 'Log a match' }),
    mk('shop', 'bag', 'Shop', '#/shop'),
    mk('you', 'user', 'You', '#/you'));
}

/* ---------------------------------------------------------------------- home */
async function viewHome(mount) {
  const boot = state.preboot || await api('bootstrap');
  state.preboot = null;                  // only valid for the very first paint
  const feed = { matches: boot.matches }, tb = { titles: boot.titles }, rl = { rooms: boot.rooms };
  const myRow = boot.me;
  const rating = myRow ? myRow.elo : 1500;
  const myTier = myRow ? tierFor(myRow.elo, myRow.rank, myRow.wins + myRow.losses) : null;
  const myBadges = tb.titles.filter(t => (t.holders || []).some(hd => hd.id === state.me.id)).slice(0, 2);
  // Sparkline + celebrations need heavier endpoints — never block first paint on
  // them; they get patched in when they land.
  const extrasP = Promise.all([
    api('profile/' + state.me.id).catch(() => null),
    api('achievements/' + state.me.id).catch(() => null),
  ]);

  // recently active players from the feed
  const seen = new Map();
  for (const m of feed.matches) for (const p of [...m.teamA, ...m.teamB]) if (!seen.has(p.id)) seen.set(p.id, p);
  const active = [...seen.values()].slice(0, 6);

  const highlights = tb.titles.slice(0, 3);

  const ratingVal = h('div', { class: 'val tnum' }, String(rating));
  const sparkSlot = h('div', { class: 'herospark' });
  const hero = h('div', { class: 'shell' }, h('div', { class: 'hero sheen' },
    h('div', { class: 'head' },
      avatar(state.me, 'ava', myTier, (state.me.settings && state.me.settings.frame) || 'auto'),
      h('div', { class: 'who' },
        h('div', { class: 'rankrow' }, h('span', { class: 'nm' }, state.me.nickname), myRow ? h('span', { class: 'pill rk' }, 'RANK #' + myRow.rank) : h('span', { class: 'pill prov' }, 'UNRANKED'), nameBadge(myRow && myRow.badge, myTier)),
        myBadges.length ? h('div', { class: 'subwrap' }, ...myBadges.map(b => h('span', { class: 'tbadge' }, b.tier === 'legendary' ? '🏆 ' + b.name : '⚡ ' + b.name))) : null),
      h('div', { class: 'ratingblock' },
        h('div', { class: 'lab' }, 'Rating'),
        ratingVal,
        myRow && myRow.provisional ? h('div', { class: 'delta', style: 'color:var(--blue)' }, 'provisional') : null)),
    myRow && myRow.streak > 2 ? h('div', { style: 'margin-top:10px' }, h('span', { class: 'flame' }, h('span', { class: 'ic' }, '🔥'), h('span', { class: 'n' }, myRow.streak + ' WIN STREAK'))) : null,
    sparkSlot,    h('div', { class: 'stats' },
      stat(myRow ? myRow.wins : 0, 'Wins'),
      stat(myRow ? myRow.losses : 0, 'Losses'),
      stat(myRow ? Math.round(100 * myRow.wins / Math.max(1, myRow.wins + myRow.losses)) + '%' : '—', 'Winrate', 'g'),
      stat(myRow ? streakStr(myRow.streak) : '—', 'Streak', 'o'))));
  countUp(ratingVal, rating, { from: Math.max(1000, rating - 140) });
  tilt(hero.firstChild, 5);

  const cta = h('button', { class: 'cta', onClick: () => navigate('#/log') }, h('div', { class: 'ctain' }, h('span', {}, 'Log a match'), h('span', { class: 'arw', html: ICON.arrowUR })));

  const liveRoom = (rl.rooms || [])[0] || null;
  const sessionCard = liveRoom
    ? h('button', { class: 'sesscard live', onClick: () => navigate('#/room/' + liveRoom.id) },
      h('div', { class: 'sc-live' }, h('span', { class: 'dot' }), 'LIVE'),
      h('div', { class: 'sc-info' },
        h('div', { class: 'sc-n' }, liveRoom.name || 'Session in progress'),
        h('div', { class: 'sc-s' }, plur(liveRoom.players, 'player') + ' · ' + plur((liveRoom.courts || []).length, 'court') + ' · tap to join')),
      h('div', { class: 'sc-code tnum' }, liveRoom.code))
    : h('button', { class: 'sesscard', onClick: () => navigate('#/rooms') },
      h('div', { class: 'sc-ic' }, '🏟️'),
      h('div', { class: 'sc-info' },
        h('div', { class: 'sc-n' }, state.me.role === 'admin' ? 'Host a play session' : 'Join a play session'),
        h('div', { class: 'sc-s' }, 'Courts, auto-drawn teams, live scoreboard')),
      h('div', { class: 'sc-go', html: ICON.arrowR }));

  // --- fair matchmaker: closest rating to yours (picked server-side) ---
  function findFairOpponent() {
    const best = boot.fair;
    if (!best) { toast('Nobody else on the board yet', 'err'); return; }
    const gap = best.gap;
    openModal(() => h('div', {},
      h('h2', {}, '⚖️ Fairest match'),
      h('div', { class: 'msub' }, 'Closest rating to yours right now'),
      h('div', { class: 'fairwrap' },
        h('div', { class: 'fairp' }, h('div', { class: 'e' }, best.avatar_emoji), h('div', { class: 'n' }, best.nickname),
          h('div', { class: 'v tnum' }, String(best.elo))),
        h('div', { class: 'fairgap' }, h('div', { class: 'g tnum' }, gap + ' Elo apart'),
          h('div', { class: 'w' }, gap <= 25 ? '🔥 Coin flip' : gap <= 70 ? 'Competitive' : 'Underdog story'))),
      h('button', { class: 'cta', style: 'margin-top:14px', onClick: () => { navigate('#/log'); document.querySelector('.modal-back')?.remove(); } },
        h('div', { class: 'ctain' }, h('span', {}, 'Log a match'), h('span', { class: 'arw', html: ICON.arrowUR })))));
  }
  // Map lost its tab so the log button could sit dead centre — it lives here
  // now, paired with the matchmaker so Home keeps one tidy row of utilities.
  const utilRow = h('div', { class: 'utilrow' },
    h('button', { class: 'utilbtn', onClick: () => navigate('#/map') },
      h('span', { class: 'ic' }, '🗺️'),
      h('span', { class: 'ub' }, h('span', { class: 'un' }, 'Club map'), h('span', { class: 'us' }, 'Who plays with who'))),
    h('button', { class: 'utilbtn', onClick: findFairOpponent },
      h('span', { class: 'ic' }, '⚖️'),
      h('span', { class: 'ub' }, h('span', { class: 'un' }, 'Fair match'), h('span', { class: 'us' }, 'Closest to your rating'))));
  setKids(mount,
    topBar('Gooseminton'),
    hero, cta, sessionCard, utilRow,
    active.length ? h('div', {}, h('div', { class: 'slab' }, h('div', { class: 't' }, 'Recently active'), h('div', { class: 'm' }, active.length + ' players')),
      h('div', { class: 'whoin' }, ...active.map(p => h('button', { class: 'mini', style: `box-shadow:inset 0 0 0 1px ${p.avatar_color||'#333'}55`, onClick: () => navigate('#/p/' + p.id) }, p.avatar_emoji, h('span', { class: 'dot' }))))) : null,
    highlights.length ? h('div', {}, h('div', { class: 'slab' }, h('div', { class: 't' }, 'Hall of Fame'), h('button', { class: 'm link', onClick: () => navigate('#/titles') }, 'See all')),
      h('div', { class: 'bento' }, ...highlights.map((t, i) => titleHighlight(t, i === 0)))) : null,
    h('div', {}, h('div', { class: 'slab' }, h('div', { class: 't' }, 'Recent matches'), h('button', { class: 'm link', onClick: () => navigate('#/board') }, 'Leaderboard')),
      feed.matches.length ? h('div', {}, ...feed.matches.slice(0, 6).map(matchRow)) : h('div', { class: 'empty' }, 'No matches yet — log the first one!')));
  [...mount.querySelectorAll('.bento, .sesscard')].forEach(reveal);
  if (!tourDone()) setTimeout(() => { if (document.querySelector('.cta')) startTour(); }, 900);
  extrasP.then(([prof, ach]) => {
    if (!sparkSlot.isConnected) return;                 // user navigated away
    if (prof && prof.eloHistory && prof.eloHistory.length > 2) {
      sparkSlot.replaceChildren(sparkline(prof.eloHistory, { w: 300, h: 44 }));
    }
    celebrateProgress(myRow, ach);
  });
}
function stat(n, k, cls) { return h('div', { class: 'stat' }, h('div', { class: 'n ' + (cls || '') + ' tnum' }, String(n)), h('div', { class: 'k' }, k)); }
function streakStr(s) { return s > 0 ? '×' + s : s < 0 ? '×' + Math.abs(s) : '—'; }
function titleHighlight(t, wide) {
  const holders = (t.holders || []).map(x => x.nickname).join(' & ') || '—';
  if (wide) return h('div', { class: 'hcard wide', onClick: () => navigate('#/titles') },
    h('div', { class: 'badge' }, t.tier === 'legendary' ? '🏆' : '🎖️'),
    h('div', {}, h('div', { class: 'raritytag' }, '◆ ' + t.tier + ' · ' + t.scope), h('div', { class: 'big' }, t.name), h('div', { class: 'sm' }, holders + (t.value ? ' — ' + t.value : ''))));
  return h('div', { class: 'hcard', onClick: () => navigate('#/titles') }, h('div', { class: 'tag' }, t.name), h('div', { class: 'big' }, holders), t.value ? h('div', { class: 'sm' }, t.value) : null);
}
function matchRow(m) {
  const iAmA = m.teamA.some(p => p.id === state.me.id), iAmB = m.teamB.some(p => p.id === state.me.id);
  const myTeam = iAmA ? 'A' : iAmB ? 'B' : null;
  const res = m.status === 'void' ? 'v' : myTeam ? (m.winner === myTeam ? 'w' : 'l') : (m.winner === 'A' ? 'w' : 'l');
  const label = m.status === 'void' ? 'VOID' : myTeam ? (m.winner === myTeam ? 'WIN' : 'LOSS') : (m.format === 'singles' ? '1v1' : '2v2');
  const first = m.games[0] || { score_a: 0, score_b: 0 };
  const row = h('div', { class: 'match' },
    h('div', { class: 'res ' + res }, label),
    h('button', { class: 'mline', style: 'background:none;text-align:left', onClick: () => m.teamA[0] && navigate('#/p/' + m.teamA[0].id) },
      h('div', { class: 'p' }, h('b', {}, names(m.teamA)), ' vs ', names(m.teamB)),
      h('div', { class: 't' }, (m.format === 'singles' ? 'Singles' : 'Doubles') + ' · ' + (m.gamesWonA + '–' + m.gamesWonB + ' games') + ' · ' + fmtWhen(m.played_at))),
    h('div', { class: 'score tnum' }, String(first.score_a), h('span', { class: 'sep' }, '–'), String(first.score_b)),
    (iAmA || iAmB) && m.status !== 'void' ? h('button', { class: 'flagbtn', html: ICON.flag, onClick: () => flagDialog(m) }) : null);
  return row;
}

/* --------------------------------------------------------------------- board */
function moveBadge(delta, prevRank) {
  if (prevRank == null) return h('div', { class: 'mv new', title: 'New to the board' }, 'NEW');
  if (delta > 0) return h('div', { class: 'mv up', title: 'Climbed ' + delta }, h('span', { class: 'ar' }, '▲'), h('span', { class: 'tnum' }, String(delta)));
  if (delta < 0) return h('div', { class: 'mv dn', title: 'Dropped ' + Math.abs(delta) }, h('span', { class: 'ar' }, '▼'), h('span', { class: 'tnum' }, String(Math.abs(delta))));
  return h('div', { class: 'mv fl', title: 'No change' }, '–');
}
async function viewBoard(mount) {
  let range = 'all';
  const RANGE_NOTE = { all: 'All-time Elo · ▲▼ = rank change over 30 days', '1m': 'All-time Elo · ▲▼ = rank change this month', '1w': 'All-time Elo · ▲▼ = rank change this week' };
  const list = h('div', {});
  const note = h('div', { class: 'subtle' }, RANGE_NOTE[range]);
  async function load() {
    note.textContent = RANGE_NOTE[range];
    list.replaceChildren(h('div', { class: 'empty' }, 'Loading…'));
    const lb = await api('leaderboard?range=' + range);
    if (!lb.rows.length) { list.replaceChildren(h('div', { class: 'empty' }, 'No ranked players yet.')); return; }

    // Mythic holders wear the one-of-a-kind Eclipse ring unless they've
    // deliberately equipped something else.
    const frameOf = (r) => ((r.frame && r.frame !== 'auto') ? r.frame : (r.mythics > 0 ? 'eclipse' : 'auto'));

    const row = (r, i) => {
      const t = tierFor(r.elo, r.rank, r.games);
      return h('button', { class: 'lbrow rise' + (r.id === state.me.id ? ' me' : '') + (r.mythics > 0 ? ' mythrow' : ''), style: '--d:' + (i * 28) + 'ms', onClick: () => navigate('#/p/' + r.id) },
        r.card && r.card !== 'none' ? h('div', { class: 'rowbg cb-' + r.card }) : null,
        h('div', { class: 'rank tnum' }, String(r.rank)),
        moveBadge(r.delta, r.prevRank),
        h('div', { class: 'av' + frameClass(t, frameOf(r)) }, r.avatar_emoji, ...wearParts(r.wear)),
        h('div', { class: 'info' }, h('div', { class: 'n' }, r.nickname, r.provisional ? h('span', { class: 'pill prov', style: 'margin-left:7px' }, 'PROV') : null),
          r.badge ? h('div', { class: 'lbbadge' }, nameBadge(r.badge, t)) : null,
          h('div', { class: 's tnum' }, r.wins + 'W ' + r.losses + 'L · ' + plur(r.games, 'game'))),
        h('div', { class: 'elo tnum' }, String(r.elo)));
    };

    // Top three get a real podium on a badminton court; everyone else keeps the
    // familiar row. Ordered 2-1-3 so the champion stands in the middle.
    const top = lb.rows.slice(0, 3);
    const podium = top.length >= 3 ? h('div', { class: 'podium' },
      h('div', { class: 'court' },
        h('div', { class: 'net' }), h('div', { class: 'cline v' }),
        h('div', { class: 'cline h1' }), h('div', { class: 'cline h2' })),
      h('div', { class: 'plinth' }, ...[top[1], top[0], top[2]].map((r) => {
        const t = tierFor(r.elo, r.rank, r.games);
        const ring = frameClass(t, frameOf(r));
        return h('button', { class: 'pod p' + r.rank, onClick: () => navigate('#/p/' + r.id) },
          h('div', { class: 'pmedal' }, ['🥇', '🥈', '🥉'][r.rank - 1]),
          h('div', { class: 'pav' + ring }, r.avatar_emoji, ...wearParts(r.wear)),
          h('div', { class: 'pn' }, r.nickname),
          h('div', { class: 'pe tnum' }, String(r.elo)),
          // the pillar wears the same palette as the player's ring, so a
          // rainbow frame gets a rainbow pillar that shimmers with it
          h('div', { class: 'pbase' + ring.replace(' framed', ' pbfr') },
            h('span', { class: 'tnum' }, '#' + r.rank)));
      }))) : null;

    const rest = lb.rows.slice(top.length >= 3 ? 3 : 0);
    list.replaceChildren(
      podium,
      rest.length ? h('div', { class: 'restwrap' }, ...rest.map(row)) : null);
  }
  const seg = h('div', { class: 'seg' },
    h('button', { class: 's on', onClick: (e) => { range = 'all'; segSel(seg, e.target); load(); } }, 'All-time'),
    h('button', { class: 's', onClick: (e) => { range = '1m'; segSel(seg, e.target); load(); } }, 'This month'),
    h('button', { class: 's', onClick: (e) => { range = '1w'; segSel(seg, e.target); load(); } }, 'This week'));
  mount.replaceChildren(h('div', { class: 'pagehead withact' }, h('h1', {}, 'Leaderboard'), note, h('div', { class: 'phact' }, menuBtn())), seg, list);
  load();
}
function segSel(seg, el) { [...seg.children].forEach(c => c.classList.remove('on')); el.classList.add('on'); }

/* ----------------------------------------------------------------- log match */
async function viewLog(mount) {
  if (!state.players) state.players = (await api('players')).players;
  let format = 'doubles';
  let teamA = [null, null], teamB = [null, null];
  let games = [{ a: '', b: '' }];

  const teamWrap = h('div', {});
  const gamesWrap = h('div', {});
  const oddsWrap = h('div', {});
  const submitBtn = h('button', { class: 'cta', onClick: submit }, h('div', { class: 'ctain' }, h('span', {}, 'Save match'), h('span', { class: 'arw', html: ICON.check })));
  const note = h('div', { class: 'formnote' });

  // --- win predictor -------------------------------------------------------
  // Straight Elo expectancy on the two team averages. It is the same maths the
  // rating engine uses to award points, so the odds shown here and the points
  // handed out afterwards can never disagree.
  function paintOdds() {
    const A = teamA.filter(Boolean), B = teamB.filter(Boolean);
    const per = format === 'doubles' ? 2 : 1;
    if (A.length !== per || B.length !== per) { oddsWrap.replaceChildren(); return; }
    const avg = (t) => t.reduce((s, p) => s + (p.elo ?? 1500), 0) / t.length;
    const ea = avg(A), eb = avg(B);
    const pA = Math.round(100 / (1 + 10 ** ((eb - ea) / 400)));
    const gap = Math.abs(Math.round(ea - eb));
    const favA = pA >= 50;
    const lead = favA ? pA : 100 - pA;
    const verdict = lead >= 80 ? 'Heavy favourite' : lead >= 65 ? 'Clear edge' : lead >= 56 ? 'Slight edge' : '🔥 Coin flip';
    state.odds = { pA, favTeam: favA ? 'A' : 'B', lead, gap };

    oddsWrap.replaceChildren(h('div', { class: 'odds' },
      h('div', { class: 'od-top' },
        h('div', { class: 'od-t' }, '🔮 WIN PREDICTOR'),
        h('div', { class: 'od-g tnum' }, gap === 0 ? 'dead level' : gap + ' Elo apart')),
      h('div', { class: 'od-bar' },
        h('div', { class: 'od-a', style: 'width:' + pA + '%' }, h('span', { class: 'tnum' }, pA + '%')),
        h('div', { class: 'od-b', style: 'width:' + (100 - pA) + '%' }, h('span', { class: 'tnum' }, (100 - pA) + '%'))),
      h('div', { class: 'od-ft' },
        h('div', { class: 'od-n' }, names(A)),
        h('div', { class: 'od-v' }, verdict),
        h('div', { class: 'od-n r' }, names(B)))));
  }

  function resizeTeams() { const per = format === 'doubles' ? 2 : 1; teamA = teamA.slice(0, per); teamB = teamB.slice(0, per); while (teamA.length < per) teamA.push(null); while (teamB.length < per) teamB.push(null); }
  function slot(team, idx, justSet) {
    const p = team[idx];
    return h('button', { class: 'slot' + (p ? ' filled' : '') + (justSet ? ' justset' : ''), onClick: () => pickPlayer(team, idx) },
      p ? playerAvatar(p, 'av') : svgSpan('plus'),
      h('div', { class: 'nm' }, p ? p.nickname : 'Add'));
  }
  function paintTeams(justSet) {
    resizeTeams();
    const per = format === 'doubles' ? 2 : 1;
    teamWrap.replaceChildren(h('div', { class: 'teamgrid' },
      h('div', { class: 'teamcol' }, h('div', { class: 'lbl' }, 'Team A'), ...Array.from({ length: per }, (_, i) => slot(teamA, i, justSet === teamA[i]))),
      h('div', { class: 'vsbadge' }, 'VS'),
      h('div', { class: 'teamcol' }, h('div', { class: 'lbl' }, 'Team B'), ...Array.from({ length: per }, (_, i) => slot(teamB, i, justSet === teamB[i])))));
    paintOdds();
  }
  function pickPlayer(team, idx) {
    const used = new Set([...teamA, ...teamB].filter(Boolean).map(p => p.id));
    if (team[idx]) used.delete(team[idx].id);
    openModal((close) => {
      const search = h('input', { class: 'searchbox', placeholder: 'Search players…' });
      const listEl = h('div', { class: 'picklist' });
      function paint() {
        const q = search.value.trim().toLowerCase();
        listEl.replaceChildren(...state.players.filter(p => !used.has(p.id) && p.nickname.toLowerCase().includes(q)).map(p =>
          h('button', { class: 'pickrow', onClick: () => { team[idx] = p; close(); paintTeams(p); validate(); } },
            playerAvatar(p, 'av'),
            h('div', { class: 'n' }, p.nickname, p.guest ? h('span', { class: 'gchip' }, 'GUEST') : null),
            h('div', { class: 'pk-elo tnum' }, p.games ? String(p.elo) : '—'))));
        if (!listEl.children.length) listEl.append(h('div', { class: 'empty' }, 'No players found'));
      }
      search.addEventListener('input', paint); paint();
      // Somebody turns up who never signed up? Add them without losing the
      // match you're halfway through entering.
      const addNew = state.me.role === 'admin'
        ? h('button', { class: 'btn ghost addnew', onClick: () => openAddGuest(async (g) => {
          state.players = (await api('players')).players;
          const fresh = state.players.find(x => x.id === g.id);
          team[idx] = fresh || g; close(); paintTeams(fresh || g); validate();
        }) }, h('div', { class: 'in' }, '＋  Add someone new'))
        : null;
      return h('div', {}, h('h2', {}, 'Pick a player'), h('div', { class: 'msub' }, 'Choose who played'), search, listEl, addNew,
        team[idx] ? h('button', { class: 'btn danger', style: 'margin-top:12px', onClick: () => { team[idx] = null; close(); paintTeams(); validate(); } }, h('div', { class: 'in' }, 'Clear slot')) : null);
    });
  }
  function paintGames() {
    gamesWrap.replaceChildren(...games.map((g, i) => {
      const a = h('input', { type: 'number', inputmode: 'numeric', min: '0', max: '30', value: g.a, placeholder: '0' });
      const b = h('input', { type: 'number', inputmode: 'numeric', min: '0', max: '30', value: g.b, placeholder: '0' });
      a.addEventListener('input', () => { g.a = a.value; validate(); });
      b.addEventListener('input', () => { g.b = b.value; validate(); });
      return h('div', { class: 'gamerow' }, h('div', { class: 'gno' }, 'GAME ' + (i + 1)), a, h('div', { class: 'gd' }, '–'), b,
        games.length > 1 ? h('button', { class: 'rm', html: ICON.x, onClick: () => { games.splice(i, 1); paintGames(); validate(); } }) : h('div', { class: 'rm' }));
    }),
      games.length < 3 ? h('button', { class: 'addgame', onClick: () => { games.push({ a: '', b: '' }); paintGames(); } }, '+ ADD GAME (best of 3)') : null);
  }
  function computeValid() {
    const per = format === 'doubles' ? 2 : 1;
    if (teamA.filter(Boolean).length !== per || teamB.filter(Boolean).length !== per) return { ok: false, msg: 'Pick all players' };
    let wa = 0, wb = 0;
    for (const g of games) {
      const a = Number(g.a), b = Number(g.b);
      if (g.a === '' || g.b === '' || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 30 || b > 30) return { ok: false, msg: 'Enter valid scores (0–30)' };
      if (a === b) return { ok: false, msg: 'Games cannot be tied' };
      if (a > b) wa++; else wb++;
    }
    if (wa === wb) return { ok: false, msg: 'One side must win more games' };
    const win = Math.max(wa, wb), lose = Math.min(wa, wb);
    if (win > 2 || lose >= win || games.length !== win + lose) return { ok: false, msg: 'Invalid best-of-3 sequence' };
    return { ok: true, msg: (wa > wb ? 'Team A wins ' : 'Team B wins ') + wa + '–' + wb };
  }
  function validate() {
    const v = computeValid();
    note.textContent = v.msg;
    note.style.color = v.ok ? 'var(--win)' : 'var(--dim)';
    if (v.ok) submitBtn.removeAttribute('disabled'); else submitBtn.setAttribute('disabled', '');
  }
  async function submit() {
    const v = computeValid(); if (!v.ok) return;
    submitBtn.setAttribute('disabled', '');
    const ids = [...teamA, ...teamB].map(p => p.id);
    try {
      const before = await snapshot(ids);
      await api('matches', { method: 'POST', body: { format, teamA: teamA.map(p => p.id), teamB: teamB.map(p => p.id), games: games.map(g => ({ score_a: Number(g.a), score_b: Number(g.b) })) } });
      const after = await snapshot(ids);
      state.lastResult = buildResult({ format, teamA: [...teamA], teamB: [...teamB], games: games.map(g => ({ a: Number(g.a), b: Number(g.b) })) }, before, after, state.odds);
      navigate('#/result');
    } catch (e) { toast(e.message, 'err'); submitBtn.removeAttribute('disabled'); }
  }
  const seg = h('div', { class: 'seg' },
    h('button', { class: 's on', onClick: (e) => { format = 'doubles'; segSel(seg, e.target); paintTeams(); validate(); } }, 'Doubles (2v2)'),
    h('button', { class: 's', onClick: (e) => { format = 'singles'; segSel(seg, e.target); paintTeams(); validate(); } }, 'Singles (1v1)'));

  mount.replaceChildren(backNav('Log a match'), seg,
    h('div', { class: 'slab' }, h('div', { class: 't' }, 'Who played')), teamWrap, oddsWrap,
    h('div', { class: 'slab' }, h('div', { class: 't' }, 'Scores'), h('div', { class: 'm' }, 'To 21 · best of 3')), gamesWrap,
    note, submitBtn);
  paintTeams(); paintGames(); validate();
}
async function snapshot(ids) {
  const [lb, tb] = await Promise.all([api('leaderboard'), api('titles')]);
  const elo = new Map(lb.rows.map(r => [r.id, r.elo]));
  const titlesByUser = new Map();
  for (const t of tb.titles) for (const hd of (t.holders || [])) { if (!ids.includes(hd.id)) continue; if (!titlesByUser.has(hd.id)) titlesByUser.set(hd.id, new Set()); titlesByUser.get(hd.id).add(t.key + '|' + t.season); }
  return { elo, titles: tb.titles, titlesByUser };
}
function buildResult(match, before, after, odds) {
  let wa = 0, wb = 0; for (const g of match.games) { if (g.a > g.b) wa++; else wb++; }
  const winner = wa > wb ? 'A' : 'B';
  const rows = [];
  const add = (p, team) => { const pre = before.elo.get(p.id) ?? 1500, post = after.elo.get(p.id) ?? 1500; rows.push({ p, team, won: team === winner, was: Math.round(pre), now: Math.round(post), delta: Math.round(post - pre) }); };
  match.teamA.forEach(p => add(p, 'A')); match.teamB.forEach(p => add(p, 'B'));
  rows.sort((x, y) => (y.won - x.won) || (y.delta - x.delta));
  // new titles among participants
  let newTitle = null;
  for (const r of rows) {
    const b = before.titlesByUser.get(r.p.id) || new Set();
    const aset = after.titlesByUser.get(r.p.id) || new Set();
    for (const key of aset) if (!b.has(key)) { const [tk, season] = key.split('|'); const meta = after.titles.find(t => t.key === tk && t.season === season); if (meta) { newTitle = meta; break; } }
    if (newTitle) break;
  }
  return { match, winner, wa, wb, rows, newTitle, odds: odds || null };
}
function viewResult(mount) {
  const R = state.lastResult;
  if (!R) { navigate('#/'); return; }
  const iAmA = R.match.teamA.some(p => p.id === state.me.id), iAmB = R.match.teamB.some(p => p.id === state.me.id);
  const myTeam = iAmA ? 'A' : iAmB ? 'B' : null;
  const iWon = myTeam ? myTeam === R.winner : null;
  const last = R.match.games[R.match.games.length - 1];
  const confetti = (iWon !== false) ? confettiEl() : null;

  setKids(mount,
    confetti,
    h('div', { class: 'app', style: 'position:relative;z-index:2' },
      h('div', { class: 'eyebrow' }, h('span', {}, 'Match logged · ' + (R.match.format === 'singles' ? 'Singles' : 'Doubles'))),
      h('div', { class: 'scorewrap' },
        h('div', { class: 'won' + (iWon === false ? ' lost' : '') }, svgSpan('trophy'), myTeam ? (iWon ? 'YOUR TEAM WON' : 'YOU LOST') : (R.winner === 'A' ? 'TEAM A WON' : 'TEAM B WON')),
        h('div', { class: 'bigscore tnum' }, String(last.a), h('span', { class: 'd' }, '–'), String(last.b)),
        h('div', { class: 'games' }, 'Best of 3 · ' + R.wa + '–' + R.wb + ' games'),
        h('div', { class: 'teams' }, h('b', {}, names(R.match.teamA)), h('span', { class: 'vs' }, R.winner === 'A' ? 'DEF' : 'lost to'), names(R.match.teamB))),
      h('div', { class: 'slab' }, h('div', { class: 't' }, 'Rating changes')),
      ...R.rows.map(r => h('div', { class: 'rrow ' + (r.won ? 'w' : 'l') },
        h('div', { class: 'rava' }, r.p.avatar_emoji),
        h('div', { class: 'rname' }, h('div', { class: 'n' }, r.p.nickname), h('div', { class: 'was tnum' }, r.was + ' → ' + r.now)),
        h('div', { class: 'right' }, h('div', { class: 'rnew tnum' }, String(r.now)),
          h('span', { class: 'dpill ' + (r.delta >= 0 ? 'up' : 'dn') }, svgSpan(r.delta >= 0 ? 'up' : 'down'), (r.delta >= 0 ? '+' : '') + r.delta)))),
      upsetCard(R),
      R.newTitle ? h('div', { class: 'tframe' }, h('div', { class: 'tcard' },
        h('div', { class: 'ttrophy' }, R.newTitle.tier === 'legendary' ? '🏆' : '🎖️'),
        h('div', { class: 'tmeta' }, h('div', { class: 'rar' }, '◆ ' + R.newTitle.tier + ' · New title unlocked'),
          h('div', { class: 'tt' }, R.newTitle.name),
          h('div', { class: 'ts' }, (R.newTitle.holders || []).map(x => x.nickname).join(' & ') + (R.newTitle.value ? ' — ' + R.newTitle.value : ''))))) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', onClick: () => openShareCard(R) }, h('div', { class: 'in' }, svgSpan('share'), 'Share card')),
        h('button', { class: 'btn prim', onClick: () => navigate('#/') }, h('div', { class: 'in' }, 'Done')))));
}

// Called it before a ball was hit, so say so afterwards. Only shown when the
// side we made favourite actually lost — a correct call needs no announcement.
function upsetCard(R) {
  const o = R.odds;
  if (!o || o.favTeam === R.winner) return null;
  const under = R.winner === 'A' ? R.match.teamA : R.match.teamB;
  return h('div', { class: 'upset sheen' },
    h('div', { class: 'up-t' }, '⚡ UPSET'),
    h('div', { class: 'up-n' }, names(under)),
    h('div', { class: 'up-s' }, 'went in at ' + (100 - o.lead) + '% and won anyway'));
}
/* ------------------------------------------------------------- share card */
// Draws the result as a 1080x1350 poster on a canvas and hands it to the OS
// share sheet (LINE, Slack, anything) with a plain download as the fallback.
// Everything is drawn from primitives — no fonts to wait on beyond the ones the
// page already loaded, and no server round trip.
const CARD_W = 1080, CARD_H = 1350;

function roundRect(g, x, y, w, hh, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + hh, r);
  g.arcTo(x + w, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawShareCard(R) {
  const cv = document.createElement('canvas');
  cv.width = CARD_W; cv.height = CARD_H;
  const g = cv.getContext('2d');
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#57b947';
  const accent2 = getComputedStyle(document.documentElement).getPropertyValue('--accent2').trim() || '#a6e394';

  // backdrop
  const bg = g.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, '#0d1710'); bg.addColorStop(0.55, '#08090c'); bg.addColorStop(1, '#101b0e');
  g.fillStyle = bg; g.fillRect(0, 0, CARD_W, CARD_H);
  const glow = g.createRadialGradient(CARD_W / 2, 430, 40, CARD_W / 2, 430, 620);
  glow.addColorStop(0, accent + '33'); glow.addColorStop(1, 'transparent');
  g.fillStyle = glow; g.fillRect(0, 0, CARD_W, CARD_H);

  const centre = (txt, y, font, fill, spacing) => {
    g.font = font; g.fillStyle = fill; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    if (spacing) {
      const chars = [...txt];
      const total = chars.reduce((s, c) => s + g.measureText(c).width + spacing, -spacing);
      let x = CARD_W / 2 - total / 2;
      for (const c of chars) { g.textAlign = 'left'; g.fillText(c, x, y); x += g.measureText(c).width + spacing; }
      g.textAlign = 'center';
    } else g.fillText(txt, CARD_W / 2, y);
  };
  // Nicknames are free text, so shrink rather than let anything run off the card.
  const fitFont = (txt, maxW, size, weight, family) => {
    let s = size;
    do { g.font = `${weight} ${s}px ${family}`; if (g.measureText(txt).width <= maxW) break; s -= 4; } while (s > 18);
    return g.font;
  };

  // header
  centre('🪿  GOOSEMINTON', 96, '600 34px "Space Grotesk", sans-serif', '#7d8a80', 4);
  const won = R.winner === 'A';
  const winTeam = won ? R.match.teamA : R.match.teamB;
  const headline = (names(winTeam) + (winTeam.length > 1 ? ' WIN' : ' WINS')).toUpperCase();
  centre(headline, 190, fitFont(headline, CARD_W - 120, 62, 900, 'Archivo, sans-serif'), accent2, 2);

  // big score
  const last = R.match.games[R.match.games.length - 1];
  const hi = Math.max(last.a, last.b), lo = Math.min(last.a, last.b);
  g.font = '900 210px Archivo, sans-serif'; g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.shadowColor = accent + 'aa'; g.shadowBlur = 46;
  g.fillText(hi + ' – ' + lo, CARD_W / 2, 400);
  g.shadowBlur = 0;
  centre('BEST OF 3  ·  ' + R.wa + '–' + R.wb + ' GAMES', 456, '600 30px "JetBrains Mono", monospace', '#6f7a72', 3);

  // the two teams
  const teamBlock = (team, y, isWinner) => {
    roundRect(g, 70, y, CARD_W - 140, 172, 28);
    g.fillStyle = isWinner ? accent + '1f' : '#ffffff08'; g.fill();
    g.lineWidth = 3; g.strokeStyle = isWinner ? accent + '99' : '#ffffff14'; g.stroke();
    let x = 122;
    for (const p of team) {
      g.font = '64px "Segoe UI Emoji", sans-serif'; g.textAlign = 'left'; g.fillStyle = '#fff';
      g.fillText(p.avatar_emoji || '🏸', x, y + 108);
      x += 82;
    }
    const tag = isWinner ? 190 : 60;                 // room for the WINNER label
    const nm = names(team);
    g.font = fitFont(nm, CARD_W - 140 - (x - 70) - tag, 46, 800, 'Archivo, sans-serif');
    g.textAlign = 'left'; g.fillStyle = isWinner ? '#fff' : '#9aa79f';
    g.fillText(nm, x + 14, y + 100);
    if (isWinner) {
      g.font = '700 30px "Space Grotesk", sans-serif'; g.textAlign = 'right'; g.fillStyle = accent2;
      g.fillText('WINNER', CARD_W - 112, y + 100);
    }
  };
  teamBlock(R.match.teamA, 530, won);
  centre('VS', 762, '800 38px Archivo, sans-serif', '#5d6a62', 6);
  teamBlock(R.match.teamB, 790, !won);

  // rating swing
  centre('RATING CHANGE', 1030, '700 28px "Space Grotesk", sans-serif', '#6f7a72', 5);
  const rows = R.rows.slice(0, 4);
  const colW = (CARD_W - 140) / rows.length;
  rows.forEach((r, i) => {
    const cx = 70 + colW * i + colW / 2;
    g.textAlign = 'center';
    g.font = '52px "Segoe UI Emoji", sans-serif'; g.fillStyle = '#fff';
    g.fillText(r.p.avatar_emoji || '🏸', cx, 1108);
    g.font = '700 27px "Space Grotesk", sans-serif'; g.fillStyle = '#8b968f';
    g.fillText(r.p.nickname.slice(0, 11), cx, 1150);
    g.font = '900 46px Archivo, sans-serif'; g.fillStyle = r.delta >= 0 ? accent2 : '#ff6b81';
    g.fillText((r.delta >= 0 ? '+' : '') + r.delta, cx, 1205);
    g.font = '600 25px "JetBrains Mono", monospace'; g.fillStyle = '#606b64';
    g.fillText(String(r.now), cx, 1240);
  });

  // footer
  const when = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  centre(when.toUpperCase() + '  ·  your-app.vercel.app', 1300, '600 27px "JetBrains Mono", monospace', '#4e5852', 2);
  g.fillStyle = accent; g.fillRect(0, CARD_H - 10, CARD_W, 10);
  return cv;
}

function openShareCard(R) {
  const cv = drawShareCard(R);
  const img = h('img', { class: 'sharecard', alt: 'Match result card' });
  img.src = cv.toDataURL('image/png');
  const fileName = 'gooseminton-' + new Date().toISOString().slice(0, 10) + '.png';

  const toBlob = () => new Promise((res) => cv.toBlob(res, 'image/png'));
  async function shareIt() {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/png' });
    // canShare must be asked about the actual file — Android lies otherwise
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: shareLine(R) }); return; } catch { return; }
    }
    saveIt(blob);
  }
  function saveIt(blob) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: fileName });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Card saved', 'ok');
  }

  openModal(() => h('div', {},
    h('h2', {}, '📸 Match card'),
    h('div', { class: 'msub' }, 'Save it or send it to the group'),
    img,
    h('div', { class: 'cardacts' },
      h('button', { class: 'btn prim', onClick: shareIt }, h('div', { class: 'in' }, svgSpan('share'), 'Share')),
      h('button', { class: 'btn ghost', onClick: async () => saveIt(await toBlob()) }, h('div', { class: 'in' }, 'Save image')),
      h('button', {
        class: 'btn ghost',
        onClick: () => { navigator.clipboard?.writeText(shareLine(R)); toast('Copied to clipboard', 'ok'); },
      }, h('div', { class: 'in' }, 'Copy text')))));
}

function shareLine(R) {
  const last = R.match.games[R.match.games.length - 1];
  return `${names(R.match.teamA)} ${R.winner === 'A' ? 'beat' : 'lost to'} ${names(R.match.teamB)} `
    + `${Math.max(last.a, last.b)}–${Math.min(last.a, last.b)} — logged on Gooseminton`;
}

function confettiEl() {
  const cols = ['#57b947', '#f6c453', '#37e0a0', '#a6e394', '#b98bff'];
  const c = h('div', { class: 'confetti' });
  for (let i = 0; i < 26; i++) {
    const round = Math.random() > 0.5;
    c.append(h('span', { style: `left:${Math.random() * 100}%;width:${round ? 8 : 5}px;height:${round ? 8 : 12}px;background:${cols[i % cols.length]};${round ? 'border-radius:50%;' : ''}animation-duration:${1.6 + Math.random() * 1.4}s;animation-delay:${Math.random() * .5}s` }));
  }
  return c;
}

/* --------------------------------------------------------- rivalry card */
// The full record between you and one other player, pulled fresh from the
// server so it is never a stale slice of a profile payload.
async function openRivalry(otherId) {
  let d;
  try { d = await api('h2h/' + otherId); }
  catch (e) { toast(e.message, 'err'); return; }

  const v = d.versus, t = d.together;
  const tot = v.played || 1;
  const wPct = Math.round(v.wins / tot * 100);
  const me = state.me;

  const bar = (pct, side, label) => {
    const b = h('div', { class: 'h2hbar ' + side }, h('div', { class: 'f', style: 'width:0%' }), h('div', { class: 'h2hv' }, String(label)));
    requestAnimationFrame(() => { b.querySelector('.f').style.width = pct + '%'; });
    return b;
  };
  const verdict = !v.played ? 'You have never faced each other — go make history.'
    : v.wins > v.losses ? 'You own this matchup 😈'
      : v.wins < v.losses ? 'They have your number 😬'
        : 'Dead even — someone has to break it.';

  const streakChip = () => {
    const c = d.currentStreak;
    if (!c) return null;
    return h('div', { class: 'rv-chip ' + (c > 0 ? 'good' : 'bad') },
      (c > 0 ? '🔥 ' : '🧊 ') + 'On a ' + Math.abs(c) + '-match ' + (c > 0 ? 'win' : 'losing') + ' run');
  };
  const scoreLine = (g) => g.games.map(x => x[0] + '–' + x[1]).join('  ');

  openModal(() => h('div', { class: 'rivalry' },
    h('h2', {}, '⚔️ Rivalry'),
    h('div', { class: 'msub' }, me.nickname + '  vs  ' + d.opponent.nickname),

    h('div', { class: 'h2hhead' },
      h('div', { class: 'h2hp' }, h('div', { class: 'e' }, me.avatar_emoji || '🏸'), h('div', { class: 'n' }, me.nickname)),
      h('div', { class: 'h2hscore tnum' }, v.wins + ' – ' + v.losses),
      h('div', { class: 'h2hp' }, h('div', { class: 'e' }, d.opponent.avatar_emoji || '🏸'), h('div', { class: 'n' }, d.opponent.nickname))),

    v.played ? h('div', { class: 'h2h' },
      h('div', { class: 'h2hrow' }, bar(wPct, 'l', v.wins), h('div', { class: 'h2hk' }, 'WINS'), bar(100 - wPct, 'r', v.losses)),
      h('div', { class: 'h2hrow' }, bar(wPct, 'l', wPct + '%'), h('div', { class: 'h2hk' }, 'WIN RATE'), bar(100 - wPct, 'r', (100 - wPct) + '%')),
      h('div', { class: 'h2hrow' },
        bar(Math.round(v.pointsFor / Math.max(1, v.pointsFor + v.pointsAgainst) * 100), 'l', v.pointsFor),
        h('div', { class: 'h2hk' }, 'POINTS'),
        bar(Math.round(v.pointsAgainst / Math.max(1, v.pointsFor + v.pointsAgainst) * 100), 'r', v.pointsAgainst))) : null,

    streakChip(),

    h('div', { class: 'rv-grid' },
      h('div', { class: 'rv-cell' }, h('div', { class: 'k' }, 'Meetings'), h('div', { class: 'v tnum' }, String(v.played))),
      h('div', { class: 'rv-cell' }, h('div', { class: 'k' }, 'Best run'), h('div', { class: 'v tnum' }, d.bestStreak ? '×' + d.bestStreak : '—')),
      h('div', { class: 'rv-cell' }, h('div', { class: 'k' }, 'As partners'), h('div', { class: 'v tnum' }, t.played ? t.wins + '/' + t.played : '—'))),

    d.biggestWin ? h('div', { class: 'rv-note good' },
      '🏆 Biggest win  ' + scoreLine(d.biggestWin) + '  ·  ' + fmtDay(d.biggestWin.played_at)) : null,
    d.worstLoss ? h('div', { class: 'rv-note bad' },
      '💀 Worst loss  ' + scoreLine(d.worstLoss) + '  ·  ' + fmtDay(d.worstLoss.played_at)) : null,

    d.meetings.length ? h('div', {},
      h('div', { class: 'rv-h' }, 'Recent meetings'),
      h('div', { class: 'rv-list' }, ...d.meetings.slice(0, 8).map(g =>
        h('div', { class: 'rv-row ' + (g.won ? 'w' : 'l') },
          h('div', { class: 'rv-res' }, g.won ? 'W' : 'L'),
          h('div', { class: 'rv-sc tnum' }, scoreLine(g)),
          h('div', { class: 'rv-dt' }, fmtDay(g.played_at)))))) : null,

    h('div', { class: 'h2hnote' }, verdict)));
}
function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/* --------------------------------------------------- title showcase (grand) */
const TIER_ORDER = { legendary: 0, epic: 1, rare: 2, common: 3 };
function titleIcon(t) { return t === 'legendary' ? '🏆' : t === 'epic' ? '🎖️' : t === 'rare' ? '💠' : '●'; }
function dedupeTitles(list) {
  const by = new Map();
  for (const t of (list || [])) {
    const cur = by.get(t.key);
    if (!cur || (TIER_ORDER[t.tier] ?? 9) < (TIER_ORDER[cur.tier] ?? 9)) by.set(t.key, t);
  }
  return [...by.values()].sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) || String(a.name).localeCompare(String(b.name)));
}
function titleCard(t) {
  return h('div', { class: 'tcard tier-' + (t.tier || 'common') + (t.roast ? ' roast' : '') },
    h('div', { class: 'tc-ic' }, titleIcon(t.tier)),
    h('div', { class: 'tc-b' },
      h('div', { class: 'tc-nm' }, t.name),
      t.value ? h('div', { class: 'tc-vl' }, t.value + (t.holder ? ' → ' + t.holder.nickname : '')) : (t.holder ? h('div', { class: 'tc-vl' }, '→ ' + t.holder.nickname) : null),
      t.pool ? rarityChip(t.rarity, t.holderCount, t.pool, t.sole) : null),
    h('div', { class: 'tc-tag' }, t.tier));
}
function nextTier(tier) {
  const i = TIERS.findIndex(t => t.key === tier.key);
  return (i >= 0 && i < TIERS.length - 1) ? TIERS[i + 1] : null;
}
function tierShowcase(tier, data, u, frame = 'auto', wear = 'none') {
  const nx = tier.apex ? null : nextTier(tier);
  return h('div', { class: 'tiershow frame-' + tier.key + (tier.apex ? ' apexshow' : '') },
    h('div', { class: 'ts-av' + frameClass(tier, frame) }, (u && u.avatar_emoji) || '🏸', ...wearParts(wear)),
    h('div', { class: 'ts-body' },
      h('div', { class: 'ts-kick' }, tier.apex ? 'SERVER #1 · UNIQUE' : 'RANK TIER'),
      h('div', { class: 'ts-name' }, (tier.apex ? '👑 ' : '') + tier.name),
      h('div', { class: 'ts-sub' }, 'Rating ' + (data.elo ?? '—') + (data.rank ? ' · Rank #' + data.rank : '')),
      h('div', { class: 'ts-next' }, tier.apex ? 'The only one in the server' : (nx ? 'Next: ' + nx.name + ' at ' + nx.min : 'Top tier reached'))));
}

/* ------------------------------------------------------------------- profile */
function bondCard(kind, person, label, detail, emoji) {
  if (!person) return null;
  return h('button', { class: 'bond ' + kind, onClick: () => navigate('#/p/' + person.id) },
    h('div', { class: 'bond-badge' }, emoji + ' ' + label),
    h('div', { class: 'bond-body' }, h('div', { class: 'bav' }, person.avatar_emoji || '🏸'), h('div', { class: 'bn' }, person.nickname)),
    h('div', { class: 'bond-stat' }, detail));
}
function bondsSection(data) {
  const together = data.together || [], against = data.against || [];
  const ride = together[0] || null;
  const dream = together.filter(x => x.games >= 3).sort((a, b) => b.winrate - a.winrate)[0] || null;
  const victim = against.filter(x => x.wins > x.losses).sort((a, b) => b.wins - a.wins)[0] || null;
  const nem = against.filter(x => x.losses > x.wins).sort((a, b) => b.losses - a.losses)[0] || null;
  const cards = [
    bondCard('ride', ride, 'Ride or Die', ride && (plur(ride.games, 'game') + ' together'), '🤝'),
    bondCard('dream', dream, 'Dream Team', dream && Math.round(dream.winrate * 100) + '% win rate', '💚'),
    bondCard('victim', victim, 'Favorite Victim', victim && ('beaten ' + victim.wins + '×'), '😈'),
    bondCard('nem', nem, 'Nemesis', nem && ('lost ' + nem.losses + '× to them'), '💀'),
  ].filter(Boolean);
  if (!cards.length) return null;
  return h('div', {}, h('div', { class: 'slab' }, h('div', { class: 't' }, '🤝 Bonds & Rivalries')), h('div', { class: 'bonds' }, ...cards));
}
function funFactsStrip(s) {
  if (!s) return null;
  const f = [];
  if (s.longestWin >= 3) f.push('🔥 Best streak ×' + s.longestWin);
  if (s.comebackWins > 0) f.push('🪄 ' + s.comebackWins + ' comeback' + (s.comebackWins > 1 ? 's' : ''));
  if (s.threeGameWins > 0) f.push('🎯 ' + s.threeGameWins + ' decider' + (s.threeGameWins > 1 ? 's' : '') + ' won');
  if (s.nightMatches > 0) f.push('🌙 ' + s.nightMatches + ' night game' + (s.nightMatches > 1 ? 's' : ''));
  if (s.morningMatches > 0) f.push('🌅 ' + s.morningMatches + ' dawn game' + (s.morningMatches > 1 ? 's' : ''));
  if (s.deuceGamesInvolved > 0) f.push('⚡ ' + s.deuceGamesInvolved + ' deuce battle' + (s.deuceGamesInvolved > 1 ? 's' : ''));
  if (s.distinctPartners > 0) f.push('🧑‍🤝‍🧑 ' + s.distinctPartners + ' partner' + (s.distinctPartners > 1 ? 's' : ''));
  if (s.pointsFor > 0) f.push('🎾 ' + s.pointsFor.toLocaleString() + ' pts won');
  if (!f.length) return null;
  return h('div', {}, h('div', { class: 'slab' }, h('div', { class: 't' }, '✨ Fun facts')), h('div', { class: 'funfacts' }, ...f.map(t => h('span', { class: 'ff' }, t))));
}
async function viewProfile(mount, id) {
  const isMe = id === state.me.id;
  const data = await api('profile/' + id);
  const u = data.user;
  const withYou = !isMe ? {
    partner: (data.together || []).find(x => x.id === state.me.id),
    against: (data.against || []).find(x => x.id === state.me.id),
  } : null;
  const topPartners = (data.together || []).slice(0, 3);
  const tier = data.elo != null ? tierFor(data.elo, data.rank, data.stats.matches) : null;
  const cos = data.cosmetics || { frame: 'auto', card: 'none' };
  const heldTitles = dedupeTitles(data.titles);
  const personalT = data.personalTitles || [];
  const titleCount = heldTitles.length + personalT.length;

  setKids(mount,
    backNav(isMe ? 'Your Profile' : 'Player Profile', isMe ? h('button', { class: 'icnbtn', html: ICON.gear, onClick: openSettings }) : null),
    h('div', { class: 'shell' }, h('div', { class: 'hero' + (cos.card && cos.card !== 'none' ? ' hascard cb-' + cos.card : '') },
      h('div', { class: 'head' }, avatar(u, 'ava', tier, cos.frame),
        h('div', { class: 'who' },         h('div', { class: 'rankrow' }, h('span', { class: 'nm' }, u.nickname), data.rank ? h('span', { class: 'pill rk' }, '#' + data.rank) : null,
          data.memberNo ? h('span', { class: 'pill mno', title: 'Join order — never changes' }, '🪺 #' + data.memberNo) : null),
          h('div', { class: 'subwrap' }, h('span', { class: 'pill rt' }, 'RATING ' + (data.elo ?? 1500)), data.provisional ? h('span', { class: 'pill prov' }, 'PROVISIONAL') : null,
            isMe
              ? h('button', { class: 'badgetap', title: 'Change your title', onClick: () => openBadgePicker(data) }, nameBadge(data.badge, tier))
              : nameBadge(data.badge, tier))),
        withYou ? h('div', { class: 'ratingblock' }, h('div', { class: 'lab' }, 'vs You'), h('div', { class: 'val tnum', style: 'font-size:30px' }, withYou.against ? (withYou.against.losses + '–' + withYou.against.wins) : '0–0')) : null),
      h('div', { class: 'stats' },
        stat(data.stats.wins, 'Wins'), stat(data.stats.losses, 'Losses'),
        stat(Math.round(data.stats.winrate * 100) + '%', 'Winrate', 'g'), stat(streakStr(data.stats.currentStreak), 'Streak', 'o')))),

    isMe ? h('button', { class: 'btn ghost custbtn', onClick: () => openBadgePicker(data) },
      h('div', { class: 'in' }, '🏷️ Choose your title')) : null,

    isMe ? h('button', { class: 'btn ghost custbtn', onClick: () => navigate('#/shop') },
      h('div', { class: 'in' }, '🎨 Customize & shop')) : null,

    !isMe ? h('button', {
      class: 'btn ghost custbtn', onClick: () => openRivalry(id),
    }, h('div', { class: 'in' }, '⚔️ Rivalry vs you')) : null,

    h('button', { class: 'btn ghost custbtn', onClick: () => navigate('#/ach/' + id) },
      h('div', { class: 'in' }, '🏆 Achievements & milestones')),

    data.eloHistory && data.eloHistory.length > 2 ? h('div', { class: 'trendcard' },
      h('div', { class: 'slab' }, h('div', { class: 't' }, '📉 Rating journey'), h('div', { class: 'm tnum' }, plur(data.eloHistory.length, 'match'))),
      sparkline(data.eloHistory, { w: 320, h: 74 }),
      h('div', { class: 'trendfoot tnum' },
        h('span', {}, 'start ' + data.eloHistory[0]),
        h('span', { class: 'pk' }, 'peak ' + Math.max(...data.eloHistory)),
        h('span', {}, 'now ' + data.eloHistory[data.eloHistory.length - 1]))) : null,

    (tier || titleCount) ? h('div', { class: 'titlesec' },
      h('div', { class: 'slab' }, h('div', { class: 't' }, '🏅 Titles & Rank'), titleCount ? h('div', { class: 'm' }, titleCount + ' earned') : null),
      tier ? tierShowcase(tier, data, u, cos.frame, cos.wear) : null,
      heldTitles.length ? h('div', { class: 'tgrid' }, ...heldTitles.map(titleCard)) : null,
      personalT.length ? h('div', { class: 'tgrid' }, ...personalT.map(titleCard)) : null,
      !titleCount ? h('div', { class: 'subtle', style: 'margin:8px 4px 2px' }, 'No titles yet — keep playing to earn them.') : null) : null,

    withYou ? h('div', {}, h('div', { class: 'slab' }, h('div', { class: 't' }, 'History with you')),
      h('div', { class: 'two' },
        h('div', { class: 'mcard' }, h('div', { class: 'h' }, 'Together'), h('div', { class: 'bigscore', style: 'font-size:34px;color:var(--win)' }, withYou.partner ? Math.round(withYou.partner.winrate * 100) + '%' : '—'), h('div', { class: 'subtle', style: 'font-size:11px' }, withYou.partner ? withYou.partner.wins + 'W in ' + withYou.partner.games + ' as partners' : 'never partnered')),
        h('div', { class: 'mcard' }, h('div', { class: 'h' }, 'Against'), h('div', { class: 'bigscore', style: 'font-size:34px' }, withYou.against ? (withYou.against.losses + '–' + withYou.against.wins) : '—'), h('div', { class: 'subtle', style: 'font-size:11px' }, 'your record vs them')))) : null,

    bondsSection(data),
    funFactsStrip(data.stats),

    topPartners.length ? h('div', {}, h('div', { class: 'slab' }, h('div', { class: 't' }, u.nickname + '’s top partners')),
      h('div', { class: 'mcard' }, ...topPartners.map(p => h('button', { class: 'prow', style: 'width:100%;background:none', onClick: () => navigate('#/p/' + p.id) },
        h('div', { class: 'pav' }, p.avatar_emoji), h('div', { class: 'pn' }, p.nickname), h('div', { class: 'pv ' + (p.winrate >= .5 ? 'g' : 'r') + ' tnum' }, Math.round(p.winrate * 100) + '%'))))) : null,

    h('div', {}, h('div', { class: 'slab' }, h('div', { class: 't' }, 'Recent matches')),
      data.recent && data.recent.length ? h('div', {}, ...data.recent.map(matchRow)) : h('div', { class: 'empty' }, 'No matches yet')));
}

/* -------------------------------------------------------------- achievements */
const ACH_TIERS = ['legendary', 'epic', 'rare', 'common', 'bronze'];
const TIER_LABEL = { legendary: '🏆 Legendary', epic: '🎖️ Epic', rare: '💎 Rare', common: '● Common', bronze: '● Common' };

// Rarity read, card-game style. A percentage only means something when many
// players CAN hold a thing — a Mythic is structurally one-holder-only, so
// "17% have this" was just 1-in-6 dressed up as a stat. Sole-holder awards say
// so instead, and only milestones get a real percentage.
function rarityChip(rarity, holders, pool, sole) {
  if (!pool) return null;
  if (sole) {
    return holders
      ? h('div', { class: 'rchip r-sole' }, '👑 Sole holder · 1 of ' + pool)
      : h('div', { class: 'rchip r-none' }, 'Unclaimed · first to earn it keeps it');
  }
  const pct = (rarity || 0) * 100;
  const band = pct <= 0 ? 'none' : pct < 10 ? 'myth' : pct < 25 ? 'leg' : pct < 50 ? 'epic' : pct < 75 ? 'rare' : 'common';
  const txt = pct <= 0 ? 'Nobody yet' : pct < 1 ? '<1% have this' : Math.round(pct) + '% have this';
  return h('div', { class: 'rchip r-' + band, title: holders + ' of ' + pool + ' players' }, txt);
}

async function viewAchievements(mount, id) {
  const [data, prof] = await Promise.all([api('achievements/' + id), api('profile/' + id)]);
  const u = prof.user;
  const isMe = id === state.me.id;
  let filter = 'all';
  let tierPick = 'all';
  const grid = h('div', {});
  const pctAll = data.total ? Math.round(data.unlocked / data.total * 100) : 0;
  const myths = data.mythics || [];
  const held = myths.filter(m => m.mine).length;

  function card(a, i) {
    return h('div', {
      class: 'achcard t-' + (a.tier || 'bronze') + (a.unlocked ? ' done' : '') + (a.roast ? ' roast' : '') + ' rise',
      style: '--d:' + Math.min(i * 16, 320) + 'ms',
    },
      h('div', { class: 'achtop' },
        h('div', { class: 'achname' }, a.name),
        a.unlocked ? h('div', { class: 'achok' }, '✓') : h('div', { class: 'achpc tnum' }, a.pct + '%')),
      a.label ? h('div', { class: 'achlab' }, a.label) : null,
      h('div', { class: 'achbar' }, h('div', { class: 'fill', style: 'width:' + a.pct + '%' })),
      h('div', { class: 'achfoot' },
        h('div', { class: 'achnum tnum' }, fmtNum(a.current) + ' / ' + fmtNum(a.min)),
        rarityChip(a.rarity, a.holders, a.pool)));
  }

  function draw() {
    let rows = data.achievements;
    if (filter === 'unlocked') rows = rows.filter(a => a.unlocked);
    else if (filter === 'progress') rows = rows.filter(a => !a.unlocked);
    if (tierPick !== 'all') rows = rows.filter(a => (a.tier || 'bronze') === tierPick);
    if (!rows.length) { grid.replaceChildren(h('div', { class: 'empty' }, 'Nothing here yet.')); return; }
    // group by rarity, rarest first
    const byTier = new Map();
    for (const a of rows) {
      const t = a.tier || 'bronze';
      if (!byTier.has(t)) byTier.set(t, []);
      byTier.get(t).push(a);
    }
    const blocks = [];
    for (const t of ACH_TIERS) {
      const list = byTier.get(t);
      if (!list || !list.length) continue;
      const done = list.filter(a => a.unlocked).length;
      blocks.push(h('div', { class: 'tierhead t-' + t },
        h('div', { class: 'th-n' }, TIER_LABEL[t] || t),
        h('div', { class: 'th-c tnum' }, done + '/' + list.length)));
      blocks.push(h('div', { class: 'achgrid' }, ...list.map(card)));
    }
    grid.replaceChildren(...blocks);
  }

  const seg = h('div', { class: 'seg' },
    h('button', { class: 's on', onClick: (e) => { filter = 'all'; segSel(seg, e.target); draw(); } }, 'All'),
    h('button', { class: 's', onClick: (e) => { filter = 'unlocked'; segSel(seg, e.target); draw(); } }, 'Unlocked'),
    h('button', { class: 's', onClick: (e) => { filter = 'progress'; segSel(seg, e.target); draw(); } }, 'In progress'));

  const tierChips = h('div', { class: 'tierchips' },
    ...[['all', 'All tiers'], ['legendary', '🏆 Legendary'], ['epic', '🎖️ Epic'], ['rare', '💎 Rare'], ['common', '● Common']]
      .map(([k, lbl]) => h('button', {
        class: 'tchip' + (tierPick === k ? ' on' : ''),
        onClick: (e) => { tierPick = k; [...tierChips.children].forEach(c => c.classList.remove('on')); e.target.classList.add('on'); draw(); },
      }, lbl)));

  // --- the mythic vault: 7 secrets, one holder each ---
  const vault = h('div', { class: 'vault' },
    h('div', { class: 'vaulthead' },
      h('div', { class: 'vh-t' }, '🔮 MYTHIC VAULT'),
      h('div', { class: 'vh-s tnum' }, held + '/' + myths.length + ' held')),
    h('div', { class: 'vh-note' }, isMe
      ? 'One holder each. Nobody is told how these are earned.'
      : 'Secret achievements. Only one player can hold each.'),
    h('div', { class: 'vgrid' }, ...myths.map((m, i) => h('div', {
      class: 'vcard' + (m.mine ? ' mine' : m.claimed ? ' taken' : ' locked'),
      style: '--d:' + (i * 40) + 'ms',
    },
      h('div', { class: 'vc-ic' }, m.mine ? m.icon : '🔒'),
      h('div', { class: 'vc-b' },
        h('div', { class: 'vc-n' }, m.name),
        h('div', { class: 'vc-h' }, m.detail),
        rarityChip(m.rarity, m.holders, m.pool, true)),
      m.mine
        ? h('div', { class: 'vc-tag me' }, 'HELD BY YOU')
        : m.claimed ? h('div', { class: 'vc-tag' }, m.holder) : h('div', { class: 'vc-tag none' }, 'UNCLAIMED')))));

  draw();
  setKids(mount,
    backNav(isMe ? 'Your Achievements' : u.nickname + '’s Achievements'),
    h('div', { class: 'achhero' },
      h('div', { class: 'achring', style: '--p:' + pctAll }, h('div', { class: 'inr' }, h('div', { class: 'big tnum' }, String(data.unlocked)), h('div', { class: 'sm tnum' }, 'of ' + data.total))),
      h('div', { class: 'achmeta' }, h('div', { class: 'ttl' }, '🏆 Milestones'),
        h('div', { class: 'subtle' }, pctAll + '% complete · every one hides a roast or a flex'),
        data.memberNo ? h('div', { class: 'memno' }, '🪺 Member #' + data.memberNo + ' of ' + data.memberTotal) : null)),
    vault, seg, tierChips, grid);
}
function fmtNum(n) { return n >= 1000 ? (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k' : String(n); }
function plur(n, w) {
  const s = /(ch|sh|s|x|z)$/.test(w) ? 'es' : 's';
  return n + ' ' + w + (n === 1 ? '' : s);
}

/* ----------------------------------------------------------------------- map */
function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(87,185,71,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
async function viewMap(mount) {
  const data = await api('map');
  mount.replaceChildren(
    h('div', { class: 'pagehead withact' }, h('h1', {}, 'Relationship Map'),
      h('div', { class: 'subtle' }, 'Living web of the club · drag to move · tap a bubble for details'),
      h('div', { class: 'phact' }, menuBtn())));
  if (!data.nodes.length) { mount.append(h('div', { class: 'empty' }, 'Log some matches to grow the map.')); return; }
  const canvas = h('canvas', { id: 'mapcanvas' });
  const filter = h('div', { class: 'seg mapseg' },
    h('button', { class: 's on', dataset: { f: 'all' } }, 'All'),
    h('button', { class: 's', dataset: { f: 'partner' } }, '🟢 Duos'),
    h('button', { class: 's', dataset: { f: 'rival' } }, '🔴 Rivals'));
  const shuffle = h('button', { class: 'mapbtn' }, '🎲 Shuffle');
  const zoomIn = h('button', { class: 'zbtn' }, '+');
  const zoomOut = h('button', { class: 'zbtn' }, '−');
  const zoomReset = h('button', { class: 'zbtn r' }, '⤢');
  const chip = h('div', { class: 'mapchip', hidden: true });
  const wrap = h('div', { class: 'mapwrap' }, canvas, h('div', { class: 'mapctrl' }, filter, shuffle),
    h('div', { class: 'zoomctrl' }, zoomIn, zoomOut, zoomReset), chip);
  mount.append(wrap, h('div', { class: 'legend' },
    h('div', { class: 'l' }, h('span', { class: 'ln p' }), 'Partners'),
    h('div', { class: 'l' }, h('span', { class: 'ln r' }), 'Rivals'),
    h('div', { class: 'l' }, h('span', { class: 'ln y' }), 'You')),
    h('div', { class: 'subtle', style: 'text-align:center;margin-top:6px;font-size:11px' },
      'Scroll or pinch to zoom · drag empty space to pan · double-tap to zoom in'));
  requestAnimationFrame(() => drawMap(canvas, data, { filter, shuffle, chip, zoomIn, zoomOut, zoomReset }));
}
function drawMap(canvas, data, ui) {
  const W = canvas.clientWidth || 420, H = Math.round(W * 1.04);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cx = W / 2, cy = H / 2;
  // constellation viewport: zoom anchors on whatever point you pinch/scroll over
  const view = { k: 1, tx: 0, ty: 0 };
  const MINK = 0.45, MAXK = 6;
  const worldT = () => ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.tx, dpr * view.ty);
  const screenT = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const toWorld = (sx, sy) => ({ x: (sx - view.tx) / view.k, y: (sy - view.ty) / view.k });
  function zoomAt(sx, sy, factor) {
    const k2 = Math.max(MINK, Math.min(MAXK, view.k * factor));
    if (k2 === view.k) return;
    // keep the world point under the cursor pinned to the cursor
    view.tx = sx - (sx - view.tx) * (k2 / view.k);
    view.ty = sy - (sy - view.ty) * (k2 / view.k);
    view.k = k2;
    if (reduce) draw();
  }
  // twinkling background stars, fixed to the canvas (parallax-free depth)
  const stars = Array.from({ length: 90 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: 0.4 + Math.random() * 1.3, ph: Math.random() * 6.283, sp: 0.4 + Math.random() * 1.6,
  }));

  const nodes = data.nodes.map(n => ({
    ...n, r: 14 + Math.min(15, n.matches * 0.9),
    x: 0, y: 0, vx: 0, vy: 0, phase: Math.random() * 6.283, fixed: false,
  }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const edges = data.edges.map(e => ({
    a: byId.get(e.a), b: byId.get(e.b), type: e.type,
    w: e.type === 'partner' ? (e.wins || 1) : (e.meetings || 1),
    games: e.games || e.meetings || 1, dash: Math.random() * 40,
  })).filter(e => e.a && e.b);
  const adj = new Map(nodes.map(n => [n.id, { partners: [], rivals: [] }]));
  for (const e of edges) {
    const key = e.type === 'partner' ? 'partners' : 'rivals';
    adj.get(e.a.id)[key].push({ other: e.b, w: e.w, games: e.games });
    adj.get(e.b.id)[key].push({ other: e.a, w: e.w, games: e.games });
  }
  // A pair can be BOTH duo and rivals — those two lines land on the exact same
  // path and hide each other. Give each a perpendicular offset so both read.
  const EDGE_GAP = 5.5;
  const pairKey = (e) => (e.a.id < e.b.id ? e.a.id + '|' + e.b.id : e.b.id + '|' + e.a.id);
  const pairTypes = new Map();
  for (const e of edges) {
    if (!pairTypes.has(pairKey(e))) pairTypes.set(pairKey(e), new Set());
    pairTypes.get(pairKey(e)).add(e.type);
  }
  for (const e of edges) {
    e.off = pairTypes.get(pairKey(e)).size > 1 ? (e.type === 'partner' ? -EDGE_GAP : EDGE_GAP) : 0;
  }

  function scatter() {
    nodes.forEach((n, i) => {
      const ang = i / nodes.length * 6.283 + Math.random() * 0.5;
      const rad = (0.24 + Math.random() * 0.13) * Math.min(W, H);
      n.x = cx + Math.cos(ang) * rad; n.y = cy + Math.sin(ang) * rad;
      n.vx = (Math.random() - 0.5) * 7; n.vy = (Math.random() - 0.5) * 7;
    });
  }
  scatter();

  let filterMode = 'all', selected = null, t = 0;
  const vis = (e) => filterMode === 'all' || e.type === filterMode;
  const connected = (sid, nid) => {
    if (sid === nid) return true; const a = adj.get(sid); if (!a) return false;
    return a.partners.some(x => x.other.id === nid) || a.rivals.some(x => x.other.id === nid);
  };

  function step() {
    t++;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy || 0.01, d = Math.sqrt(d2);
      const rep = 3800 / d2, fx = dx / d * rep, fy = dy / d * rep;
      if (!a.fixed) { a.vx += fx; a.vy += fy; } if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
    }
    for (const e of edges) {
      if (!vis(e)) continue;
      let dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.hypot(dx, dy) || 0.01;
      const rest = e.type === 'partner' ? 72 : 132, k = e.type === 'partner' ? 0.022 : 0.008;
      const f = (d - rest) * k, fx = dx / d * f, fy = dy / d * f;
      if (!e.a.fixed) { e.a.vx += fx; e.a.vy += fy; } if (!e.b.fixed) { e.b.vx -= fx; e.b.vy -= fy; }
    }
    for (const n of nodes) {
      if (n.fixed) continue;
      n.vx += (cx - n.x) * 0.008; n.vy += (cy - n.y) * 0.008;
      n.vx += Math.cos(t * 0.02 + n.phase) * 0.07;          // organic bubble drift
      n.vy += Math.sin(t * 0.02 + n.phase * 1.3) * 0.07;
      n.x += n.vx * 0.5; n.y += n.vy * 0.5; n.vx *= 0.86; n.vy *= 0.86;
      n.x = Math.max(n.r + 8, Math.min(W - n.r - 8, n.x));
      n.y = Math.max(n.r + 8, Math.min(H - n.r - 26, n.y));
    }
  }

  function draw() {
    screenT();
    ctx.clearRect(0, 0, W, H);
    // deep-space wash + twinkling stars (screen space, so zoom feels like depth)
    const sky = ctx.createRadialGradient(cx, cy * 0.8, 10, cx, cy, Math.max(W, H) * 0.75);
    sky.addColorStop(0, 'rgba(30,40,70,0.30)');
    sky.addColorStop(1, 'rgba(4,6,12,0)');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.02 * s.sp + s.ph));
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283);
      ctx.fillStyle = `rgba(200,220,255,${(0.5 * tw).toFixed(3)})`; ctx.fill();
    }
    // drifting nebula orbs
    for (let i = 0; i < 6; i++) {
      const px = ((i * 0.19 + t * 0.0004 * (i % 2 ? 1 : -1)) % 1 + 1) % 1 * W;
      const py = (0.14 + 0.14 * i + 0.03 * Math.sin(t * 0.012 + i)) * H;
      ctx.beginPath(); ctx.arc(px, py, 22 + i * 7, 0, 6.283);
      ctx.fillStyle = i % 2 ? 'rgba(87,185,71,0.028)' : 'rgba(90,200,250,0.022)'; ctx.fill();
    }
    worldT();
    // edges — glowing gradient with flowing dashes + traveling energy pulse
    for (const e of edges) {
      if (!vis(e)) continue;
      const isP = e.type === 'partner';
      const dim = selected && e.a.id !== selected && e.b.id !== selected;
      // perpendicular offset keeps a duo line and a rivalry line side by side
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ox = (-dy / len) * e.off, oy = (dx / len) * e.off;
      const ax = e.a.x + ox, ay = e.a.y + oy, bx = e.b.x + ox, by = e.b.y + oy;
      const g = ctx.createLinearGradient(ax, ay, bx, by);
      if (isP) { g.addColorStop(0, 'rgba(60,240,170,1)'); g.addColorStop(1, 'rgba(150,255,175,1)'); }
      else { g.addColorStop(0, 'rgba(255,80,110,1)'); g.addColorStop(1, 'rgba(255,165,95,1)'); }
      ctx.save();
      ctx.globalAlpha = dim ? 0.14 : 1;
      ctx.strokeStyle = g;
      ctx.lineWidth = isP ? Math.min(7, 2.4 + e.w * 0.6) : Math.min(6, 2.1 + e.w * 0.5);
      ctx.lineCap = 'round';
      ctx.shadowColor = isP ? 'rgba(60,240,170,.95)' : 'rgba(255,80,110,.95)';
      ctx.shadowBlur = dim ? 0 : (isP ? 16 : 14);
      ctx.setLineDash([7, 9]); ctx.lineDashOffset = -(t * 0.9 + e.dash) * (isP ? 1 : 0.6);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      if (!dim) {
        const fp = ((t * 0.01 + e.dash * 0.03) % 1 + 1) % 1;
        const px = ax + (bx - ax) * fp, py = ay + (by - ay) * fp;
        ctx.setLineDash([]); ctx.beginPath(); ctx.arc(px, py, isP ? 3 : 2.4, 0, 6.283);
        ctx.fillStyle = isP ? '#d8ffe8' : '#ffdcc8'; ctx.shadowBlur = 12; ctx.fill();
      }
      ctx.restore();
    }
    // nodes — glossy pulsing bubbles
    for (const n of nodes) {
      const me = n.id === state.me.id;
      const isSel = selected === n.id;
      const dim = selected && !isSel && !connected(selected, n.id);
      const rr = n.r * (1 + 0.06 * Math.sin(t * 0.06 + n.phase));
      const col = me ? '#ff6a2c' : (n.avatar_color || '#57b947');
      ctx.save();
      ctx.globalAlpha = dim ? 0.26 : 1;
      // glow halo
      ctx.beginPath(); ctx.arc(n.x, n.y, rr + 5, 0, 6.283);
      ctx.strokeStyle = hexA(col, me ? 0.9 : 0.55); ctx.lineWidth = me ? 3 : 2;
      ctx.shadowColor = col; ctx.shadowBlur = me ? 22 : (isSel ? 20 : 12); ctx.stroke();
      ctx.shadowBlur = 0;
      // bubble body
      const bg = ctx.createRadialGradient(n.x - rr * 0.34, n.y - rr * 0.4, rr * 0.1, n.x, n.y, rr);
      bg.addColorStop(0, '#232a38'); bg.addColorStop(1, '#12151c');
      ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, 6.283); ctx.fillStyle = bg; ctx.fill();
      ctx.lineWidth = me ? 3 : 2; ctx.strokeStyle = col; ctx.stroke();
      // gloss highlight
      ctx.beginPath(); ctx.arc(n.x - rr * 0.3, n.y - rr * 0.34, rr * 0.42, 0, 6.283);
      ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill();
      // emoji + label
      ctx.font = `${Math.round(rr * 1.02)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(n.avatar_emoji || '🏸', n.x, n.y + 1);
      ctx.font = '700 10px JetBrains Mono, monospace'; ctx.textBaseline = 'top';
      ctx.fillStyle = me ? '#ffb38a' : '#aab0bb';
      ctx.fillText(n.nickname.slice(0, 11), n.x, n.y + rr + 4);
      if (me) { ctx.font = '800 8px JetBrains Mono, monospace'; ctx.fillStyle = '#ff6a2c'; ctx.textBaseline = 'bottom'; ctx.fillText('YOU', n.x, n.y - rr - 3); }
      ctx.restore();
    }
  }

  function renderChip(n) {
    if (!n) { ui.chip.hidden = true; ui.chip.replaceChildren(); return; }
    const a = adj.get(n.id) || { partners: [], rivals: [] };
    const topP = a.partners.slice().sort((x, y) => y.games - x.games)[0];
    const topR = a.rivals.slice().sort((x, y) => y.w - x.w)[0];
    ui.chip.hidden = false;
    setKids(ui.chip,
      h('button', { class: 'mc-x', onClick: () => selectNode(null) }, '✕'),
      h('div', { class: 'mc-hd' },
        h('div', { class: 'mc-av', style: `border-color:${n.avatar_color || '#57b947'}` }, n.avatar_emoji || '🏸'),
        h('div', { style: 'min-width:0' },
          h('div', { class: 'mc-nm' }, n.nickname),
          h('div', { class: 'mc-sub' }, 'Rating ' + (n.elo ?? 1500) + ' · ' + n.matches + ' matches'))),
      h('div', { class: 'mc-rows' },
        h('div', { class: 'mc-r' }, h('span', { class: 'k' }, '🟢 Top partner'), h('span', { class: 'v' }, topP ? topP.other.nickname : '—')),
        h('div', { class: 'mc-r' }, h('span', { class: 'k' }, '🔴 Biggest rival'), h('span', { class: 'v' }, topR ? topR.other.nickname : '—')),
        h('div', { class: 'mc-r' }, h('span', { class: 'k' }, '🤝 Partners · Rivals'), h('span', { class: 'v' }, a.partners.length + ' · ' + a.rivals.length))),
      h('button', { class: 'mc-go', onClick: () => navigate('#/p/' + n.id) }, 'Open profile →'));
  }
  function selectNode(n) { selected = n ? n.id : null; renderChip(n); if (reduce) draw(); }

  // ---- interaction: drag to move, tap for details ----
  const rawPt = (ev) => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const ptOf = (ev) => { const s = rawPt(ev); return toWorld(s.x, s.y); };
  const nodeAt = (mx, my) => { let hit = null; for (const n of nodes) if ((mx - n.x) ** 2 + (my - n.y) ** 2 <= (n.r + 7) ** 2) hit = n; return hit; };
  let drag = null, downPt = null, moved = false, pan = null;
  const pointers = new Map();
  let pinch = null;

  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const s = rawPt(ev);
    zoomAt(s.x, s.y, ev.deltaY < 0 ? 1.14 : 1 / 1.14);
  }, { passive: false });

  canvas.addEventListener('pointerdown', (ev) => {
    pointers.set(ev.pointerId, rawPt(ev));
    if (pointers.size === 2) {                       // start pinch
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      drag = null; pan = null;
      return;
    }
    const p = ptOf(ev); downPt = p; moved = false;
    const n = nodeAt(p.x, p.y);
    if (n) { drag = n; n.fixed = true; try { canvas.setPointerCapture(ev.pointerId); } catch {} }
    else { pan = { sx: rawPt(ev).x, sy: rawPt(ev).y, tx: view.tx, ty: view.ty }; }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, rawPt(ev));
    if (pinch && pointers.size >= 2) {                // pinch-zoom about the midpoint
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinch.d > 0) zoomAt(mid.x, mid.y, d / pinch.d);
      pinch = { d, cx: mid.x, cy: mid.y };
      return;
    }
    if (pan) {
      const s = rawPt(ev);
      if (Math.hypot(s.x - pan.sx, s.y - pan.sy) > 3) moved = true;
      view.tx = pan.tx + (s.x - pan.sx);
      view.ty = pan.ty + (s.y - pan.sy);
      if (reduce) draw();
      return;
    }
    if (!drag) return; const p = ptOf(ev);
    if (Math.hypot(p.x - downPt.x, p.y - downPt.y) > 4) moved = true;
    drag.x = p.x; drag.y = p.y; drag.vx = 0; drag.vy = 0;
    if (reduce) draw();
  });
  canvas.addEventListener('pointerup', (ev) => {
    const p = ptOf(ev);
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag) { drag.fixed = false; if (!moved) selectNode(drag); drag = null; }
    else if (pan) { pan = null; if (!moved) selectNode(null); }
    else if (downPt && !moved && !nodeAt(p.x, p.y)) selectNode(null);
    downPt = null;
  });
  canvas.addEventListener('pointercancel', (ev) => {
    pointers.delete(ev.pointerId); pinch = null; pan = null;
    if (drag) { drag.fixed = false; drag = null; } downPt = null;
  });

  ui.zoomIn.addEventListener('click', () => zoomAt(W / 2, H / 2, 1.35));
  ui.zoomOut.addEventListener('click', () => zoomAt(W / 2, H / 2, 1 / 1.35));
  ui.zoomReset.addEventListener('click', () => { view.k = 1; view.tx = 0; view.ty = 0; if (reduce) draw(); });
  // double-tap / double-click zooms into that exact spot
  canvas.addEventListener('dblclick', (ev) => { const s = rawPt(ev); zoomAt(s.x, s.y, 1.8); });

  ui.filter.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-f]'); if (!b) return;
    filterMode = b.dataset.f;
    [...ui.filter.children].forEach(c => c.classList.toggle('on', c === b));
    if (reduce) draw();
  });
  ui.shuffle.addEventListener('click', () => { scatter(); selectNode(null); if (reduce) { for (let i = 0; i < 220; i++) step(); draw(); } });

  if (reduce) { for (let i = 0; i < 260; i++) step(); draw(); }
  else (function loop() { if (!canvas.isConnected) return; step(); draw(); requestAnimationFrame(loop); })();
}

/* -------------------------------------------------------------------- titles */
async function viewTitles(mount) {
  const data = await api('titles');
  mount.replaceChildren(h('div', { class: 'pagehead withact' }, h('h1', {}, 'Hall of Fame'), h('div', { class: 'subtle' }, data.titles.length + ' titles currently held · earned, never random'), h('div', { class: 'phact' }, menuBtn())));
  if (!data.titles.length) { mount.append(h('div', { class: 'empty' }, 'No titles awarded yet.')); return; }
  mount.append(h('div', { class: 'thall' }, ...data.titles.map(t => h('div', { class: 'trow ' + t.tier },
    h('div', { class: 'tt' }, t.tier === 'legendary' ? '🏆' : t.tier === 'epic' ? '🎖️' : t.tier === 'rare' ? '💎' : '●'),
    h('div', { class: 'ti' }, h('div', { class: 'nm' }, t.name),
      h('div', { class: 'who' }, (t.holders || []).map(x => x.nickname).join(' & ') || '—'),
      t.alias ? h('div', { class: 'al' }, t.alias + ' · ' + t.scope) : h('div', { class: 'al' }, t.scope)),
    h('div', { class: 'tv' }, t.value || '')))));
}

/* --------------------------------------------------------------------- admin */
async function viewAdmin(mount) {
  if (!state.me || state.me.role !== 'admin') { mount.replaceChildren(h('div', { class: 'empty' }, 'Admins only.')); return; }
  let tab = 'flags';
  const body = h('div', {});
  const seg = h('div', { class: 'seg' },
    h('button', { class: 's on', onClick: (e) => { tab = 'flags'; segSel(seg, e.target); load(); } }, 'Flags'),
    h('button', { class: 's', onClick: (e) => { tab = 'claims'; segSel(seg, e.target); load(); } }, 'Claims'),
    h('button', { class: 's', onClick: (e) => { tab = 'matches'; segSel(seg, e.target); load(); } }, 'Matches'),
    h('button', { class: 's', onClick: (e) => { tab = 'players'; segSel(seg, e.target); load(); } }, 'Players'),
    h('button', { class: 's', onClick: (e) => { tab = 'audit'; segSel(seg, e.target); load(); } }, 'Audit log'));
  async function load() {
    body.replaceChildren(h('div', { class: 'empty' }, 'Loading…'));
    if (tab === 'flags') return loadFlags();
    if (tab === 'claims') return loadClaims();
    if (tab === 'matches') return loadMatches();
    if (tab === 'players') return loadPlayers();
    return loadAudit();
  }
  async function loadFlags() {
    const { flags } = await api('admin/flags?status=open');
    if (!flags.length) { body.replaceChildren(h('div', { class: 'empty' }, 'No open flags. All clear ✔')); return; }
    body.replaceChildren(...flags.map(f => {
      const m = f.match;
      return h('div', { class: 'qcard' },
        h('div', { class: 'fh' }, svgSpan('flag'), 'Flagged score' + (f.raised_by ? ' · by ' + f.raised_by.nickname : '')),
        m ? h('div', { class: 'p', style: 'font-size:13px' }, h('b', {}, names(m.teamA)), ' vs ', names(m.teamB), '  ', h('span', { class: 'tnum', style: 'color:var(--mut)' }, (m.games || []).map(g => g.score_a + '–' + g.score_b).join(', '))) : null,
        f.reason ? h('div', { class: 'subtle', style: 'font-size:12px;margin-top:6px' }, '“' + f.reason + '”' + (f.claimed_score ? ' · claims ' + f.claimed_score : '')) : null,
        h('div', { class: 'arow' },
          m ? h('button', { class: 'abtn edit', onClick: () => editMatchDialog(m, load) }, 'Edit scores') : null,
          m ? h('button', { class: 'abtn void', onClick: () => voidMatchDialog(m, load) }, 'Void match') : null,
          h('button', { class: 'abtn ok', onClick: async () => { await api('admin/flags/' + f.id + '/resolve', { method: 'POST', body: { action: 'dismiss' } }); toast('Flag dismissed', 'ok'); load(); } }, 'Dismiss')));
    }));
  }
  async function loadMatches() {
    const { matches } = await api('matches?limit=50');
    const resetBtn = h('button', { class: 'btn danger', style: 'margin-bottom:12px', onClick: () => resetAllDialog(load) }, h('div', { class: 'in' }, '⚠ Reset all scores'));
    if (!matches.length) { body.replaceChildren(resetBtn, h('div', { class: 'empty' }, 'No matches logged yet.')); return; }
    body.replaceChildren(resetBtn, ...matches.map(m => h('div', { class: 'qcard' },
      h('div', { class: 'p', style: 'font-size:13px' }, h('b', {}, names(m.teamA)), ' vs ', names(m.teamB), '  ',
        h('span', { class: 'tnum', style: 'color:var(--mut)' }, (m.games || []).map(g => g.score_a + '–' + g.score_b).join(', ')),
        m.status && m.status !== 'active' ? h('span', { class: 'pill', style: 'margin-left:6px;color:var(--loss)' }, String(m.status).toUpperCase()) : null),
      h('div', { class: 'subtle', style: 'font-size:11px;margin-top:4px' }, fmtWhen(m.played_at)),
      h('div', { class: 'arow' },
        h('button', { class: 'abtn edit', onClick: () => editMatchDialog(m, load) }, 'Edit scores'),
        m.status === 'active' ? h('button', { class: 'abtn void', onClick: () => voidMatchDialog(m, load) }, 'Void') : null,
        h('button', { class: 'abtn del', onClick: () => deleteMatchDialog(m, load) }, 'Delete')))));
  }
  async function loadClaims() {
    const { claims } = await api('admin/claims');
    if (!claims.length) {
      body.replaceChildren(
        h('div', { class: 'empty' }, 'No profile claims waiting.'),
        h('button', { class: 'btn ghost', style: 'margin-top:12px', onClick: () => openAddGuest(load) },
          h('div', { class: 'in' }, '＋  Add someone new')));
      return;
    }
    body.replaceChildren(
      ...claims.map(c => h('div', { class: 'claimcard' },
        h('div', { class: 'cc-t' }, '🪿 PROFILE CLAIM'),
        h('div', { class: 'cc-row' },
          h('div', { class: 'cc-p' }, h('div', { class: 'e' }, c.claimer ? c.claimer.avatar_emoji : '❓'),
            h('div', { class: 'n' }, c.claimer ? c.claimer.nickname : 'unknown')),
          h('div', { class: 'cc-ar' }, '→'),
          h('div', { class: 'cc-p' }, h('div', { class: 'e' }, c.guest.avatar_emoji),
            h('div', { class: 'n' }, c.guest.nickname))),
        h('div', { class: 'cc-note' }, 'Approving merges every match logged for “' + c.guest.nickname + '” into ' + (c.claimer ? c.claimer.nickname : 'them') + '. This cannot be undone.'),
        h('div', { class: 'cc-acts' },
          h('button', { class: 'btn prim', onClick: async () => {
            try { await api('admin/claims/' + c.guest.id, { method: 'POST' }); toast('Merged', 'ok'); load(); }
            catch (e) { toast(e.message, 'err'); }
          } }, h('div', { class: 'in' }, 'Approve')),
          h('button', { class: 'btn ghost', onClick: async () => {
            try { await api('admin/claims/' + c.guest.id + '/reject', { method: 'POST' }); toast('Rejected', 'ok'); load(); }
            catch (e) { toast(e.message, 'err'); }
          } }, h('div', { class: 'in' }, 'Reject'))))),
      h('button', { class: 'btn ghost', style: 'margin-top:12px', onClick: () => openAddGuest(load) },
        h('div', { class: 'in' }, '＋  Add someone new')));
  }
  async function loadPlayers() {
    const { players } = await api('admin/players');
    body.replaceChildren(
      h('button', { class: 'btn ghost', style: 'margin-bottom:10px', onClick: () => openAddGuest(load) },
        h('div', { class: 'in' }, '＋  Add someone new')),
      ...players.map(p => h('div', { class: 'padminrow' },
        h('div', { class: 'av' }, p.avatar_emoji),
        h('div', { class: 'info' }, h('div', { class: 'n' }, p.nickname, p.role === 'admin' ? h('span', { class: 'pill rk', style: 'margin-left:6px' }, 'ADMIN') : null, !p.is_active ? h('span', { class: 'pill', style: 'margin-left:6px;color:var(--loss)' }, 'DISABLED') : null),
          h('div', { class: 's tnum' }, 'Elo ' + (p.elo ?? '—') + ' · ' + p.games + ' games · #' + p.employee_no)),
        h('button', { class: 'mini-b edit', html: ICON.edit, onClick: () => editPlayerDialog(p, load) }))));
  }
  async function loadAudit() {
    const { audit } = await api('admin/audit?limit=80');
    if (!audit.length) { body.replaceChildren(h('div', { class: 'empty' }, 'No admin actions yet.')); return; }
    body.replaceChildren(h('div', {}, ...audit.map(a => h('div', { class: 'auditrow' },
      h('div', { class: 'ac' }, a.action),
      h('div', { class: 'ad' }, h('div', {}, (a.actor ? a.actor.nickname : 'system') + ' · ' + a.entity + (a.note ? ' — ' + a.note : '')),
        h('div', { class: 'tm' }, fmtWhen(a.created_at)))))));
  }
  mount.replaceChildren(backNav('Admin Console', h('button', { class: 'icnbtn', html: ICON.shield, style: 'color:var(--accent2)' })), seg, body);
  load();
}
function voidMatchDialog(m, done) {
  openModal((close) => {
    const reason = h('input', { class: 'searchbox', placeholder: 'Reason (optional)', maxlength: '300' });
    return h('div', {}, h('h2', {}, 'Void this match?'), h('div', { class: 'msub' }, 'It stops counting immediately. You can restore it later from the audit trail.'),
      h('div', { class: 'p', style: 'font-size:13px;margin-bottom:12px' }, h('b', {}, names(m.teamA)), ' vs ', names(m.teamB)),
      reason,
      h('button', { class: 'btn danger', style: 'margin-top:14px', onClick: async () => { try { await api('admin/matches/' + m.id + '/void', { method: 'POST', body: { reason: reason.value.trim() } }); toast('Match voided', 'ok'); close(); done && done(); } catch (e) { toast(e.message, 'err'); } } }, h('div', { class: 'in' }, 'Void match')));
  });
}
function deleteMatchDialog(m, done) {
  openModal((close) => {
    return h('div', {}, h('h2', {}, 'Delete this match?'), h('div', { class: 'msub' }, 'This permanently removes the match and its games. Scores and titles are recalculated. This cannot be undone.'),
      h('div', { class: 'p', style: 'font-size:13px;margin-bottom:12px' }, h('b', {}, names(m.teamA)), ' vs ', names(m.teamB), '  ', h('span', { class: 'tnum', style: 'color:var(--mut)' }, (m.games || []).map(g => g.score_a + '–' + g.score_b).join(', '))),
      h('button', { class: 'btn danger', onClick: async () => { try { await api('admin/matches/' + m.id + '/delete', { method: 'POST', body: {} }); toast('Match deleted', 'ok'); close(); done && done(); } catch (e) { toast(e.message, 'err'); } } }, h('div', { class: 'in' }, 'Delete permanently')));
  });
}
function resetAllDialog(done) {
  openModal((close) => {
    const confirm = h('input', { class: 'searchbox', placeholder: 'Type RESET to confirm', maxlength: '10', autocapitalize: 'characters' });
    return h('div', {}, h('h2', {}, '⚠ Reset all scores?'), h('div', { class: 'msub' }, 'Deletes every logged match for the whole club and resets all ratings, ranks and titles to zero. Players and accounts are kept. This cannot be undone.'),
      confirm,
      h('button', { class: 'btn danger', style: 'margin-top:14px', onClick: async () => { if (confirm.value.trim() !== 'RESET') { toast('Type RESET to confirm', 'err'); return; } try { const r = await api('admin/reset', { method: 'POST', body: { confirm: 'RESET' } }); toast('Reset complete — ' + (r.deleted || 0) + ' matches cleared', 'ok'); close(); done && done(); } catch (e) { toast(e.message, 'err'); } } }, h('div', { class: 'in' }, 'Reset everything')));
  });
}
function editMatchDialog(m, done) {
  openModal((close) => {
    const games = (m.games && m.games.length ? m.games : [{ score_a: 0, score_b: 0 }]).map(g => ({ a: String(g.score_a), b: String(g.score_b) }));
    const wrap = h('div', {});
    function paint() {
      wrap.replaceChildren(...games.map((g, i) => {
        const a = h('input', { type: 'number', min: '0', max: '30', value: g.a }); const b = h('input', { type: 'number', min: '0', max: '30', value: g.b });
        a.addEventListener('input', () => g.a = a.value); b.addEventListener('input', () => g.b = b.value);
        return h('div', { class: 'gamerow' }, h('div', { class: 'gno' }, 'GAME ' + (i + 1)), a, h('div', { class: 'gd' }, '–'), b, games.length > 1 ? h('button', { class: 'rm', html: ICON.x, onClick: () => { games.splice(i, 1); paint(); } }) : h('div', { class: 'rm' }));
      }), games.length < 3 ? h('button', { class: 'addgame', onClick: () => { games.push({ a: '', b: '' }); paint(); } }, '+ ADD GAME') : null);
    }
    paint();
    return h('div', {}, h('h2', {}, 'Edit scores'), h('div', { class: 'msub' }, names(m.teamA) + ' vs ' + names(m.teamB)), wrap,
      h('button', { class: 'btn prim', style: 'margin-top:14px', onClick: async () => { try { await api('admin/matches/' + m.id + '/games', { method: 'POST', body: { games: games.map(g => ({ score_a: Number(g.a), score_b: Number(g.b) })) } }); toast('Scores updated', 'ok'); close(); done && done(); } catch (e) { toast(e.message, 'err'); } } }, h('div', { class: 'in' }, 'Save scores')));
  });
}
function editPlayerDialog(p, done) {
  openModal((close) => {
    const nick = h('input', { class: 'searchbox', value: p.nickname, maxlength: '24' });
    let active = p.is_active, role = p.role;
    const activeBtn = h('button', { class: 'btn ghost', onClick: () => { active = !active; activeBtn.querySelector('.in').textContent = active ? 'Active ✔' : 'Disabled'; } }, h('div', { class: 'in' }, active ? 'Active ✔' : 'Disabled'));
    const roleBtn = h('button', { class: 'btn ghost', onClick: () => { role = role === 'admin' ? 'player' : 'admin'; roleBtn.querySelector('.in').textContent = role === 'admin' ? 'Admin' : 'Player'; } }, h('div', { class: 'in' }, role === 'admin' ? 'Admin' : 'Player'));
    return h('div', {}, h('h2', {}, 'Edit player'), h('div', { class: 'msub' }, 'Employee #' + p.employee_no),
      h('div', { class: 'lab' }, h('span', {}, 'Nickname')), nick,
      h('div', { class: 'actions', style: 'margin-top:12px' }, activeBtn, roleBtn),
      h('button', { class: 'btn prim', style: 'margin-top:14px', onClick: async () => { try { await api('admin/players/' + p.id, { method: 'POST', body: { nickname: nick.value.trim(), is_active: active, role } }); toast('Player updated', 'ok'); close(); done && done(); } catch (e) { toast(e.message, 'err'); } } }, h('div', { class: 'in' }, 'Save changes')));
  });
}

/* ------------------------------------------------------------------ dialogs */
function flagDialog(m) {
  openModal((close) => {
    const reason = h('input', { class: 'searchbox', placeholder: 'What’s wrong? (optional)', maxlength: '300' });
    const claimed = h('input', { class: 'searchbox', placeholder: 'Correct score, e.g. 21–19 (optional)', maxlength: '60' });
    return h('div', {}, h('h2', {}, 'Flag this score'), h('div', { class: 'msub' }, 'An admin will review it. The match keeps counting until then.'),
      reason, claimed,
      h('button', { class: 'btn prim', style: 'margin-top:14px', onClick: async () => { try { await api('matches/' + m.id + '/flag', { method: 'POST', body: { reason: reason.value.trim(), claimed_score: claimed.value.trim() } }); toast('Flag raised — thanks', 'ok'); close(); } catch (e) { toast(e.message, 'err'); } } }, h('div', { class: 'in' }, 'Raise flag')));
  });
}
function openSettings() {
  openModal((close) => {
    const sel = { emoji: state.me.avatar_emoji, color: state.me.avatar_color };
    let roast = (state.me.settings && state.me.settings.roast_visibility) || 'self';
    const roastSeg = h('div', { class: 'seg', style: 'margin:6px 0 0' },
      h('button', { class: 's' + (roast === 'self' ? ' on' : ''), onClick: (e) => { roast = 'self'; segSel(roastSeg, e.target); } }, 'Only me'),
      h('button', { class: 's' + (roast === 'public' ? ' on' : ''), onClick: (e) => { roast = 'public'; segSel(roastSeg, e.target); } }, 'Everyone'));
    return h('div', {}, h('h2', {}, 'Settings'), h('div', { class: 'msub' }, 'Signed in as ' + state.me.nickname),
      h('div', { class: 'lab' }, h('span', {}, 'Roast titles visible to')), roastSeg,
      buildAvatarPicker(sel),
      h('button', { class: 'btn prim', style: 'margin-top:8px', onClick: async () => {
        try {
          await api('settings', { method: 'POST', body: { roast_visibility: roast } });
          if (sel.emoji !== state.me.avatar_emoji || sel.color !== state.me.avatar_color) { await api('avatar', { method: 'POST', body: { avatar_emoji: sel.emoji, avatar_color: sel.color } }); state.me.avatar_emoji = sel.emoji; state.me.avatar_color = sel.color; }
          state.me.settings = { ...(state.me.settings || {}), roast_visibility: roast };
          toast('Saved', 'ok'); close(); render();
        } catch (e) { toast(e.message, 'err'); }
      } }, h('div', { class: 'in' }, 'Save')),
      h('button', { class: 'btn danger', style: 'margin-top:10px', onClick: async () => { await api('logout', { method: 'POST' }); dropCachedData(); state.me = null; close(); toast('Logged out', 'ok'); navigate('#/'); } }, h('div', { class: 'in' }, 'Log out')));
  });
}

/* ---------------------------------------------------------------- cosmetics */
// The catalogue arrives from /api/init (lib/cosmetics.js is server-side), so
// adding a frame is a one-file change and the picker can never drift from the
// save whitelist. This fallback only matters if init somehow lacked it.
const COSMETIC_FALLBACK = {
  frames: [{ key: 'auto', name: 'Rank Tier', group: 'Basics', req: 'free', rarity: 'free' }],
  cards: [{ key: 'none', name: 'Default', group: 'Basics', req: 'free', rarity: 'free' }],
  wearables: [{ key: 'none', name: 'None', group: 'None', rarity: 'free' }],
  groups: ['Basics'], rarities: [], themes: [{ key: 'free', name: 'Everyone', note: 'Free' }],
};
const catalog = () => (state.config && state.config.cosmetics) || COSMETIC_FALLBACK;
const themeNote = (key) => {
  const t = catalog().themes.find(x => x.key === key);
  return t ? t.note : 'Locked';
};
function cosmeticUnlocked(req, data) {
  if (!req || req === 'free') return true;
  return (data.unlocks || []).includes(req);
}
function frameSwatch(key, tier) { return h('div', { class: 'cos-fr' + frameClass(tier, key) }, '🏸'); }
function cardSwatch(key) { return h('div', { class: 'cos-cd' + (key !== 'none' ? ' cb-' + key : '') }); }
/* ------------------------------------------------------------ guest players */
// Add somebody who plays but hasn't signed up. Nickname + avatar, nothing else
// — the whole point is that it takes five seconds mid-match.
function openAddGuest(onDone) {
  openModal((close) => {
    const cfg = state.config.emoji;
    const sel = { emoji: cfg.emojis[0].char, color: cfg.colors[0] };
    const nick = h('input', { class: 'searchbox', placeholder: 'Their name', maxlength: '24' });
    const grid = h('div', { class: 'emojigrid' });
    const cols = h('div', { class: 'acrow' });
    const err = h('div', { class: 'formnote' });
    function paint() {
      grid.replaceChildren(...cfg.emojis.slice(0, 24).map(e => h('button', {
        class: 'epick' + (sel.emoji === e.char ? ' on' : ''),
        onClick: () => { sel.emoji = e.char; paint(); },
      }, e.char)));
      cols.replaceChildren(...cfg.colors.map(c => h('button', {
        class: 'acbtn' + (sel.color === c ? ' on' : ''), style: 'background:' + c,
        onClick: () => { sel.color = c; paint(); },
      })));
    }
    paint();
    const save = h('button', { class: 'btn prim', style: 'margin-top:14px', onClick: async () => {
      const name = nick.value.trim();
      if (name.length < 2) { err.textContent = 'Give them a name first'; return; }
      save.setAttribute('disabled', '');
      try {
        const r = await api('guests', { method: 'POST', body: { nickname: name, avatar_emoji: sel.emoji, avatar_color: sel.color } });
        toast(name + ' added', 'ok'); confetti({ count: 50 });
        close(); if (onDone) onDone(r.guest);
      } catch (e) { err.textContent = e.message; save.removeAttribute('disabled'); }
    } }, h('div', { class: 'in' }, 'Add player'));
    return h('div', {},
      h('h2', {}, '＋ Add someone new'),
      h('div', { class: 'msub' }, "For people who play but haven't signed up. They can claim this profile later and keep every match."),
      nick,
      h('div', { class: 'lab', style: 'margin-top:12px' }, h('span', {}, 'Avatar')), grid,
      h('div', { class: 'lab', style: 'margin-top:12px' }, h('span', {}, 'Colour')), cols,
      err, save);
  });
}

/* -------------------------------------------------------------------- arcade */
// Coins are minted only by levelling up, and levels come only from playing
// badminton. Nothing here can buy Elo, a title or a rank — it's a place to
// spend what the court earned you.
// These must stay a subset of the server's BETS list in lib/store.js — the
// server re-validates every stake, so an unlisted one is simply rejected.
const BETS = [10, 50, 100, 500, 1000, 5000, 10000];
const BUYINS = [100, 500, 1000, 5000, 10000];

// A playing card. Red suits read red; face-down cards show the goose back.
function pcard(c, cls = '') {
  if (!c) return h('div', { class: 'pcard back ' + cls }, '');
  return h('div', { class: 'pcard ' + cls + (/[♥♦]/.test(c) ? ' red' : '') },
    h('span', { class: 'pc-r' }, c.slice(0, -1)),
    h('span', { class: 'pc-s' }, c.slice(-1)));
}

async function viewArcade(mount) {
  let w = await api('wallet');
  let bet = 10;
  let game = 'slots';
  let pokerMode = 'rush';

  const coinEl = h('div', { class: 'ac-coins tnum' }, String(w.coins));
  const lvlBar = h('div', { class: 'ac-xpfill' });
  const lvlTxt = h('div', { class: 'ac-xptxt tnum' });
  const modeRow = h('div', { class: 'ac-modes' });
  const stage = h('div', { class: 'ac-stage' });
  const result = h('div', { class: 'ac-res' });
  const controls = h('div', { class: 'ac-ctl' });
  const paytable = h('div', { class: 'ac-pay' });

  function paintWallet() {
    coinEl.textContent = String(w.coins);
    lvlBar.style.width = w.level.pct + '%';
    lvlTxt.textContent = w.level.into + ' / ' + w.level.need + ' XP';
  }
  const betRow = h('div', { class: 'ac-bets' });
  function paintBets(list, cur, onPick) {
    betRow.replaceChildren(...list.map(v => h('button', {
      class: 'ac-bet' + (v === cur ? ' on' : ''),
      onClick: (e) => { onPick(v); [...betRow.children].forEach(c => c.classList.remove('on')); e.currentTarget.classList.add('on'); },
    }, String(v))));
  }

  function showResult(r) {
    const good = r.net > 0, even = r.net === 0;
    result.className = 'ac-res ' + (good ? 'win' : even ? 'push' : 'lose');
    result.replaceChildren(
      h('div', { class: 'ac-rl' }, r.line || r.detail || r.win || r.hand || (good ? 'You win' : even ? 'Push' : 'No luck')),
      h('div', { class: 'ac-rn tnum' }, (r.net > 0 ? '+' : '') + r.net));
    if (r.net > 0) {
      confetti({ count: Math.min(160, 40 + r.net), colors: ['#ffd36a', '#57b947', '#fff6d0'] });
      if (r.net >= bet * 10) party('JACKPOT', '+' + r.net, 'coins', ['#ffd36a', '#fff6d0', '#ba8cff']);
    }
  }

  let busy = false;
  async function play(gameKey, extra) {
    if (busy) return;
    if (w.coins < bet) { toast('Not enough coins — play a match to level up', 'err'); return; }
    busy = true; stage.classList.add('rolling');
    try {
      const r = await api('arcade/' + gameKey, { method: 'POST', body: { bet, ...extra } });
      w.coins = r.coins;
      await new Promise(res => setTimeout(res, gameKey === 'slots' ? 700 : 200));
      paintWallet();
      renderStage(gameKey, r);
      showResult(r);
    } catch (e) { toast(e.message, 'err'); }
    stage.classList.remove('rolling');
    busy = false;
  }

  // ---- what the table looks like after a round of each game ----
  function renderStage(gameKey, r) {
    if (gameKey === 'slots') {
      stage.replaceChildren(h('div', { class: 'reels' }, ...r.reels.map((ic, i) =>
        h('div', { class: 'reel land', style: '--d:' + (i * 110) + 'ms' }, ic))));
      return;
    }
    if (gameKey === 'blackjack') {
      const dealerRow = h('div', { class: 'bj-dealer' },
        h('div', { class: 'ac-k' }, h('span', { class: 'pk-deck' }), ' DEALER · ' + r.dealerTotal),
        h('div', { class: 'cards' }, ...r.dealer.map(c => pcard(c))));
      const seats = h('div', { class: 'bj-seats' },
        ...(r.others || []).map(o => h('div', { class: 'bj-seat ' + (o.result || '') },
          h('div', { class: 'bs-who' }, o.emoji + ' ' + o.name),
          h('div', { class: 'cards sm' }, ...o.cards.map(c => pcard(c, 'sm'))),
          h('div', { class: 'bs-t tnum' }, String(o.total) + (o.bust ? ' BUST' : '')))),
        h('div', { class: 'bj-seat you ' + r.result },
          h('div', { class: 'bs-who' }, '⭐ You'),
          h('div', { class: 'cards sm' }, ...r.player.map(c => pcard(c, 'sm'))),
          h('div', { class: 'bs-t tnum' }, String(r.playerTotal))));
      stage.replaceChildren(dealerRow, h('div', { class: 'bj-felt' }), seats);
      requestAnimationFrame(() => dealFrom(dealerRow, [...stage.querySelectorAll('.pcard')], 70));
      return;
    }
    if (gameKey === 'rush') {
      const inBest = new Set(r.best || []);
      const dealerRow = h('div', { class: 'ac-k rushdealer' }, h('span', { class: 'pk-deck' }), ' DEALER');
      const board = h('div', { class: 'cards' }, ...r.board.map(c => pcard(c, inBest.has(c) ? 'lit' : 'dim')));
      const hole = h('div', { class: 'cards' }, ...r.hole.map(c => pcard(c, inBest.has(c) ? 'lit' : 'dim')));
      stage.replaceChildren(dealerRow,
        h('div', { class: 'ac-k' }, 'BOARD'), board,
        h('div', { class: 'ac-k' }, 'YOUR HAND · ' + r.hand), hole);
      requestAnimationFrame(() => dealFrom(dealerRow, [...stage.querySelectorAll('.pcard')], 80));
    }
  }

  /* ------------------------------------------------ poker: peace mode ---- */
  let hand = null;
  let raiseVal = 0;

  function seatBox(p, view) {
    const isYou = p.seat === view.yourSeat;
    const turn = view.toAct === p.seat && !view.done;
    const won = view.result && view.result.winners.includes(p.seat);
    return h('div', {
      class: 'pk-seat' + (isYou ? ' you' : '') + (p.folded ? ' folded' : '') + (turn ? ' turn' : '') + (won ? ' pkwin' : ''),
    },
      h('div', { class: 'pk-who' },
        h('span', { class: 'e' }, p.emoji),
        h('span', { class: 'n' }, p.name),
        p.allIn ? h('span', { class: 'pk-ai' }, 'ALL IN') : null),
      h('div', { class: 'cards xs' }, ...(p.hole
        ? p.hole.map(c => pcard(c, 'xs'))
        : Array.from({ length: p.cards }, () => pcard(null, 'xs')))),
      h('div', { class: 'pk-chips tnum' }, String(p.chips)),
      p.bet > 0 ? h('div', { class: 'pk-bet tnum' }, String(p.bet)) : null);
  }

  function paintPoker(view) {
    hand = view;
    if (view.coins != null) { w.coins = view.coins; paintWallet(); }
    const dealerEl = h('div', { class: 'pk-dealer' }, h('span', { class: 'pk-deck' }), h('span', { class: 'ac-k' }, 'DEALER'));
    const others = view.players.filter(p => p.seat !== view.yourSeat);
    const you = view.players.find(p => p.seat === view.yourSeat);

    const table = h('div', { class: 'pk-table' },
      dealerEl,
      h('div', { class: 'pk-others' }, ...others.map(p => seatBox(p, view))),
      h('div', { class: 'pk-mid' },
        h('div', { class: 'pk-pot' }, h('span', { class: 'ac-k' }, 'POT'), h('span', { class: 'v tnum' }, String(view.pot))),
        h('div', { class: 'cards board' },
          ...view.board.map(c => pcard(c)),
          ...Array.from({ length: 5 - view.board.length }, () => h('div', { class: 'pcard slot' })))),
      h('div', { class: 'pk-street' }, view.done ? 'SHOWDOWN' : view.street.toUpperCase()),
      seatBox(you, view));

    const logEl = view.log && view.log.length
      ? h('div', { class: 'pk-log' }, ...view.log.slice(-3).map(l => h('div', {}, l))) : null;

    stage.replaceChildren(table, logEl);
    requestAnimationFrame(() => dealFrom(dealerEl, [...stage.querySelectorAll('.pcard:not(.slot)')], 55));

    // ---- action bar ----
    if (view.done) {
      const net = you.chips - (view.buyIn || hand.buyIn || 0);
      result.className = 'ac-res ' + (view.result.winners.includes(view.yourSeat) ? 'win' : 'lose');
      const names = view.result.winners.map(s => view.players[s].name).join(' & ');
      const myHand = view.result.hands && view.result.hands[view.yourSeat];
      result.replaceChildren(
        h('div', { class: 'ac-rl' }, names + ' win' + (view.result.winners.length > 1 ? '' : 's') +
          (myHand ? ' · you had ' + myHand.name : '')),
        h('div', { class: 'ac-rn tnum' }, 'You left with ' + you.chips));
      if (view.result.winners.includes(view.yourSeat)) confetti({ count: 120, colors: ['#ffd36a', '#57b947'] });
      controls.replaceChildren(h('button', { class: 'cta', onClick: () => startPoker() },
        h('div', { class: 'ctain' }, h('span', {}, 'NEXT HAND'), h('span', { class: 'arw' }, '♠'))));
      return;
    }

    if (!view.you || !view.you.canAct) {
      result.className = 'ac-res';
      result.replaceChildren();
      controls.replaceChildren(h('div', { class: 'ac-hint' }, 'Waiting for ' + (view.players[view.toAct] || {}).name + '…'));
      return;
    }

    const { actions, toCall, raise } = view.you;
    raiseVal = raise ? raise.min : 0;
    const rv = h('div', { class: 'pk-rv tnum' }, String(raiseVal));
    const slider = raise && raise.max > raise.min ? h('input', {
      type: 'range', class: 'pk-slider', min: String(raise.min), max: String(raise.max), value: String(raise.min),
    }) : null;
    if (slider) slider.addEventListener('input', () => { raiseVal = +slider.value; rv.textContent = String(raiseVal); });

    const send = async (action, amount) => {
      if (busy) return; busy = true;
      controls.replaceChildren(h('div', { class: 'ac-hint' }, 'Dealing…'));
      try { paintPoker(await api('arcade/poker/act', { method: 'POST', body: { hand: view.handId, action, amount } })); }
      catch (e) { toast(e.message, 'err'); paintPoker(view); }
      busy = false;
    };

    result.className = 'ac-res';
    result.replaceChildren();
    controls.replaceChildren(
      raise ? h('div', { class: 'pk-raise' },
        h('div', { class: 'pk-rlab' }, h('span', { class: 'ac-k' }, 'RAISE TO'), rv),
        slider || h('div', { class: 'ac-hint' }, 'All-in only')) : null,
      h('div', { class: 'pk-acts' },
        h('button', { class: 'btn danger', onClick: () => send('fold') }, h('div', { class: 'in' }, 'Fold')),
        actions.includes('check')
          ? h('button', { class: 'btn ghost', onClick: () => send('check') }, h('div', { class: 'in' }, 'Check'))
          : h('button', { class: 'btn ghost', onClick: () => send('call') }, h('div', { class: 'in' }, 'Call ' + toCall)),
        actions.includes('raise')
          ? h('button', { class: 'btn prim', onClick: () => send('raise', raiseVal) },
            h('div', { class: 'in' }, raiseVal >= (raise ? raise.max : 0) ? 'ALL IN' : 'Raise'))
          : null));
  }

  async function startPoker() {
    if (busy) return; busy = true;
    const buyIn = bet;
    if (w.coins < buyIn) { toast('Not enough coins for that buy-in', 'err'); busy = false; return; }
    stage.replaceChildren(h('div', { class: 'ac-hint' }, 'Shuffling…'));
    try { paintPoker(await api('arcade/poker/start', { method: 'POST', body: { buyIn, bots: pokerBots } })); }
    catch (e) { toast(e.message, 'err'); paintGame(); }
    busy = false;
  }

  let pokerBots = 3;

  // The Rush/Peace picker lives outside the stage, so dealing a hand (which
  // replaces the stage) can't wipe it.
  function paintModes() {
    if (game !== 'poker') { modeRow.replaceChildren(); return; }
    const modes = h('div', { class: 'seg sub' },
      ...[['rush', '⚡ Rush'], ['peace', '🪑 Peace']].map(([k, lbl]) => h('button', {
        class: 's' + (pokerMode === k ? ' on' : ''),
        onClick: (e) => {
          if (hand && !hand.done) { toast('Finish the hand first', 'err'); return; }
          pokerMode = k; bet = k === 'peace' ? 100 : 10;
          segSel(modes, e.currentTarget); paintGame();
        },
      }, lbl)));
    modeRow.replaceChildren(modes);
  }

  function paintGame() {
    paintModes();
    result.className = 'ac-res'; result.replaceChildren();
    hand = null;

    if (game === 'slots') {
      paintBets(BETS, bet, v => { bet = v; });
      stage.replaceChildren(h('div', { class: 'reels' }, ...['🪿', '🏸', '⭐'].map(ic => h('div', { class: 'reel' }, ic))));
      controls.replaceChildren(h('button', { class: 'cta', onClick: () => play('slots') },
        h('div', { class: 'ctain' }, h('span', {}, 'SPIN'), h('span', { class: 'arw' }, '🎰'))));
      paytable.replaceChildren(h('div', { class: 'ac-k' }, 'PAYS'),
        h('div', { class: 'ptbl' }, ...[['🪿 🪿 🪿', '106×'], ['🏆 🏆 🏆', '53×'], ['🏸 🏸 🏸', '21×'], ['🔥 🔥 🔥', '12×'], ['⭐ ⭐ ⭐', '7×'], ['any pair', '1–12×']]
          .map(([k, v]) => h('div', { class: 'ptrow' }, h('span', {}, k), h('span', { class: 'tnum' }, v)))));
      return;
    }

    if (game === 'blackjack') {
      paintBets(BETS, bet, v => { bet = v; });
      let standOn = 17, bots = 2;
      stage.replaceChildren(h('div', { class: 'ac-hint' }, 'Dealer stands on 17 · blackjack pays 3:2'));
      const seg = h('div', { class: 'seg' }, ...[15, 16, 17, 18, 19].map(v => h('button', {
        class: 's' + (v === standOn ? ' on' : ''),
        onClick: (e) => { standOn = v; segSel(seg, e.currentTarget); },
      }, String(v))));
      const bseg = h('div', { class: 'seg' }, ...[0, 1, 2, 3].map(v => h('button', {
        class: 's' + (v === bots ? ' on' : ''),
        onClick: (e) => { bots = v; segSel(bseg, e.currentTarget); },
      }, v === 0 ? 'Just me' : v + ' bot' + (v > 1 ? 's' : ''))));
      controls.replaceChildren(
        h('div', { class: 'ac-k', style: 'margin-bottom:6px' }, 'YOU STAND ON'), seg,
        h('div', { class: 'ac-k', style: 'margin:10px 0 6px' }, 'OTHERS AT THE TABLE'), bseg,
        h('button', { class: 'cta', style: 'margin-top:10px', onClick: () => play('blackjack', { stand_on: standOn, bots }) },
          h('div', { class: 'ctain' }, h('span', {}, 'DEAL'), h('span', { class: 'arw' }, '🃏'))));
      paytable.replaceChildren();
      return;
    }

    // ---- poker ----
    if (pokerMode === 'rush') {
      paintBets(BETS, bet, v => { bet = v; });
      stage.replaceChildren(h('div', { class: 'ac-hint' },
        'Two cards to you, five to the board, paid on your best five. No opponent — you against the deck.'));
      controls.replaceChildren(h('button', { class: 'cta', onClick: () => play('rush') },
        h('div', { class: 'ctain' }, h('span', {}, 'DEAL'), h('span', { class: 'arw' }, '⚡'))));
      paytable.replaceChildren(h('div', { class: 'ac-k' }, 'PAYS'),
        h('div', { class: 'ptbl' }, ...[['Straight Flush', '250×'], ['Four of a Kind', '50×'], ['Full House', '7×'], ['Flush', '4×'], ['Straight', '3×'], ['Three of a Kind', '2×'], ['Two Pair', 'stake back']]
          .map(([k, v]) => h('div', { class: 'ptrow' }, h('span', {}, k), h('span', { class: 'tnum' }, v)))));
      return;
    }

    // peace
    paintBets(BUYINS, bet, v => { bet = v; });
    const bseg = h('div', { class: 'seg' }, ...[1, 2, 3, 5].map(v => h('button', {
      class: 's' + (v === pokerBots ? ' on' : ''),
      onClick: (e) => { pokerBots = v; segSel(bseg, e.currentTarget); },
    }, v + ' bot' + (v > 1 ? 's' : ''))));
    stage.replaceChildren(h('div', { class: 'ac-hint' },
      'A real table: blinds, four betting rounds, fold / check / call / raise. Your buy-in is your stack — whatever you leave with comes back as coins.'));
    controls.replaceChildren(
      h('div', { class: 'ac-k', style: 'margin-bottom:6px' }, 'WHO ELSE IS PLAYING'), bseg,
      h('button', { class: 'cta', style: 'margin-top:10px', onClick: startPoker },
        h('div', { class: 'ctain' }, h('span', {}, 'SIT DOWN'), h('span', { class: 'arw' }, '♠'))));
    paytable.replaceChildren(h('div', { class: 'ac-k' }, 'HAND RANKING'),
      h('div', { class: 'ptbl' }, ...['Straight Flush', 'Four of a Kind', 'Full House', 'Flush', 'Straight', 'Three of a Kind', 'Two Pair', 'Pair', 'High Card']
        .map((k, i) => h('div', { class: 'ptrow' }, h('span', {}, k), h('span', { class: 'tnum' }, '#' + (i + 1))))));
  }

  const games = h('div', { class: 'seg' }, ...[['slots', '🎰 Slots'], ['blackjack', '🃏 Blackjack'], ['poker', '♠ Poker']]
    .map(([k, lbl], i) => h('button', {
      class: 's' + (i === 0 ? ' on' : ''),
      onClick: (e) => { game = k; bet = k === 'poker' && pokerMode === 'peace' ? 100 : 10; segSel(games, e.currentTarget); paintGame(); },
    }, lbl)));

  const league = h('div', {});
  api('arcade/league').then(l => {
    if (!league.isConnected || !l.rows || !l.rows.length) return;
    setKids(league,
      h('div', { class: 'slab' }, h('div', { class: 't' }, 'This week'), h('div', { class: 'm' }, 'resets Monday')),
      ...l.rows.slice(0, 5).map((r, i) => h('div', { class: 'lgrow' },
        h('div', { class: 'lg-r tnum' }, String(i + 1)),
        h('div', { class: 'lg-e' }, r.avatar_emoji),
        h('div', { class: 'lg-n' }, r.nickname),
        h('div', { class: 'lg-v tnum ' + (r.net >= 0 ? 'up' : 'dn') }, (r.net > 0 ? '+' : '') + r.net))));
  }).catch(() => {});

  paintWallet(); paintGame();
  setKids(mount,
    backNav('Arcade'),
    h('div', { class: 'ac-top' },
      h('div', { class: 'ac-wal' }, h('div', { class: 'ac-k' }, 'YOUR COINS'), coinEl),
      h('div', { class: 'ac-lvl' },
        h('div', { class: 'ac-lv tnum' }, 'LV ' + w.level.level),
        h('div', { class: 'ac-xp' }, lvlBar), lvlTxt)),
    games, modeRow, stage, result,
    h('div', { class: 'ac-k', style: 'margin-top:14px' }, 'BET'), betRow,
    controls, paytable, league);

  // rejoin a hand left running (closed the tab mid-hand)
  api('arcade/poker').then(s => {
    if (!s.hand || !mount.isConnected) return;
    game = 'poker'; pokerMode = 'peace';
    [...games.children].forEach((c, i) => c.classList.toggle('on', i === 2));
    paintModes();
    paintBets(BUYINS, bet, v => { bet = v; });
    paintPoker(s.hand);
  }).catch(() => {});
}
/* ------------------------------------------------------------ guest players */
// After signing up: "someone already added you?" Pick your existing profile and
// an admin approves the merge, so you keep every match already logged for you.
function offerClaim(guests) {
  openModal((close) => {
    const list = h('div', { class: 'picklist' }, ...guests.map(g => h('button', {
      class: 'pickrow', onClick: async () => {
        try {
          await api('guests/' + g.id + '/claim', { method: 'POST' });
          close(); toast('Sent — an admin will approve it', 'ok'); navigate('#/');
        } catch (e) { toast(e.message, 'err'); }
      },
    }, h('div', { class: 'av' }, g.avatar_emoji), h('div', { class: 'n' }, g.nickname))));
    return h('div', {},
      h('h2', {}, '🪿 Been playing already?'),
      h('div', { class: 'msub' }, 'If somebody logged matches for you before you joined, claim that profile and keep all of it. An admin approves it.'),
      list,
      h('button', { class: 'btn ghost', style: 'margin-top:12px', onClick: () => { close(); navigate('#/'); } },
        h('div', { class: 'in' }, "I'm new — start fresh")));
  }, { noClose: true, locked: true });
}

/* ------------------------------------------------------ name badge picker */
// This used to be the fourth section down inside Customize, under frames,
// cards and accents — so nobody ever found it. It is its own screen now.
function openBadgePicker(data) {
  const tier = data.elo != null ? tierFor(data.elo, data.rank, data.stats.matches) : TIERS[0];
  let picked = (state.me.settings && state.me.settings.badge) || 'tier';

  const opts = [
    { key: 'tier', name: 'Rank tier', kind: 'tier', note: 'default', preview: null },
    ...(data.joiner ? [{
      key: 'joiner', name: data.joiner.name, icon: data.joiner.icon, kind: 'joiner',
      note: data.joiner.memberNo === 1 ? 'you were here first' : 'your join number · nobody can take it',
      preview: data.joiner,
    }] : []),
    ...(data.mythicsOwned || []).map(m => ({
      key: m.key, name: m.name, icon: m.icon, kind: 'mythic', note: 'mythic · 1 holder only',
      preview: { kind: 'mythic', name: m.name, icon: m.icon, tier: 'mythic' },
    })),
    ...dedupeTitles(data.titles || []).map(t => ({
      key: t.key, name: t.name, kind: 'title', note: t.tier,
      preview: { kind: 'title', name: t.name, tier: t.tier },
    })),
  ];

  openModal((close) => {
    const preview = h('div', { class: 'bp-prev sticky' });
    const grid = h('div', { class: 'badgegrid' });

    function paint() {
      const o = opts.find(x => x.key === picked) || opts[0];
      preview.replaceChildren(
        h('div', { class: 'bp-k' }, 'THIS IS WHAT EVERYONE SEES'),
        h('div', { class: 'bp-row' },
          h('div', { class: 'bp-ava' + frameClass(tier, (data.cosmetics && data.cosmetics.frame) || 'auto') },
            state.me.avatar_emoji || '🏸', ...wearParts((data.cosmetics && data.cosmetics.wear) || 'none')),
          h('div', {},
            h('div', { class: 'bp-nm' }, state.me.nickname),
            h('div', { class: 'bp-bd' }, nameBadge(o.preview, tier)))));
      grid.replaceChildren(...opts.map(o2 => h('button', {
        class: 'bopt b-' + o2.kind + (picked === o2.key ? ' sel' : ''),
        onClick: () => { picked = o2.key; paint(); },
      }, h('div', { class: 'bo-n' }, (o2.icon ? o2.icon + ' ' : '') + o2.name),
        h('div', { class: 'bo-t' }, o2.note))));
    }
    paint();

    const only = opts.length === 1;
    return h('div', {},
      h('h2', {}, '🏷️ Your title'),
      h('div', { class: 'msub' }, 'Pick the title shown next to your name'),
      preview,
      h('div', { class: 'lab', style: 'margin-top:14px' },
        h('span', {}, 'Available'), h('span', { class: 'hint' }, plur(opts.length, 'option'))),
      grid,
      only ? h('div', { class: 'bp-empty' },
        'Win titles and Mythics and they show up here. Your rank tier is the default.') : null,
      h('button', { class: 'btn prim', style: 'margin-top:14px', onClick: async () => {
        try {
          await api('settings', { method: 'POST', body: { badge: picked } });
          state.me.settings = { ...(state.me.settings || {}), badge: picked };
          toast('Title equipped', 'ok'); confetti({ count: 60 }); close(); render();
        } catch (e) { toast(e.message, 'err'); }
      } }, h('div', { class: 'in' }, 'Equip title')));
  });
}

/* --------------------------------------------------------------------- rooms */
const COURT_NOS = [1, 2, 3, 4, 5];

function shareRoom(room) {
  const url = location.origin + '/#/room/' + room.id;
  const txt = 'Join my Gooseminton session 🪿 — code ' + room.code + '\n' + url;
  if (navigator.share) { navigator.share({ title: 'Gooseminton session', text: txt }).catch(() => {}); return; }
  if (navigator.clipboard) { navigator.clipboard.writeText(txt).then(() => toast('Invite copied', 'ok'), () => toast(room.code, 'ok')); return; }
  toast(room.code, 'ok');
}

async function viewRooms(mount) {
  const data = await api('rooms');
  const isAdmin = state.me.role === 'admin';
  const nameIn = h('input', { placeholder: 'Friday night club', maxlength: '60' });
  const codeIn = h('input', { placeholder: 'CODE', maxlength: '8', class: 'codein', autocapitalize: 'characters' });

  async function create() {
    try {
      const r = await api('rooms', { method: 'POST', body: { name: nameIn.value.trim() || null } });
      toast(r.existing ? 'Your session is already live' : 'Session created 🏟️', 'ok');
      navigate('#/room/' + r.roomId);
    } catch (e) { toast(e.message, 'err'); }
  }
  async function joinByCode() {
    const code = codeIn.value.trim();
    if (code.length < 4) { toast('Enter the join code', 'err'); return; }
    try {
      const f = await api('rooms/code', { method: 'POST', body: { code } });
      await api('rooms/' + f.roomId + '/join', { method: 'POST', body: {} });
      navigate('#/room/' + f.roomId);
    } catch (e) { toast(e.message, 'err'); }
  }
  codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinByCode(); });

  setKids(mount,
    backNav('Sessions'),
    h('div', { class: 'pagehead' }, h('h1', {}, 'Play session'),
      h('div', { class: 'subtle' }, 'One room, live courts, teams drawn for you')),

    isAdmin ? h('div', { class: 'card mkroom' },
      h('div', { class: 'lab' }, h('span', {}, '🏟️ Host a session')),
      nameIn,
      h('button', { class: 'cta', style: 'margin-top:10px', onClick: create },
        h('div', { class: 'ctain' }, h('span', {}, 'Create room'), h('span', { class: 'arw', html: ICON.plus }))))
      : null,

    h('div', { class: 'card mkroom' },
      h('div', { class: 'lab' }, h('span', {}, '🔑 Join with a code')),
      h('div', { class: 'coderow' }, codeIn,
        h('button', { class: 'btn prim', onClick: joinByCode }, h('div', { class: 'in' }, 'Join')))),

    h('div', { class: 'slab' }, h('div', { class: 't' }, 'Live now'), h('div', { class: 'm' }, plur(data.rooms.length, 'session'))),
    data.rooms.length ? h('div', {}, ...data.rooms.map(r =>
      h('button', { class: 'roomrow', onClick: () => navigate('#/room/' + r.id) },
        h('div', { class: 'rr-live' }, h('span', { class: 'dot' }), 'LIVE'),
        h('div', { class: 'rr-info' },
          h('div', { class: 'rr-n' }, r.name || 'Badminton session'),
          h('div', { class: 'rr-s' }, (r.host ? r.host.avatar_emoji + ' ' + r.host.nickname : 'host') + ' · ' + plur(r.players, 'player') + ' · ' + plur((r.courts || []).length, 'court'))),
        h('div', { class: 'rr-code tnum' }, r.code))))
      : h('div', { class: 'empty' }, isAdmin ? 'No live session — create one above.' : 'No live session right now.'));
}

async function viewRoom(mount, roomId) {
  let st = await api('rooms/' + roomId);
  let mode = 'rank';
  let lastJson = '';
  let showHistory = false;
  const wrap = h('div', {});
  mount.replaceChildren(wrap);

  async function refresh(force) {
    try { st = await api('rooms/' + roomId); if (force) lastJson = ''; paint(); }
    catch (e) { toast(e.message, 'err'); }
  }
  // Poll so every phone in the gym sees the same board. Stops automatically
  // when the view is replaced (wrap leaves the document).
  (function poll() {
    setTimeout(async () => {
      if (!wrap.isConnected) return;
      try { st = await api('rooms/' + roomId); paint(); } catch {}
      poll();
    }, 4000);
  })();

  function paint() {
    const j = JSON.stringify(st) + mode + showHistory;
    if (j === lastJson) return;                    // no change -> no repaint, no flicker
    lastJson = j;

    const R = st.room;
    const pmap = new Map(st.players.map(p => [p.id, p]));
    const pOf = (id) => pmap.get(id) || { nickname: '—', avatar_emoji: '🏸', avatar_color: '#57b947' };
    const roster = st.players.filter(p => !p.left);
    const round = st.round;
    const live = R.status === 'open';
    const canHost = st.isHost && live;

    /* --- header --- */
    const header = h('div', { class: 'card roomhead' },
      h('div', { class: 'rh-top' },
        h('div', {},
          h('div', { class: 'rh-name' }, R.name || 'Badminton session'),
          h('div', { class: 'rh-sub' }, (live ? '● LIVE' : '■ ENDED') + ' · host ' + R.host)),
        h('button', { class: 'icnbtn', html: ICON.share, title: 'Share invite', onClick: () => shareRoom(R) })),
      h('div', { class: 'rh-codewrap' },
        h('button', { class: 'rh-code', title: 'Tap to copy', onClick: () => shareRoom(R) },
          h('span', { class: 'k' }, 'JOIN CODE'), h('span', { class: 'v tnum' }, R.code)),
        h('div', { class: 'rh-stats' },
          h('div', { class: 'rh-st' }, h('div', { class: 'n tnum' }, String(roster.length)), h('div', { class: 'k' }, 'players')),
          h('div', { class: 'rh-st' }, h('div', { class: 'n tnum' }, String(R.courts.length)), h('div', { class: 'k' }, 'courts')),
          h('div', { class: 'rh-st' }, h('div', { class: 'n tnum' }, String(round ? round.round_no : 0)), h('div', { class: 'k' }, 'rounds')))));

    /* --- join / leave --- */
    const joinBar = !st.isMember && live
      ? h('button', { class: 'cta', onClick: async () => { try { await api('rooms/' + roomId + '/join', { method: 'POST', body: {} }); toast('You are in 🏸', 'ok'); refresh(true); } catch (e) { toast(e.message, 'err'); } } },
        h('div', { class: 'ctain' }, h('span', {}, 'Join this session'), h('span', { class: 'arw', html: ICON.check })))
      : null;

    /* --- host: courts on/off --- */
    const courtPanel = canHost ? h('div', { class: 'card hostpanel' },
      h('div', { class: 'lab' }, h('span', {}, '🎛️ Courts available'), h('span', { class: 'hint' }, 'tap to toggle')),
      h('div', { class: 'ctrow' }, ...COURT_NOS.map(n => {
        const on = R.courts.includes(n);
        return h('button', {
          class: 'ctchip' + (on ? ' on' : ''),
          onClick: async () => {
            const next = on ? R.courts.filter(x => x !== n) : [...R.courts, n];
            try { st = await api('rooms/' + roomId + '/courts', { method: 'POST', body: { courts: next } }); lastJson = ''; paint(); }
            catch (e) { toast(e.message, 'err'); }
          },
        }, h('span', { class: 'cn tnum' }, String(n)), h('span', { class: 'cs' }, on ? 'ON' : 'OFF'));
      })),
      h('div', { class: 'lab', style: 'margin-top:14px' }, h('span', {}, '🎲 How to pick teams')),
      h('div', { class: 'seg' },
        h('button', { class: 's' + (mode === 'rank' ? ' on' : ''), onClick: (e) => { mode = 'rank'; segSel(e.target.parentNode, e.target); lastJson = ''; paint(); } }, '⚖️ By rank'),
        h('button', { class: 's' + (mode === 'random' ? ' on' : ''), onClick: (e) => { mode = 'random'; segSel(e.target.parentNode, e.target); lastJson = ''; paint(); } }, '🎲 Random')),
      h('div', { class: 'modenote' }, mode === 'rank'
        ? 'Similar ratings share a court and teams are evened out — every game close.'
        : 'Pure chaos. Everyone shuffled, teams drawn out of a hat.'),
      h('button', {
        class: 'cta', style: 'margin-top:12px',
        onClick: async () => {
          try { st = await api('rooms/' + roomId + '/draw', { method: 'POST', body: { mode } }); lastJson = ''; paint(); toast(round ? 'Next round drawn' : 'Teams drawn 🏸', 'ok'); }
          catch (e) { toast(e.message, 'err'); }
        },
      }, h('div', { class: 'ctain' }, h('span', {}, round ? 'Draw next round' : 'Draw teams'), h('span', { class: 'arw', html: ICON.swap })))) : null;

    /* --- courts --- */
    function courtCard(c) {
      const reported = !!c.matchId;
      const canReport = live && !reported && (st.isHost || c.teamA.includes(state.me.id) || c.teamB.includes(state.me.id));
      const side = (ids, key) => h('div', { class: 'ct-side' + (reported && c.winner === key ? ' won' : '') + (reported && c.winner !== key ? ' lost' : '') },
        ...ids.map(id => {
          const p = pOf(id);
          return h('div', { class: 'ct-p' + (id === state.me.id ? ' me' : '') },
            h('span', { class: 'e' }, p.avatar_emoji), h('span', { class: 'n' }, p.nickname));
        }),
        reported ? h('div', { class: 'ct-score tnum' }, String(key === 'A' ? c.scoreA : c.scoreB)) : null);

      return h('div', { class: 'courtcard' + (reported ? ' done' : '') },
        h('div', { class: 'cc-head' },
          h('div', { class: 'cc-no' }, 'COURT ' + c.court),
          h('div', { class: 'cc-fmt' }, c.format === 'singles' ? '1v1' : '2v2'),
          reported ? h('div', { class: 'cc-done' }, '✓ ' + (c.gamesA > c.gamesB ? 'Team A' : 'Team B') + ' won') : null),
        h('div', { class: 'cc-body' }, side(c.teamA, 'A'), h('div', { class: 'cc-vs' }, 'VS'), side(c.teamB, 'B')),
        !reported ? h('div', { class: 'cc-bal' },
          h('div', { class: 'bar' }, h('div', { class: 'fill', style: 'width:' + c.balance + '%' })),
          h('div', { class: 'bl tnum' }, c.balance + '% · ' + (100 - c.balance) + '%'),
          h('div', { class: 'bt' }, Math.abs(c.balance - 50) <= 6 ? '🔥 Dead even' : Math.abs(c.balance - 50) <= 15 ? 'Slight edge' : 'Upset watch')) : null,
        canReport ? h('button', { class: 'btn prim ccbtn', onClick: () => openReport(round, c) }, h('div', { class: 'in' }, 'Report score')) : null);
    }

    const courtsWrap = round && round.courts_json.length
      ? h('div', { class: 'courts' }, ...round.courts_json.map(courtCard))
      : h('div', { class: 'empty' }, live ? (st.isHost ? 'Pick your courts and draw the teams.' : 'Waiting for the host to draw teams…') : 'This session has ended.');

    /* --- bench --- */
    const resting = round ? round.resting_ids : [];
    const bench = resting.length ? h('div', {},
      h('div', { class: 'slab' }, h('div', { class: 't' }, '🪑 On the bench'), h('div', { class: 'm' }, 'up next')),
      h('div', { class: 'benchrow' }, ...resting.map(id => {
        const p = pOf(id);
        return h('div', { class: 'benchp' + (id === state.me.id ? ' me' : '') },
          h('span', { class: 'e' }, p.avatar_emoji), h('span', { class: 'n' }, p.nickname),
          p.rounds_rested > 1 ? h('span', { class: 'w tnum' }, '×' + p.rounds_rested) : null);
      }))) : null;

    /* --- tonight's standings + MVP --- */
    const standings = st.standings.length ? h('div', {},
      h('div', { class: 'slab' }, h('div', { class: 't' }, '🏅 Tonight'), h('div', { class: 'm' }, plur(st.standings.length, 'player'))),
      st.mvp ? h('div', { class: 'mvpcard' },
        h('div', { class: 'mv-e' }, st.mvp.avatar_emoji),
        h('div', {}, h('div', { class: 'mv-k' }, '👑 MVP OF THE NIGHT'), h('div', { class: 'mv-n' }, st.mvp.nickname),
          h('div', { class: 'mv-s tnum' }, st.mvp.wins + 'W ' + st.mvp.losses + 'L · ' + (st.mvp.pointsFor - st.mvp.pointsAgainst >= 0 ? '+' : '') + (st.mvp.pointsFor - st.mvp.pointsAgainst) + ' pts'))) : null,
      h('div', { class: 'sesslist' }, ...st.standings.map((s, i) =>
        h('div', { class: 'sessrow' + (s.id === state.me.id ? ' me' : '') },
          h('div', { class: 'sr-r tnum' }, String(i + 1)),
          h('div', { class: 'sr-e' }, s.avatar_emoji),
          h('div', { class: 'sr-n' }, s.nickname),
          h('div', { class: 'sr-w tnum' }, s.wins + 'W'),
          h('div', { class: 'sr-l tnum' }, s.losses + 'L'),
          h('div', { class: 'sr-d tnum ' + (s.pointsFor - s.pointsAgainst >= 0 ? 'g' : 'r') },
            (s.pointsFor - s.pointsAgainst >= 0 ? '+' : '') + (s.pointsFor - s.pointsAgainst)))))) : null;

    /* --- roster --- */
    const rosterBlock = h('div', {},
      h('div', { class: 'slab' }, h('div', { class: 't' }, '👥 In the room'), h('div', { class: 'm' }, plur(roster.length, 'player'))),
      h('div', { class: 'benchrow' }, ...roster.map(p =>
        h('button', { class: 'benchp' + (p.id === state.me.id ? ' me' : ''), onClick: () => navigate('#/p/' + p.id) },
          h('span', { class: 'e' }, p.avatar_emoji), h('span', { class: 'n' }, p.nickname),
          h('span', { class: 'w tnum' }, String(p.elo))))));

    /* --- history --- */
    const history = st.history.length ? h('div', {},
      h('button', { class: 'histtoggle', onClick: () => { showHistory = !showHistory; lastJson = ''; paint(); } },
        (showHistory ? '▾ ' : '▸ ') + 'Earlier rounds (' + st.history.length + ')'),
      showHistory ? h('div', { class: 'histlist' }, ...st.history.map(r =>
        h('div', { class: 'histrow' },
          h('div', { class: 'hr-n tnum' }, 'R' + r.round_no),
          h('div', { class: 'hr-m' }, r.mode === 'rank' ? '⚖️' : '🎲'),
          h('div', { class: 'hr-c' }, ...r.courts_json.map(c =>
            h('div', { class: 'hr-ct' },
              h('span', { class: 'hc' }, 'C' + c.court),
              h('span', { class: 'hn' }, c.teamA.map(id => pOf(id).nickname).join('+') + ' vs ' + c.teamB.map(id => pOf(id).nickname).join('+')),
              c.winner ? h('span', { class: 'hs tnum' }, c.scoreA + '–' + c.scoreB) : h('span', { class: 'hs dim' }, 'no score')))))))
        : null) : null;

    /* --- footer actions --- */
    const actions = h('div', { class: 'roomacts' },
      st.isMember && live ? h('button', {
        class: 'btn', onClick: async () => {
          try { await api('rooms/' + roomId + '/leave', { method: 'POST', body: {} }); toast('You left the session', 'ok'); navigate('#/rooms'); }
          catch (e) { toast(e.message, 'err'); }
        },
      }, h('div', { class: 'in' }, 'Leave session')) : null,
      canHost ? h('button', {
        class: 'btn danger', onClick: () => openModal((close) => h('div', {},
          h('h2', {}, 'End this session?'),
          h('div', { class: 'msub' }, 'The room closes for everyone. Logged matches and ratings are kept.'),
          h('button', {
            class: 'btn danger', style: 'margin-top:14px', onClick: async () => {
              try { await api('rooms/' + roomId + '/close', { method: 'POST', body: {} }); toast('Session ended', 'ok'); close(); refresh(true); }
              catch (e) { toast(e.message, 'err'); }
            },
          }, h('div', { class: 'in' }, 'End session')))),
      }, h('div', { class: 'in' }, 'End session')) : null);

    setKids(wrap, backNav(R.name || 'Session'), header, joinBar, courtPanel, courtsWrap, bench, standings, rosterBlock, history, actions);
  }

  function openReport(round, c) {
    let games = [{ a: '', b: '' }];
    openModal((close) => {
      const rows = h('div', {});
      const note = h('div', { class: 'formnote' });
      const save = h('button', { class: 'btn prim', style: 'margin-top:14px' }, h('div', { class: 'in' }, 'Save result'));
      const nameSide = (ids) => ids.map(id => {
        const p = st.players.find(x => x.id === id);
        return p ? p.nickname : '—';
      }).join(' & ');

      function valid() {
        const gs = games.filter(g => g.a !== '' && g.b !== '');
        if (!gs.length) return { ok: false, msg: 'Enter the score' };
        let wa = 0, wb = 0;
        for (const g of gs) {
          const a = Number(g.a), b = Number(g.b);
          if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a > 30 || b > 30) return { ok: false, msg: 'Scores must be 0–30' };
          if (a === b) return { ok: false, msg: 'A game cannot be a tie' };
          if (a > b) wa++; else wb++;
        }
        if (wa === wb) return { ok: false, msg: 'Someone has to win the match' };
        return { ok: true, msg: (wa > wb ? nameSide(c.teamA) : nameSide(c.teamB)) + ' win ' + Math.max(wa, wb) + '–' + Math.min(wa, wb) };
      }
      function validate() {
        const v = valid();
        note.textContent = v.msg;
        note.style.color = v.ok ? 'var(--win)' : 'var(--dim)';
        if (v.ok) save.removeAttribute('disabled'); else save.setAttribute('disabled', '');
      }
      function paintRows() {
        rows.replaceChildren(...games.map((g, i) => {
          const a = h('input', { type: 'number', inputmode: 'numeric', min: '0', max: '30', value: g.a, placeholder: '0' });
          const b = h('input', { type: 'number', inputmode: 'numeric', min: '0', max: '30', value: g.b, placeholder: '0' });
          a.addEventListener('input', () => { g.a = a.value; validate(); });
          b.addEventListener('input', () => { g.b = b.value; validate(); });
          return h('div', { class: 'gamerow' }, h('div', { class: 'gno' }, 'GAME ' + (i + 1)), a, h('div', { class: 'gd' }, '–'), b,
            games.length > 1 ? h('button', { class: 'rm', html: ICON.x, onClick: () => { games.splice(i, 1); paintRows(); validate(); } }) : h('div', { class: 'rm' }));
        }),
          games.length < 3 ? h('button', { class: 'addgame', onClick: () => { games.push({ a: '', b: '' }); paintRows(); } }, '+ ADD GAME (best of 3)') : null);
      }
      save.addEventListener('click', async () => {
        if (!valid().ok) return;
        save.setAttribute('disabled', '');
        try {
          st = await api('rooms/' + roomId + '/result', {
            method: 'POST',
            body: {
              round_id: round.id, court: c.court,
              games: games.filter(g => g.a !== '' && g.b !== '').map(g => ({ score_a: Number(g.a), score_b: Number(g.b) })),
            },
          });
          toast('Result saved — ratings updated', 'ok');
          close(); lastJson = ''; paint();
        } catch (e) { toast(e.message, 'err'); save.removeAttribute('disabled'); }
      });
      paintRows(); validate();
      return h('div', {},
        h('h2', {}, 'Court ' + c.court + ' result'),
        h('div', { class: 'msub' }, nameSide(c.teamA) + '  vs  ' + nameSide(c.teamB)),
        rows, note, save);
    });
  }

  paint();
}

function epReveal(e) {
  const el = h('div', { class: 'epreveal' },
    h('div', { class: 'er-rays' }),
    h('div', { class: 'er-in' },
      h('div', { class: 'er-k' }, t('claimedBanner')),
      h('div', { class: 'er-ic' }, e.icon),
      h('div', { class: 'er-th' }, e.name || e.en),
      h('div', { class: 'er-en' }, e.th),
      h('div', { class: 'er-bl' }, e.blurb)));
  document.body.append(el);
  confetti({ count: 150, colors: ['#ffe08a', '#ba8cff', '#fff6d0', '#57b947'] });
  setTimeout(() => confetti({ count: 90, colors: ['#ffd36a', '#c9a7ff'] }), 500);
  setTimeout(() => el.remove(), 3600);
}

async function viewEpithets(mount) {
  const [data, opts] = await Promise.all([api('epithets'), api('epithets/options').catch(() => ({ options: [] }))]);
  const body = h('div', {});
  const nameOf = (e) => (lang() === 'th' ? e.th : e.en);
  const subOf = (e) => (lang() === 'th' ? e.en : e.th);

  function paint(d, options) {
    const mine = d.myEpithet;
    const claimed = d.epithets.filter(e => e.holder).length;
    const mustChoose = options.length > 1;

    setKids(body,
      // ---------- your epithet ----------
      mine
        ? h('div', { class: 'ephero' },
          h('div', { class: 'eh-aura' }),
          h('div', { class: 'eh-in' },
            h('div', { class: 'eh-k' }, t('yours')),
            h('div', { class: 'eh-ic' }, mine.icon),
            h('div', { class: 'eh-th' }, nameOf(mine)),
            h('div', { class: 'eh-en' }, subOf(mine)),
            h('div', { class: 'eh-bl' }, mine.blurb),
            h('div', { class: 'eh-tag' }, t('onlyOne'))))
        : h('div', { class: 'epnone' },
          h('div', { class: 'en-ic' }, '🎖️'),
          h('div', { class: 'en-t' }, t('noneTitle')),
          h('div', { class: 'en-x' }, t('noneText'))),

      // ---------- choose one ----------
      mustChoose ? h('div', { class: 'epchoose' },
        h('div', { class: 'ec-t' }, t('chooseT', { n: options.length })),
        h('div', { class: 'ec-x' }, t('chooseX')),
        h('div', { class: 'ec-list' }, ...options.map(o => h('button', {
          class: 'epopt' + (d.chosen === o.key ? ' on' : ''),
          onClick: async () => {
            try {
              const nd = await api('epithets/choose', { method: 'POST', body: { key: o.key } });
              epReveal({ ...o, name: nameOf(o) }); paint(nd, options);
            } catch (err) { toast(err.message, 'err'); }
          },
        },
          epMedal(o.icon, 'sm'),
          h('div', { class: 'eo-b' }, h('div', { class: 'eo-th' }, nameOf(o)), h('div', { class: 'eo-en' }, o.blurb)),
          h('div', { class: 'eo-cta' }, d.chosen === o.key ? '✓ ' + t('kept') : t('keep')))))) : null,

      // ---------- how it works ----------
      h('div', { class: 'ephow' }, h('div', { class: 'ehw-t' }, 'ℹ️ ' + t('howT')), h('div', { class: 'ehw-x' }, t('howX'))),

      // ---------- all epithets ----------
      h('div', { class: 'slab' }, h('div', { class: 't' }, t('theTwelve')),
        h('div', { class: 'm tnum' }, claimed + '/' + d.epithets.length + ' ' + t('claimed'))),
      h('div', { class: 'epgrid' }, ...d.epithets.map(e => h('div', { class: 'epcard' + (e.mine ? ' mine' : e.holder ? '' : ' free') },
        epMedal(e.holder ? e.icon : '🔒', e.mine ? 'gold' : ''),
        h('div', { class: 'ep-b' },
          h('div', { class: 'ep-th' }, nameOf(e)),
          h('div', { class: 'ep-bl' }, e.blurb)),
        e.holder
          ? h('div', { class: 'ep-h' + (e.mine ? ' me' : '') }, h('span', { class: 'hx' }, e.holder.avatar_emoji),
            h('span', {}, e.mine ? t('you') : e.holder.nickname))
          : h('div', { class: 'ep-h none' }, t('unclaimed'))))));
  }

  setKids(mount,
    backNav(t('epithets')),
    h('div', { class: 'pagehead withact' }, h('h1', {}, t('epithets')),
      h('div', { class: 'subtle' }, t('epTag')),
      h('div', { class: 'phact' }, menuBtn())),
    body);
  paint(data, opts.options || []);
}

/* ------------------------------------------------------------------- i18n */
// English is the default everywhere; the toggle flips the strings that have a
// Thai equivalent (epithet names + the screens around them).
const STRINGS = {
  en: {
    epithets: 'Epithets', epTag: 'One holder each · one per player',
    yours: 'YOUR EPITHET', noneTitle: 'No epithet yet', noneText: 'Finish top of any board below to claim one. Nobody may hold two.',
    onlyOne: 'ONLY ONE IN THE CLUB', theTwelve: 'ALL EPITHETS', claimed: 'claimed',
    chooseT: 'YOU LEAD {n} BOARDS', chooseX: 'Nobody may hold two epithets. Choose the one you keep — the rest pass to the next player in line.',
    keep: 'Keep this one', kept: 'Kept', unclaimed: 'Unclaimed', you: 'You', held: 'Held by',
    claimedBanner: 'EPITHET CLAIMED', howT: 'How it works',
    howX: 'Each epithet belongs to the single best player in one category. You can only ever wear one, so leading several means choosing.',
  },
  th: {
    epithets: 'ฉายา', epTag: 'หนึ่งคนต่อหนึ่งฉายา',
    yours: 'ฉายาของคุณ', noneTitle: 'ยังไม่มีฉายา', noneText: 'ขึ้นเป็นที่หนึ่งของกระดานใดก็ได้เพื่อรับฉายา ไม่มีใครถือได้สองฉายา',
    onlyOne: 'มีเพียงหนึ่งเดียวในชมรม', theTwelve: 'ฉายาทั้งหมด', claimed: 'ถูกครอง',
    chooseT: 'คุณนำอยู่ {n} กระดาน', chooseX: 'ไม่มีใครถือได้สองฉายา เลือกหนึ่งที่จะเก็บไว้ ที่เหลือจะตกเป็นของคนถัดไป',
    keep: 'เลือกอันนี้', kept: 'เลือกแล้ว', unclaimed: 'ยังว่าง', you: 'คุณ', held: 'ผู้ครอง',
    claimedBanner: 'ได้รับฉายาแล้ว', howT: 'กติกา',
    howX: 'แต่ละฉายาเป็นของผู้เล่นที่เก่งที่สุดในด้านนั้น สวมได้คนละหนึ่งฉายาเท่านั้น',
  },
};
function lang() { return lsGet('gm_lang') === 'th' ? 'th' : 'en'; }
function t(k, vars) {
  let s = (STRINGS[lang()] && STRINGS[lang()][k]) || STRINGS.en[k] || k;
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace('{' + a + '}', b);
  return s;
}
/* --------------------------------------------------------------- onboarding */
// Coach-mark tour: blurs everything except the thing being explained and
// points an arrow at it. Runs once on first login, re-runnable from settings.
const TOUR_STEPS = [
  { sel: null, title: '🪿 Welcome to Gooseminton', text: 'A 60-second tour of everything you can do. Tap Next.' },
  { sel: '.hero', title: 'Your rating card', text: 'Your Elo, rank and streak live here. Beat stronger players to climb faster.' },
  { sel: '.cta', title: 'Log a match', text: 'Record any game here. Ratings, titles and achievements all update instantly.' },
  { sel: '.sesscard', title: 'Play sessions', text: 'Running club night? Open a room, share the code, and teams get drawn for every court automatically.' },
  { sel: '.utilrow', title: 'Map & matchmaker', text: 'See who plays with who as a constellation, or let the app find you the closest-rated opponent.' },
  { sel: '.tabs', title: 'Get around', text: 'Leaderboard, the shop, and your profile — where you equip frames, titles and badges.' },
  { sel: '.icnbtn.news', title: 'The menu', text: 'Inventory, the blacksmith, the arcade and every update live in here. A green dot means there’s something new.' },
];
function tourDone() { return lsGet('gm_tour') === '2'; }
function startTour(steps = TOUR_STEPS) {
  let i = 0;
  const back = h('div', { class: 'tourback' });
  const ring = h('div', { class: 'tourring' });
  const arrow = h('div', { class: 'tourarrow' });
  const card = h('div', { class: 'tourcard' });
  const layer = h('div', { class: 'tourlayer' }, back, ring, arrow, card);
  document.body.append(layer);

  function close(finished) {
    layer.remove();
    window.removeEventListener('resize', paint);
    window.removeEventListener('hashchange', onNav);
    lsSet('gm_tour', '2');
    if (finished) confetti({ count: 80 });
  }
  // the tour lives on <body>, so it must clean itself up if the user navigates
  const onNav = () => close(false);
  function paint() {
    const st = steps[i];
    const el = st.sel ? document.querySelector(st.sel) : null;
    const vw = window.innerWidth, vh = window.innerHeight;
    let r = null;
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
      r = el.getBoundingClientRect();
    }
    if (r && r.width > 0) {
      const pad = 8;
      const x1 = Math.max(0, r.left - pad), y1 = Math.max(0, r.top - pad);
      const x2 = Math.min(vw, r.right + pad), y2 = Math.min(vh, r.bottom + pad);
      // donut clip: blur/darken everything except the highlighted rectangle
      back.style.clipPath = `polygon(0 0,${vw}px 0,${vw}px ${vh}px,0 ${vh}px,0 0,${x1}px ${y1}px,${x1}px ${y2}px,${x2}px ${y2}px,${x2}px ${y1}px,${x1}px ${y1}px)`;
      ring.style.cssText = `left:${x1}px;top:${y1}px;width:${x2 - x1}px;height:${y2 - y1}px;display:block`;
      const below = y2 + 150 < vh;
      card.style.cssText = `left:12px;right:12px;${below ? 'top:' + (y2 + 18) + 'px' : 'bottom:' + (vh - y1 + 18) + 'px'}`;
      arrow.style.cssText = `display:block;left:${Math.min(vw - 30, Math.max(18, (x1 + x2) / 2 - 9))}px;` +
        (below ? `top:${y2 + 4}px;transform:rotate(180deg)` : `top:${y1 - 16}px`);
    } else {
      back.style.clipPath = '';
      ring.style.display = 'none';
      arrow.style.display = 'none';
      card.style.cssText = 'left:12px;right:12px;top:50%;transform:translateY(-50%)';
    }
    setKids(card,
      h('div', { class: 'tc-step tnum' }, (i + 1) + ' / ' + steps.length),
      h('div', { class: 'tc-t' }, st.title),
      h('div', { class: 'tc-x' }, st.text),
      h('div', { class: 'tc-a' },
        h('button', { class: 'tc-skip', onClick: () => close(false) }, 'Skip'),
        i > 0 ? h('button', { class: 'tc-btn ghost', onClick: () => { i--; paint(); } }, 'Back') : null,
        h('button', { class: 'tc-btn', onClick: () => { if (i < steps.length - 1) { i++; paint(); } else close(true); } },
          i < steps.length - 1 ? 'Next' : 'Let’s play 🏸')));
  }
  window.addEventListener('resize', paint);
  window.addEventListener('hashchange', onNav);
  paint();
}

/* --------------------------------------------------------------------- shop */
// The passing merchant: a mystery goose who rolls a cart of cosmetics past the
// club, with a rotating "Golden Time" flash sale. Coins only ever buy looks —
// never Elo, a title or a rank.
function fmtCountdown(ms) {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000);
  const p = (n) => String(n).padStart(2, '0');
  return p(Math.floor(s / 3600)) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60);
}
/* =========================================================================
   SHOP · INVENTORY · BLACKSMITH
   Three separate screens, because they are three separate jobs:
     Shop      — spend coins. The merchant sells you things.
     Inventory — what you own, and what is equipped where.
     Blacksmith— upgrade what you own.
   They link to each other, but none of them is a tab of another.
   ========================================================================= */
const RARITY_ORDER = ['free', 'common', 'rare', 'epic', 'legendary', 'trophy'];
const RARITY_NAME = { free: 'Free', common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', trophy: 'Trophy' };
const FORGE_FALLBACK = {
  slots: [], stages: [], elements: [], grades: [], stats: {}, skins: [], levelBonus: [0], maxLevel: 9,
  charmStats: {}, charmSlots: 3, charmRarity: {}, charmSources: {}, pouchPrice: 800,
};
const fcat = () => (state.config && state.config.forge) || FORGE_FALLBACK;
const statMeta = (k) => fcat().stats[k] || fcat().charmStats[k] || { name: k, icon: '•', note: '' };
const srcMeta = (k) => fcat().charmSources[k] || { name: 'Unknown', icon: '❔', note: '' };
const slotOf = (k) => (fcat().slots || []).find(s => s.key === k) || { name: k, icon: '', stat: 'coin' };
const elemOf = (k) => (fcat().elements || []).find(e => e.key === k) || { name: k || '—', icon: '', fx: '', rarity: 'common' };
const stageOf = (k) => (fcat().stages || []).find(s => s.key === k) || { name: k || 'Base', icon: '', slots: 0 };
const gradeOf = (k) => (fcat().grades || []).find(g => g.key === k) || { name: 'Blessed', fx: '' };
const stoneOf = (k) => (fcat().stones || []).find(s => s.key === k) || { name: k, icon: '💠', odds: {}, rarity: 'rare' };
const BLESS_NAME = { normal: 'Blessed', super: 'Super Blessed', heavenly: 'Heavenly Blessed', omni: 'Omniscient' };
const pouchOf = (k) => (fcat().pouches || []).find(p => p.key === k) || { name: k, icon: '🎁', price: 0, weights: {} };
// A stats-first detail sheet. Nothing in this app should charge you for
// something you have not been allowed to read first.
function openItemSheet({ icon, name, rarity, note, lines, price, owned, locked, lockNote, action, actionLabel, fx }) {
  openModal((close) => h('div', {},
    h('div', { class: 'isheet' },
      fx ? h('span', { class: 'is-fx ' + fx }) : null,
      h('div', { class: 'is-ic' }, icon || '❔'),
      h('div', { class: 'is-nm' }, name),
      rarity ? h('div', { class: 'is-rar r-' + rarity }, RARITY_NAME[rarity] || rarity) : null),
    note ? h('div', { class: 'is-note' }, note) : null,
    (lines && lines.length) ? h('div', { class: 'is-lines' }, ...lines.map(l =>
      h('div', { class: 'is-line' + (l.good ? ' good' : '') },
        h('span', { class: 'is-k' }, l.k),
        h('span', { class: 'is-v' }, l.v)))) : null,
    owned
      ? h('div', { class: 'shop-eq on', style: 'text-align:center;margin-top:14px' }, '✓ You already own this')
      : locked
        ? h('div', { class: 'is-lock' }, '🔒 ' + (lockNote || 'Not for sale'))
        : h('button', {
          class: 'btn prim', style: 'margin-top:14px',
          onClick: () => { close(); if (action) action(); },
        }, h('div', { class: 'in' }, (actionLabel || 'Buy') + (price ? ' · 🪙 ' + price : '')))));
}
const pct = (n) => (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, '') + '%';
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// A running coin balance that every one of these three screens shows in the
// same place, so you never have to go looking for it.
function purseBar(coins) {
  const el = h('span', { class: 'shop-coins tnum' }, String(coins));
  const bar = h('div', { class: 'purse' }, h('span', { class: 'coin' }, '🪙'), el, h('span', { class: 'shop-wlbl' }, 'coins'));
  bar.set = (n) => { el.textContent = String(n); };
  return bar;
}
// The three-way switcher that sits under the title on all three screens.
function hubNav(active) {
  const mk = (key, icon, label, hash) => h('button', { class: 'hubt' + (active === key ? ' on' : ''), onClick: () => navigate(hash) },
    h('span', { class: 'hb-ic', html: ICON[icon] }), h('span', {}, label));
  return h('div', { class: 'hubnav' },
    mk('shop', 'bag', 'Shop', '#/shop'),
    mk('inv', 'box', 'Inventory', '#/inventory'),
    mk('forge', 'anvil', 'Blacksmith', '#/forge'),
    mk('trail', 'dice', 'Trail', '#/trail'));
}
function statLine(stats) {
  const ks = Object.keys(stats || {}).filter(k => stats[k]);
  if (!ks.length) return null;
  return h('div', { class: 'gstats' }, ...ks.map(k =>
    h('span', { class: 'gstat s-' + k }, statMeta(k).icon + ' ' + statMeta(k).name + ' +' + pct(stats[k]))));
}
// A frame swatch shows YOUR avatar wearing the frame — showing a racket in the
// frame shop was just confusing.
const frameSwatchFor = (key, tier) => h('div', { class: 'cos-fr' + frameClass(tier, key) }, state.me.avatar_emoji || '🪿');
// One gear card, shared by the inventory and the blacksmith.
function gearIdent(g) {
  const sl = slotOf(g.slot), e = elemOf(g.element), st = stageOf(g.stage);
  return { sl, e, st, title: e.icon + ' ' + e.name + (st.icon ? ' ' + st.icon : '') };
}
function subChips(g) {
  const sockets = g.sockets || 0;
  if (!sockets && !(g.subs || []).length) return null;
  const out = [];
  for (const s of (g.subs || [])) {
    out.push(h('span', { class: 'gsub blessed' + (s.fx ? ' ' + s.fx : '') },
      statMeta(s.stat).icon + ' ' + statMeta(s.stat).name + ' +' + s.val + '%'));
  }
  for (let i = out.length; i < sockets; i++) out.push(h('span', { class: 'gsub socket' }, '◇ empty socket'));
  return out.length ? h('div', { class: 'gsubs' }, ...out) : null;
}

/* --------------------------------------------------------------- the shop */
const MERCH_GREET = [
  'Honk. Everything is fairly priced. Fair for me.',
  'One bowl of noodles, hold the noodles. Cosmetics only.',
  'Secret ingredient soup? There is no secret ingredient. Just markup.',
  'These wares fell off the back of a much bigger goose.',
  'Bread? No. Coins only. I have evolved past bread.',
  'Half of this is stolen. The honest half is overpriced.',
  'My father wanted me to sell noodles. I sell hats. He does not call.',
  'There is no charge for awesomeness. There is a charge for the frame.',
  'ของมันต้องมี ห่านว่างั้น', 'ห่านไม่โกหก… ก็โกหกนิดหน่อย',
];
const MERCH_BUY = [
  'Nice choice. I would never wear it, but nice choice.',
  'SOLD. Another satisfied victim— customer. Customer.',
  'Excellent taste. Terrible for your wallet. Great for me.',
  'Your story may not have a happy beginning. Your drip does.',
  'เยี่ยม! เงินคุณคือความสุขของห่าน 🪿',
];
const MERCH_BROKE = ['No coins? No honk. Come back richer.', 'Empty pockets honk the loudest. Go win a match.', 'เงินไม่พอ ห่านเมิน 🙄'];
const MERCH_EQUIP = ['Looks good. On you. Not on me.', 'There. Now you are 3% cooler and 0% richer.', 'Skadoosh. That is the sound of taste.'];

const SHOP_CATS = [
  { key: 'gear', label: 'Gear' },
  { key: 'frame', label: 'Frames' },
  { key: 'card', label: 'Cards' },
  { key: 'wear', label: 'Wearables' },
];

async function viewShop(mount) {
  const [shop, prof, forgeData] = await Promise.all([
    api('shop'),
    api('profile/' + state.me.id).catch(() => ({ unlocks: [], elo: null, rank: null, stats: { matches: 0 } })),
    api('forge').catch(() => null),
  ]);
  const tier = prof.elo != null ? tierFor(prof.elo, prof.rank, prof.stats.matches) : TIERS[0];
  let coins = shop.coins;
  let gear = forgeData;
  const bought = new Set(shop.items.filter(i => i.owned).map(i => i.kind + ':' + i.key));
  const priced = new Map(shop.items.map(i => [i.kind + ':' + i.key, i]));
  const equipped = {
    frame: (state.me.settings && state.me.settings.frame) || 'auto',
    card: (state.me.settings && state.me.settings.card) || 'none',
    wear: (state.me.settings && state.me.settings.wear) || 'none',
  };
  let cat = SHOP_CATS.some(c => c.key === state.shopCat) ? state.shopCat : 'gear';
  let own = 'all', rare = 'all', sort = 'rarity', busy = false;

  const purse = purseBar(coins);
  const setCoins = (n) => { coins = n; purse.set(n); };
  const sayEl = h('div', { class: 'merch-say' }, MERCH_GREET[0]);
  const gooseEl = h('div', { class: 'merch-goose' }, '🪿');
  function say(txt, cls) {
    sayEl.className = 'merch-say' + (cls ? ' ' + cls : '');
    sayEl.textContent = txt;
    sayEl.style.animation = 'none'; void sayEl.offsetWidth; sayEl.style.animation = '';
  }
  function honk() {
    say(pick(MERCH_GREET));
    gooseEl.classList.remove('honk'); void gooseEl.offsetWidth; gooseEl.classList.add('honk');
  }

  function itemsFor(kind) {
    const src = kind === 'frame' ? catalog().frames : kind === 'card' ? catalog().cards : catalog().wearables;
    return (src || []).map(o => {
      const id = kind + ':' + o.key;
      const sale = priced.get(id);
      const earned = kind === 'wear' ? o.key === 'none' : cosmeticUnlocked(o.req, prof);
      return {
        kind, key: o.key, name: o.name, group: o.group, req: o.req, rarity: o.rarity || 'free',
        forSale: !!sale, price: sale ? sale.price : 0, base: sale ? sale.base : 0,
        onSale: !!(sale && sale.onSale),
        owned: earned || bought.has(id) || equipped[kind] === o.key,
      };
    });
  }
  const rank = (i) => RARITY_ORDER.indexOf(i.rarity);
  function visible() {
    let list = itemsFor(cat);
    if (own === 'owned') list = list.filter(i => i.owned);
    if (own === 'new') list = list.filter(i => !i.owned);
    if (rare !== 'all') list = list.filter(i => i.rarity === rare);
    if (sort === 'price') list.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => rank(a) - rank(b) || a.price - b.price || a.name.localeCompare(b.name));
    return list;
  }

  async function equip(it) {
    try {
      const patch = {}; patch[it.kind] = it.key;
      await api('settings', { method: 'POST', body: patch });
      state.me.settings = { ...(state.me.settings || {}), ...patch };
      equipped[it.kind] = it.key;
      toast('Equipped ' + it.name, 'ok'); confetti({ count: 50 });
      say(pick(MERCH_EQUIP), 'happy'); paint();
    } catch (e) { toast(e.message, 'err'); }
  }
  async function buy(it) {
    if (coins < it.price) { toast('Not enough coins — win a match or hit the arcade', 'err'); say(pick(MERCH_BROKE), 'no'); return; }
    try {
      const r = await api('shop/buy', { method: 'POST', body: { kind: it.kind, key: it.key } });
      setCoins(r.coins); bought.add(it.kind + ':' + it.key);
      toast('Bought ' + it.name + '!', 'ok');
      confetti({ count: 90, colors: ['#ffd36a', '#57b947', '#fff6d0'] });
      party('NEW ITEM', it.name, (RARITY_NAME[it.rarity] || 'Stall') + ' · from the noodle goose', ['#ffd36a', '#fff6d0', '#57b947']);
      say(pick(MERCH_BUY), 'happy'); paint();
    } catch (e) { toast(e.message, 'err'); }
  }
  const swatch = (it) => it.kind === 'frame' ? frameSwatchFor(it.key, tier)
    : it.kind === 'card' ? cardSwatch(it.key)
      : h('div', { class: 'shop-wava' }, state.me.avatar_emoji || '🏸', ...wearParts(it.key));

  function actionFor(it) {
    if (it.owned) {
      if (equipped[it.kind] === it.key) return h('div', { class: 'shop-eq on' }, '✓ Equipped');
      return h('button', { class: 'shop-btn equip', onClick: () => equip(it) }, 'Equip');
    }
    if (!it.forSale) return h('div', { class: 'shop-lock' }, '🔒 ' + themeNote(it.req));
    return h('button', { class: 'shop-btn buy' + (coins >= it.price ? '' : ' broke'), onClick: () => buy(it) },
      h('span', { class: 'coin' }, '🪙'), h('span', { class: 'tnum' }, String(it.price)));
  }
  function itemCard(it) {
    return h('div', { class: 'shop-item r-' + it.rarity + (it.onSale ? ' onsale' : '') + (it.owned ? ' owned' : '') },
      it.onSale ? h('div', { class: 'sale-tag' }, '−' + Math.round(100 - 100 * it.price / it.base) + '%') : null,
      h('div', { class: 'shop-sw' }, swatch(it)),
      h('div', { class: 'shop-nm' }, it.name),
      h('div', { class: 'shop-rar r-' + it.rarity }, RARITY_NAME[it.rarity] || it.rarity),
      (it.onSale && it.base > it.price) ? h('div', { class: 'shop-was tnum' }, '🪙 ' + it.base) : null,
      actionFor(it));
  }

  /* ---- the gear counter: this is where you buy a racket ---- */
  async function buyGear(slot, element) {
    if (busy) return; busy = true; paintBody();
    try {
      const r = await api('forge/buy', { method: 'POST', body: { slot, element } });
      setCoins(r.coins);
      const e = elemOf(element);
      toast('Bought a ' + e.name + ' ' + slotOf(slot).name, 'ok');
      confetti({ count: 70, colors: ['#ffd36a', '#c8ccd4'] });
      party('NEW GEAR', e.icon + ' ' + e.name + ' ' + slotOf(slot).name, 'take it to the blacksmith', ['#ffd36a', '#c8ccd4']);
      say('Fresh stock. Now go ruin it with ambition.', 'happy');
    } catch (e) { toast(e.message, 'err'); }
    busy = false;
    gear = await api('forge').catch(() => gear);
    if (gear) setCoins(gear.coins);
    paintBody();
  }
  // Picking which element you want. Most of these cannot be bought at all —
  // they are here so you can see what is out there and go hunting.
  function openElementPicker(slot) {
    const sl = slotOf(slot);
    const all = ((gear && gear.elements) || fcat().elements || []).filter(e => e.slot === slot);
    const order = ['common', 'rare', 'epic', 'legendary'];
    const sorted = [...all].sort((a, b) =>
      (a.source === 'shop' ? 0 : 1) - (b.source === 'shop' ? 0 : 1)
      || order.indexOf(a.rarity) - order.indexOf(b.rarity) || a.name.localeCompare(b.name));
    const usable = sorted.filter(e => e.source === 'shop' || e.found);
    const wearing = (gear && (gear.items || []).find(i => i.slot === slot && i.owned)) || null;
    openModal((close) => h('div', {},
      h('h2', {}, sl.icon + ' Choose your ' + sl.name),
      h('div', { class: 'msub' }, `They all hit exactly the same — you are choosing a look. ` +
        (wearing ? `Swapping is free once you own it and keeps your +${wearing.level}. ` : '') +
        `${usable.length} of ${sorted.length} available · only ${sorted.filter(e => e.source === 'shop').length} can be bought.`),
      h('div', { class: 'elgrid' }, ...sorted.map(e => {
        const canUse = e.source === 'shop' || e.found;
        const on = wearing && wearing.element === e.key;
        const free = e.found || on;
        return h('button', {
          class: 'elcard r-' + e.rarity + (canUse ? '' : ' locked') + (on ? ' on' : ''),
          onClick: () => {
            close();
            openItemSheet({
              icon: e.icon, name: e.name, rarity: e.rarity, note: e.note, fx: e.fx,
              lines: [
                { k: 'Slot', v: sl.icon + ' ' + sl.name },
                { k: statMeta(sl.stat).name, v: 'up to +6% at +9 winked', good: true },
                { k: 'Campaign', v: sl.key === 'racket' ? '💥 Damage · 🎯 Crit' : sl.key === 'shuttle' ? '💥 Damage · 🩸 Lifesteal' : '💥 Damage', good: true },
                { k: 'Sockets', v: 'up to 3, unlocked by evolving at +9' },
                { k: 'Source', v: e.source === 'shop' ? 'Sold at the stall' : 'Goose Egg or the Goose Trail' },
                wearing ? { k: on ? 'Status' : 'Swapping', v: on ? 'Equipped right now' : 'Keeps your +' + wearing.level + ' and every socket' } : null,
              ].filter(Boolean),
              price: free ? 0 : (e.source === 'shop' ? e.price : 0),
              owned: on,
              locked: !canUse,
              lockNote: 'Only found in a Goose Egg or dropped on the Goose Trail — never for sale.',
              actionLabel: free ? (wearing ? 'Swap in (free)' : 'Equip (found)') : (wearing ? 'Buy & swap in' : 'Buy'),
              action: () => buyGear(slot, e.key),
            });
          },
        },
        h('span', { class: 'el-fx ' + e.fx }),
        h('div', { class: 'el-ic' }, e.icon),
        h('div', { class: 'el-nm' }, e.name),
        h('div', { class: 'el-rar r-' + e.rarity }, RARITY_NAME[e.rarity] || e.rarity),
        h('div', { class: 'el-price tnum' },
          on ? '★ Equipped' : e.found ? '✓ Owned' : e.source === 'shop' ? '🪙 ' + e.price : '🔒 Locked'));
      }))));
  }
  // Which egg to crack, and how many. Shop eggs cost coins; the five boss eggs
  // are spent from the ones the Goose Trail dropped on you.
  function openEggPicker() {
    const held = (gear && gear.eggs) || {};
    const maxBatch = (gear && gear.maxBatch) || fcat().maxBatch || 10;
    const all = fcat().pouches || [];
    const shopEggs = all.filter(p => p.source === 'shop');
    const bossEggs = all.filter(p => p.source !== 'shop');
    openModal((close) => {
      let n = 1;
      const countRow = h('div', { class: 'eggn' });
      const grid = h('div', { class: 'pgrid' });
      const paintCount = () => setKids(countRow, ...[1, 5, 10].filter(x => x <= maxBatch).map(x =>
        h('button', { class: 'eggn-b' + (n === x ? ' on' : ''), onClick: () => { n = x; paintCount(); paintEggs(); } }, '×' + x)));
      const paintEggs = () => setKids(grid, ...[...shopEggs, ...bossEggs].map(p => {
        const have = held[p.key] || 0;
        const isShop = p.source === 'shop';
        const cost = isShop ? p.price * n : n;
        const can = isShop ? coins >= cost : have >= n;
        return h('button', {
          class: 'pcardt' + (can ? '' : ' broke') + (isShop ? '' : ' boss'),
          onClick: () => { if (!can) { say(pick(MERCH_BROKE), 'no'); return; } close(); crackEggs(p.key, n); },
        },
        h('div', { class: 'pt-top' }, h('span', { class: 'pt-ic' }, p.icon), h('span', { class: 'pt-nm' }, p.name),
          h('span', { class: 'pt-pr tnum' }, isShop ? '🪙 ' + cost : have ? '×' + have + ' held' : 'locked')),
        h('div', { class: 'pt-note' }, isShop ? p.note : p.note + ' · only from a Goose Trail boss'),
        h('div', { class: 'pt-bar' }, ...['common', 'rare', 'epic', 'legendary']
          .filter(r => p.weights[r] > 0)
          // a 3% segment is too narrow to hold "3%" — the label spills out
          .map(r => h('span', { class: 'pt-seg r-' + r, style: 'flex:' + p.weights[r] }, p.weights[r] >= 8 ? p.weights[r] + '%' : ''))));
      }));
      paintCount(); paintEggs();
      return h('div', {},
        h('h2', {}, '🥚 Goose Eggs'),
        h('div', { class: 'msub' }, 'One item, charm, skin or stone per egg. The odds are printed, not hidden.'),
        h('div', { class: 'eggnwrap' }, h('span', { class: 'eggn-l' }, 'Open'), countRow, h('span', { class: 'eggn-l' }, 'at once')),
        grid);
    });
  }

  // Every pull, single or batch, becomes one flat row. One shape to render
  // means the reveal never has to care how many eggs you cracked.
  function prizeRow(r) {
    const def = r.def || {};
    const rar = r.rarity || def.rarity || 'common';
    const ic = def.icon || '❔';
    const nm = def.name || r.key;
    if (r.prize === 'element') return r.kind === 'new'
      ? { icon: ic, name: nm, rarity: rar, tag: 'NEW', note: 'equip it in the shop', good: true, fx: def.fx }
      : { icon: ic, name: nm, rarity: rar, tag: 'dupe', note: 'melted for 🪙 ' + r.refund };
    if (r.prize === 'stone') return { icon: ic || '💠', name: nm, rarity: rar, tag: 'STONE', note: 'you now hold ' + r.stones, good: true };
    if (r.prize === 'skin') return r.kind === 'new'
      ? { icon: '🎨', name: nm, rarity: rar, tag: 'SKIN', note: 'repaint any gear', good: true }
      : { icon: '🎨', name: nm, rarity: rar, tag: 'dupe', note: 'melted for 🪙 ' + r.refund };
    if (r.kind === 'new') return { icon: ic, name: nm, rarity: rar, tag: r.gilded ? 'GILDED' : 'NEW', note: r.gilded ? 'found golden' : 'charm', good: true, gild: r.gilded };
    if (r.kind === 'gild') return { icon: ic, name: nm, rarity: rar, tag: 'GILDED', note: 'a duplicate made it golden', good: true, gild: true };
    return { icon: ic, name: nm, rarity: rar, tag: 'dupe', note: 'melted for 🪙 ' + r.refund };
  }

  // The reveal. Deliberately quiet: a list that fills in, not a firework show.
  // Rows land one at a time so ten eggs still read as ten separate results.
  function openReveal(tier, rows, note) {
    const best = ['legendary', 'epic', 'rare', 'common'].find(r => rows.some(x => x.rarity === r)) || 'common';
    openModal((close) => {
      const list = h('div', { class: 'rvlist' });
      rows.forEach((row, i) => {
        const el = h('div', { class: 'rvrow r-' + row.rarity + (row.good ? ' good' : '') + (row.gild ? ' gild' : ''), style: 'animation-delay:' + (i * 80) + 'ms' },
          h('div', { class: 'rv-ic' }, row.fx ? h('span', { class: 'is-fx ' + row.fx }) : null, h('span', {}, row.icon)),
          h('div', { class: 'rv-b' },
            h('div', { class: 'rv-nm' }, row.name),
            h('div', { class: 'rv-note' }, row.note)),
          h('div', { class: 'rv-tag r-' + row.rarity }, row.tag));
        list.append(el);
      });
      return h('div', {},
        h('div', { class: 'rvhead r-' + best },
          h('span', { class: 'rv-egg' }, pouchOf(tier).icon),
          h('div', {}, h('h2', { style: 'margin:0' }, rows.length === 1 ? pouchOf(tier).name : rows.length + ' × ' + pouchOf(tier).name),
            h('div', { class: 'msub', style: 'margin:2px 0 0' }, note))),
        list,
        h('button', { class: 'btn prim', style: 'margin-top:14px', onClick: close }, h('div', { class: 'in' }, 'Nice')));
    });
  }

  async function crackEggs(tierKey = 'golden', n = 1) {
    if (busy) return; busy = true; paintBody();
    try {
      const r = await api('forge/pouch', { method: 'POST', body: { tier: tierKey, n } });
      const results = r.batch ? r.results : [r];
      setCoins(r.coins);
      const rows = results.map(prizeRow);
      const news = rows.filter(x => x.good).length;
      const legend = rows.some(x => x.rarity === 'legendary');
      // one small burst, and only when something genuinely rare turned up
      if (legend) confetti({ count: 90, colors: ['#ffd36a', '#fff6d0', '#b06bff'] });
      else if (news) confetti({ count: 30, colors: ['#8ee9f7', '#c9a7ff'] });
      openReveal(tierKey, rows, (r.stopped ? 'stopped early — ' + r.stopped : news + ' of ' + rows.length + ' were new'));
      say(news ? pick(MERCH_BUY) : 'All duplicates. That is gambling, friend.', news ? 'happy' : 'no');
    } catch (e) { toast(e.message, 'err'); say(pick(MERCH_BROKE), 'no'); }
    busy = false;
    gear = await api('forge').catch(() => gear);
    if (gear) setCoins(gear.coins);
    paintBody();
  }

  function gearCounter() {
    if (!gear) return h('div', { class: 'empty' }, 'Could not reach the gear counter.');
    const bySlot = new Map(gear.items.map(i => [i.slot, i]));
    const C = gear.charms;
    return h('div', {},
      h('div', { class: 'sechead' },
        h('h3', {}, 'Equipment'),
        h('p', {}, 'One of each. Pick an element, then the blacksmith makes it stronger.')),
      h('div', { class: 'buygrid' }, ...(fcat().slots || []).map(sl => {
        const g = bySlot.get(sl.key) || {};
        // only BUYABLE items have a price — pouch-only ones are 0 and would
        // otherwise make every card read "from 🪙0"
        const prices = ((gear && gear.elements) || fcat().elements || [])
          .filter(e => e.slot === sl.key && e.source === 'shop' && e.price > 0).map(e => e.price);
        const from = prices.length ? Math.min(...prices) : null;
        return h('div', { class: 'buycard' + (g.owned ? ' have' : '') },
          h('div', { class: 'bc-ic' }, g.owned ? elemOf(g.element).icon : sl.icon),
          h('div', { class: 'bc-b' },
            h('div', { class: 'bc-nm' }, g.owned ? elemOf(g.element).name : sl.name),
            h('div', { class: 'bc-note' }, g.owned
              ? statMeta(sl.stat).name + ' +' + pct(g.bonus) + ' · ' + stageOf(g.stage).name
              : statMeta(sl.stat).note)),
          g.owned
            ? h('div', { class: 'bc-act' },
              h('button', { class: 'shop-btn buy', disabled: busy || undefined, onClick: () => openElementPicker(sl.key) },
                'Swap', h('span', { class: 'g-cost tnum' }, 'keeps +' + g.level)),
              h('button', { class: 'shop-btn equip', onClick: () => navigate('#/forge') }, '+' + g.level + ' · Upgrade'))
            : h('button', { class: 'shop-btn buy', disabled: busy || undefined, onClick: () => openElementPicker(sl.key) },
              'Choose', from ? h('span', { class: 'g-cost tnum' }, 'from 🪙' + from) : null));
      })),
      h('div', { class: 'sechead', style: 'margin-top:22px' },
        h('h3', {}, 'Goose Eggs'),
        h('p', {}, 'The ONLY way to find the other ' + ((gear.elementsTotal || 26) - 3) + ' items. Also drops charms, skins and stones.')),
      h('div', { class: 'pouch' },
        h('div', { class: 'pouch-b' },
          h('div', { class: 'pouch-t' }, '🥚 Crack an egg'),
          h('div', { class: 'pouch-n' }, (gear.elementsFound || 0) + '/' + (gear.elementsTotal || 0) + ' items · '
            + C.owned.length + '/' + C.total + ' charms · stones ' + (Object.entries(gear.stones || {}).map(([k, v]) => stoneOf(k).icon + v).join(' ') || '—')),
          Object.keys(gear.eggs || {}).length
            ? h('div', { class: 'pouch-held' }, 'Held: ' + Object.entries(gear.eggs).map(([k, v]) => pouchOf(k).icon + '×' + v).join('  '))
            : null),
        h('button', { class: 'shop-btn buy', disabled: busy || undefined, onClick: openEggPicker },
          'Open', h('span', { class: 'g-cost tnum' }, 'from 🪙' + Math.min(...(fcat().pouches || []).filter(p => p.source === 'shop' && p.price > 0).map(p => p.price)))))); 
  }

  /* ---- layout ---- */
  const catRow = h('div', { class: 'shop-tabs' });
  const filterRow = h('div', { class: 'shop-filters' });
  const bodyEl = h('div', { class: 'shop-body' });
  const saleWrap = h('div', { class: 'flash-grid' });
  const flashBox = h('div', { class: 'flash' });

  function paintCats() {
    setKids(catRow, ...SHOP_CATS.map(c => {
      const n = c.key === 'gear' ? null : itemsFor(c.key);
      return h('button', { class: 'shtab' + (cat === c.key ? ' on' : ''), onClick: () => { cat = c.key; state.shopCat = c.key; own = 'all'; rare = 'all'; paint(); } },
        h('span', { class: 'shtab-l' }, c.label),
        n ? h('span', { class: 'shtab-n tnum' }, n.filter(i => i.owned).length + '/' + n.length) : null);
    }));
  }
  function paintFilters() {
    if (cat === 'gear') { filterRow.replaceChildren(); return; }
    const all = itemsFor(cat);
    const chip = (label, on, fn, cls) => h('button', { class: 'fchip' + (on ? ' on' : '') + (cls ? ' ' + cls : ''), onClick: fn }, label);
    const set = (fn) => () => { fn(); paint(); };
    setKids(filterRow,
      h('div', { class: 'frow' },
        chip('All ' + all.length, own === 'all', set(() => { own = 'all'; })),
        chip('Owned ' + all.filter(i => i.owned).length, own === 'owned', set(() => { own = 'owned'; })),
        chip('Wanted ' + all.filter(i => !i.owned).length, own === 'new', set(() => { own = 'new'; }))),
      h('div', { class: 'frow' },
        chip('Any rarity', rare === 'all', set(() => { rare = 'all'; })),
        ...RARITY_ORDER.filter(r => all.some(i => i.rarity === r))
          .map(r => chip(RARITY_NAME[r], rare === r, set(() => { rare = r; }), 'r-' + r))),
      h('div', { class: 'frow' },
        h('span', { class: 'fsort-l' }, 'Sort'),
        chip('Rarity', sort === 'rarity', set(() => { sort = 'rarity'; })),
        chip('Price', sort === 'price', set(() => { sort = 'price'; })),
        chip('A–Z', sort === 'name', set(() => { sort = 'name'; }))));
  }
  function paintBody() {
    if (cat === 'gear') { setKids(bodyEl, gearCounter()); return; }
    const list = visible();
    setKids(bodyEl, list.length
      ? h('div', { class: 'shop-grid' }, ...list.map(itemCard))
      : h('div', { class: 'empty' }, 'Nothing matches that filter. The goose shrugs.'));
  }
  function paintSale() {
    const rows = shop.sale.items
      .map(si => { const full = itemsFor(si.kind).find(i => i.key === si.key); return full ? { ...full, price: si.price, base: si.base, onSale: true } : null; })
      .filter(Boolean);
    saleWrap.replaceChildren(...rows.map(itemCard));
  }
  function paint() { paintCats(); paintFilters(); paintBody(); paintSale(); }
  paint();

  const timerEl = h('span', { class: 'flash-timer tnum' }, fmtCountdown(shop.sale.endsAt - Date.now()));
  setKids(flashBox,
    h('div', { class: 'flash-head' },
      h('div', { class: 'flash-ttl' }, '⚡ Golden Hour — ' + Math.round(shop.sale.discount * 100) + '% off'),
      h('div', { class: 'flash-cd' }, 'ends in ', timerEl)),
    saleWrap);

  const root = h('div', { class: 'shop' },
    hubNav('shop'),
    purse,
    h('div', { class: 'stall' },
      h('div', { class: 'stall-roof' }, h('span', { class: 'lant l1' }), h('span', { class: 'lant l2' }), h('span', { class: 'lant l3' }), h('span', { class: 'lant l4' })),
      h('div', { class: 'stall-sign' }, h('span', { class: 'sg-ic' }, '🍜'), h('b', {}, 'GOOSE NOODLE'), h('i', {}, 'ก๋วยเตี๋ยวห่าน')),
      h('div', { class: 'stall-stage', onClick: honk, title: 'Honk!' },
        h('span', { class: 'steam s1' }), h('span', { class: 'steam s2' }), h('span', { class: 'steam s3' }),
        gooseEl,
        h('div', { class: 'stall-counter' }, h('span', { class: 'bowl' }, '🍜'), h('span', { class: 'bowl b2' }, '🥢'))),
      sayEl),
    flashBox, catRow, filterRow, bodyEl,
    h('div', { class: 'shop-foot' }, 'Coins buy looks and gear only — never Elo, a title or a rank.'));

  mount.replaceChildren(
    h('div', { class: 'pagehead withact' }, h('h1', {}, 'Shop'),
      h('div', { class: 'subtle' }, 'The noodle goose sells gear, frames, cards and Goose Eggs'),
      h('div', { class: 'phact' }, menuBtn())),
    root);

  let tick = 0;
  const iv = setInterval(() => {
    if (!root.isConnected) { clearInterval(iv); return; }
    const left = shop.sale.endsAt - Date.now();
    timerEl.textContent = fmtCountdown(left);
    if (left <= 0) { clearInterval(iv); viewShop(mount); return; }
    if (++tick % 10 === 0) say(pick(MERCH_GREET));
  }, 1000);
}

/* ---------------------------------------------------------- the inventory */
async function viewInventory(mount) {
  const [data, prof] = await Promise.all([
    api('forge'),
    api('profile/' + state.me.id).catch(() => ({ elo: null, rank: null, stats: { matches: 0 } })),
  ]);
  const tier = prof.elo != null ? tierFor(prof.elo, prof.rank, prof.stats.matches) : TIERS[0];
  const equipped = {
    frame: (state.me.settings && state.me.settings.frame) || 'auto',
    card: (state.me.settings && state.me.settings.card) || 'none',
    wear: (state.me.settings && state.me.settings.wear) || 'none',
  };
  let view = ['all', 'gear', 'charm'].includes(state.invView) ? state.invView : 'all';
  let busy = false, gear = data;
  const purse = purseBar(gear.coins);

  async function act(fn) {
    if (busy) return; busy = true; paint();
    try { await fn(); } catch (e) { toast(e.message, 'err'); }
    busy = false;
    gear = await api('forge'); purse.set(gear.coins); paint();
  }
  const equipCharm = (key, slot) => act(async () => {
    await api('forge/charm', { method: 'POST', body: { key, slot } });
    toast(slot === null ? 'Back in the box' : 'Charm slotted', 'ok');
  });
  const setSkin = (slot, skin, name) => act(async () => {
    await api('forge/skin', { method: 'POST', body: { slot, skin } });
    toast(slotOf(slot).name + ' → ' + name, 'ok');
  });

  const bodyEl = h('div', {});
  function paint() {
    const C = gear.charms;
    const bySlot = new Map(gear.items.map(i => [i.slot, i]));
    const charmBySlot = new Map(C.owned.filter(x => x.slot != null).map(x => [x.slot, x]));
    const spare = C.owned.filter(x => x.slot == null)
      .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || a.name.localeCompare(b.name));
    const freeSlot = () => { for (let i = 0; i < C.slots; i++) if (!charmBySlot.has(i)) return i; return 0; };

    const dollSlot = (key, side) => {
      if (key === 'wear') {
        const w = wearMeta(equipped.wear);
        return h('button', { class: 'dslot ' + side + (w && w.emoji ? ' has' : ' bare'), onClick: () => navigate('#/shop') },
          h('div', { class: 'ds-ic' }, (w && w.emoji) || '🎩'),
          h('div', { class: 'ds-l' }, 'Wearable'),
          h('div', { class: 'ds-v' }, (w && w.name) || 'None'));
      }
      const g = bySlot.get(key); const sl = slotOf(key);
      if (!g || !g.owned) {
        const from = Math.min(...(fcat().elements || [{ price: 0 }]).map(e => e.price));
        return h('button', { class: 'dslot ' + side + ' bare', onClick: () => navigate('#/shop') },
          h('div', { class: 'ds-ic' }, sl.icon),
          h('div', { class: 'ds-l' }, sl.name),
          h('div', { class: 'ds-v buy' }, Number.isFinite(from) ? 'Buy 🪙' + from : 'Buy'));
      }
      return h('button', { class: 'dslot ' + side + ' has ' + elemOf(g.element).fx + (g.wink ? ' winked' : ''), onClick: () => navigate('#/forge') },
        g.fx ? h('span', { class: 'ds-fx ' + g.fx }) : null,
        h('div', { class: 'ds-ic' }, elemOf(g.element).icon),
        h('div', { class: 'ds-l' }, sl.name),
        h('div', { class: 'ds-v' }, '+' + g.level + (stageOf(g.stage).icon ? ' ' + stageOf(g.stage).icon : '')));
    };

    const showGear = view === 'all' || view === 'gear';
    const showCharm = view === 'all' || view === 'charm';
    const ownedGear = gear.items.filter(g => g.owned);

    setKids(bodyEl,
      h('div', { class: 'doll' },
        h('div', { class: 'dcol' }, dollSlot('racket', 'l'), dollSlot('shuttle', 'l')),
        h('div', { class: 'dmid' },
          h('div', { class: 'dava' + frameClass(tier, equipped.frame) }, state.me.avatar_emoji || '🏸', ...wearParts(equipped.wear)),
          h('div', { class: 'dnm' }, state.me.nickname),
          h('span', { class: 'tierbadge tb-' + tier.key }, (tier.apex ? '👑 ' : '◆ ') + tier.name)),
        h('div', { class: 'dcol' }, dollSlot('boots', 'r'), dollSlot('wear', 'r'))),

      h('div', { class: 'loadout' },
        h('div', { class: 'lo-k' }, 'YOUR BONUSES'),
        h('div', { class: 'lo-row' }, ...['coin', 'xp', 'luck', 'save'].map(k =>
          h('div', { class: 'lo-st' + (gear.stats[k] ? ' on' : '') },
            h('div', { class: 'lo-ic' }, statMeta(k).icon),
            h('div', { class: 'lo-v tnum' }, '+' + pct(gear.stats[k] || 0)),
            h('div', { class: 'lo-n' }, statMeta(k).name))))),

      h('div', { class: 'sechead' }, h('h3', {}, 'Charm slots'), h('p', {}, 'Invisible to everyone else. Tap one to take it off.')),
      h('div', { class: 'cslots' }, ...Array.from({ length: C.slots }, (_, i) => {
        const x = charmBySlot.get(i);
        if (!x) return h('button', { class: 'cslot empty', onClick: () => { view = 'charm'; state.invView = 'charm'; paint(); } },
          h('span', {}, '＋'), h('small', {}, 'Slot ' + (i + 1)));
        return h('button', { class: 'cslot filled r-' + x.rarity + (x.gilded ? ' gilded' : ''), disabled: busy || undefined, onClick: () => equipCharm(x.key, null) },
          h('div', { class: 'cs-ic' }, x.icon || '🔮'),
          h('div', { class: 'cs-nm' }, x.name),
          h('div', { class: 'cs-rm' }, 'tap to remove'));
      })),

      h('div', { class: 'seg invseg' }, ...[['all', 'All'], ['gear', 'Equipment'], ['charm', 'Charms']].map(([k, lbl]) =>
        h('button', { class: 's' + (view === k ? ' on' : ''), onClick: () => { view = k; state.invView = k; paint(); } }, lbl))),

      h('div', { class: 'invlist' },
        showGear ? h('div', { class: 'sechead' }, h('h3', {}, 'Equipment'), h('p', {}, ownedGear.length ? 'Repaint it here — upgrading happens at the blacksmith.' : 'You own none yet.')) : null,
        showGear && !ownedGear.length
          ? h('button', { class: 'btn prim', onClick: () => navigate('#/shop') }, h('div', { class: 'in' }, 'Buy your first racket'))
          : null,
        showGear ? h('div', { class: 'gear-grid' }, ...ownedGear.map(g => {
          const id = gearIdent(g);
          return h('div', { class: 'gear-card ' + id.e.fx + (g.wink ? ' winked' : '') },
            h('div', { class: 'g-head' },
              h('div', { class: 'g-ic' }, g.fx ? h('span', { class: 'ds-fx ' + g.fx }) : null, h('span', { class: 'g-em' }, id.e.icon)),
              h('div', { class: 'g-b' },
                h('div', { class: 'g-nm' }, id.title, g.wink ? h('span', { class: 'g-wink' }, '★ WINK') : null),
                h('div', { class: 'g-stat' }, statMeta(id.sl.stat).icon + ' ' + statMeta(id.sl.stat).name + ' +' + pct(g.bonus))),
              h('div', { class: 'g-lv tnum' }, '+' + g.level)),
            h('div', { class: 'g-track' }, ...Array.from({ length: g.max }, (_, i) => h('span', { class: 'g-pip' + (i < g.level ? ' on' : '') }))),
            subChips(g),
            gear.skins.owned.length > 1 ? h('div', { class: 'sk-opts' }, ...gear.skins.owned.map(sk =>
              h('button', {
                class: 'skopt r-' + sk.rarity + (sk.fx ? ' ' + sk.fx : '') + (g.skin === sk.key ? ' on' : ''),
                title: sk.name, disabled: busy || undefined, onClick: () => setSkin(g.slot, sk.key, sk.name),
              }))) : null,
            h('button', { class: 'shop-btn equip', onClick: () => navigate('#/forge') }, '⚒️ Take to the blacksmith'));
        })) : null,

        showCharm ? h('div', { class: 'sechead', style: showGear ? 'margin-top:22px' : '' },
          h('h3', {}, 'Charm box'), h('p', {}, spare.length + ' spare · tap one to slot it in')) : null,
        showCharm ? (spare.length
          ? h('div', { class: 'cgrid' }, ...spare.map(x =>
            h('button', { class: 'ccard r-' + x.rarity + (x.gilded ? ' gilded' : ''), disabled: busy || undefined, onClick: () => equipCharm(x.key, freeSlot()) },
              x.gilded ? h('div', { class: 'c-gild' }, '✨ GILDED') : null,
              h('div', { class: 'c-top' }, h('span', { class: 'c-ic' }, x.icon || '🔮'), h('span', { class: 'c-nm' }, x.name)),
              h('div', { class: 'c-rar r-' + x.rarity }, RARITY_NAME[x.rarity]),
              statLine(x.stats),
              h('div', { class: 'c-note' }, x.note))))
          : h('div', { class: 'empty' }, 'No spare charms — crack a Goose Egg at the shop.')) : null,
        showCharm ? h('div', { class: 'sechead', style: 'margin-top:22px' },
          h('h3', {}, 'Undiscovered'), h('p', {}, C.locked.length + ' still out there. The icon hints where it comes from.')) : null,
        showCharm ? h('div', { class: 'lockgrid' }, ...C.locked.map(x =>
          h('div', { class: 'lockchip r-' + x.rarity, title: srcMeta(x.source).note },
            h('span', { class: 'lk-q' }, '?'),
            h('span', { class: 'lk-r' }, RARITY_NAME[x.rarity]),
            h('span', { class: 'lk-s' }, srcMeta(x.source).icon)))) : null),

      h('div', { class: 'shop-foot' }, 'Gear and charms speed up coins and XP. They can never change a score, a rating or a rank.'));
  }
  paint();

  mount.replaceChildren(
    h('div', { class: 'pagehead withact' }, h('h1', {}, 'Inventory'),
      h('div', { class: 'subtle' }, 'Everything you own, and what is equipped where'),
      h('div', { class: 'phact' }, menuBtn())),
    h('div', { class: 'shop' }, hubNav('inv'), purse, bodyEl));
}

/* --------------------------------------------------------- the blacksmith */
const SMITH_GREET = [
  'Metal does not lie. Unlike my brother at the noodle counter.',
  'Bring coins. Bring hope. I mostly need the coins.',
  'Every +9 you see was a +8 that got lucky. Remember that.',
  'I can make it stronger. I cannot make it certain.',
  'The anvil has never once apologised. Neither will I.',
  'ตีเหล็กต้องตีตอนร้อน เอาเหรียญมาก่อน 🔨',
];
const SMITH_WIN = ['CLANG. It held.', 'Stronger. Barely. But stronger.', 'The metal agreed with me today.', 'Good. Now do it again, braver.'];
const SMITH_LOSE = ['It cracked. The anvil is not sorry.', 'Metal said no. Metal often says no.', 'That is the game. Swing again.', 'พังจ้า ตีใหม่ 🔨'];
const SMITH_WINK = ['A WINK! Do you know how rare that is? Neither do I. Rare.', 'The metal WINKED at you. Show everyone. Immediately.'];

async function viewForge(mount) {
  let gear = await api('forge');
  let busy = false;
  // Which slots have the "spend a stone, skip the dice" box ticked. Per slot,
  // and deliberately NOT remembered across visits — a guarantee should be a
  // decision you make, never something you forget is armed.
  const guarantee = {};
  const purse = purseBar(gear.coins);
  const smithEl = h('div', { class: 'smith-goose' }, '🪿');
  const sayEl = h('div', { class: 'merch-say' }, SMITH_GREET[0]);
  function smith(txt, cls) {
    sayEl.className = 'merch-say' + (cls ? ' ' + cls : '');
    sayEl.textContent = txt;
    sayEl.style.animation = 'none'; void sayEl.offsetWidth; sayEl.style.animation = '';
  }
  function clang() { smithEl.classList.remove('swing'); void smithEl.offsetWidth; smithEl.classList.add('swing'); }

  async function act(fn) {
    if (busy) return; busy = true; paint();
    try { await fn(); } catch (e) { toast(e.message, 'err'); }
    busy = false;
    gear = await api('forge'); purse.set(gear.coins); paint();
  }
  const doSwing = (slot, guarantee = false) => act(async () => {
    const r = await api('forge/swing', { method: 'POST', body: { slot, guarantee } });
    clang();
    if (r.ok) {
      toast(r.guaranteed ? '💠 Guaranteed — +' + r.to : '+' + r.to + '!', 'ok');
      confetti({ count: 60, colors: ['#c8ccd4', '#ffd36a'] });
      smith(r.guaranteed ? 'A stone well spent. No drama.' : pick(SMITH_WIN), 'happy');
    } else if (r.saved) {
      toast('🛡️ Temper held — no level lost', 'ok'); smith('Your charm caught that one. Lucky.', 'happy');
    } else {
      toast(r.to < r.from ? 'Failed — dropped to +' + r.to : 'Failed', 'err');
      smith(pick(SMITH_LOSE), 'no');
    }
  });
  const doEvolve = (slot) => act(async () => {
    const r = await api('forge/evolve', { method: 'POST', body: { slot } });
    const line = r.sub ? statMeta(r.sub.stat).name + ' +' + r.sub.val + '%' : '';
    // A Wink can only ever happen right here, so it gets the big moment.
    if (r.wink) {
      confetti({ count: 160, colors: ['#ffd36a', '#fff6d0', '#ff9fae'] });
      party('★ WINK!', slotOf(slot).name + ' · ' + r.stageName, 'permanently 20% stronger · ' + line, ['#ffd36a', '#fff6d0', '#ff9fae']);
      smith('A WINK. On my anvil. I have to sit down.', 'happy');
    } else if (r.grade === 'omni') {
      confetti({ count: 200, colors: ['#b06bff', '#ffd36a', '#fff6d0'] });
      party('❉ OMNISCIENT', r.stageName + ' · ' + line, 'the stone gave everything it had', ['#b06bff', '#ffd36a']);
      smith('OMNISCIENT, on an evolution. Unheard of.', 'happy');
    } else {
      confetti({ count: 120, colors: ['#5ac8fa', '#ffd36a', '#fff6d0'] });
      party('EVOLVED · ' + r.stageName, slotOf(slot).name, (r.stoneIcon || '') + ' socket ' + r.sockets + ' filled · ' + line, ['#5ac8fa', '#ffd36a']);
      smith('Reborn. The stone is in it now.', 'happy');
    }
  });
  const doBless = (slot, stone, socket) => act(async () => {
    const r = await api('forge/bless', { method: 'POST', body: { slot, stone, socket } });
    const line = statMeta(r.sub.stat).name + ' +' + r.sub.val + '%';
    if (r.grade === 'omni') {
      confetti({ count: 200, colors: ['#b06bff', '#ffd36a', '#fff6d0', '#8ee9f7'] });
      party('❉ OMNISCIENT', line, 'triple value · the mythic glow', ['#b06bff', '#ffd36a', '#fff6d0']);
      smith('OMNISCIENT. I have made four of those. Ever.', 'happy');
    } else if (r.grade === 'heavenly') {
      confetti({ count: 160, colors: ['#ffd36a', '#fff6d0'] });
      party('✧ HEAVENLY', line, 'double value', ['#ffd36a', '#fff6d0']);
      smith('Heavenly. The anvil sang. It never sings.', 'happy');
    } else if (r.grade === 'super') {
      confetti({ count: 110, colors: ['#c9a7ff', '#8ee9f7'] });
      party('✦ SUPER BLESSED', line, '+50% value', ['#c9a7ff', '#8ee9f7']);
      smith('Super blessed. Do not get used to it.', 'happy');
    } else {
      confetti({ count: 60, colors: ['#8ee9f7'] });
      toast('Blessed — ' + line, 'ok');
      smith('A clean socket. Nothing fancy. It counts.', 'happy');
    }
  });
  // Which socket to reroll, then which stone to spend on it. Evolving already
  // filled every socket, so this is always a gamble against a line you own.
  function openSocketPicker(g) {
    const subs = g.subs || [];
    if (subs.length <= 1) return openStonePicker(g.slot, 0);
    openModal((close) => h('div', {},
      h('h2', {}, 'Reroll which socket?'),
      h('div', { class: 'msub' }, 'The new line REPLACES the old one — better or worse. That is the gamble.'),
      h('div', { class: 'skgrid' }, ...subs.map((s, i) => h('button', {
        class: 'skcard' + (s.fx ? ' ' + s.fx : ''),
        onClick: () => { close(); openStonePicker(g.slot, i); },
      },
      h('div', { class: 'sk-n' }, 'Socket ' + (i + 1)),
      h('div', { class: 'sk-v' }, statMeta(s.stat).icon + ' ' + statMeta(s.stat).name + ' +' + s.val + '%'),
      h('div', { class: 'sk-g' }, (BLESS_NAME[s.grade] || 'Blessed')))))));
  }
  // Which stone to spend. The odds are printed so the choice is informed.
  function openStonePicker(slot, socket) {
    const bag = gear.stones || {};
    openModal((close) => h('div', {},
      h('h2', {}, 'Choose a stone'),
      h('div', { class: 'msub' }, 'Rerolling socket ' + ((socket | 0) + 1) + '. A better stone does not change what you get — only how good it is.'),
      h('div', { class: 'stgrid' }, ...(fcat().stones || []).map(s => {
        const have = bag[s.key] || 0;
        return h('button', {
          class: 'stcard r-' + s.rarity + (have > 0 ? '' : ' broke'),
          disabled: have > 0 ? undefined : true,
          onClick: () => { close(); doBless(slot, s.key, socket); },
        },
        h('div', { class: 'st-top' },
          h('span', { class: 'st-ic' }, s.icon),
          h('span', { class: 'st-nm' }, s.name),
          h('span', { class: 'st-have tnum' }, '×' + have)),
        h('div', { class: 'st-note' }, s.note),
        h('div', { class: 'st-odds' }, ...(fcat().grades || []).map(g =>
          h('span', { class: 'st-o ' + (g.fx || 'st-plain') },
            g.name.replace(' Blessed', '') + ' ' + Math.round((s.odds[g.key] || 0) * 100) + '%'))));
      }))));
  }

  const bodyEl = h('div', {});
  function paint() {
    const owned = gear.items.filter(g => g.owned);
    setKids(bodyEl,
      h('div', { class: 'smithy', onClick: () => smith(pick(SMITH_GREET)) },
        h('span', { class: 'spark p1' }), h('span', { class: 'spark p2' }), h('span', { class: 'spark p3' }),
        smithEl, h('div', { class: 'anvil' })),
      sayEl,
      owned.length ? null : h('div', { class: 'emptybox' },
        h('div', { class: 'eb-t' }, 'Nothing to hammer'),
        h('div', { class: 'eb-n' }, 'The blacksmith upgrades gear you already own. Buy a racket, shoes or a shuttle first.'),
        h('button', { class: 'btn prim', onClick: () => navigate('#/shop') }, h('div', { class: 'in' }, 'Go to the shop'))),
      h('div', { class: 'gear-grid' }, ...owned.map(g => {
        const id = gearIdent(g);
        const gStone = gear.guaranteeStone || 'bless';
        const gHave = (gear.stones || {})[gStone] || 0;
        return h('div', { class: 'gear-card ' + id.e.fx + (g.wink ? ' winked' : '') + (g.aura ? ' ' + g.aura : '') },
          g.aura ? h('span', { class: 'g-aura' }) : null,
          h('div', { class: 'g-head' },
            h('div', { class: 'g-ic' }, g.fx ? h('span', { class: 'ds-fx ' + g.fx }) : null, h('span', { class: 'g-em' }, id.e.icon)),
            h('div', { class: 'g-b' },
              h('div', { class: 'g-nm' }, id.title, g.wink ? h('span', { class: 'g-wink' }, '★ WINK') : null),
              h('div', { class: 'g-stat' }, statMeta(id.sl.stat).icon + ' ' + statMeta(id.sl.stat).name + ' +' + pct(g.bonus),
                g.stageMult > 1 ? h('span', { class: 'g-mult' }, '×' + g.stageMult + ' ' + id.st.name) : null)),
            h('div', { class: 'g-lv tnum' }, '+' + g.level)),
          h('div', { class: 'g-track' }, ...Array.from({ length: g.max }, (_, i) => h('span', { class: 'g-pip' + (i < g.level ? ' on' : '') }))),
          subChips(g),
          // rerolling a socket you already own — the endgame chase
          g.canBless ? h('button', {
            class: 'shop-btn bless' + (Object.values(gear.stones || {}).reduce((a, b) => a + b, 0) > 0 ? '' : ' broke'), disabled: busy || undefined,
            onClick: () => openSocketPicker(g),
          }, '💠 Reroll a socket', h('span', { class: 'g-cost tnum' }, Object.values(gear.stones || {}).reduce((a, b) => a + b, 0) + ' stones')) : null,
          !g.capped
            ? h('div', { class: 'g-act' },
              h('button', { class: 'shop-btn buy' + (gear.coins >= g.cost ? '' : ' broke'), disabled: busy || undefined, onClick: () => doSwing(g.slot, guarantee[g.slot] === true) },
                (guarantee[g.slot] ? '💠 Guaranteed +' : '⚒️ Forge to +') + (g.level + 1), h('span', { class: 'g-cost tnum' }, '🪙 ' + g.cost)),
              // the answer to "70% is too hard": pay a stone, skip the dice
              h('label', { class: 'gchk' + (gHave > 0 ? '' : ' off') + (guarantee[g.slot] ? ' on' : '') },
                h('input', {
                  type: 'checkbox', checked: guarantee[g.slot] === true || undefined,
                  disabled: gHave > 0 ? undefined : true,
                  onChange: (e) => { guarantee[g.slot] = e.target.checked; paint(); },
                }),
                h('span', {}, gHave > 0
                  ? 'Spend a ' + stoneOf(gStone).icon + ' ' + stoneOf(gStone).name + ' to make this 100%'
                  : 'No ' + stoneOf(gStone).name + 's for a guaranteed swing'),
                h('span', { class: 'gchk-n tnum' }, '×' + gHave)),
              h('div', { class: 'g-odds' },
                h('span', { class: 'g-ok' }, guarantee[g.slot] ? '100% guaranteed' : g.odds + '% success'),
                (!guarantee[g.slot] && g.pity > 0) ? h('span', { class: 'g-pity', title: g.fails + ' fails in a row' }, '+' + g.pity + '% pity') : null,
                h('span', { class: 'g-next' }, '→ +' + pct(g.nextBonus)),
                (g.dropRisk && !guarantee[g.slot]) ? h('span', { class: 'g-risk' }, '⚠ a fail drops you to +' + (g.level - 1)) : null),
              h('div', { class: 'g-odds' }, h('span', { class: 'g-next' }, 'evolve unlocks at +' + g.max + ' · ★ Wink only on evolve')))
            : (g.canEvolve
              ? h('div', { class: 'g-act' },
                h('button', {
                  class: 'shop-btn evolve' + (gear.coins >= g.evolveCost && g.haveEvolveStone > 0 ? '' : ' broke'),
                  disabled: busy || undefined, onClick: () => doEvolve(g.slot),
                },
                '✦ Evolve to ' + g.nextStageName,
                h('span', { class: 'g-cost tnum' }, '🪙 ' + g.evolveCost + ' + ' + g.evolveStoneIcon)),
                h('div', { class: 'g-odds' },
                  h('span', { class: g.haveEvolveStone > 0 ? 'g-ok' : 'g-risk' },
                    g.evolveStoneIcon + ' ' + g.evolveStoneName + ' ×' + g.haveEvolveStone + (g.haveEvolveStone > 0 ? '' : ' — you need one')),
                  h('span', { class: 'g-next' }, 'stat ×' + g.nextMult)),
                h('div', { class: 'g-odds' },
                  h('span', { class: 'g-next' }, 'fills socket ' + g.nextSockets + ' of 3 with that stone'),
                  g.wink ? null : h('span', { class: 'g-ok' }, '★ ' + Math.round((fcat().winkBase || 0.12) * 100) + '% Wink')))
              : h('div', { class: 'shop-eq on' }, '✓ Transcendent +9 — nothing above this')));
      })),
      h('div', { class: 'shop-foot' }, 'Evolve only at +9. Each evolution costs a stone — 💠 Bless, then 🔯 Sacred, then ✴️ Divine — ' +
        'raises the stat, fills the socket it opens, and is the ONLY chance of a ★ Wink. ' +
        'Grade depends on the stone: ' + (fcat().grades || []).map(x => x.name + ' ×' + x.mult).join(' · ')));
  }
  paint();

  mount.replaceChildren(
    h('div', { class: 'pagehead withact' }, h('h1', {}, 'Blacksmith'),
      h('div', { class: 'subtle' }, 'Upgrade +1 → +9, then evolve to the next tier'),
      h('div', { class: 'phact' }, menuBtn())),
    h('div', { class: 'shop' }, hubNav('forge'), purse, bodyEl));
}

/* --------------------------------------------------------- the goose trail */
// The campaign. Gear finally has somewhere to be used: Power decides whether
// you clear a stage, Crit doubles the payout, Lifesteal hands the egg back.
// Attempts are paid for in Goose Eggs, and eggs only come from real matches —
// so there is no way to grind this without turning up to the court.
const TRAIL_TAUNT = {
  win: ['Cleared. The goose nods, once.', 'Down it goes. Next.', 'That is how it is done.', 'ผ่านแล้ว 🪿'],
  lose: ['Beaten. The egg is gone. Such is the trail.', 'Not this time. Bring more racket.', 'It swatted you. Go forge something.', 'แพ้! ไปอัพของก่อน'],
};
function combatStrip(c, power) {
  if (!c) return null;
  const st = (icon, label, val, cls) => h('div', { class: 'cbt ' + cls },
    h('span', { class: 'cbt-ic' }, icon), h('span', { class: 'cbt-v tnum' }, val), h('span', { class: 'cbt-l' }, label));
  return h('div', { class: 'cbtrow' },
    st('💥', 'Damage', String(power), 'dmg'),
    st('🎯', 'Crit', c.crit + '%', 'crit'),
    st('🩸', 'Lifesteal', c.lifesteal + '%', 'life'));
}
// The result of one run. Same quiet list as the egg reveal — no firework show.
function openTrailResult(r, stage) {
  const rows = (r.drops || []).map(d => ({
    icon: d.icon || '❔', name: d.name || d.key,
    rarity: d.rarity || 'common',
    tag: d.kind === 'coins' ? '🪙' : d.kind.toUpperCase(),
    note: d.kind === 'coins' ? '+' + d.amount : d.note || (d.qty ? 'you now hold ' + d.qty : 'added to your collection'),
    good: d.kind !== 'coins',
  }));
  openModal((close) => h('div', {},
    h('div', { class: 'rvhead ' + (r.won ? 'r-legendary' : 'r-common') },
      h('span', { class: 'rv-egg' }, r.won ? stage.icon : '💀'),
      h('div', {}, h('h2', { style: 'margin:0' }, r.won ? (r.firstClear ? 'STAGE CLEARED' : 'Cleared again') : 'Defeated'),
        h('div', { class: 'msub', style: 'margin:2px 0 0' }, stage.enemy + ' · ' + r.chance + '% odds'))),
    h('div', { class: 'trres' },
      h('div', { class: 'trr' }, h('span', {}, '🪙 Coins'), h('b', { class: 'tnum' }, '+' + r.coins)),
      r.crit ? h('div', { class: 'trr crit' }, h('span', {}, '🎯 CRITICAL HIT'), h('b', {}, 'double coins · extra drop')) : null,
      r.lifesteal ? h('div', { class: 'trr life' }, h('span', {}, '🩸 Lifesteal'), h('b', {}, 'your egg was returned')) : null,
      h('div', { class: 'trr' }, h('span', {}, '🥚 Eggs left'), h('b', { class: 'tnum' }, String(r.eggs)))),
    r.egg ? h('div', { class: 'trprize egg' }, h('span', { class: 'tp-ic' }, r.egg.icon),
      h('div', {}, h('b', {}, r.egg.name + ' dropped!'), h('div', { class: 'rv-note' }, 'crack it at the shop · you hold ' + r.egg.qty))) : null,
    r.relic ? h('div', { class: 'trprize relic' }, h('span', { class: 'tp-ic' }, r.relic.icon),
      h('div', {}, h('b', {}, 'RELIC — ' + r.relic.name), h('div', { class: 'rv-note' }, r.relic.perk))) : null,
    rows.length ? h('div', { class: 'rvlist' }, ...rows.map((row, i) =>
      h('div', { class: 'rvrow r-' + row.rarity + (row.good ? ' good' : ''), style: 'animation-delay:' + (i * 80) + 'ms' },
        h('div', { class: 'rv-ic' }, row.icon),
        h('div', { class: 'rv-b' }, h('div', { class: 'rv-nm' }, row.name), h('div', { class: 'rv-note' }, row.note)),
        h('div', { class: 'rv-tag r-' + row.rarity }, row.tag)))) : null,
    h('button', { class: 'btn prim', style: 'margin-top:14px', onClick: close },
      h('div', { class: 'in' }, r.won ? 'Onwards' : 'Again'))));
}

async function viewTrail(mount) {
  let t = await api('trail');
  let busy = false;
  const bodyEl = h('div', {});

  async function refresh() { t = await api('trail').catch(() => t); paint(); }

  async function run(stage) {
    if (busy) return; busy = true; paint();
    try {
      const r = await api('trail/run', { method: 'POST', body: { stage: stage.n } });
      if (r.won) {
        confetti({ count: r.firstClear ? 110 : 40, colors: r.crit ? ['#ffd36a', '#ff9fae'] : ['#57b947', '#a6e394'] });
        toast(pick(TRAIL_TAUNT.win), 'ok');
      } else toast(pick(TRAIL_TAUNT.lose), 'err');
      openTrailResult(r, stage);
    } catch (e) { toast(e.message, 'err'); }
    busy = false;
    await refresh();
  }

  // Tap a stage: see what you are walking into BEFORE it costs you an egg.
  function openStage(s) {
    openModal((close) => h('div', {},
      h('div', { class: 'rvhead ' + (s.boss ? 'r-legendary' : 'r-rare') },
        h('span', { class: 'rv-egg' }, s.icon),
        h('div', {}, h('h2', { style: 'margin:0' }, (s.boss ? 'BOSS · ' : 'Stage ' + s.n + ' · ') + s.enemy),
          h('div', { class: 'msub', style: 'margin:2px 0 0' }, s.name))),
      h('div', { class: 'is-note' }, s.note),
      h('div', { class: 'is-lines' },
        h('div', { class: 'is-line' + (s.odds >= 50 ? ' good' : '') }, h('span', { class: 'is-k' }, 'Your odds'), h('span', { class: 'is-v' }, s.odds + '%')),
        h('div', { class: 'is-line' }, h('span', { class: 'is-k' }, 'Their power'), h('span', { class: 'is-v' }, String(s.power))),
        h('div', { class: 'is-line' }, h('span', { class: 'is-k' }, 'Your power'), h('span', { class: 'is-v' }, String(t.power))),
        h('div', { class: 'is-line good' }, h('span', { class: 'is-k' }, 'Pays'), h('span', { class: 'is-v' }, '🪙 ' + s.coins + (s.boss ? ' · 2 drops' : ' · 1 drop'))),
        h('div', { class: 'is-line' }, h('span', { class: 'is-k' }, 'Costs'), h('span', { class: 'is-v' }, '🥚 ' + t.eggCost + ' Goose Egg')),
        s.eggDrop ? h('div', { class: 'is-line good' }, h('span', { class: 'is-k' }, 'Egg drop'),
          h('span', { class: 'is-v' }, Math.round(s.eggDrop.chance * 100) + '% · ' + s.eggDrop.pool.map(k => pouchOf(k).icon + ' ' + pouchOf(k).name).join(' / '))) : null,
        s.relic ? h('div', { class: 'is-line' + (s.relic.held ? '' : ' good') }, h('span', { class: 'is-k' }, 'Relic'),
          h('span', { class: 'is-v' }, s.relic.icon + ' ' + s.relic.name + (s.relic.held ? ' (held)' : ' — first clear'))) : null),
      t.eggs >= t.eggCost
        ? h('button', { class: 'btn prim', style: 'margin-top:14px', onClick: () => { close(); run(s); } },
          h('div', { class: 'in' }, 'Fight · 🥚 ' + t.eggCost))
        : h('div', { class: 'is-lock' }, '🥚 No Goose Eggs — play a match to earn ' + (fcat().eggsPerMatch || 2) + ' more')));
  }

  function openRelics() {
    openModal((close) => h('div', {},
      h('h2', {}, '🏺 Relics'),
      h('div', { class: 'msub' }, 'Boss trophies that bend a rule instead of adding a percentage. ' + t.relics.slots + ' may be worn at once.'),
      h('div', { class: 'relgrid' },
        ...t.relics.owned.map(r => h('button', {
          class: 'relcard r-' + r.rarity + (r.slot != null ? ' on' : ''),
          onClick: async () => {
            close();
            try {
              await api('trail/relic', { method: 'POST', body: { key: r.key, slot: r.slot != null ? null : nextRelicSlot() } });
              toast(r.slot != null ? 'Put away' : 'Equipped ' + r.name, 'ok');
            } catch (e) { toast(e.message, 'err'); }
            await refresh();
          },
        },
        h('div', { class: 'rel-ic' }, r.icon),
        h('div', { class: 'rel-nm' }, r.name),
        h('div', { class: 'rel-pk' }, r.perk),
        h('div', { class: 'rel-st' }, r.slot != null ? '★ Equipped' : 'Tap to equip'))),
        ...t.relics.locked.map(r => h('div', { class: 'relcard locked' },
          h('div', { class: 'rel-ic' }, '🔒'),
          h('div', { class: 'rel-nm' }, r.name),
          h('div', { class: 'rel-pk' }, r.perk),
          h('div', { class: 'rel-st' }, 'beat stage ' + r.boss))))));
  }
  const nextRelicSlot = () => {
    const used = new Set(t.relics.owned.filter(r => r.slot != null).map(r => r.slot));
    for (let i = 0; i < t.relics.slots; i++) if (!used.has(i)) return i;
    return 0;   // all full — replace the first
  };

  function paint() {
    const worn = t.relics.owned.filter(r => r.slot != null);
    const chapters = [];
    for (const s of t.stages) {
      const last = chapters[chapters.length - 1];
      if (!last || last.name !== s.name) chapters.push({ name: s.name, stages: [s] });
      else last.stages.push(s);
    }
    setKids(bodyEl,
      h('div', { class: 'trhero' },
        h('div', { class: 'th-eggs' }, h('span', { class: 'th-e' }, '🥚'),
          h('span', { class: 'th-n tnum' }, String(t.eggs)),
          h('span', { class: 'th-l' }, 'Goose Eggs')),
        h('div', { class: 'th-prog' },
          h('div', { class: 'th-pl' }, t.cleared + ' / ' + t.stages.length + ' stages cleared'),
          h('div', { class: 'th-bar' }, h('span', { style: 'width:' + Math.round(t.cleared / t.stages.length * 100) + '%' })))),
      h('div', { class: 'th-note' }, 'Every match you play earns ' + (fcat().eggsPerMatch || 2) + ' eggs. One egg per attempt, win or lose.'),
      combatStrip(t.combat, t.power),
      h('div', { class: 'trrelics' },
        h('button', { class: 'trrel-b', onClick: openRelics },
          h('span', {}, '🏺 Relics'),
          h('span', { class: 'trrel-w' }, worn.length ? worn.map(r => r.icon).join(' ') : 'none worn'),
          h('span', { class: 'trrel-c tnum' }, t.relics.owned.length + '/' + (t.relics.owned.length + t.relics.locked.length)))),
      ...chapters.map(ch => h('div', { class: 'trch' },
        h('div', { class: 'sechead' }, h('h3', {}, ch.name),
          h('p', {}, ch.stages.filter(s => s.cleared).length + ' of ' + ch.stages.length + ' cleared')),
        h('div', { class: 'trgrid' }, ...ch.stages.map(s => h('button', {
          class: 'trcard' + (s.boss ? ' boss' : '') + (s.cleared ? ' done' : '') + (s.locked ? ' locked' : ''),
          disabled: s.locked || busy || undefined,
          onClick: () => openStage(s),
        },
        h('div', { class: 'tc-n tnum' }, s.locked ? '🔒' : s.n),
        h('div', { class: 'tc-ic' }, s.icon),
        h('div', { class: 'tc-b' },
          h('div', { class: 'tc-nm' }, s.enemy, s.boss ? h('span', { class: 'tc-boss' }, 'BOSS') : null),
          h('div', { class: 'tc-meta' },
            h('span', { class: 'tc-odds' + (s.odds >= 60 ? ' ok' : s.odds <= 30 ? ' bad' : '') }, s.locked ? 'locked' : s.odds + '%'),
            h('span', { class: 'tc-coin tnum' }, '🪙 ' + s.coins),
            s.eggDrop ? h('span', { class: 'tc-egg' }, '🥚 ' + Math.round(s.eggDrop.chance * 100) + '%') : null)),
        s.cleared ? h('div', { class: 'tc-done' }, '✓') : null))))),
      h('div', { class: 'shop-foot' }, 'Power comes from every level, evolution, socket and charm you own. ' +
        'Crit doubles a win and rolls an extra drop. Lifesteal hands your egg straight back. ' +
        'None of it touches your Elo, rank or titles.'));
  }
  paint();

  mount.replaceChildren(
    h('div', { class: 'pagehead withact' }, h('h1', {}, 'Goose Trail'),
      h('div', { class: 'subtle' }, 'Fight, farm and finally use that racket'),
      h('div', { class: 'phact' }, menuBtn())),
    h('div', { class: 'shop' }, hubNav('trail'), bodyEl));
}

/* ------------------------------------------------------------------- routing */
function currentRoute() {
  const raw = (location.hash || '#/').slice(1);
  if (raw.startsWith('/p/')) return { name: 'profile', param: raw.slice(3), tabs: false };
  if (raw.startsWith('/ach/')) return { name: 'achievements', param: raw.slice(5), tabs: false };
  if (raw.startsWith('/room/')) return { name: 'room', param: raw.slice(6), tabs: false };
  const map = {
    '/': { name: 'home', tabs: true }, '/board': { name: 'board', tabs: true },
    '/map': { name: 'map', tabs: true }, '/titles': { name: 'titles', tabs: true },
    '/you': { name: 'profile', param: 'me', tabs: false }, '/log': { name: 'log', tabs: false },
    '/result': { name: 'result', tabs: false }, '/admin': { name: 'admin', tabs: false },
    '/rooms': { name: 'rooms', tabs: false },
    '/arcade': { name: 'arcade', tabs: false },
    '/shop': { name: 'shop', tabs: true },
    '/inventory': { name: 'inventory', tabs: true },
    '/forge': { name: 'forge', tabs: true },
    '/trail': { name: 'trail', tabs: true },
    '/epithets': { name: 'epithets', tabs: false },
  };
  return map[raw] || { name: 'home', tabs: true };
}
const VIEWS = { home: viewHome, board: viewBoard, map: viewMap, titles: viewTitles, log: viewLog, result: viewResult, admin: viewAdmin, profile: viewProfile, achievements: viewAchievements, rooms: viewRooms, room: viewRoom, epithets: viewEpithets, arcade: viewArcade, shop: viewShop, inventory: viewInventory, forge: viewForge, trail: viewTrail };

async function render() {
  const app = document.getElementById('app');
  if (!state.me) { app.replaceChildren(renderAuth()); return; }
  const r = currentRoute();
  const view = h('div', { class: 'view' });
  // Shop / Inventory / Blacksmith are one place as far as the ribbon is
  // concerned, so the Shop tab stays lit while you move between them.
  const lit = ['inventory', 'forge', 'trail'].includes(r.name) ? 'shop' : r.name;
  const children = [view]; if (r.tabs) children.push(tabs(lit));
  app.replaceChildren(...children);
  try {
    if (r.name === 'result') { VIEWS.result(view); return; }
    let param = r.param;
    if (param === 'me') param = state.me.id;
    await VIEWS[r.name](view, param);
  } catch (e) {
    view.replaceChildren(h('div', { class: 'empty' }, e.message || 'Something went wrong'));
  } finally {
    pauseOffscreen();
  }
}

/* ----------------------------------------------------------------- bootstrap */
// preboot.js fires /api/init during HTML parse. It loads with `async`, so on a
// fast connection this module can occasionally execute first — in which case
// naively falling back fires a second, duplicate request. Wait briefly for it
// instead, and only fetch our own if it really never arrives (script blocked,
// stale cache, adblocker).
function initPayload(waitMs = 500) {
  if (window.__gmInit) return window.__gmInit;
  return new Promise((resolve) => {
    const started = Date.now();
    (function poll() {
      if (window.__gmInit) return resolve(window.__gmInit);
      if (Date.now() - started >= waitMs) return resolve(api('init'));
      setTimeout(poll, 20);
    })();
  });
}

async function boot() {
  try {
    const init = await initPayload();
    // preboot.js fetched this outside api(), so carry its stale flag across.
    if (window.__gmInitStale) { servingStale = true; showStale(true); }
    state.config = { app: init.app, emoji: init.emoji, cosmetics: init.cosmetics, forge: init.forge };
    state.me = init.user;
    state.preboot = init.home || null;   // consumed by the first viewHome
  } catch (e) {
    document.getElementById('app').replaceChildren(h('div', { class: 'empty' }, 'Cannot reach the server. Refresh to retry.'));
    return;
  }
  window.addEventListener('hashchange', render);
  applyMotion((state.me && state.me.settings && state.me.settings.motion) || 'on');
  initAmbient();
  initRipple();
  applyAccent((state.me && state.me.settings && state.me.settings.accent) || 'grass');
  render();
  registerSW();
}
// Offline shell + instant repeat loads. Registered after the first render so it
// never competes with the boot request for bandwidth. A new deploy ships a new
// sw.js, which evicts the old caches on activate (see sw.js `V`).
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let reloading = false;
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    // A SPA never navigates, so without this a tab left open (or a phone that
    // restored its tabs) keeps running whichever bundle it booted with, and new
    // features look missing.
    reg.addEventListener('updatefound', () => {
      const fresh = reg.installing;
      // Whether a controller exists *right now* is what separates "a newer
      // build is replacing the running one" from "this is the very first
      // install", which must not bounce the page the user just opened.
      if (!fresh || !navigator.serviceWorker.controller) return;
      fresh.addEventListener('statechange', () => {
        if (fresh.state === 'activated' && !reloading) { reloading = true; location.reload(); }
      });
    });
    // Browsers only re-check sw.js on navigation or roughly daily; a phone that
    // keeps the tab alive for a week would never see a new build. Checking when
    // the user returns to the tab is cheap (one conditional GET) and prompt.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
}
// The worker keeps an offline copy of API responses; on logout those are this
// user's private data, so wipe them off disk rather than leave them for the
// next person to sign in on a shared phone.
function dropCachedData() {
  navigator.serviceWorker?.controller?.postMessage('dropData');
}
const ACCENTS = {
  grass:  { a: '#57b947', b: '#a6e394', name: 'Goose Grass' },
  violet: { a: '#8b5cf6', b: '#c9a7ff', name: 'Ultraviolet' },
  amber:  { a: '#f59e0b', b: '#ffd36a', name: 'Amber Court' },
  cyan:   { a: '#22b8cf', b: '#8ee9f7', name: 'Ice Cyan' },
  rose:   { a: '#f43f5e', b: '#ffa2b3', name: 'Rose Smash' },
};
function applyAccent(key) {
  const a = ACCENTS[key] || ACCENTS.grass;
  const r = document.documentElement;
  r.style.setProperty('--accent', a.a);
  r.style.setProperty('--accent2', a.b);
}
// 'auto' follows the OS; 'on' forces effects even when the OS asks to reduce
// motion (many phones/laptops ship with that enabled); 'off' kills them.
function applyMotion(mode) {
  const c = document.documentElement.classList;
  c.toggle('force-motion', mode === 'on');
  c.toggle('no-motion', mode === 'off');
}
boot();
