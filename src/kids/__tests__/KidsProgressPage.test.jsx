import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import KidsProgressPage from '../KidsProgressPage'

const mockGetBestStreaks = vi.fn()

vi.mock('../../storage/index', () => ({
  default: {
    getBestStreaks: () => mockGetBestStreaks(),
  },
}))

const mockGetAllScores = vi.fn()

vi.mock('../../hooks/useScores', () => ({
  default: () => ({ getAllScores: mockGetAllScores }),
}))

let mockBadgeData

vi.mock('../../hooks/useBadges', () => ({
  default: () => ({ badgeData: mockBadgeData }),
}))

const manifestsFixture = [
  { id: 'animal-sounds', nameKey: 'animalSounds.manifestName', icon: '🐘', color: '#B39DDB' },
  { id: 'color-match',   nameKey: 'colorMatch.manifestName',   icon: '🎨', color: '#CE93D8' },
]

async function renderPage() {
  const utils = render(<MemoryRouter><KidsProgressPage manifests={manifestsFixture} /></MemoryRouter>)
  await screen.findByRole('heading', { name: /animal sounds/i })
  return utils
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBestStreaks.mockResolvedValue({})
  mockGetAllScores.mockReturnValue([])
  mockBadgeData = { awards: {}, lifetimeQuestions: {} }
})

// ─── With progress data ──────────────────────────────────────────────────────

describe('KidsProgressPage — with progress data', () => {
  beforeEach(() => {
    mockGetBestStreaks.mockResolvedValue({ 'animal-sounds': 7 })
    mockGetAllScores.mockReturnValue([
      { gameId: 'animal-sounds', score: 9, total: 10, date: '2026-07-01', timestamp: 1 },
      { gameId: 'animal-sounds', score: 6, total: 10, date: '2026-07-02', timestamp: 2 },
    ])
    mockBadgeData = {
      awards: { 'animal-sounds': { hotStreak: 3 } },
      lifetimeQuestions: { 'animal-sounds': 62 },
    }
  })

  it('renders one section per manifest', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /animal sounds/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /color match/i })).toBeInTheDocument()
  })

  it('shows the best accuracy stat computed from scores', async () => {
    await renderPage()
    const section = screen.getByRole('heading', { name: /animal sounds/i }).closest('section')
    expect(within(section).getByText('90%')).toBeInTheDocument()
  })

  it('shows the best streak stat resolved from adapter.getBestStreaks', async () => {
    await renderPage()
    const section = screen.getByRole('heading', { name: /animal sounds/i }).closest('section')
    expect(within(section).getByText('7')).toBeInTheDocument()
  })

  it('shows the lifetime total-played stat', async () => {
    await renderPage()
    const section = screen.getByRole('heading', { name: /animal sounds/i }).closest('section')
    expect(within(section).getByText('62')).toBeInTheDocument()
  })

  it('shows an earned badge with its count and no "Locked" text anywhere on the page', async () => {
    await renderPage()
    expect(screen.getByText('Hot Streak ×3')).toBeInTheDocument()
    expect(screen.queryByText(/Locked/i)).not.toBeInTheDocument()
  })

  it('shows a locked badge with an aria-label ending in "locked" and no visible name text', async () => {
    await renderPage()
    const section = screen.getByRole('heading', { name: /animal sounds/i }).closest('section')
    const lockedBadge = within(section).getByRole('group', { name: /on fire.*locked/i })
    expect(within(lockedBadge).queryByText('On Fire')).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = await renderPage()
    expect(await axe(container)).toHaveNoViolations()
  })
})

// ─── No data yet ─────────────────────────────────────────────────────────────

describe('KidsProgressPage — no data yet', () => {
  it('shows a dash for best accuracy and zero for streak and total played, without crashing', async () => {
    await renderPage()
    const section = screen.getByRole('heading', { name: /animal sounds/i }).closest('section')
    expect(within(section).getByText('—')).toBeInTheDocument()
    expect(within(section).getAllByText('0')).toHaveLength(2)
  })

  it('shows every badge as locked', async () => {
    await renderPage()
    const section = screen.getByRole('heading', { name: /animal sounds/i }).closest('section')
    expect(within(section).getAllByRole('group', { name: /locked/i })).toHaveLength(8) // BADGE_CATALOG has 8 entries
  })

  it('has no accessibility violations in the empty state', async () => {
    const { container } = await renderPage()
    expect(await axe(container)).toHaveNoViolations()
  })
})

// ─── No games ───────────────────────────────────────────────────────────────

describe('KidsProgressPage — no games', () => {
  it('renders without crashing when manifests is empty', () => {
    const { container } = render(<MemoryRouter><KidsProgressPage manifests={[]} /></MemoryRouter>)
    // The component should render its container div (proves no crash)
    expect(container.querySelector('.kid-progress')).toBeInTheDocument()
    // No game sections should be rendered (manifests.map() over empty array produces nothing)
    expect(screen.queryAllByRole('heading')).toHaveLength(0)
  })
})

