# Parent Dashboard Enhancements Design

**Date:** 2026-07-08
**Status:** Approved
**Issue:** [#35 — Dashboard - Enhanced Parents Dashboard](https://github.com/jasonkryst/ThePlayground/issues/35)
**Features:** Interactive Date-Range Filter · Heatmap Month Labels

---

## Overview

Issue #35 lists three items. One — "game-name labels in charts" — already shipped in commit `53f9a08` (2026-07-05), before this issue was filed: `Legend`/`Tooltip`/streak table/missed-items panel all show real manifest names with `gameId` fallback. This design covers only the two remaining items, both scoped to `src/parent/ParentDashboard.jsx`:

1. **Interactive date-range filter** — presets (7/30/90 days/All time) plus a custom from–to range, applying to every section of the dashboard (Score Trend, Response Time, Streak History, Play Calendar heatmap, Missed Items) and to CSV export. Defaults to "All time"; the selection persists across visits via the existing settings adapter.
2. **Heatmap month labels** — GitHub-contribution-graph-style month labels above the week columns. As part of this, the heatmap grid resizes to span exactly the selected date range instead of always showing a fixed trailing 13 weeks.

No storage adapter changes beyond a new `DEFAULT_SETTINGS` key — this reuses the existing generic `getSettings`/`saveSettings` methods. No game manifests are touched.

---

## Architecture

### New files

```
src/
  utils/
    dateRangeUtils.js               — resolvePresetRange, filterScoresByRange, buildHeatmapCells (range-aware), computeMonthLabels
    __tests__/dateRangeUtils.test.js
  parent/
    DateRangeFilter.jsx             — preset buttons (radiogroup) + custom from/to <input type="date">
    DateRangeFilter.css
    __tests__/DateRangeFilter.test.jsx
```

### Modified files

```
src/
  parent/
    ParentDashboard.jsx             — owns range state via useSettings; filters scores before computing all derived data; renders <DateRangeFilter>; CSV export respects the filter
    ParentDashboard.css             — heatmap month-label row layout
    __tests__/ParentDashboard.test.jsx
  utils/
    dashboardUtils.js               — computeStreakHistory gains an optional `anchor` param (default `new Date()`); SessionHeatmap's cell-building moves into dateRangeUtils.js as buildHeatmapCells becomes range-aware (was previously local to ParentDashboard.jsx, hardcoded to a trailing 13 weeks)
    __tests__/dashboardUtils.test.js
  storage/
    adapter.js                      — DEFAULT_SETTINGS gains parentDateRange
  i18n/
    en.json                         — new parent.dateRange* keys
README.md                           — new "Parent Analytics Dashboard" subsection under Dashboard Features
docs/TESTING.md                     — note on testing native date inputs
CHANGELOG.md                        — new entry
package.json                        — version bump
```

### Settings schema addition

```js
parentDateRange: { preset: 'all', start: null, end: null }
// preset: '7d' | '30d' | '90d' | 'all' | 'custom'
// start/end: 'YYYY-MM-DD' strings — only meaningful when preset === 'custom'
```

Backward-compatible: an absent key falls back to the default via the existing `{ ...DEFAULT_SETTINGS, ...stored }` merge in `localStorageAdapter.getSettings()`. No migration needed.

---

## Feature 1: Interactive Date-Range Filter

### `dateRangeUtils.js` — `resolvePresetRange` / `filterScoresByRange`

```js
resolvePresetRange(preset, referenceDate = new Date())
// '7d' | '30d' | '90d' → { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' (referenceDate) }
// 'all', or any unrecognized value → { start: null, end: null }  (unbounded; never throws)

filterScoresByRange(scores, { start, end })
// Inclusive date-string comparison against score.date.
// null start/end = unbounded on that side.
// Scores missing `date` are excluded, consistent with dashboardUtils' existing compute*
// functions, which already skip date-less records.
```

### `DateRangeFilter` component

- Preset buttons: `role="radiogroup"` / `role="radio"`, styled consistently with `Dashboard`'s existing `dashboard__tabs` tab-strip pattern (`role="tablist"`/`role="tab"`).
- Two native `<input type="date">` fields for custom start/end, below the presets.
- Picking a preset clears any custom dates and sets `preset` to that value. Editing either date input switches `preset` to `'custom'` and removes preset-button highlighting.
- **Validation:** if `end < start`, the custom inputs show an inline error (`parent.dateRangeInvalid`) and the *previous valid range remains active* — no partial or broken filter state is ever propagated to `onChange`.
- Controlled component: receives `{ preset, start, end }` + `onChange`; holds no internal persistence. `ParentDashboard` owns the source of truth via `useSettings()`.

### `ParentDashboard` integration

```js
const { settings, updateSetting } = useSettings()
const range = settings.parentDateRange
const resolvedRange = range.preset === 'custom'
  ? { start: range.start, end: range.end }
  : resolvePresetRange(range.preset)

const filteredScores = useMemo(() => filterScoresByRange(scores, resolvedRange), [scores, resolvedRange])

const scoreTrend    = useMemo(() => computeScoreTrend(filteredScores), [filteredScores])
const responseTimes = useMemo(() => computeResponseTimes(filteredScores), [filteredScores])
const streakAnchor  = resolvedRange.end ? new Date(resolvedRange.end) : new Date()
const streakHistory = useMemo(() => computeStreakHistory(filteredScores, bestStreaks, streakAnchor), [filteredScores, bestStreaks, streakAnchor])
const heatmapCells  = useMemo(() => buildHeatmapCells(computeSessionHeatmap(filteredScores), resolvedRange), [filteredScores, resolvedRange])
const missedItems   = useMemo(() => computeMissedItems(filteredScores), [filteredScores])

function handleExport() {
  const csv = buildCsvContent(filteredScores)   // export now respects the active filter
  // ...
}

function handleRangeChange(next) {
  updateSetting('parentDateRange', next)
}
```

`computeStreakHistory(scores, bestStreaks, anchor = new Date())` — the `last7`/`last30` cutoffs become `anchor - 7d` / `anchor - 30d` instead of hardcoded `Date.now()`, re-anchoring the windows to the end of the selected range so a past custom range still shows meaningful data. `allTime` continues to read from `bestStreaks` (already independent of the `scores` argument), so "All-time best" stays genuinely all-time regardless of the active filter.

**Known, accepted side-effect:** `computeStreakHistory` derives its game list from the *filtered* sessions array. A game with zero sessions in the selected range won't have a row in Streak History even though its all-time best still exists (visible again once the range widens). This is an expected consequence of every section reacting to the filter, not a bug to work around.

---

## Feature 2: Heatmap Month Labels + Range-Resized Grid

### Grid resizing — `buildHeatmapCells(heatmapData, { start, end })`

Replaces the current hardcoded trailing-13-week window (`HEATMAP_WEEKS = 13` in `ParentDashboard.jsx`) with a range-driven grid, and moves out of `ParentDashboard.jsx` into `dateRangeUtils.js` so it can be unit-tested alongside the other range logic:

- **Preset or custom range:** grid spans `start`→`end`, aligned outward to full weeks (back to the preceding Sunday, forward to the following Saturday) — the same alignment convention the current code already uses, just parameterized instead of anchored to "today."
- **`all`:** `start` = earliest date present in `heatmapData`; `end` = today. If there is no data at all, falls back to a small today-anchored grid rather than rendering nothing.
- A 7-day range renders as a ~1–2 column strip; `all` on a long history renders as many columns as needed. No 13-week cap.

### Month labels — `computeMonthLabels(cells)`

```js
computeMonthLabels(cells)
// Groups cells into week-columns (7 per column, same order as the grid), walks
// columns left-to-right, and returns a label at the index of the first column
// whose first cell's month differs from the previously-labeled column's month.
// The first column is always labeled.
// → Array<{ columnIndex: number, label: string }>
```

`label` is the localized short month name via `Intl.DateTimeFormat(locale, { month: 'short' })`, keyed off the app's active i18n locale — not a hardcoded English array — consistent with the app's existing locale-switching support.

### Layout

`.heatmap__scroll` (the existing horizontally-scrolling container) gains a `.heatmap__months` row stacked above `.heatmap__grid`, so month labels scroll in sync with the grid on narrow screens. The `.heatmap__days` gutter (S/M/T/W/T/F/S — currently fixed, non-scrolling) gets a spacer matching the month row's height so day labels stay vertically aligned with grid row 1, not the month row. Columns without a label render an empty placeholder to preserve alignment with the grid below.

---

## i18n

New keys under the existing `parent` namespace in `src/i18n/en.json`:

```
parent.dateRangeHeading      — "Date Range"
parent.dateRange7d           — "7 days"
parent.dateRange30d          — "30 days"
parent.dateRange90d          — "90 days"
parent.dateRangeAll          — "All time"
parent.dateRangeFrom         — "From"
parent.dateRangeTo           — "To"
parent.dateRangeInvalid      — "End date must be on or after the start date."
parent.dateRangeAriaLabel    — "Filter dashboard by date range"
```

Month labels use `Intl.DateTimeFormat`, not a translation key, so they automatically follow the active locale without a manual key per language.

---

## Accessibility

- Preset button group uses `role="radiogroup"` with each option `role="radio"` / `aria-checked`, supporting arrow-key navigation consistent with native radio-group semantics.
- Custom date inputs use native `<input type="date">` with associated `<label>` elements (`parent.dateRangeFrom` / `parent.dateRangeTo`) — no custom date-picker widget, so browser/AT-native date semantics and keyboard support are inherited for free.
- Validation error is exposed via `aria-live="polite"` text near the inputs, not color alone.
- The heatmap's existing `role="img"` + `aria-label` pattern is preserved; month labels are decorative (`aria-hidden="true"`, matching the existing day-of-week label treatment) since the underlying data is already conveyed through each cell's `title` tooltip and the hidden data-table alternative pattern used elsewhere on this page.
- Every new/changed state (filter applied, validation error shown, custom range active) is covered by an `axe` scan in the component tests, matching the existing pattern in `ParentDashboard.test.jsx`.

---

## Testing

Every unit below pairs a positive case with a negative/edge case, not just the happy path.

### `dateRangeUtils.test.js` (unit)

**`resolvePresetRange`**
- Each preset (`7d`/`30d`/`90d`) returns the correct start/end relative to a fixed reference date
- `'all'` returns `{ start: null, end: null }`
- Unrecognized preset string falls back to unbounded rather than throwing

**`filterScoresByRange`**
- Inclusive boundary scores (exactly on `start`/`end`) are kept
- Scores outside the range are excluded
- Empty scores array returns `[]`
- Scores missing `date` are silently excluded, not crashing

**`buildHeatmapCells` (range-aware)**
- 7-day range produces a 1–2 column grid
- `all` with data spans from the earliest scored date to today
- `all` with zero scores still returns a small, non-crashing grid
- Malformed range (`end` earlier than `start`) returns an empty cell array rather than looping indefinitely

**`computeMonthLabels`**
- A range crossing a month boundary produces two labels at the correct columns
- A range entirely within one month produces exactly one label, at the first column
- Empty cells array returns `[]` without throwing

### `dashboardUtils.test.js` (updated)

**`computeStreakHistory` with `anchor`**
- Windows compute relative to a past `anchor`, not `Date.now()`
- An anchor date with zero in-window sessions returns `0`, not `undefined` or a throw
- Omitting `anchor` preserves today's existing default behavior (regression guard)

### `DateRangeFilter.test.jsx` (component)

- Clicking each preset button calls `onChange` with the correct `{ preset, start, end }`
- Entering valid custom from/to dates calls `onChange` with `preset: 'custom'`
- Entering an end date before the start date shows the inline error and does **not** call `onChange`
- Clearing a custom date after a validation error recovers cleanly
- a11y: radiogroup keyboard navigation (arrow keys) + `axe` scan

### `ParentDashboard.test.jsx` (updated)

- Selecting "Last 7 days" narrows Score Trend/Response Time/Missed Items to in-range sessions only
- CSV export reflects the active filter (assert on `buildCsvContent` output/blob content, not just that the click fires)
- A persisted `parentDateRange` setting is restored on mount (mock `useSettings`)
- A range with zero matching scores shows each section's existing empty-state messaging instead of crashing
- Regression: real game names still render in Legend/Tooltip/streak table/missed items (the already-shipped behavior this design deliberately does not re-implement)
- a11y: `axe` scan with a non-default filter applied

### E2E (Playwright — extend `e2e/dashboard.spec.js` or add `e2e/parent-dashboard.spec.js`)

- Default load shows all-time data; selecting "7 days" visibly changes the charts and heatmap
- Custom range via date inputs updates the dashboard and persists across a reload
- Invalid custom range (end before start) shows the inline error and leaves the previously-valid chart data on screen
- Visual regression snapshot update for the heatmap's new month-label row

---

## Documentation Updates

- **`README.md`** — new `### Parent Analytics Dashboard` subsection under "Dashboard Features." No dedicated feature-level documentation currently exists for this page (only a one-line file-tree mention), so this closes that gap in addition to documenting the new filter: covers all five existing sections (Score Trend, Response Time, Streak History, Play Calendar, Missed Items), the date-range filter (presets + custom, persisted per-browser), and the heatmap's month labels + range-resizing behavior.
- **`docs/TESTING.md`** — short addition noting native `<input type="date">` fields should be driven with `fireEvent.change(input, { target: { value: 'YYYY-MM-DD' } })` rather than `userEvent.type`, mirroring the existing fake-timer/`fireEvent` guidance already documented for timed feedback.
- **`CHANGELOG.md`** — new entry for this release.
- **`package.json`** — version bump (dashboard-level feature, not tied to a specific game's manifest).

---

## Implementation order

1. **`dateRangeUtils.js` + tests** — pure functions, zero UI risk, unblocks everything else
2. **`computeStreakHistory` anchor param + tests** — small, isolated change to existing utility
3. **`DateRangeFilter` component + tests** — standalone UI piece, testable in isolation before wiring in
4. **`ParentDashboard` integration** — wire the filter, range-aware heatmap, and CSV export together; update existing tests
5. **Heatmap month-label layout/CSS** — visual polish once the range-resizing plumbing is in place
6. **Docs, changelog, version bump**

---

## Out of scope

- Server-side or cross-device sync of the selected range (persistence is local-storage-backed, same as all other settings)
- Saved/named custom ranges (e.g., "This school term") — only one active range at a time
- Comparison mode (e.g., "this 30 days vs. previous 30 days")
- Changing the Streak History table's column *set* under a filter (kept as three columns per your decision — re-anchored, not replaced)
