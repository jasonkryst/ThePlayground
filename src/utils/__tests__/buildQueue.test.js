import { describe, it, expect } from 'vitest'
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
})
