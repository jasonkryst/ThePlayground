import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import Dashboard from '../Dashboard'

vi.mock('../../hooks/useScores', () => ({
  default: () => ({
    getBestScore: (gameId) => gameId === 'animal-sounds' ? 7 : 3,
    getScoresByGame: () => [],
    scores: [],
    getAllScores: () => [],
  }),
}))

const mockSettings = { childName: '' }

vi.mock('../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings }),
}))

const TODAY = new Date(); TODAY.setHours(12, 0, 0, 0)
const mockRecentlyPlayed = new Map()
vi.mock('../../hooks/useRecentlyPlayed', () => ({
  default: () => mockRecentlyPlayed,
}))

// useGameTags stub — will be replaced in Task 10
vi.mock('../../hooks/useFeaturedGame', () => ({
  default: (manifests) => manifests[0] ?? null,
}))
vi.mock('../../hooks/useGameTags', () => ({
  default: () => ({ tagMap: new Map(), allTags: [] }),
}))

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds', description: 'Sounds!', icon: '🐘', color: '#B39DDB', tags: ['sounds'] },
  { id: 'color-match',   name: 'Color Match',   description: 'Colors!', icon: '🎨', color: '#CE93D8', tags: ['visual'] },
]

describe('Dashboard', () => {
  it('renders one card per manifest', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    // Query for game cards in the grid (not the featured card)
    const animalSoundsCards = screen.getAllByRole('link', { name: /animal sounds/i })
    const colorMatchCards = screen.getAllByRole('link', { name: /color match/i })
    expect(animalSoundsCards.length).toBeGreaterThan(0)
    expect(colorMatchCards.length).toBeGreaterThan(0)
  })

  it('renders the admin gear link', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /⚙️/i })).toHaveAttribute('href', '/admin')
  })

  it('renders the parent dashboard link', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /📊/i })).toHaveAttribute('href', '/parent')
  })

  it('renders empty state when no manifests', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.getByText(/no games/i)).toBeInTheDocument()
  })

  it('shows the default title when no child name is set', () => {
    mockSettings.childName = ''
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText("🌊 Baby's Playground")).toBeInTheDocument()
  })

  it('shows a personalized title when a child name is set', () => {
    mockSettings.childName = 'Mia'
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText("🌊 Mia's Playground")).toBeInTheDocument()
  })

  it('shows recently-played badge for a game with recent play data', () => {
    mockRecentlyPlayed.set('animal-sounds', { lastPlayed: TODAY, playCount: 3 })
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByTestId('recently-played-badge')).toBeInTheDocument()
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('Today')
    mockRecentlyPlayed.clear()
  })

  it('renders FeaturedGameCard above the grid', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText(/Today's Game/i)).toBeInTheDocument()
  })

  it('featured game also appears in the grid', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    // Animal Sounds is featured (mock returns manifests[0]) AND appears in grid
    const links = screen.getAllByRole('link', { name: /animal sounds/i })
    expect(links.length).toBeGreaterThanOrEqual(2)
  })

  it('does not render FeaturedGameCard when manifests is empty', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.queryByText(/Today's Game/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(await axe(container)).toHaveNoViolations()
  })
})
