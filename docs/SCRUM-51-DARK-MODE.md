# SCRUM-51 · Light, Dark, and System theme

## What changed

- `frontend/index.html`: synchronous inline preference resolver in the document head. It sets `html[data-theme]` before Vite's JavaScript/CSS can paint, preventing a wrong-theme flash.
- `frontend/src/lib/theme.js`: React hook for theme selection, persisted under `pbs-help-theme` in `localStorage`. `system` follows OS color scheme changes; cross-tab storage changes are also handled. Invalid values and disabled storage fall back to System.
- `frontend/src/components/ThemeSwitcher.jsx`: three accessible `System / Light / Dark` buttons (default System), using `aria-pressed` and text-color-based SVG icons. Available in the app header and on the login page.
- `App.jsx`, `AppShell.jsx`, `AppHeader.jsx`, `LoginScreen.jsx`: wire the theme preference through the app.
- `Icons.jsx`: adds Sun, Moon and Monitor SVGs. The existing `Icon` component **already used `stroke="currentColor"`**; it remains theme-aware. The brand-only `LogoMark` intentionally retains official PBS colors.
- `styles.css`: semantic light and dark CSS variable sets, dark-aware native inputs, modal, cards, badges, controls and other surfaces. Fixed literal colors in the style rules were converted to tokens.

## PBS brand alignment and dark-mode deviations

Compared with the checked-in brand specification `docs/specs/F1-brand-tokens.md`:

| Role | Light / official | Dark / rationale |
| --- | --- | --- |
| PBS logo disc/profiles | PBS Blue `#2638C4` and white only | **Unchanged**. Header uses white lockup instead of blue when behind a dark surface. |
| Cobalt identity | `#2638C4` | Remains `#2638C4` for logo, identity **and solid CTAs** (white text, 8.6:1). Text links/selected labels use lighter PBS-Blue tint `#B7C2FF` (≥7:1 on dark surfaces). |
| Navy | `#0A145A` | Remains sidebar color; text uses `#E7EAFF` on dark surfaces in place of Navy-colored text. |
| Mint / Yellow / Coral | `#48D3CD` / `#FFCF00` / `#FE704E` | Identity accent hues unchanged; status *text* uses accessible light tints and deep-tinted backgrounds instead of putting accent colors directly on the dark surface. |
| Surface | white, `#F5F6FB` | Built from the Navy Blue family (style guide: white logo over dark/Navy backgrounds): page `#070C33`, surface `#111A4D`, elevated `#19235C`. Functional UI values derived from Navy `#0A145A`. |
| Login background | PBS Blue `#2638C4` | Official Navy Blue `#0A145A` (secondary brand color) with the white logo. |
| Light subtle text | old `#8A91AB` | Adjusted to `#616A85` to better meet normal-text contrast against white. |

These are **functional dark UI tokens**, not changes to the PBS logo or primary brand identity. The project includes `F1-brand-tokens.md`, not a separate fully approved dark-mode palette; a PBS brand reviewer should approve the dark extensions before production.

## Coverage checklist

- [x] Initial loading and login
- [x] Header and sidebar; chat composer and bubbles
- [x] Answer card types: bullets/steps, phone script, general, verified and `no_answer` (all rely on the same answer/status/card tokens)
- [x] Citation marks, source chips and source drawer
- [x] Feedback page, status labels, and toast
- [x] Team FAQ, Knowledge sources, tables and form controls
- [x] Confidence/tier labels: `ok`, `warn`, `info`, `fail` use separate foreground/background variable pairs
- [x] Theme change persists; System tracks OS, no initial flash
- [x] SVG UI icons use `currentColor`; brand mark retains sanctioned colors
- [ ] `npm run build` on a machine with dependencies (this environment cannot reach npmjs.org and the uploaded ZIP did not contain `node_modules`)
- [ ] Interactive browser QA using the actual React app (manual steps below)

## Validation

Run these commands in `frontend`:

```bash
npm ci
npm run build
npm run test:theme
npm run dev
```

Manual browser pass (Chrome devtools can emulate `prefers-color-scheme`):

1. With local storage preference cleared, reload in a dark OS theme; loading + login should **start dark**. Repeat with a light OS theme. No opposite-color flash.
2. Choose `Light`, `Dark`, `System` in the login header. Reload. Selection must persist. In System mode change OS preference without reloading and confirm page changes. Explicit Light/Dark must **not** follow OS changes.
3. Log in, repeat theme selection in app header. Open Chat, FAQ, Knowledge Sources, Feedback, answer variants, source drawer and toasts in both themes; check no bright panels/illegible labels.
4. Open a no-answer, a verified answer, a low-confidence answer, and a feedback success/error state. Ensure tier and confidence labels are understandable **by words, not color alone**.
5. Check zoom 200%, widths 375px and 1440px, Tab/Space/Enter navigation on the switcher, and focus outlines.
6. Confirm no contrast failures in browser accessibility tooling; normal text requires >=4.5:1, large text >=3:1. Representative light/dark CSS screens were checked using headless Chromium; the sampled text elements yielded no contrast failures. Full React-screen/browser verification is still needed.

### Known limitation

The `npm ci` check in the ChatGPT execution environment couldn't fetch dependencies because DNS for `registry.npmjs.org` was unavailable. Do **not** mark `npm run build passes` or the full live browser acceptance check as completed until those commands are successfully run locally.
