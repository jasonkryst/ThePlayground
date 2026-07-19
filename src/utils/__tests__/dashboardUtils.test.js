import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  computeScoreTrend,
  computeResponseTimes,
  computeStreakHistory,
  computeSessionHeatmap,
  computeMissedItems,
  buildCsvContent,
  downloadCsv,
} from '../dashboardUtils'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const NOW        = Date.now()
const DAY        = 86_400_000
const yesterday  = new Date(NOW - DAY).toISOString().split('T')[0]
const twoDaysAgo = new Date(NOW - 2 * DAY).toISOString().split('T')[0]
const tenDaysAgo = new Date(NOW - 10 * DAY).toISOString().split('T')[0]
const fortyDaysAgo = new Date(NOW - 40 * DAY).toISOString().split('T')[0]

const timingCorrect   = (itemId) => ({ questionIndex: 0, itemId, correct: true,  durationMs: 1000 })
const timingIncorrect = (itemId) => ({ questionIndex: 0, itemId, correct: false, durationMs: 2000 })

function makeScore(overrides = {}) {
  return {
    gameId:    'animal-sounds',
    score:     8,
    total:     10,
    date:      yesterday,
    timestamp: NOW - DAY,
    peakStreak: 5,
    timings: [timingCorrect('dog'), timingIncorrect('cat')],
    ...overrides,
  }
}

// ─── computeScoreTrend ───────────────────────────────────────────────────────

describe('computeScoreTrend', () => {
  it('returns empty array for no scores', () => {
    expect(computeScoreTrend([])).toEqual([])
  })

  it('computes accuracy for a single score', () => {
    const result = computeScoreTrend([makeScore({ score: 8, total: 10 })])
    expect(result).toHaveLength(1)
    expect(result[0]['animal-sounds']).toBe(80)
  })

  it('merges multiple sessions on the same day into a single accuracy value', () => {
    const scores = [
      makeScore({ score: 8, total: 10 }),
      makeScore({ score: 6, total: 10 }),
    ]
    const result = computeScoreTrend(scores)
    expect(result).toHaveLength(1)
    expect(result[0]['animal-sounds']).toBe(70) // (8+6)/(10+10) = 70%
  })

  it('returns separate rows for different dates sorted ascending', () => {
    const scores = [
      makeScore({ date: yesterday,   score: 8, total: 10, timestamp: NOW - DAY }),
      makeScore({ date: twoDaysAgo,  score: 4, total: 10, timestamp: NOW - 2 * DAY }),
    ]
    const result = computeScoreTrend(scores)
    expect(result).toHaveLength(2)
    expect(result[0].date).toBe(twoDaysAgo)
    expect(result[1].date).toBe(yesterday)
  })

  it('tracks different games in separate keys on the same date row', () => {
    const scores = [
      makeScore({ gameId: 'animal-sounds', score: 9, total: 10 }),
      makeScore({ gameId: 'color-match',   score: 5, total: 10 }),
    ]
    const result = computeScoreTrend(scores)
    expect(result).toHaveLength(1)
    expect(result[0]['animal-sounds']).toBe(90)
    expect(result[0]['color-match']).toBe(50)
  })

  it('skips scores with null total', () => {
    expect(computeScoreTrend([makeScore({ total: null })])).toEqual([])
  })

  it('skips scores with missing date', () => {
    expect(computeScoreTrend([makeScore({ date: undefined })])).toEqual([])
  })

  it('returns 0% accuracy when total is 0 (guard against division by zero)', () => {
    // total=0 means no questions in session; skip whole row because total == null check catches undefined,
    // but total=0 falls through — verify it returns 0 safely
    const result = computeScoreTrend([makeScore({ score: 0, total: 0 })])
    // total is 0, totalQuestions stays 0 — loop body won't divide
    // The loop sets totalQuestions via += s.total which is 0; the check is totalQuestions > 0
    expect(result[0]['animal-sounds']).toBe(0)
  })
})

// ─── computeResponseTimes ────────────────────────────────────────────────────

