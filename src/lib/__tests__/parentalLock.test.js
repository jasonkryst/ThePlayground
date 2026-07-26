import { describe, it, expect } from 'vitest'
import { getChallenge, verifyUnlock } from '../parentalLock'

describe('getChallenge', () => {
  it('returns a math challenge with in-range operands when no PIN is set', () => {
    const challenge = getChallenge({ enabled: true, pin: '' }, () => 0.5)
    expect(challenge.mode).toBe('math')
    expect(challenge.a).toBeGreaterThanOrEqual(2)
    expect(challenge.a).toBeLessThanOrEqual(9)
    expect(challenge.b).toBeGreaterThanOrEqual(2)
    expect(challenge.b).toBeLessThanOrEqual(9)
    expect(challenge.answer).toBe(challenge.a + challenge.b)
  })

  it('returns a pin challenge when a PIN is set', () => {
    const challenge = getChallenge({ enabled: true, pin: '4242' })
    expect(challenge).toEqual({ mode: 'pin', pin: '4242' })
  })

  it('treats a missing settings object as math mode (negative: no crash on undefined)', () => {
    const challenge = getChallenge(undefined, () => 0)
    expect(challenge.mode).toBe('math')
  })
})

describe('verifyUnlock', () => {
  it('accepts the correct sum for a math challenge', () => {
    const challenge = { mode: 'math', a: 3, b: 4, answer: 7 }
    expect(verifyUnlock(challenge, '7')).toBe(true)
  })

  it('rejects a wrong sum for a math challenge (negative)', () => {
    const challenge = { mode: 'math', a: 3, b: 4, answer: 7 }
    expect(verifyUnlock(challenge, '8')).toBe(false)
  })

  it('rejects non-numeric input for a math challenge (negative)', () => {
    const challenge = { mode: 'math', a: 3, b: 4, answer: 7 }
    expect(verifyUnlock(challenge, 'seven')).toBe(false)
  })

  it('accepts the correct PIN', () => {
    expect(verifyUnlock({ mode: 'pin', pin: '4242' }, '4242')).toBe(true)
  })

  it('rejects an incorrect PIN (negative)', () => {
    expect(verifyUnlock({ mode: 'pin', pin: '4242' }, '1234')).toBe(false)
  })

  it('rejects empty input (negative)', () => {
    expect(verifyUnlock({ mode: 'math', a: 3, b: 4, answer: 7 }, '')).toBe(false)
  })
})
