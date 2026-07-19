# Accessibility Wave 2 (Issue #83) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app's text respond to OS/browser "larger text" accessibility settings (currently it doesn't at all), and stop the sticky app header from hiding a keyboard-focused memory tile at 200%-zoom-equivalent viewport sizes.

**Architecture:** Two independent fixes land together because both were surfaced by the same audit and share one new e2e regression suite. Fix A is a mechanical `px`→`rem` conversion of every `font-size` (and paired `line-height`) declaration across the app's CSS. Fix B adds a `ResizeObserver`-backed React hook that publishes the sticky header's live height as a CSS custom property, consumed by a new `scroll-padding-top` rule so native browser scroll-into-view (keyboard focus, anchor jumps) never lands content underneath the header.

**Tech Stack:** React 18, Vite, Vitest + `@testing-library/react` (jsdom), Playwright (`e2e/`), plain CSS with custom properties (no CSS framework).

## Global Constraints

- `1rem` conversion baseline is `16px` (the app has no root `font-size` override — verified: no `html { font-size: ... }` rule exists in `src/index.css`).
- Conversion scope is `font-size` (and `line-height` values paired with a converted `font-size`) only. Padding, gap, border-radius, and non-text width/height (including the 64×64/120px tap-target system and the memory-grid math) stay in `px`. `<img>`-based icon dimensions stay in `px`.
- No visual change at default browser settings — every conversion is value-preserving (`Npx` → `(N/16)rem`).
- Spec source of truth: `docs/superpowers/specs/2026-07-19-accessibility-wave-2-design.md`. If any task here appears to contradict that spec, the spec wins — stop and flag it rather than guessing.

---

## Task 1: `useHeaderHeightVar` hook + global `ResizeObserver` test stub

**Files:**
- Modify: `src/test-setup.js`
- Create: `src/hooks/useHeaderHeightVar.js`
- Create: `src/hooks/__tests__/useHeaderHeightVar.test.js`

**Interfaces:**
- Produces: `useHeaderHeightVar(ref)` — a default export, hook taking a React ref object (`{ current: HTMLElement | null }`). On mount and on every resize of `ref.current`, sets `document.documentElement.style.setProperty('--shell-header-height', '<height>px')` to `ref.current.getBoundingClientRect().height`. No return value. Task 2 imports and calls this with a ref attached to `.shell__header`.

- [ ] **Step 1: Add a global `ResizeObserver` stub to the jsdom test environment**

jsdom does not implement `ResizeObserver`. Since `useHeaderHeightVar` will be wired into `AppShell` (Task 2), which is rendered by `AppShell.test.jsx` and `App.test.jsx`, every test run needs a safe no-op default so those existing tests don't crash with `ReferenceError: ResizeObserver is not defined`. The hook's own test (Step 2 below) overrides this per-file with a capturing mock — vitest gives each test file its own jsdom globals, so there's no conflict.

Edit `src/test-setup.js`:

```js
import '@testing-library/jest-dom'
import { expect } from 'vitest'
import { toHaveNoViolations } from 'jest-axe'
import './i18n'

expect.extend(toHaveNoViolations)

// jsdom doesn't implement ResizeObserver. Components that use it (via
// useHeaderHeightVar) need at least a no-op so unrelated tests that render
// them don't crash; tests that care about actual resize behavior install
// their own capturing mock (see useHeaderHeightVar.test.js).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
```

- [ ] **Step 2: Write the failing test for `useHeaderHeightVar`**

Create `src/hooks/__tests__/useHeaderHeightVar.test.js`:

```js
import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import useHeaderHeightVar from '../useHeaderHeightVar'

class MockResizeObserver {
  constructor(callback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }
  observe(el) { this.el = el }
  disconnect() { this.disconnected = true }
}
MockResizeObserver.instances = []

function makeHeaderRef(height) {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({
    height, width: 0, top: 0, left: 0, right: 0, bottom: height, x: 0, y: 0, toJSON() {},
  })
  return { current: el }
}

beforeEach(() => {
  MockResizeObserver.instances = []
  global.ResizeObserver = MockResizeObserver
  document.documentElement.style.removeProperty('--shell-header-height')
})

afterEach(() => {
  delete global.ResizeObserver
})

describe('useHeaderHeightVar', () => {
  it('publishes the header element\'s rendered height as a CSS custom property on mount', () => {
    const ref = makeHeaderRef(102)
    renderHook(() => useHeaderHeightVar(ref))
    expect(document.documentElement.style.getPropertyValue('--shell-header-height')).toBe('102px')
  })

  it('updates the property when the observed element resizes', () => {
    const ref = makeHeaderRef(102)
    renderHook(() => useHeaderHeightVar(ref))
    ref.current.getBoundingClientRect = () => ({ height: 132 })
    MockResizeObserver.instances[0].callback()
    expect(document.documentElement.style.getPropertyValue('--shell-header-height')).toBe('132px')
  })

  it('disconnects the observer on unmount (negative: no further writes after unmount)', () => {
    const ref = makeHeaderRef(102)
    const { unmount } = renderHook(() => useHeaderHeightVar(ref))
    unmount()
    expect(MockResizeObserver.instances[0].disconnected).toBe(true)
    ref.current.getBoundingClientRect = () => ({ height: 999 })
    expect(document.documentElement.style.getPropertyValue('--shell-header-height')).toBe('102px')
  })

  it('does nothing when ref.current is null (negative: no crash before the element mounts)', () => {
    const ref = { current: null }
    expect(() => renderHook(() => useHeaderHeightVar(ref))).not.toThrow()
    expect(document.documentElement.style.getPropertyValue('--shell-header-height')).toBe('')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useHeaderHeightVar.test.js`
