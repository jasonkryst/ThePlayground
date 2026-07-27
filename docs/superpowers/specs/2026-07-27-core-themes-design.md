# Core Themes: Light / Dark / High Contrast — Design

GitHub issue #11.

## Summary

Add a `theme` setting (`system` / `light` / `dark` / `high-contrast`, default `system`) that reflows every color in the app through the existing CSS custom-property layer in `src/index.css`. Because chrome, dashboard, admin, parent/kids pages, and each game's shared UI already route their colors through these tokens, adding new value-layers per theme is enough to retheme the whole app without touching component logic. `system` follows the OS's `prefers-color-scheme`; `light`/`dark`/`high-contrast` are explicit overrides settable in Admin and via a header quick-toggle reachable from every route.

All three themes must be "Full A11Y" per the issue: every text/background pairing verified ≥4.5:1 (WCAG AA, normal text) or ≥3:1 (borders/non-text UI components), matching the standard already established by `src/__tests__/disabledWrongChoiceContrast.test.js`.

## Scope

**In scope:** decorative/chrome colors — page/card backgrounds, body/heading/muted/error text, borders, focus rings, solid-fill buttons and their text, the parent-dashboard activity heatmap's color scale.

**Explicitly out of scope — these do not retheme:**
- **Per-game content colors** — Color Match's teaching swatches, character/animal art, any other color that *is* the lesson content. Reinterpreting "red" per-theme would work against the game's own teaching mechanic.
- **Correct/wrong feedback signal colors** (`.correct`/`.wrong`, `pulse-green`/`shake-red` keyframes, `.game__choice--disabled-wrong`) — these stay a universal green-right/red-wrong signal across all three themes.
- Hardcoded `color: white` sites that pair with a *per-game dynamic inline-styled* background (`.game__prompt`, `.replay-button__hint`, Color Match's own choice-tile text) — these depend on arbitrary per-game colors that don't retheme, so forcing them through a themed token would break their own contrast guarantee.

**Bundled fix (approved as in-scope):** `.results__btn--play` (`GameResults.css`) currently sets `color: white` on background `var(--color-lavender)` (the light pastel, not `-dark`) — measured 2.40:1, a pre-existing WCAG failure on the primary "Play Again" button shown after every game. Fixed as part of this same token pass by pointing it at the correct solid-fill token (see below).

## Token architecture

Mechanism: a `data-theme` attribute on `<html>`, set by a new `ThemeSync` component (mirrors the existing `LocaleSync` in `App.jsx` — permanently mounted, renders nothing, reads `useSettings()`). `:root[data-theme="light"]`, `:root[data-theme="dark"]`, `:root[data-theme="high-contrast"]` each override token values. For `theme === 'system'`, `ThemeSync` removes the attribute entirely and a `@media (prefers-color-scheme: dark)` block scoped to `:root:not([data-theme])` takes over — no JS media-query listener needed for the common case, since CSS resolves it natively. An unrecognized/corrupt persisted value falls back to the `system` (no-attribute) behavior rather than throwing.

Existing token *names* are kept wherever possible, to avoid touching component CSS. Values are redefined per theme:

| Token | Role | Light (unchanged) | Dark | High Contrast |
|---|---|---|---|---|
| `--color-bg` | page background | `#F0FDFF` | `#0D2126` | `#000000` |
| `--color-surface` | card/panel background | `#FFFFFF` | `#17323A` | `#000000` (+ mandatory visible border on every surface — HC can't rely on a bg-shade difference alone) |
| `--color-text` | body text | `#37474F` | `#E8F6F7` | `#FFFFFF` |
| `--color-text-muted` | secondary text | `#5B6B70` | `#9EC2C7` | `#C8C8C8` |
| `--color-error` | error text | `#c62828` | `#FF8A80` | `#FF6E6E` |
| `--color-aqua` / `--color-teal` / `--color-lavender` / `--color-lilac` | accent "pop" — borders, tile backgrounds, direct-use focus states | unchanged | unchanged (already light pastels; read fine against the new dark bg) | brightened: aqua `#4DD8E8`, teal `#26D9B7`, lavender `#C9A9FF`, lilac `#FF8AD8` |
| `--color-aqua-dark` / `--color-teal-dark` / `--color-lavender-dark` | **solid-fill role**: background of a filled button/tab, paired with `--color-on-accent` text | unchanged | unchanged (white-on-solid contrast is bg-independent) | brightened HC base value, paired with `--color-on-accent` = black |
| **new** `--color-lavender-text`, `--color-teal-text` | **heading/border-on-surface role**, split out of the old dual-purpose `-dark` tokens | = today's `-dark` value | = today's *base* pastel value (reused, no new hex needed) | = brightened HC base |
| **new** `--color-on-accent` | text drawn on top of a solid accent fill | `white` | `white` | `black` |
| **new** `--color-heatmap-0` … `--color-heatmap-3` | ParentDashboard activity heatmap 4-step sequential scale, replacing 4 hardcoded hex values | today's blues | shifted so the "no activity" cell isn't a bright box on a dark page | HC-distinguishable 4-step scale |

`--color-lilac-dark` stays defined but unused (already the case today) — not touched by this issue.

### Token role split (`-dark` → `-text` / kept `-dark`)

`--color-lavender-dark` and `--color-teal-dark` are used in two conflicting roles today: (a) solid-fill background paired with white text (~14 call sites, `background:`), and (b) heading text / border color painted directly on the page/card background (~17 call sites, `color:`/`border-color:`). Role (a)'s correct value doesn't depend on page background (white-on-deep-purple contrast is the same regardless of what's behind the button); role (b)'s does — the same deep purple that reads fine as text on a *white* card fails as text on the new *dark* card. Splitting these into `-dark` (role a, unchanged across themes) and new `-text` tokens (role b, theme-tinted) resolves this without a full rename: role (b) call sites (`AppShell.css`, `CategorySection.css`, `Dashboard.css`, `TagFilterBar.css`, `ParentDashboard.css`, `BadgeGallery.css`, `ExitConfirmDialog.css`, `GameResults.css`, `KidsProgressPage.css`, `AdminPage.css`, `DateRangeFilter.css`) get repointed from `-dark` to `-text`; role (a) sites keep `-dark` as-is.

`--color-aqua-dark` has no such conflict (only ever used as a solid-fill background in the current codebase) and needs no split.

### `--color-on-accent` call sites

Replaces hardcoded `color: #fff` / `color: white` at sites that sit on our own chrome accent tokens: `AdminPage.css` (active tab, toggle buttons, tag-save/reset), `ParentDashboard.css` (header), `GameIntro.css` and `ResumePrompt.css` (primary buttons), and the bundled `GameResults.css` fix (`.results__btn--play` moves from `background: var(--color-lavender)` to `background: var(--color-lavender-dark); color: var(--color-on-accent)`).

Left untouched (per-game dynamic backgrounds, out of scope): `GameChoiceGrid.css` `.game__choice-name`, `QuizGameShell.css` `.game__prompt`, `ReplayButton.css` `.replay-button__hint`.

## Settings & persistence

- `DEFAULT_SETTINGS.theme = 'system'` added to `src/storage/adapter.js`, documented in its JSDoc alongside the other enum-valued settings (pattern: `'system' | 'light' | 'dark' | 'high-contrast'`).
- Persisted through the existing `useSettings()`/adapter round-trip as a plain settings key — no new adapter method, same as `locale`/`timerMode`.

## UI surfaces

**Admin (`AdminPage.jsx`):** a new "Theme" 4-option radio group, matching the existing pattern used for `timerMode`/`maxTries` (`admin__radio-label`), each option calling `updateSetting('theme', value)`.

**Global header quick-toggle (`AppShell.jsx`):** one icon button in the header's `shell__side shell__side--end` row, alongside the existing `🏠`/nav icons — reachable from every route (not gated behind the parental lock, since it never goes through `/admin`). Each tap cycles `system → light → dark → high-contrast → system`. Icon reflects the current *setting* (🌓 / ☀️ / 🌙 / ◐), with the real semantics carried by an `aria-label` announcing the current theme and what the next tap switches to — matching how existing nav links carry their label via `aria-label`, not their emoji.

## Testing plan

**Unit/component (Vitest):**
- `themeTokenContrast.test.js` (new, mirrors `disabledWrongChoiceContrast.test.js`'s pattern): hardcodes every theme's token values from the table above and asserts every text/bg and border/bg pairing meets 4.5:1 / 3:1. Positive cases (every real pairing passes) *and* a negative case (a deliberately-bad pairing asserted to fail), proving the test discriminates rather than trivially passing.
- `ThemeSync` test (mirrors `LocaleSync`'s test): positive — `light`/`dark`/`high-contrast` each set the matching `data-theme` attribute, `system` removes it; negative — an unrecognized value doesn't throw and behaves like `system`.
- `AdminPage` test additions: positive — clicking each Theme radio calls `updateSetting('theme', value)` and reflects as selected; negative — re-clicking the already-selected option doesn't duplicate/conflict.
- `AppShell.test.jsx` additions for the header toggle: positive — each click cycles to the next theme and updates icon/`aria-label`; negative — cycling from `high-contrast` wraps to `system` rather than running off the end.
- `jest-axe` on the new Admin Theme control and header toggle (existing per-component convention).
- Adapter contract test (`adapterContract.js`) updated for the new `theme` default.

**E2E (Playwright), new `e2e/themes.spec.js`:**
- Seeds `settings.theme` via the same localStorage-seeding pattern `admin.spec.js` uses; loads Dashboard, Admin, and one game's results screen under each explicit theme; runs `@axe-core/playwright`'s full scan (includes the `color-contrast` rule) against real computed styles in a real browser.
- `system` positive/negative pair: `page.emulateMedia({ colorScheme: 'light' })` renders light tokens; `page.emulateMedia({ colorScheme: 'dark' })` renders dark tokens, same settings value both times.
- Drives the header toggle's real click-cycle end-to-end and confirms persistence across reload.

**Visual regression (`e2e/visual.spec.js`):** existing 38-story light-theme baseline is untouched (Light's token values don't change, so these stay pixel-identical). Adds a representative subset — Dashboard, AdminPage, GameChoiceGrid, GameResults — captured once each in Dark and High Contrast (8 new baseline PNGs), to catch layout regressions (e.g. a border becoming invisible against its own background) the axe scan wouldn't.

## Docs & versioning

- `README.md` — settings reference table gets the new `theme` entry.
- `docs/TESTING.md` — `themeTokenContrast.test.js` noted alongside the existing filter-contrast pattern; `themes.spec.js` added to the e2e spec table; visual-regression section notes the 8 new theme baselines.
- `docs/ENHANCEMENTS.md` — check off the "Dark mode" backlog line (this issue's body is that line verbatim).
- `CHANGELOG.md` — new `[0.37.0]` entry.
- `package.json` — version bump `0.36.0` → `0.37.0` (minor, per user request — new feature, no breaking change).
- `SECURITY.md` — no expected change (nothing here touches a trust boundary); confirm during implementation.
