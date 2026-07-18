// src/utils/__tests__/buildDeck.test.js
import { describe, it, expect, vi, afterEach } from 'vitest'
import buildDeck from '../buildDeck'

const ITEMS = [
  { id: 'dog' }, { id: 'cat' }, { id: 'cow' },
  { id: 'duck' }, { id: 'frog' }, { id: 'lion' },
]

afterEach(() => vi.restoreAllMocks())

describe('buildDeck', () => {
  it('returns 2×pairs tiles with each chosen item appearing exactly twice', () => {
    const deck = buildDeck(ITEMS, 5)
    expect(deck).toHaveLength(10)
    const counts = {}
    for (const tile of deck) counts[tile.itemId] = (counts[tile.itemId] ?? 0) + 1
    expect(Object.keys(counts)).toHaveLength(5)
    for (const c of Object.values(counts)) expect(c).toBe(2)
  })

  it('gives every tile a unique tileId derived from its itemId', () => {
    const deck = buildDeck(ITEMS, 3)
    const ids = deck.map(t => t.tileId)
    expect(new Set(ids).size).toBe(6)
    for (const tile of deck) expect(tile.tileId).toMatch(new RegExp(`^${tile.itemId}-(a|b)$`))
  })

  it('shuffles: 25 runs produce more than one distinct ordering', () => {
    const orderings = new Set(
      Array.from({ length: 25 }, () => buildDeck(ITEMS, 5).map(t => t.tileId).join(','))
    )
    expect(orderings.size).toBeGreaterThan(1)
  })

  it('clamps to the pool size and warns when pairs exceeds the pool', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const deck = buildDeck(ITEMS.slice(0, 2), 5)
    expect(deck).toHaveLength(4)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('buildDeck: requested 5 pairs but pool has 2 items; clamping')
  })

  it('does not warn when the pool is large enough for the requested pairs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    buildDeck(ITEMS, 5)
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not warn when the pool size exactly matches the requested pairs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    buildDeck(ITEMS.slice(0, 5), 5)
    expect(warn).not.toHaveBeenCalled()
  })

  it('throws when pairs < 1', () => {
    expect(() => buildDeck(ITEMS, 0)).toThrow(/pairs/)
  })

  it('throws exactly at the pairs < 1 boundary but not at pairs === 1', () => {
    expect(() => buildDeck(ITEMS, 1)).not.toThrow()
  })

  it('shuffle draws from the full 0..i range, not a narrowed range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const deck = buildDeck(ITEMS, 1)
    expect(deck.map(t => t.tileId)).toEqual(['dog-a', 'dog-b'])
  })
})
