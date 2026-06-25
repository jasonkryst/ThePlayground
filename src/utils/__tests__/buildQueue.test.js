import { describe, it, expect } from 'vitest'
import buildQueue from '../buildQueue'

const items = [
  { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' },
]

describe('buildQueue', () => {
  it('builds one queue entry per requested question', () => {
    const queue = buildQueue(items, 2, 3)
    expect(queue).toHaveLength(3)
  })

  it('caps queue length at the number of available items', () => {
    const queue = buildQueue(items, 2, 10)
    expect(queue).toHaveLength(items.length)
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
