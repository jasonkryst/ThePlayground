# Memory Match UI — tiles don't fit the screen, rotation overlay cut off (Issue #104)

## Problem

Issue #104 ("GAME UI - Memory Match") reports two independent layout bugs,
each with a phone screenshot:

1. **Tiles don't fit the space.** On a landscape phone, the default 10-tile
   board (5 columns × 2 rows) overflows the visible viewport — the page
   requires scrolling to see the full board.
2. **The rotation warning doesn't fit the page.** On a portrait phone (viewing
   a landscape-only game, so `OrientationGate`'s overlay is shown), the "Turn
   it sideways!" overlay's body text is cut off at the bottom of the screen,
   with a large blank area above it.

## Root causes

### 1. Tile sizing ignores available height

`MemoryBoard.css`'s `.memory-board__grid` sizes tiles from viewport **width**
only: `grid-template-columns: repeat(auto-fit, minmax(120px, 1fr))`, tiles are
forced square via `aspect-ratio: 1`, and the grid's own width is capped at
`columns × 140px + gaps` (added in issue #58 to stop tiles from being tiny on
wide screens — see `2026-07-12-memory-board-card-sizing-design.md`). Nothing
in this chain looks at available *height*. On a short viewport (a phone in
landscape), two rows of ~140px tiles plus the header/prompt/footer chrome
routinely add up to more than one screen, and the page scrolls — which is a
regression of the exact "big enough to tap, but not wasteful" goal issue #58
was chasing, just in the opposite (too-tall, not too-small) direction.

### 2. Inert game content inflates the orientation gate's box height

