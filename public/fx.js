// public/fx.js — the effects layer. Pure DOM/Canvas, no dependencies.
// Everything here is decorative: if it fails or the user asks for reduced
// motion, the app must still work exactly the same.

export const reduced = () => {
  const c = document.documentElement.classList;
  if (c.contains('no-motion')) return true;      // user turned effects off
  if (c.contains('force-motion')) return false;  // user forced effects on
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/* ------------------------------------------------------------------ ambient */
// Slow drifting light-field behind the whole app: soft orbs + rising motes.
// One canvas, one rAF, pauses when the tab is hidden.
export function initAmbient() {
  if (document.getElementById('fxcanvas')) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'fxcanvas';
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, orbs = [], motes = [], raf = 0, t = 0;

  function accent() {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return c || '#57b947';
  }
  function rgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return [87, 185, 71];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }
  function build() {
    const n = W < 500 ? 4 : 6;
    orbs = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * W, y: Math.random() * H,
      r: 90 + Math.random() * 150, sp: 0.08 + Math.random() * 0.16,
      ph: Math.random() * 6.283, hue: i % 3,
    }));
    motes = Array.from({ length: W < 500 ? 16 : 26 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: 0.6 + Math.random() * 1.6, sp: 0.12 + Math.random() * 0.35,
      a: 0.10 + Math.random() * 0.3, ph: Math.random() * 6.283,
    }));
  }
  function frame() {
    t += 1;
    ctx.clearRect(0, 0, W, H);
    const [r, g, b] = rgb(accent());
    for (const o of orbs) {
      const ox = o.x + Math.cos(t * 0.0022 * o.sp + o.ph) * 90;
      const oy = o.y + Math.sin(t * 0.0018 * o.sp + o.ph) * 70;
      const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, o.r);
      const tint = o.hue === 0 ? [r, g, b] : o.hue === 1 ? [120, 90, 240] : [60, 170, 240];
      grad.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},0.055)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(ox, oy, o.r, 0, 6.283); ctx.fill();
    }
    for (const m of motes) {
      m.y -= m.sp;
      if (m.y < -6) { m.y = H + 6; m.x = Math.random() * W; }
      const tw = 0.55 + 0.45 * Math.sin(t * 0.03 + m.ph);
      ctx.beginPath(); ctx.arc(m.x + Math.sin(t * 0.006 + m.ph) * 9, m.y, m.r, 0, 6.283);
      ctx.fillStyle = `rgba(${r},${g},${b},${m.a * tw})`;
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && !reduced()) raf = requestAnimationFrame(frame); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  size();
  window.addEventListener('resize', size);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if (reduced()) { ctx.clearRect(0, 0, W, H); return; }
  start();
}

/* ----------------------------------------------------------------- confetti */
const CONFETTI_COLORS = ['#57b947', '#a6e394', '#ffd36a', '#ba8cff', '#5ac8fa', '#ff7a9c', '#fff6d0'];
export function confetti(opts = {}) {
  if (reduced()) return;
  const count = opts.count || 90;
  const originX = opts.x == null ? window.innerWidth / 2 : opts.x;
  const originY = opts.y == null ? window.innerHeight * 0.34 : opts.y;
  const canvas = document.createElement('canvas');
  canvas.className = 'fxburst';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.cssText = `position:fixed;inset:0;width:${W}px;height:${H}px;pointer-events:none;z-index:400`;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bits = Array.from({ length: count }, () => {
    const ang = Math.random() * 6.283;
    const spd = 4 + Math.random() * 9;
    return {
      x: originX, y: originY,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 4,
      w: 4 + Math.random() * 6, h: 6 + Math.random() * 8,
      rot: Math.random() * 6.283, vr: (Math.random() - 0.5) * 0.4,
      c: opts.colors ? opts.colors[(Math.random() * opts.colors.length) | 0]
        : CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      life: 0,
    };
  });
  const MAX = 150;
  (function run() {
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const b of bits) {
      b.life++;
      if (b.life > MAX) continue;
      alive++;
      b.vy += 0.22; b.vx *= 0.992; b.vy *= 0.992;
      b.x += b.vx; b.y += b.vy; b.rot += b.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - b.life / MAX);
      ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(run); else canvas.remove();
  })();
}

