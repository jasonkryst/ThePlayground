import { describe, it, expect } from 'vitest'
import computeGameBadgeAwards from '../computeGameBadgeAwards'

const CATALOG = [
  { id: 'sharpMind', kind: 'session', earned: s => s.flipAttempts <= s.pairs + 2 },
  { id: 'matchStreak', kind: 'session', earned: s => s.peakMatchStreak >= 3 },
  { id: 'pairSpotter', kind: 'lifetime', counter: 'pairsMatched', tier: 25 },
  { id: 'pairPro', kind: 'lifetime', counter: 'pairsMatched', tier: 100 },
]

describe('computeGameBadgeAwards', () => {
  it('awards a session badge whose predicate passes', () => {
    const earned = computeGameBadgeAwards({
      catalog: CATALOG,
      sessionStats: { pairs: 5, flipAttempts: 6, peakMatchStreak: 2 },
      prevCounters: {}, nextCounters: { pairsMatched: 5 },
    })
    expect(earned).toEqual(['sharpMind'])
  })

  it('does not award a session badge whose predicate fails', () => {
    const earned = computeGameBadgeAwards({
      catalog: CATALOG,
      sessionStats: { pairs: 5, flipAttempts: 12, peakMatchStreak: 0 },
      prevCounters: {}, nextCounters: { pairsMatched: 5 },
    })
    expect(earned).toEqual([])
  })

  it('awards a lifetime badge when the counter crosses its tier', () => {
    const earned = computeGameBadgeAwards({
      catalog: CATALOG,
      sessionStats: { pairs: 5, flipAttempts: 20, peakMatchStreak: 0 },
      prevCounters: { pairsMatched: 24 }, nextCounters: { pairsMatched: 29 },
    })
    expect(earned).toEqual(['pairSpotter'])
  })

  it('does not re-award a lifetime tier already crossed', () => {
    const earned = computeGameBadgeAwards({
      catalog: CATALOG,
      sessionStats: { pairs: 5, flipAttempts: 20, peakMatchStreak: 0 },
      prevCounters: { pairsMatched: 30 }, nextCounters: { pairsMatched: 35 },
    })
    expect(earned).toEqual([])
  })

  it('treats a counter missing from both maps as zero (no award)', () => {
    const earned = computeGameBadgeAwards({
      catalog: [{ id: 'x', kind: 'lifetime', counter: 'unknownCounter', tier: 1 }],
      sessionStats: {}, prevCounters: {}, nextCounters: {},
    })
    expect(earned).toEqual([])
  })
})
