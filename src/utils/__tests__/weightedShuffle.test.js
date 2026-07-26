import { describe, it, expect, vi, afterEach } from 'vitest'
import weightedShuffle from '../weightedShuffle'

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

describe('weightedShuffle', () => {
  it('returns all the same items, none dropped or duplicated', () => {
    const result = weightedShuffle(items, () => 1)
    expect(result.map(i => i.id).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('does not mutate the input array', () => {
    const copy = [...items]
    weightedShuffle(items, () => 1)
    expect(items).toEqual(copy)
  })

  it('equal weights produce more than one distinct ordering across many trials', () => {
    const orderings = new Set(
      Array.from({ length: 30 }, () => weightedShuffle(items, () => 1).map(i => i.id).join(','))
    )
    expect(orderings.size).toBeGreaterThan(1)
  })

  it('a heavily-weighted item is not first in every single trial (no runaway bias)', () => {
    const weightOf = item => (item.id === 'a' ? 3 : 1)
    const results = Array.from({ length: 40 }, () => weightedShuffle(items, weightOf)[0].id)
    const notAlwaysA = results.some(id => id !== 'a')
    expect(notAlwaysA).toBe(true)
  })

  it('a heavily-weighted item is first more often than an equal-weight item, over many trials', () => {
    const weightOf = item => (item.id === 'a' ? 5 : 1)
    const firstCounts = { a: 0, b: 0, c: 0, d: 0 }
    for (let i = 0; i < 200; i++) {
      firstCounts[weightedShuffle(items, weightOf)[0].id] += 1
    }
    expect(firstCounts.a).toBeGreaterThan(firstCounts.b)
  })
})

describe('weightedShuffle — pinned formula', () => {
  afterEach(() => vi.restoreAllMocks())

  it('key = random ** (1/weight), sorted descending by key', () => {
    // weight=1 for all → key equals the random draw itself; sorted descending
    // by that draw is a deterministic, checkable ordering.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2)  // a
      .mockReturnValueOnce(0.9)  // b
      .mockReturnValueOnce(0.1)  // c
      .mockReturnValueOnce(0.5)  // d
    const result = weightedShuffle(items, () => 1)
    expect(result.map(i => i.id)).toEqual(['b', 'd', 'a', 'c'])
  })
})
