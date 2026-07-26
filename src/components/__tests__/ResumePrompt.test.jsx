import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import ResumePrompt from '../ResumePrompt'

describe('ResumePrompt', () => {
  it('shows the saved progress', () => {
    render(<ResumePrompt index={2} total={10} score={2} onResume={vi.fn()} onStartFresh={vi.fn()} />)
    expect(screen.getByText(/3 of 10/i)).toBeInTheDocument()
  })

  it('calls onResume when the resume action is tapped', async () => {
    const onResume = vi.fn()
    render(<ResumePrompt index={2} total={10} score={2} onResume={onResume} onStartFresh={vi.fn()} />)
    await userEvent.click(screen.getByTestId('resume-prompt-resume'))
    expect(onResume).toHaveBeenCalled()
  })

  it('calls onStartFresh when the start-fresh action is tapped', async () => {
    const onStartFresh = vi.fn()
    render(<ResumePrompt index={2} total={10} score={2} onResume={vi.fn()} onStartFresh={onStartFresh} />)
    await userEvent.click(screen.getByTestId('resume-prompt-start-fresh'))
    expect(onStartFresh).toHaveBeenCalled()
  })

  it('renders sensibly at zero progress (question 1, score 0)', () => {
    render(<ResumePrompt index={0} total={10} score={0} onResume={vi.fn()} onStartFresh={vi.fn()} />)
    expect(screen.getByText(/1 of 10/i)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ResumePrompt index={0} total={10} score={0} onResume={vi.fn()} onStartFresh={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
