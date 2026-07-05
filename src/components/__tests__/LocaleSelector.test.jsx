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

  it('has no accessibility violations when visible', async () => {
    const { container } = render(<LocaleSelector locales={['en', 'es']} value="en" onChange={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
