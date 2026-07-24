import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import ReplayButton from '../ReplayButton'

describe('ReplayButton', () => {
  it('renders the plain button when not blocked', () => {
    render(<ReplayButton labelKey="animalSounds.replay" blocked={false} onClick={() => {}} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAccessibleName('Replay sound')
    expect(button).not.toHaveClass('game__replay--blocked')
  })

  it('does not render the hint text when not blocked', () => {
    render(<ReplayButton labelKey="animalSounds.replay" blocked={false} onClick={() => {}} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders the pulse class, hint text, and augmented label when blocked', () => {
    render(<ReplayButton labelKey="animalSounds.replay" blocked={true} onClick={() => {}} />)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('game__replay--blocked')
    expect(button.getAttribute('aria-label')).toMatch(/replay sound/i)
    // common.tapToHear is added in Task 4 (not yet complete), so i18next
    // falls back to rendering the raw key here — assert on the augmented
    // label and the hint element's presence/role, not its exact copy.
    expect(button.getAttribute('aria-label')).not.toBe('Replay sound')
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('calls onClick when clicked, in both states', () => {
    const onClick = vi.fn()
    const { rerender } = render(<ReplayButton labelKey="animalSounds.replay" blocked={false} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(<ReplayButton labelKey="animalSounds.replay" blocked={true} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('has no accessibility violations when blocked', async () => {
    const { container } = render(<ReplayButton labelKey="animalSounds.replay" blocked={true} onClick={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations when not blocked', async () => {
    const { container } = render(<ReplayButton labelKey="animalSounds.replay" blocked={false} onClick={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
