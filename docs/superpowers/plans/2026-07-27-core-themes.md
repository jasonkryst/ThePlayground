# Core Themes (Light / Dark / High Contrast) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `theme` setting (`system`/`light`/`dark`/`high-contrast`, default `system`) that reflows every chrome color in the app through the existing CSS custom-property layer, with a manual override in Admin and a quick-toggle in the global header, all three themes verified WCAG AA.

**Architecture:** A `data-theme` attribute on `<html>`, set by a new `ThemeSync` component (mirrors the existing `LocaleSync` in `App.jsx`). `:root[data-theme="light"|"dark"|"high-contrast"]` blocks in `src/index.css` override token values; `theme === 'system'` removes the attribute and a `@media (prefers-color-scheme: dark)` block takes over. Existing token names are kept wherever possible; a small number of dual-role tokens are split (see Task 1) because the same token was being used for two contrast-incompatible purposes (text-on-page vs. solid-fill-behind-white-text).

**Tech Stack:** React, CSS custom properties, Vitest + React Testing Library + jest-axe, Playwright + axe-core, Storybook.

## Global Constraints

- Every text/background pairing must be ≥4.5:1 (WCAG AA normal text); every border/non-text UI pairing ≥3:1. Verified in Task 1's test and re-verified for real rendered pages in Task 7's e2e axe scans.
- Per-game *content* colors (Color Match swatches, character/animal art) and the correct/wrong feedback signal colors (`.correct`/`.wrong`, `pulse-green`/`shake-red`) do **not** retheme — out of scope, do not touch.
- Light theme's rendered output must not change pixel-wise (the existing 38-story visual-regression baseline must keep passing unmodified) — every light-theme token value below is identical to what's in `src/index.css` today.
- `theme` default is `'system'`.

---

## Task 1: Token layer in `src/index.css`

**Files:**
- Modify: `src/index.css`
- Test: `src/__tests__/themeTokenContrast.test.js` (new)

**Interfaces:**
- Produces: every CSS custom property listed below, readable by any component via `var(--token-name)`, resolved per `data-theme` attribute on `<html>` (or `@media (prefers-color-scheme: dark)` when no attribute is present).

- [ ] **Step 1: Write the failing contrast test**

Create `src/__tests__/themeTokenContrast.test.js`:

```js
import { describe, it, expect } from 'vitest'

// Mirrors src/index.css's theme token blocks. Keep these values in sync manually
// whenever index.css's theme blocks change — same maintenance convention as
// disabledWrongChoiceContrast.test.js's filter constants.
const THEMES = {
  light: {
    bg: '#F0FDFF', surface: '#FFFFFF', text: '#37474F', textMuted: '#5B6B70',
    error: '#c62828', errorSolid: '#c62828', onAccent: '#FFFFFF',
    lavenderText: '#6A4FA3', tealText: '#00695C',
    aqua: '#80DEEA', teal: '#80CBC4', lavender: '#B39DDB', lilac: '#CE93D8',
    aquaDark: '#006C7A', tealDark: '#00695C', lavenderDark: '#6A4FA3',
  },
  dark: {
    bg: '#0D2126', surface: '#17323A', text: '#E8F6F7', textMuted: '#9EC2C7',
    error: '#FF8A80', errorSolid: '#c62828', onAccent: '#FFFFFF',
    lavenderText: '#B39DDB', tealText: '#80CBC4',
    aqua: '#80DEEA', teal: '#80CBC4', lavender: '#B39DDB', lilac: '#CE93D8',
    aquaDark: '#006C7A', tealDark: '#00695C', lavenderDark: '#6A4FA3',
  },
  highContrast: {
    bg: '#000000', surface: '#000000', text: '#FFFFFF', textMuted: '#C8C8C8',
    error: '#FF6E6E', errorSolid: '#FF6E6E', onAccent: '#000000',
    lavenderText: '#C9A9FF', tealText: '#26D9B7',
    aqua: '#4DD8E8', teal: '#26D9B7', lavender: '#C9A9FF', lilac: '#FF8AD8',
    aquaDark: '#4DD8E8', tealDark: '#26D9B7', lavenderDark: '#C9A9FF',
  },
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function relLum([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}
function contrast(hexA, hexB) {
  const l1 = relLum(hexToRgb(hexA)), l2 = relLum(hexToRgb(hexB))
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

const TEXT_MIN = 4.5
const NON_TEXT_MIN = 3

describe.each(Object.entries(THEMES))('%s theme token contrast', (_name, t) => {
  it('body text on page background >= 4.5:1', () => {
    expect(contrast(t.text, t.bg)).toBeGreaterThanOrEqual(TEXT_MIN)
  })
  it('body text on card surface >= 4.5:1', () => {
    expect(contrast(t.text, t.surface)).toBeGreaterThanOrEqual(TEXT_MIN)
  })
  it('muted text on page background >= 4.5:1', () => {
    expect(contrast(t.textMuted, t.bg)).toBeGreaterThanOrEqual(TEXT_MIN)
  })
  it('error text on page background >= 4.5:1', () => {
    expect(contrast(t.error, t.bg)).toBeGreaterThanOrEqual(TEXT_MIN)
  })
  it('lavender-text heading on page background >= 4.5:1', () => {
    expect(contrast(t.lavenderText, t.bg)).toBeGreaterThanOrEqual(TEXT_MIN)
  })
  it('teal-text heading on page background >= 4.5:1', () => {
    expect(contrast(t.tealText, t.bg)).toBeGreaterThanOrEqual(TEXT_MIN)
  })
  it('on-accent text on each solid-fill token >= 4.5:1', () => {
    expect(contrast(t.onAccent, t.aquaDark)).toBeGreaterThanOrEqual(TEXT_MIN)
    expect(contrast(t.onAccent, t.tealDark)).toBeGreaterThanOrEqual(TEXT_MIN)
    expect(contrast(t.onAccent, t.lavenderDark)).toBeGreaterThanOrEqual(TEXT_MIN)
    expect(contrast(t.onAccent, t.errorSolid)).toBeGreaterThanOrEqual(TEXT_MIN)
  })
  it('accent pop colors are non-text-visible (>= 3:1) against the page background', () => {
    expect(contrast(t.aqua, t.bg)).toBeGreaterThanOrEqual(NON_TEXT_MIN)
    expect(contrast(t.teal, t.bg)).toBeGreaterThanOrEqual(NON_TEXT_MIN)
    expect(contrast(t.lavender, t.bg)).toBeGreaterThanOrEqual(NON_TEXT_MIN)
    expect(contrast(t.lilac, t.bg)).toBeGreaterThanOrEqual(NON_TEXT_MIN)
  })
})

// Negative case: proves the test actually discriminates rather than trivially
// passing everything.
it('a deliberately low-contrast pairing fails the same assertion style', () => {
  expect(contrast('#5B6B70', '#5B6B70')).toBeLessThan(TEXT_MIN)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/themeTokenContrast.test.js`
Expected: the `highContrast` describe block's tests currently pass trivially (values already chosen to pass) — but since `index.css` doesn't have these tokens defined yet, this step is really about confirming the *negative* case fails as expected and the file has no typos. Expected: negative case (last `it`) PASSES (contrast of identical colors is 1, which is `< 4.5`), all `describe.each` blocks PASS (the constants were chosen to satisfy them) — this is a from-data test rather than one that depends on `index.css` existing yet, so "failing" here just means confirming no syntax errors. Run it and confirm 0 failures, 0 errors.

- [ ] **Step 3: Add the theme token layer to `src/index.css`**

Replace the current `:root { ... }` block (lines 3-20) with:

