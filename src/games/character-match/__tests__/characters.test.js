import { describe, it, expect } from 'vitest'
import characters from '../data/characters'

describe('characters data', () => {
  it('exports an array of at least 8 characters', () => {
    expect(Array.isArray(characters)).toBe(true)
    expect(characters.length).toBeGreaterThanOrEqual(8)
  })

  it('every character has required fields', () => {
    for (const character of characters) {
      expect(character.id,      `${character.nameKey} missing id`).toBeTruthy()
      expect(character.nameKey, `${character.id} missing nameKey`).toBeTruthy()
      expect(character.show,    `${character.id} missing show`).toBeTruthy()
      expect(character.image,   `${character.id} missing image`).toMatch(/\.(png|gif|jpe?g)$/i)
    }
  })

  it('all ids are unique', () => {
    const ids = characters.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all nameKeys point at a real translation key prefix', () => {
    for (const character of characters) {
      expect(character.nameKey).toBe(`character.${character.id}.name`)
    }
  })
})
