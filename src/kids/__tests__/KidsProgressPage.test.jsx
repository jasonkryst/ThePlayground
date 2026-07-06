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
  { id: 'animal-sounds', name: 'Animal Sounds', icon: '🐘', color: '#B39DDB' },
  { id: 'color-match',   name: 'Color Match',   icon: '🎨', color: '#CE93D8' },
]

async function renderPage() {
  const utils = render(<MemoryRouter><KidsProgressPage manifests={manifestsFixture} /></MemoryRouter>)
  await screen.findByRole('heading', { name: /my progress/i })
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

  it('renders the page title', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /my progress/i })).toBeInTheDocument()
  })

  it('renders a back link pointing to /', async () => {
    await renderPage()
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/')
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

// ─── Empty manifests ─────────────────────────────────────────────────────────

describe('KidsProgressPage — no games', () => {
  it('renders the title without crashing when manifests is empty', async () => {
    render(<MemoryRouter><KidsProgressPage manifests={[]} /></MemoryRouter>)
    await screen.findByRole('heading', { name: /my progress/i })
    expect(screen.getByRole('heading', { name: /my progress/i })).toBeInTheDocument()
  })
})

describe('KidsProgressPage — focus management', () => {
  it('moves focus to the page title on mount', async () => {
    render(<MemoryRouter><KidsProgressPage manifests={[]} /></MemoryRouter>)
    const heading = await screen.findByRole('heading', { name: /my progress/i })
    expect(heading).toHaveFocus()
  })
})
