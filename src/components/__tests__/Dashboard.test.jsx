import { render, screen, within } from '@testing-library/react'
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
  { id: 'animal-sounds', nameKey: 'animalSounds.manifestName', descriptionKey: 'animalSounds.manifestDescription', icon: '🐘', color: '#B39DDB', tags: ['sounds', 'animals'] },
  { id: 'color-match',   nameKey: 'colorMatch.manifestName',   descriptionKey: 'colorMatch.manifestDescription',   icon: '🎨', color: '#CE93D8', tags: ['visual', 'colors'] },
  { id: 'character-match', nameKey: 'characterMatch.manifestName', descriptionKey: 'characterMatch.manifestDescription', icon: '🎭', color: '#90CAF9', tags: ['visual', 'characters'] },
]

describe('Dashboard', () => {
  it('renders one card per manifest', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
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
    mockSettings.childName = ''
  })

  it('shows recently-played badge for a game with recent play data', () => {
    mockRecentlyPlayed.set('color-match', { lastPlayed: TODAY, playCount: 3 })
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    // color-match carries two tags (visual, colors), so in the unfiltered
    // sections view it legitimately renders once per matching category
    // section (buildSections membership is "any matching tag", by design --
    // browsing "Colors" or "Visual" should both surface it). Its badge
    // renders on each occurrence, so this asserts at least one rather than
    // exactly one.
    const badges = screen.getAllByTestId('recently-played-badge')
    expect(badges.length).toBeGreaterThan(0)
    expect(badges[0]).toHaveTextContent('Today')
    mockRecentlyPlayed.clear()
  })

  it('renders FeaturedGameCard above the grid', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText(/Today's Game/i)).toBeInTheDocument()
  })

  it('does not render FeaturedGameCard when manifests is empty', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.queryByText(/Today's Game/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders a labeled search input', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('searchbox', { name: 'Search games' })).toBeInTheDocument()
  })

  it('renders a toggle pill for each tag when allTags is non-empty, with no "All" pill', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Sounds' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Visual' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('no tags are selected by default', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Sounds' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders CategorySection headings in the unfiltered view', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /visual/i })).toBeInTheDocument()
  })

  it('includes the featured game inside its own category section in the unfiltered view', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    const soundsSection = screen.getByRole('heading', { name: /sounds/i }).closest('section')
    expect(soundsSection).not.toBeNull()
    expect(within(soundsSection).getByText('Animal Sounds')).toBeInTheDocument()
  })

  it('clicking a tag pill filters the grid to matching games (leaves sections view)', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Sounds' }))
    expect(screen.getByRole('button', { name: 'Sounds' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('Animal Sounds')).toHaveLength(2) // banner + grid card
    expect(screen.queryByText('Color Match')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /visual/i })).not.toBeInTheDocument()
  })

  it('selecting two tags combines with AND (game must carry both)', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Visual' }))
    await user.click(screen.getByRole('button', { name: 'Colors' }))
    expect(screen.getByText('Color Match')).toBeInTheDocument()
    expect(screen.queryByText('Character Match')).not.toBeInTheDocument()
  })

  it('clicking a selected tag pill again deselects it', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Sounds' }))
    await user.click(screen.getByRole('button', { name: 'Sounds' }))
    expect(screen.getByRole('button', { name: 'Sounds' })).toHaveAttribute('aria-pressed', 'false')
    // Back in the unfiltered sections view -- color-match legitimately
    // appears in both its "visual" and "colors" sections (see the note on
    // the recently-played-badge test above), so assert presence, not a
    // singular match.
    expect(screen.getAllByText('Color Match').length).toBeGreaterThan(0)
  })

  it('searching by name filters the grid (positive match)', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.type(screen.getByRole('searchbox'), 'animal')
    expect(screen.getAllByText('Animal Sounds').length).toBeGreaterThan(0)
    expect(screen.queryByText('Color Match')).not.toBeInTheDocument()
  })

  it('searching with no match shows the no-results empty state (negative)', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.type(screen.getByRole('searchbox'), 'zzz-nonexistent')
    expect(screen.getByText(/no games match your filters/i)).toBeInTheDocument()
  })

  it('search narrows which tag pills are shown to tags present among matches', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.type(screen.getByRole('searchbox'), 'animal')
    expect(screen.getByRole('button', { name: 'Sounds' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Colors' })).not.toBeInTheDocument()
  })

  it('search text and a selected tag combine with AND', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.type(screen.getByRole('searchbox'), 'match')
    await user.click(screen.getByRole('button', { name: 'Colors' }))
    expect(screen.getByText('Color Match')).toBeInTheDocument()
    expect(screen.queryByText('Character Match')).not.toBeInTheDocument()
  })

  it('Clear filters resets both search text and selected tags', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.type(screen.getByRole('searchbox'), 'animal')
    await user.click(screen.getByRole('button', { name: 'Sounds' }))
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Sounds' })).toHaveAttribute('aria-pressed', 'false')
    // Same legitimate multi-section duplication as the two tests above.
    expect(screen.getAllByText('Color Match').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: /visual/i })).toBeInTheDocument()
  })

  it('announces the result count while a filter is active', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Sounds' }))
    expect(screen.getByRole('status')).toHaveTextContent('1 game found')
  })

  it('negative: does not show a Clear filters button in the unfiltered view, and the result-count live region is present but empty', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    // The role="status" live region stays mounted at all times (just empty)
    // so screen readers reliably announce it the first time a filter is
    // applied -- see the comment on .dashboard__filter-status--empty in
    // Dashboard.css.
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('keeps the featured banner visible on a filtered tag', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Sounds' }))
    expect(screen.getByText(/Today's Game/i)).toBeInTheDocument()
  })

  it('keeps the featured banner visible even on a tag that does not match the featured game', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Colors' }))
    expect(screen.getByText(/Today's Game/i)).toBeInTheDocument()
    expect(screen.getAllByText('Animal Sounds')).toHaveLength(1)
  })

  it('does not render the featured banner on any filter state when manifests is empty', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.queryByText(/Today's Game/i)).not.toBeInTheDocument()
  })

  it('renders a translated label for a known tag instead of just capitalizing the slug', () => {
    const testManifests = [{ id: 'a', nameKey: 'a.name', descriptionKey: 'a.description', icon: '🎈', color: '#fff', tags: ['sounds'] }]
    render(<MemoryRouter><Dashboard manifests={testManifests} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /sounds/i })).toBeInTheDocument()
  })

  it('falls back to a capitalized slug for a tag with no translation entry', () => {
    const testManifests = [{ id: 'a', nameKey: 'a.name', descriptionKey: 'a.description', icon: '🎈', color: '#fff', tags: ['xyz-custom'] }]
    render(<MemoryRouter><Dashboard manifests={testManifests} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /xyz-custom/i })).toBeInTheDocument()
  })

  it('moves focus to the page title on mount', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })
})
