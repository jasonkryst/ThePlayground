import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import FeaturedGameCard from '../FeaturedGameCard'

const manifest = {
  id: 'animal-sounds',
  name: 'Animal Sounds',
  description: 'Match the animal to its sound!',
  icon: '🐘',
  color: '#B39DDB',
}

function renderFeatured(m = manifest) {
  return render(
    <MemoryRouter>
      <FeaturedGameCard manifest={m} />
    </MemoryRouter>
  )
}

describe('FeaturedGameCard', () => {
  it('renders nothing when manifest is null', () => {
    const { container } = renderFeatured(null)
    expect(container.firstChild).toBeNull()
  })

  it('renders the game icon', () => {
    renderFeatured()
    expect(screen.getByText('🐘')).toBeInTheDocument()
  })

  it('renders the game name', () => {
    renderFeatured()
    expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
  })

  it('renders the game description', () => {
    renderFeatured()
    expect(screen.getByText('Match the animal to its sound!')).toBeInTheDocument()
  })

  it("shows the \"Today's Game\" label", () => {
    renderFeatured()
    expect(screen.getByText(/Today's Game/)).toBeInTheDocument()
  })

  it('links to the correct game route', () => {
    renderFeatured()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/game/animal-sounds')
  })

  it('has an aria-label describing the featured game', () => {
    renderFeatured()
    expect(screen.getByRole('link')).toHaveAttribute(
      'aria-label',
      "Play today's featured game: Animal Sounds"
    )
  })

  it('has no accessibility violations', async () => {
    const { container } = renderFeatured()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows an accessible landscape-only badge when the manifest requires landscape', () => {
    renderFeatured({ ...manifest, orientation: 'landscape' })
    expect(screen.getByTestId('landscape-badge')).toHaveAccessibleName('Landscape only')
  })

  it('shows no landscape badge when the manifest has no orientation (negative)', () => {
    renderFeatured(manifest)
    expect(screen.queryByTestId('landscape-badge')).not.toBeInTheDocument()
  })

  it('shows no landscape badge for an unrecognized orientation value (negative)', () => {
    renderFeatured({ ...manifest, orientation: 'upside-down' })
    expect(screen.queryByTestId('landscape-badge')).not.toBeInTheDocument()
  })

  it('shows a portrait badge when the manifest requires portrait', () => {
    renderFeatured({ ...manifest, orientation: 'portrait' })
    expect(screen.getByTestId('portrait-badge')).toHaveAccessibleName('Portrait only')
  })

  it('negative: no portrait badge without an orientation field', () => {
    renderFeatured(manifest)
    expect(screen.queryByTestId('portrait-badge')).not.toBeInTheDocument()
  })
})
