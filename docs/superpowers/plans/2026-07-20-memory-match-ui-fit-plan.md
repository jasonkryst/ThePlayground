# Memory Match UI Fit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two Memory Match layout bugs from issue #104 — tiles overflow the viewport (need to scroll to see the whole board), and the "Turn it sideways!" rotation overlay gets cut off on portrait phones.

**Architecture:** (1) A new `useFitTileSize` hook (`ResizeObserver` → CSS custom property, mirroring the existing `useHeaderHeightVar` pattern) measures `MemoryBoard`'s available box and sizes tiles from both width and height, floored at 48px and capped at 140px. (2) A single CSS rule collapses the orientation gate's inert game content out of layout flow (`display: none` on `[inert]`), so it stops inflating the box the rotation overlay is centered against.

**Tech Stack:** React 18, Vite, Vitest + React Testing Library (unit), Playwright (e2e), plain CSS (no preprocessor).

## Global Constraints

- Tile size clamps to **[48px, 140px]**. 140px is the existing desktop/tablet default (issue #58); 48px is a sanity guard (not a tap-target promise) — full-board visibility outranks tile size when they conflict, confirmed with the reporter.
- Horizontal overflow must never regress: the tile-size formula's outer `Math.min(..., widthPerTile, ...)` term makes this structurally guaranteed, not just tested.
- Tile gap is `0.75rem` (12px at the default 16px root font size) — this exact pixel value is duplicated as a JS constant (`TILE_GAP_PX`) in `MemoryBoard.jsx`; keep both in sync if either changes.
- `OrientationGate`'s CSS fix must not change its JS/focus-management behavior — CSS-only, targeting the `inert` attribute it already sets.
- Every numeric test expectation in this plan was verified against the real running app via Playwright (not estimated) — see `docs/superpowers/specs/2026-07-20-memory-match-ui-fit-design.md` for the measurements.

---

### Task 1: `useFitTileSize` hook

**Files:**
- Create: `src/hooks/useFitTileSize.js`
- Test: `src/hooks/__tests__/useFitTileSize.test.js`

**Interfaces:**
- Produces: `useFitTileSize(ref: RefObject<HTMLElement>, { columns: number, rows: number, gap: number }): void` — side-effect only, sets `--memory-board-tile-size` (a `px` string) directly on `ref.current.style` via `ResizeObserver`. No return value. Later tasks (Task 2) call this from `MemoryBoard.jsx` with a ref to the board wrapper element.

> **Superseded during implementation.** The code and tests below measure the
> wrapper's own `getBoundingClientRect().height` for the height term —
> real Playwright verification against the running app (done during Task 5,
> not visible from a diff or jsdom) found this is circular in this
> codebase's shell architecture (`.shell` uses `min-height: 100vh`, not
> `height`, so nothing in the ancestor chain has a hard ceiling — see the
> design doc's matching superseded-note in Fix §1, and
> `src/hooks/useFitTileSize.js`'s header comment, for the full reasoning).
> The shipped hook instead derives the height term from
> `window.innerHeight`, the board's scroll-corrected document-relative
> position, and the shell footer's own height. Two more real bugs were
> found and fixed along the way: a global `button { min-width/height: 64px
> }` rule (`src/index.css`) silently overriding sub-64px tile sizes, and a
> font-size regression against issue #83's rem-relative large-text support.
> None of this changes the [48, 140] clamp range or the width-safety
> guarantee described below — only how the height input is measured. Treat
> the code blocks in this task as the *first draft*; the actual shipped
> hook and its tests differ as described above.

- [ ] **Step 1: Write the failing tests**

```js
// src/hooks/__tests__/useFitTileSize.test.js
import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import useFitTileSize from '../useFitTileSize'

class MockResizeObserver {
  constructor(callback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }
  observe(el) { this.el = el }
  disconnect() { this.disconnected = true }
}
MockResizeObserver.instances = []

function makeBoardRef(width, height) {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {},
  })
  return { current: el }
}

beforeEach(() => {
  MockResizeObserver.instances = []
  global.ResizeObserver = MockResizeObserver
})

afterEach(() => {
  delete global.ResizeObserver
})

describe('useFitTileSize', () => {
  it('publishes the raw computed size when it already falls within [48, 140]', () => {
    // 5 cols x 2 rows, gap 12: widthPerTile=(700-48)/5=130.4, heightPerTile=(300-12)/2=144 -> min=130.4 -> floor 130
    const ref = makeBoardRef(700, 300)
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('130px')
  })

  it('clamps to the 140px cap on a generous box (negative: does not grow past the desktop default)', () => {
    const ref = makeBoardRef(2000, 1000)
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('140px')
  })

  it('floors to 48px on a height-tight box rather than the smaller raw value', () => {
    // heightPerTile=(100-12)/2=44 (raw min), but widthPerTile=90.4 has headroom -> floors to 48
    const ref = makeBoardRef(500, 100)
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('48px')
  })

  it('negative: never exceeds the width-derived size even when that is below the 48px floor (no horizontal overflow, ever)', () => {
    // widthPerTile=(200-48)/5=30.4 -- below the 48px floor itself; the floor must not push past it
    const ref = makeBoardRef(200, 300)
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('30px')
  })

  it('updates the property when the observed element resizes', () => {
    const ref = makeBoardRef(700, 300)
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    ref.current.getBoundingClientRect = () => ({ width: 2000, height: 1000 })
    MockResizeObserver.instances[0].callback()
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('140px')
  })

  it('disconnects the observer on unmount (negative: no further writes after unmount)', () => {
    const ref = makeBoardRef(700, 300)
    const { unmount } = renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    unmount()
    expect(MockResizeObserver.instances[0].disconnected).toBe(true)
    ref.current.getBoundingClientRect = () => ({ width: 2000, height: 1000 })
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('130px')
  })

  it('does nothing when ref.current is null (negative: no crash before the element mounts)', () => {
    const ref = { current: null }
    expect(() => renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))).not.toThrow()
  })

  it('does nothing when the measured box is zero-sized (negative: jsdom/pre-layout guard)', () => {
    const ref = makeBoardRef(0, 0)
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('')
  })

  it('does nothing when columns or rows is invalid (negative: guards a divide-by-zero shape)', () => {
    const ref = makeBoardRef(700, 300)
    renderHook(() => useFitTileSize(ref, { columns: 0, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useFitTileSize.test.js`
Expected: FAIL — `Cannot find module '../useFitTileSize'` (module doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```js
// src/hooks/useFitTileSize.js
import { useLayoutEffect } from 'react'

const MIN_TILE_PX = 48
const MAX_TILE_PX = 140

// Measures the memory board's available box (a flex:1 wrapper that fills
// whatever vertical space `.game` has left after the prompt/timer) and
// publishes the largest square tile size that lets `columns` x `rows` tiles
// fit, given both axes. Floored at 48px (a sanity guard, not a tap-target
// promise -- full-board visibility outranks tile size per issue #104) and
// capped at 140px (today's desktop/tablet default, issue #58). `widthPerTile`
// is always part of the outer clamp, so the floor can never push the board
// past the available width -- horizontal overflow is structurally
// impossible regardless of how tight the box gets.
// Mirrors useHeaderHeightVar's ResizeObserver -> CSS custom property pattern.
// useLayoutEffect (not useEffect) so the first real measurement lands before
// paint, avoiding a visible pop from the 140px CSS fallback.
export default function useFitTileSize(ref, { columns, rows, gap }) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !(columns > 0) || !(rows > 0)) return undefined

    const updateVar = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      const widthPerTile = (width - gap * (columns - 1)) / columns
      const heightPerTile = (height - gap * (rows - 1)) / rows
      const rawSize = Math.min(widthPerTile, heightPerTile)
      const tileSize = Math.floor(Math.min(MAX_TILE_PX, widthPerTile, Math.max(MIN_TILE_PX, rawSize)))
      el.style.setProperty('--memory-board-tile-size', `${tileSize}px`)
    }

    updateVar()
    const observer = new ResizeObserver(updateVar)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, columns, rows, gap])
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useFitTileSize.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFitTileSize.js src/hooks/__tests__/useFitTileSize.test.js
git commit -m "feat(104): add useFitTileSize hook for width+height-aware tile sizing"
```

---

### Task 2: Wire `useFitTileSize` into `MemoryBoard`

**Files:**
- Modify: `src/components/MemoryBoard.jsx`
- Modify: `src/components/MemoryBoard.css`
- Modify: `src/components/__tests__/MemoryBoard.test.jsx`

**Interfaces:**
- Consumes: `useFitTileSize` from Task 1 — `useFitTileSize(ref, { columns, rows, gap })`.
- Produces: `MemoryBoard`'s rendered grid element carries inline `--memory-board-columns` and `--memory-board-rows` custom properties (unchanged name for columns, new for rows) — no change to `MemoryBoard`'s public props.

- [ ] **Step 1: Write the failing tests** (add to the existing `describe('MemoryBoard grid sizing (issue #58)', ...)` block's sibling area in `src/components/__tests__/MemoryBoard.test.jsx` — insert this new `describe` block after it, before the file's closing)

```js
describe('MemoryBoard grid sizing (issue #104 — rows)', () => {
  it('sets --memory-board-rows to 2 for a 10-tile board (5×2)', () => {
    const tenTiles = Array.from({ length: 10 }, (_, i) => ({
      tileId: `t${i}`, itemId: `item${i % 5}`, state: 'down',
    }))
    const { container } = renderBoard({ tiles: tenTiles })
    const grid = container.querySelector('.memory-board__grid')
    expect(grid.style.getPropertyValue('--memory-board-rows')).toBe('2')
  })

  it('sets --memory-board-rows to 3 for a 12-tile board (4×3)', () => {
    const twelveTiles = Array.from({ length: 12 }, (_, i) => ({
      tileId: `t${i}`, itemId: `item${i % 6}`, state: 'down',
    }))
    const { container } = renderBoard({ tiles: twelveTiles })
    const grid = container.querySelector('.memory-board__grid')
    expect(grid.style.getPropertyValue('--memory-board-rows')).toBe('3')
  })

  it('never sets a non-positive row count for an empty board (negative)', () => {
    const { container } = renderBoard({ tiles: [] })
    const grid = container.querySelector('.memory-board__grid')
    expect(Number(grid.style.getPropertyValue('--memory-board-rows'))).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/__tests__/MemoryBoard.test.jsx`
Expected: FAIL — `--memory-board-rows` is an empty string (not set yet)

- [ ] **Step 3: Update `MemoryBoard.jsx`**

Replace the full file:

```jsx
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import idealColumns from '../utils/idealColumns'
import useFitTileSize from '../hooks/useFitTileSize'
import './MemoryBoard.css'

// Must match the `gap` in .memory-board__grid (MemoryBoard.css, 0.75rem at
// the default 16px root font size).
const TILE_GAP_PX = 12

export default function MemoryBoard({ tiles, onFlip, renderFace, getFaceLabel, animationsEnabled = true, liveMessage = '' }) {
  const { t } = useTranslation()
  const total = tiles.length
  const columns = idealColumns(total)
  const rows = total > 0 ? Math.ceil(total / columns) : 1
  const boardRef = useRef(null)
  useFitTileSize(boardRef, { columns, rows, gap: TILE_GAP_PX })

  return (
    <div className="memory-board" ref={boardRef}>
      <div
        className={`memory-board__grid${animationsEnabled ? '' : ' memory-board__grid--no-anim'}`}
        style={{ '--memory-board-columns': columns, '--memory-board-rows': rows }}
      >
        {tiles.map((tile, i) => {
          const faceUp = tile.state !== 'down'
          const label =
            tile.state === 'down' ? t('memoryBoard.hiddenTile', { position: i + 1, total })
            : tile.state === 'matched' ? t('memoryBoard.matchedLabel', { name: getFaceLabel(tile.itemId) })
            : getFaceLabel(tile.itemId)
          return (
            <button
              key={tile.tileId}
              className={`memory-board__tile memory-board__tile--${tile.state}`}
              data-item-id={tile.itemId}
              data-tile-id={tile.tileId}
              aria-label={label}
              aria-disabled={tile.state === 'matched'}
              onClick={() => { if (tile.state !== 'matched') onFlip(tile.tileId) }}
            >
              <span className="memory-board__tile-inner" aria-hidden="true">
                <span className="memory-board__tile-back">❓</span>
                <span className="memory-board__tile-face">{faceUp ? renderFace(tile.itemId) : null}</span>
              </span>
              {tile.state === 'mismatch' && <span className="memory-board__cross" aria-hidden="true">✗</span>}
            </button>
          )
        })}
      </div>
      <div className="sr-only" role="status" aria-live="polite">{liveMessage}</div>
    </div>
  )
}
```

- [ ] **Step 4: Update `MemoryBoard.css`**

Replace the top of the file (from the start through `.memory-board__tile`'s closing brace) — everything from `.memory-board__tile-inner` onward (tile-back, tile-face, matched, mismatch, cross, keyframes, no-anim, reduced-motion) stays exactly as-is:

```css
.memory-board {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.memory-board__grid {
  display: grid;
  grid-template-columns: repeat(var(--memory-board-columns), var(--memory-board-tile-size, 140px));
  grid-template-rows: repeat(var(--memory-board-rows), var(--memory-board-tile-size, 140px));
  gap: 0.75rem;
}

.memory-board__tile {
  position: relative;
  border: none;
  border-radius: var(--radius-card);
  background: transparent;
  padding: 0;
  cursor: pointer;
  perspective: 600px;
  font-size: calc(var(--memory-board-tile-size, 140px) * 0.34);
}
```

(This removes `.memory-board__tile`'s `aspect-ratio: 1` — redundant now that both grid axes share one explicit track size — and removes the old `width: min(...)` cap formula and `margin: 0 auto` on `.memory-board__grid`, both superseded by the flex-centered wrapper and JS-computed tile size.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/__tests__/MemoryBoard.test.jsx`
Expected: PASS (all tests, including the 3 new ones and all pre-existing ones — pre-existing tests must be unaffected since column selection logic (`idealColumns`) didn't change)

- [ ] **Step 6: Run the full unit suite to check for unrelated regressions**

Run: `npx vitest run`
Expected: PASS — in particular check `src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx` still passes (it renders `MemoryBoard` indirectly)

- [ ] **Step 7: Commit**

```bash
git add src/components/MemoryBoard.jsx src/components/MemoryBoard.css src/components/__tests__/MemoryBoard.test.jsx
git commit -m "feat(104): size memory tiles from available width and height, not width alone"
```

---

### Task 3: Collapse inert orientation-gate content out of layout

**Files:**
- Modify: `src/components/OrientationGate.css`

**Interfaces:**
- Consumes: the `inert` DOM attribute already set by `OrientationGate.jsx` via `setAttribute('inert', '')` (no JS change in this task).
- Produces: nothing new consumed by other tasks — this is a leaf CSS change.

- [ ] **Step 1: Add the CSS rule**

Append to `src/components/OrientationGate.css`:

```css

/* `inert` is set via JS (OrientationGate.jsx) whenever this content is
   blocked by the overlay above it. It must not contribute to this box's
   layout height -- flexbox's default min-height:auto means a flex item
   won't shrink below its content's size, so the still-rendered (just
   hidden) game markup can inflate `.orientation-gate` far past one screen
   when its layout (built for the *other*, required orientation) doesn't
   fit the current one, which then mis-centers the overlay itself
   (issue #104). display:none still keeps the component mounted (state
   preserved), it just removes it from flex sizing. */
.orientation-gate__content[inert] {
  display: none;
}
```

- [ ] **Step 2: Run the existing OrientationGate unit tests to confirm no regression**

Run: `npx vitest run src/components/__tests__/OrientationGate.test.jsx`
Expected: PASS — jsdom doesn't compute CSS, so these attribute-based tests (`inert`, `aria-hidden`) are unaffected by a CSS-only change; this step just confirms nothing else broke.

- [ ] **Step 3: Commit**

```bash
git add src/components/OrientationGate.css
git commit -m "fix(104): stop inert game content from inflating the orientation gate's box height"
```

---

### Task 4: E2E coverage for the orientation overlay fix

**Files:**
- Modify: `e2e/orientation-gate.spec.js`

**Interfaces:**
- Consumes: the app running via `npm run dev`/Playwright's configured base URL (existing e2e setup — no new fixtures).

- [ ] **Step 1: Add two new tests**

Append to `e2e/orientation-gate.spec.js`, after the existing `'overlay state has no accessibility violations'` test and before the final `'negative: a game without the manifest flag...'` test:

```js
test('overlay message is fully visible, not cut off, when the inert board underneath is taller than the viewport (issue #104)', async ({ page }) => {
  await page.setViewportSize(PORTRAIT)
  await page.goto('/game/animal-memory-match')
  await expect(page.getByTestId('orientation-overlay')).toBeVisible()
  await expect(page.getByRole('heading', { name: /turn it sideways/i })).toBeInViewport()
  await expect(page.getByText(/this game needs a wide screen/i)).toBeInViewport()
})

test('negative: inert content is visually collapsed, not just non-interactive, while blocked (issue #104)', async ({ page }) => {
  await page.setViewportSize(PORTRAIT)
  await page.goto('/game/animal-memory-match')
  await expect(page.getByTestId('orientation-overlay')).toBeVisible()
  await expect(page.locator('.orientation-gate__content')).toBeHidden()
})
```

- [ ] **Step 2: Run the new tests**

Run: `npx playwright test orientation-gate.spec.js`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 3: Commit**

```bash
git add e2e/orientation-gate.spec.js
git commit -m "test(104): add e2e coverage for the orientation overlay layout fix"
```

---

### Task 5: E2E coverage for memory board sizing, and update the superseded issue #58 assertion

**Files:**
- Modify: `e2e/animal-memory-match.spec.js`

**Interfaces:**
- Consumes: `startGame(page)` helper already defined at the top of this file.

- [ ] **Step 1: Update the issue #58 tap-target test** (replace the existing test of this name)

Find and replace this test:

```js
test('memory match: cards are large tap targets with breathing room from the screen edge on phone (issue #58)', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 }) // landscape phone — the game now requires landscape (#62)
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
```

with:

```js
test('memory match: cards keep breathing room from the screen edge and never overflow horizontally on phone (issue #58, floor revised by #104)', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 }) // landscape phone — the game now requires landscape (#62)
  await startGame(page)
  const boxes = await page.locator('[data-tile-id]').evaluateAll(els =>
    els.map(e => {
      const r = e.getBoundingClientRect()
      return { width: r.width, height: r.height, left: r.left }
    })
  )
  for (const box of boxes) {
    // 120px was issue #58's toddler tap-target floor. At this specific tight
    // viewport height, issue #104 revises it down to a 48px sanity floor so
    // the whole board can still fit -- see the design doc for the trade-off.
    expect(box.width).toBeGreaterThanOrEqual(48)
    expect(box.height).toBeGreaterThanOrEqual(48)
    expect(box.left).toBeGreaterThan(0)
  }
  const overflowsHorizontally = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflowsHorizontally).toBe(false)
})
```

- [ ] **Step 2: Add two new tests** — insert after the test updated in Step 1

```js
test('memory match: board that used to require scrolling now fits one screen on a modest landscape window (issue #104)', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 490 })
  await startGame(page)
  const fitsOneScreen = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)
  expect(fitsOneScreen).toBe(true)
})

test('memory match: tablet board still fits one screen without scrolling after the sizing change (issue #104 regression guard)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await startGame(page)
  const fitsOneScreen = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)
  expect(fitsOneScreen).toBe(true)
})
```

- [ ] **Step 3: Run the full file**

Run: `npx playwright test animal-memory-match.spec.js`
Expected: PASS — including the two pre-existing "cards grow to fill tablet" and "board stays centered" tests (unaffected — verified by hand in the design doc that 1024×768 still computes to the 140px cap with the new formula).

- [ ] **Step 4: Commit**

```bash
git add e2e/animal-memory-match.spec.js
git commit -m "test(104): add e2e coverage for board fit; update issue #58's tile-size floor assertion"
```

---

### Task 6: Docs — version bumps and CHANGELOG

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/games/animal-memory-match/manifest.json`
- Modify: `CHANGELOG.md`

**Interfaces:** None — leaf documentation task.

- [ ] **Step 1: Bump `package.json` version**

In `package.json`, change:
```json
  "version": "0.31.0",
```
to:
```json
  "version": "0.31.1",
```

- [ ] **Step 2: Sync `package-lock.json`**

Run: `npm install --package-lock-only`
Expected: updates `package-lock.json`'s top-level `"version"` field to `0.31.1` to match (same approach as the prior `chore: sync package-lock.json version` commit in this repo's history).

- [ ] **Step 3: Bump the memory-match manifest version**

In `src/games/animal-memory-match/manifest.json`, change:
```json
  "version": "1.2.1",
```
to:
```json
  "version": "1.2.2",
```

- [ ] **Step 4: Add a CHANGELOG entry**

Insert at the top of `CHANGELOG.md`, above the existing `## [0.31.0] - 2026-07-19` entry:

```markdown
## [0.31.1] - 2026-07-20

### Fixed

- Memory Match tiles now size themselves from both available width *and* height (issue #104), not width alone — on short/landscape viewports where the old fixed-width sizing produced a board taller than the screen, tiles shrink (down to a 48px sanity floor, revised down from issue #58's 120px tap-target floor specifically to prioritize showing the whole board over tile size when the two conflict) so more of the board fits without scrolling; tablet/desktop are unaffected, where the existing 140px cap still applies.
- The rotation-required overlay ("Turn it sideways!") no longer gets cut off on portrait phones. The still-mounted (but `inert`) game content underneath was contributing to the overlay container's layout height, due to flexbox's default `min-height: auto` — this could push the overlay's centered message below the visible viewport when the hidden content's own layout didn't fit the current orientation. The inert content is now fully collapsed (`display: none`) instead.

```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/games/animal-memory-match/manifest.json CHANGELOG.md
git commit -m "chore(104): bump versions and add CHANGELOG entry"
```

---

### Task 7: Visual regression, lint, full suite, and manual verification

**Files:**
- Modify (regenerated, not hand-edited): `e2e/visual.spec.js-snapshots/components-memoryboard--default-chromium-win32.png`
- Modify (regenerated): `e2e/visual.spec.js-snapshots/games-animalmemorymatchgame--default-chromium-win32.png`
- Modify (regenerated): `e2e/visual.spec.js-snapshots/components-orientationoverlay--default-chromium-win32.png`
- Modify (regenerated): `e2e/visual.spec.js-snapshots/components-orientationoverlay--portrait-required-chromium-win32.png`

**Interfaces:** None — final verification task, no new code interfaces.

- [ ] **Step 1: Regenerate visual snapshots**

Run: `npx playwright test visual.spec.js --update-snapshots`
Expected: the four snapshots listed above change (Storybook has no `.game`/shell flex ancestor, so `MemoryBoard`'s flex-fill is inert there and sizing falls back to the 140px CSS default — expect the memory board snapshots to look essentially the same as before; the orientation overlay snapshots may shift slightly if Storybook's fixed-height wrapper interacts with the `display:none` change, review the diff).

- [ ] **Step 2: Review the diffs manually**

Open each changed `.png` (or use Playwright's HTML report: `npx playwright show-report`) and confirm nothing looks broken — tiles still render as squares with the emoji face, the flip animation states still look correct, the overlay still shows the rotate icon/heading/body centered.

- [ ] **Step 3: Run lint**

Run: `npm run lint && npm run lint:css`
Expected: PASS, no errors. (If `storybook-static/` exists from a prior build, remove it first — `rm -rf storybook-static` — it causes bogus lint failures per this repo's known quirk.)

- [ ] **Step 4: Run the full unit test suite with coverage**

Run: `npm run coverage`
Expected: PASS, no new uncovered branches introduced by `useFitTileSize.js` (its guard clauses are all exercised by the Task 1 tests).

- [ ] **Step 5: Run the full e2e suite**

Run: `npm run e2e`
Expected: PASS. Pay particular attention to `animal-memory-match.spec.js`, `orientation-gate.spec.js`, `intro-results-height.spec.js` (unrelated but shares the "fits one screen" pattern — confirm untouched), `html-validity.spec.js`/`css-validity.spec.js` (confirm the new CSS/inline styles are still valid).

- [ ] **Step 6: Manual dev-server verification**

Run: `npm run dev`, then in a browser (or via Playwright MCP as used during design) resize to:
- ~844×390 or ~667×375 (landscape phone): confirm the board is much closer to fitting one screen than before (small residual scroll is expected and disclosed — not a bug).
- ~900×490 (modest landscape window): confirm the board fits with zero scroll.
- ~1024×768 (tablet): confirm tiles still render at 140px, unchanged from before this fix.
- A portrait phone viewport on `/game/animal-memory-match`: confirm the full "Turn it sideways! This game needs a wide screen. Turn your device to keep playing!" message is visible, matching the original bug report's second screenshot.

- [ ] **Step 7: Final commit** (only if snapshot regeneration produced changes not already committed)

```bash
git add e2e/visual.spec.js-snapshots/
git commit -m "test(104): regenerate visual regression snapshots for the sizing/overlay fixes"
```
