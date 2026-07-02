import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockAddScore, mockFireConfetti, mockRecordStreak, mockUpdateSetting } = vi.hoisted(() => ({
  mockAddScore: vi.fn().mockResolvedValue(undefined),
  mockFireConfetti: vi.fn(),
  mockRecordStreak: vi.fn().mockResolvedValue(undefined),
  mockUpdateSetting: vi.fn().mockResolvedValue(undefined),
}))

let mockSettings = {
  numChoices: 2, feedbackMode: 'parent-tap', questionsPerSession: 3, animationsEnabled: true,
  timerDisplayEnabled: true,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false,
  introDismissed: {},
}
let mockLoaded = true

vi.mock('../useSettings', () => ({
  default: () => ({ settings: mockSettings, loaded: mockLoaded, updateSetting: mockUpdateSetting }),
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

function setSettings(overrides) {
  mockSettings = { ...mockSettings, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoaded = true
  mockSettings = {
    numChoices: 2, feedbackMode: 'parent-tap', questionsPerSession: 3, animationsEnabled: true,
    timerDisplayEnabled: true,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false,
    introDismissed: {},
  }
})

describe('useGameSession — existing behavior', () => {
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
    setSettings({ animationsEnabled: false })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(mockFireConfetti).not.toHaveBeenCalled()
  })

  it('wrong answer with default maxTries locks immediately, resets streak, adds missed item', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    expect(result.current.locked).toBe(true)
    expect(result.current.streak).toBe(0)
    expect(result.current.missed).toEqual([correctItem])
    expect(mockFireConfetti).not.toHaveBeenCalled()
  })

  it('handleChoice is a no-op once locked', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    await act(async () => { result.current.handleChoice(correctItem) })
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.score).toBe(1)
  })

  it('advance() moves to the next question and resets locked/selected', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    await act(async () => { result.current.handleChoice(result.current.current.correct) })
    await act(async () => { result.current.advance() })

    expect(result.current.index).toBe(1)
    expect(result.current.locked).toBe(false)
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

  it('records a timing entry with attemptNumber for a correct answer', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.timings).toHaveLength(1)
    expect(result.current.timings[0].questionIndex).toBe(0)
    expect(result.current.timings[0].correct).toBe(true)
    expect(result.current.timings[0].attemptNumber).toBe(1)
    expect(result.current.timings[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('clears timings on restart', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    await act(async () => { result.current.handleChoice(result.current.current.correct) })
    expect(result.current.timings).toHaveLength(1)

    await act(async () => { result.current.restart() })
    expect(result.current.timings).toHaveLength(0)
  })

  it('includes peakStreak in the addScore call after completing a session', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    for (let i = 0; i < 3; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(mockAddScore).toHaveBeenCalledWith(
      expect.objectContaining({ peakStreak: expect.any(Number) })
    )
  })

  it('calls onTimeout after timeLimitMs ms if not yet locked', () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const { result } = renderHook(() =>
      useGameSession({ gameId: 'test-game', items, timeLimitMs: 5000, onTimeout })
    )
    act(() => {})
    expect(result.current.current).toBeDefined()

    act(() => { vi.advanceTimersByTime(5001) })
    expect(onTimeout).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('does not call onTimeout if the question was already locked', () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const { result } = renderHook(() =>
      useGameSession({ gameId: 'test-game', items, timeLimitMs: 5000, onTimeout })
    )
    act(() => {})
    expect(result.current.current).toBeDefined()

    act(() => { result.current.handleChoice(result.current.current.correct) })
    act(() => { vi.advanceTimersByTime(5001) })
    expect(onTimeout).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('currentElapsedMs ticks up even without a timeLimitMs', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    act(() => {})
    expect(result.current.currentElapsedMs).toBe(0)

    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current.currentElapsedMs).toBeGreaterThanOrEqual(300)
    vi.useRealTimers()
  })
})

