# Better Game Tag Filter/Search (Issue #103)

## Problem

Issue #103 ("UI - Better Game Tag Filter/Search") has no body — brainstormed
with the reporter to pin down scope. The concrete pain point: the dashboard's
tag strip (`Dashboard.jsx`) is a flat row of pills that wraps to multiple
lines once there are enough tags, which reads as messy. `docs/ENHANCEMENTS.md`
lists ~10 planned quiz games and a memory game, each adding new tags, so this
gets worse over time, not better — today's 6 games / ~8 tags are close to the
smallest this problem will ever be.

Today's dashboard also has **no text search at all** — a parent can only find
a game by scanning cards or filtering to a single category tab.

## Current state

`Dashboard.jsx` tracks one `activeTag` string (`'all'` or exactly one tag).
Tag pills render with `role="tab"`/`role="tablist"` (`aria-selected`,
`aria-controls` → a `tabpanel`) — the ARIA Tabs pattern, which mandates
*single* selection. When `activeTag === 'all'`, games render grouped into
`buildSections()` category headings; otherwise a flat `.dashboard__grid` of
matches. `useGameTags(manifests)` (unchanged by this work) already computes
`{ tagMap, allTags }` from manifest tags + admin overrides.

## Design

### State model

Replace `activeTag` with two independent pieces of state:

- `searchText` (string) — matched case-insensitively against each game's
  **translated name only** (not description — keeps results predictable and
  easy to scan).
