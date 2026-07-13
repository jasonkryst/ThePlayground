import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import GameIntro from '../GameIntro'

describe('GameIntro', () => {
  it('renders the icon, name, and instructions', () => {
    render(
      <GameIntro
        icon="🐘" name="Animal Sounds" instructions="Listen to the sound, then tap the matching animal!"
        dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()}
      />
    )
    expect(screen.getByText('🐘')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Animal Sounds' })).toBeInTheDocument()
    expect(screen.getByText(/listen to the sound/i)).toBeInTheDocument()
  })

  it('the "don\'t show again" checkbox is unchecked when dontShowAgain is false', () => {
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />)
    expect(screen.getByTestId('game-intro-dont-show-again')).not.toBeChecked()
  })

  it('the "don\'t show again" checkbox is checked when dontShowAgain is true', () => {
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" dontShowAgain onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />)
    expect(screen.getByTestId('game-intro-dont-show-again')).toBeChecked()
  })

  it('calls onDontShowAgainChange with the new checked state when toggled', async () => {
    const onChange = vi.fn()
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" dontShowAgain={false} onDontShowAgainChange={onChange} onStart={vi.fn()} />)
    await userEvent.click(screen.getByTestId('game-intro-dont-show-again'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onStart when "Let\'s Play!" is clicked', async () => {
    const onStart = vi.fn()
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={onStart} />)
    await userEvent.click(screen.getByTestId('game-intro-start'))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('does not call onStart merely from rendering', () => {
    const onStart = vi.fn()
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={onStart} />)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <GameIntro icon="🐘" name="Animal Sounds" instructions="Listen to the sound, then tap the matching animal!" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows the landscape notice when orientation is "landscape"', () => {
    render(<GameIntro icon="🧠" name="Memory" instructions="x" orientation="landscape" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />)
    const notice = screen.getByTestId('game-intro-orientation')
    expect(notice).toHaveTextContent(/sideways/i)
    expect(screen.getByText('↔️')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows no notice when orientation is absent (negative)', () => {
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />)
    expect(screen.queryByTestId('game-intro-orientation')).not.toBeInTheDocument()
  })

  it('shows no notice for an unrecognized orientation value (negative)', () => {
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" orientation="upside-down" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />)
    expect(screen.queryByTestId('game-intro-orientation')).not.toBeInTheDocument()
  })

  it('shows the portrait notice when orientation is "portrait"', () => {
    render(<GameIntro icon="🧠" name="Memory" instructions="x" orientation="portrait" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />)
    expect(screen.getByTestId('game-intro-orientation')).toHaveTextContent(/screen upright/i)
  })

  it('negative: no orientation notice for an unrecognized orientation value', () => {
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" orientation="diagonal" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />)
    expect(screen.queryByTestId('game-intro-orientation')).not.toBeInTheDocument()
  })

  it('has no accessibility violations with the landscape notice', async () => {
    const { container } = render(
      <GameIntro icon="🧠" name="Memory" instructions="x" orientation="landscape" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
