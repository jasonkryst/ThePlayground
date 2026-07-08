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
