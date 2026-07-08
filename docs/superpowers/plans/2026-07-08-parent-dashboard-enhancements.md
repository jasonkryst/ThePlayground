# Parent Dashboard Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive date-range filter (presets + custom range, persisted) and month labels on the Play Calendar heatmap to `src/parent/ParentDashboard.jsx`, per [issue #35](https://github.com/jasonkryst/ThePlayground/issues/35) and `docs/superpowers/specs/2026-07-08-parent-dashboard-enhancements-design.md`.

**Architecture:** New pure-function module `src/utils/dateRangeUtils.js` handles all range math (presets, filtering, variable-width heatmap grid, month labels). A new `DateRangeFilter` component renders the controls. `ParentDashboard` filters its scores once via `filterScoresByRange` before feeding every existing chart/table, persists the selection via the existing generic settings adapter (`useSettings`), and passes a re-anchored `Date` into `computeStreakHistory` so windowed columns stay meaningful under a past custom range.

**Tech Stack:** React + Vite, Recharts, react-i18next, Vitest + React Testing Library + jest-axe, Playwright + `@axe-core/playwright`.

## Global Constraints

- No semicolons, 2-space indentation, matching the existing style in `src/utils/dashboardUtils.js` and `src/parent/ParentDashboard.jsx`.
- No new storage adapter methods — only add a key to `DEFAULT_SETTINGS` in `src/storage/adapter.js`; `localStorageAdapter.getSettings`/`saveSettings` are already generic.
- All new user-facing strings go in `src/i18n/en.json` under the existing `"parent"` namespace — never hardcode literal English strings in JSX.
- Every new component/updated test file asserts `expect(await axe(container)).toHaveNoViolations()`, matching the existing pattern in `ParentDashboard.test.jsx`.
- Tests covering fake dates/timers must not use real `Date.now()` inside assertions without a fixed reference — follow the existing `dashboardUtils.test.js` pattern of a fixed `NOW` constant computed once at module load.
- Native `<input type="date">` fields must be driven in tests with `fireEvent.change(input, { target: { value: 'YYYY-MM-DD' } })`, not `userEvent.type` (documented in `docs/TESTING.md` as part of this plan).
- Commit after each task's tests pass — small, reviewable commits, not one giant diff.

---

### Task 1: `dateRangeUtils.js` — preset resolution, score filtering, heatmap grid, month labels

**Files:**
- Create: `src/utils/dateRangeUtils.js`
- Test: `src/utils/__tests__/dateRangeUtils.test.js`

**Interfaces:**
- Produces:
  - `resolvePresetRange(preset, referenceDate = new Date()) → { start: string|null, end: string|null }`
  - `filterScoresByRange(scores, { start, end }) → Score[]`
  - `buildHeatmapCells(heatmapData, { start, end }) → Array<{ date: string, questions: number, estimatedMs: number|null }>`
  - `computeMonthLabels(cells, locale = 'en') → Array<{ columnIndex: number, label: string }>`
- Consumes: nothing from other tasks — pure functions, zero dependencies on the rest of the codebase besides `Intl.DateTimeFormat` (built-in).

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/dateRangeUtils.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  resolvePresetRange,
  filterScoresByRange,
  buildHeatmapCells,
  computeMonthLabels,
} from '../dateRangeUtils'

const REF = new Date('2026-07-08T12:00:00Z') // Wednesday

// ─── resolvePresetRange ──────────────────────────────────────────────────────

describe('resolvePresetRange', () => {
  it('resolves 7d to a 7-day inclusive window ending on the reference date', () => {
    expect(resolvePresetRange('7d', REF)).toEqual({ start: '2026-07-02', end: '2026-07-08' })
  })

  it('resolves 30d to a 30-day inclusive window ending on the reference date', () => {
    expect(resolvePresetRange('30d', REF)).toEqual({ start: '2026-06-09', end: '2026-07-08' })
  })

  it('resolves 90d to a 90-day inclusive window ending on the reference date', () => {
    expect(resolvePresetRange('90d', REF)).toEqual({ start: '2026-04-09', end: '2026-07-08' })
  })

  it('resolves "all" to an unbounded range', () => {
    expect(resolvePresetRange('all', REF)).toEqual({ start: null, end: null })
  })

  it('falls back to unbounded for an unrecognized preset instead of throwing', () => {
    expect(resolvePresetRange('nonsense', REF)).toEqual({ start: null, end: null })
  })
})

// ─── filterScoresByRange ─────────────────────────────────────────────────────

function makeScore(date) {
  return { gameId: 'animal-sounds', score: 5, total: 10, date, timestamp: 0 }
}

describe('filterScoresByRange', () => {
  it('keeps scores on or after start and on or before end (inclusive boundaries)', () => {
    const scores = [makeScore('2026-07-01'), makeScore('2026-07-05'), makeScore('2026-07-10')]
    const result = filterScoresByRange(scores, { start: '2026-07-01', end: '2026-07-05' })
    expect(result.map(s => s.date)).toEqual(['2026-07-01', '2026-07-05'])
  })

  it('excludes scores outside the range', () => {
    const scores = [makeScore('2026-06-01')]
    expect(filterScoresByRange(scores, { start: '2026-07-01', end: '2026-07-31' })).toEqual([])
  })

  it('treats a null start or end as unbounded on that side', () => {
    const scores = [makeScore('2020-01-01'), makeScore('2026-07-05')]
    expect(filterScoresByRange(scores, { start: null, end: '2026-07-05' })).toHaveLength(2)
    expect(filterScoresByRange(scores, { start: '2020-01-01', end: null })).toHaveLength(2)
  })

  it('returns an empty array for an empty scores array', () => {
    expect(filterScoresByRange([], { start: null, end: null })).toEqual([])
  })

  it('excludes scores with a missing date instead of crashing', () => {
    const scores = [makeScore(undefined), makeScore('2026-07-05')]
    const result = filterScoresByRange(scores, { start: null, end: null })
    expect(result).toEqual([makeScore('2026-07-05')])
  })
})

// ─── buildHeatmapCells ────────────────────────────────────────────────────────

