import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ManifestIcon from '../ManifestIcon'

describe('ManifestIcon', () => {
  it('renders an emoji icon as text in a span by default', () => {
    render(<ManifestIcon icon="🐘" className="some-class" />)
    const el = screen.getByText('🐘')
    expect(el.tagName).toBe('SPAN')
    expect(el).toHaveClass('some-class')
  })

  it('renders the element named by "as" for non-image icons', () => {
    render(<ManifestIcon icon="🎨" as="div" className="some-class" />)
    expect(screen.getByText('🎨').tagName).toBe('DIV')
  })

  it('sets aria-hidden on the text element when ariaHidden is true', () => {
    render(<ManifestIcon icon="🐘" ariaHidden />)
    expect(screen.getByText('🐘')).toHaveAttribute('aria-hidden', 'true')
  })

  it('omits aria-hidden by default', () => {
    render(<ManifestIcon icon="🐘" />)
    expect(screen.getByText('🐘')).not.toHaveAttribute('aria-hidden')
  })

  it('renders a decorative image when icon looks like an image path', () => {
    const { container } = render(<ManifestIcon icon="/games/character-match/icon.png" className="tile-icon" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', '/games/character-match/icon.png')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveClass('tile-icon')
  })

  it('renders an image for .gif and .jpg paths too', () => {
    const { container: gifContainer } = render(<ManifestIcon icon="/a/b.gif" />)
    expect(gifContainer.querySelector('img')).not.toBeNull()
    const { container: jpgContainer } = render(<ManifestIcon icon="/a/b.jpg" />)
    expect(jpgContainer.querySelector('img')).not.toBeNull()
  })
})
