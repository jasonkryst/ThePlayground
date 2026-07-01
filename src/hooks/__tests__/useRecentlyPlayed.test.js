import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import useRecentlyPlayed from '../useRecentlyPlayed'

const mockAdapter = vi.hoisted(() => ({ getScores: vi.fn() }))
vi.mock('../../storage/index', () => ({ default: mockAdapter }))

const TODAY    = new Date(); TODAY.setHours(12, 0, 0, 0)
const YESTERDAY = new Date(TODAY); YESTERDAY.setDate(TODAY.getDate() - 1)
const THREE_AGO = new Date(TODAY); THREE_AGO.setDate(TODAY.getDate() - 3)

const makeScore = (gameId, timestamp) => ({
  gameId, score: 8, total: 10,
  date: new Date(timestamp).toISOString().split('T')[0],
  timestamp,
})

beforeEach(() => { vi.clearAllMocks() })

describe('useRecentlyPlayed', () => {
  it('returns empty Map when no scores exist', async () => {
    mockAdapter.getScores.mockResolvedValue([])
    const { result } = renderHook(() => useRecentlyPlayed())
    await act(async () => {})
    expect(result.current.size).toBe(0)
  })

  it('derives lastPlayed and playCount from score records', async () => {
    mockAdapter.getScores.mockResolvedValue([
      makeScore('animal-sounds', TODAY.getTime()),
      makeScore('animal-sounds', YESTERDAY.getTime()),
    ])
    const { result } = renderHook(() => useRecentlyPlayed())
    await act(async () => {})
    const info = result.current.get('animal-sounds')
    expect(info.playCount).toBe(2)
    expect(info.lastPlayed.getTime()).toBe(TODAY.getTime())
  })

  it('tracks multiple games independently', async () => {
    mockAdapter.getScores.mockResolvedValue([
      makeScore('animal-sounds', TODAY.getTime()),
      makeScore('color-match', YESTERDAY.getTime()),
    ])
    const { result } = renderHook(() => useRecentlyPlayed())
    await act(async () => {})
    expect(result.current.get('animal-sounds').playCount).toBe(1)
    expect(result.current.get('color-match').playCount).toBe(1)
    expect(result.current.get('animal-sounds').lastPlayed.getTime()).toBe(TODAY.getTime())
  })

  it('uses the most recent timestamp as lastPlayed', async () => {
    mockAdapter.getScores.mockResolvedValue([
      makeScore('animal-sounds', THREE_AGO.getTime()),
      makeScore('animal-sounds', TODAY.getTime()),
      makeScore('animal-sounds', YESTERDAY.getTime()),
    ])
    const { result } = renderHook(() => useRecentlyPlayed())
    await act(async () => {})
    expect(result.current.get('animal-sounds').lastPlayed.getTime()).toBe(TODAY.getTime())
    expect(result.current.get('animal-sounds').playCount).toBe(3)
  })

  it('ignores scores with no timestamp', async () => {
    mockAdapter.getScores.mockResolvedValue([
      { gameId: 'animal-sounds', score: 5, total: 10, date: '2026-01-01' },
    ])
    const { result } = renderHook(() => useRecentlyPlayed())
    await act(async () => {})
    expect(result.current.size).toBe(0)
  })
})
