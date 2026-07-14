import { describe, it, expect } from 'vitest'
import { getSoundUrl } from '../soundLibrary'

describe('soundLibrary', () => {
  it('resolves mp3 assets (existing behavior)', () => {
    expect(getSoundUrl('dog.mp3')).toBeTruthy()
  })

  it('resolves the correct-answer chime wav', () => {
    expect(getSoundUrl('chime-correct.wav')).toBeTruthy()
  })

  it('resolves the wrong-answer chime wav', () => {
    expect(getSoundUrl('chime-wrong.wav')).toBeTruthy()
  })

  it('negative: returns null for unknown filenames', () => {
    expect(getSoundUrl('nope.wav')).toBeNull()
    expect(getSoundUrl('')).toBeNull()
  })
})
