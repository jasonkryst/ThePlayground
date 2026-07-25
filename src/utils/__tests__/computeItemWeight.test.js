import { describe, it, expect } from 'vitest'
import computeItemWeight from '../computeItemWeight'

const DAY_MS = 24 * 60 * 60 * 1000

describe('computeItemWeight', () => {
  it('returns 1 for an item with no recorded stat', () => {
    expect(computeItemWeight({}, 'unseen')).toBe(1)
  })

  it('returns more than 1 for an item missed very recently', () => {
    const now = Date.now()
    const stats = { dog: { missCount: 1, lastMissedAt: now } }
    expect(computeItemWeight(stats, 'dog', now)).toBeGreaterThan(1)
  })

  it('decays back toward 1 the longer ago the last miss was', () => {
    const now = Date.now()
    const recent = computeItemWeight({ dog: { missCount: 3, lastMissedAt: now - 1 * DAY_MS } }, 'dog', now)
    const old = computeItemWeight({ dog: { missCount: 3, lastMissedAt: now - 60 * DAY_MS } }, 'dog', now)
    expect(old).toBeLessThan(recent)
    expect(old).toBeCloseTo(1, 0)
  })

  it('never exceeds the 3x cap no matter how large missCount is', () => {
    const now = Date.now()
    const stats = { dog: { missCount: 1000, lastMissedAt: now } }
    expect(computeItemWeight(stats, 'dog', now)).toBeLessThanOrEqual(3)
  })

  it('a single fresh miss on a large historical count still hits the cap (documented trade-off)', () => {
    const now = Date.now()
    const stats = { dog: { missCount: 50, lastMissedAt: now } }
    expect(computeItemWeight(stats, 'dog', now)).toBe(3)
  })

  it('a very old, small miss count decays close to baseline', () => {
    const now = Date.now()
    const stats = { dog: { missCount: 1, lastMissedAt: now - 90 * DAY_MS } }
    expect(computeItemWeight(stats, 'dog', now)).toBeCloseTo(1, 1)
  })
})
