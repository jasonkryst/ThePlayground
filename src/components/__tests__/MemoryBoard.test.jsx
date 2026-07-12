import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import MemoryBoard from '../MemoryBoard'
import '../../i18n/index'

const TILES = [
  { tileId: 'dog-a', itemId: 'dog', state: 'down' },
  { tileId: 'dog-b', itemId: 'dog', state: 'up' },
  { tileId: 'cat-a', itemId: 'cat', state: 'matched' },
  { tileId: 'cat-b', itemId: 'cat', state: 'mismatch' },
]

const renderFace = itemId => <span>{itemId === 'dog' ? '🐕' : '🐈'}</span>
const getFaceLabel = itemId => (itemId === 'dog' ? 'Dog' : 'Cat')

function renderBoard(overrides = {}) {
  const onFlip = vi.fn()
  const utils = render(
    <MemoryBoard tiles={TILES} onFlip={onFlip} renderFace={renderFace} getFaceLabel={getFaceLabel} liveMessage="" {...overrides} />
  )
  return { onFlip, ...utils }
}

describe('MemoryBoard', () => {
  it('labels tiles by state: hidden position, face name, matched name', () => {
    renderBoard()
    expect(screen.getByRole('button', { name: 'Hidden tile 1 of 4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dog' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cat — matched' })).toBeInTheDocument()
  })

  it('exposes data-item-id and data-tile-id on every tile', () => {
    renderBoard()
    const tiles = screen.getAllByRole('button')
    expect(tiles.filter(b => b.dataset.itemId === 'dog')).toHaveLength(2)
    expect(tiles.every(b => b.dataset.tileId)).toBe(true)
  })

  it('clicking a face-down tile calls onFlip with its tileId', () => {
    const { onFlip } = renderBoard()
    fireEvent.click(screen.getByRole('button', { name: 'Hidden tile 1 of 4' }))
    expect(onFlip).toHaveBeenCalledWith('dog-a')
  })

  it('matched tiles are aria-disabled and not clickable, but keep keyboard focus', () => {
    const { onFlip } = renderBoard()
    const matched = screen.getByRole('button', { name: 'Cat — matched' })
    expect(matched).not.toBeDisabled()
    expect(matched).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(matched)
    expect(onFlip).not.toHaveBeenCalled()
    matched.focus()
    expect(matched).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Hidden tile 1 of 4' })).toHaveAttribute('aria-disabled', 'false')
    expect(screen.getByRole('button', { name: 'Dog' })).toHaveAttribute('aria-disabled', 'false')
  })

  it('mismatch tiles show a decorative cross marker', () => {
    const { container } = renderBoard()
    const cross = container.querySelector('.memory-board__cross')
    expect(cross).toBeInTheDocument()
    expect(cross.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('.memory-board__cross')).toHaveLength(1)
  })

  it('renders the live region with the given message', () => {
    renderBoard({ liveMessage: "It's a match! Dog!" })
    expect(screen.getByRole('status')).toHaveTextContent("It's a match! Dog!")
  })

  it('applies the no-animation modifier when animations are disabled', () => {
    const { container } = renderBoard({ animationsEnabled: false })
    expect(container.querySelector('.memory-board__grid--no-anim')).toBeInTheDocument()
    const { container: defaultContainer } = renderBoard()
    expect(defaultContainer.querySelector('.memory-board__grid--no-anim')).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderBoard()
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('MemoryBoard grid sizing (issue #58)', () => {
  it('sets --memory-board-columns to 5 for a 10-tile board (5×2)', () => {
    const tenTiles = Array.from({ length: 10 }, (_, i) => ({
      tileId: `t${i}`, itemId: `item${i % 5}`, state: 'down',
    }))
    const { container } = renderBoard({ tiles: tenTiles })
    const grid = container.querySelector('.memory-board__grid')
    expect(grid.style.getPropertyValue('--memory-board-columns')).toBe('5')
  })

  it('sets --memory-board-columns to 4 for a 12-tile board (4×3)', () => {
    const twelveTiles = Array.from({ length: 12 }, (_, i) => ({
      tileId: `t${i}`, itemId: `item${i % 6}`, state: 'down',
    }))
    const { container } = renderBoard({ tiles: twelveTiles })
    const grid = container.querySelector('.memory-board__grid')
    expect(grid.style.getPropertyValue('--memory-board-columns')).toBe('4')
  })

  it('never sets a non-positive column count for an empty board', () => {
    const { container } = renderBoard({ tiles: [] })
    const grid = container.querySelector('.memory-board__grid')
    expect(Number(grid.style.getPropertyValue('--memory-board-columns'))).toBeGreaterThanOrEqual(1)
  })
})
