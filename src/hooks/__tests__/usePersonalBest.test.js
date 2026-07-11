import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetPersonalBests, mockSavePersonalBests } = vi.hoisted(() => ({
  mockGetPersonalBests: vi.fn(),
  mockSavePersonalBests: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../storage/index', () => ({
  default: {
    getPersonalBests: mockGetPersonalBests,
    savePersonalBests: mockSavePersonalBests,
  },
}))

import usePersonalBest from '../usePersonalBest'

const timings = (...corrects) => corrects.map((correct, i) => ({
  questionIndex: i, itemId: `item-${i}`, correct, durationMs: 1000, attemptNumber: 1,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPersonalBests.mockResolvedValue({
    'animal-sounds': { accuracy: { ratio: 0.7, score: 7, total: 10, timestamp: 1 } },
  })
})

describe('usePersonalBest', () => {
  it('loads the stored personal best for the given gameId', async () => {
    const { result } = renderHook(() => usePersonalBest('animal-sounds'))
    await waitFor(() => expect(result.current.personalBest).toEqual({
      accuracy: { ratio: 0.7, score: 7, total: 10, timestamp: 1 },
    }))
  })

  it('defaults to null when no best is stored for the gameId', async () => {
    const { result } = renderHook(() => usePersonalBest('color-match'))
    await waitFor(() => expect(mockGetPersonalBests).toHaveBeenCalled())
    expect(result.current.personalBest).toBe(null)
  })

  it('recordSession persists an improved accuracy record and updates personalBest', async () => {
    const { result } = renderHook(() => usePersonalBest('animal-sounds'))
    await waitFor(() => expect(result.current.personalBest).not.toBe(null))

    let outcome
    await act(async () => {
      outcome = await result.current.recordSession({ score: 9, total: 10, timings: timings(...Array(9).fill(true), false), minAccuracyPct: 70 })
    })

    expect(outcome.accuracy.isNewRecord).toBe(true)
    expect(mockSavePersonalBests).toHaveBeenCalledWith(
      expect.objectContaining({ 'animal-sounds': expect.objectContaining({ accuracy: expect.objectContaining({ ratio: 0.9 }) }) })
    )
    expect(result.current.personalBest.accuracy.ratio).toBe(0.9)
  })

  it('recordSession does not report a record when the session does not improve on the stored best', async () => {
    const { result } = renderHook(() => usePersonalBest('animal-sounds'))
    await waitFor(() => expect(result.current.personalBest).not.toBe(null))

    let outcome
    await act(async () => {
      outcome = await result.current.recordSession({ score: 5, total: 10, timings: timings(...Array(5).fill(true), ...Array(5).fill(false)), minAccuracyPct: 70 })
    })

    expect(outcome.accuracy.isNewRecord).toBe(false)
  })

  it('recordMemorySession persists an improved fewest-flips record and updates personalBest', async () => {
    mockGetPersonalBests.mockResolvedValue({
      'animal-memory-match': { fewestFlips: { 5: { flips: 9, timestamp: 1 } } },
    })
    const { result } = renderHook(() => usePersonalBest('animal-memory-match'))
    await waitFor(() => expect(result.current.personalBest).not.toBe(null))

    let outcome
    await act(async () => {
      outcome = await result.current.recordMemorySession({ flipAttempts: 7, pairs: 5 })
    })

    expect(outcome.fewestFlips.isNewRecord).toBe(true)
    expect(outcome.fewestFlips.previous).toEqual({ flips: 9, timestamp: 1 })
    expect(mockSavePersonalBests).toHaveBeenCalledWith(
      expect.objectContaining({
        'animal-memory-match': expect.objectContaining({ fewestFlips: expect.objectContaining({ 5: expect.objectContaining({ flips: 7 }) }) }),
      })
    )
    expect(result.current.personalBest.fewestFlips[5].flips).toBe(7)
  })

  it('recordMemorySession does not report a record when the session does not improve the stored best', async () => {
    mockGetPersonalBests.mockResolvedValue({
      'animal-memory-match': { fewestFlips: { 5: { flips: 7, timestamp: 1 } } },
    })
    const { result } = renderHook(() => usePersonalBest('animal-memory-match'))
    await waitFor(() => expect(result.current.personalBest).not.toBe(null))

    let outcome
    await act(async () => {
      outcome = await result.current.recordMemorySession({ flipAttempts: 12, pairs: 5 })
    })

    expect(outcome.fewestFlips.isNewRecord).toBe(false)
    expect(result.current.personalBest.fewestFlips[5].flips).toBe(7)
  })

  it('keeps separate bests per gameId', async () => {
    const { result: animalResult } = renderHook(() => usePersonalBest('animal-sounds'))
    const { result: colorResult } = renderHook(() => usePersonalBest('color-match'))
    await waitFor(() => expect(animalResult.current.personalBest).not.toBe(null))
    await waitFor(() => expect(colorResult.current.personalBest).toBe(null))

    await act(async () => {
      await colorResult.current.recordSession({ score: 10, total: 10, timings: timings(...Array(10).fill(true)), minAccuracyPct: 70 })
    })

    expect(mockSavePersonalBests).toHaveBeenCalledWith(
      expect.objectContaining({
        'animal-sounds': expect.objectContaining({ accuracy: expect.objectContaining({ ratio: 0.7 }) }),
        'color-match': expect.objectContaining({ accuracy: expect.objectContaining({ ratio: 1 }) }),
      })
    )
  })
})
