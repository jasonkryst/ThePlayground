import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { axe } from 'jest-axe'
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

  it('shows the localized, formatted date for each score', () => {
    render(<ScoreHistory scores={scores} />)
    expect(screen.getByText('Jun 7, 2026')).toBeInTheDocument()
    expect(screen.queryByText('2026-06-07')).not.toBeInTheDocument()
  })

  it('falls back to the timestamp-derived date for legacy scores with no date field', () => {
    const legacyTimestamp = new Date(2026, 5, 7).getTime()
    const legacyScores = [{ gameId: 'animal-sounds', score: 5, total: 10, timestamp: legacyTimestamp }]
    render(<ScoreHistory scores={legacyScores} />)
    expect(screen.getByText(new Date(legacyTimestamp).toLocaleDateString())).toBeInTheDocument()
  })

  describe('timezone boundary', () => {
    afterEach(() => { vi.unstubAllEnvs() })

    it('avoids the UTC day-shift trap in a negative-offset timezone', () => {
      vi.stubEnv('TZ', 'America/Los_Angeles')
      render(<ScoreHistory scores={[{ gameId: 'animal-sounds', score: 1, total: 1, date: '2026-06-07', timestamp: 1 }]} />)
      expect(screen.getByText('Jun 7, 2026')).toBeInTheDocument()
      expect(screen.queryByText('Jun 6, 2026')).not.toBeInTheDocument()
    })
  })

  it('renders empty message when no scores', () => {
    render(<ScoreHistory scores={[]} />)
    expect(screen.getByText(/no scores yet/i)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ScoreHistory scores={scores} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
