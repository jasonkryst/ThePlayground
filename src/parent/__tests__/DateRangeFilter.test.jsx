import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import DateRangeFilter from '../DateRangeFilter'

const ALL_RANGE = { preset: 'all', start: null, end: null }

describe('DateRangeFilter — presets', () => {
  it('calls onChange with the right preset when a preset button is clicked', () => {
    const onChange = vi.fn()
    render(<DateRangeFilter range={ALL_RANGE} onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: '7 days' }))
    expect(onChange).toHaveBeenCalledWith({ preset: '7d', start: null, end: null })
  })

  it('marks the active preset as selected', () => {
    render(<DateRangeFilter range={{ preset: '30d', start: null, end: null }} onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: '30 days' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'All time' })).toHaveAttribute('aria-selected', 'false')
  })
})

describe('DateRangeFilter — custom range', () => {
  it('calls onChange with preset "custom" once both valid dates are entered', () => {
    const onChange = vi.fn()
    render(<DateRangeFilter range={ALL_RANGE} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-08' } })
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'custom', start: '2026-07-01', end: '2026-07-08' })
  })

  it('shows an inline error and does not call onChange when end is before start', () => {
    const onChange = vi.fn()
    render(<DateRangeFilter range={ALL_RANGE} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-10' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-01' } })
    expect(screen.getByRole('alert')).toHaveTextContent('End date must be on or after the start date.')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('recovers after fixing an invalid range', () => {
    const onChange = vi.fn()
    render(<DateRangeFilter range={ALL_RANGE} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-10' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-01' } })
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-20' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledWith({ preset: 'custom', start: '2026-07-10', end: '2026-07-20' })
  })

  it('does not call onChange while only one custom field is filled', () => {
    const onChange = vi.fn()
    render(<DateRangeFilter range={ALL_RANGE} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-01' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('associates the validation error with both date inputs via aria-describedby', () => {
    render(<DateRangeFilter range={ALL_RANGE} onChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-10' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-01' } })
    const errorId = screen.getByRole('alert').id
    expect(screen.getByLabelText('From')).toHaveAttribute('aria-describedby', errorId)
    expect(screen.getByLabelText('To')).toHaveAttribute('aria-describedby', errorId)
  })

  it('removes aria-describedby once the error clears', () => {
    render(<DateRangeFilter range={ALL_RANGE} onChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-10' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-20' } })
    expect(screen.getByLabelText('From')).not.toHaveAttribute('aria-describedby')
    expect(screen.getByLabelText('To')).not.toHaveAttribute('aria-describedby')
  })
})

// Issue #146: the tabs pattern (role="tablist"/"tab"/aria-selected) was
// already in place but incomplete — no aria-controls linked a tab to a
// panel, and the custom-range section wasn't marked role="tabpanel" at all.
// Mirrors the same defect class already fixed in AdminPage.jsx, adapted for
// this component's one-shared-panel-for-four-tabs structure (picking a
// preset doesn't hide/show distinct content the way AdminPage's tabs do).
describe('DateRangeFilter — ARIA tabs wiring (issue #146)', () => {
  it('marks the custom-range section as a tabpanel', () => {
    render(<DateRangeFilter range={ALL_RANGE} onChange={vi.fn()} />)
    expect(screen.getByRole('tabpanel')).toBeInTheDocument()
  })

  it('every preset tab has aria-controls pointing at the tabpanel', () => {
    render(<DateRangeFilter range={ALL_RANGE} onChange={vi.fn()} />)
    const panelId = screen.getByRole('tabpanel').id
    expect(panelId).toBeTruthy()
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveAttribute('aria-controls', panelId)
    }
  })

  it('the tabpanel is labelled by all four preset tabs', () => {
    render(<DateRangeFilter range={ALL_RANGE} onChange={vi.fn()} />)
    const tabIds = screen.getAllByRole('tab').map(tab => tab.id)
    expect(tabIds).toHaveLength(4)
    expect(tabIds.every(Boolean)).toBe(true)
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabIds.join(' '))
  })

  // Negative: this wiring must hold regardless of which preset is active —
  // not just in the default/'all' case the other tests above use.
  it('keeps the same aria-controls/aria-labelledby wiring when a non-default preset is active', () => {
    render(<DateRangeFilter range={{ preset: '7d', start: null, end: null }} onChange={vi.fn()} />)
    const panel = screen.getByRole('tabpanel')
    const tabIds = screen.getAllByRole('tab').map(tab => tab.id)
    expect(panel).toHaveAttribute('aria-labelledby', tabIds.join(' '))
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveAttribute('aria-controls', panel.id)
    }
  })
})

describe('DateRangeFilter — accessibility', () => {
  it('has no accessibility violations in the default state', async () => {
    const { container } = render(<DateRangeFilter range={ALL_RANGE} onChange={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations while showing the validation error', async () => {
    const { container } = render(<DateRangeFilter range={ALL_RANGE} onChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-10' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-01' } })
    expect(await axe(container)).toHaveNoViolations()
  })
})
