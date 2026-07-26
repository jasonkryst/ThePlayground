import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetItemStats, mockSaveItemStats } = vi.hoisted(() => ({
  mockGetItemStats: vi.fn(),
  mockSaveItemStats: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../storage/index', () => ({
  default: {
    getItemStats: mockGetItemStats,
    saveItemStats: mockSaveItemStats,
  },
}))

import useItemStats from '../useItemStats'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetItemStats.mockResolvedValue({
    'animal-sounds': { dog: { missCount: 1, lastMissedAt: 1700000000000 } },
  })
})

describe('useItemStats', () => {
  it('loads the stored stats for the given gameId', async () => {
    const { result } = renderHook(() => useItemStats('animal-sounds'))
    await waitFor(() => expect(result.current.itemStats).toEqual({
      dog: { missCount: 1, lastMissedAt: 1700000000000 },
    }))
  })

  it('defaults to an empty object when no stats exist for the gameId', async () => {
    const { result } = renderHook(() => useItemStats('color-match'))
    await waitFor(() => expect(mockGetItemStats).toHaveBeenCalled())
    expect(result.current.itemStats).toEqual({})
  })

  it('recordMisses increments missCount and updates lastMissedAt for each missed item', async () => {
    const { result } = renderHook(() => useItemStats('animal-sounds'))
    await waitFor(() => expect(Object.keys(result.current.itemStats)).toContain('dog'))

    await act(async () => { await result.current.recordMisses(['dog', 'cat']) })

    expect(result.current.itemStats.dog.missCount).toBe(2)
    expect(result.current.itemStats.cat.missCount).toBe(1)
    expect(mockSaveItemStats).toHaveBeenCalledWith(
      expect.objectContaining({
        'animal-sounds': expect.objectContaining({
          dog: expect.objectContaining({ missCount: 2 }),
          cat: expect.objectContaining({ missCount: 1 }),
        }),
      })
    )
  })

  it('recordMisses with an empty list is a no-op — no save call', async () => {
    const { result } = renderHook(() => useItemStats('animal-sounds'))
    await waitFor(() => expect(Object.keys(result.current.itemStats)).toContain('dog'))

    await act(async () => { await result.current.recordMisses([]) })

    expect(mockSaveItemStats).not.toHaveBeenCalled()
  })

  it('keeps separate stats per gameId', async () => {
    const { result: animalResult } = renderHook(() => useItemStats('animal-sounds'))
    const { result: colorResult } = renderHook(() => useItemStats('color-match'))
    await waitFor(() => expect(Object.keys(animalResult.current.itemStats)).toContain('dog'))

    await act(async () => { await colorResult.current.recordMisses(['red']) })

    expect(mockSaveItemStats).toHaveBeenCalledWith(
      expect.objectContaining({
        'animal-sounds': expect.objectContaining({ dog: expect.objectContaining({ missCount: 1 }) }),
        'color-match': expect.objectContaining({ red: expect.objectContaining({ missCount: 1 }) }),
      })
    )
  })
})
