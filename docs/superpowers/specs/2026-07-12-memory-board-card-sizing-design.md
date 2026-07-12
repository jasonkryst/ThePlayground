# Animal Match — dynamic, larger card sizing (Issue #58)

## Problem

Issue #58: "Can the card sizes be set to be more dynamic within the layout.
There seems to be too much white space within the layout. I am open minded
to number of cards within a row." Follow-up from the reporter: the cards are
also too small for a toddler/general user — this is as much an accessibility
sizing issue as a whitespace one.

Confirmed visually (Playwright screenshots against the dev server,
`/game/animal-memory-match`, default 5-pairs board):

- **1024×768:** ~112px cards, all packed into the top ~200px of the screen —
  the remaining ~70% of the viewport is empty.
- **768×1024 (tablet — this app's primary target device per the README):**
  same ~112px cards, same dead space below. This is the worst case.
- **375×667 (phone):** cards wrap to 3 columns × 4 rows for 10 tiles, and the
  last row is a single isolated tile — a second, independent whitespace bug
  distinct from the "too much space" complaint on wide screens.

## Root cause

The grid lives in `src/components/MemoryBoard.css` — a shared component
(currently used only by `animal-memory-match`, but not game-specific).
Three compounding issues:

1. `.memory-board__grid { max-width: 560px; }` hard-caps the grid at a fixed
   pixel width regardless of viewport. On any screen wider than ~560px
   (every tablet and desktop), the excess width is simply unused.
2. `.memory-board__tile` sizing floor (`minmax(90px, 1fr)`) is well below the
   card size this app already establishes elsewhere for tap targets —
   `.game__choice { min-height: 120px }` in `ColorMatchGame.css`,
   `CharacterMatchGame.css`, and `AnimalSoundsGame.css`.
3. `AnimalMemoryMatchGame` (`src/games/animal-memory-match/index.jsx`) never
   adopted the shared `.game` page wrapper (`src/components/GameLayout.css`)
   that every other game uses for `padding: 24px 16px`. Its root
   `<div className="memory-game">` has no rule of its own providing padding,
   so cards currently render flush to the viewport edge on phones —
   confirmed via computed styles (`padding: 0px`, tile `rect.left === 0`).

Separately, CSS Grid's `auto-fit` sizing is inherently viewport-width-driven,
not tile-count-aware: at some widths the number of columns it picks doesn't
evenly divide the tile count, leaving a sparse, off-center last row (the
lone-tile-at-375px case above). This is latent in the current CSS too, just
masked by how small the cards already are.

## Fix

**1. Adopt the shared page wrapper.** Change `AnimalMemoryMatchGame`'s root
`className` from `"memory-game"` to `"game memory-game"` (keeps the existing
`.memory-game__*` BEM classes for its own question/progress text, adds the
same `.game` padding/gap/centering every other game already gets). Remove
`.memory-game__question`'s own `margin-bottom: 1rem`, now redundant with
`.game`'s `gap: 24px`.

**2. Raise the tile floor and icon size.** `minmax(90px, 1fr)` →
`minmax(120px, 1fr)`, matching the app's existing 120px "big card" tap-target
convention. Tile emoji `font-size: 2.5rem` → `3rem` (48px), matching
`.game__choice`'s 48px icon convention, so the glyph stays proportional on a
larger card. Gap and other tile visuals (flip animation, mismatch cross,
matched wiggle) are unchanged.

**Confirmed trade-off (reporter approved: prioritize card size):** at this
floor, phones in the common 360–414px range fit 2 columns instead of today's
3 — e.g. a 10-tile board becomes 2×5 instead of an uneven 3-then-4. Boards
get taller and may scroll more on phones; cards are significantly bigger and
easier to tap. Tablet/desktop are unaffected by this trade-off (see below).

**3. Replace the fixed 560px cap with a tile-count-aware cap.** `MemoryBoard`
computes the largest "square-ish" column count that evenly divides the
current tile count — no remainder, so no sparse last row at the widths where
this cap is actually the binding constraint:

```js
function idealColumns(count) {
  if (count <= 1) return 1
  let cols = Math.ceil(Math.sqrt(count))
  while (count % cols !== 0) cols++
  return cols
}
```

For this game's real tile counts (`2 × memoryPairs`, pairs ∈ {3,4,5,6}):
6→3, 8→4, 10→5, 12→4 — all exact divisions.

That column count becomes an upper bound on the grid's width (not a fixed
`grid-template-columns: repeat(N, ...)` — the grid still uses
`auto-fit`/`minmax` so it degrades gracefully on narrow viewports):