```css
:root {
  --color-aqua:        #80DEEA;
  --color-aqua-dark:   #006C7A;
  --color-teal:        #80CBC4;
  --color-teal-dark:   #00695C;
  --color-lavender:      #B39DDB;
  --color-lavender-dark: #6A4FA3;
  --color-lilac:       #CE93D8;
  --color-lilac-dark:  #8E24AA;
  --color-error:       #c62828;
  --color-error-solid: #c62828;
  --color-bg:          #F0FDFF;
  --color-surface:     #FFF;
  --color-text:        #37474F;
  --color-text-muted:  #5B6B70;
  --radius-card:    20px;
  --radius-button:  16px;
  --font-main:      'Nunito', sans-serif;

  /* Text/border role split out of the old dual-purpose -dark tokens: -dark
     itself stays a solid-fill-behind-white-text color (bg-independent, so it
     doesn't need to vary by theme); these -text tokens are for headings/
     borders painted directly on the page/card background, which DOES need to
     vary by theme (a value that reads on a white card fails on a dark one). */
  --color-lavender-text: #6A4FA3;
  --color-teal-text:     #00695C;

  /* Text color drawn on top of a solid accent fill (--color-*-dark /
     --color-error-solid). White in light/dark; flips to black in high
     contrast, where the accent fills themselves become bright. */
  --color-on-accent: #FFFFFF;

  /* Parent Dashboard activity heatmap's 4-step sequential scale + the
     matching progress-bar track background (same "faint aqua" shade as
     heatmap step 0). */
  --color-heatmap-0: #e8f4f6;
  --color-heatmap-1: #80cbc4;
  --color-heatmap-2: #26a69a;
  --color-heatmap-3: #006C7A;

  /* Structural chrome tints: visible borders, hover/active washes, and the
     exit-confirm modal backdrop dimmer. Light values below are byte-for-byte
     what every call site already hardcoded (rgb(0 0 0 / N%)) before this
     token existed, so switching a site over to the token is a zero-diff
     change in light theme. */
  --color-hairline: rgb(0 0 0 / 12%);
  --color-hover-tint: rgb(0 0 0 / 6%);
  --color-backdrop: rgb(0 0 0 / 45%);

  /* Card/panel border, invisible in light/dark (where surface already reads
     against the page background) and a solid white outline in high contrast
     (where surface == bg == black, so a card has no boundary without one). */
  --color-surface-outline: transparent;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --color-bg: #0D2126;
    --color-surface: #17323A;
    --color-text: #E8F6F7;
    --color-text-muted: #9EC2C7;
    --color-error: #FF8A80;
    --color-lavender-text: #B39DDB;
    --color-teal-text: #80CBC4;
    --color-heatmap-0: #173139;
    --color-heatmap-1: #00695C;
    --color-heatmap-2: #26a69a;
    --color-heatmap-3: #80DEEA;
    --color-hairline: rgb(255 255 255 / 40%);
    --color-hover-tint: rgb(255 255 255 / 10%);
  }
}

:root[data-theme="dark"] {
  --color-bg: #0D2126;
  --color-surface: #17323A;
  --color-text: #E8F6F7;
  --color-text-muted: #9EC2C7;
  --color-error: #FF8A80;
  --color-lavender-text: #B39DDB;
  --color-teal-text: #80CBC4;
  --color-heatmap-0: #173139;
  --color-heatmap-1: #00695C;
  --color-heatmap-2: #26a69a;
  --color-heatmap-3: #80DEEA;
  --color-hairline: rgb(255 255 255 / 40%);
  --color-hover-tint: rgb(255 255 255 / 10%);
}

:root[data-theme="high-contrast"] {
  --color-aqua: #4DD8E8;
  --color-teal: #26D9B7;
  --color-lavender: #C9A9FF;
  --color-lilac: #FF8AD8;
  --color-aqua-dark: #4DD8E8;
  --color-teal-dark: #26D9B7;
  --color-lavender-dark: #C9A9FF;
  --color-error: #FF6E6E;
  --color-error-solid: #FF6E6E;
  --color-on-accent: #000000;
  --color-bg: #000000;
  --color-surface: #000000;
  --color-text: #FFFFFF;
  --color-text-muted: #C8C8C8;
  --color-lavender-text: #C9A9FF;
  --color-teal-text: #26D9B7;
  --color-heatmap-0: #000000;
  --color-heatmap-1: #26D9B7;
  --color-heatmap-2: #4DD8E8;
  --color-heatmap-3: #C9A9FF;
  --color-hairline: #FFFFFF;
  --color-hover-tint: rgb(255 255 255 / 20%);
  --color-surface-outline: #FFFFFF;
}
```

