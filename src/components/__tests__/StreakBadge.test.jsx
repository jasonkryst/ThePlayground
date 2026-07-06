import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import StreakBadge from '../StreakBadge'

describe('StreakBadge', () => {
  it('renders nothing when streak is 0', () => {
    const { container } = render(<StreakBadge streak={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when streak is 1', () => {
    const { container } = render(<StreakBadge streak={1} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the count when streak is 2 or more', () => {
    render(<StreakBadge streak={5} />)
    expect(screen.getByText(/5/)).toBeInTheDocument()
  })

  it('has no accessibility violations when visible', async () => {
    const { container } = render(<StreakBadge streak={3} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has aria-live="polite" so screen readers announce streak changes', () => {
    render(<StreakBadge streak={3} />)
    expect(screen.getByText(/3/)).toHaveAttribute('aria-live', 'polite')
  })
})
