import { describe, it, expect } from 'vitest'
import badges from '../badges'

describe('animal-memory-match badge catalog', () => {
  it('has 6 entries with unique ids and complete display fields', () => {
    expect(badges).toHaveLength(6)
    expect(new Set(badges.map(b => b.id)).size).toBe(6)
    for (const b of badges) {
      expect(b.icon).toEqual(expect.any(String))
      expect(b.nameKey).toMatch(/^animalMemoryMatch\.badges\./)
      expect(b.descKey).toMatch(/^animalMemoryMatch\.badges\./)
      expect(['session', 'lifetime']).toContain(b.kind)
    }
  })

  it('sharpMind passes at pairs+2 flips and fails above it', () => {
    const sharpMind = badges.find(b => b.id === 'sharpMind')
    expect(sharpMind.earned({ pairs: 5, flipAttempts: 7 })).toBe(true)
    expect(sharpMind.earned({ pairs: 5, flipAttempts: 8 })).toBe(false)
  })

  it('matchStreak requires a peak streak of 3', () => {
    const matchStreak = badges.find(b => b.id === 'matchStreak')
    expect(matchStreak.earned({ peakMatchStreak: 3 })).toBe(true)
    expect(matchStreak.earned({ peakMatchStreak: 2 })).toBe(false)
  })

  it('bigBoard requires a 6-pair board', () => {
    const bigBoard = badges.find(b => b.id === 'bigBoard')
    expect(bigBoard.earned({ pairs: 6 })).toBe(true)
    expect(bigBoard.earned({ pairs: 5 })).toBe(false)
  })

  it('lifetime tiers are ascending 25, 100, 500 on pairsMatched', () => {
    const tiers = badges.filter(b => b.kind === 'lifetime')
    expect(tiers.map(b => b.tier)).toEqual([25, 100, 500])
    expect(tiers.every(b => b.counter === 'pairsMatched')).toBe(true)
  })
})
