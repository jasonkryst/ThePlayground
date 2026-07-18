import { describe, it, expect, vi, afterEach } from 'vitest'
import evaluatePersonalBest from '../evaluatePersonalBest'

const timings = (...corrects) => corrects.map((correct, i) => ({
  questionIndex: i, itemId: `item-${i}`, correct, durationMs: 1000 + i * 100, attemptNumber: 1,
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('evaluatePersonalBest', () => {
  it('on a first-ever session (no previous), persists both bests but announces neither', () => {
    vi.spyOn(Date, 'now').mockReturnValue(5000)
    const result = evaluatePersonalBest({
      score: 8, total: 10, timings: timings(true, true, true, true, true, true, true, true, false, false),
      minAccuracyPct: 70, previous: null,
    })

    expect(result.accuracy.isNewRecord).toBe(false)
    expect(result.speed.isNewRecord).toBe(false)
    expect(result.updatedBests.accuracy).toEqual({ ratio: 0.8, score: 8, total: 10, timestamp: 5000 })
    expect(result.updatedBests.speedMs).toBeDefined()
  })

  it('announces a new accuracy record when the ratio improves over the previous one', () => {
    vi.spyOn(Date, 'now').mockReturnValue(9000)
    const previous = { accuracy: { ratio: 0.7, score: 7, total: 10, timestamp: 1000 } }
    const result = evaluatePersonalBest({
      score: 9, total: 10, timings: timings(...Array(9).fill(true), false),
      minAccuracyPct: 70, previous,
    })

    expect(result.accuracy.isNewRecord).toBe(true)
    expect(result.accuracy.previous).toEqual(previous.accuracy)
    expect(result.updatedBests.accuracy).toEqual({ ratio: 0.9, score: 9, total: 10, timestamp: 9000 })
  })

  it('does not announce a record when the ratio ties the previous one', () => {
    const previous = { accuracy: { ratio: 0.8, score: 8, total: 10, timestamp: 1000 } }
    const result = evaluatePersonalBest({
      score: 8, total: 10, timings: timings(...Array(8).fill(true), false, false),
      minAccuracyPct: 70, previous,
    })

    expect(result.accuracy.isNewRecord).toBe(false)
    expect(result.updatedBests.accuracy).toEqual(previous.accuracy)
  })

  it('does not announce a record when the ratio is lower than the previous one', () => {
    const previous = { accuracy: { ratio: 0.9, score: 9, total: 10, timestamp: 1000 } }
    const result = evaluatePersonalBest({
      score: 5, total: 10, timings: timings(...Array(5).fill(true), ...Array(5).fill(false)),
      minAccuracyPct: 70, previous,
    })

    expect(result.accuracy.isNewRecord).toBe(false)
    expect(result.updatedBests.accuracy).toEqual(previous.accuracy)
  })

  it('is speed-eligible and beats the previous average when accuracy meets the gate and is faster', () => {
    const previous = { speedMs: { avgMs: 2000, timestamp: 1000 } }
    const result = evaluatePersonalBest({
      score: 8, total: 10,
      timings: [
        { questionIndex: 0, itemId: 'a', correct: true, durationMs: 1000, attemptNumber: 1 },
        { questionIndex: 1, itemId: 'b', correct: true, durationMs: 1200, attemptNumber: 1 },
        { questionIndex: 2, itemId: 'c', correct: false, durationMs: 5000, attemptNumber: 1 },
      ],
      minAccuracyPct: 70, previous,
    })

    expect(result.speed.isNewRecord).toBe(true)
    expect(result.speed.value).toBe(1100) // avg of the two correct durations, wrong excluded
    expect(result.updatedBests.speedMs.avgMs).toBe(1100)
  })

  it('is not speed-eligible when session accuracy is below minAccuracyPct, even if fast', () => {
    const previous = { speedMs: { avgMs: 5000, timestamp: 1000 } }
    const result = evaluatePersonalBest({
      score: 1, total: 10,
      timings: [
        { questionIndex: 0, itemId: 'a', correct: true, durationMs: 100, attemptNumber: 1 },
        ...Array.from({ length: 9 }, (_, i) => ({ questionIndex: i + 1, itemId: `x${i}`, correct: false, durationMs: 100, attemptNumber: 1 })),
      ],
      minAccuracyPct: 70, previous,
    })

    expect(result.speed.isNewRecord).toBe(false)
    expect(result.updatedBests.speedMs).toEqual(previous.speedMs)
  })

  it('is speed-eligible exactly at the minAccuracyPct boundary', () => {
    const result = evaluatePersonalBest({
      score: 7, total: 10,
      timings: [
        ...Array.from({ length: 7 }, (_, i) => ({ questionIndex: i, itemId: `c${i}`, correct: true, durationMs: 1000, attemptNumber: 1 })),
        ...Array.from({ length: 3 }, (_, i) => ({ questionIndex: i + 7, itemId: `w${i}`, correct: false, durationMs: 1000, attemptNumber: 1 })),
      ],
      minAccuracyPct: 70, previous: null,
    })

    expect(result.updatedBests.speedMs).toBeDefined()
  })

  it('does not evaluate a speed record when there are zero correct answers (no divide-by-zero)', () => {
    const previous = { speedMs: { avgMs: 5000, timestamp: 1000 } }
    const result = evaluatePersonalBest({
      score: 0, total: 5,
      timings: Array.from({ length: 5 }, (_, i) => ({ questionIndex: i, itemId: `x${i}`, correct: false, durationMs: 100, attemptNumber: 1 })),
      minAccuracyPct: 70, previous,
    })

    expect(result.speed.isNewRecord).toBe(false)
    expect(result.speed.value).toBe(null)
    expect(result.updatedBests.speedMs).toEqual(previous.speedMs)
  })

  it('reports zero accuracy without dividing by zero when total is 0', () => {
    const result = evaluatePersonalBest({
      score: 0, total: 0, timings: [], minAccuracyPct: 70, previous: null,
    })

    expect(result.accuracy.value).toBe(0)
    expect(result.updatedBests.accuracy.ratio).toBe(0)
  })

  it('does not treat a tied average duration as an improvement', () => {
    const previous = { speedMs: { avgMs: 1000, timestamp: 111 } }
    const result = evaluatePersonalBest({
      score: 1, total: 1,
      timings: [{ questionIndex: 0, itemId: 'a', correct: true, durationMs: 1000, attemptNumber: 1 }],
      minAccuracyPct: 70, previous,
    })

    expect(result.speed.isNewRecord).toBe(false)
    expect(result.updatedBests.speedMs).toEqual(previous.speedMs)
  })

  it('does not persist a speed record when accuracy is below the eligibility gate, even on a first session', () => {
    const result = evaluatePersonalBest({
      score: 1, total: 2,
      timings: [
        { questionIndex: 0, itemId: 'a', correct: true, durationMs: 500, attemptNumber: 1 },
        { questionIndex: 1, itemId: 'b', correct: false, durationMs: 500, attemptNumber: 1 },
      ],
      minAccuracyPct: 90, previous: null,
    })

    expect(result.speed.isNewRecord).toBe(false)
    expect(result.updatedBests.speedMs).toBeUndefined()
  })
})
