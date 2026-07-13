import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { createRef } from 'react'
import { axe } from 'jest-axe'
import OrientationOverlay from '../OrientationOverlay'

describe('OrientationOverlay', () => {
  it('renders the rotate heading and body as an alert', () => {
    render(<OrientationOverlay />)
    expect(screen.getByTestId('orientation-overlay')).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('heading', { name: /turn it sideways/i })).toBeInTheDocument()
    expect(screen.getByText(/needs a wide screen/i)).toBeInTheDocument()
  })

  it('attaches headingRef to a programmatically focusable heading', () => {
    const ref = createRef()
    render(<OrientationOverlay headingRef={ref} />)
    expect(ref.current).toBe(screen.getByRole('heading', { name: /turn it sideways/i }))
    expect(ref.current).toHaveAttribute('tabindex', '-1')
  })

  it('hides the decorative icon from assistive tech', () => {
    render(<OrientationOverlay />)
    expect(screen.getByText('📱')).toHaveAttribute('aria-hidden', 'true')
  })

  it('works without a headingRef (negative)', () => {
    expect(() => render(<OrientationOverlay />)).not.toThrow()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<OrientationOverlay />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('OrientationOverlay — portrait required', () => {
  it('renders the upright heading, tall-screen body, and rotated icon modifier', () => {
    render(<OrientationOverlay required="portrait" />)
    expect(screen.getByRole('heading', { name: /turn it upright/i })).toBeInTheDocument()
    expect(screen.getByText(/needs a tall screen/i)).toBeInTheDocument()
    expect(screen.getByText('📱')).toHaveClass('orientation-overlay__icon--portrait')
  })

  it('negative: default (no required prop) keeps the landscape copy and no portrait modifier', () => {
    render(<OrientationOverlay />)
    expect(screen.getByRole('heading', { name: /turn it sideways/i })).toBeInTheDocument()
    expect(screen.getByText('📱')).not.toHaveClass('orientation-overlay__icon--portrait')
  })

  it('has no accessibility violations in portrait mode', async () => {
    const { container } = render(<OrientationOverlay required="portrait" />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
