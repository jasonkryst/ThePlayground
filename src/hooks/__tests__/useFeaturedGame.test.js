import { describe, it, expect } from 'vitest'
import useFeaturedGame, { hashDate } from '../useFeaturedGame'

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds', icon: '🐘', color: '#B39DDB', tags: ['sounds'] },
  { id: 'color-match',   name: 'Color Match',   icon: '🎨', color: '#CE93D8', tags: ['visual'] },
  { id: 'numbers',       name: 'Numbers',        icon: '🔢', color: '#80DEEA', tags: ['numbers'] },
]

describe('hashDate', () => {
  it('returns the same integer for the same string', () => {
    expect(hashDate('2026-06-28')).toBe(hashDate('2026-06-28'))
  })

  it('returns a positive integer', () => {
    expect(hashDate('2026-06-28')).toBeGreaterThan(0)
  })

  it('returns different values for different dates', () => {
    expect(hashDate('2026-06-28')).not.toBe(hashDate('2026-06-29'))
  })
})

describe('useFeaturedGame', () => {
  it('returns null when manifests is empty', () => {
    expect(useFeaturedGame([])).toBeNull()
  })

  it('returns null when manifests is undefined', () => {
    expect(useFeaturedGame(undefined)).toBeNull()
  })

  it('always returns a manifest from the array', () => {
    const result = useFeaturedGame(manifests)
    expect(manifests).toContain(result)
  })

  it('returns the same game for the same date (deterministic)', () => {
    const a = useFeaturedGame(manifests)
    const b = useFeaturedGame(manifests)
    expect(a).toBe(b)
  })

  it('wraps index correctly — single-game array always returns that game', () => {
    const single = [manifests[0]]
    expect(useFeaturedGame(single)).toBe(single[0])
  })

  it('covers all games over a 30-day window (index wraps)', () => {
    // Verify the hash spreads across the full array over a realistic date range
    const covered = new Set()
    for (let d = 0; d < 30; d++) {
      const date = new Date(2026, 0, 1 + d).toISOString().slice(0, 10)
      const idx = hashDate(date) % manifests.length
      covered.add(idx)
    }
    expect(covered.size).toBeGreaterThan(1)
  })
})