(Only the token *definitions* change; every other rule already in `src/index.css` — `html`, `.sr-only`, `body`, `button`, the `@keyframes`, `.correct`/`.wrong`, `.game__choice--disabled-wrong` — is untouched.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/themeTokenContrast.test.js`
Expected: PASS, 0 failures (this test doesn't read `index.css` directly — it's checking the hardcoded constants above, which now match what you just wrote into `index.css`; the two must be kept in sync by hand, same as the existing filter-contrast test's convention).

- [ ] **Step 5: Run the full unit suite to confirm nothing else broke**

Run: `npx vitest run`
Expected: PASS (adding new CSS custom properties and a new test file doesn't touch any existing component)

- [ ] **Step 6: Commit**

```bash
git add src/index.css src/__tests__/themeTokenContrast.test.js
git commit -m "feat(11): add Light/Dark/High-Contrast theme token layer to index.css"
```

---

## Task 2: Repoint text-role, solid-fill, and error-solid consumers

**Files:**
- Modify: `src/components/AppShell.css`, `src/components/BadgeGallery.css`, `src/components/CategorySection.css`, `src/components/Dashboard.css`, `src/components/ExitConfirmDialog.css`, `src/components/GameResults.css`, `src/components/TagFilterBar.css`, `src/components/GameIntro.css`, `src/components/ResumePrompt.css`, `src/components/MemoryBoard.css`, `src/kids/KidsProgressPage.css`, `src/parent/DateRangeFilter.css`, `src/parent/ParentDashboard.css`, `src/admin/AdminPage.css`

**Interfaces:**
- Consumes: `--color-lavender-text`, `--color-teal-text`, `--color-on-accent`, `--color-error-solid` from Task 1.

This task is pure mechanical CSS editing — no new tokens, no test file (existing tests/visual-regression baselines are the verification: light theme must render byte-identical, since every light-theme value below equals what's already there today).

- [ ] **Step 1: Text-role sites — repoint `-dark` to `-text`**

These 11 sites use the accent-dark token as a *heading/label color painted on the page or card background* (not as a solid-fill button). Change each:

| File:Line | Old | New |
|---|---|---|
| `src/components/AppShell.css:40` | `color: var(--color-lavender-dark);` | `color: var(--color-lavender-text);` |
| `src/components/AppShell.css:133` | `color: var(--color-lavender-dark);` | `color: var(--color-lavender-text);` |
| `src/components/BadgeGallery.css:35` | `color: var(--color-teal-dark);` | `color: var(--color-teal-text);` |
| `src/components/CategorySection.css:8` | `color: var(--color-lavender-dark);` | `color: var(--color-lavender-text);` |
| `src/components/Dashboard.css:13` | `color: var(--color-lavender-dark);` | `color: var(--color-lavender-text);` |
| `src/components/Dashboard.css:136` | `color: var(--color-lavender-dark);` | `color: var(--color-lavender-text);` |
| `src/components/ExitConfirmDialog.css:30` | `color: var(--color-teal-dark);` | see Step 4 below (this one's background also changes) |
| `src/components/GameResults.css:6` | `color: var(--color-teal-dark);` | `color: var(--color-teal-text);` |
| `src/components/TagFilterBar.css:25` | `color: var(--color-lavender-dark);` | `color: var(--color-lavender-text);` |
| `src/kids/KidsProgressPage.css:32` | `color: var(--color-teal-dark);` | `color: var(--color-teal-text);` |
| `src/parent/ParentDashboard.css:45` | `color: var(--color-lavender-dark);` | `color: var(--color-lavender-text);` |

Use the Edit tool once per file (each `color: var(--color-*-dark);` string is unique within its file except Dashboard.css and AppShell.css, which each have two — use enough surrounding context, e.g. the containing selector, to disambiguate).

- [ ] **Step 2: Solid-fill sites — repoint hardcoded white/`--color-surface`-as-text to `--color-on-accent`**

These sites pair a solid accent-dark background with hardcoded `white`/`#fff`/`var(--color-surface)` text:

`src/admin/AdminPage.css`:
```css
/* line 27-31, was: */
.admin__tab--active {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: #fff;
}
/* becomes: */
.admin__tab--active {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-on-accent);
}

/* line 40-44, was: */
.admin__tab--active:hover {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: #fff;
}
/* becomes: */
.admin__tab--active:hover {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-on-accent);
}

/* line 81-84, was: */
.admin__radio-label.selected {
  background: var(--color-aqua-dark);
  color: white;
}
/* becomes: */
.admin__radio-label.selected {
  background: var(--color-aqua-dark);
  color: var(--color-on-accent);
}

/* line 116-119, was: */
.admin__toggle-btn.active {
  background: var(--color-teal-dark);
  color: white;
}
/* becomes: */
.admin__toggle-btn.active {
  background: var(--color-teal-dark);
  color: var(--color-on-accent);
}

/* line 191-200, was: */
.admin__tag-save {
  padding: 6px 16px;
  border-radius: var(--radius-button);
  border: none;
  background: var(--color-lavender-dark);
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}
/* becomes (only the color line changes): */
.admin__tag-save {
  padding: 6px 16px;
  border-radius: var(--radius-button);
  border: none;
  background: var(--color-lavender-dark);
  color: var(--color-on-accent);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}
```

`src/components/Dashboard.css`:
```css
/* line 48-52, was: */
.dashboard__tab--active {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-surface);
}
/* becomes: */
.dashboard__tab--active {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-on-accent);
}

/* line 65-69, was: */
.dashboard__tab--active:hover {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-surface);
}
/* becomes: */
.dashboard__tab--active:hover {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-on-accent);
}
```
(Note: `--color-surface` was being (ab)used here as a stand-in for "white" — it breaks the moment surface stops being white, i.e. in Dark theme. This is a real latent bug this task fixes.)

`src/parent/DateRangeFilter.css`:
```css
/* line 24-28, was: */
.date-range-filter__tab--active {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-surface);
}
/* becomes: */
.date-range-filter__tab--active {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-on-accent);
}

/* line 37-41, was: */
.date-range-filter__tab--active:hover {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-surface);
}
/* becomes: */
.date-range-filter__tab--active:hover {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-on-accent);
}
```

`src/components/MemoryBoard.css`:
```css
/* line 72-75, was: */
.memory-board__tile-back {
  background: var(--color-lavender-dark);
  color: var(--color-surface);
}
/* becomes: */
.memory-board__tile-back {
  background: var(--color-lavender-dark);
  color: var(--color-on-accent);
}
```

`src/parent/ParentDashboard.css`:
```css
/* line 12-23, the .parent__export-btn rule, was: */
  background: var(--color-aqua-dark);
  color: #fff;
/* becomes: */
  background: var(--color-aqua-dark);
  color: var(--color-on-accent);
```

`src/components/GameIntro.css`:
```css
/* line 57-66, the .game-intro__start rule, was: */
  background: var(--color-lavender-dark);
  color: white;
/* becomes: */
  background: var(--color-lavender-dark);
  color: var(--color-on-accent);
```

`src/components/ResumePrompt.css`:
```css
/* line 46-49, the .resume-prompt__resume rule, was: */
.resume-prompt__resume {
  background: var(--color-lavender-dark);
  color: white;
}
/* becomes: */
.resume-prompt__resume {
  background: var(--color-lavender-dark);
  color: var(--color-on-accent);
}
```

- [ ] **Step 3: Bundled bug fix — `.results__btn--play`'s 2.40:1 contrast failure**

In `src/components/GameResults.css` line 12:

```css
/* was: */
.results__btn--play  { background: var(--color-lavender); color: white; border: none; }
/* becomes: */
.results__btn--play  { background: var(--color-lavender-dark); color: var(--color-on-accent); border: none; }
```

- [ ] **Step 4: `.exit-confirm__keep` — unify with the other primary-CTA buttons**

`.exit-confirm__keep` currently pairs `color: var(--color-teal-dark)` (text) with `background: var(--color-teal)` (its own background, not the page) — a self-contained pairing that breaks once `--color-teal-dark` and `--color-teal` are no longer guaranteed to differ enough (they become nearly identical in Dark theme once `-text` reuses the base pastel, and identical in High Contrast). Fix by converting it to the same solid-fill pattern used by every other primary button in the app:

In `src/components/ExitConfirmDialog.css` lines 26-32:

```css
/* was: */
.exit-confirm__keep {
  min-height: 80px;
  font-size: 1.375rem;
  font-weight: 800;
  color: var(--color-teal-dark);
  background: var(--color-teal);
}
/* becomes: */
.exit-confirm__keep {
  min-height: 80px;
  font-size: 1.375rem;
  font-weight: 800;
  color: var(--color-on-accent);
  background: var(--color-teal-dark);
}
```

- [ ] **Step 5: Error-solid split + plain token fix in `src/admin/AdminPage.css`**

`.admin__tag-reset` uses `--color-error` as both its solid background *and* implicitly needs `--color-on-accent` text — same dual-role problem as the accent tokens, resolved with the `--color-error-solid` token from Task 1:

```css
/* line 206-215, was: */
.admin__tag-reset {
  padding: 6px 16px;
  border-radius: var(--radius-button);
  border: 2px solid var(--color-error);
  background: var(--color-error);
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}
/* becomes: */
.admin__tag-reset {
  padding: 6px 16px;
  border-radius: var(--radius-button);
  border: 2px solid var(--color-error);
  background: var(--color-error-solid);
  color: var(--color-on-accent);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}
```

Also fix the plain hardcoded-hex text color in `.admin__reset` (line 124-135, no dual-role conflict here, it's a straightforward literal-to-token swap):

```css
/* was: */
.admin__reset {
  margin-top: 32px;
  margin-bottom: 28px;
  width: 100%;
  padding: 16px;
  background: transparent;
  border: 2px solid var(--color-error);
  color: #c62828;
  font-weight: 700;
  border-radius: var(--radius-button);
  min-height: 64px;
}
/* becomes (only the color line changes): */
.admin__reset {
  margin-top: 32px;
  margin-bottom: 28px;
  width: 100%;
  padding: 16px;
  background: transparent;
  border: 2px solid var(--color-error);
  color: var(--color-error);
  font-weight: 700;
  border-radius: var(--radius-button);
  min-height: 64px;
}
```

- [ ] **Step 6: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS — none of these are behavioral changes, only CSS value/token substitutions that render identically in Light theme.

- [ ] **Step 7: Run lint:css**

Run: `npm run lint:css`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/AppShell.css src/components/BadgeGallery.css src/components/CategorySection.css src/components/Dashboard.css src/components/ExitConfirmDialog.css src/components/GameResults.css src/components/TagFilterBar.css src/components/GameIntro.css src/components/ResumePrompt.css src/components/MemoryBoard.css src/kids/KidsProgressPage.css src/parent/DateRangeFilter.css src/parent/ParentDashboard.css src/admin/AdminPage.css
git commit -m "fix(11): repoint accent-dark/error text-vs-solid-fill roles onto theme-aware tokens

Also fixes a pre-existing WCAG failure: .results__btn--play had white text
on the light --color-lavender pastel (2.40:1); now uses --color-lavender-dark
(6.44:1), the token every other primary button already used correctly."
```

---

## Task 3: Repoint hairline/hover-tint/backdrop/surface-outline + heatmap consumers

**Files:**
- Modify: `src/admin/AdminPage.css`, `src/components/AppShell.css`, `src/components/CategorySection.css`, `src/components/Dashboard.css`, `src/components/ExitConfirmDialog.css`, `src/components/FeaturedGameCard.css`, `src/components/GameCard.css`, `src/components/ScoreHistory.css`, `src/games/color-match/ColorMatchGame.css`, `src/games/character-match/CharacterMatchGame.css`, `src/games/character-match-bluey/CharacterMatchGameBluey.css`, `src/kids/KidsProgressPage.css`, `src/parent/DateRangeFilter.css`, `src/parent/ParentDashboard.css`

**Interfaces:**
- Consumes: `--color-hairline`, `--color-hover-tint`, `--color-backdrop`, `--color-surface-outline`, `--color-heatmap-0..3` from Task 1.

- [ ] **Step 1: Border/divider sites → `--color-hairline`**

| File:Line | Old | New |
|---|---|---|
| `src/admin/AdminPage.css:13` | `border: 2px solid rgb(0 0 0 / 12%);` | `border: 2px solid var(--color-hairline);` |
| `src/components/AppShell.css:16` | `border-bottom: 1px solid rgb(0 0 0 / 8%);` | `border-bottom: 1px solid var(--color-hairline);` |
| `src/components/AppShell.css:124` | `border-top: 1px solid rgb(0 0 0 / 8%);` | `border-top: 1px solid var(--color-hairline);` |
| `src/components/AppShell.css:167` | `border-top: 1px solid rgb(0 0 0 / 8%);` | `border-top: 1px solid var(--color-hairline);` |
| `src/components/CategorySection.css:11` | `border-bottom: 2px solid rgb(0 0 0 / 6%);` | `border-bottom: 2px solid var(--color-hairline);` |
| `src/components/Dashboard.css:35` | `border: 2px solid rgb(0 0 0 / 12%);` | `border: 2px solid var(--color-hairline);` |
| `src/components/Dashboard.css:86` | `border: 2px solid rgb(0 0 0 / 12%);` | `border: 2px solid var(--color-hairline);` |
| `src/components/Dashboard.css:132` | `border: 2px solid rgb(0 0 0 / 12%);` | `border: 2px solid var(--color-hairline);` |
| `src/components/ExitConfirmDialog.css:38` | `border: 2px solid rgb(0 0 0 / 12%);` | `border: 2px solid var(--color-hairline);` |
| `src/games/color-match/ColorMatchGame.css:3` | `.game__choice--bordered { border: 2px solid rgb(0 0 0 / 15%); }` | `.game__choice--bordered { border: 2px solid var(--color-hairline); }` |
| `src/parent/DateRangeFilter.css:13` | `border: 2px solid rgb(0 0 0 / 12%);` | `border: 2px solid var(--color-hairline);` |
| `src/parent/DateRangeFilter.css:62` | `border: 2px solid rgb(0 0 0 / 12%);` | `border: 2px solid var(--color-hairline);` |

- [ ] **Step 2: Hover/active wash sites → `--color-hover-tint`**

| File:Line | Old | New |
|---|---|---|
| `src/admin/AdminPage.css:23` | `.admin__tab:hover { background: rgb(0 0 0 / 5%); }` | `.admin__tab:hover { background: var(--color-hover-tint); }` |
| `src/components/AppShell.css:93` | `.shell__home:hover { background: rgb(0 0 0 / 6%); }` (part of a shared selector list — edit just this file's own declaration, the shared selector block already lists `.shell__brand:hover, .shell__back:hover, .shell__nav-link:hover, .shell__home:hover { background: rgb(0 0 0 / 6%); }`) | `{ background: var(--color-hover-tint); }` |
| `src/components/AppShell.css:108` | `.shell__nav-link[aria-current='page'] { background: rgb(0 0 0 / 8%); }` | `.shell__nav-link[aria-current='page'] { background: var(--color-hover-tint); }` |
| `src/components/Dashboard.css:45` | `background: rgb(0 0 0 / 5%);` | `background: var(--color-hover-tint);` |
| `src/components/FeaturedGameCard.css:42` | `background: rgb(0 0 0 / 5%);` | `background: var(--color-hover-tint);` |
| `src/components/GameCard.css:39` | `background: rgb(0 0 0 / 5%);` | `background: var(--color-hover-tint);` |
| `src/components/GameCard.css:48` | `background: rgb(0 0 0 / 5%);` | `background: var(--color-hover-tint);` |
| `src/parent/DateRangeFilter.css:22` | `.date-range-filter__tab:hover { background: rgb(0 0 0 / 5%); }` | `.date-range-filter__tab:hover { background: var(--color-hover-tint); }` |
| `src/parent/ParentDashboard.css:86` | `border-bottom: 1px solid rgb(0 0 0 / 7%);` | `border-bottom: 1px solid var(--color-hover-tint);` |

- [ ] **Step 3: Modal backdrop → `--color-backdrop`**

`src/components/ExitConfirmDialog.css:9`: `background: rgb(0 0 0 / 45%);` → `background: var(--color-backdrop);`

- [ ] **Step 4: Card/panel outline → `--color-surface-outline`, so cards stay visible in High Contrast**

Add `border: 2px solid var(--color-surface-outline);` to each of these rules (all currently have no border at all, so this is invisible in Light/Dark — `--color-surface-outline` is `transparent` there — and becomes a real white outline only in High Contrast):

- `src/components/ExitConfirmDialog.css` — the `.exit-confirm` rule (lines 12-22)
- `src/components/FeaturedGameCard.css` — the rule containing `background: var(--color-surface)` (line 8)
- `src/components/GameCard.css` — the rule containing `background: var(--color-surface)` (line 9)
- `src/components/ScoreHistory.css` — the rule containing `background: var(--color-surface)` (line 8)
- `src/games/character-match/CharacterMatchGame.css:2` — `.game__choice { background: var(--color-surface); border: 2px solid var(--color-surface-outline); }`
- `src/games/character-match-bluey/CharacterMatchGameBluey.css:2` — same change
- `src/kids/KidsProgressPage.css` — the rule containing `background: var(--color-surface)` (line 4, `.kid-progress__game`)
- `src/parent/ParentDashboard.css` — the `.parent__section` rule (line 34)

(Do **not** touch `src/admin/AdminPage.css:154`'s `.admin__text-input` — it already has its own `border: 2px solid var(--color-aqua)`, which stays visible in High Contrast since `--color-aqua` is brightened there. Do **not** touch `src/components/AppShell.css:15`'s `.shell__header` — its existing `border-bottom` was already converted to `--color-hairline` in Step 1, giving it a visible edge without a full outline.)

- [ ] **Step 5: Heatmap tokens in `src/parent/ParentDashboard.css`**

```css
/* line 192-195, was: */
.heatmap__cell--0 { background: #e8f4f6; }
.heatmap__cell--1 { background: #80cbc4; }
.heatmap__cell--2 { background: #26a69a; }
.heatmap__cell--3 { background: #006C7A; }
/* becomes: */
.heatmap__cell--0 { background: var(--color-heatmap-0); }
.heatmap__cell--1 { background: var(--color-heatmap-1); }
.heatmap__cell--2 { background: var(--color-heatmap-2); }
.heatmap__cell--3 { background: var(--color-heatmap-3); }

/* line 240 (.parent__missed-bar-wrap), was: */
  background: #e8f4f6;
/* becomes (same shade, now theme-aware): */
  background: var(--color-heatmap-0);
```

- [ ] **Step 6: Run the full unit suite and lint:css**

Run: `npx vitest run && npm run lint:css`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/admin/AdminPage.css src/components/AppShell.css src/components/CategorySection.css src/components/Dashboard.css src/components/ExitConfirmDialog.css src/components/FeaturedGameCard.css src/components/GameCard.css src/components/ScoreHistory.css src/games/color-match/ColorMatchGame.css src/games/character-match/CharacterMatchGame.css src/games/character-match-bluey/CharacterMatchGameBluey.css src/kids/KidsProgressPage.css src/parent/DateRangeFilter.css src/parent/ParentDashboard.css
git commit -m "fix(11): repoint hardcoded translucent-black tints/borders onto theme-aware tokens

These borders, hover washes, dividers, and the exit-confirm backdrop were
hardcoded rgb(0 0 0 / N%) — invisible or wrong once the background they sit
on is no longer light. Card panels also gain --color-surface-outline (a
no-op in Light/Dark, a real white outline in High Contrast, where surface
and page background are both pure black and a card has no boundary without
one)."
```

---

## Task 4: `theme` setting + `ThemeSync`

**Files:**
- Modify: `src/storage/adapter.js`, `src/App.jsx`, `src/App.test.jsx`

**Interfaces:**
- Produces: `DEFAULT_SETTINGS.theme = 'system'`; `ThemeSync` component (exported nowhere — mounted directly in `App.jsx`, same as `LocaleSync`/`GoogleAnalytics`); sets/removes `document.documentElement.dataset.theme`.

- [ ] **Step 1: Write the failing tests in `src/App.test.jsx`**

Add a new describe block (this file already mocks nothing for `storage/index` at the top for the locale-sync tests above it — reuse the same real `i18n`/`App` imports already present):

```jsx
describe('App — theme sync', () => {
  it('sets data-theme to the persisted explicit theme', async () => {
    storage.getSettings.mockResolvedValue({ theme: 'dark' })
    render(<App />)
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    storage.getSettings.mockResolvedValue({ locale: 'en' })
  })

  it('sets data-theme to high-contrast', async () => {
    storage.getSettings.mockResolvedValue({ theme: 'high-contrast' })
    render(<App />)
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('high-contrast'))
    storage.getSettings.mockResolvedValue({ locale: 'en' })
  })

  it('removes the data-theme attribute for the system setting (lets the CSS media query resolve it)', async () => {
    document.documentElement.dataset.theme = 'dark' // simulate a leftover from a previous explicit choice
    storage.getSettings.mockResolvedValue({ theme: 'system' })
    render(<App />)
    await waitFor(() => expect(document.documentElement.dataset.theme).toBeUndefined())
    storage.getSettings.mockResolvedValue({ locale: 'en' })
  })

  it('falls back to system (no attribute) for an unrecognized persisted value, without throwing', async () => {
    document.documentElement.dataset.theme = 'dark'
    storage.getSettings.mockResolvedValue({ theme: 'blorp' })
    expect(() => render(<App />)).not.toThrow()
    await waitFor(() => expect(document.documentElement.dataset.theme).toBeUndefined())
    storage.getSettings.mockResolvedValue({ locale: 'en' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/App.test.jsx -t "theme sync"`
Expected: FAIL — `document.documentElement.dataset.theme` never gets set (no `ThemeSync` exists yet).

- [ ] **Step 3: Add `theme` to `DEFAULT_SETTINGS`**

NOTE: this worktree's `main` already has the parental-lock feature (#127) merged, so `DEFAULT_SETTINGS` already has a `parentalLock` field (and its own JSDoc block) after `soundEffectsEnabled: true,`. Add `theme` immediately after `soundEffectsEnabled: true,` and before the `parentalLock` comment/field — don't disturb the `parentalLock` entry:

```js
  soundEffectsEnabled: true,
  theme: 'system',
  // parentalLock.enabled gates /admin and /parent behind a challenge (issue
  // ... (existing comment + parentalLock field stay exactly as they are)
```

And extend the JSDoc Settings-shape comment (find the existing `soundEffectsEnabled: boolean — ...` doc line and add this line after it — exact line number will differ from a fresh checkout, locate by content):

```js
 *   soundEffectsEnabled: boolean — gates game sound effects: memory match sounds and quiz correct/wrong chimes (added v0.23.0; quiz chimes v0.26.0)
 *   theme: 'system' | 'light' | 'dark' | 'high-contrast' — 'system' follows the OS prefers-color-scheme
 *     (light/dark only; never auto-selects high-contrast). Applied to <html data-theme> by ThemeSync in
 *     App.jsx. (added v0.38.0)
```

- [ ] **Step 4: Add `ThemeSync` and mount it in `src/App.jsx`**

NOTE: this worktree's `App.jsx` has an extra `import ParentalLockGate from './components/ParentalLockGate'` line near the top (from the already-merged #127), shifting every line below by 1 versus a fresh checkout. Locate `LocaleSync` by content, not line number — add `ThemeSync` directly after it:

```jsx
const VALID_THEMES = new Set(['light', 'dark', 'high-contrast'])

function ThemeSync() {
  const { settings, loaded } = useSettings()

  useEffect(() => {
    if (!loaded) return
    if (VALID_THEMES.has(settings.theme)) {
      document.documentElement.dataset.theme = settings.theme
    } else {
      delete document.documentElement.dataset.theme
    }
  }, [loaded, settings.theme])

  return null
}
```

Mount it next to `LocaleSync` in the `App` component's render (line 104-105):

```jsx
      <GoogleAnalytics />
      <LocaleSync />
      <ThemeSync />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/App.test.jsx`
Expected: PASS (all locale-sync tests still pass, all four new theme-sync tests pass)

- [ ] **Step 6: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/storage/adapter.js src/App.jsx src/App.test.jsx
git commit -m "feat(11): add theme setting + ThemeSync (data-theme attribute sync)"
```

---

## Task 5: Admin Theme control

**Files:**
- Modify: `src/admin/AdminPage.jsx`, `src/i18n/en.json`, `src/i18n/es.json`, `src/i18n/pl.json`
- Test: `src/admin/__tests__/AdminPage.test.jsx`

**Interfaces:**
- Consumes: `settings.theme`, `updateSetting('theme', value)` from `useSettings()` (already destructured in `AdminPage.jsx`).

- [ ] **Step 1: Write the failing tests**

Add to `src/admin/__tests__/AdminPage.test.jsx` (mirroring the existing `feedbackMode`/`animationsEnabled` toggle-button test patterns already in this file):

```jsx
describe('AdminPage — theme', () => {
  it('calls updateSetting with each theme option and marks it active', async () => {
    const { updateSetting } = renderAdminPage() // use this file's existing render helper / settings mock, whatever it's named
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /dark/i }))
    expect(updateSetting).toHaveBeenCalledWith('theme', 'dark')

    await user.click(screen.getByRole('button', { name: /high contrast/i }))
    expect(updateSetting).toHaveBeenCalledWith('theme', 'high-contrast')
  })

  it('re-clicking the already-selected theme option does not throw or duplicate the active state', async () => {
    renderAdminPage({ settings: { theme: 'dark' } })
    const user = userEvent.setup()
    const darkButton = screen.getByRole('button', { name: /dark/i })
    expect(darkButton).toHaveClass('active')

    await user.click(darkButton)
    expect(darkButton).toHaveClass('active')
    expect(screen.getAllByRole('button', { name: /dark/i })).toHaveLength(1)
  })
})
```

Adapt `renderAdminPage`/mock names to whatever helper this test file already uses for rendering with a controllable `settings`/`updateSetting` spy — read the top of `src/admin/__tests__/AdminPage.test.jsx` first and match its existing pattern exactly (it already tests `feedbackMode` and `animationsEnabled` toggles the same way).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx -t theme`
Expected: FAIL — no "Dark"/"High Contrast" button exists yet.

- [ ] **Step 3: Add i18n strings**

NOTE: this worktree's `main` already has the merged parental-lock feature (#127), which added its own `"parentalLockHeading"` key immediately after `"soundEffectsOff"` in each i18n file's `"admin"` object, and its own `"parentalLockHeading"`/`"parentalLockMathPrompt"` keys in the `"shell"`-adjacent area of Task 6's file too — don't confuse these with the new `theme*` keys below, and don't remove/reorder them. Locate `"soundEffectsOff": "Off",` by content (exact line number will differ from a fresh checkout) and insert the new `theme*` keys immediately after it, before `"parentalLockHeading"`:

`src/i18n/en.json`, in the `"admin"` object, after `"soundEffectsOff": "Off",`:

```json
    "soundEffectsOff": "Off",
    "themeHeading": "Theme",
    "themeSystem": "System",
    "themeLight": "Light",
    "themeDark": "Dark",
    "themeHighContrast": "High Contrast",
```

`src/i18n/es.json`, same location, same key names:

```json
    "themeHeading": "Tema",
    "themeSystem": "Sistema",
    "themeLight": "Claro",
    "themeDark": "Oscuro",
    "themeHighContrast": "Alto contraste",
```

`src/i18n/pl.json`, same location, same key names:

```json
    "themeHeading": "Motyw",
    "themeSystem": "Systemowy",
    "themeLight": "Jasny",
    "themeDark": "Ciemny",
    "themeHighContrast": "Wysoki kontrast",
```

(Match the exact indentation/comma style already in each file at the insertion point — read the surrounding lines before editing.)

- [ ] **Step 4: Add the Theme control to `src/admin/AdminPage.jsx`**

NOTE: in this worktree, the Sound Effects section's closing `</div>` and the Google Analytics section's opening `<div className="admin__section">` are further down than a fresh checkout (the already-merged parental-lock feature added ~26 lines of PIN-related state above this point, and its own new section after Google Analytics) — locate the Sound Effects block by its `admin.soundEffectsHeading`/`admin.soundEffectsOff` content, not by line number, and insert directly after its closing `</div>`, before the Google Analytics section:

```jsx
            <div className="admin__section">
              <h3>{t('admin.themeHeading')}</h3>
              <div className="admin__toggle">
                {[
                  { value: 'system', label: t('admin.themeSystem') },
                  { value: 'light', label: t('admin.themeLight') },
                  { value: 'dark', label: t('admin.themeDark') },
                  { value: 'high-contrast', label: t('admin.themeHighContrast') },
                ].map(opt => (
                  <button
                    key={opt.value}
                    className={`admin__toggle-btn${settings.theme === opt.value ? ' active' : ''}`}
                    onClick={() => updateSetting('theme', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx`
Expected: PASS (existing tests + new theme tests)

- [ ] **Step 6: Run `jest-axe` coverage (already automatic in this file) and the full suite**

Run: `npx vitest run`
Expected: PASS, no new axe violations

- [ ] **Step 7: Commit**

```bash
git add src/admin/AdminPage.jsx src/admin/__tests__/AdminPage.test.jsx src/i18n/en.json src/i18n/es.json src/i18n/pl.json
git commit -m "feat(11): add Theme control to Admin (System/Light/Dark/High Contrast)"
```

---

## Task 6: Global header quick-toggle

**Files:**
- Modify: `src/components/AppShell.jsx`, `src/components/AppShell.css`, `src/i18n/en.json`, `src/i18n/es.json`, `src/i18n/pl.json`
- Test: `src/components/__tests__/AppShell.test.jsx`

**Interfaces:**
- Consumes: `useSettings()` (not currently imported in `AppShell.jsx` — this task adds the import).
- Produces: a `button.shell__theme-toggle` in the header, cycling `system → light → dark → high-contrast → system` on each click.

- [ ] **Step 1: Write the failing tests**

Add near the top of `src/components/__tests__/AppShell.test.jsx`, a mock of `../../storage/index` (this file currently has none — every other describe block will keep working unaffected, since none of them reference settings):

```jsx
import storage from '../../storage/index'

vi.mock('../../storage/index', () => ({
  default: {
    getSettings: vi.fn().mockResolvedValue({ theme: 'system' }),
    saveSettings: vi.fn().mockResolvedValue(undefined),
  },
  DEFAULT_SETTINGS: { theme: 'system' },
}))
```

Add a new describe block:

```jsx
describe('AppShell — theme toggle', () => {
  beforeEach(() => {
    storage.getSettings.mockResolvedValue({ theme: 'system' })
  })

  it('renders a theme toggle button reachable on every route', async () => {
    renderShell('/')
    expect(await screen.findByRole('button', { name: /theme/i })).toBeInTheDocument()
  })

  it('cycles system -> light -> dark -> high-contrast -> system on successive clicks', async () => {
    renderShell('/')
    const button = await screen.findByRole('button', { name: /theme/i })

    fireEvent.click(button)
    await waitFor(() => expect(storage.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'light' })))

    fireEvent.click(button)
    await waitFor(() => expect(storage.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' })))

    fireEvent.click(button)
    await waitFor(() => expect(storage.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'high-contrast' })))

    fireEvent.click(button)
    await waitFor(() => expect(storage.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'system' })))
  })

  it('does not throw or run off the end when cycling from high-contrast', async () => {
    storage.getSettings.mockResolvedValue({ theme: 'high-contrast' })
    renderShell('/')
    const button = await screen.findByRole('button', { name: /theme/i })
    expect(() => fireEvent.click(button)).not.toThrow()
    await waitFor(() => expect(storage.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'system' })))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/__tests__/AppShell.test.jsx -t "theme toggle"`
Expected: FAIL — no button with an accessible name matching `/theme/i` exists yet.

- [ ] **Step 3: Add i18n strings**

NOTE: absolute line numbers below will differ slightly from a fresh checkout (this worktree's `main` already has an unrelated parental-lock feature merged, adding content elsewhere in these files) — locate `"leaveGame"` by content within the `"shell"` object.

`src/i18n/en.json`, in `"shell"`, after `"leaveGame": "Leave game 🏠"` (note the trailing comma needed now):

```json
    "leaveGame": "Leave game 🏠",
    "themeToggleSystem": "Theme: System. Activate to switch to Light.",
    "themeToggleLight": "Theme: Light. Activate to switch to Dark.",
    "themeToggleDark": "Theme: Dark. Activate to switch to High Contrast.",
    "themeToggleHighContrast": "Theme: High Contrast. Activate to switch to System."
```

`src/i18n/es.json`, same location:

```json
    "leaveGame": "Salir del juego 🏠",
    "themeToggleSystem": "Tema: Sistema. Activa para cambiar a Claro.",
    "themeToggleLight": "Tema: Claro. Activa para cambiar a Oscuro.",
    "themeToggleDark": "Tema: Oscuro. Activa para cambiar a Alto contraste.",
    "themeToggleHighContrast": "Tema: Alto contraste. Activa para cambiar a Sistema."
```

`src/i18n/pl.json`, same location:

```json
    "leaveGame": "Opuść grę 🏠",
    "themeToggleSystem": "Motyw: Systemowy. Aktywuj, aby przełączyć na Jasny.",
    "themeToggleLight": "Motyw: Jasny. Aktywuj, aby przełączyć na Ciemny.",
    "themeToggleDark": "Motyw: Ciemny. Aktywuj, aby przełączyć na Wysoki kontrast.",
    "themeToggleHighContrast": "Motyw: Wysoki kontrast. Aktywuj, aby przełączyć na Systemowy."
```

- [ ] **Step 4: Add the toggle button to `src/admin/AdminPage.jsx`'s sibling, `AppShell.jsx`**

Add the import (with the other hook imports, e.g. after `import useHeaderHeightVar from '../hooks/useHeaderHeightVar'`):

```jsx
import useSettings from '../hooks/useSettings'
```

Add this cycle table + handler inside the `AppShell` function body (near `handleHomeButtonClick`):

```jsx
const THEME_CYCLE = ['system', 'light', 'dark', 'high-contrast']
const THEME_ICON = { system: '🌓', light: '☀️', dark: '🌙', 'high-contrast': '◐' }
const THEME_LABEL_KEY = {
  system: 'shell.themeToggleSystem',
  light: 'shell.themeToggleLight',
  dark: 'shell.themeToggleDark',
  'high-contrast': 'shell.themeToggleHighContrast',
}
```

(module scope, above the `AppShell` function, alongside `NAV_ITEMS`/`PAGE_TITLE_KEYS`)

```jsx
  const { settings, updateSetting } = useSettings()
  const currentTheme = THEME_CYCLE.includes(settings.theme) ? settings.theme : 'system'

  function handleThemeToggle() {
    const nextIndex = (THEME_CYCLE.indexOf(currentTheme) + 1) % THEME_CYCLE.length
    updateSetting('theme', THEME_CYCLE[nextIndex])
  }
```

(inside the `AppShell` function body, alongside the other hook calls/handlers)

Add the button in the header's end-side row (`shell__side shell__side--end`), before the `isGameRoute ? ... : <nav>` block, so it's present on every route including game routes:

```jsx
              <div className="shell__side shell__side--end">
                <button
                  className="shell__theme-toggle"
                  aria-label={t(THEME_LABEL_KEY[currentTheme])}
                  onClick={handleThemeToggle}
                >
                  <span aria-hidden="true">{THEME_ICON[currentTheme]}</span>
                </button>
                {isGameRoute ? (
```

(the existing `</nav>` / closing tags for this block are unchanged — only the new `<button>` is inserted as the first child of `shell__side--end`)

- [ ] **Step 5: Add CSS in `src/components/AppShell.css`**

Add `.shell__theme-toggle` to the existing shared selector lists so it gets the same base sizing/hover/focus treatment as `.shell__home` (edit the three selector-list rules already at lines 83-88, 90-93, 95-98, 100-106 to include it):

```css
.shell__theme-toggle {
  min-width: 48px;
  min-height: 48px;
  font-size: 1.5rem;
  background: transparent;
  border-radius: var(--radius-button);
  transition: background 0.15s;
}

.shell__brand:hover,
.shell__back:hover,
.shell__nav-link:hover,
.shell__home:hover,
.shell__theme-toggle:hover { background: var(--color-hover-tint); }

.shell__brand:focus,
.shell__back:focus,
.shell__nav-link:focus,
.shell__home:focus,
.shell__theme-toggle:focus { outline: none; }

.shell__brand:focus-visible,
.shell__back:focus-visible,
.shell__nav-link:focus-visible,
.shell__home:focus-visible,
.shell__theme-toggle:focus-visible {
  outline: 3px solid var(--color-lavender);
  outline-offset: 3px;
}
```

(Replace the existing three `.shell__home:hover`/`:focus`/`:focus-visible` selector-list rules in place — don't create duplicate rules — and add the new standalone `.shell__theme-toggle` base rule near `.shell__home`'s own base rule.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/__tests__/AppShell.test.jsx`
Expected: PASS — every pre-existing describe block in this file still passes (they don't touch settings), plus the new theme-toggle block.

- [ ] **Step 7: Run the full unit suite and lint:css**

Run: `npx vitest run && npm run lint:css`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/AppShell.jsx src/components/AppShell.css src/components/__tests__/AppShell.test.jsx src/i18n/en.json src/i18n/es.json src/i18n/pl.json
git commit -m "feat(11): add global header theme quick-toggle (cycles system/light/dark/high-contrast)"
```

---

## Task 7: E2E theme coverage

**Files:**
- Create: `e2e/themes.spec.js`

**Interfaces:**
- Consumes: the running dev server's real `data-theme` behavior from Tasks 1-6; `playground_settings` localStorage key (from `src/storage/localStorageAdapter.js`).

NOTE: this worktree's `main` already has the parental-lock feature (#127) merged, which gates `/admin` (and `/parent`) behind an unlock challenge by default. Every test below that navigates to `/admin` needs the same bypass `e2e/admin.spec.js` already uses — read that file first and copy its exact `test.beforeEach` (`page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))`) into this new spec too, or the admin test below will hit the lock-challenge screen instead of the actual Admin page. `/` (dashboard) and `/game/:id` routes are NOT gated — no bypass needed for those.

- [ ] **Step 1: Write `e2e/themes.spec.js`**

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

function seedTheme(page, theme) {
  return page.addInitScript((t) => {
    localStorage.setItem('playground_settings', JSON.stringify({ theme: t }))
  }, theme)
}

for (const theme of ['light', 'dark', 'high-contrast']) {
  test.describe(`${theme} theme`, () => {
    test(`dashboard has no axe violations (including color-contrast) in ${theme}`, async ({ page }) => {
      await seedTheme(page, theme)
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
    })

    test(`admin has no axe violations (including color-contrast) in ${theme}`, async ({ page }) => {
      await seedTheme(page, theme)
      await page.goto('/admin')
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
    })

    test(`a game's results screen has no axe violations in ${theme}`, async ({ page }) => {
      await seedTheme(page, theme)
      await page.goto('/game/color-match')
      await page.getByTestId('game-intro-start').click()
      // Play through by always tapping the marked-correct choice, however many
      // questions the session has (mirrors the pattern in color-match.spec.js).
      while (await page.getByTestId(/^correct-.*-id$/).count() > 0) {
        const correctId = await page.getByTestId(/^correct-.*-id$/).first().textContent()
        await page.locator(`[data-choice-id="${correctId}"]`).click()
        await page.waitForTimeout(1600) // clear the immediate-feedback delay before the next question
      }
      await expect(page.getByRole('button', { name: /play again/i })).toBeVisible()
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
    })
  })
}

test.describe('system theme resolution', () => {
  test('resolves to light tokens when the OS prefers light', async ({ page }) => {
    await seedTheme(page, 'system')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await expect(page.locator('html')).not.toHaveAttribute('data-theme')
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim())
    expect(bg).toBe('#F0FDFF')
  })

  test('resolves to dark tokens when the OS prefers dark, same persisted setting', async ({ page }) => {
    await seedTheme(page, 'system')
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(page.locator('html')).not.toHaveAttribute('data-theme')
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim())
    expect(bg).toBe('#0D2126')
  })
})

test('header theme toggle cycles and persists across reload', async ({ page }) => {
  await seedTheme(page, 'system')
  await page.goto('/')
  const toggle = page.getByRole('button', { name: /theme/i })

  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
```

Adjust the `color-match` game-results play-through selectors (`data-testid`, `data-choice-id`) to whatever `e2e/color-match.spec.js` actually uses — read that file first and mirror its existing full-playthrough helper exactly rather than reinventing it (it already solves "tap the correct choice N times, wait out the feedback delay, land on results").

- [ ] **Step 2: Run the new spec**

Run: `npx playwright test themes.spec.js`
Expected: PASS. If the color-match playthrough selectors don't match, fix them to match `e2e/color-match.spec.js`'s actual pattern and re-run.

- [ ] **Step 3: Run the full e2e suite to confirm no regressions**

Run: `npm run e2e`
Expected: PASS (this may take several minutes; the visual-regression baselines are addressed separately in Task 8, so `visual.spec.js` should still be untouched/passing here since Light's tokens didn't change)

- [ ] **Step 4: Commit**

```bash
git add e2e/themes.spec.js
git commit -m "test(11): e2e axe-core coverage for Light/Dark/High-Contrast + system resolution + header toggle"
```

---

## Task 8: Visual regression baselines for Dark/High Contrast

**Files:**
- Modify: `.storybook/preview.js`, `src/components/Dashboard.stories.jsx`, `src/admin/AdminPage.stories.jsx`, `src/components/GameChoiceGrid.stories.jsx`, `src/components/GameResults.stories.jsx`, `e2e/visual.spec.js`
- Create (generated by Playwright, not hand-written): 8 new PNGs under `e2e/visual.spec.js-snapshots/`

**Interfaces:**
- Produces: story `parameters.theme` support (`'dark'` | `'high-contrast'`), applied to `document.documentElement.dataset.theme` by a new global Storybook decorator.

- [ ] **Step 1: Add the theme-applying decorator to `.storybook/preview.js`**

```js
import '../src/index.css'
import '../src/i18n'

const disableMotionStyle = document.createElement('style')
disableMotionStyle.innerHTML = '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }'
document.head.appendChild(disableMotionStyle)

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  parameters: {
    controls: { expanded: true },
  },
  decorators: [
    (Story, context) => {
      const theme = context.parameters.theme
      if (theme) {
        document.documentElement.dataset.theme = theme
      } else {
        delete document.documentElement.dataset.theme
      }
      return Story()
    },
  ],
}

export default preview
```

- [ ] **Step 2: Add Dark/High-Contrast story variants**

`src/components/Dashboard.stories.jsx` — add after `export const Empty = { args: { manifests: [] } }`:

```js
export const DefaultDark = { args: { manifests }, parameters: { theme: 'dark' } }
export const DefaultHighContrast = { args: { manifests }, parameters: { theme: 'high-contrast' } }
```

`src/admin/AdminPage.stories.jsx` — add after `export const Default = {}`:

```js
export const DefaultDark = { parameters: { theme: 'dark' } }
export const DefaultHighContrast = { parameters: { theme: 'high-contrast' } }
```

`src/components/GameChoiceGrid.stories.jsx` — add after the existing `Default` export (reuse its exact `args`):

```js
export const DefaultDark = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: [], hintActive: false }, parameters: { theme: 'dark' } }
export const DefaultHighContrast = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: [], hintActive: false }, parameters: { theme: 'high-contrast' } }
```

`src/components/GameResults.stories.jsx` — add after the existing `PerfectRun` export (reuse its exact `args`):

```js
export const PerfectRunDark = { ...PerfectRun, parameters: { theme: 'dark' } }
export const PerfectRunHighContrast = { ...PerfectRun, parameters: { theme: 'high-contrast' } }
```

- [ ] **Step 3: Add the 8 new story IDs to `e2e/visual.spec.js`**

Add to the `stories` array (Storybook derives the URL id as kebab-case `${title}--${exportName}`):

```js
  'components-dashboard--default-dark',
  'components-dashboard--default-high-contrast',
  'pages-adminpage--default-dark',
  'pages-adminpage--default-high-contrast',
  'components-gamechoicegrid--default-dark',
  'components-gamechoicegrid--default-high-contrast',
  'components-gameresults--perfect-run-dark',
  'components-gameresults--perfect-run-high-contrast',