`OrientationGate.jsx` keeps the game mounted while blocked (so state survives
a rotation), marking its wrapper `inert` + `aria-hidden` via `setAttribute`.
That wrapper (`.orientation-gate__content`) stays in normal document flow,
though — it isn't visually hidden, just non-interactive. Flexbox's default
`min-height: auto` means a flex item won't shrink below its content's
intrinsic size, so the still-rendered (just invisible-to-the-user-behind-the-
overlay) game markup can inflate `.orientation-gate`'s box far past one
screen when its natural layout (built for the *other*, required orientation)
doesn't fit the current one. `OrientationOverlay` is `position: absolute;
inset: 0`, sized to match that inflated `.orientation-gate` box, so its
vertically-centered heading/body land well below the actual visible
viewport — cut off exactly as in the reporter's screenshot, with the large
blank area above being the top portion of the oversized box.

## Fix

### 1. Auto-fit tile sizing — `useFitTileSize` hook

New hook `src/hooks/useFitTileSize.js`, following the existing
`useHeaderHeightVar` pattern (`ResizeObserver` → CSS custom property) already
used in this codebase:

- Takes a ref to the board's flex-filling wrapper, plus `{ columns, rows,
  gap }`.
- On mount and on every resize, reads the wrapper's rendered `width`/`height`
  and computes `tileSize = floor(min((width - gap*(cols-1))/cols, (height -
  gap*(rows-1))/rows))`.
- Clamps to **[120, 140]** and publishes it as `--memory-board-tile-size` on
  the wrapper element directly (same direct-DOM-write approach as
  `useHeaderHeightVar`, avoiding an extra React re-render per resize tick).
- No-ops (leaves the CSS fallback in place) if the measured box is zero-sized
  (e.g. jsdom, or before first layout) or `columns`/`rows` is invalid.

**Why [120, 140]:** 120px is an *existing* requirement — an e2e test in
`e2e/animal-memory-match.spec.js` (issue #58) already asserts tiles must be
≥120px on a landscape phone, as a toddler tap-target minimum. 140px is
today's desktop/tablet default (issue #58's cap). This fix shrinks tiles only
when there's genuinely not enough room, never below the established tap
target, and never grows them past today's look on generously large screens.
If a viewport is so constrained that even 120px tiles don't fit, the page
scrolls — the same accepted fallback already used for long results screens
(issue #55/#61, `intro-results-height.spec.js`). This is a deliberate
non-goal: the fix caps the *avoidable* overflow case, it does not force
content into a space too small for safe tap targets.

**Component/CSS changes:**

- `MemoryBoard.jsx`: computes `rows = Math.ceil(total / columns)` alongside
  the existing `columns`; adds a `ref` on `.memory-board`; calls
  `useFitTileSize(boardRef, { columns, rows, gap: 12 })`.
- `MemoryBoard.css`:
  - `.memory-board` becomes `display: flex; flex: 1; min-height: 0;
    align-items: center; justify-content: center;` — a flex child of `.game`
    that fills whatever vertical space is left after the prompt/timer block,
    mirroring the `.game-intro`/`.results` fix from issue #55.
  - `.memory-board__grid`'s `grid-template-columns`/`grid-template-rows`
    become `repeat(var(--memory-board-columns), var(--memory-board-tile-size,
    140px))` / `repeat(var(--memory-board-rows), var(--memory-board-tile-size,
    140px))` — explicit, equal-sized tracks in both axes (replacing
    `auto-fit`/`minmax` and the old fixed-width cap formula, both now
    subsumed by the JS-computed size).
  - `.memory-board__tile` drops `aspect-ratio: 1` (redundant once both grid
    axes share one track size) and its `font-size` becomes
    `calc(var(--memory-board-tile-size, 140px) * 0.34)` so the emoji glyph
    scales with the tile instead of staying fixed at 48px.
- `MemoryBoard.jsx` sets `--memory-board-rows` alongside the existing
  `--memory-board-columns` inline style.

### 2. Orientation overlay — collapse inert content out of flow

One CSS rule in `OrientationGate.css`:

```css
.orientation-gate__content[inert] {
  display: none;
}
```

Targets the DOM `inert` attribute already set by `OrientationGate.jsx` via
`setAttribute` — no JS changes needed. `display: none` still keeps the game
component mounted (React state preserved — the same guarantee the existing
code comment promises), it just stops the hidden content from contributing
to the flex container's height. Once collapsed, `.orientation-gate`'s box
height is driven purely by its flex-grow allocation from `.shell__content`
(exactly one screen's worth of remaining space, same as the unblocked case),
so the overlay's `inset: 0` box — and its vertically-centered content — now
matches the actual visible viewport.

## Test plan

Positive and negative cases at every applicable layer; layout/overflow
behavior isn't observable in jsdom (no real box layout), so sizing-in-practice
coverage is Playwright e2e, per the precedent set by
`intro-results-height.spec.js` and the issue #58 e2e tests.

**Unit — `src/hooks/__tests__/useFitTileSize.test.js`** (mirrors
`useHeaderHeightVar.test.js`'s `MockResizeObserver` pattern):
- Positive: computes and publishes the expected clamped tile size for a
  measured box (e.g. a box that would compute to 100px → clamped to 120px; a
  box that would compute to 300px → clamped to 140px; a box that computes to
  130px → published as-is).
- Positive: updates the property when the observed element resizes (via the
  mock's captured callback).
- Negative: does nothing (leaves any existing property untouched, doesn't
  throw) when the measured box is zero-sized.
- Negative: does nothing when `ref.current` is null (no crash before mount).
- Negative: disconnects the observer on unmount — no further writes after.

**Unit — `src/components/__tests__/MemoryBoard.test.jsx`:**
- Positive: sets `--memory-board-rows` correctly alongside the existing
  `--memory-board-columns` assertions (5×2 for 10 tiles, 4×3 for 12 tiles).
- Negative: an empty board still produces `rows >= 1` (guards `Math.ceil`
  against a divide-by-zero shape).
- Existing behavioral/a11y tests continue to pass unchanged (confirms the
  sizing change doesn't alter tile interaction/labeling).

**Unit — `src/components/__tests__/OrientationGate.test.jsx`:** existing
attribute-based tests (`inert`, `aria-hidden`) are unaffected by a CSS-only
change; no new jsdom-observable assertion is possible here (CSS isn't
computed in jsdom) — coverage for the actual layout fix lives in e2e below.

**E2E — new assertions in `e2e/animal-memory-match.spec.js`:**
- Positive: at a representative landscape-phone viewport, the full board (all
  tiles) fits without page scroll (`document.documentElement.scrollHeight <=
  window.innerHeight`), mirroring `intro-results-height.spec.js`'s
  `fitsOneScreen` helper.
- Negative: confirm the *existing* issue #58 test (tiles ≥120px on a
  landscape phone) still passes unchanged — proves the shrink logic respects
  the tap-target floor rather than regressing it.
- Existing "cards grow to fill more of a tablet screen" and "board stays
  centered" tests continue to pass unchanged (confirms desktop/tablet sizing
  is unaffected by the new clamp, since 140px is still the effective cap
  there).

**E2E — new assertions in `e2e/orientation-gate.spec.js`:**
- Positive: at a portrait-phone viewport (landscape-required game), the
  overlay heading *and* body text are both fully within the viewport
  (`toBeInViewport()`), not just present in the DOM.
- Negative: the inert content wrapper (`.orientation-gate__content[inert]`)
  is not visible (`toBeHidden()`) while blocked — confirms it's actually
  collapsed, not merely non-interactive.

**Visual regression:** `components-memoryboard--default`,
`games-animalmemorymatchgame--default`, `components-orientationoverlay--*`
baselines in `e2e/visual.spec.js-snapshots/` will change (Storybook has no
`.game`/shell flex ancestor, so the flex-fill behavior is inert there and
sizing falls back to the `140px` CSS default) — regenerate with
`npx playwright test visual.spec.js --update-snapshots` and review the diff.

**Manual/dev-server verification:** re-screenshot the memory match game at a
landscape-phone viewport (confirm no scroll, tiles still comfortably tappable)
and the orientation overlay at a portrait-phone viewport (confirm the full
"Turn it sideways!" message is visible), matching the two screenshots from
the original issue report.

## Docs

- `package.json`: patch version bump.
- `src/games/animal-memory-match/manifest.json`: patch version bump (visible
  change to that game specifically).
- `CHANGELOG.md`: `### Fixed` entry for issue #104.

## Out of scope

- No change to `useMemorySession`, deck-building, match/mismatch logic, or
  any non-CSS/layout game behavior.
- No change to the `memoryPairs` setting's range or the admin UI.
- No change to `idealColumns`' column-count algorithm — this fix only adds a
  height-aware size to the tiles it already decides to lay out in that many
  columns.
- No mobile-viewport-unit change (`dvh`/`svh`) to `.shell`'s `min-height:
  100vh` — the overlay bug's root cause is the inert-content flex-height
  inflation, not a mobile-browser-chrome viewport-unit quirk, so that specific
  fix isn't needed here (unlike issue #55, which explicitly ruled it out for
  the same reason).
- No change to `OrientationGate`'s JS/focus-management logic — the fix is a
  single CSS rule targeting the attribute it already sets.
