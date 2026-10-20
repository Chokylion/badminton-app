// scripts/stamp-assets.mjs — content-hash the static assets so they can be
// cached forever without ever going stale.
//
// index.html always revalidates (it's tiny); the heavy js/css it points at get
// ?v=<hash> and an immutable cache header. New deploy -> new hash -> new URL ->
// fresh fetch. Same deploy -> zero revalidation round trips.
//
// Idempotent: existing ?v= stamps are stripped before hashing, so running it
// twice produces byte-identical output.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const hash8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8);
const stripV = (s) => s.replace(/\?v=[a-f0-9]{8}/g, '');

// 1. fx.js — leaf module, nothing depends on its content but app.js imports it
const fx = stripV(readFileSync(join(PUB, 'fx.js'), 'utf8'));
writeFileSync(join(PUB, 'fx.js'), fx);
const FXV = hash8(fx);

// 2. app.js — stamp its fx import first, THEN hash (content changed)
let app = stripV(readFileSync(join(PUB, 'app.js'), 'utf8'));
app = app.replace(/(from\s+['"]\.\/fx\.js)(['"])/g, `$1?v=${FXV}$2`);
writeFileSync(join(PUB, 'app.js'), app);
const APPV = hash8(app);

// 3. styles.css
const css = stripV(readFileSync(join(PUB, 'styles.css'), 'utf8'));
writeFileSync(join(PUB, 'styles.css'), css);
const CSSV = hash8(css);

// 3a. critical CSS — everything above the `critical:end` marker is the app
//     shell (fonts, custom properties, reset, body, frame, boot screen). It is
//     inlined into index.html so the first paint needs zero extra round trips;
//     the full sheet then loads without blocking render. Measured: this is what
//     took first contentful paint on a cold 3G phone from 4.8s to under 0.6s.
const CRIT_MARK = 'critical:end';
if (!css.includes(CRIT_MARK)) {
  console.error(`stamp failed: styles.css is missing the ${CRIT_MARK} marker`);
  process.exit(1);
}
let critical = css.split(CRIT_MARK)[0];
// The split lands inside the marker's own comment, so drop that trailing
// unterminated `/* ...` only — not every comment in the file.
const lastOpen = critical.lastIndexOf('/*');
if (lastOpen !== -1 && critical.indexOf('*/', lastOpen) === -1) critical = critical.slice(0, lastOpen);
critical = critical.trim();
let depth = 0;
for (const ch of critical) { if (ch === '{') depth++; else if (ch === '}') depth--; }
if (depth !== 0) {
  console.error('stamp failed: critical CSS has unbalanced braces — the marker is mid-rule');
  process.exit(1);
}
if (critical.length < 1000 || !critical.includes('@font-face') || !critical.includes('.boot')) {
  console.error(`stamp failed: critical CSS looks wrong (${critical.length}B, fonts/boot missing)`);
  process.exit(1);
}

// 3b. preboot.js — classic script, no imports, hashed on its own
const pre0 = stripV(readFileSync(join(PUB, 'preboot.js'), 'utf8'));
writeFileSync(join(PUB, 'preboot.js'), pre0);
const PREV = hash8(pre0);

// 4. index.html points at the stamped URLs. The modulepreload MUST carry the
//    same ?v= as the import inside app.js or the browser treats them as two
//    different resources and downloads fx.js twice.
let html = readFileSync(join(PUB, 'index.html'), 'utf8');
html = html
  .replace(/(href=")\/styles\.css(\?v=[a-f0-9]{8})?(")/g, `$1/styles.css?v=${CSSV}$3`)
  .replace(/(src=")\/app\.js(\?v=[a-f0-9]{8})?(")/, `$1/app.js?v=${APPV}$3`)
  .replace(/(src=")\/preboot\.js(\?v=[a-f0-9]{8})?(")/, `$1/preboot.js?v=${PREV}$3`)
  .replace(/(rel="preload" href=")\/preboot\.js(\?v=[a-f0-9]{8})?(")/, `$1/preboot.js?v=${PREV}$3`)
  .replace(/(rel="modulepreload" href=")\/fx\.js(\?v=[a-f0-9]{8})?(")/, `$1/fx.js?v=${FXV}$3`)
  // swap in the freshly-extracted shell styles
  .replace(/(<style id="crit">)[\s\S]*?(<\/style>)/, `$1${critical}$2`);
writeFileSync(join(PUB, 'index.html'), html);

// 5. sw.js — a new build gets a fresh cache generation and precaches the exact
//    stamped shell, so the second visit is served entirely from disk.
const BUILD = hash8(APPV + CSSV + FXV + PREV);
const PRECACHE = [
  '/',
  `/app.js?v=${APPV}`,
  `/fx.js?v=${FXV}`,
  `/preboot.js?v=${PREV}`,
  `/styles.css?v=${CSSV}`,
  '/fonts/space-grotesk.woff2',
  '/fonts/archivo.woff2',
  '/fonts/anton.woff2',
  '/fonts/jetbrains-mono.woff2',
];
let sw = readFileSync(join(PUB, 'sw.js'), 'utf8');
sw = sw
  .replace(/^const BUILD = .*;$/m, `const BUILD = '${BUILD}';`)
  .replace(/^const PRECACHE = .*;$/m, `const PRECACHE = ${JSON.stringify(PRECACHE)};`);
writeFileSync(join(PUB, 'sw.js'), sw);

// sanity — the html must actually reference the hashes we just computed
if (!html.includes(`/app.js?v=${APPV}`) || !html.includes(`/styles.css?v=${CSSV}`)) {
  console.error('stamp failed: index.html was not rewritten');
  process.exit(1);
}
if (!html.includes(`/preboot.js?v=${PREV}`) || !html.includes(`modulepreload" href="/fx.js?v=${FXV}"`)) {
  console.error('stamp failed: preboot/modulepreload were not rewritten');
  process.exit(1);
}
if (!html.includes('@font-face') || !html.includes('.boot{')) {
  console.error('stamp failed: critical CSS was not inlined into index.html');
  process.exit(1);
}
if (!app.includes(`./fx.js?v=${FXV}`)) {
  console.error('stamp failed: app.js fx import was not rewritten');
  process.exit(1);
}
if (!sw.includes(`const BUILD = '${BUILD}';`) || !sw.includes(`/app.js?v=${APPV}`)) {
  console.error('stamp failed: sw.js was not rewritten');
  process.exit(1);
}
// every precached asset must exist on disk or the worker install will 404
for (const u of PRECACHE) {
  if (u === '/') continue;
  const f = join(PUB, u.split('?')[0]);
  if (!existsSync(f)) { console.error(`stamp failed: precache target missing ${u}`); process.exit(1); }
}
console.log(`stamped  app.js=${APPV}  styles.css=${CSSV}  fx.js=${FXV}  preboot.js=${PREV}  sw build=${BUILD}`);
