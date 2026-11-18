// Runs with plain Node.js (no npm install required).
// WCAG 2.2 AA colour checks on the design tokens in styles.css, for both themes:
//   text pairs   >= 4.5:1 (1.4.3)
//   focus ring   >= 3:1 against the surfaces it is drawn on (1.4.11 / 2.4.7)
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function tokens(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} block exists`);
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,6}|var\(--[\w-]+\))\s*;/gi)].map(([, k, v]) => [k, v]));
}

// Follow var(--x) aliases within a theme.
function resolve(set) {
  const out = {};
  for (const key of Object.keys(set)) {
    let v = set[key];
    for (let i = 0; i < 5 && v.startsWith('var('); i++) v = set[v.slice(6, -1)];
    out[key] = v;
  }
  return out;
}

const lightRaw = tokens(':root');
const light = resolve(lightRaw);
const dark = resolve({ ...lightRaw, ...tokens(':root[data-theme="dark"]') });

function rgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
// White at `alpha` over a solid background (sidebar text on navy).
function whiteOver(bg, alpha) {
  const mix = rgb(bg).map((c) => Math.round(255 * alpha + c * (1 - alpha)));
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const TEXT = [
  ['ink', 'surface'], ['ink', 'bg'], ['muted', 'surface'], ['muted', 'bg'], ['subtle', 'surface'],
  ['subtle', 'surface-2'], ['subtle', 'bg'], ['navy', 'surface'], ['brand', 'surface'], ['brand', 'brand-soft'],
  ['brand-strong', 'brand-soft'], ['ok', 'ok-bg'], ['warn', 'warn-bg'], ['danger', 'danger-bg'],
  ['on-brand-fill', 'brand-fill'],
];
const FOCUS = ['surface', 'surface-2', 'bg', 'brand-soft'];

let checks = 0;
const failures = [];
for (const [name, t] of [['light', light], ['dark', dark]]) {
  for (const [fg, bg] of TEXT) {
    const ratio = contrast(t[fg], t[bg]);
    checks++;
    if (ratio < 4.5) failures.push(`${name}: --${fg} on --${bg} = ${ratio.toFixed(2)} (< 4.5)`);
  }
  for (const bg of FOCUS) {
    const ratio = contrast(t.focus, t[bg]);
    checks++;
    if (ratio < 3) failures.push(`${name}: --focus on --${bg} = ${ratio.toFixed(2)} (< 3)`);
  }
  // White focus ring on the navy sidebar / blue sign-in background.
  for (const bg of ['sidebar', 'auth-bg', 'brand-fill']) {
    const ratio = contrast('#ffffff', t[bg]);
    checks++;
    if (ratio < 3) failures.push(`${name}: white focus ring on --${bg} = ${ratio.toFixed(2)} (< 3)`);
  }
  // Translucent sidebar text: the lowest alpha used for readable text in the sidebar.
  const alphas = [...css.matchAll(/\.(?:sidebar__label|recent__empty|recent__item|nav__item|sidebar__workspace p:last-child) \{[^}]*color: rgba\(var\(--white-rgb\), ([\d.]+)\)/g)]
    .map(([, a]) => Number(a));
  assert.ok(alphas.length >= 4, 'found sidebar text colours');
  const ratio = contrast(whiteOver(t.sidebar, Math.min(...alphas)), t.sidebar);
  checks++;
  if (ratio < 4.5) failures.push(`${name}: sidebar text (white ${Math.min(...alphas)}) = ${ratio.toFixed(2)} (< 4.5)`);
}

// Structural checks.
assert.ok(/\.skip-link:focus\s*\{/.test(css), 'Skip link becomes visible on focus');
assert.ok(/^:focus-visible \{ outline: 3px solid var\(--focus\)/m.test(css), 'Global focus ring uses the solid --focus token');
assert.ok(/prefers-reduced-motion: reduce/.test(css), 'Reduced-motion styles exist');
assert.ok(/min-width: 24px; height: 24px/.test(css), 'Citation marks meet the 24px target size');

if (failures.length) {
  console.error(`FAIL: ${failures.length} of ${checks} contrast checks\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`PASS: ${checks} contrast checks (light + dark) and 4 structural checks`);