describe('useGameSession — retries and maxTries', () => {
  it('maxTries=2 allows one retry before locking', async () => {
    setSettings({ maxTries: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    expect(result.current.locked).toBe(false)
    expect(result.current.disabledChoiceIds).toEqual([wrongItem.id])
  })

  it('correct answer on a retry still resolves the question and scores it', async () => {
    setSettings({ maxTries: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.locked).toBe(true)
    expect(result.current.score).toBe(1)
  })

  it('exhausting maxTries with 3 choices locks the question as wrong after 2 wrong taps', async () => {
    setSettings({ maxTries: 2, numChoices: 3 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItems = result.current.current.choices.filter(c => c.id !== correctItem.id)
    expect(wrongItems.length).toBeGreaterThanOrEqual(2)

    await act(async () => { result.current.handleChoice(wrongItems[0]) })
    await act(async () => { result.current.handleChoice(wrongItems[1]) })

    expect(result.current.locked).toBe(true)
    expect(result.current.missed).toEqual([correctItem])
  })

  it('maxTries="unlimited" never locks on a wrong answer', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 3 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItems = result.current.current.choices.filter(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItems[0]) })
    await act(async () => { result.current.handleChoice(wrongItems[1]) })

    expect(result.current.locked).toBe(false)
    expect(result.current.disabledChoiceIds).toEqual([wrongItems[0].id, wrongItems[1].id])
  })

  it('a disabled wrong choice is tracked in disabledChoiceIds and stays there after further taps', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 3 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.disabledChoiceIds).toContain(wrongItem.id)
  })

  it('advance() resets disabledChoiceIds and wrongAttempts-derived hintActive for the next question', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 3, hintsEnabled: true, hintAfterWrongTaps: 1 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    expect(result.current.hintActive).toBe(true)

    await act(async () => { result.current.handleChoice(correctItem) })
    await act(async () => { result.current.advance() })

    expect(result.current.disabledChoiceIds).toEqual([])
    expect(result.current.hintActive).toBe(false)
  })
})

describe('useGameSession — retryCountsAsStreak', () => {
  it('retryCountsAsStreak=true keeps the streak alive after a correct-on-retry', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 3, retryCountsAsStreak: true })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.streak).toBe(1)
  })

  it('retryCountsAsStreak=false resets the streak even on a correct-on-retry', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 3, retryCountsAsStreak: false })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.streak).toBe(0)
    expect(result.current.score).toBe(1) // still scored correct, just no streak
  })
})

describe('useGameSession — hints', () => {
  it('hintActive is false before hintAfterWrongTaps is reached', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 4, hintsEnabled: true, hintAfterWrongTaps: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItems = result.current.current.choices.filter(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItems[0]) })

    expect(result.current.hintActive).toBe(false)
  })

  it('hintActive becomes true once hintAfterWrongTaps is reached', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 4, hintsEnabled: true, hintAfterWrongTaps: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItems = result.current.current.choices.filter(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItems[0]) })
    await act(async () => { result.current.handleChoice(wrongItems[1]) })

    expect(result.current.hintActive).toBe(true)
  })

  it('hintActive stays false when hintsEnabled is false, regardless of wrong taps', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 4, hintsEnabled: false, hintAfterWrongTaps: 1 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    expect(result.current.hintActive).toBe(false)
  })
})

