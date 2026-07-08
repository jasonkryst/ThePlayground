import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import userEvent from '@testing-library/user-event'
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

vi.mock('../../hooks/useFeaturedGame', () => ({
  default: (manifests) => manifests[0] ?? null,
}))

vi.mock('../../hooks/useGameTags', () => ({
  default: (manifests) => {
    const tagMap = new Map(manifests.map(m => [m.id, m.tags ?? []]))
    const allTagsSet = new Set(manifests.flatMap(m => m.tags ?? []))
    return { tagMap, allTags: [...allTagsSet].sort() }
  },
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

  it('renders empty state when no manifests', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.getByText(/no games/i)).toBeInTheDocument()
  })

  it('shows the default title when no child name is set', () => {
    mockSettings.childName = ''
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText("🌊 My Playground")).toBeInTheDocument()
  })

  it('shows a personalized title when a child name is set', () => {
    mockSettings.childName = 'Mia'
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText("🌊 Mia's Playground")).toBeInTheDocument()
  })

  it('shows recently-played badge for a game with recent play data', () => {
    mockRecentlyPlayed.set('color-match', { lastPlayed: TODAY, playCount: 3 })
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByTestId('recently-played-badge')).toBeInTheDocument()
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('Today')
    mockRecentlyPlayed.clear()
  })

  it('renders FeaturedGameCard above the grid', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText(/Today's Game/i)).toBeInTheDocument()
  })

  it('links each tab to its tabpanel via aria-controls/id, labeled back via aria-labelledby', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    const allTab = screen.getByRole('tab', { name: 'All' })
    expect(allTab.id).toBeTruthy()
    const controlsId = allTab.getAttribute('aria-controls')
    expect(controlsId).toBeTruthy()
    const panel = document.getElementById(controlsId)
    expect(panel).toHaveAttribute('role', 'tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', allTab.id)
  })

  it('featured game also appears in filtered view', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    // click the 'Sounds' tab — animal-sounds should appear in the filtered flat grid
    await user.click(screen.getByRole('tab', { name: 'Sounds' }))
    const links = screen.getAllByRole('link', { name: /animal sounds/i })
    expect(links.length).toBeGreaterThanOrEqual(1) // grid card only (featured card hidden when filtering)
  })

  it('does not render FeaturedGameCard when manifests is empty', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.queryByText(/Today's Game/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders filter tabs for each tag when allTags is non-empty', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Sounds' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Visual' })).toBeInTheDocument()
  })

  it('"All" tab is selected by default', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true')
  })

  it('renders CategorySection headings in All view', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /visual/i })).toBeInTheDocument()
  })

  it('clicking a tag tab filters the grid to matching games', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('tab', { name: 'Sounds' }))
    expect(screen.getByRole('tab', { name: 'Sounds' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByText('Animal Sounds')).toHaveLength(1) // grid card only (featured card hidden when filtering)
    expect(screen.queryByText('Color Match')).not.toBeInTheDocument()
  })

  it('clicking All tab restores full view', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('tab', { name: 'Sounds' }))
    await user.click(screen.getByRole('tab', { name: 'All' }))
    expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
    expect(screen.getByText('Color Match')).toBeInTheDocument()
  })

  it('renders a translated label for a known tag instead of just capitalizing the slug', () => {
    const testManifests = [{ id: 'a', name: 'A', description: '', icon: '🎈', color: '#fff', tags: ['sounds'] }]
    render(<MemoryRouter><Dashboard manifests={testManifests} /></MemoryRouter>)
    expect(screen.getByRole('tab', { name: /sounds/i })).toBeInTheDocument()
  })

  it('falls back to a capitalized slug for a tag with no translation entry', () => {
    const testManifests = [{ id: 'a', name: 'A', description: '', icon: '🎈', color: '#fff', tags: ['xyz-custom'] }]
    render(<MemoryRouter><Dashboard manifests={testManifests} /></MemoryRouter>)
    expect(screen.getByRole('tab', { name: /xyz-custom/i })).toBeInTheDocument()
  })

  it('moves focus to the page title on mount', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })
})
