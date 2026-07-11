import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import GameResults from '../GameResults'

const renderMissedItem = item => <span>{item.label}</span>

describe('GameResults', () => {
  it('shows the score', () => {
    render(<GameResults score={3} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    expect(screen.getByText('3 / 5')).toBeInTheDocument()
  })

  it('shows a perfect-run message when nothing was missed', () => {
    render(<GameResults score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    expect(screen.getByText(/perfect run/i)).toBeInTheDocument()
  })

  it('lists missed items via renderMissedItem when present', () => {
    render(<GameResults score={2} total={4} missed={[{ id: 'a', label: 'Apple' }, { id: 'b', label: 'Banana' }]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    expect(screen.getByText(/let's practice/i)).toBeInTheDocument()
    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('Banana')).toBeInTheDocument()
    expect(screen.queryByText(/perfect run/i)).not.toBeInTheDocument()
  })

  it('calls onPlayAgain when Play Again is clicked', async () => {
    const onPlayAgain = vi.fn()
    render(<GameResults score={3} total={5} missed={[]} onPlayAgain={onPlayAgain} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    await userEvent.click(screen.getByRole('button', { name: /play again/i }))
    expect(onPlayAgain).toHaveBeenCalledTimes(1)
  })

  it('calls onHome when Home is clicked', async () => {
    const onHome = vi.fn()
    render(<GameResults score={3} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={onHome} renderMissedItem={renderMissedItem} />)
    await userEvent.click(screen.getByRole('button', { name: /home/i }))
    expect(onHome).toHaveBeenCalledTimes(1)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<GameResults score={3} total={5} missed={[{ id: 'a', label: 'Apple' }]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('does not show the difficulty-offer banner by default', () => {
    render(<GameResults score={3} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    expect(screen.queryByText(/perfect session/i)).not.toBeInTheDocument()
  })

  it('shows the difficulty-offer banner when offerDifficultyBump is true', () => {
    render(
      <GameResults
        score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        offerDifficultyBump numChoices={2}
        onAcceptDifficultyBump={vi.fn()} onDismissDifficultyBump={vi.fn()}
      />
    )
    expect(screen.getByText('Perfect session! Try 3 choices next time?')).toBeInTheDocument()
  })

  it('calls onAcceptDifficultyBump when accepted', async () => {
    const onAccept = vi.fn()
    render(
      <GameResults
        score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        offerDifficultyBump numChoices={2}
        onAcceptDifficultyBump={onAccept} onDismissDifficultyBump={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /level up/i }))
    expect(onAccept).toHaveBeenCalledTimes(1)
  })

  it('calls onDismissDifficultyBump when dismissed', async () => {
    const onDismiss = vi.fn()
    render(
      <GameResults
        score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        offerDifficultyBump numChoices={2}
        onAcceptDifficultyBump={vi.fn()} onDismissDifficultyBump={onDismiss}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /not yet/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not show a personal-best banner by default', () => {
    render(<GameResults score={3} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    expect(screen.queryByText(/new accuracy record/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/new speed record/i)).not.toBeInTheDocument()
  })

  it('shows the accuracy-record banner with previous score/total when isNewRecord is true', () => {
    render(
      <GameResults
        score={9} total={10} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        personalBestResult={{
          accuracy: { isNewRecord: true, value: 0.9, previous: { ratio: 0.8, score: 8, total: 10, timestamp: 1 } },
          speed: { isNewRecord: false, value: null, previous: null },
        }}
      />
    )
    expect(screen.getByText('🏆 New accuracy record! 9/10 (was 8/10)')).toBeInTheDocument()
  })

  it('shows the speed-record banner with previous seconds when isNewRecord is true', () => {
    render(
      <GameResults
        score={9} total={10} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        personalBestResult={{
          accuracy: { isNewRecord: false, value: 0.9, previous: null },
          speed: { isNewRecord: true, value: 2100, previous: { avgMs: 2600, timestamp: 1 } },
        }}
      />
    )
    expect(screen.getByText('⚡ New speed record! 2.1s avg (was 2.6s avg)')).toBeInTheDocument()
  })

  it('shows both banners at once when both records are broken', () => {
    render(
      <GameResults
        score={10} total={10} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        personalBestResult={{
          accuracy: { isNewRecord: true, value: 1, previous: { ratio: 0.9, score: 9, total: 10, timestamp: 1 } },
          speed: { isNewRecord: true, value: 1000, previous: { avgMs: 1500, timestamp: 1 } },
        }}
      />
    )
    expect(screen.getByText(/new accuracy record/i)).toBeInTheDocument()
    expect(screen.getByText(/new speed record/i)).toBeInTheDocument()
  })

  it('shows the fewest-flips banner with previous flips when isNewRecord is true', () => {
    render(
      <GameResults
        score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        personalBestResult={{
          fewestFlips: { isNewRecord: true, value: 7, previous: { flips: 9, timestamp: 1 } },
        }}
      />
    )
    expect(screen.getByText('🃏 New record! Solved in 7 flips (was 9)')).toBeInTheDocument()
  })

  it('does not show a fewest-flips banner when the record was not broken', () => {
    render(
      <GameResults
        score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        personalBestResult={{
          fewestFlips: { isNewRecord: false, value: 12, previous: { flips: 9, timestamp: 1 } },
        }}
      />
    )
    expect(screen.queryByText(/new record/i)).not.toBeInTheDocument()
  })

  it('does not show any badge announcement by default', () => {
    render(<GameResults score={3} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    expect(screen.queryByText(/new badge/i)).not.toBeInTheDocument()
  })

  it('shows a line per newly earned badge', () => {
    render(
      <GameResults
        score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        newBadges={[
          { id: 'hotStreak', icon: '🔥', nameKey: 'badges.hotStreak.name' },
          { id: 'perfectSession', icon: '🎯', nameKey: 'badges.perfectSession.name' },
        ]}
      />
    )
    expect(screen.getByText('🎉 New Badge! 🔥 Hot Streak')).toBeInTheDocument()
    expect(screen.getByText('🎉 New Badge! 🎯 Perfect Session')).toBeInTheDocument()
  })

  it('has no accessibility violations with all banners present', async () => {
    const { container } = render(
      <GameResults
        score={10} total={10} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        personalBestResult={{
          accuracy: { isNewRecord: true, value: 1, previous: { ratio: 0.9, score: 9, total: 10, timestamp: 1 } },
          speed: { isNewRecord: true, value: 1000, previous: { avgMs: 1500, timestamp: 1 } },
        }}
        newBadges={[{ id: 'perfectSession', icon: '🎯', nameKey: 'badges.perfectSession.name' }]}
      />
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('moves focus to the results heading on mount', () => {
    render(<GameResults score={3} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    expect(screen.getByRole('heading', { name: /results/i })).toHaveFocus()
  })
})
