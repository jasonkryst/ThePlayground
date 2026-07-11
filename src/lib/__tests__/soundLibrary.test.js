import { describe, it, expect } from 'vitest'
import { getSoundUrl } from '../soundLibrary'

describe('getSoundUrl', () => {
  it('resolves a known sound file to a url', () => {
    expect(getSoundUrl('cow.mp3')).toEqual(expect.any(String))
  })

  it('returns null for an unknown file', () => {
    expect(getSoundUrl('nope.mp3')).toBe(null)
  })
})
