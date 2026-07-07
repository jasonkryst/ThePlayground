import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import ExitConfirmDialog from '../ExitConfirmDialog'

describe('ExitConfirmDialog', () => {
  it('renders a modal dialog with keep-playing focused by default', () => {
    render(<ExitConfirmDialog onResume={() => {}} onLeave={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: /keep playing/i })).toHaveFocus()
  })

  it('calls onResume when keep-playing is clicked', async () => {
    const onResume = vi.fn()
    render(<ExitConfirmDialog onResume={onResume} onLeave={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /keep playing/i }))
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('calls onLeave when leave-game is clicked', async () => {
    const onLeave = vi.fn()
    render(<ExitConfirmDialog onResume={() => {}} onLeave={onLeave} />)
    await userEvent.click(screen.getByRole('button', { name: /leave game/i }))
    expect(onLeave).toHaveBeenCalledOnce()
  })

  it('calls onResume on Escape', async () => {
    const onResume = vi.fn()
    render(<ExitConfirmDialog onResume={onResume} onLeave={() => {}} />)
    await userEvent.keyboard('{Escape}')
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('calls onResume when the backdrop is clicked', async () => {
    const onResume = vi.fn()
    render(<ExitConfirmDialog onResume={onResume} onLeave={() => {}} />)
    await userEvent.click(screen.getByTestId('exit-confirm-backdrop'))
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('traps Tab between the two buttons', async () => {
    render(<ExitConfirmDialog onResume={() => {}} onLeave={() => {}} />)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: /leave game/i })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: /keep playing/i })).toHaveFocus()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ExitConfirmDialog onResume={() => {}} onLeave={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
