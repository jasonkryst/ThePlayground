import { describe, it, expect } from 'vitest'
import numbers from '../data/numbers'

describe('numbers data', () => {
  it('exports an array of exactly 5 numbers', () => {
    expect(Array.isArray(numbers)).toBe(true)
    expect(numbers.length).toBe(5)
  })

  it('values run 1 through 5 in order', () => {
    expect(numbers.map(n => n.value)).toEqual([1, 2, 3, 4, 5])
  })

  it('ids follow the number-<value> convention', () => {
    for (const n of numbers) {
      expect(n.id).toBe(`number-${n.value}`)
    }
  })

  // Negative: no collisions
  it('all ids are unique', () => {
    const ids = numbers.map(n => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