```css
.memory-board__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
  width: min(100%, calc(var(--memory-board-columns) * 160px + (var(--memory-board-columns) - 1) * 0.75rem));
  margin: 0 auto;
}
```

`--memory-board-columns` is set as an inline style from `tiles.length` in
`MemoryBoard.jsx`. 160px is the comfortable target size cards grow toward on
wide screens (tablet/desktop) before the grid just stays centered instead of
stretching further — this is what fixes the tablet dead-space case (768px
viewport, 10 tiles: cap computes to `5 × 160 + 4 × 12 = 848px`, cards render
at a full 160px instead of today's 112px, and the grid centers with modest
side margins instead of a mostly-empty screen below).

On narrower viewports (below the cap), `auto-fit` + the 120px floor still
determines the actual column count responsively, same mechanism as today —
this only adds an upper bound, it doesn't replace the responsive behavior.
Note the sparse-last-row bug can still theoretically recur at in-between
viewport widths where `auto-fit`'s width-driven column count doesn't divide
the tile count evenly — accepted trade-off, since guaranteeing zero
remainder at *every* possible width would require abandoning responsive
`auto-fit` for JS-computed breakpoints, which is disproportionate to the
actual defect (a same-size shorter last row is normal/expected in grid
layouts; a single isolated tile — the confirmed case at exactly 375px — is
the specific thing this fixes, by removing it as the steady-state case at
common device widths and at the wide end entirely).

## Test plan

**Unit (`src/components/__tests__/MemoryBoard.test.jsx`):**
- Positive: for each realistic tile count (6, 8, 10, 12), the grid's
  `--memory-board-columns` inline style equals the expected ideal column
  count (3, 4, 5, 4 respectively).
- Positive: existing tests (4-tile fixture) continue to pass unchanged —
  confirms the change doesn't alter tile behavior/labeling/accessibility,
  only sizing.
- Negative/edge: 0 tiles and 1 tile don't throw and produce `columns >= 1`
  (guards the `calc()` never receiving 0 or a negative multiplier).
- Accessibility: existing `axe` check continues to pass (no new violations
  from the larger tap targets — larger targets can only help WCAG 2.5.5).

**New unit test for `idealColumns`** (colocated with `MemoryBoard.test.jsx`
or a small dedicated file, whichever the codebase convention favors when
implementing): positive cases 6→3, 8→4, 10→5, 12→4, 2→2, 1→1; negative/edge
case a prime count (7) terminates and returns a sane value (7) rather than
looping forever.

**E2E (`e2e/animal-memory-match.spec.js`):** existing tests are
behavior-level (click/flip/match), not layout-level, so no changes expected
there. Add one new assertion: at a phone-width viewport, tile bounding boxes
are at least 120px per side (positive accessibility check) and do not touch
the viewport edge (confirms the `.game` padding adoption).

**Visual regression:** `components-memoryboard--default` and
`games-animalmemorymatchgame--default` baselines in
`e2e/visual.spec.js-snapshots/` will change (bigger cards, different grid
width) — regenerate with `npx playwright test visual.spec.js --update-snapshots`
and review the diff before committing.

**Manual/dev-server verification:** re-screenshot the game at 375×667,
768×1024, and 1024×768 (the same three views used to diagnose this) and
confirm cards are visibly larger, the tablet view no longer has large dead
space below the board, and no lone tile appears in an otherwise-empty last
row at the phone width tested.

## Docs

- `package.json`: patch version bump.
- `src/games/animal-memory-match/manifest.json`: patch version bump (this is
  a visible change to that game specifically).
- `CHANGELOG.md`: `### Changed` entry for issue #58.

## Out of scope

- No change to `useMemorySession`, deck-building, match/mismatch logic, or
  any non-CSS game behavior.
- No change to the `memoryPairs` setting's range (3–6) or to the admin UI.
- No attempt to guarantee a perfectly even last row at *every* possible
  viewport width (see trade-off discussion above) — only at the two ends
  (narrow, floor-driven; wide, cap-driven) where it matters most.
- `ColorMatchGame`/`CharacterMatchGame`/`AnimalSoundsGame` choice grids are
  unaffected — they already use a fixed 2-column layout appropriate to their
  small, fixed choice counts and are not part of this issue.
