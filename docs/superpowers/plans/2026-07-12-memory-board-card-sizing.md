# Animal Match Card Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `MemoryBoard` cards bigger (matching the app's existing 120px tap-target convention) and have the board use available screen space instead of staying capped at a fixed 560px width, fixing both the "cards too small for a toddler" and "too much white space" complaints from issue #58.

**Architecture:** A new pure utility (`idealColumns`) computes the largest square-ish, evenly-dividing column count for a given tile count (6→3, 8→4, 10→5, 12→4). `MemoryBoard` passes that as a CSS custom property that bounds the grid's max width, while the grid itself keeps using responsive `auto-fit`/`minmax` for actual column resolution at any given viewport — so it's an upper bound, not a fixed layout. The cap's per-card target size (140px) is deliberately kept close to the 120px floor — `auto-fit` always packs as many columns as fit *at the floor size*, so a cap computed from a much larger target (e.g. 160px) would be wide enough for `auto-fit` to sneak in an extra floor-sized column instead of the intended number of larger ones; 140px leaves enough margin under that threshold for every real tile count in this game (verified below). `AnimalMemoryMatchGame` adopts the same shared `.game` page-padding wrapper every other game already uses, which it was missing.

**Tech Stack:** React + Vite, Vitest + React Testing Library (unit), Playwright (e2e + visual regression), plain CSS with custom properties.

## Global Constraints

