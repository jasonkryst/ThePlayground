import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'jest-axe'
import SoundMemoryMatchGame from '../index'
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
    timerMode: 'countUp', introDismissed: { 'sound-memory-match': true },
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

describe('SoundMemoryMatchGame', () => {
  it('renders 2×memoryPairs face-down tiles', async () => {
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    expect(getTiles()).toHaveLength(6)
    expect(screen.getAllByRole('button', { name: /hidden tile/i })).toHaveLength(6)
  })

  it('shows the intro on first run and starts on dismiss', async () => {
    mockSettings.introDismissed = {}
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByTestId('game-intro-start')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByTestId('game-intro-start')) })
    expect(getTiles()).toHaveLength(6)
  })

  it('shows the generic speaker icon (never a picture) while a tile is face-up but unresolved', async () => {
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a] = findPairButtons()
    act(() => { fireEvent.click(a) })
    await act(async () => {})
    expect(a.querySelector('.memory-board__tile-face')).toHaveTextContent('🔊')
  })

  it('never reveals a picture on a mismatch — both tiles stay generic even while flipped', async () => {
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findMismatchButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(a.querySelector('.memory-board__tile-face')).toHaveTextContent('🔊')
    expect(b.querySelector('.memory-board__tile-face')).toHaveTextContent('🔊')
  })

  it('reveals the real picture as a reward once a pair is matched (never before)', async () => {
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    const itemId = a.dataset.itemId
    act(() => { fireEvent.click(a) })
    await act(async () => {})
    // still unresolved (first flip of the turn): generic icon, no picture yet
    expect(a.querySelector('.memory-board__tile-face')).toHaveTextContent('🔊')

    act(() => { fireEvent.click(b) })
    await act(async () => {})
    // now matched: both tiles reveal the real item picture instead of the speaker icon
    const expectedEmoji = { elephant: '🐘', horse: '🐴', owl: '🦉', pig: '🐷', rooster: '🐓', sheep: '🐑' }[itemId]
    expect(a.querySelector('.memory-board__tile-face')).toHaveTextContent(expectedEmoji)
    expect(b.querySelector('.memory-board__tile-face')).toHaveTextContent(expectedEmoji)
    expect(a.querySelector('.memory-board__tile-face')).not.toHaveTextContent('🔊')
  })

  it('plays a sound on every flip, not just on a match (issue #131)', async () => {
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    expect(audioInstances).toHaveLength(1)
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(2)
    expect(audioInstances.every(inst => inst.src === 'blob:mock-sound')).toBe(true)
  })

  it('plays a sound on both flips of a mismatch too', async () => {
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findMismatchButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(2)
  })

  it('does not play sound when soundEffectsEnabled is false', async () => {
    mockSettings.soundEffectsEnabled = false
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(0)
  })

  it('does not re-play a sound when the already-flipped first tile is clicked again', async () => {
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a] = findPairButtons()
    act(() => { fireEvent.click(a) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(1)
    act(() => { fireEvent.click(a) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(1)
  })

  it('does not play a sound for a tile clicked while a mismatch is still locked', async () => {
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findMismatchButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(2)

    const untouched = getTiles().find(t => t !== a && t !== b && t.getAttribute('aria-disabled') !== 'true')
    act(() => { fireEvent.click(untouched) })
    expect(audioInstances).toHaveLength(2)
    expect(untouched.getAttribute('aria-label')).toMatch(/hidden tile/i)
  })

  it('does not play a sound when clicking an already-matched tile', async () => {
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(2)
    act(() => { fireEvent.click(a) })
    expect(audioInstances).toHaveLength(2)
  })

  it('stops the previous flip sound when the next flip happens', async () => {
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    expect(audioInstances).toHaveLength(1)
    expect(audioInstances[0].pause).not.toHaveBeenCalled()

    audioInstances[0].currentTime = 5 // pretend the first clip is mid-playback
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(2)
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
    expect(audioInstances[0].currentTime).toBe(0)
  })

  it('stops the final flip sound when the results screen appears (issue #52 precedent)', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    const finalClip = audioInstances[audioInstances.length - 1]
    expect(finalClip.pause).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    expect(screen.getByText(/you found/i)).toBeInTheDocument()
    expect(finalClip.pause).toHaveBeenCalledTimes(1)
  })

  it('stops an in-flight clip when the game is left mid-session (issue #52 precedent)', async () => {
    let view
    await act(async () => { view = render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a] = findPairButtons()
    act(() => { fireEvent.click(a) })
    view.unmount()
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
  })

  it('does not create an Audio element when the item has no sound url', async () => {
    getSoundUrl.mockImplementation(() => null)
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(0)
  })

  it('announces the match in the live region', async () => {
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(screen.getByRole('status')).toHaveTextContent(/match/i)
  })

  it('shows the timer when timerMode is countUp and hides it when off', async () => {
    const { unmount } = render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />)
    await act(async () => {})
    expect(document.querySelector('.timer')).toBeInTheDocument()
    unmount()

    mockSettings = { ...mockSettings, timerMode: 'off' }
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    expect(document.querySelector('.timer')).not.toBeInTheDocument()
  })

  it('renders inside the shared .game page layout for consistent padding', async () => {
    let container
    await act(async () => { container = render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />).container })
    expect(container.querySelector('.memory-game')).toHaveClass('game')
  })

  it('reaches the results screen after all pairs are found', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    expect(screen.getByText(/you found/i)).toBeInTheDocument()
  })

  it('shows the memory-phrased headline and the manifest accent color on the results screen', async () => {
    vi.useFakeTimers()
    let container
    await act(async () => { container = render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />).container })
    await playFullBoard()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    expect(screen.getByText('You found 3 out of 3 pairs!')).toBeInTheDocument()
    expect(screen.queryByText(/you scored/i)).not.toBeInTheDocument()
    expect(container.querySelector('.results')).toHaveStyle({ boxShadow: 'inset 0 6px 0 #80DEEA' })
  })

  it('shows the fewest-flips record banner on the results screen', async () => {
    mockMemoryBestOutcome = { fewestFlips: { isNewRecord: true, value: 3, previous: { flips: 5, timestamp: 1 } } }
    vi.useFakeTimers()
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    expect(screen.getByText(/new record/i)).toBeInTheDocument()
  })

  it('shows no record banner when the session did not break the record', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    expect(screen.getByText(/you found/i)).toBeInTheDocument()
    expect(screen.queryByText(/new record/i)).not.toBeInTheDocument()
  })

  it('Home button on results calls onGameEnd with pairs/pairs', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    vi.useRealTimers()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /home/i })) })
    expect(onGameEnd).toHaveBeenCalledWith(3, 3)
  })

  it('has no accessibility violations', async () => {
    let container
    await act(async () => { container = render(<SoundMemoryMatchGame onGameEnd={onGameEnd} />).container })
    expect(await axe(container)).toHaveNoViolations()
  })
})
