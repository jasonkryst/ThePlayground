import { describe, it, expect } from 'vitest'
import buildQuestionPool from '../utils/buildQuestionPool'
import objectTypes from '../data/objects'

describe('buildQuestionPool', () => {
  it('adds between 1 and 3 extra objects beyond the target', () => {
    for (const random of [() => 0, () => 0.5, () => 0.999]) {
      const { objects } = buildQuestionPool(3, objectTypes, random)
      expect(objects.length).toBeGreaterThanOrEqual(4)
      expect(objects.length).toBeLessThanOrEqual(6)
    }
  })

  it('every pool entry shares the same emoji/nameKey as the returned objectType', () => {
    const { objectType, objects } = buildQuestionPool(3, objectTypes, () => 0.5)
    for (const obj of objects) {
      expect(obj.emoji).toBe(objectType.emoji)
      expect(obj.nameKey).toBe(objectType.nameKey)
    }
  })

  it('every pool entry has a unique id', () => {
    const { objects } = buildQuestionPool(4, objectTypes, () => 0.3)
    const ids = objects.map(o => o.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Negative: the pool must always exceed the target, or a wrong count (over
  // or under) would be impossible and every question would be trivially
  // correct (see the design spec's "rejected alternative" note).
  it('pool size is always strictly greater than the target, for every target 1-5', () => {
    for (const target of [1, 2, 3, 4, 5]) {
      const { objects } = buildQuestionPool(target, objectTypes, () => 0)
      expect(objects.length).toBeGreaterThan(target)
    }
  })

  it('defaults to Math.random when no random function is supplied', () => {
    const { objects } = buildQuestionPool(2, objectTypes)
    expect(objects.length).toBeGreaterThan(2)
  })
})
