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
})