// ─── Memory-game stat tiles ─────────────────────────────────────────────────

describe('KidsProgressPage — memory-game stat tiles', () => {
  const manifests = [
    { id: 'animal-sounds', nameKey: 'animalSounds.manifestName', icon: '🐘', color: '#B39DDB' },
    { id: 'animal-memory-match', nameKey: 'animalMemoryMatch.manifestName', icon: '🧠', color: '#90CAF9', gameType: 'memory' },
  ]

  async function renderWithMemoryGame() {
    render(<MemoryRouter><KidsProgressPage manifests={manifests} /></MemoryRouter>)
    await screen.findByRole('heading', { name: /animal sounds/i })
    return {
      memorySection: screen.getByRole('heading', { name: /animal memory match/i }).closest('section'),
      quizSection: screen.getByRole('heading', { name: /animal sounds/i }).closest('section'),
    }
  }

  beforeEach(() => {
    mockGetAllScores.mockReturnValue([
      { gameId: 'animal-sounds', score: 9, total: 10, date: '2026-07-01', timestamp: 1 },
      { gameId: 'animal-memory-match', score: 5, total: 5, flipAttempts: 11, date: '2026-07-02', timestamp: 2 },
      { gameId: 'animal-memory-match', score: 5, total: 5, flipAttempts: 8, date: '2026-07-03', timestamp: 3 },
    ])
    mockBadgeData = {
      awards: {},
      lifetimeQuestions: { 'animal-sounds': 62 },
      lifetimeCounters: { 'animal-memory-match': { pairsMatched: 40 } },
    }
  })

  it('shows fewest flips instead of best accuracy for memory games', async () => {
    const { memorySection } = await renderWithMemoryGame()
    expect(within(memorySection).getByText('Fewest Flips')).toBeInTheDocument()
    expect(within(memorySection).getByText('8')).toBeInTheDocument()
    expect(within(memorySection).queryByText('Best Score')).not.toBeInTheDocument()
    expect(within(memorySection).queryByText('100%')).not.toBeInTheDocument()
  })

  it('shows lifetime pairs matched instead of total questions for memory games', async () => {
    const { memorySection } = await renderWithMemoryGame()
    expect(within(memorySection).getByText('Pairs Matched')).toBeInTheDocument()
    expect(within(memorySection).getByText('40')).toBeInTheDocument()
    expect(within(memorySection).queryByText('Total Played')).not.toBeInTheDocument()
  })

  it('keeps the quiz tiles unchanged on non-memory games', async () => {
    const { quizSection } = await renderWithMemoryGame()
    expect(within(quizSection).getByText('Best Score')).toBeInTheDocument()
    expect(within(quizSection).getByText('90%')).toBeInTheDocument()
    expect(within(quizSection).getByText('Total Played')).toBeInTheDocument()
    expect(within(quizSection).queryByText('Fewest Flips')).not.toBeInTheDocument()
  })

  it('shows a dash and zero for an unplayed memory game', async () => {
    mockGetAllScores.mockReturnValue([])
    mockBadgeData = { awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} }
    const { memorySection } = await renderWithMemoryGame()
    expect(within(memorySection).getByText('—')).toBeInTheDocument()
    expect(within(memorySection).getByText('Pairs Matched')).toBeInTheDocument()
    expect(within(memorySection).getAllByText('0').length).toBeGreaterThanOrEqual(2)
  })
})

// ─── Per-game badge catalogs ────────────────────────────────────────────────

describe('KidsProgressPage — per-game badge catalogs', () => {
  const manifestsWithMemoryGame = [
    { id: 'animal-sounds', nameKey: 'animalSounds.manifestName', icon: '🐘', color: '#B39DDB' },
    { id: 'animal-memory-match', nameKey: 'animalMemoryMatch.manifestName', icon: '🧠', color: '#90CAF9' },
  ]

  it('shows a game-specific catalog for games that ship badges.js and the global catalog otherwise', async () => {
    render(<MemoryRouter><KidsProgressPage manifests={manifestsWithMemoryGame} /></MemoryRouter>)
    await screen.findByRole('heading', { name: /animal sounds/i })

    const memorySection = screen.getByRole('heading', { name: /animal memory match/i }).closest('section')
    expect(within(memorySection).getByRole('group', { name: /sharp mind/i })).toBeInTheDocument()
    expect(within(memorySection).getAllByRole('group')).toHaveLength(6)

    const quizSection = screen.getByRole('heading', { name: /animal sounds/i }).closest('section')
    expect(within(quizSection).getAllByRole('group')).toHaveLength(8)
  })
})

