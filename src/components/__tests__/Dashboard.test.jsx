import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
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

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds', description: 'Sounds!', icon: '🐘', color: '#B39DDB' },
  { id: 'colors', name: 'Colors', description: 'Colors!', icon: '🎨', color: '#80DEEA' },
]

describe('Dashboard', () => {
  it('renders one card per manifest', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
    expect(screen.getByText('Colors')).toBeInTheDocument()
  })

  it('renders the admin gear link', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /⚙️/i })).toHaveAttribute('href', '/admin')
  })

  it('renders empty state when no manifests', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.getByText(/no games/i)).toBeInTheDocument()
  })

  it('passes correct bestScore to each GameCard', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText('Best: 7')).toBeInTheDocument()
    expect(screen.getByText('Best: 3')).toBeInTheDocument()
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
})
