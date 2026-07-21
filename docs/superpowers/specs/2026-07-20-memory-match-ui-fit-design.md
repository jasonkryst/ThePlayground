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
  and computes:
  ```
  widthPerTile  = (width  - gap * (columns - 1)) / columns
  heightPerTile = (height - gap * (rows - 1)) / rows
  rawSize       = min(widthPerTile, heightPerTile)
  tileSize      = min(MAX_TILE_PX, widthPerTile, max(MIN_TILE_PX, floor(rawSize)))
  ```
- Publishes `tileSize` as `--memory-board-tile-size` on the wrapper element
  directly (same direct-DOM-write approach as `useHeaderHeightVar`, avoiding
  an extra React re-render per resize tick).
- No-ops (leaves the CSS fallback in place) if the measured box is zero-sized
  (e.g. jsdom, or before first layout) or `columns`/`rows` is invalid.

**Why this formula, and why [48, 140] (revised from an initial [120, 140]
draft — see below):**

Real measurement against the running app (Playwright at 844×390, a landscape
phone — the same class of device as the reporter's screenshot) showed that
chrome alone (header 102px + footer 42px + prompt text 72px + `.game`
padding/gaps 96px ≈ 289px) leaves only **~101px** for a 2-row board. Two rows
even at a 120px floor need 252px — 2.5× more than available. **Keeping a
120px tap-target floor would make this fix a no-op for phone-sized landscape
viewports specifically** — the exact device in the bug report — only helping
larger tablet/laptop windows. Confirmed with the reporter: the priority is
"do the best we can between preventing a scroll and showing all the tiles on
screen without scrolling," i.e. full-board visibility outranks the
120px tap-target guarantee when they conflict.

So the floor is revised down to **48px** — a sanity guard against a
degenerate render (matches this app's *other* existing minimum-size
convention, `.shell__back`/`.shell__nav-link`'s `min-width/height: 48px`,
used for lower-stakes repeated UI elements — distinct from issue #58's 120px
"toddler tap target for the main play surface" number, which this fix
intentionally supersedes at the tightest viewports). 140px remains the
existing desktop/tablet cap (issue #58), so generously large screens are
visually unchanged.

`Math.min(MAX_TILE_PX, widthPerTile, ...)` — with `widthPerTile` always
present as an explicit outer clamp — makes horizontal overflow mathematically
impossible regardless of the 48px floor: `tileSize` can never exceed
`widthPerTile`, and board width is `columns × tileSize + gaps ≤ columns ×
widthPerTile + gaps = width` by construction. This is what lets column
selection stay a fixed, simple `idealColumns(total)` (unchanged from today)
rather than needing a width-responsive column-count search — width safety is
structural, not a search outcome.

**Verified outcomes (real numbers, 5×2 board, gap 12px):**
- 844×390 (landscape phone): available height ~101px for 2 rows →
  `rawSize` ≈44 → floored to the 48px guard → board height 108px, fits within
  ~101px with only ~7px residual (vs. ~191px of scroll today) — not a
  perfect fit, but a ~96% reduction in overflow.
- 667×375 (the existing, tighter issue #58 e2e viewport): `rawSize` ≈37 →
  floored to 48px → board height 108px vs. ~86px available, ~22px residual
  (vs. today's much larger overflow at fixed 140px tiles). **This drops
  below the existing test's `≥120px` assertion** — see Test plan below for
  the corresponding, disclosed test update.
- 1024×768 (tablet, issue #58's own test viewport): available height ~479px
  for 2 rows → `rawSize` ≈233, clamped down to the 140px cap — **identical
  to today's behavior**, confirming desktop/tablet is unaffected.

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
- Positive: a generously large box (e.g. 2000×1000) clamps to the 140px cap.
- Positive: a tight box (e.g. 500×200, 5×2) floors to 48px rather than the
  raw computed value.
- Positive: a mid-range box (e.g. 700×300, 5×2 → raw ≈130px) publishes the
  computed value as-is, unclamped.
- Negative: a box tight enough on *width* that `widthPerTile` itself is below
  48px (e.g. 200×300, 5×2 → widthPerTile ≈30px) publishes the smaller
  width-derived value, not the 48px floor — proves the floor never overrides
  the width-safety clamp (no horizontal overflow, ever).
- Positive: updates the property when the observed element resizes (via the
  mock's captured callback).
- Negative: does nothing (leaves any existing property untouched, doesn't
  throw) when the measured box is zero-sized.
- Negative: does nothing when `ref.current` is null (no crash before mount).
- Negative: does nothing when `columns`/`rows` is invalid (e.g. 0) — guards
  the divide-by-zero shape.
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
- Positive: at a viewport tall enough for the fit formula to land at or
  under the 140px cap without hitting the floor (e.g. a modest landscape
  laptop window, ~900×600 — comfortably above the ~580px height needed for
  the default 5×2 board at 140px tiles), the full board fits without page
  scroll
  (`document.documentElement.scrollHeight <= window.innerHeight`), mirroring
  `intro-results-height.spec.js`'s `fitsOneScreen` helper.
- Positive: at the landscape-phone viewport from the original bug report
  (~844×390), page overflow (`scrollHeight - innerHeight`) is dramatically
  smaller than before the fix (assert it's under some small bound, e.g.
  ≤30px, rather than the ~191px it is today) — proves the fix meaningfully
  helps even where it can't achieve a perfect fit.
- Existing "cards grow to fill more of a tablet screen" and "board stays
  centered" tests continue to pass unchanged (confirms desktop/tablet sizing
  is unaffected, since 140px is still the effective cap there).

**Updated existing test in `e2e/animal-memory-match.spec.js` (disclosed
behavior change):** the issue #58 test asserting tiles are ≥120px at
667×375 no longer holds — at that viewport height, fitting the board without
scrolling requires tiles below 120px (see "Verified outcomes" above). Update
that assertion to the new, lower sanity floor (48px) and add a code comment
noting issue #104 revises the 120px guarantee specifically at this extreme
aspect ratio, in favor of full-board visibility. The "no horizontal overflow"
half of that same test is kept as-is and must still pass (width-safety is
structural per the formula, not just a floor increase).

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

**Manual/dev-server verification:** re-screenshot the memory match game at the
landscape-phone viewport from the report (confirm the board is fully visible
or nearly so, a large improvement over today's scroll — tiles will be
noticeably smaller than 120px at this exact size, which is the accepted
trade-off) and at a more generous landscape window (confirm tiles stay at a
comfortable size, unchanged from today). Also re-screenshot the orientation
overlay at a portrait-phone viewport (confirm the full "Turn it sideways!"
message is visible), matching the two screenshots from the original issue
report.

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
