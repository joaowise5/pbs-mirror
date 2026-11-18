// Runs with plain Node.js (no npm install required).
// Exercises the initial theme bootstrap that runs before React/CSS paint.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Theme bootstrap must be inline in <head>');
assert.ok(html.indexOf('<script>') < html.indexOf('</head>'), 'Bootstrap must execute in <head>');

function boot(saved, osDark, storageError = false) {
  const dataset = {};
  const localStorage = {
    getItem: () => {
      if (storageError) throw Error('Local storage disabled');
      return saved;
    },
  };
  runInNewContext(script, {
    document: { documentElement: { dataset } },
    localStorage,
    matchMedia: (query) => ({ matches: osDark && query === '(prefers-color-scheme: dark)' }),
  });
  return dataset;
}

for (const [saved, osDark, expected, preference] of [
  [null, false, 'light', 'system'],
  [null, true, 'dark', 'system'],
  ['system', false, 'light', 'system'],
  ['system', true, 'dark', 'system'],
  ['dark', false, 'dark', 'dark'],
  ['light', true, 'light', 'light'],
  ['garbage', true, 'dark', 'system'],
]) {
  const got = boot(saved, osDark);
  assert.equal(got.theme, expected);
  assert.equal(got.themePreference, preference);
}
assert.equal(boot(null, true, true).theme, 'dark', 'Storage unavailable must not crash');

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
assert.ok(styles.includes(':root[data-theme="dark"]'), 'Dark token set exists');
assert.ok(styles.includes('color-scheme: dark;'), 'Native widgets switch to dark');
assert.ok(styles.includes('.badge--ok') && styles.includes('.badge--warn') && styles.includes('.badge--fail'), 'Semantic status labels are tokenized');
assert.ok(styles.includes('.theme-switcher__choice:focus-visible'), 'Switcher has visible keyboard focus');

console.log('PASS: 8 bootstrap cases, token sets, semantic badge and focus checks');