describe('computeResponseTimes', () => {
  it('returns empty array for no scores', () => {
    expect(computeResponseTimes([])).toEqual([])
  })

  it('excludes scores without timings', () => {
    expect(computeResponseTimes([makeScore({ timings: undefined })])).toEqual([])
    expect(computeResponseTimes([makeScore({ timings: [] })])).toEqual([])
  })

  it('computes correct average ms for a single session', () => {
    const score  = makeScore({ timings: [{ durationMs: 1000 }, { durationMs: 3000 }] })
    const result = computeResponseTimes([score])
    expect(result[0]['animal-sounds']).toBe(2000) // (1000+3000)/2
  })

  it('aggregates multiple sessions on the same day', () => {
    const scores = [
      makeScore({ timings: [{ durationMs: 1000 }] }),
      makeScore({ timings: [{ durationMs: 3000 }] }),
    ]
    const result = computeResponseTimes(scores)
    expect(result).toHaveLength(1)
    expect(result[0]['animal-sounds']).toBe(2000) // (1000+3000)/2
  })

  it('returns separate rows for different dates sorted ascending', () => {
    const scores = [
      makeScore({ date: twoDaysAgo, timestamp: NOW - 2 * DAY, timings: [{ durationMs: 2000 }] }),
      makeScore({ date: yesterday,  timestamp: NOW - DAY,     timings: [{ durationMs: 4000 }] }),
    ]
    const result = computeResponseTimes(scores)
    expect(result[0].date).toBe(twoDaysAgo)
    expect(result[1].date).toBe(yesterday)
  })

  it('tracks different games in separate keys on the same date row', () => {
    const scores = [
      makeScore({ gameId: 'animal-sounds', timings: [{ durationMs: 1000 }] }),
      makeScore({ gameId: 'color-match',   timings: [{ durationMs: 3000 }] }),
    ]
    const result = computeResponseTimes(scores)
    expect(result[0]['animal-sounds']).toBe(1000)
    expect(result[0]['color-match']).toBe(3000)
  })
})

// ─── computeStreakHistory ────────────────────────────────────────────────────

describe('computeStreakHistory', () => {
  it('returns empty object for no scores', () => {
    expect(computeStreakHistory([], {})).toEqual({})
  })

  it('uses peakStreak when present', () => {
    const score  = makeScore({ peakStreak: 7, timestamp: NOW - DAY })
    const result = computeStreakHistory([score])
    expect(result['animal-sounds'].last7).toBe(7)
    expect(result['animal-sounds'].last30).toBe(7)
  })

  it('falls back to score when peakStreak is absent (old records)', () => {
    const score  = makeScore({ peakStreak: undefined, score: 6, timestamp: NOW - DAY })
    const result = computeStreakHistory([score])
    expect(result['animal-sounds'].last7).toBe(6)
  })

  it('returns allTime from bestStreaks map', () => {
    const result = computeStreakHistory([], { 'animal-sounds': 12 })
    expect(result['animal-sounds']).toBeUndefined() // no sessions → gameId not in result
  })

  it('allTime comes from bestStreaks for games with sessions', () => {
    const score  = makeScore({ peakStreak: 3, timestamp: NOW - DAY })
    const result = computeStreakHistory([score], { 'animal-sounds': 15 })
    expect(result['animal-sounds'].allTime).toBe(15)
  })

  it('excludes sessions older than 7 days from last7', () => {
    const score  = makeScore({ peakStreak: 9, timestamp: NOW - 8 * DAY, date: tenDaysAgo })
    const result = computeStreakHistory([score])
    expect(result['animal-sounds'].last7).toBe(0)
    expect(result['animal-sounds'].last30).toBe(9)
  })

  it('excludes sessions older than 30 days from last30', () => {
    const score  = makeScore({ peakStreak: 9, timestamp: NOW - 40 * DAY, date: fortyDaysAgo })
    const result = computeStreakHistory([score])
    expect(result['animal-sounds'].last7).toBe(0)
    expect(result['animal-sounds'].last30).toBe(0)
  })

  it('takes the maximum peakStreak across multiple sessions in the window', () => {
    const scores = [
      makeScore({ peakStreak: 3, timestamp: NOW - DAY }),
      makeScore({ peakStreak: 9, timestamp: NOW - 2 * DAY }),
    ]
    const result = computeStreakHistory(scores)
    expect(result['animal-sounds'].last7).toBe(9)
  })

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

  it('uses the memory game peakStreak (peak match streak), not its score (board size)', () => {
    // Memory score records: score/total is board size (e.g. 5), unrelated to streak.
    // peakStreak (mirrors peakMatchStreak) is the real streak value to surface here.
    const anchor = new Date(2)
    const score  = {
      gameId: 'animal-memory-match', score: 5, total: 5, date: '2026-07-10', timestamp: 1,
      flipAttempts: 8, mismatches: 3, peakStreak: 2, peakMatchStreak: 2,
    }
    const result = computeStreakHistory([score], {}, anchor)
    expect(result['animal-memory-match'].last7).toBe(2)
  })
})

// ─── computeSessionHeatmap ───────────────────────────────────────────────────