describe('useGameSession — spaced repetition', () => {
  it('reinserts a missed item into the queue when spacedRepetitionEnabled is true', async () => {
    setSettings({ spacedRepetitionEnabled: true, questionsPerSession: 4 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(4))

    const missedCorrect = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== missedCorrect.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    await act(async () => { result.current.advance() })

    // Walk the rest of the queue and confirm the missed item's id reappears as a `.correct.id`
    const seenCorrectIds = []
    while (!result.current.done) {
      seenCorrectIds.push(result.current.current.correct.id)
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }
    expect(seenCorrectIds.filter(id => id === missedCorrect.id).length).toBeGreaterThanOrEqual(1)
  })

  it('does not reinsert when spacedRepetitionEnabled is false', async () => {
    setSettings({ spacedRepetitionEnabled: false, questionsPerSession: 4 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(4))

    const missedCorrect = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== missedCorrect.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    await act(async () => { result.current.advance() })

    const seenCorrectIds = []
    while (!result.current.done) {
      seenCorrectIds.push(result.current.current.correct.id)
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }
    expect(seenCorrectIds.filter(id => id === missedCorrect.id)).toHaveLength(0)
  })

  it('stays locked after a wrong tap that triggers reinsertion (parent-tap mode)', async () => {
    // Regression test: reinsertMissed() gives the queue a new array reference,
    // which must not re-trigger the per-question reset effect and undo the
    // setLocked(true) that handleChoice just applied for this same question.
    setSettings({ spacedRepetitionEnabled: true, questionsPerSession: 4, feedbackMode: 'parent-tap' })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(4))

    const missedCorrect = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== missedCorrect.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    expect(result.current.locked).toBe(true)
    expect(result.current.index).toBe(0)
  })
})

describe('useGameSession — difficulty auto-progression', () => {
  it('offers a difficulty bump after a perfect session when enabled and below the ceiling', async () => {
    setSettings({ difficultyAutoProgressionEnabled: true, numChoices: 2, questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(result.current.offerDifficultyBump).toBe(true)
  })

  it('does not offer a bump when the session was not perfect', async () => {
    setSettings({ difficultyAutoProgressionEnabled: true, numChoices: 2, questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    const wrongItem = result.current.current.choices.find(c => c.id !== result.current.current.correct.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    await act(async () => { result.current.advance() })
    await act(async () => { result.current.handleChoice(result.current.current.correct) })
    await act(async () => { result.current.advance() })

    expect(result.current.offerDifficultyBump).toBe(false)
  })

  it('does not offer a bump when numChoices is already at the ceiling of 4', async () => {
    setSettings({ difficultyAutoProgressionEnabled: true, numChoices: 4, questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(result.current.offerDifficultyBump).toBe(false)
  })

  it('does not offer a bump when the setting is disabled', async () => {
    setSettings({ difficultyAutoProgressionEnabled: false, numChoices: 2, questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(result.current.offerDifficultyBump).toBe(false)
  })

  it('acceptDifficultyBump raises numChoices by 1 and clears the offer', async () => {
    setSettings({ difficultyAutoProgressionEnabled: true, numChoices: 2, questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }
    await act(async () => { result.current.acceptDifficultyBump() })

    expect(mockUpdateSetting).toHaveBeenCalledWith('numChoices', 3)
    expect(result.current.offerDifficultyBump).toBe(false)
  })

  it('dismissDifficultyBump clears the offer without changing settings', async () => {
    setSettings({ difficultyAutoProgressionEnabled: true, numChoices: 2, questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }
    await act(async () => { result.current.dismissDifficultyBump() })

    expect(mockUpdateSetting).not.toHaveBeenCalled()
    expect(result.current.offerDifficultyBump).toBe(false)
  })

  it('restart() clears offerDifficultyBump', async () => {
    setSettings({ difficultyAutoProgressionEnabled: true, numChoices: 2, questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }
    await act(async () => { result.current.restart() })

    expect(result.current.offerDifficultyBump).toBe(false)
  })
})

describe('useGameSession — how-to-play intro', () => {
  it('shows the intro on initial mount when the game has no introDismissed entry', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.settingsLoaded).toBe(true))
    expect(result.current.showIntro).toBe(true)
  })

  it('does not show the intro when introDismissed is set for this gameId', async () => {
    setSettings({ introDismissed: { 'test-game': true } })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.settingsLoaded).toBe(true))
    expect(result.current.showIntro).toBe(false)
  })

  it('shows the intro when only a different gameId is dismissed', async () => {
    setSettings({ introDismissed: { 'other-game': true } })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.settingsLoaded).toBe(true))
    expect(result.current.showIntro).toBe(true)
  })

  it('settingsLoaded and showIntro are both false before settings resolve', () => {
    mockLoaded = false
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    expect(result.current.settingsLoaded).toBe(false)
    expect(result.current.showIntro).toBe(false)
  })

  it('dismissIntro(false) hides the intro without persisting a setting', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.showIntro).toBe(true))

    await act(async () => { result.current.dismissIntro(false) })

    expect(result.current.showIntro).toBe(false)
    expect(mockUpdateSetting).not.toHaveBeenCalled()
  })

  it('dismissIntro(true) hides the intro and persists introDismissed for this gameId', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.showIntro).toBe(true))

    await act(async () => { result.current.dismissIntro(true) })

    expect(result.current.showIntro).toBe(false)
    expect(mockUpdateSetting).toHaveBeenCalledWith('introDismissed', { 'test-game': true })
  })

  it('dismissIntro(true) preserves other games\' existing introDismissed entries', async () => {
    setSettings({ introDismissed: { 'other-game': true } })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.showIntro).toBe(true))

    await act(async () => { result.current.dismissIntro(true) })

    expect(mockUpdateSetting).toHaveBeenCalledWith('introDismissed', { 'other-game': true, 'test-game': true })
  })

  it('showIntro does not reappear after restart()', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.showIntro).toBe(true))

    await act(async () => { result.current.dismissIntro(false) })
    await act(async () => { result.current.restart() })

    expect(result.current.showIntro).toBe(false)
  })

  it('setDontShowAgain toggles the dontShowAgain flag, defaulting to false', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.settingsLoaded).toBe(true))
    expect(result.current.dontShowAgain).toBe(false)

    act(() => { result.current.setDontShowAgain(true) })

    expect(result.current.dontShowAgain).toBe(true)
  })
})
