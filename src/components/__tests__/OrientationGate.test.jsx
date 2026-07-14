import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { axe } from 'jest-axe'
import OrientationGate from '../OrientationGate'
import { useOrientationGate } from '../OrientationGateContext'

function installMatchMedia({ coarse = false, landscape = true } = {}) {
  const state = { coarse, landscape }
  const listeners = new Set()
  window.matchMedia = query => ({
    get matches() {
      if (query === '(pointer: coarse)') return state.coarse
      if (query === '(orientation: landscape)') return state.landscape
      return false
    },
    media: query,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  })
  return {
    rotate(landscapeNow) {
      state.landscape = landscapeNow
      listeners.forEach(fn => fn())
    },
  }
}

afterEach(() => { delete window.matchMedia })

function BlockedProbe() {
  const { blocked } = useOrientationGate()
  return <span data-testid="blocked-probe">{String(blocked)}</span>
}

function renderGate(orientation) {
  return render(
    <OrientationGate orientation={orientation}>
      <button data-testid="game-button">flip</button>
      <BlockedProbe />
    </OrientationGate>
  )
}

describe('OrientationGate — no requirement (negative cases)', () => {
  it('renders children without any wrapper chrome and never blocks, even in portrait', () => {
    installMatchMedia({ landscape: false })
    renderGate(undefined)
    expect(screen.queryByTestId('orientation-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('blocked-probe')).toHaveTextContent('false')
    expect(screen.getByTestId('game-button')).toBeInTheDocument()
  })

  it('treats an unrecognized orientation value as no requirement', () => {
    installMatchMedia({ landscape: false })
    renderGate('diagonal')
    expect(screen.queryByTestId('orientation-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('blocked-probe')).toHaveTextContent('false')
  })
})

describe('OrientationGate — landscape required', () => {
  it('satisfied: no overlay, children not inert, context unblocked', () => {
    installMatchMedia({ landscape: true })
    renderGate('landscape')
    expect(screen.queryByTestId('orientation-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('blocked-probe')).toHaveTextContent('false')
    expect(screen.getByTestId('game-button').closest('[inert]')).toBeNull()
  })

  it('unsatisfied: overlay shown, content inert + aria-hidden, context blocked, heading focused', () => {
    installMatchMedia({ landscape: false })
    renderGate('landscape')
    expect(screen.getByTestId('orientation-overlay')).toBeInTheDocument()
    const content = screen.getByTestId('game-button').closest('.orientation-gate__content')
    expect(content).toHaveAttribute('inert')
    expect(content).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('blocked-probe')).toHaveTextContent('true')
    expect(screen.getByRole('heading', { name: /turn it sideways/i })).toHaveFocus()
  })

  it('rotating to landscape clears the overlay, un-inerts content, and restores focus', () => {
    const media = installMatchMedia({ landscape: true })
    renderGate('landscape')
    screen.getByTestId('game-button').focus()

    act(() => media.rotate(false))
    expect(screen.getByTestId('orientation-overlay')).toBeInTheDocument()

    act(() => media.rotate(true))
    expect(screen.queryByTestId('orientation-overlay')).not.toBeInTheDocument()
    const content = screen.getByTestId('game-button').closest('.orientation-gate__content')
    expect(content).not.toHaveAttribute('inert')
    expect(content).not.toHaveAttribute('aria-hidden')
    expect(screen.getByTestId('game-button')).toHaveFocus()
  })

  it('children stay mounted (state preserved) while blocked', () => {
    const media = installMatchMedia({ landscape: true })
    renderGate('landscape')
    const before = screen.getByTestId('game-button')
    act(() => media.rotate(false))
    expect(screen.getByTestId('game-button')).toBe(before)
  })

  it('has no accessibility violations while blocking', async () => {
    installMatchMedia({ landscape: false })
    const { container } = renderGate('landscape')
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('OrientationGate — portrait required', () => {
  it('unsatisfied: blocks in landscape with the portrait overlay copy', () => {
    installMatchMedia({ landscape: true })
    renderGate('portrait')
    expect(screen.getByTestId('orientation-overlay')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /turn it upright/i })).toHaveFocus()
    expect(screen.getByTestId('blocked-probe')).toHaveTextContent('true')
  })

  it('satisfied: no overlay in portrait, context unblocked', () => {
    installMatchMedia({ landscape: false })
    renderGate('portrait')
    expect(screen.queryByTestId('orientation-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('blocked-probe')).toHaveTextContent('false')
  })

  it('rotating to portrait clears the overlay', () => {
    const media = installMatchMedia({ landscape: true })
    renderGate('portrait')
    expect(screen.getByTestId('orientation-overlay')).toBeInTheDocument()
    act(() => media.rotate(false))
    expect(screen.queryByTestId('orientation-overlay')).not.toBeInTheDocument()
  })
})
