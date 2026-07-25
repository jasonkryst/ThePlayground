import { describe, it, expect } from 'vitest'
import { isResumeValid, RESUME_TTL_MS } from '../sessionResume'

describe('isResumeValid', () => {
  it('is false when there is no saved state', () => {
    expect(isResumeValid(null, 'animal-sounds')).toBe(false)
    expect(isResumeValid(undefined, 'animal-sounds')).toBe(false)
  })

  it('is true for a matching gameId saved just now', () => {
    const now = Date.now()
    expect(isResumeValid({ gameId: 'animal-sounds', savedAt: now }, 'animal-sounds', now)).toBe(true)
  })

  it('is false when the gameId does not match', () => {
    const now = Date.now()
    expect(isResumeValid({ gameId: 'color-match', savedAt: now }, 'animal-sounds', now)).toBe(false)
  })

  it('is false once the snapshot is older than the TTL', () => {
    const now = Date.now()
    expect(isResumeValid({ gameId: 'animal-sounds', savedAt: now - RESUME_TTL_MS - 1 }, 'animal-sounds', now)).toBe(false)
  })

  it('is true one millisecond before the TTL boundary', () => {
    const now = Date.now()
    expect(isResumeValid({ gameId: 'animal-sounds', savedAt: now - RESUME_TTL_MS + 1 }, 'animal-sounds', now)).toBe(true)
  })
})