```

- [ ] **Step 4: Generate the new baselines**

Run: `npx playwright test visual.spec.js --update-snapshots`
Expected: all 46 stories (38 existing + 8 new) run. NOTE: this is a known, human-approved exception to "Light stays pixel-identical" — Task 3 consolidated several distinct hardcoded `rgb(0 0 0 / N%)` opacities (5/6/7/8/12/15%) down to two canonical token values (`--color-hairline` at 12%, `--color-hover-tint` at 6%), so any existing baseline whose component uses a hairline/hover-tint border or wash at a *different* original opacity will show a small (1-3 percentage point), expected diff — this is not a bug, do not investigate it as one. Any *other* existing baseline (one that never touched a hairline/hover-tint/backdrop/surface-outline/heatmap token) modifying is unexpected and does need investigating before proceeding.

- [ ] **Step 5: Verify**

Run: `npx playwright test visual.spec.js`
Expected: PASS, all 46

Run: `git status --short e2e/visual.spec.js-snapshots/`
Expected: the 8 new files (`??` or `A`), plus `M` entries for whichever existing baselines render a component that consumes `--color-hairline`/`--color-hover-tint` (expected, per the note above). Spot-check a couple of the modified PNGs visually if convenient — the diff should be a barely-perceptible tint shift, not a structural change.

- [ ] **Step 6: Commit**

```bash
git add .storybook/preview.js src/components/Dashboard.stories.jsx src/admin/AdminPage.stories.jsx src/components/GameChoiceGrid.stories.jsx src/components/GameResults.stories.jsx e2e/visual.spec.js e2e/visual.spec.js-snapshots/
git commit -m "test(11): visual-regression baselines for Dark/High-Contrast (Dashboard, Admin, GameChoiceGrid, GameResults)"
```

---

## Task 9: Docs & version bump

**Files:**
- Modify: `README.md`, `docs/TESTING.md`, `docs/ENHANCEMENTS.md`, `CHANGELOG.md`, `package.json`

- [ ] **Step 1: `README.md` settings table**

Add a row after `| Sound effects | On | On, Off |` (line 324):

```markdown
| Theme | System | System, Light, Dark, High Contrast |
```

Add a description paragraph near the other setting-specific paragraphs (after the Celebration Animations paragraph, or wherever fits alphabetically/thematically with the existing prose):

```markdown
**Theme** — "System" follows the device's light/dark preference automatically; "Light", "Dark", and "High Contrast" are explicit overrides. Also reachable via a quick-toggle button in the header on every page (cycles through all four), independent of the Admin page. All three rendered themes (Light, Dark, High Contrast) meet WCAG AA contrast (4.5:1 text, 3:1 borders/non-text).
```

- [ ] **Step 2: `docs/TESTING.md`**

In the Layer 2 section, after the `disabledWrongChoiceContrast.test.js` paragraph (line 59):

```markdown
`src/__tests__/themeTokenContrast.test.js` follows the same pattern for the Light/Dark/High-Contrast token layer in `src/index.css` — it duplicates each theme's token hex values (kept in sync manually with `index.css`, same convention) and checks every text/background and border/background pairing against the WCAG formula directly.
```

In the Layer 3 spec table, add a row:

```markdown
| `themes.spec.js` | Light/Dark/High Contrast: axe-core scans (including `color-contrast`) of Dashboard/Admin/a game's results screen under each theme, `system` resolving correctly under both `prefers-color-scheme` values via `page.emulateMedia`, and the header theme-toggle's click-cycle + persistence across reload |
```

In the Layer 4 section, after the existing baseline-update paragraph:

```markdown
Dashboard, AdminPage, GameChoiceGrid, and GameResults each get an additional Dark and High-Contrast baseline (8 total) via a `parameters: { theme: 'dark' | 'high-contrast' }` story parameter, applied by a global Storybook decorator in `.storybook/preview.js` that sets `document.documentElement.dataset.theme`. The other 38 stories are Light-only — Light's token values never change, so no theme parameter is needed there.
```

- [ ] **Step 3: `docs/ENHANCEMENTS.md`**

Remove the "Dark mode" bullet under `## UI` — it's now shipped (locate by content; this worktree's `main` already has an unrelated parental-lock entry nearby, so the line number has shifted from a fresh checkout — don't touch that entry). Add an entry to `CHANGELOG.md` instead (next step) per this file's own header convention ("entries here are removed once they ship").

