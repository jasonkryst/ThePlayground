import { describe, it, expect } from 'vitest'
import animals from '../data/animals'

describe('animals data', () => {
  it('exports an array of at least 12 animals', () => {
    expect(Array.isArray(animals)).toBe(true)
    expect(animals.length).toBeGreaterThanOrEqual(12)
  })

  it('every animal has required fields', () => {
    for (const animal of animals) {
      expect(animal.id,    `${animal.name} missing id`).toBeTruthy()
      expect(animal.name,  `${animal.id} missing name`).toBeTruthy()
      expect(animal.emoji, `${animal.id} missing emoji`).toBeTruthy()
      expect(animal.sound, `${animal.id} missing sound`).toBeTruthy()
    }
  })

  it('all ids are unique', () => {
    const ids = animals.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
