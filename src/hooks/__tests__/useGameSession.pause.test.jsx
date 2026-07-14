import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { OrientationGateContext } from '../../components/OrientationGateContext'

let mockSettings
vi.mock('../useSettings', () => ({
  default: () => ({ settings: mockSettings, loaded: true, updateSetting: vi.fn() }),
}))
vi.mock('../useScores', () => ({ default: () => ({ addScore: vi.fn().mockResolvedValue(undefined) }) }))
vi.mock('../useBestStreak', () => ({
  default: () => ({ bestStreak: 0, recordStreak: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('../usePersonalBest', () => ({
  default: () => ({
    personalBest: null,
    recordSession: vi.fn().mockResolvedValue({ accuracy: { isNewRecord: false }, speed: { isNewRecord: false } }),
  }),
}))
vi.mock('../useBadges', () => ({ default: () => ({ awardSession: vi.fn().mockResolvedValue([]) }) }))
vi.mock('../../lib/confetti', () => ({ fireConfetti: vi.fn() }))

import useGameSession from '../useGameSession'

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

// Live gate whose blocked value tests flip at will (same pattern as
// useMemorySession.pause.test.jsx).
let setBlocked
function Wrapper({ children }) {
  const [blocked, set] = useState(false)
  setBlocked = set
  return (
    <OrientationGateContext.Provider value={{ blocked }}>
      {children}
    </OrientationGateContext.Provider>
  )
}

// useSettings is mocked synchronously (loaded: true), so mounting under fake
// timers works — one empty act() flushes the queue/intro effects. This is the
// same idiom as the countdown tests in useGameSession.test.js.
function renderSession() {
  const hook = renderHook(() => useGameSession({ gameId: 'test-game', items }), { wrapper: Wrapper })
  act(() => {})
  expect(hook.result.current.current).toBeDefined()
  return hook
}

beforeEach(() => {
  mockSettings = {
    numChoices: 2, feedbackMode: 'parent-tap', questionsPerSession: 3, animationsEnabled: false,
    timerMode: 'countdown', timeLimitSeconds: 10, speedRecordMinAccuracy: 70,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false,
    introDismissed: { 'test-game': true }, soundEffectsEnabled: true,
  }
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('useGameSession — orientation pause', () => {
  it('suspends the countdown while blocked and resumes with the remaining time', () => {
    const { result } = renderSession()

    act(() => { vi.advanceTimersByTime(5000) })  // 5s of the 10s budget consumed
    act(() => setBlocked(true))
    act(() => { vi.advanceTimersByTime(60_000) }) // a minute behind the overlay
    expect(result.current.timedOut).toBe(false)   // countdown did NOT fire while blocked

    act(() => setBlocked(false))
    act(() => { vi.advanceTimersByTime(4800) })   // 9.8s total consumed
    expect(result.current.timedOut).toBe(false)
    act(() => { vi.advanceTimersByTime(400) })    // crosses the 10s budget
    expect(result.current.timedOut).toBe(true)
  })

  it('ignores handleChoice while blocked, accepts input again after unblocking', () => {
    const { result } = renderSession()

    act(() => setBlocked(true))
    act(() => { result.current.handleChoice(result.current.current.correct) })
    expect(result.current.score).toBe(0)
    expect(result.current.timings).toHaveLength(0)

    act(() => setBlocked(false))
    act(() => { result.current.handleChoice(result.current.current.correct) })
    expect(result.current.score).toBe(1)
  })

  it('freezes the elapsed clock while blocked', () => {
    const { result } = renderSession()

    act(() => { vi.advanceTimersByTime(1000) })
    const before = result.current.currentElapsedMs
    expect(before).toBeGreaterThanOrEqual(900)

    act(() => setBlocked(true))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.currentElapsedMs).toBe(before)
  })

  it('excludes time behind the overlay from recorded durationMs', () => {
    mockSettings = { ...mockSettings, timerMode: 'countUp' }
    const { result } = renderSession()

    act(() => { vi.advanceTimersByTime(1000) })
    act(() => setBlocked(true))
    act(() => { vi.advanceTimersByTime(60_000) })
    act(() => setBlocked(false))

    act(() => { result.current.handleChoice(result.current.current.correct) })
    const { durationMs } = result.current.timings[0]
    expect(durationMs).toBeGreaterThanOrEqual(1000)
    expect(durationMs).toBeLessThan(10_000) // nowhere near the 60s block
  })

  it('negative: a never-blocked session times out on the original schedule', () => {
    const { result } = renderSession()

    act(() => { vi.advanceTimersByTime(9000) })
    expect(result.current.timedOut).toBe(false)
    act(() => { vi.advanceTimersByTime(1200) })
    expect(result.current.timedOut).toBe(true)
  })

  it('negative: countUp mode survives block/unblock cycles without a countdown appearing', () => {
    mockSettings = { ...mockSettings, timerMode: 'countUp' }
    const { result } = renderSession()

    act(() => setBlocked(true))
    act(() => { vi.advanceTimersByTime(120_000) })
    act(() => setBlocked(false))
    act(() => { vi.advanceTimersByTime(120_000) })
    expect(result.current.timedOut).toBe(false)
    expect(result.current.timings).toHaveLength(0)
  })
})
