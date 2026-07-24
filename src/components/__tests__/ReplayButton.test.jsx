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
    expect(button.getAttribute('aria-label')).toMatch(/tap.*to hear/i)
    expect(screen.getByRole('status')).toHaveTextContent(/tap.*to hear/i)
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
