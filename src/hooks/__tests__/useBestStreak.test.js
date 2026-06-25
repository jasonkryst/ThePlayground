import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetBestStreaks, mockSaveBestStreaks } = vi.hoisted(() => ({
  mockGetBestStreaks: vi.fn(),
  mockSaveBestStreaks: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../storage/index', () => ({
  default: {
    getBestStreaks: mockGetBestStreaks,
    saveBestStreaks: mockSaveBestStreaks,
  },
}))

import useBestStreak from '../useBestStreak'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBestStreaks.mockResolvedValue({ 'animal-sounds': 4 })
})

describe('useBestStreak', () => {
  it('loads the stored best streak for the given gameId', async () => {
    const { result } = renderHook(() => useBestStreak('animal-sounds'))
    await waitFor(() => expect(result.current.bestStreak).toBe(4))
  })

  it('defaults to 0 when no streak is stored for the gameId', async () => {
    const { result } = renderHook(() => useBestStreak('color-match'))
    await waitFor(() => expect(result.current.bestStreak).toBe(0))
  })

  it('persists a new best streak when it exceeds the stored value', async () => {
    const { result } = renderHook(() => useBestStreak('animal-sounds'))
    await waitFor(() => expect(result.current.bestStreak).toBe(4))

    await act(async () => { await result.current.recordStreak(6) })

    expect(mockSaveBestStreaks).toHaveBeenCalledWith({ 'animal-sounds': 6 })
    expect(result.current.bestStreak).toBe(6)
  })

  it('does not persist when the new streak is lower than the stored value', async () => {
    const { result } = renderHook(() => useBestStreak('animal-sounds'))
    await waitFor(() => expect(result.current.bestStreak).toBe(4))

    await act(async () => { await result.current.recordStreak(2) })

    expect(mockSaveBestStreaks).not.toHaveBeenCalled()
    expect(result.current.bestStreak).toBe(4)
  })

  it('does not persist when the new streak equals the stored value', async () => {
    const { result } = renderHook(() => useBestStreak('animal-sounds'))
    await waitFor(() => expect(result.current.bestStreak).toBe(4))

    await act(async () => { await result.current.recordStreak(4) })

    expect(mockSaveBestStreaks).not.toHaveBeenCalled()
  })
})
