import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ScoreHistory from '../ScoreHistory'

// Verifies that values read from localStorage and passed to ScoreHistory
// are rendered as inert text — not interpreted as HTML. React's JSX escapes
// by default; these tests exist as regression guards.

describe('ScoreHistory — XSS via stored data', () => {
  it('renders script tag in date field as plain text, not a DOM element', () => {
    const payload = '<script>window.__xss = true</script>'
    render(
      <ScoreHistory scores={[{ score: 5, total: 10, date: payload, timestamp: 1 }]} />
    )
    // The literal string must appear as text content
    expect(screen.getByText(payload)).toBeInTheDocument()
    // No actual script element must have been injected
    expect(document.querySelector('script[src]')).toBeNull()
    expect((window).__xss).toBeUndefined()
  })

  it('renders HTML attribute injection attempt as plain text', () => {
    const payload = '" onmouseover="alert(1)'
    render(
      <ScoreHistory scores={[{ score: 3, total: 10, date: payload, timestamp: 2 }]} />
    )
    expect(screen.getByText(payload)).toBeInTheDocument()
  })

  it('renders numeric score coerced from unexpected string type', () => {
    // If localStorage holds a string instead of a number for score,
    // the component should not crash.
    render(
      <ScoreHistory scores={[{ score: 'eight', total: 10, date: '2026-06-07', timestamp: 3 }]} />
    )
    expect(screen.getByText(/eight/)).toBeInTheDocument()
  })

  it('does not crash when score fields are null or undefined', () => {
    expect(() =>
      render(<ScoreHistory scores={[{ score: null, total: null, date: null, timestamp: 4 }]} />)
    ).not.toThrow()
  })
})
