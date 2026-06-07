import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ScoreHistory from '../ScoreHistory'

const scores = [
  { gameId: 'animal-sounds', score: 9, total: 10, date: '2026-06-07', timestamp: 2000 },
  { gameId: 'animal-sounds', score: 6, total: 10, date: '2026-06-06', timestamp: 1000 },
]

describe('ScoreHistory', () => {
  it('renders all scores in order', () => {
    render(<ScoreHistory scores={scores} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('9 / 10')
    expect(rows[1]).toHaveTextContent('6 / 10')
  })

  it('shows the date for each score', () => {
    render(<ScoreHistory scores={scores} />)
    expect(screen.getByText('2026-06-07')).toBeInTheDocument()
  })

  it('renders empty message when no scores', () => {
    render(<ScoreHistory scores={[]} />)
    expect(screen.getByText(/no scores yet/i)).toBeInTheDocument()
  })
})
