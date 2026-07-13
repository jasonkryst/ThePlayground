import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import GameCard from '../GameCard'

const manifest = {
  id: 'animal-sounds',
  name: 'Animal Sounds',
  description: 'Match the animal to its sound!',
  icon: '🐘',
  color: '#B39DDB',
}

const TODAY     = new Date(); TODAY.setHours(12, 0, 0, 0)
const YESTERDAY = new Date(TODAY); YESTERDAY.setDate(TODAY.getDate() - 1)
const THREE_AGO = new Date(TODAY); THREE_AGO.setDate(TODAY.getDate() - 3)

function renderCard(bestScore = 0, recentInfo = null) {
  return render(
    <MemoryRouter>
      <GameCard manifest={manifest} bestScore={bestScore} recentInfo={recentInfo} />
    </MemoryRouter>
  )
}

function renderCardWithManifest(manifestOverrides) {
  return render(
    <MemoryRouter>
      <GameCard manifest={manifestOverrides} bestScore={0} recentInfo={null} />
    </MemoryRouter>
  )
}

describe('GameCard', () => {
  it('renders game name and description', () => {
    renderCard()
    expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
    expect(screen.getByText('Match the animal to its sound!')).toBeInTheDocument()
  })

  it('renders the game icon', () => {
    renderCard()
    expect(screen.getByText('🐘')).toBeInTheDocument()
  })

  it('shows best score when greater than 0', () => {
    renderCard(8)
    expect(screen.getByText(/best.*8/i)).toBeInTheDocument()
  })

  it('links to the correct game route', () => {
    renderCard()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/game/animal-sounds')
  })

  it('does not show best score when bestScore is 0', () => {
    renderCard(0)
    expect(screen.queryByText(/best/i)).not.toBeInTheDocument()
  })

  it('shows no recently-played badge when recentInfo is null', () => {
    renderCard(0, null)
    expect(screen.queryByTestId('recently-played-badge')).not.toBeInTheDocument()
  })

  it('shows "Today" badge when played today', () => {
    renderCard(0, { lastPlayed: TODAY, playCount: 4 })
    expect(screen.getByTestId('recently-played-badge')).toBeInTheDocument()
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('Today')
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('4 plays')
  })

  it('shows "Yesterday" badge when played yesterday', () => {
    renderCard(0, { lastPlayed: YESTERDAY, playCount: 2 })
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('Yesterday')
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('2 plays')
  })

  it('shows "N days ago" badge for older plays', () => {
    renderCard(0, { lastPlayed: THREE_AGO, playCount: 1 })
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('3 days ago')
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('1 play')
  })

  it('uses singular "play" for playCount of 1', () => {
    renderCard(0, { lastPlayed: TODAY, playCount: 1 })
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('1 play')
    expect(screen.getByTestId('recently-played-badge')).not.toHaveTextContent('1 plays')
  })

  it('adds recently-played class when recentInfo is present', () => {
    renderCard(0, { lastPlayed: TODAY, playCount: 1 })
    expect(screen.getByRole('link')).toHaveClass('game-card--recently-played')
  })

  it('does not add recently-played class when recentInfo is null', () => {
    renderCard(0, null)
    expect(screen.getByRole('link')).not.toHaveClass('game-card--recently-played')
  })

  it('has no accessibility violations', async () => {
    const { container } = renderCard(5, { lastPlayed: TODAY, playCount: 3 })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows an accessible landscape-only badge when the manifest requires landscape', () => {
    renderCardWithManifest({ ...manifest, orientation: 'landscape' })
    expect(screen.getByTestId('landscape-badge')).toHaveAccessibleName('Landscape only')
  })

  it('shows no landscape badge when the manifest has no orientation (negative)', () => {
    renderCardWithManifest(manifest)
    expect(screen.queryByTestId('landscape-badge')).not.toBeInTheDocument()
  })

  it('shows no landscape badge for an unrecognized orientation value (negative)', () => {
    renderCardWithManifest({ ...manifest, orientation: 'upside-down' })
    expect(screen.queryByTestId('landscape-badge')).not.toBeInTheDocument()
  })

  it('shows a portrait badge when the manifest requires portrait', () => {
    renderCardWithManifest({ ...manifest, orientation: 'portrait' })
    expect(screen.getByTestId('portrait-badge')).toHaveAccessibleName('Portrait only')
  })

  it('negative: no portrait badge without an orientation field', () => {
    renderCardWithManifest(manifest)
    expect(screen.queryByTestId('portrait-badge')).not.toBeInTheDocument()
  })
})
