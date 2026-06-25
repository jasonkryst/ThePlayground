import { describe, it, expect } from 'vitest'
import colors from '../data/colors'

describe('colors data', () => {
  it('exports an array of at least 8 colors', () => {
    expect(Array.isArray(colors)).toBe(true)
    expect(colors.length).toBeGreaterThanOrEqual(8)
  })

  it('every color has required fields', () => {
    for (const color of colors) {
      expect(color.id,      `${color.nameKey} missing id`).toBeTruthy()
      expect(color.nameKey, `${color.id} missing nameKey`).toBeTruthy()
      expect(color.emoji,   `${color.id} missing emoji`).toBeTruthy()
      expect(color.color,   `${color.id} missing color`).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('all ids are unique', () => {
    const ids = colors.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all nameKeys point at a real translation key prefix', () => {
    for (const color of colors) {
      expect(color.nameKey).toBe(`color.${color.id}.name`)
    }
  })
})
