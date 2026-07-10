import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockAddScore, mockGetSettings, mockSaveBadgeData } = vi.hoisted(() => ({
  mockAddScore: vi.fn().mockResolvedValue(undefined),
  mockGetSettings: vi.fn(),
  mockSaveBadgeData: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../storage/index', () => ({
  // Brief's mock omitted DEFAULT_SETTINGS, which the real useSettings imports
  // as a named export; added here so the real hook loads. See task-6-report.md.
  DEFAULT_SETTINGS: { memoryPairs: 5, animationsEnabled: true, soundEffectsEnabled: true, timerMode: 'countUp', introDismissed: {} },
  default: {
    getSettings: mockGetSettings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
    getScores: vi.fn().mockResolvedValue([]),
    addScore: mockAddScore,
    getBadgeData: vi.fn().mockResolvedValue({ awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} }),
    saveBadgeData: mockSaveBadgeData,
  },
}))

// useBadges only takes the lifetime-counters branch for a gameId that has a
// registered game badge catalog (src/games/<id>/badges.js, auto-discovered
// via import.meta.glob). No such folder exists for the 'test-memory' fixture
// id, so give it an (empty, harmless) catalog here to exercise that branch.
vi.mock('../../lib/badges', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    GAME_BADGE_CATALOGS: { ...actual.GAME_BADGE_CATALOGS, 'test-memory': [] },
  }
})

const { mockFireConfetti, mockFireFireworks } = vi.hoisted(() => ({
  mockFireConfetti: vi.fn(),
  mockFireFireworks: vi.fn(),
}))
vi.mock('../../lib/confetti', () => ({
  fireConfetti: mockFireConfetti,
  fireFireworks: mockFireFireworks,
  FIREWORKS_BURSTS: 6,
  FIREWORKS_INTERVAL_MS: 350,
}))

import useMemorySession, { MISMATCH_DELAY_MS, COMPLETE_DELAY_MS } from '../useMemorySession'

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

function findNonPair(tiles) {
  const down = tiles.filter(t => t.state === 'down')
  const a = down[0]
  const b = down.find(t => t.itemId !== a.itemId)
  return [a.tileId, b.tileId]
}

async function renderSession() {
  const hook = renderHook(() => useMemorySession({ gameId: 'test-memory', items: ITEMS }))
  await waitFor(() => expect(hook.result.current.tiles.length).toBe(6))
  return hook
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSettings.mockResolvedValue(SETTINGS)
})
afterEach(() => vi.useRealTimers())

