import { describe, it, expect } from 'vitest'
import { computeBestAccuracy } from '../kidStats'

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
