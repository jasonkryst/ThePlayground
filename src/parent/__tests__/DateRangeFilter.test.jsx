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
