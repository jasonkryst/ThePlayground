import { describe, it, expect } from 'vitest'
import evaluateMemoryPersonalBest from '../evaluateMemoryPersonalBest'

describe('evaluateMemoryPersonalBest', () => {
  it('persists the first session at a board size without announcing a record', () => {
    const { fewestFlips, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 9, pairs: 5, previous: null })
    expect(fewestFlips.isNewRecord).toBe(false)
    expect(fewestFlips.value).toBe(9)
    expect(fewestFlips.previous).toBe(null)
    expect(updatedBests.fewestFlips[5]).toEqual({ flips: 9, timestamp: expect.any(Number) })
  })

  it('announces and persists a record when the session uses fewer flips at the same board size', () => {
    const previous = { fewestFlips: { 5: { flips: 9, timestamp: 1 } } }
    const { fewestFlips, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 7, pairs: 5, previous })
    expect(fewestFlips.isNewRecord).toBe(true)
    expect(fewestFlips.value).toBe(7)
    expect(fewestFlips.previous).toEqual({ flips: 9, timestamp: 1 })
    expect(updatedBests.fewestFlips[5].flips).toBe(7)
  })

  it('does not announce or persist when the session ties or is worse than the stored best', () => {
    const previous = { fewestFlips: { 5: { flips: 7, timestamp: 1 } } }
    for (const flipAttempts of [7, 12]) {
      const { fewestFlips, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts, pairs: 5, previous })
      expect(fewestFlips.isNewRecord).toBe(false)
      expect(updatedBests.fewestFlips[5]).toEqual({ flips: 7, timestamp: 1 })
    }
  })

  it('tracks board sizes independently — a 3-pair session never beats a 5-pair record', () => {
    const previous = { fewestFlips: { 5: { flips: 9, timestamp: 1 } } }
    const { fewestFlips, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 4, pairs: 3, previous })
    expect(fewestFlips.isNewRecord).toBe(false) // first 3-pair session, not a beaten record
    expect(updatedBests.fewestFlips[3].flips).toBe(4)
    expect(updatedBests.fewestFlips[5]).toEqual({ flips: 9, timestamp: 1 })
  })

  it('preserves unrelated personal-best fields on the game record', () => {
    const previous = { accuracy: { ratio: 0.8, score: 8, total: 10, timestamp: 1 } }
    const { updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 6, pairs: 4, previous })
    expect(updatedBests.accuracy).toEqual(previous.accuracy)
  })
})
