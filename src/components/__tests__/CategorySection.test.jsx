import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import CategorySection from '../CategorySection'

describe('CategorySection', () => {
  it('renders the section heading', () => {
    render(<CategorySection heading="Sounds 🔊"><p>child</p></CategorySection>)
    expect(screen.getByRole('heading', { name: 'Sounds 🔊' })).toBeInTheDocument()
  })

  it('renders children', () => {
    render(<CategorySection heading="Sounds 🔊"><p>game card here</p></CategorySection>)
    expect(screen.getByText('game card here')).toBeInTheDocument()
  })

  it('renders nothing inside the grid when children is empty', () => {
    const { container } = render(<CategorySection heading="Empty" />)
    const grid = container.querySelector('.category-section__grid')
    expect(grid).toBeInTheDocument()
    expect(grid.children).toHaveLength(0)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <CategorySection heading="Sounds 🔊"><p>content</p></CategorySection>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
