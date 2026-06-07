import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import GameCard from '../GameCard'

const manifest = {
  id: 'animal-sounds',
  name: 'Animal Sounds',
  description: 'Match the animal to its sound!',
  icon: '🐘',
  color: '#B39DDB',
}

function renderCard(bestScore = 0) {
  return render(
    <MemoryRouter>
      <GameCard manifest={manifest} bestScore={bestScore} />
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
})
