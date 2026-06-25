import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockAddScore, mockFireConfetti, mockRecordStreak } = vi.hoisted(() => ({
  mockAddScore: vi.fn().mockResolvedValue(undefined),
  mockFireConfetti: vi.fn(),
  mockRecordStreak: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../useSettings', () => ({
  default: () => ({
    settings: { numChoices: 2, feedbackMode: 'parent-tap', questionsPerSession: 3, animationsEnabled: true },
  }),
}))

vi.mock('../useScores', () => ({
  default: () => ({ addScore: mockAddScore }),
}))

vi.mock('../useBestStreak', () => ({
  default: () => ({ bestStreak: 4, recordStreak: mockRecordStreak }),
}))

vi.mock('../../lib/confetti', () => ({
  fireConfetti: mockFireConfetti,
}))

import useGameSession from '../useGameSession'

const items = [
  { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' },
]

beforeEach(() => { vi.clearAllMocks() })

describe('useGameSession', () => {
  it('loads a queue sized to questionsPerSession', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(3))
  })

  it('correct answer increments score and streak, fires confetti, records streak', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.score).toBe(1)
    expect(result.current.streak).toBe(1)
    expect(mockFireConfetti).toHaveBeenCalledTimes(1)
    expect(mockRecordStreak).toHaveBeenCalledWith(1)
  })

  it('does not fire confetti when animationsEnabled is false', async () => {
    vi.doMock('../useSettings', () => ({
      default: () => ({
        settings: { numChoices: 2, feedbackMode: 'parent-tap', questionsPerSession: 3, animationsEnabled: false },
      }),
    }))
    vi.resetModules()
    const { default: useGameSessionNoAnim } = await import('../useGameSession')
    const { result } = renderHook(() => useGameSessionNoAnim({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(mockFireConfetti).not.toHaveBeenCalled()
  })

  it('wrong answer resets streak to 0 and adds the missed item, does not fire confetti', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    expect(result.current.streak).toBe(0)
    expect(result.current.missed).toEqual([correctItem])
    expect(mockFireConfetti).not.toHaveBeenCalled()
  })

  it('handleChoice is a no-op once already answered', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    await act(async () => { result.current.handleChoice(correctItem) })
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.score).toBe(1)
  })

  it('advance() moves to the next question and resets answered/selected', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    await act(async () => { result.current.handleChoice(result.current.current.correct) })
    await act(async () => { result.current.advance() })

    expect(result.current.index).toBe(1)
    expect(result.current.answered).toBe(false)
    expect(result.current.selected).toBe(null)
  })

  it('advance() past the last question calls addScore and sets done', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    for (let i = 0; i < 3; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(result.current.done).toBe(true)
    expect(mockAddScore).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: 'test-game', score: 3, total: 3 })
    )
  })

  it('restart() rebuilds the queue and clears score, streak, missed, done', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const wrongItem = result.current.current.choices.find(c => c.id !== result.current.current.correct.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    await act(async () => { result.current.restart() })

    expect(result.current.score).toBe(0)
    expect(result.current.streak).toBe(0)
    expect(result.current.missed).toEqual([])
    expect(result.current.done).toBe(false)
    expect(result.current.index).toBe(0)
  })
})
