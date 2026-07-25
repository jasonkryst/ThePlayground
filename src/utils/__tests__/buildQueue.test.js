import { describe, it, expect, vi, afterEach } from 'vitest'
import buildQueue from '../buildQueue'

const items = [
  { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' },
]

describe('buildQueue', () => {
  it('builds one queue entry per requested question when enough items exist', () => {
    const queue = buildQueue(items, 2, 3)
    expect(queue).toHaveLength(3)
  })

  it('fills the queue to the requested count by repeating items when the pool is smaller', () => {
    const queue = buildQueue(items, 2, 10)
    expect(queue).toHaveLength(10)
  })

  it('distributes repeats evenly across full passes of the pool', () => {
    const queue = buildQueue(items, 2, 8) // 8 = 2 full passes of 4 items
    const counts = {}
    for (const entry of queue) {
      counts[entry.correct.id] = (counts[entry.correct.id] || 0) + 1
    }
    expect(Object.values(counts)).toEqual([2, 2, 2, 2])
  })

  it('never repeats the same item on two consecutive questions when the pool has more than one item', () => {
    const queue = buildQueue(items, 2, 40)
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i].correct.id).not.toBe(queue[i - 1].correct.id)
    }
  })

  it('does not repeat items when the requested count is within the pool size', () => {
    const queue = buildQueue(items, 2, 4)
    const ids = queue.map(entry => entry.correct.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns an empty queue when there are no items', () => {
    const queue = buildQueue([], 2, 10)
    expect(queue).toEqual([])
  })

  it('returns an empty queue when questionsPerSession is zero', () => {
    const queue = buildQueue(items, 2, 0)
    expect(queue).toEqual([])
  })

  it('returns an empty queue when questionsPerSession is negative', () => {
    const queue = buildQueue(items, 2, -5)
    expect(queue).toEqual([])
  })

  it('repeats the single item without throwing when the pool has exactly one item', () => {
    const singleItem = [{ id: 'only' }]
    const queue = buildQueue(singleItem, 2, 3)
    expect(queue).toHaveLength(3)
    expect(queue.every(entry => entry.correct.id === 'only')).toBe(true)
  })

  it('each entry includes the correct item exactly once in choices', () => {
    const queue = buildQueue(items, 3, 4)
    for (const entry of queue) {
      const matches = entry.choices.filter(c => c.id === entry.correct.id)
      expect(matches).toHaveLength(1)
    }
  })

  it('choices length matches numChoices when enough items exist', () => {
    const queue = buildQueue(items, 3, 1)
    expect(queue[0].choices).toHaveLength(3)
  })

  it('caps choices length when numChoices exceeds available items', () => {
    const queue = buildQueue(items, 10, 1)
    expect(queue[0].choices).toHaveLength(items.length)
  })

  it('choices contain no duplicate ids', () => {
    const queue = buildQueue(items, 4, 1)
    const ids = queue[0].choices.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('shuffles: 25 runs produce more than one distinct correct-answer ordering', () => {
    const orderings = new Set(
      Array.from({ length: 25 }, () => buildQueue(items, 2, 4).map(entry => entry.correct.id).join(','))
    )
    expect(orderings.size).toBeGreaterThan(1)
  })
})

describe('buildQueue — pinned shuffle formula', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shuffle draws from the full 0..i range, not a narrowed range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const queue = buildQueue(items, 1, 4)
    expect(queue.map(entry => entry.correct.id)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('swaps away from a repeat when the new pass would start with the item that just ended the previous pass', () => {
    const pair = [{ id: 'a' }, { id: 'b' }]
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99) // pass 1 shuffle (n=2): j=floor(0.99*2)=1 -> self-swap, pass1=[a,b]
      .mockReturnValueOnce(0)    // pass 2 shuffle (n=2): j=floor(0*2)=0 -> swap -> pass2=[b,a], pass2[0].id='b'===lastId('b')
    const queue = buildQueue(pair, 1, 3)
    expect(queue.map(entry => entry.correct.id)).toEqual(['a', 'b', 'a'])
  })
})

describe('buildQueue — itemWeights', () => {
  it('omitting itemWeights behaves identically to today (regression guard)', () => {
    const queue = buildQueue(items, 2, 8)
    expect(queue).toHaveLength(8)
  })

  it('a heavily-weighted item appears more often than an equal-weight item across many sessions', () => {
    const itemWeights = item => (item.id === 'a' ? 5 : 1)
    const counts = { a: 0, b: 0, c: 0, d: 0 }
    for (let i = 0; i < 100; i++) {
      const queue = buildQueue(items, 2, 2, itemWeights) // 2 of 4 items per session
      for (const entry of queue) counts[entry.correct.id] += 1
    }
    expect(counts.a).toBeGreaterThan(counts.b)
  })

  it('weighting never creates more occurrences of one item in a session than the existing multi-pass ceiling allows', () => {
    const itemWeights = item => (item.id === 'a' ? 5 : 1)
    // 4 items, 9 questions -> ceil(9/4) = 3 is the existing structural ceiling
    for (let i = 0; i < 20; i++) {
      const queue = buildQueue(items, 2, 9, itemWeights)
      const counts = {}
      for (const entry of queue) counts[entry.correct.id] = (counts[entry.correct.id] || 0) + 1
      expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(3)
    }
  })

  it('still never repeats the same item on two consecutive questions with weighting applied', () => {
    const itemWeights = item => (item.id === 'a' ? 5 : 1)
    const queue = buildQueue(items, 2, 40, itemWeights)
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i].correct.id).not.toBe(queue[i - 1].correct.id)
    }
  })
})