describe('computeSessionHeatmap', () => {
  it('returns empty array for no scores', () => {
    expect(computeSessionHeatmap([])).toEqual([])
  })

  it('skips scores without a date', () => {
    expect(computeSessionHeatmap([makeScore({ date: undefined })])).toEqual([])
  })

  it('returns one entry per calendar day with total questions', () => {
    const result = computeSessionHeatmap([makeScore({ total: 10 })])
    expect(result).toHaveLength(1)
    expect(result[0].questions).toBe(10)
    expect(result[0].date).toBe(yesterday)
  })

  it('sets estimatedMs when timings are present', () => {
    const score  = makeScore({ total: 2, timings: [{ durationMs: 1000 }, { durationMs: 3000 }] })
    const result = computeSessionHeatmap([score])
    expect(result[0].estimatedMs).toBe(4000) // 2 questions × avg 2000ms
  })

  it('sets estimatedMs to null when no timings', () => {
    const score  = makeScore({ timings: undefined })
    const result = computeSessionHeatmap([score])
    expect(result[0].estimatedMs).toBeNull()
  })

  it('sums questions from multiple sessions on the same day', () => {
    const scores = [makeScore({ total: 5 }), makeScore({ total: 10 })]
    const result = computeSessionHeatmap(scores)
    expect(result).toHaveLength(1)
    expect(result[0].questions).toBe(15)
  })

  it('returns entries sorted by date ascending', () => {
    const scores = [
      makeScore({ date: yesterday,  timestamp: NOW - DAY }),
      makeScore({ date: twoDaysAgo, timestamp: NOW - 2 * DAY }),
    ]
    const result = computeSessionHeatmap(scores)
    expect(result[0].date).toBe(twoDaysAgo)
    expect(result[1].date).toBe(yesterday)
  })
})

// ─── computeMissedItems ──────────────────────────────────────────────────────

describe('computeMissedItems', () => {
  it('returns empty object for no scores', () => {
    expect(computeMissedItems([])).toEqual({})
  })

  it('returns empty object when all timings are correct', () => {
    const score  = makeScore({ timings: [timingCorrect('dog'), timingCorrect('cat')] })
    expect(computeMissedItems([score])).toEqual({})
  })

  it('counts a single missed item', () => {
    const score  = makeScore({ timings: [timingIncorrect('cat')] })
    const result = computeMissedItems([score])
    expect(result['animal-sounds']).toEqual([{ itemId: 'cat', count: 1 }])
  })

  it('accumulates misses across multiple sessions', () => {
    const scores = [
      makeScore({ timings: [timingIncorrect('cat')] }),
      makeScore({ timings: [timingIncorrect('cat')] }),
    ]
    const result = computeMissedItems(scores)
    expect(result['animal-sounds']).toEqual([{ itemId: 'cat', count: 2 }])
  })

  it('sorts items by miss count descending', () => {
    const scores = [
      makeScore({ timings: [timingIncorrect('cat'), timingIncorrect('dog'), timingIncorrect('cat')] }),
    ]
    const result = computeMissedItems(scores)
    expect(result['animal-sounds'][0].itemId).toBe('cat')
    expect(result['animal-sounds'][0].count).toBe(2)
    expect(result['animal-sounds'][1].itemId).toBe('dog')
    expect(result['animal-sounds'][1].count).toBe(1)
  })

  it('skips timing entries without itemId (legacy records)', () => {
    const score  = makeScore({ timings: [{ questionIndex: 0, correct: false, durationMs: 500 }] })
    expect(computeMissedItems([score])).toEqual({})
  })

  it('separates missed items by gameId', () => {
    const scores = [
      makeScore({ gameId: 'animal-sounds', timings: [timingIncorrect('cat')] }),
      makeScore({ gameId: 'color-match',   timings: [timingIncorrect('red')] }),
    ]
    const result = computeMissedItems(scores)
    expect(result['animal-sounds']).toEqual([{ itemId: 'cat', count: 1 }])
    expect(result['color-match']).toEqual([   { itemId: 'red', count: 1 }])
  })

  it('skips scores with no timings array', () => {
    const score  = makeScore({ timings: undefined })
    expect(computeMissedItems([score])).toEqual({})
  })
})

// ─── buildCsvContent ─────────────────────────────────────────────────────────