Expected: FAIL — `Cannot find module '../useHeaderHeightVar'`.

- [ ] **Step 4: Implement `useHeaderHeightVar`**

Create `src/hooks/useHeaderHeightVar.js`:

```js
import { useEffect } from 'react'

// Publishes ref.current's live rendered height as --shell-header-height so
// `scroll-padding-top: var(--shell-header-height)` (src/index.css) always
// reserves exactly enough space for the sticky header, whatever its current
// height is — one row on most routes, two with a title on game/subpage
// routes, and taller still once font-size becomes text-scale-responsive.
export default function useHeaderHeightVar(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const updateVar = () => {
      document.documentElement.style.setProperty('--shell-header-height', `${el.getBoundingClientRect().height}px`)
    }

    updateVar()
    const observer = new ResizeObserver(updateVar)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useHeaderHeightVar.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/test-setup.js src/hooks/useHeaderHeightVar.js src/hooks/__tests__/useHeaderHeightVar.test.js
git commit -m "feat(83): add useHeaderHeightVar hook and jsdom ResizeObserver stub"
```

---

## Task 2: Wire the hook into `AppShell` + add `scroll-padding-top`

**Files:**
- Modify: `src/components/AppShell.jsx`
- Modify: `src/index.css`
- Modify: `src/components/__tests__/AppShell.test.jsx`

**Interfaces:**
- Consumes: `useHeaderHeightVar(ref)` from Task 1.
- Produces: `.shell__header` now has a ref wired to the hook; `html` now has a `scroll-padding-top` rule referencing `--shell-header-height`. No new exports for later tasks to consume.

- [ ] **Step 1: Write the failing integration assertion**