- [ ] **Step 4: `CHANGELOG.md`**

NOTE: this worktree's `main` already has the parental-lock feature (#127) shipped as `## [0.37.0] - 2026-07-26` at the top of this file — that is NOT a fresh-checkout assumption error, it's real, already-merged history. This task's new entry goes **above** it, as **`0.38.0`** (the next version after what's already there), not `0.37.0`:

```markdown
## [0.38.0] - 2026-07-27

### Added

- Core themes (issue #11): a new `theme` setting (`system` / `light` / `dark` / `high-contrast`, default `system`) reflows every chrome color — page/card backgrounds, text, borders, focus rings, solid-fill buttons, and the Parent Dashboard activity heatmap — through theme-aware CSS custom properties in `src/index.css`. `system` follows the OS's `prefers-color-scheme` via a `@media` block; the three explicit themes are set via a `data-theme` attribute on `<html>`, synced by a new `ThemeSync` component. Selectable in Admin (a new Theme control) or via a quick-toggle button in the header, reachable on every route, that cycles through all four options. All three rendered themes are verified WCAG AA (4.5:1 text, 3:1 borders/non-text) by a new `themeTokenContrast.test.js` unit test and `e2e/themes.spec.js`'s axe-core scans. Per-game content colors (Color Match's teaching swatches, character/animal art) and the correct/wrong feedback signal colors are unaffected by theme — they stay constant by design.

### Fixed

- `.results__btn--play` (the primary "Play Again" button on every game's results screen) had white text on the light `--color-lavender` pastel — 2.40:1 contrast, below the WCAG AA minimum. Now uses `--color-lavender-dark` (6.44:1), the token every other primary button in the app already used correctly.
```

