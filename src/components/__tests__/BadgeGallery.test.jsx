import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import BadgeGallery from '../BadgeGallery'

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds' },
  { id: 'color-match', name: 'Color Match' },
]

describe('BadgeGallery', () => {
  it('renders a heading for each game', () => {
    render(<BadgeGallery manifests={manifests} badgeData={{ awards: {}, lifetimeQuestions: {} }} />)
    expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
    expect(screen.getByText('Color Match')).toBeInTheDocument()
  })

  it('renders every catalog badge for each game', () => {
    render(<BadgeGallery manifests={manifests} badgeData={{ awards: {}, lifetimeQuestions: {} }} />)
    const animalSection = screen.getByText('Animal Sounds').closest('.badge-gallery__game')
    expect(within(animalSection).getByText('Hot Streak')).toBeInTheDocument()
    expect(within(animalSection).getByText('Grand Master')).toBeInTheDocument()
  })

  it('shows a locked label for a badge with a count of 0', () => {
    render(<BadgeGallery manifests={manifests} badgeData={{ awards: {}, lifetimeQuestions: {} }} />)
    const animalSection = screen.getByText('Animal Sounds').closest('.badge-gallery__game')
    const hotStreakBadge = within(animalSection).getByText('Hot Streak').closest('.badge-gallery__badge')
    expect(within(hotStreakBadge).getByText('Locked')).toBeInTheDocument()
  })

  it('shows no count suffix for a badge earned exactly once', () => {
    render(<BadgeGallery manifests={manifests} badgeData={{ awards: { 'animal-sounds': { hotStreak: 1 } }, lifetimeQuestions: {} }} />)
    const animalSection = screen.getByText('Animal Sounds').closest('.badge-gallery__game')
    const hotStreakBadge = within(animalSection).getByText('Hot Streak').closest('.badge-gallery__badge')
    expect(within(hotStreakBadge).queryByText(/Locked/)).not.toBeInTheDocument()
    expect(within(hotStreakBadge).queryByText(/×/)).not.toBeInTheDocument()
  })

  it('shows a ×N count suffix for a badge earned more than once', () => {
    render(<BadgeGallery manifests={manifests} badgeData={{ awards: { 'animal-sounds': { hotStreak: 3 } }, lifetimeQuestions: {} }} />)
    const animalSection = screen.getByText('Animal Sounds').closest('.badge-gallery__game')
    const hotStreakBadge = within(animalSection).getByText('Hot Streak').closest('.badge-gallery__badge')
    expect(within(hotStreakBadge).getByText('×3')).toBeInTheDocument()
  })

  it('tracks badge counts independently per game', () => {
    render(<BadgeGallery manifests={manifests} badgeData={{ awards: { 'animal-sounds': { hotStreak: 2 } }, lifetimeQuestions: {} }} />)
    const colorSection = screen.getByText('Color Match').closest('.badge-gallery__game')
    const hotStreakBadge = within(colorSection).getByText('Hot Streak').closest('.badge-gallery__badge')
    expect(within(hotStreakBadge).getByText('Locked')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<BadgeGallery manifests={manifests} badgeData={{ awards: { 'animal-sounds': { hotStreak: 2 } }, lifetimeQuestions: {} }} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
