import { describe, it, expect } from 'vitest'
import charactersBluey from '../data/charactersBluey'

describe('characters data', () => {
  it('exports an array of at least 8 characters', () => {
    expect(Array.isArray(charactersBluey)).toBe(true)
    expect(charactersBluey.length).toBeGreaterThanOrEqual(8)
  })

  it('every character has required fields', () => {
    for (const character of charactersBluey) {
      expect(character.id,      `${character.nameKey} missing id`).toBeTruthy()
      expect(character.nameKey, `${character.id} missing nameKey`).toBeTruthy()
      expect(character.show,    `${character.id} missing show`).toBeTruthy()
      expect(character.image,   `${character.id} missing image`).toMatch(/\.(png|gif|jpe?g|webp)$/i)
    }
  })

  it('all ids are unique', () => {
    const ids = charactersBluey.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all nameKeys point at a real translation key prefix', () => {
    for (const character of charactersBluey) {
      expect(character.nameKey).toBe(`charactersBluey.${character.id}.name`)
    }
  })
})
