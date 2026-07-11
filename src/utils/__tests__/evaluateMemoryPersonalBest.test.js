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

  describe('fastest-board record', () => {
    it('persists the first session time at a board size without announcing a record', () => {
      const { fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 9, durationMs: 42000, pairs: 5, previous: null })
      expect(fastestMs.isNewRecord).toBe(false)
      expect(fastestMs.value).toBe(42000)
      expect(fastestMs.previous).toBe(null)
      expect(updatedBests.fastestMs[5]).toEqual({ ms: 42000, timestamp: expect.any(Number) })
    })

    it('announces and persists a record when the session is strictly faster at the same board size', () => {
      const previous = { fastestMs: { 5: { ms: 42000, timestamp: 1 } } }
      const { fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 9, durationMs: 38500, pairs: 5, previous })
      expect(fastestMs.isNewRecord).toBe(true)
      expect(fastestMs.value).toBe(38500)
      expect(fastestMs.previous).toEqual({ ms: 42000, timestamp: 1 })
      expect(updatedBests.fastestMs[5].ms).toBe(38500)
    })

    it('does not announce or persist on a tie or a slower time', () => {
      const previous = { fastestMs: { 5: { ms: 38500, timestamp: 1 } } }
      for (const durationMs of [38500, 60000]) {
        const { fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 9, durationMs, pairs: 5, previous })
        expect(fastestMs.isNewRecord).toBe(false)
        expect(updatedBests.fastestMs[5]).toEqual({ ms: 38500, timestamp: 1 })
      }
    })

    it('tracks board sizes independently — a 3-pair time never beats a 5-pair record', () => {
      const previous = { fastestMs: { 5: { ms: 42000, timestamp: 1 } } }
      const { fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 4, durationMs: 20000, pairs: 3, previous })
      expect(fastestMs.isNewRecord).toBe(false) // first 3-pair session, not a beaten record
      expect(updatedBests.fastestMs[3].ms).toBe(20000)
      expect(updatedBests.fastestMs[5]).toEqual({ ms: 42000, timestamp: 1 })
    })

    it('evaluates flips and time independently — time can improve while flips worsen', () => {
      const previous = {
        fewestFlips: { 5: { flips: 7, timestamp: 1 } },
        fastestMs:   { 5: { ms: 40000, timestamp: 1 } },
      }
      const { fewestFlips, fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 12, durationMs: 30000, pairs: 5, previous })
      expect(fewestFlips.isNewRecord).toBe(false)
      expect(fastestMs.isNewRecord).toBe(true)
      expect(updatedBests.fewestFlips[5]).toEqual({ flips: 7, timestamp: 1 })
      expect(updatedBests.fastestMs[5].ms).toBe(30000)
    })

    it('evaluates flips and time independently — flips can improve while time worsens', () => {
      const previous = {
        fewestFlips: { 5: { flips: 7, timestamp: 1 } },
        fastestMs:   { 5: { ms: 40000, timestamp: 1 } },
      }
      const { fewestFlips, fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 5, durationMs: 55000, pairs: 5, previous })
      expect(fewestFlips.isNewRecord).toBe(true)
      expect(fastestMs.isNewRecord).toBe(false)
      expect(updatedBests.fewestFlips[5].flips).toBe(5)
      expect(updatedBests.fastestMs[5]).toEqual({ ms: 40000, timestamp: 1 })
    })

    it('treats a pre-fastestMs stored record (legacy shape) as a first time-session while flips still evaluate', () => {
      const previous = { fewestFlips: { 5: { flips: 9, timestamp: 1 } } }
      const { fewestFlips, fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 7, durationMs: 35000, pairs: 5, previous })
      expect(fastestMs.isNewRecord).toBe(false)
      expect(fastestMs.previous).toBe(null)
      expect(updatedBests.fastestMs[5]).toEqual({ ms: 35000, timestamp: expect.any(Number) })
      expect(fewestFlips.isNewRecord).toBe(true)
      expect(updatedBests.fewestFlips[5].flips).toBe(7)
    })

    it('skips the time record entirely when durationMs is not provided', () => {
      const { fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 9, pairs: 5, previous: null })
      expect(fastestMs.isNewRecord).toBe(false)
      expect(fastestMs.value).toBe(null)
      expect(updatedBests.fastestMs).toBeUndefined()
    })
  })
})