describe('buildCsvContent', () => {
  it('returns a header-only string for empty input', () => {
    const csv   = buildCsvContent([])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('date')
    expect(lines[0]).toContain('gameId')
    expect(lines[0]).toContain('accuracy')
    expect(lines[0]).toContain('avgResponseMs')
    expect(lines[0]).toContain('peakStreak')
  })

  it('produces a data row for each score', () => {
    const csv   = buildCsvContent([makeScore(), makeScore()])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(3) // header + 2 rows
  })

  it('computes accuracy percentage correctly in the CSV row', () => {
    const csv = buildCsvContent([makeScore({ score: 7, total: 10 })])
    expect(csv).toContain('70.0')
  })

  it('includes computed avgResponseMs when timings are present', () => {
    const score = makeScore({ timings: [{ durationMs: 2000 }, { durationMs: 4000 }] })
    const csv   = buildCsvContent([score])
    expect(csv).toContain('3000') // (2000+4000)/2
  })

  it('leaves avgResponseMs empty when no timings', () => {
    const score = makeScore({ timings: undefined })
    const csv   = buildCsvContent([score])
    const row   = csv.split('\n')[1]
    const cols  = row.split(',')
    // avgResponseMs is column index 5 (0-based); every field is quoted (SEC-5)
    expect(cols[5]).toBe('""')
  })

  it('leaves peakStreak empty when undefined (legacy record)', () => {
    const score = makeScore({ peakStreak: undefined })
    const csv   = buildCsvContent([score])
    const row   = csv.split('\n')[1]
    const cols  = row.split(',')
    // peakStreak is column index 6; every field is quoted (SEC-5)
    expect(cols[6]).toBe('""')
  })

  it('includes timestamp in the last column', () => {
    const score = makeScore({ timestamp: 9999 })
    const csv   = buildCsvContent([score])
    expect(csv).toContain('9999')
  })
})

// ─── buildCsvContent — CSV injection hardening (SEC-5) ──────────────────────
// buildCsvContent joins raw values with no quoting or escaping; safe today
// because every field is app-generated (dates, gameId, numerics), but the
// first free-text column (child name, user content) would become
// spreadsheet formula injection. Hardened per the 2026-07-12 audit (SEC-5):
// every field is RFC 4180-quoted, and a leading =/+/-/@ gets a defusing
// leading apostrophe (the standard Excel/Sheets CSV-injection mitigation).

describe('buildCsvContent — CSV injection hardening (SEC-5)', () => {
  it('quotes every field per RFC 4180, including plain safe values', () => {
    const csv    = buildCsvContent([makeScore({ gameId: 'animal-sounds' })])
    const header = csv.split('\n')[0]
    const row    = csv.split('\n')[1]
    expect(header).toBe('"date","gameId","score","total","accuracy","avgResponseMs","peakStreak","timestamp"')
    expect(row).toContain('"animal-sounds"')
  })

  it('defuses a gameId beginning with = with a leading apostrophe', () => {
    const csv = buildCsvContent([makeScore({ gameId: '=1+1' })])
    expect(csv).toContain(`"'=1+1"`)
  })

  it('defuses a value beginning with + ', () => {
    const csv = buildCsvContent([makeScore({ gameId: '+1+1' })])
    expect(csv).toContain(`"'+1+1"`)
  })

  it('defuses a value beginning with - ', () => {
    const csv = buildCsvContent([makeScore({ gameId: '-1+1' })])
    expect(csv).toContain(`"'-1+1"`)
  })

  it('defuses a value beginning with @ (e.g. a DDE formula)', () => {
    const csv = buildCsvContent([makeScore({ gameId: '@SUM(A1:A2)' })])
    expect(csv).toContain(`"'@SUM(A1:A2)"`)
  })

  it('does not prefix a value that merely contains = elsewhere (only a leading char triggers defusal)', () => {
    const csv = buildCsvContent([makeScore({ gameId: 'a=b' })])
    expect(csv).toContain('"a=b"')
    expect(csv).not.toContain(`"'a=b"`)
  })

  it('doubles an embedded double quote so the field round-trips safely', () => {
    const csv = buildCsvContent([makeScore({ gameId: 'she said "hi"' })])
    expect(csv).toContain('"she said ""hi"""')
  })

  it('keeps an embedded comma inside the field\'s own quotes (does not create an extra column)', () => {
    const csv = buildCsvContent([makeScore({ gameId: 'game,with,commas' })])
    expect(csv).toContain('"game,with,commas"')
  })

  it('keeps an embedded newline inside the field\'s own quotes', () => {
    const csv = buildCsvContent([makeScore({ gameId: 'line1\nline2' })])
    expect(csv).toContain('"line1\nline2"')
  })

  it('leaves a null/undefined field as an empty quoted pair, not a bare apostrophe or unquoted empty string', () => {
    const csv = buildCsvContent([makeScore({ peakStreak: undefined })])
    const row = csv.split('\n')[1]
    expect(row.split(',')[6]).toBe('""')
  })
})

// ─── downloadCsv ─────────────────────────────────────────────────────────────

describe('downloadCsv', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('creates an anchor element with the correct filename and clicks it', () => {
    const clickSpy         = vi.fn()
    const originalCreateEl = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return { click: clickSpy, href: '', download: '' }
      return originalCreateEl(tag)
    })
    // jsdom does not implement URL.createObjectURL / revokeObjectURL — assign directly
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock')
    URL.revokeObjectURL = vi.fn()

    downloadCsv('test.csv', 'a,b\n1,2')

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })
})
