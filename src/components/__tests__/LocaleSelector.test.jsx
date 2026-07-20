import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import LocaleSelector from '../LocaleSelector'

describe('LocaleSelector', () => {
  it('renders nothing when only one locale is available', () => {
    const { container } = render(<LocaleSelector locales={['en']} value="en" onChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a labeled select with one option per locale when 2+ are available', () => {
    render(<LocaleSelector locales={['en', 'es']} value="en" onChange={vi.fn()} />)
    expect(screen.getByLabelText(/language/i)).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('calls onChange with the newly selected locale', async () => {
    const onChange = vi.fn()
    render(<LocaleSelector locales={['en', 'es']} value="en" onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText(/language/i), 'es')
    expect(onChange).toHaveBeenCalledWith('es')
  })

  it('renders friendly display names for known locale codes', () => {
    render(<LocaleSelector locales={['en', 'es']} value="en" onChange={vi.fn()} />)
    const options = screen.getAllByRole('option')
    expect(options.map(o => o.textContent)).toEqual(['English', 'Español'])
  })

  it('falls back to the raw code for an unmapped locale', () => {
    render(<LocaleSelector locales={['en', 'fr']} value="en" onChange={vi.fn()} />)
    const options = screen.getAllByRole('option')
    expect(options.map(o => o.textContent)).toEqual(['English', 'fr'])
  })

  it('has no accessibility violations when visible', async () => {
    const { container } = render(<LocaleSelector locales={['en', 'es']} value="en" onChange={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
