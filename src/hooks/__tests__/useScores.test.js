import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import useScores from '../useScores'

const mockAdapter = vi.hoisted(() => ({
  getScores: vi.fn(),
  addScore: vi.fn(),
}))

vi.mock('../../storage/index', () => ({ default: mockAdapter }))

const makeScore = (gameId, score, total, timestamp = Date.now()) => ({
  gameId, score, total,
  date: new Date(timestamp).toISOString().split('T')[0],
  timestamp,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockAdapter.addScore.mockResolvedValue(undefined)
})

describe('useScores', () => {
  it('addScore appends a record and refreshes state', async () => {
    const newScore = makeScore('animal-sounds', 8, 10, 3000)
    mockAdapter.getScores
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([newScore])
    const { result } = renderHook(() => useScores())
    await act(async () => {})
    await act(async () => {
      await result.current.addScore(newScore)
    })
    expect(mockAdapter.addScore).toHaveBeenCalledTimes(1)
    expect(result.current.getAllScores()).toHaveLength(1)
    expect(result.current.getAllScores()[0].score).toBe(8)
  })

  it('getBestScore returns highest score for a game', async () => {
    mockAdapter.getScores.mockResolvedValue([
      makeScore('animal-sounds', 5, 10, 1000),
      makeScore('animal-sounds', 9, 10, 2000),
      makeScore('animal-sounds', 7, 10, 3000),
    ])
    const { result } = renderHook(() => useScores())
    await act(async () => {})
    expect(result.current.getBestScore('animal-sounds')).toBe(9)
  })

  it('getBestScore returns 0 when no scores exist', async () => {
    mockAdapter.getScores.mockResolvedValue([])
    const { result } = renderHook(() => useScores())
    await act(async () => {})
    expect(result.current.getBestScore('animal-sounds')).toBe(0)
  })

  it('getScoresByGame returns only matching scores newest first', async () => {
    mockAdapter.getScores.mockResolvedValue([
      makeScore('animal-sounds', 5, 10, 1000),
      makeScore('colors', 3, 10, 1500),
      makeScore('animal-sounds', 9, 10, 2000),
    ])
    const { result } = renderHook(() => useScores())
    await act(async () => {})
    const scores = result.current.getScoresByGame('animal-sounds')
    expect(scores).toHaveLength(2)
    expect(scores[0].timestamp).toBe(2000)
    expect(scores[1].timestamp).toBe(1000)
  })

  it('getAllScores returns full history', async () => {
    const all = [
      makeScore('animal-sounds', 5, 10, 1000),
      makeScore('colors', 3, 10, 2000),
    ]
    mockAdapter.getScores.mockResolvedValue(all)
    const { result } = renderHook(() => useScores())
    await act(async () => {})
    expect(result.current.getAllScores()).toHaveLength(2)
  })
})
