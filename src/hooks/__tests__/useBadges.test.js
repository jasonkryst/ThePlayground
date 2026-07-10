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

vi.mock('../../lib/badges', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    GAME_BADGE_CATALOGS: {
      'memory-test-game': [
        { id: 'sharpMind', icon: '🧠', nameKey: 'x.sharpMind.name', descKey: 'x.sharpMind.desc', kind: 'session', earned: s => s.flipAttempts <= s.pairs + 2 },
        { id: 'pairSpotter', icon: '🐾', nameKey: 'x.pairSpotter.name', descKey: 'x.pairSpotter.desc', kind: 'lifetime', counter: 'pairsMatched', tier: 25 },
      ],
    },
  }
})

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

describe('awardSession for games with their own badge catalog', () => {
  it('awards session and lifetime game badges and persists lifetimeCounters', async () => {
    mockGetBadgeData.mockResolvedValue({ awards: {}, lifetimeQuestions: {}, lifetimeCounters: { 'memory-test-game': { pairsMatched: 22 } } })
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.lifetimeCounters['memory-test-game'].pairsMatched).toBe(22))

    let earned
    await act(async () => {
      earned = await result.current.awardSession('memory-test-game', {
        sessionStats: { pairs: 5, flipAttempts: 7 },
        counterIncrements: { pairsMatched: 5 },
      })
    })

    expect(earned.map(b => b.id)).toEqual(['sharpMind', 'pairSpotter']) // 22 -> 27 crosses 25
    expect(earned[0].icon).toBe('🧠')
    expect(result.current.badgeData.lifetimeCounters['memory-test-game'].pairsMatched).toBe(27)
    expect(result.current.badgeData.awards['memory-test-game']).toEqual({ sharpMind: 1, pairSpotter: 1 })
    expect(mockSaveBadgeData).toHaveBeenCalledWith(
      expect.objectContaining({ lifetimeCounters: { 'memory-test-game': { pairsMatched: 27 } } })
    )
  })

  it('awards nothing when the session is inefficient and no tier is crossed', async () => {
    mockGetBadgeData.mockResolvedValue({ awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} })
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.lifetimeCounters).toEqual({}))

    let earned
    await act(async () => {
      earned = await result.current.awardSession('memory-test-game', {
        sessionStats: { pairs: 5, flipAttempts: 15 },
        counterIncrements: { pairsMatched: 5 },
      })
    })
    expect(earned).toEqual([])
    expect(result.current.badgeData.lifetimeCounters['memory-test-game'].pairsMatched).toBe(5)
  })

  it('does not touch lifetimeQuestions for game-catalog games, nor lifetimeCounters for quiz games', async () => {
    mockGetBadgeData.mockResolvedValue({ awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} })
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.awards).toEqual({}))

    await act(async () => {
      await result.current.awardSession('memory-test-game', { sessionStats: { pairs: 3, flipAttempts: 99 }, counterIncrements: { pairsMatched: 3 } })
      await result.current.awardSession('animal-sounds', { peakStreak: 0, isPerfect: false, questionsAnswered: 10 })
    })

    expect(result.current.badgeData.lifetimeQuestions).toEqual({ 'animal-sounds': 10 })
    expect(result.current.badgeData.lifetimeCounters).toEqual({ 'memory-test-game': { pairsMatched: 3 } })
  })

  it('tolerates stored badge data without a lifetimeCounters key (pre-existing installs)', async () => {
    mockGetBadgeData.mockResolvedValue({ awards: {}, lifetimeQuestions: {} })
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.awards).toEqual({}))

    let earned
    await act(async () => {
      earned = await result.current.awardSession('memory-test-game', {
        sessionStats: { pairs: 5, flipAttempts: 6 },
        counterIncrements: { pairsMatched: 5 },
      })
    })
    expect(earned.map(b => b.id)).toEqual(['sharpMind'])
  })
})