describe('buildHeatmapCells', () => {
  it('builds a Sunday-to-Saturday aligned grid spanning the given range', () => {
    // 2026-07-08 is a Wednesday; 2026-07-02 is a Thursday
    const cells = buildHeatmapCells([], { start: '2026-07-02', end: '2026-07-08' })
    expect(cells[0].date).toBe('2026-06-28') // preceding Sunday
    expect(cells[cells.length - 1].date).toBe('2026-07-11') // following Saturday
    expect(cells).toHaveLength(14) // two full weeks
  })

  it('fills in real questions/estimatedMs data where present, zeros elsewhere', () => {
    const cells = buildHeatmapCells(
      [{ date: '2026-07-05', questions: 8, estimatedMs: 4000 }],
      { start: '2026-07-05', end: '2026-07-05' }
    )
    const filled = cells.find(c => c.date === '2026-07-05')
    const empty  = cells.find(c => c.date !== '2026-07-05')
    expect(filled).toEqual({ date: '2026-07-05', questions: 8, estimatedMs: 4000 })
    expect(empty).toEqual({ date: empty.date, questions: 0, estimatedMs: null })
  })

  it('derives start from the earliest data date when start is null ("all" preset)', () => {
    const heatmapData = [
      { date: '2026-06-01', questions: 1, estimatedMs: null },
      { date: '2026-07-08', questions: 2, estimatedMs: null },
    ]
    const cells = buildHeatmapCells(heatmapData, { start: null, end: '2026-07-08' })
    expect(cells[0].date <= '2026-06-01').toBe(true)
  })

  it('falls back to a small non-crashing grid when there is no data and no bounds', () => {
    const cells = buildHeatmapCells([], { start: null, end: null })
    expect(cells.length).toBeGreaterThan(0)
  })

  it('returns an empty array for a malformed range (end before start) instead of looping forever', () => {
    expect(buildHeatmapCells([], { start: '2026-07-10', end: '2026-07-01' })).toEqual([])
  })
})

// ─── computeMonthLabels ───────────────────────────────────────────────────────