describe('useMemorySession', () => {
  it('builds a deck of 2×memoryPairs face-down tiles', async () => {
    const { result } = await renderSession()
    expect(result.current.totalPairs).toBe(3)
    expect(result.current.tiles.every(t => t.state === 'down')).toBe(true)
  })

  it('matching pair stays revealed, fires confetti, emits a match event', async () => {
    const { result } = await renderSession()
    const [a, b] = findPair(result.current.tiles)
    act(() => result.current.flipTile(a))
    act(() => result.current.flipTile(b))
    const matched = result.current.tiles.filter(t => t.state === 'matched')
    expect(matched.map(t => t.tileId).sort()).toEqual([a, b].sort())
    expect(result.current.pairsFound).toBe(1)
    expect(result.current.matchStreak).toBe(1)
    expect(result.current.flipAttempts).toBe(1)
    expect(mockFireConfetti).toHaveBeenCalledTimes(1)
    expect(result.current.lastEvent.type).toBe('match')
    expect(result.current.lastEvent.itemId).toBe(result.current.tiles.find(t => t.tileId === a).itemId)
  })

  // NOTE: activate fake timers only AFTER renderSession() — its waitFor
  // polls with real timers and can hang if they are already faked.
  it('non-matching pair enters mismatch state then flips back after the delay', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()
    const [a, b] = findNonPair(result.current.tiles)
    act(() => result.current.flipTile(a))
    act(() => result.current.flipTile(b))
    expect(result.current.tiles.filter(t => t.state === 'mismatch')).toHaveLength(2)
    expect(result.current.locked).toBe(true)
    expect(result.current.mismatches).toBe(1)
    expect(result.current.matchStreak).toBe(0)
    expect(result.current.lastEvent.type).toBe('mismatch')

    act(() => { vi.advanceTimersByTime(MISMATCH_DELAY_MS) })
    expect(result.current.tiles.every(t => t.state === 'down')).toBe(true)
    expect(result.current.locked).toBe(false)
  })

  it('ignores taps during the mismatch lock-out', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()
    const [a, b] = findNonPair(result.current.tiles)
    act(() => result.current.flipTile(a))
    act(() => result.current.flipTile(b))
    const third = result.current.tiles.find(t => t.state === 'down')
    act(() => result.current.flipTile(third.tileId))
    expect(result.current.tiles.find(t => t.tileId === third.tileId).state).toBe('down')
    act(() => { vi.advanceTimersByTime(MISMATCH_DELAY_MS) })
  })

  it('ignores tapping the same tile twice and tapping a matched tile', async () => {
    const { result } = await renderSession()
    const [a, b] = findPair(result.current.tiles)
    act(() => result.current.flipTile(a))
    act(() => result.current.flipTile(a)) // same tile again — not a flip attempt
    expect(result.current.flipAttempts).toBe(0)
    act(() => result.current.flipTile(b))
    expect(result.current.flipAttempts).toBe(1)
    act(() => result.current.flipTile(a)) // matched tile — no-op
    expect(result.current.flipAttempts).toBe(1)
    expect(result.current.tiles.find(t => t.tileId === a).state).toBe('matched')
  })

  it('completing all pairs fires fireworks, saves the score record, and awards badges', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()
    for (let i = 0; i < 3; i++) {
      const pair = findPair(result.current.tiles)
      act(() => result.current.flipTile(pair[0]))
      act(() => result.current.flipTile(pair[1]))
      await act(async () => {})
    }
    expect(mockFireFireworks).toHaveBeenCalledTimes(1)
    expect(result.current.lastEvent.type).toBe('complete')
    expect(result.current.done).toBe(false) // results deferred while fireworks play
    act(() => { vi.advanceTimersByTime(COMPLETE_DELAY_MS) })
    expect(result.current.done).toBe(true)
    expect(mockAddScore).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'test-memory', score: 3, total: 3,
      flipAttempts: 3, mismatches: 0, peakMatchStreak: 3,
      durationMs: expect.any(Number),
    }))
  })

  it('does not fire confetti or fireworks when animations are disabled', async () => {
    mockGetSettings.mockResolvedValue({ ...SETTINGS, animationsEnabled: false })
    const { result } = await renderSession()
    vi.useFakeTimers()
    for (let i = 0; i < 3; i++) {
      const pair = findPair(result.current.tiles)
      act(() => result.current.flipTile(pair[0]))
      act(() => result.current.flipTile(pair[1]))
      await act(async () => {})
    }
    expect(mockFireConfetti).not.toHaveBeenCalled()
    expect(mockFireFireworks).not.toHaveBeenCalled()
  })

  it('restart rebuilds the deck and resets all counters', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()
    const [a, b] = findNonPair(result.current.tiles)
    act(() => result.current.flipTile(a))
    act(() => result.current.flipTile(b))
    act(() => { vi.advanceTimersByTime(MISMATCH_DELAY_MS) })
    act(() => result.current.restart())
    expect(result.current.flipAttempts).toBe(0)
    expect(result.current.mismatches).toBe(0)
    expect(result.current.pairsFound).toBe(0)
    expect(result.current.done).toBe(false)
    expect(result.current.tiles.every(t => t.state === 'down')).toBe(true)
  })

  it('shows the intro when not previously dismissed', async () => {
    mockGetSettings.mockResolvedValue({ ...SETTINGS, introDismissed: {} })
    const { result } = renderHook(() => useMemorySession({ gameId: 'test-memory', items: ITEMS }))
    await waitFor(() => expect(result.current.introResolved).toBe(true))
    expect(result.current.showIntro).toBe(true)
    act(() => result.current.dismissIntro(false))
    expect(result.current.showIntro).toBe(false)
  })

  it('restart during a pending mismatch does not disturb the new board', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()
    const [a, b] = findNonPair(result.current.tiles)
    act(() => result.current.flipTile(a))
    act(() => result.current.flipTile(b))
    expect(result.current.locked).toBe(true)

    act(() => result.current.restart())

    const [c] = findPair(result.current.tiles)
    act(() => result.current.flipTile(c))
    expect(result.current.tiles.find(t => t.tileId === c).state).toBe('up')

    act(() => { vi.advanceTimersByTime(MISMATCH_DELAY_MS) })

    // A stale mismatch timeout from the pre-restart board would have flipped
    // this tile back down and cleared the lock — assert neither happened.
    expect(result.current.tiles.find(t => t.tileId === c).state).toBe('up')
    expect(result.current.locked).toBe(false)
    expect(result.current.mismatches).toBe(0)
  })

  it('restart within the completion window does not mark the new game done', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()
    for (let i = 0; i < 3; i++) {
      const pair = findPair(result.current.tiles)
      act(() => result.current.flipTile(pair[0]))
      act(() => result.current.flipTile(pair[1]))
      await act(async () => {})
    }

    act(() => result.current.restart())

    act(() => { vi.advanceTimersByTime(COMPLETE_DELAY_MS) })

    // A stale completion timeout from the finished pre-restart game would
    // have marked the freshly restarted game done.
    expect(result.current.done).toBe(false)
    expect(result.current.pairsFound).toBe(0)
  })

  it('completion persists pairsMatched lifetime counter via awardSession', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()
    for (let i = 0; i < 3; i++) {
      const pair = findPair(result.current.tiles)
      act(() => result.current.flipTile(pair[0]))
      act(() => result.current.flipTile(pair[1]))
      await act(async () => {})
    }
    await act(async () => {})

    expect(mockSaveBadgeData).toHaveBeenCalledWith(expect.objectContaining({
      lifetimeCounters: expect.objectContaining({
        'test-memory': expect.objectContaining({ pairsMatched: 3 }),
      }),
    }))
  })
})