- [ ] **Step 5: `package.json` version bump**

This worktree's `main` already has `package.json` at `0.37.0` (from the already-merged parental-lock feature) — bump to `0.38.0`, not `0.37.0`:

```json
  "version": "0.38.0",
```

- [ ] **Step 6: Run the full test suite one more time**

Run: `npm run coverage && npm run lint && npm run lint:css`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add README.md docs/TESTING.md docs/ENHANCEMENTS.md CHANGELOG.md package.json
git commit -m "docs(11): document core themes, bump version to 0.38.0"
```

---

## Self-review notes (for the plan author, already applied above)

- **Spec coverage:** token architecture (Task 1), text/solid-fill/error-solid split + bundled bug fix (Task 2), hairline/hover-tint/backdrop/surface-outline + heatmap (Task 3 — this and the surface-outline sub-finding were discovered during file-level mapping and confirmed in scope with the user before writing this plan), settings/ThemeSync (Task 4), Admin UI (Task 5), header toggle (Task 6), e2e axe coverage + system-resolution (Task 7), visual regression (Task 8), docs/version (Task 9). All spec sections have a task.
- **Type/name consistency check:** `theme` setting values (`'system'|'light'|'dark'|'high-contrast'`) are identical across `adapter.js`, `ThemeSync`, `AdminPage.jsx`'s toggle options, `AppShell.jsx`'s `THEME_CYCLE`, and `themes.spec.js`. Token names (`--color-lavender-text`, `--color-teal-text`, `--color-on-accent`, `--color-error-solid`, `--color-heatmap-0..3`, `--color-hairline`, `--color-hover-tint`, `--color-backdrop`, `--color-surface-outline`) are defined once in Task 1 and referenced identically in Tasks 2-3, 6, 8.
- **No placeholders:** every CSS/JS step above has literal code, not a description of what to write.
