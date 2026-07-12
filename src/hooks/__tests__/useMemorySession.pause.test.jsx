import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { OrientationGateContext } from '../../components/OrientationGateContext'

const { mockAddScore, mockGetSettings } = vi.hoisted(() => ({
  mockAddScore: vi.fn().mockResolvedValue(undefined),
  mockGetSettings: vi.fn(),
}))

vi.mock('../../storage/index', () => ({
  DEFAULT_SETTINGS: { memoryPairs: 5, animationsEnabled: true, soundEffectsEnabled: true, timerMode: 'countUp', introDismissed: {} },
  default: {
    getSettings: mockGetSettings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
    getScores: vi.fn().mockResolvedValue([]),
    addScore: mockAddScore,
    getBadgeData: vi.fn().mockResolvedValue({ awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} }),
    saveBadgeData: vi.fn().mockResolvedValue(undefined),
    getBestStreaks: vi.fn().mockResolvedValue({}),
    saveBestStreaks: vi.fn().mockResolvedValue(undefined),
    getPersonalBests: vi.fn().mockResolvedValue({}),
    savePersonalBests: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../lib/badges', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    GAME_BADGE_CATALOGS: { ...actual.GAME_BADGE_CATALOGS, 'test-memory': [] },
  }
})

vi.mock('../../lib/confetti', () => ({
  fireConfetti: vi.fn(),
  fireFireworks: vi.fn(),
  FIREWORKS_BURSTS: 6,
  FIREWORKS_INTERVAL_MS: 350,
}))

import useMemorySession from '../useMemorySession'

const ITEMS = [
  { id: 'dog' }, { id: 'cat' }, { id: 'cow' },
  { id: 'duck' }, { id: 'frog' }, { id: 'lion' },
]

const SETTINGS = {
  memoryPairs: 3, animationsEnabled: true, soundEffectsEnabled: true,
  timerMode: 'countUp', introDismissed: { 'test-memory': true },
}

function findPair(tiles) {
  const down = tiles.filter(t => t.state === 'down')
  for (const t of down) {
    const twin = down.find(o => o.itemId === t.itemId && o.tileId !== t.tileId)
    if (twin) return [t.tileId, twin.tileId]
  }
  return null
}

// Renders the hook inside a live OrientationGateContext whose blocked value
// tests can flip at will — simulating the gate without any matchMedia.
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

async function renderSession() {
  const hook = renderHook(
    () => useMemorySession({ gameId: 'test-memory', items: ITEMS }),
    { wrapper: Wrapper }
  )
  await waitFor(() => expect(hook.result.current.tiles.length).toBe(6))
  return hook
}

async function completeBoard(result) {
  for (let i = 0; i < 3; i++) {
    const pair = findPair(result.current.tiles)
    act(() => result.current.flipTile(pair[0]))
    act(() => result.current.flipTile(pair[1]))
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSettings.mockResolvedValue(SETTINGS)
})
afterEach(() => vi.useRealTimers())

describe('useMemorySession — orientation pause', () => {
  // NOTE: fake timers only AFTER renderSession() — its waitFor polls with
  // real timers (same caveat as useMemorySession.test.js).

  it('ignores flips while blocked, and accepts them again after unblocking', async () => {
    const { result } = await renderSession()
    const pair = findPair(result.current.tiles)

    act(() => setBlocked(true))
    act(() => result.current.flipTile(pair[0]))
    expect(result.current.tiles.every(t => t.state === 'down')).toBe(true)
    expect(result.current.flipAttempts).toBe(0)

    act(() => setBlocked(false))
    act(() => result.current.flipTile(pair[0]))
    act(() => result.current.flipTile(pair[1]))
    expect(result.current.pairsFound).toBe(1)
  })

  it('freezes the elapsed clock while blocked', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()
    // The tick interval from initial mount was created with real timers
    // (mount happens during renderSession's real-timer waitFor, before this
    // vi.useFakeTimers() call) — vi.advanceTimersByTime cannot drive a
    // pre-existing real interval. Toggling blocked forces the tick effect to
    // tear down and recreate its interval under the now-fake clock; the
    // round trip is a no-op for elapsed time since no real time passes here.
    act(() => setBlocked(true))
    act(() => setBlocked(false))

    act(() => vi.advanceTimersByTime(1000))
    const beforeBlock = result.current.currentElapsedMs
    expect(beforeBlock).toBeGreaterThanOrEqual(1000)

    act(() => setBlocked(true))
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.currentElapsedMs).toBe(beforeBlock)
  })

  it('excludes blocked time from the saved durationMs', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()

    act(() => vi.advanceTimersByTime(1000))
    act(() => setBlocked(true))
    act(() => vi.advanceTimersByTime(60_000))
    act(() => setBlocked(false))

    await completeBoard(result)
    // waitFor's real-timer polling hangs here under fake timers (see file-
    // level caveat); fall back to the idiom used by the existing
    // useMemorySession.test.js completion tests.
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(mockAddScore).toHaveBeenCalled()
    const { durationMs } = mockAddScore.mock.calls[0][0]
    expect(durationMs).toBeGreaterThanOrEqual(1000)
    expect(durationMs).toBeLessThan(10_000) // nowhere near the 60s block
  })

  it('negative: a never-blocked session counts time continuously', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()

    act(() => vi.advanceTimersByTime(2000))
    await completeBoard(result)
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(mockAddScore).toHaveBeenCalled()
    const { durationMs } = mockAddScore.mock.calls[0][0]
    expect(durationMs).toBeGreaterThanOrEqual(2000)
  })

  it('negative: blocking after completion does not corrupt the recorded duration', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()

    act(() => vi.advanceTimersByTime(1000))
    await completeBoard(result)
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(mockAddScore).toHaveBeenCalled()
    const recorded = mockAddScore.mock.calls[0][0].durationMs

    act(() => setBlocked(true))
    act(() => vi.advanceTimersByTime(5000))
    act(() => setBlocked(false))
    expect(mockAddScore).toHaveBeenCalledTimes(1)
    expect(mockAddScore.mock.calls[0][0].durationMs).toBe(recorded)
  })
})