Add to `src/components/__tests__/AppShell.test.jsx` (find the existing `import` block and an existing `describe`/`it` to place this near; use the file's existing render helper for `AppShell` rather than re-deriving one):

```js
it('publishes the header height as a CSS custom property (issue #83)', () => {
  renderAppShell() // use this file's existing render helper — see nearby tests for its name/signature
  const header = document.querySelector('.shell__header')
  expect(header).toBeTruthy()
  const published = document.documentElement.style.getPropertyValue('--shell-header-height')
  expect(published).toMatch(/^[0-9.]+px$/)
})
```

Note for the implementer: open `AppShell.test.jsx` first and match this test's setup (render call, router wrapper, etc.) to whatever pattern the existing tests in that file already use — don't introduce a second, different rendering approach.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/__tests__/AppShell.test.jsx`
Expected: FAIL — `--shell-header-height` is an empty string (hook not wired yet).

- [ ] **Step 3: Wire the hook into `AppShell.jsx`**

Edit `src/components/AppShell.jsx`. Add the import near the other hook imports:

```js
import useFocusOnMount from '../hooks/useFocusOnMount'
import useHeaderHeightVar from '../hooks/useHeaderHeightVar'
```

Add a ref and call the hook, near the other `useRef`/hook calls in the component body (after `const bodyRef = useRef(null)`):

```js
  const bodyRef = useRef(null)
  const headerRef = useRef(null)
  useHeaderHeightVar(headerRef)
```

Attach the ref to the header element:

```jsx
          <header className="shell__header" ref={headerRef}>
```

- [ ] **Step 4: Add the `scroll-padding-top` rule**

Edit `src/index.css`. Find the top of the file (or wherever the existing global/reset rules live, e.g. near a `:root`/`html` block if one already exists) and add:

```css
html {
  scroll-padding-top: var(--shell-header-height, 0px);
}
```

If `src/index.css` has no existing `html { ... }` block, add this as a new standalone rule near the top of the file, above the first component-level rule.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/AppShell.test.jsx`
Expected: PASS.

- [ ] **Step 6: Run the full unit suite to confirm no regressions**

Run: `npx vitest run`
Expected: all tests pass (this also exercises `App.test.jsx`, which transitively mounts `AppShell`).

- [ ] **Step 7: Commit**

```bash
git add src/components/AppShell.jsx src/index.css src/components/__tests__/AppShell.test.jsx
git commit -m "feat(83): reserve scroll space for the sticky header via --shell-header-height"
```

---

## Task 3: `px`→`rem` conversion — shell & game-chrome CSS (Group A)

**Files:**
- Modify: `src/components/AppShell.css`
- Modify: `src/components/GameIntro.css`
- Modify: `src/components/GameResults.css`
- Modify: `src/components/QuizGameShell.css`
- Modify: `src/components/GameChoiceGrid.css`
- Modify: `src/components/Timer.css`
- Modify: `src/components/StreakBadge.css`
- Modify: `src/components/OrientationOverlay.css`
- Modify: `src/components/ExitConfirmDialog.css`

**Interfaces:** none — pure CSS value changes, no new exports, no signature changes. Every conversion is `Npx` → `(N/16)rem`, value-preserving at default browser settings.

- [ ] **Step 1: Convert `src/components/AppShell.css`**

| Line | Old | New |
|---|---|---|
| 38 | `  font-size: 20px;` | `  font-size: 1.25rem;` |
| 76 | `  font-size: 24px;` | `  font-size: 1.5rem;` |
| 86 | `  font-size: 24px;` | `  font-size: 1.5rem;` |
| 131 | `  font-size: 18px;` | `  font-size: 1.125rem;` |
| 138 | `.shell__title-icon { font-size: 20px; line-height: 1; }` | `.shell__title-icon { font-size: 1.25rem; line-height: 1; }` |
| 165 | `  font-size: 13px;` | `  font-size: 0.8125rem;` |

(Lines 76 and 86 are separate rules with identical text — `.shell__back, .shell__nav-link { ... font-size: 24px; ... }` and `.shell__home { ... font-size: 24px; ... }`; use enough surrounding context in each `Edit` call to target them independently, or `replace_all` if the tool confirms both instances are the intended targets.)

- [ ] **Step 2: Convert `src/components/GameIntro.css`**

| Line | Old | New |
|---|---|---|
| 19 | `  font-size: 96px;` | `  font-size: 6rem;` |
| 25 | `  font-size: 28px;` | `  font-size: 1.75rem;` |
| 31 | `  font-size: 20px;` | `  font-size: 1.25rem;` |
| 38 | `  font-size: 18px;` | `  font-size: 1.125rem;` |
| 48 | `  font-size: 16px;` | `  font-size: 1rem;` |
| 59 | `  font-size: 20px;` | `  font-size: 1.25rem;` |

- [ ] **Step 3: Convert `src/components/GameResults.css`**

| Line | Old | New |
|---|---|---|
| 3 | `.results__emoji  { font-size: 96px; }` | `.results__emoji  { font-size: 6rem; }` |
| 4 | `.results__score  { font-size: 36px; font-weight: 800; color: var(--color-lavender); }` | `.results__score  { font-size: 2.25rem; font-weight: 800; color: var(--color-lavender); }` |
| 5 | `.results__label  { font-size: 20px; opacity: 0.7; }` | `.results__label  { font-size: 1.25rem; opacity: 0.7; }` |
| 9 | `.results__missed-heading { font-size: 16px; font-weight: 700; opacity: 0.8; }` | `.results__missed-heading { font-size: 1rem; font-weight: 700; opacity: 0.8; }` |
| 11 | `.results__btn { padding: 16px 36px; font-size: 20px; font-weight: 700; border-radius: var(--radius-button); min-height: 64px; }` | `.results__btn { padding: 16px 36px; font-size: 1.25rem; font-weight: 700; border-radius: var(--radius-button); min-height: 64px; }` |

(`padding` and `min-height` on line 11 stay in `px` — out of scope per the Global Constraints.)

- [ ] **Step 4: Convert `src/components/QuizGameShell.css`**

| Line | Old | New |
|---|---|---|
| 17 | `.game__prompt   { color: white; font-size: 20px; font-weight: 700; text-align: center; }` | `.game__prompt   { color: white; font-size: 1.25rem; font-weight: 700; text-align: center; }` |
| 18 | `.game__progress { font-size: 15px; color: rgb(255 255 255 / 85%); font-weight: 600; }` | `.game__progress { font-size: 0.9375rem; color: rgb(255 255 255 / 85%); font-weight: 600; }` |
| 24 | `  font-size: 20px;` | `  font-size: 1.25rem;` |
| 33 | `.game__timeout { text-align: center; font-size: 18px; font-weight: 700; color: var(--color-error); margin-top: 8px; }` | `.game__timeout { text-align: center; font-size: 1.125rem; font-weight: 700; color: var(--color-error); margin-top: 8px; }` |
| 35 | `.game__replay    { font-size: 36px; background: rgb(255 255 255 / 30%); border-radius: 50%; width: 72px; height: 72px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; transition: background 0.15s; }` | `.game__replay    { font-size: 2.25rem; background: rgb(255 255 255 / 30%); border-radius: 50%; width: 72px; height: 72px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; transition: background 0.15s; }` |

(`width`/`height: 72px` on line 35 are the button's tap-target box, not text — stay in `px`.)

- [ ] **Step 5: Convert `src/components/GameChoiceGrid.css`**

| Line | Old | New |
|---|---|---|
| 21 | `  font-size: 48px;` | `  font-size: 3rem;` |
| 52 | `.game__choice-name { font-size: 18px; font-weight: 700; color: white; }` | `.game__choice-name { font-size: 1.125rem; font-weight: 700; color: white; }` |
| 54 | `.game__choice-emoji { font-size: 56px; line-height: 1; }` | `.game__choice-emoji { font-size: 3.5rem; line-height: 1; }` |

- [ ] **Step 6: Convert `src/components/Timer.css`**

| Line | Old | New |
|---|---|---|
| 5 | `  font-size: 14px;` | `  font-size: 0.875rem;` |

- [ ] **Step 7: Convert `src/components/StreakBadge.css`**

| Line | Old | New |
|---|---|---|
| 12 | `  font-size: 16px;` | `  font-size: 1rem;` |

- [ ] **Step 8: Convert `src/components/OrientationOverlay.css`**

| Line | Old | New |
|---|---|---|
| 18 | `  font-size: 96px;` | `  font-size: 6rem;` |
| 23 | `  font-size: 28px;` | `  font-size: 1.75rem;` |
| 32 | `  font-size: 20px;` | `  font-size: 1.25rem;` |

- [ ] **Step 9: Convert `src/components/ExitConfirmDialog.css`**

| Line | Old | New |
|---|---|---|
| 24 | `.exit-confirm__title { font-size: 22px; font-weight: 800; color: var(--color-text); }` | `.exit-confirm__title { font-size: 1.375rem; font-weight: 800; color: var(--color-text); }` |
| 28 | `  font-size: 22px;` | `  font-size: 1.375rem;` |

- [ ] **Step 10: Verify no px font-size remains in this file group**

Run:
```bash
grep -n "font-size:\s*[0-9.]*px" src/components/AppShell.css src/components/GameIntro.css src/components/GameResults.css src/components/QuizGameShell.css src/components/GameChoiceGrid.css src/components/Timer.css src/components/StreakBadge.css src/components/OrientationOverlay.css src/components/ExitConfirmDialog.css
```
Expected: no output.

- [ ] **Step 11: Run affected unit tests**

Run: `npx vitest run`
Expected: all pass (no test hardcodes a `font-size` pixel value — confirmed during planning; these are pure visual value changes, jsdom doesn't render real layout).

- [ ] **Step 12: Commit**

```bash
git add src/components/AppShell.css src/components/GameIntro.css src/components/GameResults.css src/components/QuizGameShell.css src/components/GameChoiceGrid.css src/components/Timer.css src/components/StreakBadge.css src/components/OrientationOverlay.css src/components/ExitConfirmDialog.css
git commit -m "fix(83): convert shell and game-chrome font-sizes from px to rem"
```

---

## Task 4: `px`→`rem` conversion — dashboard & card CSS (Group B)

**Files:**
- Modify: `src/components/Dashboard.css`
- Modify: `src/components/CategorySection.css`
- Modify: `src/components/GameCard.css`
- Modify: `src/components/FeaturedGameCard.css`
- Modify: `src/components/BadgeGallery.css`
- Modify: `src/components/ScoreHistory.css`

**Interfaces:** none — same as Task 3.

- [ ] **Step 1: Convert `src/components/Dashboard.css`**

| Line | Old | New |
|---|---|---|
| 11 | `  font-size: 32px;` | `  font-size: 2rem;` |
| 36 | `  font-size: 14px;` | `  font-size: 0.875rem;` |

- [ ] **Step 2: Convert `src/components/CategorySection.css`**

| Line | Old | New |
|---|---|---|
| 6 | `  font-size: 18px;` | `  font-size: 1.125rem;` |

- [ ] **Step 3: Convert `src/components/GameCard.css`**

| Line | Old | New |
|---|---|---|
| 26 | `.game-card__icon  { font-size: 52px; line-height: 1; }` | `.game-card__icon  { font-size: 3.25rem; line-height: 1; }` |
| 28 | `.game-card__name  { font-size: 22px; font-weight: 800; text-align: center; }` | `.game-card__name  { font-size: 1.375rem; font-weight: 800; text-align: center; }` |
| 29 | `.game-card__desc  { font-size: 15px; text-align: center; opacity: 0.75; }` | `.game-card__desc  { font-size: 0.9375rem; text-align: center; opacity: 0.75; }` |
| 30 | `.game-card__score { font-size: 14px; font-weight: 700; opacity: 0.6; }` | `.game-card__score { font-size: 0.875rem; font-weight: 700; opacity: 0.6; }` |
| 37 | `  font-size: 14px;` | `  font-size: 0.875rem;` |
| 45 | `  font-size: 12px;` | `  font-size: 0.75rem;` |

- [ ] **Step 4: Convert `src/components/FeaturedGameCard.css`**

| Line | Old | New |
|---|---|---|
| 27 | `  font-size: 13px;` | `  font-size: 0.8125rem;` |
| 34 | `.featured-card__icon { font-size: 72px; line-height: 1; }` | `.featured-card__icon { font-size: 4.5rem; line-height: 1; }` |
| 36 | `.featured-card__name { font-size: 28px; font-weight: 800; text-align: center; }` | `.featured-card__name { font-size: 1.75rem; font-weight: 800; text-align: center; }` |
| 37 | `.featured-card__desc { font-size: 16px; text-align: center; opacity: 0.75; }` | `.featured-card__desc { font-size: 1rem; text-align: center; opacity: 0.75; }` |
| 40 | `  font-size: 14px;` | `  font-size: 0.875rem;` |

- [ ] **Step 5: Convert `src/components/BadgeGallery.css`**

| Line | Old | New |
|---|---|---|
| 2 | `.badge-gallery__game-name { font-size: 16px; font-weight: 700; margin-bottom: 10px; }` | `.badge-gallery__game-name { font-size: 1rem; font-weight: 700; margin-bottom: 10px; }` |
| 31 | `.badge-gallery__icon { font-size: 28px; }` | `.badge-gallery__icon { font-size: 1.75rem; }` |
| 34 | `.badge-gallery__name { font-size: 13px; font-weight: 700; }` | `.badge-gallery__name { font-size: 0.8125rem; font-weight: 700; }` |
| 35 | `.badge-gallery__count { font-size: 12px; font-weight: 700; color: var(--color-teal-dark); }` | `.badge-gallery__count { font-size: 0.75rem; font-weight: 700; color: var(--color-teal-dark); }` |
| 36 | `.badge-gallery__locked-label { font-size: 11px; color: var(--color-text-muted); }` | `.badge-gallery__locked-label { font-size: 0.6875rem; color: var(--color-text-muted); }` |

- [ ] **Step 6: Convert `src/components/ScoreHistory.css`**

| Line | Old | New |
|---|---|---|
| 11 | `  font-size: 16px;` | `  font-size: 1rem;` |
| 15 | `.score-history__date   { opacity: 0.6; font-size: 14px; }` | `.score-history__date   { opacity: 0.6; font-size: 0.875rem; }` |

- [ ] **Step 7: Verify no px font-size remains in this file group**

Run:
```bash
grep -n "font-size:\s*[0-9.]*px" src/components/Dashboard.css src/components/CategorySection.css src/components/GameCard.css src/components/FeaturedGameCard.css src/components/BadgeGallery.css src/components/ScoreHistory.css
```
Expected: no output.

- [ ] **Step 8: Run the unit suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/components/Dashboard.css src/components/CategorySection.css src/components/GameCard.css src/components/FeaturedGameCard.css src/components/BadgeGallery.css src/components/ScoreHistory.css
git commit -m "fix(83): convert dashboard and card font-sizes from px to rem"
```

---

## Task 5: `px`→`rem` conversion — admin/parent/kids CSS + heatmap fix (Group C)

**Files:**
- Modify: `src/admin/AdminPage.css`
- Modify: `src/parent/ParentDashboard.css`
- Modify: `src/parent/DateRangeFilter.css`
- Modify: `src/kids/KidsProgressPage.css`

**Interfaces:** none — same as Task 3, plus one structural fix (`.heatmap__day-label`'s box goes from fixed to `min-` dimensions) called out below.

- [ ] **Step 1: Convert `src/admin/AdminPage.css`**

| Line | Old | New |
|---|---|---|
| 15 | `  font-size: 15px;` | `  font-size: 0.9375rem;` |
| 63 | `.admin__section h3 { font-size: 18px; font-weight: 700; margin-bottom: 12px; }` | `.admin__section h3 { font-size: 1.125rem; font-weight: 700; margin-bottom: 12px; }` |
| 71 | `  font-size: 18px;` | `  font-size: 1.125rem;` |
| 106 | `  font-size: 16px;` | `  font-size: 1rem;` |
| 142 | `  font-size: 14px;` | `  font-size: 0.875rem;` |
| 150 | `  font-size: 16px;` | `  font-size: 1rem;` |
| 175 | `  font-size: 14px;` | `  font-size: 0.875rem;` |
| 181 | `  font-size: 13px;` | `  font-size: 0.8125rem;` |
| 197 | `  font-size: 14px;` | `  font-size: 0.875rem;` |
| 212 | `  font-size: 14px;` | `  font-size: 0.875rem;` |
| 230 | `  font-size: 14px;` | `  font-size: 0.875rem;` |

Several of these `font-size: 14px;`/`font-size: 16px;` lines are identical text belonging to different rules — use enough surrounding context (a few lines above/below, or the containing selector) in each `Edit` call so you target the correct one; do not use `replace_all` for this file, since some of these rules may have other reasons to differ later.

- [ ] **Step 2: Convert `src/parent/ParentDashboard.css` (font-size and paired line-height only)**

| Line | Old | New |
|---|---|---|
| 14 | `  font-size: 15px;` | `  font-size: 0.9375rem;` |
| 28 | `  font-size: 18px;` | `  font-size: 1.125rem;` |
| 42 | `  font-size: 18px;` | `  font-size: 1.125rem;` |
| 49 | `  font-size: 13px;` | `  font-size: 0.8125rem;` |
| 55 | `  font-size: 14px;` | `  font-size: 0.875rem;` |
| 66 | `  font-size: 15px;` | `  font-size: 0.9375rem;` |
| 78 | `  font-size: 13px;` | `  font-size: 0.8125rem;` |
| 139 | `  font-size: 10px;` | `  font-size: 0.625rem;` |
| 143 | `  line-height: 14px;` | `  line-height: 0.875rem;` |
| 170 | `  font-size: 12px;` | `  font-size: 0.75rem;` |
| 180 | `  font-size: 14px;` | `  font-size: 0.875rem;` |
| 202 | `  font-size: 14px;` | `  font-size: 0.875rem;` |

Line 139/143 belong to `.heatmap__month-label` (lines 136–144) — its `width: 14px` stays in `px` (the rule already has `overflow: visible`, so a larger label spills into neighboring space rather than clipping; not a text-loss risk, out of scope per the design spec).

Use surrounding context per `Edit` call for the same reason as Step 1 (several `font-size: 14px;`/`18px;`/`13px;` lines are duplicated text across different rules).

- [ ] **Step 3: Fix `.heatmap__day-label` — the one real clipping risk (lines 108–117)**

This rule pairs `font-size: 10px` with a *fixed* `width`/`height: 14px` box (unlike `.heatmap__month-label`, this one has no `overflow: visible` escape hatch). Once the font-size becomes `rem`-based and can grow under a large-text setting, the fixed box would clip the day-abbreviation glyph. Fix: let the box grow with its own text.

Old (`src/parent/ParentDashboard.css:108-117`):
```css
.heatmap__day-label {
  width: 14px;
  height: 14px;
  font-size: 10px;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
```

New:
```css
.heatmap__day-label {
  min-width: 14px;
  min-height: 14px;
  font-size: 0.625rem;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
```

(`.heatmap__cell`, the plain colored square at lines 155-159, has no `font-size` and is untouched.)

- [ ] **Step 4: Convert `src/parent/DateRangeFilter.css`**

| Line | Old | New |
|---|---|---|
| 15 | `  font-size: 14px;` | `  font-size: 0.875rem;` |
| 51 | `  font-size: 14px;` | `  font-size: 0.875rem;` |
| 63 | `  font-size: 14px;` | `  font-size: 0.875rem;` |
| 69 | `  font-size: 13px;` | `  font-size: 0.8125rem;` |

- [ ] **Step 5: Convert `src/kids/KidsProgressPage.css`**

| Line | Old | New |
|---|---|---|
| 10 | `.kid-progress__game-name { font-size: 22px; font-weight: 800; margin-bottom: 16px; }` | `.kid-progress__game-name { font-size: 1.375rem; font-weight: 800; margin-bottom: 16px; }` |
| 31 | `.kid-progress__stat-icon  { font-size: 28px; }` | `.kid-progress__stat-icon  { font-size: 1.75rem; }` |
| 32 | `.kid-progress__stat-value { font-size: 22px; font-weight: 800; color: var(--color-teal-dark); }` | `.kid-progress__stat-value { font-size: 1.375rem; font-weight: 800; color: var(--color-teal-dark); }` |
| 33 | `.kid-progress__stat-label { font-size: 12px; font-weight: 700; color: var(--color-text-muted); text-align: center; }` | `.kid-progress__stat-label { font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted); text-align: center; }` |
| 58 | `.kid-progress__badge-icon { font-size: 32px; }` | `.kid-progress__badge-icon { font-size: 2rem; }` |
| 61 | `.kid-progress__badge-name { font-size: 13px; font-weight: 700; }` | `.kid-progress__badge-name { font-size: 0.8125rem; font-weight: 700; }` |

- [ ] **Step 6: Verify no px font-size remains in this file group**

Run:
```bash
grep -n "font-size:\s*[0-9.]*px" src/admin/AdminPage.css src/parent/ParentDashboard.css src/parent/DateRangeFilter.css src/kids/KidsProgressPage.css
```
Expected: no output except `.heatmap__month-label`'s own line is gone too (it was converted in Step 2) — truly no output at all.

- [ ] **Step 7: Run the unit suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/admin/AdminPage.css src/parent/ParentDashboard.css src/parent/DateRangeFilter.css src/kids/KidsProgressPage.css
git commit -m "fix(83): convert admin/parent/kids font-sizes from px to rem; fix heatmap day-label clipping"
```

---

## Task 6: New reusable e2e suite — `e2e/zoom-large-text.spec.js`

**Files:**
- Create: `e2e/zoom-large-text.spec.js`

**Interfaces:**
- Consumes: the running dev server at `baseURL` (from `playwright.config.js`, already wired via the `webServer` block — no new server config needed), the `data-testid="game-intro-start"` convention, `[data-color-id]` (Color Match), `[data-tile-id]`/`[data-item-id]` (Animal Memory Match) — all pre-existing e2e conventions used by `e2e/animal-memory-match.spec.js` and `e2e/color-match.spec.js`.

- [ ] **Step 1: Write the spec file**

Create `e2e/zoom-large-text.spec.js`:

```js
import { test, expect } from '@playwright/test'

// "200% zoom" and "OS large-text settings" are two different mechanisms
// (see docs/superpowers/specs/2026-07-19-accessibility-wave-2-design.md).
// Full-page zoom scales everything uniformly regardless of CSS units, so
// per WCAG 1.4.10 it's tested as an equivalent-width viewport (200% zoom on
// a 1280px baseline == a 640 CSS-px viewport). Large-text settings scale
// only rem-relative font-size, simulated here by forcing the root font-size.

const ZOOM_DESKTOP = { width: 683, height: 384 }   // 200% zoom on the 1366x768 desktop reference
const ZOOM_TABLET_LANDSCAPE = { width: 512, height: 384 } // 200% zoom on 1024x768 tablet landscape (memory game requires landscape)
const REFERENCE_VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1366, height: 768 },
]

async function simulateLargeText(page, scale = 2) {
  await page.addStyleTag({ content: `html { font-size: ${16 * scale}px !important; }` })
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement
    return de.scrollWidth <= de.clientWidth + 1
  })
}

async function startMemoryBoard(page) {
  await page.goto('/game/animal-memory-match')
  await page.getByTestId('game-intro-start').click()
  await page.locator('[data-tile-id]').first().waitFor()
}

test.describe('200%-zoom-equivalent viewports', () => {
  for (const [routeName, path] of [['dashboard', '/'], ['quiz intro', '/game/color-match'], ['memory intro', '/game/animal-memory-match']]) {
    test(`${routeName}: no horizontal overflow at desktop zoom-equivalent width`, async ({ page }) => {
      await page.setViewportSize(ZOOM_DESKTOP)
      await page.goto(path)
      expect(await noHorizontalOverflow(page)).toBe(true)
    })
  }

  test('memory board: no horizontal overflow at tablet-landscape zoom-equivalent width', async ({ page }) => {
    await page.setViewportSize(ZOOM_TABLET_LANDSCAPE)
    await startMemoryBoard(page)
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('memory board: no keyboard-focused tile is ever covered by the sticky header (issue #83 regression)', async ({ page }) => {
    await page.setViewportSize(ZOOM_TABLET_LANDSCAPE)
    await startMemoryBoard(page)

    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Tab')
      const obscured = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return false
        const header = document.querySelector('.shell__header')
        if (!header || header.contains(el)) return false
        const hb = header.getBoundingClientRect()
        const r = el.getBoundingClientRect()
        return r.top < hb.bottom && r.bottom > 0
      })
      expect(obscured).toBe(false)
    }
  })

  test('dashboard: scroll-padding does not over-reserve space beyond the actual one-row header height (negative)', async ({ page }) => {
    await page.setViewportSize(ZOOM_DESKTOP)
    await page.goto('/')
    const { published, actual } = await page.evaluate(() => {
      const header = document.querySelector('.shell__header')
      return {
        published: getComputedStyle(document.documentElement).getPropertyValue('--shell-header-height').trim(),
        actual: `${header.getBoundingClientRect().height}px`,
      }
    })
    expect(published).toBe(actual)
  })
})

test.describe('OS/browser large-text settings', () => {
  test('quiz choice text actually scales under a large-text setting (Fix 1 regression guard)', async ({ page }) => {
    await page.goto('/game/color-match')
    await page.getByTestId('game-intro-start').click()
    const choice = page.locator('[data-color-id]').first()
    await choice.waitFor()
    const baseline = await choice.evaluate(el => parseFloat(getComputedStyle(el).fontSize))

    await simulateLargeText(page, 2)
    await page.waitForTimeout(100)
    const scaled = await choice.evaluate(el => parseFloat(getComputedStyle(el).fontSize))

    expect(scaled).toBeGreaterThan(baseline * 1.8)
  })

  test('memory tile text actually scales under a large-text setting (Fix 1 regression guard)', async ({ page }) => {
    await startMemoryBoard(page)
    const tile = page.locator('[data-tile-id]').first()
    const baseline = await tile.evaluate(el => parseFloat(getComputedStyle(el).fontSize))

    await simulateLargeText(page, 2)
    await page.waitForTimeout(100)
    const scaled = await tile.evaluate(el => parseFloat(getComputedStyle(el).fontSize))

    expect(scaled).toBeGreaterThan(baseline * 1.8)
  })

  for (const vp of REFERENCE_VIEWPORTS) {
    test(`dashboard at ${vp.name} viewport: large text introduces no new horizontal overflow (negative)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/')
      await simulateLargeText(page, 2)
      await page.waitForTimeout(100)
      expect(await noHorizontalOverflow(page)).toBe(true)
    })
  }
})
```

- [ ] **Step 2: Run the new suite against the dev server**

Run: `npx playwright test zoom-large-text.spec.js`
Expected: all tests PASS (Tasks 1-5 already landed the fixes these tests guard).

- [ ] **Step 3: Run the full e2e suite to confirm no regressions elsewhere**

Run: `npm run e2e`
Expected: all tests pass except visual-regression snapshot comparisons, which are expected to fail here (font-size changes shifted rendered pixels across the app) — handled in Task 7.

- [ ] **Step 4: Commit**

```bash
git add e2e/zoom-large-text.spec.js
git commit -m "test(83): add reusable e2e suite for 200%-zoom and large-text regressions"
```

---

## Task 7: Regenerate visual baselines and run full verification

**Files:**
- Modify: `e2e/visual.spec.js-snapshots/*` (regenerated, not hand-edited)

**Interfaces:** none.

- [ ] **Step 1: Regenerate visual regression baselines**

Run: `npx playwright test visual.spec.js --update-snapshots`
Expected: completes; every baseline touching a font-size or the header changes.

- [ ] **Step 2: Review the diff before committing**

Run: `git diff --stat -- e2e/visual.spec.js-snapshots/`
Expected: a large number of changed `.png` files — this is the expected, accepted cost of the whole-app conversion (per the approved design spec). Spot-check a handful (e.g. `git show` isn't useful for binary PNGs — instead open a few changed files, such as `components-gameresults--default*.png` and `games-animalmemorymatchgame--default*.png`, with the Read tool) to confirm they show the same layout with proportionally larger text, not a broken/garbled render.

- [ ] **Step 3: Run the complete verification suite**

Run each in order:
```bash
npm run lint
npm run lint:css
npx vitest run
npm run build
npm run e2e
```
Expected: all pass. (If `npm run lint` fails due to a stale `storybook-static/` build directory, remove it first — `rm -rf storybook-static` — this is a known false-positive in this repo, not a real lint issue.)

- [ ] **Step 4: Commit**

```bash
git add e2e/visual.spec.js-snapshots/
git commit -m "test(83): regenerate visual baselines for whole-app rem font-size conversion"
```

---

## Task 8: Docs and version bump

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/ENHANCEMENTS.md`

**Interfaces:** none.

- [ ] **Step 1: Bump the version**

Edit `package.json`: the current `"version"` field is `"0.28.5"` — change it to `"0.29.0"` (minor bump, cross-cutting visible change per the design spec).

- [ ] **Step 2: Add the CHANGELOG entry**

Edit `CHANGELOG.md`: insert a new section directly above the current top entry (`## [0.28.5] - 2026-07-18`), matching this file's exact existing format (one dense paragraph per entry, not a bullet list — see the `[0.28.5]`/`[0.28.4]` entries immediately below for the house style):

```markdown
## [0.29.0] - 2026-07-19

### Fixed
- Accessibility wave 2 (issue #83, 200%-zoom / large-text audit): OS/browser "larger text" accessibility settings previously had no effect anywhere in the app — every `font-size` declaration was hardcoded in `px`, which does not respond to the root-font-size scaling those settings use (confirmed: doubling the root font-size produced a byte-for-byte identical render); converted app-wide to `rem`, including a fix to `ParentDashboard`'s heatmap day-label box (fixed `width`/`height` → `min-width`/`min-height`) so its now-larger glyph can't clip. Separately, the memory board's keyboard-focused tiles could land up to 71% hidden behind the sticky app header at 200%-zoom-equivalent or other short viewports, since nothing reserved scroll space for the header's height; a new `useHeaderHeightVar` hook publishes the header's live `ResizeObserver`-measured height as `--shell-header-height`, consumed by a new `html { scroll-padding-top: var(--shell-header-height) }` rule so native browser scroll-into-view never lands focus underneath it. Guarded by a new reusable `e2e/zoom-large-text.spec.js` suite.
```

- [ ] **Step 3: Remove the shipped backlog entry**

Edit `docs/ENHANCEMENTS.md`: remove this line from the Accessibility section:

```
- **200% zoom / large-text audit** — verify layouts (especially the memory board and results screens) survive browser zoom and OS large-text settings; this audience's parents often hand devices to grandparents.
```

- [ ] **Step 4: Commit**

```bash
git add package.json CHANGELOG.md docs/ENHANCEMENTS.md
git commit -m "chore(83): changelog and version bump for accessibility wave 2"
```

---

## Follow-up noted, not part of this plan

During Task 3-5 discovery, `src/parent/ParentDashboard.jsx` was found to pass `tick={{ fontSize: 12 }}` (a raw JS number, not CSS) to Recharts `<XAxis>`/`<YAxis>` components in two charts (lines 92-93, 131-132) — this renders as an inline `12px` SVG text style that Recharts does not read from CSS custom properties, so it's unaffected by this plan's `rem` conversion and Recharts' support for a `rem`-equivalent value there is unverified. This is a parent-only chart-axis label, out of the design spec's named scope (`src/**/*.css`) — worth a `docs/ENHANCEMENTS.md` follow-up entry if the team wants full text-scale coverage of the Parent Dashboard charts specifically, but not part of this plan.