/* ------------------------------------------------------------------ countUp */
// Rolls a number up to its value. Returns immediately if motion is reduced.
export function countUp(el, to, opts = {}) {
  const dur = opts.dur || 900;
  const fmt = opts.fmt || ((v) => String(Math.round(v)));
  if (reduced() || !Number.isFinite(to)) { el.textContent = fmt(to); return; }
  const from = Number(opts.from) || 0;
  const t0 = performance.now();
  (function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);            // easeOutCubic
    el.textContent = fmt(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

/* --------------------------------------------------------------------- tilt */
// Subtle 3D tilt toward the pointer. Touch devices keep it flat.
export function tilt(el, max = 7) {
  if (reduced() || matchMedia('(hover: none)').matches) return;
  let raf = 0;
  const move = (e) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      el.style.transform = `perspective(700px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
      el.style.setProperty('--gx', ((px + 0.5) * 100).toFixed(1) + '%');
      el.style.setProperty('--gy', ((py + 0.5) * 100).toFixed(1) + '%');
    });
  };
  const reset = () => { el.style.transform = ''; };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', reset);
}

/* ------------------------------------------------------------------- ripple */
// One delegated listener for the whole app.
export function initRipple() {
  document.addEventListener('pointerdown', (e) => {
    if (reduced()) return;
    const t = e.target.closest('button, .lbrow, .achcard, .courtcard, .vcard');
    if (!t || t.dataset.noripple) return;
    const r = t.getBoundingClientRect();
    const d = Math.max(r.width, r.height);
    const s = document.createElement('span');
    s.className = 'fxripple';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    const pos = getComputedStyle(t).position;
    if (pos === 'static') t.style.position = 'relative';
    t.append(s);
    setTimeout(() => s.remove(), 620);
  }, { passive: true });
}

/* ---------------------------------------------------------------- sparkline */
// Tiny inline SVG trend line with a gradient fill and a head dot.
export function sparkline(values, opts = {}) {
  const w = opts.w || 150, h = opts.h || 42, pad = 3;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('class', 'spark');
  const vals = (values || []).filter(v => Number.isFinite(v));
  if (vals.length < 2) return svg;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || 1;
  const pt = (v, i) => [
    pad + (i / (vals.length - 1)) * (w - pad * 2),
    h - pad - ((v - min) / span) * (h - pad * 2),
  ];
  const pts = vals.map(pt);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  const col = opts.color || (up ? 'var(--accent, #57b947)' : '#ff7a7a');
  const gid = 'sg' + Math.random().toString(36).slice(2, 8);

  const defs = document.createElementNS(NS, 'defs');
  const lg = document.createElementNS(NS, 'linearGradient');
  lg.setAttribute('id', gid); lg.setAttribute('x1', '0'); lg.setAttribute('y1', '0');
  lg.setAttribute('x2', '0'); lg.setAttribute('y2', '1');
  for (const [off, op] of [['0%', '0.42'], ['100%', '0']]) {
    const s = document.createElementNS(NS, 'stop');
    s.setAttribute('offset', off); s.setAttribute('stop-color', col); s.setAttribute('stop-opacity', op);
    lg.append(s);
  }
  defs.append(lg); svg.append(defs);

  const area = document.createElementNS(NS, 'path');
  area.setAttribute('d', `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`);
  area.setAttribute('fill', `url(#${gid})`);
  svg.append(area);

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', line);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', col);
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('class', 'sparkline');
  svg.append(path);

  const head = document.createElementNS(NS, 'circle');
  head.setAttribute('cx', pts[pts.length - 1][0].toFixed(1));
  head.setAttribute('cy', pts[pts.length - 1][1].toFixed(1));
  head.setAttribute('r', '2.8');
  head.setAttribute('fill', col);
  head.setAttribute('class', 'sparkhead');
  svg.append(head);
  return svg;
}

/* ------------------------------------------------------- dealing cards */
// Slide cards in from wherever the dealer is standing. Each card measures its
// own distance back to the dealer, so the motion is right regardless of where
// the seat ended up on screen — and it staggers, like a real deal going round.
export function dealFrom(originEl, cardEls, stagger = 90) {
  if (!originEl || !cardEls || !cardEls.length) return;
  if (reduced()) return;
  const o = originEl.getBoundingClientRect();
  const ox = o.left + o.width / 2, oy = o.top + o.height / 2;
  cardEls.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (!r.width) return;                       // not laid out yet — don't fly it to 0,0
    el.style.setProperty('--dx', Math.round(ox - (r.left + r.width / 2)) + 'px');
    el.style.setProperty('--dy', Math.round(oy - (r.top + r.height / 2)) + 'px');
    el.style.setProperty('--dr', ((i % 2 ? 1 : -1) * (10 + (i * 7) % 14)) + 'deg');
    el.style.setProperty('--dd', (i * stagger) + 'ms');
    el.classList.add('dealt');
  });
}

/* -------------------------------------------------------------- reveal-in */
// Fade/slide elements in as they scroll into view.
let io = null;
export function reveal(el) {
  if (reduced()) return el;
  if (!io) {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('inview'); io.unobserve(e.target); }
    }, { threshold: 0.12 });
  }
  el.classList.add('revealable');
  io.observe(el);
  return el;
}

/* ------------------------------------------------------- offscreen pausing */
// Avatar frames animate forever, which is gorgeous on screen and pure waste
// off it: a 100-row leaderboard was running ~330 keyframe animations while
// only ~11 avatars were actually visible, so the compositor was doing ~30x
// the work for zero visible benefit. This pauses only the ones nobody can see.
//
// Nothing is removed — every animation is intact and resumes the instant the
// element scrolls back into view (150px early, so it is never caught starting).
// Fail-safe on purpose: the class is only ever ADDED to off-screen nodes, so if
// this code never runs, or IntersectionObserver is missing, everything animates
// exactly as before.
let idleIO = null;
let idleMO = null;
let idleTimer = 0;

// Re-point the observer at whatever frames exist right now. Observers hold
// their targets strongly, so we disconnect rather than pile up dead nodes.
function scanFrames() {
  idleTimer = 0;
  if (!idleIO) {
    idleIO = new IntersectionObserver((entries) => {
      for (const e of entries) e.target.classList.toggle('fxidle', !e.isIntersecting);
    }, { rootMargin: '150px 0px' });
  } else {
    idleIO.disconnect();
  }
  for (const el of document.querySelectorAll('.framed')) idleIO.observe(el);
}

// Views finish rendering *after* render() resolves (data arrives, then rows are
// appended), so scanning on a timer tied to routing missed almost everything.
// Watching the DOM instead means late-arriving rows, modals and polled room
// updates are all covered. Debounced, so a burst of appends costs one scan.
function queueScan() {
  if (idleTimer) return;
  idleTimer = setTimeout(scanFrames, 120);
}

export function pauseOffscreen() {
  if (typeof IntersectionObserver === 'undefined') return;
  if (!idleMO && typeof MutationObserver !== 'undefined') {
    // childList only: the observer callback toggles a class, and watching
    // attributes as well would make that feed back into itself
    idleMO = new MutationObserver(queueScan);
    idleMO.observe(document.body, { childList: true, subtree: true });
  }
  queueScan();
}
