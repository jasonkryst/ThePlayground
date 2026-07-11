import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'jest-axe'
import AnimalMemoryMatchGame from '../index'

const mockPlay = vi.fn().mockResolvedValue(undefined)
window.HTMLMediaElement.prototype.play  = mockPlay
window.HTMLMediaElement.prototype.pause = vi.fn()

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
    expect(mockPlay).toHaveBeenCalledTimes(1)
  })

  it('does not play sound when soundEffectsEnabled is false', async () => {
    mockSettings.soundEffectsEnabled = false
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(mockPlay).not.toHaveBeenCalled()
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
