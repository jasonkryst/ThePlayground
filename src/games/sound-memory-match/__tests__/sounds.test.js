import { describe, it, expect } from 'vitest'
import sounds from '../data/sounds'
import { getSoundUrl } from '../../../lib/soundLibrary'

describe('sounds data', () => {
  it('exports at least 6 items (enough to fill the largest memory board)', () => {
    expect(Array.isArray(sounds)).toBe(true)
    expect(sounds.length).toBeGreaterThanOrEqual(6)
  })

  it('every item has required fields', () => {
    for (const item of sounds) {
      expect(item.id,      `${item.nameKey} missing id`).toBeTruthy()
      expect(item.nameKey, `${item.id} missing nameKey`).toBeTruthy()
      expect(item.emoji,   `${item.id} missing emoji`).toBeTruthy()
      expect(item.sound,   `${item.id} missing sound`).toBeTruthy()
    }
  })

  it('all ids are unique', () => {
    const ids = sounds.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all nameKeys point into the soundMemoryMatch.sounds namespace', () => {
    for (const item of sounds) {
      expect(item.nameKey).toBe(`soundMemoryMatch.sounds.${item.id}.name`)
    }
  })

  it('every sound file resolves to a real asset in the shared sound library', () => {
    for (const item of sounds) {
      expect(getSoundUrl(item.sound), `${item.id}'s "${item.sound}" did not resolve`).toBeTruthy()
    }
  })

  it('does not reuse a filename Animal Memory Match already plays (keeps the two memory games audibly distinct)', () => {
    const animalMemoryMatchSounds = ['dog.mp3', 'cat.mp3', 'cow.mp3', 'duck.mp3', 'frog.mp3', 'lion.mp3']
    for (const item of sounds) {
      expect(animalMemoryMatchSounds).not.toContain(item.sound)
    }
  })

  it('getSoundUrl returns null for a filename that is not part of the shared library', () => {
    expect(getSoundUrl('not-a-real-file.mp3')).toBeNull()
  })
})
