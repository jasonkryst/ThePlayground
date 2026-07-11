import { describe, it, expect } from 'vitest'
import { computeBestAccuracy, computeFewestFlips } from '../kidStats'

describe('computeBestAccuracy', () => {
  it('returns the highest rounded accuracy percentage across a game\'s sessions', () => {
    const scores = [
      { gameId: 'animal-sounds', score: 9, total: 10 },
      { gameId: 'animal-sounds', score: 6, total: 10 },
      { gameId: 'color-match',   score: 10, total: 10 },
    ]
    expect(computeBestAccuracy(scores, 'animal-sounds')).toBe(90)
  })

  it('rounds a fractional percentage to the nearest whole number', () => {
    const scores = [{ gameId: 'animal-sounds', score: 2, total: 3 }] // 66.666...%
    expect(computeBestAccuracy(scores, 'animal-sounds')).toBe(67)
  })

  it('returns null for an empty scores array', () => {
    expect(computeBestAccuracy([], 'animal-sounds')).toBeNull()
  })

  it('returns null when no session matches the given gameId', () => {
    const scores = [{ gameId: 'color-match', score: 8, total: 10 }]
    expect(computeBestAccuracy(scores, 'animal-sounds')).toBeNull()
  })

  it('skips a session with total 0 instead of producing NaN/Infinity', () => {
    const scores = [
      { gameId: 'animal-sounds', score: 0, total: 0 },
      { gameId: 'animal-sounds', score: 5, total: 10 },
    ]
    expect(computeBestAccuracy(scores, 'animal-sounds')).toBe(50)
  })

  it('returns null when every matching session has total 0', () => {
    const scores = [{ gameId: 'animal-sounds', score: 0, total: 0 }]
    expect(computeBestAccuracy(scores, 'animal-sounds')).toBeNull()
  })
})

describe('computeFewestFlips', () => {
  it('returns the lowest flip count across a game\'s sessions', () => {
    const scores = [
      { gameId: 'animal-memory-match', score: 5, total: 5, flipAttempts: 12 },
      { gameId: 'animal-memory-match', score: 5, total: 5, flipAttempts: 8 },
    ]
    expect(computeFewestFlips(scores, 'animal-memory-match')).toBe(8)
  })

  it('ignores sessions from other games', () => {
    const scores = [
      { gameId: 'other-memory', score: 3, total: 3, flipAttempts: 3 },
      { gameId: 'animal-memory-match', score: 5, total: 5, flipAttempts: 9 },
    ]
    expect(computeFewestFlips(scores, 'animal-memory-match')).toBe(9)
  })

  it('ignores records without a usable flipAttempts value', () => {
    const scores = [
      { gameId: 'animal-memory-match', score: 9, total: 10 },
      { gameId: 'animal-memory-match', score: 5, total: 5, flipAttempts: 0 },
      { gameId: 'animal-memory-match', score: 5, total: 5, flipAttempts: 11 },
    ]
    expect(computeFewestFlips(scores, 'animal-memory-match')).toBe(11)
  })

  it('returns null when the game has no sessions with flip counts', () => {
    expect(computeFewestFlips([], 'animal-memory-match')).toBeNull()
    expect(computeFewestFlips([{ gameId: 'animal-memory-match', score: 9, total: 10 }], 'animal-memory-match')).toBeNull()
  })
})
