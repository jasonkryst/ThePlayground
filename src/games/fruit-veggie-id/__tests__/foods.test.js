import { describe, it, expect } from 'vitest'
import i18n from '../../../i18n'
import foods from '../data/foods'

describe('foods data', () => {
  it('exports an array of exactly 12 foods', () => {
    expect(Array.isArray(foods)).toBe(true)
    expect(foods.length).toBe(12)
  })

  it('every food has id, nameKey and emoji', () => {
    for (const food of foods) {
      expect(food.id,      `${food.nameKey} missing id`).toBeTruthy()
      expect(food.nameKey, `${food.id} missing nameKey`).toBeTruthy()
      expect(food.emoji,   `${food.id} missing emoji`).toBeTruthy()
    }
  })

  it('nameKey always follows the food.<id>.name convention', () => {
    for (const food of foods) {
      expect(food.nameKey).toBe(`food.${food.id}.name`)
    }
  })

  // Negative: no collisions
  it('all ids are unique', () => {
    const ids = foods.map(f => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all emojis are unique', () => {
    const emojis = foods.map(f => f.emoji)
    expect(new Set(emojis).size).toBe(emojis.length)
  })

  // Negative: no missing translations
  it('every nameKey resolves to a real, non-fallback translation', () => {
    for (const food of foods) {
      expect(i18n.exists(food.nameKey), `${food.nameKey} not in i18n`).toBe(true)
      expect(i18n.t(food.nameKey)).not.toBe(food.nameKey)
    }
  })
})
