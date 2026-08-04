import { describe, it, expect } from 'vitest'
import i18n from '../../../i18n'
import emotions from '../data/emotions'

describe('emotions data', () => {
  it('exports an array of exactly 8 emotions', () => {
    expect(Array.isArray(emotions)).toBe(true)
    expect(emotions.length).toBe(8)
  })

  it('every emotion has id, nameKey and emoji', () => {
    for (const emotion of emotions) {
      expect(emotion.id,      `${emotion.nameKey} missing id`).toBeTruthy()
      expect(emotion.nameKey, `${emotion.id} missing nameKey`).toBeTruthy()
      expect(emotion.emoji,   `${emotion.id} missing emoji`).toBeTruthy()
    }
  })

  it('nameKey always follows the emotion.<id>.name convention', () => {
    for (const emotion of emotions) {
      expect(emotion.nameKey).toBe(`emotion.${emotion.id}.name`)
    }
  })

  // Negative: no collisions
  it('all ids are unique', () => {
    const ids = emotions.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all emojis are unique', () => {
    const emojis = emotions.map(e => e.emoji)
    expect(new Set(emojis).size).toBe(emojis.length)
  })

  // Negative: no missing translations
  it('every nameKey resolves to a real, non-fallback translation', () => {
    for (const emotion of emotions) {
      expect(i18n.exists(emotion.nameKey), `${emotion.nameKey} not in i18n`).toBe(true)
      expect(i18n.t(emotion.nameKey)).not.toBe(emotion.nameKey)
    }
  })
})
