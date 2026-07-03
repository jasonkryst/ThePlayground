import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetBadgeData, mockSaveBadgeData } = vi.hoisted(() => ({
  mockGetBadgeData: vi.fn(),
  mockSaveBadgeData: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../storage/index', () => ({
  default: {
    getBadgeData: mockGetBadgeData,
    saveBadgeData: mockSaveBadgeData,
  },
}))

import useBadges from '../useBadges'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBadgeData.mockResolvedValue({ awards: { 'animal-sounds': { hotStreak: 1 } }, lifetimeQuestions: { 'animal-sounds': 45 } })
})

describe('useBadges', () => {
  it('loads the stored badge data', async () => {
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.lifetimeQuestions['animal-sounds']).toBe(45))
    expect(result.current.badgeData.awards['animal-sounds']).toEqual({ hotStreak: 1 })
  })

  it('awardSession crosses a totalQuestions tier and returns its resolved catalog entry', async () => {
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.lifetimeQuestions['animal-sounds']).toBe(45))

    let earned
    await act(async () => {
      earned = await result.current.awardSession('animal-sounds', { peakStreak: 0, isPerfect: false, questionsAnswered: 10 })
    })

    expect(earned.map(b => b.id)).toEqual(['gettingStarted']) // 45 -> 55 crosses the 50-question tier
    expect(result.current.badgeData.lifetimeQuestions['animal-sounds']).toBe(55)
  })

  it('awardSession returns resolved catalog entries for badges earned this session', async () => {
    mockGetBadgeData.mockResolvedValue({ awards: {}, lifetimeQuestions: { 'animal-sounds': 0 } })
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.lifetimeQuestions['animal-sounds']).toBe(0))

    let earned
    await act(async () => {
      earned = await result.current.awardSession('animal-sounds', { peakStreak: 5, isPerfect: true, questionsAnswered: 10 })
    })

    expect(earned.map(b => b.id)).toEqual(['hotStreak', 'perfectSession'])
    expect(earned[0].icon).toBe('🔥')
  })

  it('awardSession increments an existing badge count rather than resetting it', async () => {
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.awards['animal-sounds']).toEqual({ hotStreak: 1 }))

    await act(async () => {
      await result.current.awardSession('animal-sounds', { peakStreak: 5, isPerfect: false, questionsAnswered: 10 })
    })

    expect(result.current.badgeData.awards['animal-sounds'].hotStreak).toBe(2)
  })

  it('awardSession tracks lifetimeQuestions and awards independently per gameId', async () => {
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.lifetimeQuestions['animal-sounds']).toBe(45))

    await act(async () => {
      await result.current.awardSession('color-match', { peakStreak: 0, isPerfect: false, questionsAnswered: 10 })
    })

    expect(result.current.badgeData.lifetimeQuestions).toEqual({ 'animal-sounds': 45, 'color-match': 10 })
    expect(mockSaveBadgeData).toHaveBeenCalledWith(
      expect.objectContaining({ lifetimeQuestions: { 'animal-sounds': 45, 'color-match': 10 } })
    )
  })
})
