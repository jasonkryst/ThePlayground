import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import Timer from '../Timer'

describe('Timer', () => {
  it('renders elapsed seconds to one decimal place', () => {
    render(<Timer elapsedMs={3200} />)
    expect(screen.getByText('3.2s')).toBeInTheDocument()
  })

  it('renders 0.0s at the start of a question', () => {
    render(<Timer elapsedMs={0} />)
    expect(screen.getByText('0.0s')).toBeInTheDocument()
  })

  it('rounds to one decimal place rather than truncating', () => {
    render(<Timer elapsedMs={3260} />)
    expect(screen.getByText('3.3s')).toBeInTheDocument()
  })

  it('has an aria-label describing the elapsed time', () => {
    render(<Timer elapsedMs={1000} />)
    expect(screen.getByLabelText('Elapsed time: 1.0 seconds')).toBeInTheDocument()
  })

  it('has an aria-label describing the time remaining in countdown mode', () => {
    render(<Timer elapsedMs={2000} mode="countdown" limitMs={5000} />)
    expect(screen.getByLabelText('Time remaining: 3.0 seconds')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Timer elapsedMs={2000} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('counts down from limitMs in countdown mode', () => {
    render(<Timer elapsedMs={2000} mode="countdown" limitMs={5000} />)
    expect(screen.getByText('3.0s')).toBeInTheDocument()
  })

  it('clamps the countdown display at 0.0s rather than going negative', () => {
    render(<Timer elapsedMs={6000} mode="countdown" limitMs={5000} />)
    expect(screen.getByText('0.0s')).toBeInTheDocument()
  })

  it('defaults to countUp behavior when mode is omitted', () => {
    render(<Timer elapsedMs={1200} />)
    expect(screen.getByText('1.2s')).toBeInTheDocument()
  })

  it('has no accessibility violations in countdown mode', async () => {
    const { container } = render(<Timer elapsedMs={1000} mode="countdown" limitMs={5000} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