describe('computeMonthLabels', () => {
  it('labels the first column and any column where the month changes', () => {
    const cells = buildHeatmapCells([], { start: '2026-06-25', end: '2026-07-08' })
    const labels = computeMonthLabels(cells, 'en')
    expect(labels[0].columnIndex).toBe(0)
    expect(labels[0].label).toBe('Jun')
    expect(labels.some(l => l.label === 'Jul')).toBe(true)
  })

  it('returns exactly one label when the whole range is within a single month', () => {
    const cells = buildHeatmapCells([], { start: '2026-07-02', end: '2026-07-08' })
    const labels = computeMonthLabels(cells, 'en')
    expect(labels).toHaveLength(1)
    expect(labels[0].columnIndex).toBe(0)
  })

  it('returns an empty array for an empty cells array instead of throwing', () => {
    expect(computeMonthLabels([], 'en')).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/dateRangeUtils.test.js`
Expected: FAIL — `dateRangeUtils.js` does not exist yet (module not found).

- [ ] **Step 3: Implement `dateRangeUtils.js`**

Create `src/utils/dateRangeUtils.js`:

```js
const MS_PER_DAY = 86_400_000

function toDateStr(date) {
  return date.toISOString().split('T')[0]
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return toDateStr(d)
}

function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return toDateStr(d)
}

function endOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + (6 - d.getUTCDay()))
  return toDateStr(d)
}

const PRESET_DAYS_BACK = { '7d': 6, '30d': 29, '90d': 89 }

/**
 * Resolves a preset key to a concrete { start, end } inclusive date-string range.
 * 'all' and any unrecognized preset resolve to an unbounded range rather than throwing,
 * so a stale/corrupt persisted setting degrades gracefully instead of crashing the page.
 */
export function resolvePresetRange(preset, referenceDate = new Date()) {
  const end = toDateStr(referenceDate)
  const daysBack = PRESET_DAYS_BACK[preset]
  if (daysBack == null) return { start: null, end: null }
  return { start: addDays(end, -daysBack), end }
}

/**
 * Filters scores to those whose `date` falls within [start, end] inclusive.
 * A null start/end is unbounded on that side. Scores without a `date` are excluded,
 * matching how dashboardUtils' compute* functions already treat date-less records.
 */
export function filterScoresByRange(scores, { start, end } = {}) {
  return scores.filter(s => {
    if (!s.date) return false
    if (start && s.date < start) return false
    if (end && s.date > end) return false
    return true
  })
}

/**
 * Builds a Sunday-aligned grid of daily cells spanning the given range.
 * heatmapData is the output of dashboardUtils.computeSessionHeatmap (sorted ascending).
 * `start: null` derives the earliest bound from heatmapData (or falls back to `end`
 * when there's no data at all); `end: null` means today.
 * Returns [] for a malformed range (resolved end before resolved start).
 */
export function buildHeatmapCells(heatmapData, { start, end } = {}) {
  const resolvedEnd   = end ?? toDateStr(new Date())
  const resolvedStart = start ?? (heatmapData[0]?.date ?? resolvedEnd)

  const gridStart = startOfWeek(resolvedStart)
  const gridEnd   = endOfWeek(resolvedEnd)
  if (gridStart > gridEnd) return []

  const dataMap = Object.fromEntries(heatmapData.map(d => [d.date, d]))
  const cells   = []
  let cur = gridStart
  while (cur <= gridEnd) {
    cells.push({ date: cur, ...(dataMap[cur] ?? { questions: 0, estimatedMs: null }) })
    cur = addDays(cur, 1)
  }
  return cells
}

const monthFormatters = {}
function monthFormatter(locale) {
  if (!monthFormatters[locale]) {
    monthFormatters[locale] = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
  }
  return monthFormatters[locale]
}

/**
 * Derives one label per week-column (7 cells each, matching the heatmap grid's
 * column order) marking where a new calendar month begins. The first column is
 * always labeled. `label` is the locale-aware short month name.
 */
export function computeMonthLabels(cells, locale = 'en') {
  const formatter = monthFormatter(locale)
  const labels = []
  let prevMonth = null
  for (let col = 0; col * 7 < cells.length; col++) {
    const cell  = cells[col * 7]
    const month = cell.date.slice(0, 7) // 'YYYY-MM'
    if (month !== prevMonth) {
      labels.push({ columnIndex: col, label: formatter.format(new Date(`${cell.date}T00:00:00Z`)) })
      prevMonth = month
    }
  }
  return labels
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/dateRangeUtils.test.js`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/dateRangeUtils.js src/utils/__tests__/dateRangeUtils.test.js
git commit -m "feat(parent): add dateRangeUtils for date-range filtering and heatmap layout"
```

---

### Task 2: `computeStreakHistory` gains an `anchor` param

**Files:**
- Modify: `src/utils/dashboardUtils.js:58-79`
- Test: `src/utils/__tests__/dashboardUtils.test.js`

**Interfaces:**
- Produces: `computeStreakHistory(scores, bestStreaks = {}, anchor = new Date()) → { [gameId]: { last7, last30, allTime } }` (adds a third optional parameter to the existing exported function — same return shape as before).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Add to `src/utils/__tests__/dashboardUtils.test.js`, inside the existing `describe('computeStreakHistory', ...)` block (after the last existing `it`, before the closing `})`):

```js
  it('computes windows relative to a past anchor instead of Date.now()', () => {
    const anchor = new Date(NOW - 20 * DAY)
    // 22 days before "now", but only 2 days before the anchor — falls inside last7
    const score  = makeScore({ peakStreak: 9, timestamp: NOW - 22 * DAY, date: fortyDaysAgo })
    const result = computeStreakHistory([score], {}, anchor)
    expect(result['animal-sounds'].last7).toBe(9)
  })

  it('excludes sessions after the anchor even if they are before real "now"', () => {
    const anchor = new Date(NOW - 20 * DAY)
    const score  = makeScore({ peakStreak: 9, timestamp: NOW - DAY }) // after the anchor
    const result = computeStreakHistory([score], {}, anchor)
    expect(result['animal-sounds'].last7).toBe(0)
    expect(result['animal-sounds'].last30).toBe(0)
  })

  it('defaults to now when anchor is omitted (regression guard for existing callers)', () => {
    const score  = makeScore({ peakStreak: 9, timestamp: NOW - DAY })
    const result = computeStreakHistory([score])
    expect(result['animal-sounds'].last7).toBe(9)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/dashboardUtils.test.js -t "anchor"`
Expected: FAIL on "excludes sessions after the anchor" — current implementation has no upper bound, so the future-relative-to-anchor session is incorrectly counted.

- [ ] **Step 3: Implement the anchor param**

In `src/utils/dashboardUtils.js`, replace the `computeStreakHistory` function (lines 58-79):

```js
export function computeStreakHistory(scores, bestStreaks = {}, anchor = new Date()) {
  const anchorMs = anchor.getTime()
  const cutoff7  = anchorMs - 7  * MS_PER_DAY
  const cutoff30 = anchorMs - 30 * MS_PER_DAY
  const gameIds  = [...new Set(scores.map(s => s.gameId))]
  const result   = {}

  for (const gameId of gameIds) {
    const sessions = scores.filter(s => s.gameId === gameId)
    const peakInWindow = (cutoff) =>
      sessions
        .filter(s => (s.timestamp ?? 0) >= cutoff && (s.timestamp ?? 0) <= anchorMs)
        .reduce((max, s) => Math.max(max, s.peakStreak ?? s.score ?? 0), 0)

    result[gameId] = {
      last7:   peakInWindow(cutoff7),
      last30:  peakInWindow(cutoff30),
      allTime: bestStreaks[gameId] ?? 0,
    }
  }
  return result
}
```

Also update the JSDoc comment directly above it to mention the new parameter:

```js
/**
 * Peak streak per game for last-7-day, last-30-day, and all-time windows,
 * measured relative to `anchor` (defaults to now). For scores that predate
 * the peakStreak field, falls back to using score (correct count) as a proxy.
 */
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/dashboardUtils.test.js`
Expected: PASS (all tests in the file, including the pre-existing ones — the added upper bound (`<= anchorMs`) does not affect any existing test since no existing fixture has a future-relative-to-`Date.now()` timestamp)

- [ ] **Step 5: Commit**

```bash
git add src/utils/dashboardUtils.js src/utils/__tests__/dashboardUtils.test.js
git commit -m "feat(parent): re-anchor computeStreakHistory windows to an optional anchor date"
```

---

### Task 3: `DateRangeFilter` component

**Files:**
- Create: `src/parent/DateRangeFilter.jsx`
- Create: `src/parent/DateRangeFilter.css`
- Test: `src/parent/__tests__/DateRangeFilter.test.jsx`
- Modify: `src/i18n/en.json` (add `parent.dateRange*` keys)

**Interfaces:**
- Consumes: nothing from other tasks (i18n keys it needs are added in this same task).
- Produces: `<DateRangeFilter range={{ preset, start, end }} onChange={(next) => void} />` default export. `onChange` is called with `{ preset: '7d'|'30d'|'90d'|'all', start: null, end: null }` for a preset pick, or `{ preset: 'custom', start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }` once both custom fields hold a valid (end >= start) pair. Never called with an incomplete or invalid custom range.

- [ ] **Step 1: Add i18n keys**

In `src/i18n/en.json`, inside the existing `"parent"` object, add these keys immediately after `"missedItemsAriaLabel"` (keep the existing keys unchanged, just add a comma after the last one and insert):

```json
    "dateRangeHeading": "Date Range",
    "dateRange7d": "7 days",
    "dateRange30d": "30 days",
    "dateRange90d": "90 days",
    "dateRangeAll": "All time",
    "dateRangeFrom": "From",
    "dateRangeTo": "To",
    "dateRangeInvalid": "End date must be on or after the start date.",
    "dateRangeAriaLabel": "Filter dashboard by date range"
```

- [ ] **Step 2: Write the failing tests**

Create `src/parent/__tests__/DateRangeFilter.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import DateRangeFilter from '../DateRangeFilter'

const ALL_RANGE = { preset: 'all', start: null, end: null }

describe('DateRangeFilter — presets', () => {
  it('calls onChange with the right preset when a preset button is clicked', () => {
    const onChange = vi.fn()
    render(<DateRangeFilter range={ALL_RANGE} onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: '7 days' }))
    expect(onChange).toHaveBeenCalledWith({ preset: '7d', start: null, end: null })
  })

  it('marks the active preset as selected', () => {
    render(<DateRangeFilter range={{ preset: '30d', start: null, end: null }} onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: '30 days' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'All time' })).toHaveAttribute('aria-selected', 'false')
  })
})

describe('DateRangeFilter — custom range', () => {
  it('calls onChange with preset "custom" once both valid dates are entered', () => {
    const onChange = vi.fn()
    render(<DateRangeFilter range={ALL_RANGE} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-08' } })
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'custom', start: '2026-07-01', end: '2026-07-08' })
  })

  it('shows an inline error and does not call onChange when end is before start', () => {
    const onChange = vi.fn()
    render(<DateRangeFilter range={ALL_RANGE} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-10' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-01' } })
    expect(screen.getByRole('alert')).toHaveTextContent('End date must be on or after the start date.')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('recovers after fixing an invalid range', () => {
    const onChange = vi.fn()
    render(<DateRangeFilter range={ALL_RANGE} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-10' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-01' } })
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-20' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledWith({ preset: 'custom', start: '2026-07-10', end: '2026-07-20' })
  })

  it('does not call onChange while only one custom field is filled', () => {
    const onChange = vi.fn()
    render(<DateRangeFilter range={ALL_RANGE} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-01' } })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('DateRangeFilter — accessibility', () => {
  it('has no accessibility violations in the default state', async () => {
    const { container } = render(<DateRangeFilter range={ALL_RANGE} onChange={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations while showing the validation error', async () => {
    const { container } = render(<DateRangeFilter range={ALL_RANGE} onChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-10' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-01' } })
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/parent/__tests__/DateRangeFilter.test.jsx`
Expected: FAIL — `../DateRangeFilter` does not exist yet.

- [ ] **Step 4: Implement `DateRangeFilter.jsx`**

Create `src/parent/DateRangeFilter.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import './DateRangeFilter.css'

const PRESETS = ['7d', '30d', '90d', 'all']
const PRESET_LABEL_KEY = {
  '7d':  'parent.dateRange7d',
  '30d': 'parent.dateRange30d',
  '90d': 'parent.dateRange90d',
  'all': 'parent.dateRangeAll',
}

export default function DateRangeFilter({ range, onChange }) {
  const { t } = useTranslation()
  const [draftStart, setDraftStart] = useState(range.preset === 'custom' ? range.start ?? '' : '')
  const [draftEnd,   setDraftEnd]   = useState(range.preset === 'custom' ? range.end ?? ''   : '')

  // Keep local drafts in sync when the range changes from outside this component
  // (e.g. a persisted setting finishing its async load after initial mount).
  useEffect(() => {
    setDraftStart(range.preset === 'custom' ? range.start ?? '' : '')
    setDraftEnd(range.preset === 'custom' ? range.end ?? ''   : '')
  }, [range.preset, range.start, range.end])

  const invalid = draftStart !== '' && draftEnd !== '' && draftEnd < draftStart

  function selectPreset(preset) {
    onChange({ preset, start: null, end: null })
  }

  function handleDraftChange(field, value) {
    const nextStart = field === 'start' ? value : draftStart
    const nextEnd   = field === 'end'   ? value : draftEnd
    if (field === 'start') setDraftStart(value)
    else setDraftEnd(value)

    if (nextStart !== '' && nextEnd !== '' && nextEnd >= nextStart) {
      onChange({ preset: 'custom', start: nextStart, end: nextEnd })
    }
  }

  return (
    <div className="date-range-filter">
      <div
        className="date-range-filter__tabs"
        role="tablist"
        aria-label={t('parent.dateRangeAriaLabel')}
      >
        {PRESETS.map(preset => (
          <button
            key={preset}
            role="tab"
            aria-selected={range.preset === preset}
            className={`date-range-filter__tab${range.preset === preset ? ' date-range-filter__tab--active' : ''}`}
            onClick={() => selectPreset(preset)}
          >
            {t(PRESET_LABEL_KEY[preset])}
          </button>
        ))}
      </div>

      <div className="date-range-filter__custom">
        <label className="date-range-filter__label" htmlFor="date-range-from">
          {t('parent.dateRangeFrom')}
        </label>
        <input
          id="date-range-from"
          type="date"
          value={draftStart}
          onChange={e => handleDraftChange('start', e.target.value)}
        />
        <label className="date-range-filter__label" htmlFor="date-range-to">
          {t('parent.dateRangeTo')}
        </label>
        <input
          id="date-range-to"
          type="date"
          value={draftEnd}
          onChange={e => handleDraftChange('end', e.target.value)}
        />
      </div>

      {invalid && (
        <p className="date-range-filter__error" role="alert">
          {t('parent.dateRangeInvalid')}
        </p>
      )}
    </div>
  )
}
```

Create `src/parent/DateRangeFilter.css`:

```css
.date-range-filter { margin-bottom: 4px; }

.date-range-filter__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.date-range-filter__tab {
  padding: 6px 16px;
  border-radius: var(--radius-button);
  border: 2px solid rgb(0 0 0 / 12%);
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.date-range-filter__tab:hover { background: rgb(0 0 0 / 5%); }

.date-range-filter__tab--active {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-surface);
}

.date-range-filter__tab:focus         { outline: none; }
.date-range-filter__tab:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }

.date-range-filter__custom {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.date-range-filter__label {
  font-weight: 600;
  color: var(--color-text-muted);
}

.date-range-filter__custom input[type='date'] {
  padding: 6px 10px;
  border-radius: var(--radius-button);
  border: 2px solid rgb(0 0 0 / 12%);
  font-size: 14px;
  min-height: 40px;
}

.date-range-filter__error {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-error, #c0392b);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/parent/__tests__/DateRangeFilter.test.jsx`
Expected: PASS (9 tests)

- [ ] **Step 6: Check for a `--color-error` token**

Run: `grep -n "color-error" src/index.css`
If it does not exist, replace `var(--color-error, #c0392b)` in `DateRangeFilter.css` with the literal `#c0392b` (the fallback already used) so the rule doesn't rely on an undefined custom property. If it does exist, leave the `var(...)` reference as-is and drop the fallback value.

- [ ] **Step 7: Commit**

```bash
git add src/parent/DateRangeFilter.jsx src/parent/DateRangeFilter.css src/parent/__tests__/DateRangeFilter.test.jsx src/i18n/en.json
git commit -m "feat(parent): add DateRangeFilter component with preset and custom range controls"
```

---

### Task 4: Wire the filter into `ParentDashboard` + range-aware heatmap with month labels

**Files:**
- Modify: `src/storage/adapter.js:1-20` (DEFAULT_SETTINGS)
- Modify: `src/parent/ParentDashboard.jsx` (full rewrite of the sections listed below)
- Modify: `src/parent/ParentDashboard.css:82-138` (heatmap layout) and `:3-7` (toolbar)
- Modify: `src/parent/__tests__/ParentDashboard.test.jsx`

**Interfaces:**
- Consumes: `resolvePresetRange`, `filterScoresByRange`, `buildHeatmapCells`, `computeMonthLabels` from `../utils/dateRangeUtils` (Task 1); `computeStreakHistory(scores, bestStreaks, anchor)` from `../utils/dashboardUtils` (Task 2); `<DateRangeFilter range={...} onChange={...} />` from `./DateRangeFilter` (Task 3); `useSettings()` from `../hooks/useSettings` (existing, returns `{ settings, updateSetting }`).
- Produces: no new exports — this is the top-level page component.

- [ ] **Step 1: Add `parentDateRange` to `DEFAULT_SETTINGS`**

In `src/storage/adapter.js`, add a new key to `DEFAULT_SETTINGS` (after `locale: 'en',` on line 19):

```js
  locale: 'en',
  parentDateRange: { preset: 'all', start: null, end: null },
```

Update the settings-shape comment block below it (the line starting `* Settings shape: {`) to append `, parentDateRange` to the listed keys, and add a description line:

```js
 *   parentDateRange: { preset, start, end } — Parent Dashboard's active date filter.
 *     preset: '7d' | '30d' | '90d' | 'all' | 'custom'; start/end are 'YYYY-MM-DD'
 *     strings, only meaningful when preset === 'custom'. Added v0.21.0.
```

- [ ] **Step 2: Update the existing `ParentDashboard.test.jsx` mocks**

The current mock of `useSettings` (near the top of the file) only returns `{ childName: '' }` and is never actually exercised by the component today. Once `ParentDashboard` starts reading `settings.parentDateRange` and calling `updateSetting`, this mock must supply both. Replace the existing mock block:

```js
vi.mock('../../hooks/useSettings', () => ({
  default: () => ({ settings: { childName: '' } }),
}))
```

with:

```js
const { mockSettings, mockUpdateSetting } = vi.hoisted(() => ({
  mockSettings: { childName: '', parentDateRange: { preset: 'all', start: null, end: null } },
  mockUpdateSetting: vi.fn(),
}))

vi.mock('../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings, updateSetting: mockUpdateSetting }),
}))
```

In the existing `beforeEach(() => { vi.clearAllMocks() ... })` block, add a reset so tests don't leak state into each other:

```js
beforeEach(() => {
  vi.clearAllMocks()
  mockGetBestStreaks.mockResolvedValue({ 'animal-sounds': 5 })
  mockSettings.parentDateRange = { preset: 'all', start: null, end: null }
})
```

- [ ] **Step 3: Write the new failing tests**

Add a new `describe` block to `ParentDashboard.test.jsx` (after the existing `'ParentDashboard — insufficient data for charts'` block):

```js
// ─── Date range filter ────────────────────────────────────────────────────────

describe('ParentDashboard — date range filter', () => {
  const NOW = Date.now()
  const DAY = 86_400_000
  const recentDate = new Date(NOW - DAY).toISOString().split('T')[0]
  const oldDate     = new Date(NOW - 60 * DAY).toISOString().split('T')[0]

  beforeEach(() => {
    mockGetAllScores.mockReturnValue([
      makeScore({ date: recentDate, timestamp: NOW - DAY }),
      makeScore({ date: oldDate,    timestamp: NOW - 60 * DAY, gameId: 'color-match' }),
    ])
  })

  it('narrows the missed-items panel to sessions in the selected range', async () => {
    await renderDashboard()
    // both games' missed items are visible under the default "All time" range
    expect(screen.getAllByText(/cat/i).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('tab', { name: '7 days' }))
    // color-match's session is 60 days old — excluded once the range narrows to 7 days
    expect(screen.queryByText(/color match/i)).not.toBeInTheDocument()
  })

  it('persists the selected range via updateSetting', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('tab', { name: '30 days' }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('parentDateRange', { preset: '30d', start: null, end: null })
  })

  it('restores a persisted range on mount', async () => {
    mockSettings.parentDateRange = { preset: '30d', start: null, end: null }
    await renderDashboard()
    expect(screen.getByRole('tab', { name: '30 days' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows each section\'s existing empty-state messaging when the range matches nothing, without crashing', async () => {
    mockGetAllScores.mockReturnValue([makeScore({ date: oldDate, timestamp: NOW - 60 * DAY })])
    await renderDashboard()
    fireEvent.click(screen.getByRole('tab', { name: '7 days' }))
    expect(screen.getByText(/no missed-item data yet|missed items/i)).toBeInTheDocument()
  })

  it('CSV export reflects the active filter', async () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock')
    URL.revokeObjectURL  = vi.fn()
    await renderDashboard()
    fireEvent.click(screen.getByRole('tab', { name: '7 days' }))

    let capturedBlob
    const originalCreateEl = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return { click: vi.fn(), href: '', download: '' }
      return originalCreateEl(tag)
    })
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { capturedBlob = blob; return 'blob:mock' })

    fireEvent.click(screen.getByRole('button', { name: /export csv/i }))
    const text = await capturedBlob.text()
    expect(text).toContain('animal-sounds')
    expect(text).not.toContain('color-match')
  })

  it('has no accessibility violations with a non-default filter applied', async () => {
    const { container } = await renderDashboard()
    fireEvent.click(screen.getByRole('tab', { name: '30 days' }))
    expect(await axe(container)).toHaveNoViolations()
  })
})

// ─── Heatmap month labels ─────────────────────────────────────────────────────

describe('ParentDashboard — heatmap month labels', () => {
  it('renders at least one month label above the heatmap grid', async () => {
    mockGetAllScores.mockReturnValue([makeScore(), makeScore({ date: new Date(NOW - 2 * DAY).toISOString().split('T')[0], timestamp: NOW - 2 * DAY })])
    const { container } = await renderDashboard()
    expect(container.querySelectorAll('.heatmap__month-label').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 4: Run tests to verify the new ones fail**

Run: `npx vitest run src/parent/__tests__/ParentDashboard.test.jsx`
Expected: FAIL — `ParentDashboard` doesn't render a `tab` role or read `parentDateRange` yet; `.heatmap__month-label` doesn't exist yet.

- [ ] **Step 5: Rewrite `ParentDashboard.jsx`**

Replace the full contents of `src/parent/ParentDashboard.jsx`:

```jsx
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'
import useScores from '../hooks/useScores'
import useSettings from '../hooks/useSettings'
import adapter from '../storage/index'
import {
  computeScoreTrend,
  computeResponseTimes,
  computeStreakHistory,
  computeSessionHeatmap,
  computeMissedItems,
  buildCsvContent,
  downloadCsv,
} from '../utils/dashboardUtils'
import {
  resolvePresetRange,
  filterScoresByRange,
  buildHeatmapCells,
  computeMonthLabels,
} from '../utils/dateRangeUtils'
import DateRangeFilter from './DateRangeFilter'
import './ParentDashboard.css'

// One distinct stroke color per game line in charts
const CHART_COLORS = ['#006C7A', '#00695C', '#6A4FA3', '#8E24AA']

// i18n namespace to use when resolving an item label for a given game
const GAME_ITEM_NS = {
  'animal-sounds': 'animal',
  'color-match':   'color',
}

function formatDate(dateStr) {
  const [, m, d] = dateStr.split('-')
  return `${parseInt(m)}/${parseInt(d)}`
}

function formatMs(ms) {
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── Section: Score Trend ────────────────────────────────────────────────────

function ChartDataTable({ caption, data, gameIds, gameNames, formatValue }) {
  const { t } = useTranslation()
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>{t('parent.chartDateColumn')}</th>
          {gameIds.map(id => <th key={id}>{gameNames[id] ?? id}</th>)}
        </tr>
      </thead>
      <tbody>
        {data.map(row => (
          <tr key={row.date}>
            <td>{row.date}</td>
            {gameIds.map(id => <td key={id}>{row[id] != null ? formatValue(row[id]) : '—'}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ScoreTrendChart({ data, gameIds, gameNames }) {
  const { t } = useTranslation()
  if (data.length < 2) return <p className="parent__empty-chart">{t('parent.notEnoughData')}</p>
  return (
    <>
      <ChartDataTable
        caption={t('parent.scoreTrendHeading')}
        data={data}
        gameIds={gameIds}
        gameNames={gameNames}
        formatValue={v => `${v}%`}
      />
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} width={42} />
          <Tooltip formatter={v => `${v}%`} labelFormatter={formatDate} />
          <Legend />
          {gameIds.map((id, i) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              name={gameNames[id] ?? id}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

// ─── Section: Response Time ──────────────────────────────────────────────────

function ResponseTimeChart({ data, gameIds, gameNames }) {
  const { t } = useTranslation()
  if (data.length < 2) return <p className="parent__empty-chart">{t('parent.notEnoughData')}</p>
  return (
    <>
      <ChartDataTable
        caption={t('parent.responseTimeHeading')}
        data={data}
        gameIds={gameIds}
        gameNames={gameNames}
        formatValue={formatMs}
      />
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatMs} tick={{ fontSize: 12 }} width={48} />
          <Tooltip formatter={formatMs} labelFormatter={formatDate} />
          <Legend />
          {gameIds.map((id, i) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              name={gameNames[id] ?? id}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

// ─── Section: Streak History ─────────────────────────────────────────────────

function StreakHistoryPanel({ streakHistory, gameNames }) {
  const { t }  = useTranslation()
  const games  = Object.keys(streakHistory)
  if (games.length === 0) return <p className="parent__empty-chart">{t('parent.notEnoughData')}</p>
  return (
    <table className="parent__streak-table" aria-label={t('parent.streakHistoryHeading')}>
      <thead>
        <tr>
          <th>{t('parent.streakGame')}</th>
          <th>{t('parent.streakLast7')}</th>
          <th>{t('parent.streakLast30')}</th>
          <th>{t('parent.streakAllTime')}</th>
        </tr>
      </thead>
      <tbody>
        {games.map(gameId => {
          const { last7, last30, allTime } = streakHistory[gameId]
          return (
            <tr key={gameId}>
              <td>{gameNames[gameId] ?? gameId}</td>
              <td>{last7}</td>
              <td>{last30}</td>
              <td>{allTime}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── Section: Session Heatmap ────────────────────────────────────────────────

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function intensityLevel(questions) {
  if (questions === 0) return 0
  if (questions <= 5)  return 1
  if (questions <= 15) return 2
  return 3
}

function SessionHeatmap({ cells }) {
  const { t, i18n } = useTranslation()
  const monthLabels  = useMemo(() => computeMonthLabels(cells, i18n.language), [cells, i18n.language])
  const labelByColumn = useMemo(
    () => Object.fromEntries(monthLabels.map(m => [m.columnIndex, m.label])),
    [monthLabels]
  )
  const columnCount = cells.length / 7

  return (
    <div className="heatmap" role="img" aria-label={t('parent.heatmapLabel')}>
      <div className="heatmap__inner">
        <div className="heatmap__days-col">
          <div className="heatmap__months-spacer" aria-hidden="true" />
          <div className="heatmap__days" aria-hidden="true">
            {DAY_LABELS.map((d, i) => <span key={i} className="heatmap__day-label">{d}</span>)}
          </div>
        </div>
        <div className="heatmap__scroll">
          <div className="heatmap__months" aria-hidden="true">
            {Array.from({ length: columnCount }, (_, col) => (
              <span key={col} className="heatmap__month-label">{labelByColumn[col] ?? ''}</span>
            ))}
          </div>
          <div className="heatmap__grid">
            {cells.map(cell => {
              const level   = intensityLevel(cell.questions)
              const minutes = cell.estimatedMs ? Math.round(cell.estimatedMs / 60000) : null
              const tip     = cell.questions > 0
                ? `${cell.date}: ${cell.questions} questions${minutes ? ` (~${minutes} min)` : ''}`
                : cell.date
              return (
                <div
                  key={cell.date}
                  className={`heatmap__cell heatmap__cell--${level}`}
                  title={tip}
                />
              )
            })}
          </div>
        </div>
      </div>
      <div className="heatmap__legend" aria-hidden="true">
        <span>{t('parent.heatmapLess')}</span>
        {[0, 1, 2, 3].map(i => <div key={i} className={`heatmap__cell heatmap__cell--${i}`} />)}
        <span>{t('parent.heatmapMore')}</span>
      </div>
    </div>
  )
}

// ─── Section: Missed Items ───────────────────────────────────────────────────

function MissedItemsPanel({ missedItems, gameNames }) {
  const { t }  = useTranslation()
  const games  = Object.keys(missedItems)

  if (games.length === 0) {
    return <p className="parent__empty-chart">{t('parent.missedNoData')}</p>
  }

  return (
    <div className="parent__missed">
      {games.map(gameId => {
        const ns    = GAME_ITEM_NS[gameId]
        const items = missedItems[gameId]
        const max   = items[0]?.count ?? 1
        const name  = gameNames[gameId] ?? gameId
        return (
          <div key={gameId} className="parent__missed-game">
            <h3 className="parent__missed-title">{name}</h3>
            <ul className="parent__missed-list" aria-label={t('parent.missedItemsAriaLabel', { name })}>
              {items.map(({ itemId, count }) => {
                const label = ns ? t(`${ns}.${itemId}.name`, { defaultValue: itemId }) : itemId
                return (
                  <li key={itemId} className="parent__missed-item">
                    <span className="parent__missed-label">{label}</span>
                    <div className="parent__missed-bar-wrap">
                      <div
                        className="parent__missed-bar"
                        style={{ width: `${Math.round((count / max) * 100)}%` }}
                      />
                    </div>
                    <span className="parent__missed-count">{count}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ParentDashboard({ manifests = [] }) {
  const { t }             = useTranslation()
  const { getAllScores }  = useScores()
  const { settings, updateSetting } = useSettings()
  const [bestStreaks, setBestStreaks] = useState({})
  const scores  = getAllScores()
  const range   = settings.parentDateRange

  const resolvedRange = useMemo(() => (
    range.preset === 'custom'
      ? { start: range.start, end: range.end }
      : resolvePresetRange(range.preset)
  ), [range.preset, range.start, range.end])

  const filteredScores = useMemo(() => filterScoresByRange(scores, resolvedRange), [scores, resolvedRange])
  const gameIds = useMemo(() => [...new Set(filteredScores.map(s => s.gameId))], [filteredScores])
  const gameNames = useMemo(
    () => Object.fromEntries(manifests.map(m => [m.id, m.name])),
    [manifests]
  )

  useEffect(() => {
    adapter.getBestStreaks().then(setBestStreaks)
  }, [])

  const streakAnchor = useMemo(
    () => (resolvedRange.end ? new Date(`${resolvedRange.end}T23:59:59.999Z`) : new Date()),
    [resolvedRange.end]
  )

  const scoreTrend    = useMemo(() => computeScoreTrend(filteredScores),    [filteredScores])
  const responseTimes = useMemo(() => computeResponseTimes(filteredScores), [filteredScores])
  const streakHistory = useMemo(
    () => computeStreakHistory(filteredScores, bestStreaks, streakAnchor),
    [filteredScores, bestStreaks, streakAnchor]
  )
  const heatmapCells = useMemo(
    () => buildHeatmapCells(computeSessionHeatmap(filteredScores), resolvedRange),
    [filteredScores, resolvedRange]
  )
  const missedItems = useMemo(() => computeMissedItems(filteredScores), [filteredScores])

  function handleExport() {
    const csv   = buildCsvContent(filteredScores)
    const today = new Date().toISOString().split('T')[0]
    downloadCsv(`playground-scores-${today}.csv`, csv)
  }

  function handleRangeChange(next) {
    updateSetting('parentDateRange', next)
  }

  return (
    <div className="parent">
      <div className="parent__toolbar">
        <DateRangeFilter range={range} onChange={handleRangeChange} />
        <button className="parent__export-btn" onClick={handleExport} aria-label={t('parent.exportCsv')}>
          {t('parent.exportCsv')}
        </button>
      </div>

      {scores.length === 0 ? (
        <p className="parent__empty">{t('parent.empty')}</p>
      ) : (
        <>
          <section className="parent__section" aria-labelledby="score-trend-heading">
            <h2 id="score-trend-heading">{t('parent.scoreTrendHeading')}</h2>
            <p className="parent__hint">{t('parent.scoreTrendHint')}</p>
            <ScoreTrendChart data={scoreTrend} gameIds={gameIds} gameNames={gameNames} />
          </section>

          <section className="parent__section" aria-labelledby="response-time-heading">
            <h2 id="response-time-heading">{t('parent.responseTimeHeading')}</h2>
            <p className="parent__hint">{t('parent.responseTimeHint')}</p>
            <ResponseTimeChart data={responseTimes} gameIds={gameIds} gameNames={gameNames} />
          </section>

          <section className="parent__section" aria-labelledby="streak-heading">
            <h2 id="streak-heading">{t('parent.streakHistoryHeading')}</h2>
            <p className="parent__hint">{t('parent.streakHistoryHint')}</p>
            <StreakHistoryPanel streakHistory={streakHistory} gameNames={gameNames} />
          </section>

          <section className="parent__section" aria-labelledby="heatmap-heading">
            <h2 id="heatmap-heading">{t('parent.heatmapHeading')}</h2>
            <p className="parent__hint">{t('parent.heatmapHint')}</p>
            <SessionHeatmap cells={heatmapCells} />
          </section>

          <section className="parent__section" aria-labelledby="missed-heading">
            <h2 id="missed-heading">{t('parent.missedHeading')}</h2>
            <p className="parent__hint">{t('parent.missedHint')}</p>
            <MissedItemsPanel missedItems={missedItems} gameNames={gameNames} />
          </section>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Update the heatmap and toolbar CSS**

In `src/parent/ParentDashboard.css`, replace the toolbar rule (lines 3-7):

```css
.parent__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
```

Replace the entire heatmap block (lines 82-138, from `/* ── Heatmap ── */` through the `.heatmap__legend .heatmap__cell { flex-shrink: 0; }` rule) with:

```css
/* ── Heatmap ── */
.heatmap { user-select: none; }

.heatmap__inner {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.heatmap__days-col {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.heatmap__months-spacer { height: 14px; margin-bottom: 2px; }

.heatmap__days {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

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

.heatmap__scroll {
  overflow-x: auto;
  flex: 1;
  min-width: 0;
  padding-bottom: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.heatmap__months {
  display: flex;
  gap: 2px;
  height: 14px;
  width: max-content;
}

.heatmap__month-label {
  width: 14px;
  flex-shrink: 0;
  font-size: 10px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: visible;
  line-height: 14px;
}

.heatmap__grid {
  display: grid;
  grid-template-rows: repeat(7, 14px);
  grid-auto-columns: 14px;
  grid-auto-flow: column;
  gap: 2px;
  width: max-content;
}

.heatmap__cell {
  width: 14px;
  height: 14px;
  border-radius: 3px;
}
.heatmap__cell--0 { background: #e8f4f6; }
.heatmap__cell--1 { background: #80cbc4; }
.heatmap__cell--2 { background: #26a69a; }
.heatmap__cell--3 { background: #006C7A; }

.heatmap__legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-muted);
}
.heatmap__legend .heatmap__cell { flex-shrink: 0; }
```

- [ ] **Step 7: Run all ParentDashboard-related tests to verify they pass**

Run: `npx vitest run src/parent/__tests__/ParentDashboard.test.jsx src/parent/__tests__/DateRangeFilter.test.jsx`
Expected: PASS (all tests, including the pre-existing ones — confirms the game-name-labels regression guard still holds)

- [ ] **Step 8: Run the full unit/component suite and lint**

Run: `npm test -- --run && npm run lint`
Expected: PASS, no new lint errors (in particular, `eslint-plugin-jsx-a11y` should pass on the new `role="tablist"`/`role="tab"`/`role="alert"` markup)

- [ ] **Step 9: Commit**

```bash
git add src/storage/adapter.js src/parent/ParentDashboard.jsx src/parent/ParentDashboard.css src/parent/__tests__/ParentDashboard.test.jsx
git commit -m "feat(parent): wire date-range filter into ParentDashboard and resize heatmap to the selected range"
```

---

### Task 5: E2E coverage

**Files:**
- Create: `e2e/parent-dashboard.spec.js`
- Modify: `e2e/visual.spec.js-snapshots/` (new/updated baseline PNGs, generated not hand-written)

**Interfaces:**
- Consumes: the running app at `/parent`, `localStorage` key `playground_scores` (array of score objects, same shape as `makeScore()` in the unit tests) and `playground_settings` (JSON object merged over `DEFAULT_SETTINGS`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the E2E spec**

Create `e2e/parent-dashboard.spec.js`:

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const DAY = 86_400_000

function seedScores(daysAgoList) {
  const now = Date.now()
  return daysAgoList.map((daysAgo, i) => ({
    gameId: 'animal-sounds',
    score: 8,
    total: 10,
    date: new Date(now - daysAgo * DAY).toISOString().split('T')[0],
    timestamp: now - daysAgo * DAY,
    peakStreak: 4,
    timings: [{ questionIndex: 0, itemId: `item-${i}`, correct: true, durationMs: 1000 }],
  }))
}

test.beforeEach(async ({ page }) => {
  // Seed scores before any app script runs so the very first render sees them.
  await page.addInitScript((scores) => {
    localStorage.setItem('playground_scores', JSON.stringify(scores))
  }, seedScores([1, 10, 45]))
})

test('default load shows all-time data; selecting 7 days narrows the charts', async ({ page }) => {
  await page.goto('/parent')
  await expect(page.getByRole('heading', { name: 'Score Trend' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'All time' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('tab', { name: '7 days' }).click()
  await expect(page.getByRole('tab', { name: '7 days' })).toHaveAttribute('aria-selected', 'true')
})

test('custom range via date inputs updates the dashboard and persists across a reload', async ({ page }) => {
  await page.goto('/parent')

  const from = new Date(Date.now() - 20 * DAY).toISOString().split('T')[0]
  const to   = new Date(Date.now() - 5  * DAY).toISOString().split('T')[0]
  await page.getByLabel('From').fill(from)
  await page.getByLabel('To').fill(to)

  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('playground_settings'))
    if (!raw) return null
    return JSON.parse(raw)?.parentDateRange
  }).toEqual({ preset: 'custom', start: from, end: to })

  await page.reload()
  await expect(page.getByLabel('From')).toHaveValue(from)
  await expect(page.getByLabel('To')).toHaveValue(to)
})

test('an invalid custom range shows an inline error and does not clear the dashboard', async ({ page }) => {
  await page.goto('/parent')
  await expect(page.getByRole('heading', { name: 'Score Trend' })).toBeVisible()

  await page.getByLabel('From').fill('2026-07-10')
  await page.getByLabel('To').fill('2026-07-01')

  await expect(page.getByRole('alert')).toHaveText(/end date must be on or after/i)
  // the previously-valid ("All time") data is still on screen, not cleared
  await expect(page.getByRole('heading', { name: 'Score Trend' })).toBeVisible()
})

test('parent dashboard has no accessibility violations with a filter applied', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/parent')
  await page.getByRole('tab', { name: '30 days' }).click()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

- [ ] **Step 2: Run the new spec**

Run: `npx playwright test parent-dashboard.spec.js`
Expected: PASS (4 tests). If a selector doesn't match (e.g. a heading name differs from what's actually rendered), adjust the selector to match the real DOM rather than changing the app to match the test.

- [ ] **Step 3: Update the visual regression baseline for the heatmap**

Run: `npx playwright test visual.spec.js --update-snapshots`

Review the diffed PNGs under `e2e/visual.spec.js-snapshots/` — confirm only the heatmap's new month-label row changed, nothing else shifted unexpectedly.

- [ ] **Step 4: Commit**

```bash
git add e2e/parent-dashboard.spec.js e2e/visual.spec.js-snapshots/
git commit -m "test(e2e): cover parent dashboard date-range filter and heatmap month labels"
```

---

### Task 6: Documentation, changelog, version bump

**Files:**
- Modify: `README.md`
- Modify: `docs/TESTING.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Add the Parent Analytics Dashboard section to `README.md`**

In `README.md`, insert a new subsection after the existing `### My Progress Page` section (before the `---` that precedes `## Getting Started`):

```markdown
### Parent Analytics Dashboard

A dedicated `/parent` page shows five sections built from score history: **Score Trend** (accuracy % per game over time), **Response Time** (average answer speed per game), **Streak History** (longest correct-answer run in the last 7 days, last 30 days, and all-time), **Play Calendar** (a GitHub-style heatmap of daily activity, with month labels above the week columns), and **Missed Items** (which items are answered incorrectly most often, per game).

Every section reacts to the **date-range filter** at the top of the page: quick presets (7 days / 30 days / 90 days / All time) or a custom from–to range. The heatmap resizes to span exactly the selected range instead of always showing a fixed window, and Streak History's "last 7/30 days" columns re-anchor to the end of the selected range rather than always meaning "as of right now" — so a past custom range still shows meaningful streak data. The selected range is remembered across visits (stored alongside the other settings). CSV export via the toolbar button reflects whatever range is currently active.
```

- [ ] **Step 2: Add the date-input testing note to `docs/TESTING.md`**

In `docs/TESTING.md`, add a new bullet to the "Unit & component tests" list (after the existing "`AppShell`:" bullet, before the "## Accessibility audits" heading):

```markdown
- **Native date inputs:** drive `<input type="date">` fields with `fireEvent.change(input, { target: { value: 'YYYY-MM-DD' } })`, not `userEvent.type` — typing a date character-by-character through `userEvent` doesn't reliably produce a valid date-input value across browsers/jsdom. See `src/parent/__tests__/DateRangeFilter.test.jsx` for the pattern.
```

- [ ] **Step 3: Bump the version**

Run: `npm version minor --no-git-tag-version`

This bumps `package.json`'s `version` field (e.g. `0.20.0` → `0.21.0`) without creating a git tag or commit.

- [ ] **Step 4: Add the CHANGELOG entry**

In `CHANGELOG.md`, insert a new section above the existing `## [0.20.0] - 2026-07-08` entry (use today's actual date and confirm the version number matches what `npm version minor` produced in Step 3):

```markdown
## [0.21.0] - 2026-07-08

### Added
- Parent Dashboard: interactive date-range filter (7/30/90-day presets plus a custom from–to range) applying to every section — Score Trend, Response Time, Streak History, Play Calendar, and Missed Items — as well as CSV export. The selection persists across visits.
- Parent Dashboard: the Play Calendar heatmap now shows month labels above the week columns and resizes to span exactly the selected date range instead of always showing a fixed trailing 13 weeks.

### Fixed
- Streak History's "Last 7 days"/"Last 30 days" columns now re-anchor to the end of the selected date range instead of always being relative to the current moment, so a past custom range shows meaningful streak data instead of zeros.
```

- [ ] **Step 5: Verify the full suite one more time**

Run: `npm run lint && npm test -- --run && npm run e2e`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/TESTING.md CHANGELOG.md package.json
git commit -m "docs: document parent dashboard date-range filter and heatmap month labels; bump to 0.21.0"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-07-08-parent-dashboard-enhancements-design.md` maps to a task — `dateRangeUtils.js` (Task 1), `computeStreakHistory` anchor (Task 2), `DateRangeFilter` + i18n (Task 3), `ParentDashboard` integration + heatmap CSS + settings schema (Task 4), E2E + visual regression (Task 5), docs/changelog/version (Task 6). The already-shipped "game-name labels" item is explicitly covered as a regression assertion in Task 4, Step 7, not re-implemented.
- **Type/signature consistency checked:** `buildHeatmapCells(heatmapData, { start, end })` (Task 1) is called identically in Task 4's `ParentDashboard.jsx` (`buildHeatmapCells(computeSessionHeatmap(filteredScores), resolvedRange)`). `computeStreakHistory(scores, bestStreaks, anchor)` (Task 2) matches its Task 4 call site (`computeStreakHistory(filteredScores, bestStreaks, streakAnchor)`). `DateRangeFilter`'s `onChange` payload shape (`{ preset, start, end }`, Task 3) matches what `ParentDashboard.handleRangeChange` (Task 4) passes straight to `updateSetting('parentDateRange', next)`, and matches the `DEFAULT_SETTINGS.parentDateRange` shape added in Task 4 Step 1.
- **No placeholders:** every step above contains complete, runnable code — no "TBD", no "add tests for the above" without the actual test code.