- Tile floor: 120px (matches `.game__choice { min-height: 120px }` used by every quiz game).
- Tile comfortable/cap target size: 140px (used only to compute the grid's max-width upper bound, not a hard floor — kept close to the 120px floor so the cap can't accidentally leave room for `auto-fit` to pack in an extra floor-sized column; see Architecture above).
- Gap: 0.75rem (unchanged from current value).
- Icon size: 3rem / 48px (matches `.game__choice`'s 48px icon convention), up from 2.5rem.
- Column-count formula: smallest integer `cols >= ceil(sqrt(count))` such that `count % cols === 0` (exact division, no leftover row). For count `<= 1`, returns 1.
- Confirmed product decision (reporter approved): prioritize card size over column count on phones. Do not add a media query or alternate floor to preserve 3 columns on narrow phones.
- Spec: `docs/superpowers/specs/2026-07-12-memory-board-card-sizing-design.md` — consult for full rationale if anything here is ambiguous.

---

### Task 1: `idealColumns` utility

**Files:**
- Create: `src/utils/idealColumns.js`
- Test: `src/utils/__tests__/idealColumns.test.js`

**Interfaces:**
- Produces: `export default function idealColumns(count: number): number` — Task 2 imports this as `import idealColumns from '../utils/idealColumns'`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/idealColumns.test.js`:

```js
// src/utils/__tests__/idealColumns.test.js
import { describe, it, expect } from 'vitest'
import idealColumns from '../idealColumns'

describe('idealColumns', () => {
  it('returns 3 for 6 tiles (3×2 — the 3-pairs memory board)', () => {
    expect(idealColumns(6)).toBe(3)
  })

  it('returns 4 for 8 tiles (4×2 — the 4-pairs memory board)', () => {
    expect(idealColumns(8)).toBe(4)
  })

  it('returns 5 for 10 tiles (5×2 — the default 5-pairs memory board)', () => {
    expect(idealColumns(10)).toBe(5)
  })

  it('returns 4 for 12 tiles (4×3 — the 6-pairs memory board)', () => {
    expect(idealColumns(12)).toBe(4)
  })

  it('returns 2 for 2 tiles (2×1)', () => {
    expect(idealColumns(2)).toBe(2)
  })

  it('returns 1 for a single tile', () => {
    expect(idealColumns(1)).toBe(1)
  })

  it('returns 1 for zero tiles, never dividing by zero', () => {
    expect(idealColumns(0)).toBe(1)
  })

  it('terminates and returns a divisor for a prime count instead of looping forever', () => {
    expect(idealColumns(7)).toBe(7)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/idealColumns.test.js`
Expected: FAIL — `Cannot find module '../idealColumns'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/idealColumns.js`:

```js
// src/utils/idealColumns.js
export default function idealColumns(count) {
  if (count <= 1) return 1
  let cols = Math.ceil(Math.sqrt(count))
  while (count % cols !== 0) cols++
  return cols
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/idealColumns.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/idealColumns.js src/utils/__tests__/idealColumns.test.js
git commit -m "$(cat <<'EOF'
Add idealColumns utility for square-ish memory board grids

Computes the largest square-ish column count that evenly divides a
tile count, so MemoryBoard can size its grid without leaving a
sparse, off-center last row.
EOF
)"
```

---

### Task 2: `MemoryBoard` sizing — bigger cards, tile-count-aware width cap

**Files:**
- Modify: `src/components/MemoryBoard.jsx`
- Modify: `src/components/MemoryBoard.css`
- Test: `src/components/__tests__/MemoryBoard.test.jsx`

**Interfaces:**
- Consumes: `idealColumns(count: number): number` from Task 1 (`src/utils/idealColumns.js`).
- Produces: `MemoryBoard`'s rendered `.memory-board__grid` element now has an inline `style` containing `--memory-board-columns: <computed columns>`. No prop/signature changes — `MemoryBoard`'s existing props (`tiles`, `onFlip`, `renderFace`, `getFaceLabel`, `animationsEnabled`, `liveMessage`) are unchanged, so Task 3/4 and existing callers (`AnimalMemoryMatchGame`) need no changes to how they call it.

- [ ] **Step 1: Write the failing tests**

Open `src/components/__tests__/MemoryBoard.test.jsx` and add a new `describe` block after the existing one (before the final closing of the file), keeping all existing tests as-is:

```jsx
describe('MemoryBoard grid sizing (issue #58)', () => {
  it('sets --memory-board-columns to 5 for a 10-tile board (5×2)', () => {
    const tenTiles = Array.from({ length: 10 }, (_, i) => ({
      tileId: `t${i}`, itemId: `item${i % 5}`, state: 'down',
    }))
    const { container } = renderBoard({ tiles: tenTiles })
    const grid = container.querySelector('.memory-board__grid')
    expect(grid.style.getPropertyValue('--memory-board-columns')).toBe('5')
  })

  it('sets --memory-board-columns to 4 for a 12-tile board (4×3)', () => {
    const twelveTiles = Array.from({ length: 12 }, (_, i) => ({
      tileId: `t${i}`, itemId: `item${i % 6}`, state: 'down',
    }))
    const { container } = renderBoard({ tiles: twelveTiles })
    const grid = container.querySelector('.memory-board__grid')
    expect(grid.style.getPropertyValue('--memory-board-columns')).toBe('4')
  })

  it('never sets a non-positive column count for an empty board', () => {
    const { container } = renderBoard({ tiles: [] })
    const grid = container.querySelector('.memory-board__grid')
    expect(Number(grid.style.getPropertyValue('--memory-board-columns'))).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/components/__tests__/MemoryBoard.test.jsx`
Expected: the 3 new tests FAIL (`--memory-board-columns` is an empty string — the style isn't set yet); all pre-existing tests still PASS.

- [ ] **Step 3: Implement in `MemoryBoard.jsx`**

Current top of file:

```jsx
import { useTranslation } from 'react-i18next'
import './MemoryBoard.css'

export default function MemoryBoard({ tiles, onFlip, renderFace, getFaceLabel, animationsEnabled = true, liveMessage = '' }) {
  const { t } = useTranslation()
  const total = tiles.length

  return (
    <div className="memory-board">
      <div className={`memory-board__grid${animationsEnabled ? '' : ' memory-board__grid--no-anim'}`}>
```

Replace with:

```jsx
import { useTranslation } from 'react-i18next'
import idealColumns from '../utils/idealColumns'
import './MemoryBoard.css'

export default function MemoryBoard({ tiles, onFlip, renderFace, getFaceLabel, animationsEnabled = true, liveMessage = '' }) {
  const { t } = useTranslation()
  const total = tiles.length
  const columns = idealColumns(total)

  return (
    <div className="memory-board">
      <div
        className={`memory-board__grid${animationsEnabled ? '' : ' memory-board__grid--no-anim'}`}
        style={{ '--memory-board-columns': columns }}
      >
```

The rest of the file (tile mapping, buttons, live region) is unchanged.

- [ ] **Step 4: Update `MemoryBoard.css`**

Current:

```css
.memory-board__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 0.75rem;
  max-width: 560px;
  margin: 0 auto;
}

.memory-board__tile {
  position: relative;
  aspect-ratio: 1;
  border: none;
  border-radius: var(--radius-card);
  background: transparent;
  padding: 0;
  cursor: pointer;
  perspective: 600px;
  font-size: 2.5rem;
}
```

Replace with:

```css
.memory-board {
  width: 100%;
}

.memory-board__grid {
  --memory-board-gap: 0.75rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--memory-board-gap);
  width: min(100%, calc(var(--memory-board-columns) * 140px + (var(--memory-board-columns) - 1) * var(--memory-board-gap)));
  margin: 0 auto;
}

.memory-board__tile {
  position: relative;
  aspect-ratio: 1;
  border: none;
  border-radius: var(--radius-card);
  background: transparent;
  padding: 0;
  cursor: pointer;
  perspective: 600px;
  font-size: 3rem;
}
```

140px (not a rounder number like 150) is deliberate: `auto-fit` always fits as many columns as possible *at the 120px floor*, regardless of the container's cap, so the cap must stay narrow enough that an extra floor-sized column can't fit inside it. For N columns, that means `N*140 + (N-1)*12` must stay below `(N+1)*120 + N*12` (the width at which a floor-sized `(N+1)`th column would start fitting). Checked for every real tile count in this game:

| tiles | N (idealColumns) | cap = N×140+(N−1)×12 | next-column threshold = (N+1)×120+N×12 | margin |
|---|---|---|---|---|
| 6  | 3 | 444px | 516px | 72px |
| 8  | 4 | 596px | 648px | 52px |
| 10 | 5 | 748px | 780px | 32px |
| 12 | 4 | 596px | 648px | 52px |

All four have comfortable margin, so the cap reliably produces exactly N columns (never N+1) whenever it's the binding constraint (i.e. on screens wide enough that the cap, not the viewport, determines the grid's width).

`.memory-board { width: 100%; }` is added now (not in Task 3) because it's required the moment `.memory-board__grid` relies on a percentage (`min(100%, ...)`) — without an explicit width, `.memory-board` is a plain block box today and happens to already fill its container, so this is a no-op right now, but Task 3 makes `.memory-board`'s parent a flex container with `align-items: center`, under which a child with no declared width would shrink-wrap instead of filling available space (the same reason `ColorMatchGame.css`'s `.game__question`/`.game__choices` both explicitly declare `width: 100%`). Adding it here keeps this task's own tests/behavior correct in isolation (Storybook renders `MemoryBoard` standalone, no `.game` ancestor) and avoids a latent bug being introduced silently in Task 3.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/__tests__/MemoryBoard.test.jsx`
Expected: PASS — all tests including the 3 new ones and the pre-existing `axe` accessibility check.

- [ ] **Step 6: Lint the CSS**

Run: `npm run lint:css`
Expected: no errors in `src/components/MemoryBoard.css` (fix any `stylelint-config-standard` formatting complaints if they appear — e.g. custom-property ordering — before moving on).

- [ ] **Step 7: Commit**

```bash
git add src/components/MemoryBoard.jsx src/components/MemoryBoard.css src/components/__tests__/MemoryBoard.test.jsx
git commit -m "$(cat <<'EOF'
Enlarge memory board cards and cap grid width by tile count (#58)

Tile floor grows from 90px to 120px, matching the tap-target size
every quiz game's answer cards already use. The old fixed 560px grid
cap is replaced with a cap computed from idealColumns(tileCount), so
the board grows toward a ~140px card size on wide screens instead of
leaving large empty margins, while auto-fit/minmax still drives the
actual responsive column count on narrow screens.
EOF
)"
```

---

### Task 3: `AnimalMemoryMatchGame` adopts the shared `.game` page wrapper

**Files:**
- Modify: `src/games/animal-memory-match/index.jsx`
- Modify: `src/games/animal-memory-match/AnimalMemoryMatchGame.css`
- Test: `src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`

**Interfaces:**
- Consumes: `.game` class rules from `src/components/GameLayout.css` (already loaded app-wide via `src/App.jsx`'s `import './components/GameLayout.css'` — no new import needed in this game).
- Produces: no change to `AnimalMemoryMatchGame`'s exported shape (still `export default function AnimalMemoryMatchGame({ onGameEnd })`); only its root element's `className` changes.

- [ ] **Step 1: Write the failing test**

Open `src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx` and add this test inside the existing `describe('AnimalMemoryMatchGame', ...)` block, near the other structural tests (e.g. after the `'shows the timer...'` test):

```jsx
  it('renders inside the shared .game page layout for consistent padding (issue #58)', async () => {
    let container
    await act(async () => { container = render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />).container })
    expect(container.querySelector('.memory-game')).toHaveClass('game')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`
Expected: this one test FAILS (root div has class `memory-game` only, not `game`); all other tests in the file still PASS.

- [ ] **Step 3: Implement in `index.jsx`**

In `src/games/animal-memory-match/index.jsx`, find:

```jsx
  return (
    <div className="memory-game">
```

Replace with:

```jsx
  return (
    <div className="game memory-game">
```

- [ ] **Step 4: Remove the now-redundant margin in `AnimalMemoryMatchGame.css`**

Current file:

```css
.memory-game__question {
  text-align: center;
  margin-bottom: 1rem;
}

.memory-game__prompt {
  font-size: 1.3rem;
  font-weight: bold;
}

.memory-game__progress {
  color: var(--color-text-muted, #666);
  font-size: 0.9rem;
}
```

Replace with:

```css
.memory-game__question {
  text-align: center;
}

.memory-game__prompt {
  font-size: 1.3rem;
  font-weight: bold;
}

.memory-game__progress {
  color: var(--color-text-muted, #666);
  font-size: 0.9rem;
}
```

(`.game`'s own `gap: 24px` — from `src/components/GameLayout.css` — now provides the spacing between the question block and the board; the old `margin-bottom: 1rem` would have stacked an extra, inconsistent 16px on top of that.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`
Expected: PASS — all tests, including the new one and the pre-existing `axe` accessibility check.

- [ ] **Step 6: Lint the CSS**

Run: `npm run lint:css`
Expected: no errors in `src/games/animal-memory-match/AnimalMemoryMatchGame.css`.

- [ ] **Step 7: Commit**

```bash
git add src/games/animal-memory-match/index.jsx src/games/animal-memory-match/AnimalMemoryMatchGame.css src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx
git commit -m "$(cat <<'EOF'
Give Animal Memory Match the same page padding as every other game (#58)

The game's root element never adopted the shared .game layout
wrapper (src/components/GameLayout.css) that every quiz game uses,
so its cards rendered flush against the screen edge on phones —
confirmed via computed styles (padding: 0px, tile rect.left === 0).
EOF
)"
```

---

### Task 4: E2E sizing/accessibility coverage and centering regression guard

**Files:**
- Modify: `e2e/animal-memory-match.spec.js`

**Interfaces:**
- Consumes: the running dev server route `/game/animal-memory-match`, the `startGame(page)` helper already defined at the top of this file (navigates, dismisses intro, waits for the first `[data-tile-id]`).
- Produces: no exported interface — this task only adds test cases to an existing spec file.

- [ ] **Step 1: Add the phone-viewport tap-target test**

Open `e2e/animal-memory-match.spec.js`. After the existing `test('memory match game screen has no accessibility violations', ...)` block, add:

```js
test('memory match: cards are large tap targets with breathing room from the screen edge on phone (issue #58)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await startGame(page)
  const boxes = await page.locator('[data-tile-id]').evaluateAll(els =>
    els.map(e => {
      const r = e.getBoundingClientRect()
      return { width: r.width, height: r.height, left: r.left }
    })
  )
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(120)
    expect(box.height).toBeGreaterThanOrEqual(120)
    expect(box.left).toBeGreaterThan(0)
  }
  const overflowsHorizontally = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflowsHorizontally).toBe(false)
})

test('memory match: cards grow to fill more of a tablet screen instead of staying tiny (issue #58)', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await startGame(page)
  const width = await page.locator('[data-tile-id]').first().evaluate(el => el.getBoundingClientRect().width)
  // Default board is 10 tiles (5 pairs) → idealColumns=5, cap=748px. At a
  // 768px viewport (minus .game's 32px horizontal padding, and minus a
  // little more for a possible scrollbar) auto-fit still lands on 5
  // columns, giving ~134-138px tiles — nowhere near the original ~112px.
  // 125 leaves margin on both sides without being loose enough to pass on
  // a regression back to the old sizing.
  expect(width).toBeGreaterThanOrEqual(125)
})

test('memory match: board stays centered on a wide screen instead of sticking to one side (issue #58)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await startGame(page)
  const gridBox = await page.locator('.memory-board__grid').boundingBox()
  const leftGap = gridBox.x
  const rightGap = 1024 - (gridBox.x + gridBox.width)
  expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(2)
})
```

- [ ] **Step 2: Run the new tests**

Run: `npx playwright test e2e/animal-memory-match.spec.js`
Expected: PASS — all tests in the file, including the 3 new ones. If the dev server isn't already running, Playwright's `webServer` config (`playwright.config.js`) starts it automatically.

- [ ] **Step 3: Commit**

```bash
git add e2e/animal-memory-match.spec.js
git commit -m "$(cat <<'EOF'
Add e2e coverage for memory board card sizing (issue #58)

Covers: phone tap-target size and edge padding, tablet card growth,
and horizontal centering once the grid's width cap is narrower than
the viewport (a shrink-to-fit flex-sizing regression this change
specifically had to guard against).
EOF
)"
```

---

### Task 5: Visual regression baselines, version bumps, changelog

**Files:**
- Modify: `e2e/visual.spec.js-snapshots/components-memoryboard--default-chromium-win32.png` (regenerated, not hand-edited)
- Modify: `e2e/visual.spec.js-snapshots/games-animalmemorymatchgame--default-chromium-win32.png` (regenerated, not hand-edited)
- Modify: `package.json`
- Modify: `src/games/animal-memory-match/manifest.json`
- Modify: `CHANGELOG.md`

**Interfaces:** None — this task has no code interfaces, only generated assets and metadata.

- [ ] **Step 1: Regenerate the two affected visual baselines**

Run: `npx playwright test visual.spec.js --update-snapshots`
Expected: the full suite passes and rewrites every baseline it covers. Only 2 of them should actually have changed pixels — the memory-board ones. Confirm with:

```bash
git status --short e2e/visual.spec.js-snapshots/
```

Expected output: exactly these two files modified —
```
 M e2e/visual.spec.js-snapshots/components-memoryboard--default-chromium-win32.png
 M e2e/visual.spec.js-snapshots/games-animalmemorymatchgame--default-chromium-win32.png
```

If any other baseline shows as modified, stop and investigate before continuing — that would mean this change had an unintended side effect on an unrelated component.

- [ ] **Step 2: Visually review the two new baselines**

Read the two regenerated PNGs (`e2e/visual.spec.js-snapshots/components-memoryboard--default-chromium-win32.png` and `e2e/visual.spec.js-snapshots/games-animalmemorymatchgame--default-chromium-win32.png`) and confirm: cards are visibly larger than before, no card is clipped or overlapping, and the board looks centered and intentional (not stretched or squashed).

- [ ] **Step 3: Bump `package.json` version**

In `package.json`, change:

```json
  "version": "0.24.3",
```

to:

```json
  "version": "0.24.4",
```

- [ ] **Step 4: Bump the game's own manifest version**

In `src/games/animal-memory-match/manifest.json`, change:

```json
  "version": "1.1.1",
```

to:

```json
  "version": "1.1.2",
```

- [ ] **Step 5: Add a CHANGELOG entry**

In `CHANGELOG.md`, insert a new section immediately after the `# Changelog` header block (before the existing `## [0.24.3] - 2026-07-12` entry):

```markdown
## [0.24.4] - 2026-07-12

### Changed
- Animal Memory Match cards are bigger and the board now uses the available screen space instead of leaving large empty margins (issue #58). The shared `MemoryBoard` grid's tile floor grew from 90px to 120px (matching the tap-target size used by every quiz game's answer cards), and its previous fixed 560px width cap was replaced with a tile-count-aware cap, so boards grow toward a comfortable ~140px card size on tablet/desktop instead of staying pinned at ~112px. The game's page also now uses the same padding every other game gets, so cards no longer sit flush against the screen edge on phones. Trade-off: phones in the ~360–414px range now show 2 columns instead of 3, favoring larger tap targets over column count.
```

- [ ] **Step 6: Run the full verification suite**

Run each of these and confirm they all pass before committing:

```bash
npm run lint
npm run lint:css
npx vitest run
npx playwright test
```

- [ ] **Step 7: Commit**

```bash
git add e2e/visual.spec.js-snapshots/components-memoryboard--default-chromium-win32.png e2e/visual.spec.js-snapshots/games-animalmemorymatchgame--default-chromium-win32.png package.json src/games/animal-memory-match/manifest.json CHANGELOG.md
git commit -m "$(cat <<'EOF'
Regenerate memory board visual baselines, bump versions (#58)

EOF
)"
```

---

## Final Manual Verification

After all tasks are committed, re-run the three diagnostic screenshots from the design spec against the dev server (`npm run dev`) to confirm the fix visually:

1. Navigate to `/game/animal-memory-match`, start the game, at viewport 375×667 — confirm cards are noticeably larger than the original ~112px and don't touch the screen edge.
2. Same at 768×1024 (tablet) — confirm the large dead space below the board from the original diagnosis is gone; cards should be roughly 135-140px.
3. Same at 1024×768 — confirm cards are large and the board is horizontally centered.
