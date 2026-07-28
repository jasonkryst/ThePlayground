import { describe, it, expect } from 'vitest'
import badges from '../badges'

describe('sound-memory-match badge catalog', () => {
  it('has 6 entries with unique ids and complete display fields', () => {
    expect(badges).toHaveLength(6)
    expect(new Set(badges.map(b => b.id)).size).toBe(6)
    for (const b of badges) {
      expect(b.icon).toEqual(expect.any(String))
      expect(b.nameKey).toMatch(/^soundMemoryMatch\.badges\./)
      expect(b.descKey).toMatch(/^soundMemoryMatch\.badges\./)
      expect(['session', 'lifetime']).toContain(b.kind)
    }
  })

  it('goodEar passes at pairs+2 flips and fails above it', () => {
    const goodEar = badges.find(b => b.id === 'goodEar')
    expect(goodEar.earned({ pairs: 5, flipAttempts: 7 })).toBe(true)
    expect(goodEar.earned({ pairs: 5, flipAttempts: 8 })).toBe(false)
  })

  it('listeningStreak requires a peak streak of 3', () => {
    const listeningStreak = badges.find(b => b.id === 'listeningStreak')
    expect(listeningStreak.earned({ peakMatchStreak: 3 })).toBe(true)
    expect(listeningStreak.earned({ peakMatchStreak: 2 })).toBe(false)
  })

  it('fullChorus requires a 6-pair board', () => {
    const fullChorus = badges.find(b => b.id === 'fullChorus')
    expect(fullChorus.earned({ pairs: 6 })).toBe(true)
    expect(fullChorus.earned({ pairs: 5 })).toBe(false)
  })

  it('lifetime tiers are ascending 25, 100, 500 on pairsMatched', () => {
    const tiers = badges.filter(b => b.kind === 'lifetime')
    expect(tiers.map(b => b.tier)).toEqual([25, 100, 500])
    expect(tiers.every(b => b.counter === 'pairsMatched')).toBe(true)
  })
})
