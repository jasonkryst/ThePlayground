import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'jest-axe'
import AnimalMemoryMatchGame from '../index'
import { getSoundUrl } from '../../../lib/soundLibrary'

// Instance-tracking Audio mock: each `new Audio(url)` records its instance so
// tests can assert which clip played, paused, or was reset — the stop-previous-
// clip behavior can't be observed through a shared prototype spy.
let audioInstances = []
function MockAudio(src) {
  this.src = src
  this.currentTime = 0
  this.play = vi.fn().mockResolvedValue(undefined)
  this.pause = vi.fn()
  audioInstances.push(this)
}
window.Audio = MockAudio

vi.mock('../../../lib/confetti', () => ({ fireConfetti: vi.fn(), fireFireworks: vi.fn() }))
vi.mock('../../../lib/soundLibrary', () => ({ getSoundUrl: vi.fn(() => 'blob:mock-sound') }))

let mockSettings
const mockUpdateSetting = vi.fn()

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings, loaded: true, updateSetting: mockUpdateSetting }),
}))
vi.mock('../../../hooks/useScores', () => ({
  default: () => ({ addScore: vi.fn().mockResolvedValue(undefined), scores: [], getBestScore: () => 0, getScoresByGame: () => [], getAllScores: () => [] }),
}))
vi.mock('../../../hooks/useBestStreak', () => ({
  default: () => ({ bestStreak: 0, recordStreak: vi.fn().mockResolvedValue(undefined) }),
}))
let mockMemoryBestOutcome
vi.mock('../../../hooks/usePersonalBest', () => ({
  default: () => ({
    personalBest: null,
    recordSession: vi.fn().mockResolvedValue({}),
    recordMemorySession: vi.fn().mockImplementation(async () => mockMemoryBestOutcome),
  }),
}))
vi.mock('../../../hooks/useBadges', () => ({
  default: () => ({ badgeData: { awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} }, awardSession: vi.fn().mockResolvedValue([]) }),
}))

const onGameEnd = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  audioInstances = []
  getSoundUrl.mockImplementation(() => 'blob:mock-sound')
  mockMemoryBestOutcome = { fewestFlips: { isNewRecord: false, value: 3, previous: null } }
  mockSettings = {
    memoryPairs: 3, animationsEnabled: true, soundEffectsEnabled: true,
    timerMode: 'countUp', introDismissed: { 'animal-memory-match': true },
  }
})
afterEach(() => vi.useRealTimers())

function getTiles() {
  return screen.getAllByRole('button').filter(b => b.dataset.itemId)
}

function findPairButtons() {
  const tiles = getTiles().filter(b => b.getAttribute('aria-disabled') !== 'true')
  for (const t of tiles) {
    const twin = tiles.find(o => o !== t && o.dataset.itemId === t.dataset.itemId)
    if (twin) return [t, twin]
  }
  return null
}

function findMismatchButtons() {
  const tiles = getTiles().filter(b => b.getAttribute('aria-disabled') !== 'true')
  const a = tiles[0]
  const b = tiles.find(o => o.dataset.itemId !== a.dataset.itemId)
  return [a, b]
}

async function playFullBoard() {
  for (let i = 0; i < 3; i++) {
    const pair = findPairButtons()
    act(() => { fireEvent.click(pair[0]) })
    act(() => { fireEvent.click(pair[1]) })
    await act(async () => {})
  }
}

describe('AnimalMemoryMatchGame', () => {
  it('renders 2×memoryPairs face-down tiles', async () => {
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    expect(getTiles()).toHaveLength(6)
    expect(screen.getAllByRole('button', { name: /hidden tile/i })).toHaveLength(6)
  })

  it('shows the intro on first run and starts on dismiss', async () => {
    mockSettings.introDismissed = {}
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByTestId('game-intro-start')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByTestId('game-intro-start')) })
    expect(getTiles()).toHaveLength(6)
  })

  it('plays the animal sound on a match', async () => {
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(1)
    expect(audioInstances[0].src).toBe('blob:mock-sound')
    expect(audioInstances[0].play).toHaveBeenCalledTimes(1)
  })

  it('does not play sound when soundEffectsEnabled is false', async () => {
    mockSettings.soundEffectsEnabled = false
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(0)
  })

  it('stops the previous match sound when a new match happens (issue #52)', async () => {
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    let pair = findPairButtons()
    act(() => { fireEvent.click(pair[0]) })
    act(() => { fireEvent.click(pair[1]) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(1)
    expect(audioInstances[0].pause).not.toHaveBeenCalled()

    audioInstances[0].currentTime = 5 // pretend the first clip is mid-playback
    pair = findPairButtons()
    act(() => { fireEvent.click(pair[0]) })
    act(() => { fireEvent.click(pair[1]) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(2)
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
    expect(audioInstances[0].currentTime).toBe(0)
    expect(audioInstances[1].play).toHaveBeenCalledTimes(1)
  })

  it('stops the final match sound when the results screen appears (issue #52)', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    const finalClip = audioInstances[audioInstances.length - 1]
    expect(finalClip.pause).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
    expect(finalClip.pause).toHaveBeenCalledTimes(1)
  })

  it('stops an in-flight clip when the game is left mid-session (issue #52)', async () => {
    let view
    await act(async () => { view = render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    view.unmount()
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
  })

  it('does not play any sound on a mismatch', async () => {
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findMismatchButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(0)
  })

  it('does not create an Audio element when the item has no sound url', async () => {
    getSoundUrl.mockImplementation(() => null)
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(0)
  })

  it('announces the match in the live region', async () => {
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(screen.getByRole('status')).toHaveTextContent(/match/i)
  })

  it('shows the timer when timerMode is countUp and hides it when off', async () => {
    const { unmount } = render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />)
    await act(async () => {})
    expect(document.querySelector('.timer')).toBeInTheDocument()
    unmount()

    mockSettings = { ...mockSettings, timerMode: 'off' }
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    expect(document.querySelector('.timer')).not.toBeInTheDocument()
  })

  it('renders inside the shared .game page layout for consistent padding (issue #58)', async () => {
    let container
    await act(async () => { container = render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />).container })
    expect(container.querySelector('.memory-game')).toHaveClass('game')
  })

  it('reaches the results screen after all pairs are found', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
  })

  it('shows the fewest-flips record banner on the results screen', async () => {
    mockMemoryBestOutcome = { fewestFlips: { isNewRecord: true, value: 3, previous: { flips: 5, timestamp: 1 } } }
    vi.useFakeTimers()
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    expect(screen.getByText(/new record/i)).toBeInTheDocument()
  })

  it('shows the fastest-board record banner on the results screen', async () => {
    mockMemoryBestOutcome = {
      fewestFlips: { isNewRecord: false, value: 3, previous: { flips: 3, timestamp: 1 } },
      fastestMs:   { isNewRecord: true, value: 42300, previous: { ms: 51800, timestamp: 1 } },
    }
    vi.useFakeTimers()
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    expect(screen.getByText(/finished in 42\.3s/i)).toBeInTheDocument()
  })

  it('shows no record banner when the session did not break the record', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
    expect(screen.queryByText(/new record/i)).not.toBeInTheDocument()
  })

  it('Home button on results calls onGameEnd with pairs/pairs', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    vi.useRealTimers()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /home/i })) })
    expect(onGameEnd).toHaveBeenCalledWith(3, 3)
  })

  it('has no accessibility violations', async () => {
    let container
    await act(async () => { container = render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />).container })
    expect(await axe(container)).toHaveNoViolations()
  })
})
