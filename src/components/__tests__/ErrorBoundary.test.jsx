import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ErrorBoundary from '../ErrorBoundary'

// A child that throws during render so we can exercise the boundary.
function BrokenChild({ shouldThrow }) {
  if (shouldThrow) throw new Error('Test render error')
  return <div>All good</div>
}

// Suppress the expected console.error that React itself logs for uncaught
// render errors — it would spam the test output without hiding the real signal.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  console.error.mockRestore()
})

describe('ErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={false} />
      </ErrorBoundary>
    )
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('renders the fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /go home/i })).toBeInTheDocument()
  })

  it('does not show the fallback when no error has occurred', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={false} />
      </ErrorBoundary>
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('logs the error via console.error', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow />
      </ErrorBoundary>
    )
    expect(console.error).toHaveBeenCalled()
  })

  it('navigates to / when the Go home button is clicked', async () => {
    // jsdom doesn't navigate, but we can verify location.href is set.
    // Capture the assign via window.location property.
    const originalLocation = window.location
    delete window.location
    window.location = { href: '' }

    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow />
      </ErrorBoundary>
    )
    await userEvent.click(screen.getByRole('button', { name: /go home/i }))
    expect(window.location.href).toBe('/')

    window.location = originalLocation
  })
})