- `selectedTags` (`Set<string>`) — toggled per-pill. **AND logic**: a game
  must carry every selected tag, not just one — this only matters once a
  parent selects more than one tag, and AND is the intuitive reading of
  stacking filters ("animals" + "sounds" narrows, it doesn't broaden).

A game is visible when it matches `searchText` (if non-empty) **and** carries
all `selectedTags` (if non-empty).

**View mode:**
- `searchText === '' && selectedTags.size === 0` → unchanged from today:
  category-grouped sections via `buildSections()`.
- Otherwise → flat grid of matches (today's single-tag behavior, generalized).
  An empty result set shows a "no games match" message plus a **Clear
  filters** action; the same action also appears any time a filter is active,
  as a fast reset.

**Tag pills shown** are computed from games matching `searchText` only (not
narrowed by `selectedTags`) — standard faceted-filter behavior, so picking one
tag doesn't hide the other tags still worth offering.

**The standalone "All" pill is removed.** With multi-select, "no tags
selected" already means "All", and a pill that's mutually exclusive with every
other pill doesn't fit a multi-select toggle model. **Clear filters** replaces
its one-click-reset role.

### Tag row overflow (collapse/expand)

Per-pill width measurement (`useFitTileSize`-style pixel math) is overkill
here. Instead:

- Pills render in a `flex-wrap` row as always. A **collapsed** CSS state caps
  the row at one line via `max-height` (a CSS constant derived from the
  pill's own fixed height) + `overflow: hidden` — no JS needed for the cap
  itself.
- `useTagRowOverflow(containerRef, deps)` (new hook, `src/hooks/`) answers
  only "does this overflow one row?" by comparing `scrollHeight` (always
  reports the full, un-clipped content height regardless of `overflow:
  hidden`) against the known one-row height. Re-measures via `ResizeObserver`
  on the container (catches viewport/width changes) and on `deps` changes
  (tag list changes — admin tag overrides, locale switch changing label
  widths).
- If overflowing, a trailing **"+N more"** button appends to row 1; clicking
  it sets `max-height: none` and the button becomes **"Show less"**.
- `selectedTags` are always sorted to the front of the pill list, so an active
  filter is never hidden behind the collapse.

With today's small tag count the row won't overflow, so the "+N more" button
simply never renders — no visible change until the catalog grows enough to
need it.

### Components & files

New:
- `src/components/TagFilterBar.jsx` — extracted from `Dashboard.jsx`'s inline
  pill markup. Props: `allTags`, `selectedTags`, `onToggleTag`, `tagLabel`.
  Owns collapse/expand state and renders the pill row + overflow toggle.
- `src/hooks/useTagRowOverflow.js` — overflow detection described above.

Modified:
- `src/components/Dashboard.jsx` — new state model, search `<input>`, wiring
  to `TagFilterBar`.
- `src/components/Dashboard.css` — search input styles, pill collapse CSS,
  tap-target height bump (see Accessibility).

### Accessibility

Bundled fixes since this touches the same markup (per house practice of
improving code you're already working in):

- Tag pills switch from `role="tab"`/`role="tablist"` to `role="group"` +
  plain toggle `<button aria-pressed>`. This isn't cosmetic — the ARIA Tabs
  pattern *requires* single selection, so it was already the wrong pattern
  once multiple pills can be active; `role="group"` + `aria-pressed` is the
  correct pattern for independent multi-select toggles.
- `docs/ENHANCEMENTS.md`'s open **AU-7** ("`.dashboard__tab` is ~33px tall")
  turns out to be stale: verified in a real browser against the running dev
  server, tabs are already 64×64px — the global `button { min-height: 64px;
  min-width: 64px }` rule (present since project scaffold) already applies,
  which the audit's padding+font-size arithmetic didn't account for. No CSS
  change needed for tap target size; this work just removes the stale
  ENHANCEMENTS.md entry (see Docs section) since the pill markup is being
  restructured here anyway.
- Search input gets a real (visually-hidden) `<label>`, not just `aria-label`,
  matching how the rest of the app labels form controls.
- A polite `aria-live` region (living in `Dashboard.jsx`, next to the grid)
  announces the result count on filter changes (e.g. "3 games found"),
  matching `QuizGameShell`'s existing correct/wrong live-region convention.
  It only updates while a filter is active (the flat-grid view) — the
  unfiltered section view never announces a count, so there's no noisy
  announcement on initial page load.

### i18n

New keys in `src/i18n/{en,es,pl}.json` under `dashboard`: `searchLabel`,
`searchPlaceholder`, `noResults`, `clearFilters`, `moreTags` (pluralized —
`_one`/`_other` for en/es, all four CLDR forms for pl, per
`docs/TESTING.md`'s pluralization convention), `showLessTags`, `resultsCount`
(pluralized). Removed: `dashboard.tabAll`. Renamed: `dashboard.tabsLabel` →
`dashboard.tagsGroupLabel` (the container is a `group`, not a `tablist`,
after the accessibility fix above). es/pl translations are written as part of
this work and flagged for native-speaker review.

## Testing

- `useTagRowOverflow.test.js` (new) — mirrors `useFitTileSize.test.js`'s
  `MockResizeObserver` pattern. Positive: detects overflow, detects
  non-overflow, recomputes on resize and on `deps` change. Negative: null
  ref, zero-height/pre-layout container, no further writes after unmount.
- `TagFilterBar.test.jsx` (new) — positive: toggle a tag on/off, selected
  tags sort to front, "+N more" appears and expands, keyboard operability.
  Negative: zero tags renders nothing, a tag count that fits one row renders
  no overflow toggle.
- `Dashboard.test.jsx` (rewritten) — existing `role="tab"`/"All" tests
  rewritten for `role="group"`/multi-select. New: search matches by name
  (positive) and produces the empty state on no match (negative); search +
  tag selection combine with AND; Clear filters resets both; section view
  renders only when both `searchText` and `selectedTags` are empty; `jest-axe`
  still passes with the new roles.
- `e2e/` visual-regression baselines covering the tab strip need
  regenerating.

## Docs

- `README.md`'s "Game Categories & Tags" section — rewrite for search,
  multi-select, and the collapse behavior.
- `docs/ENHANCEMENTS.md` — remove the AU-7 entry (verified already
  satisfied, not fixed by this work — see Accessibility above).
- `CHANGELOG.md` — new entry; bump `package.json` version per repo
  versioning convention.
