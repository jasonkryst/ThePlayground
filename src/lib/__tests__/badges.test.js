import { describe, it, expect } from 'vitest'
import { BADGE_CATALOG } from '../badges'

describe('BADGE_CATALOG', () => {
  it('has 8 entries', () => {
    expect(BADGE_CATALOG).toHaveLength(8)
  })

  it('has unique ids', () => {
    const ids = BADGE_CATALOG.map(b => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry has an id, category, icon, nameKey, and descKey', () => {
    for (const badge of BADGE_CATALOG) {
      expect(badge.id).toEqual(expect.any(String))
      expect(['streak', 'perfect', 'totalQuestions']).toContain(badge.category)
      expect(badge.icon).toEqual(expect.any(String))
      expect(badge.nameKey).toEqual(expect.any(String))
      expect(badge.descKey).toEqual(expect.any(String))
    }
  })

  it('streak tiers are ascending: 5, 10, 25', () => {
    const streakTiers = BADGE_CATALOG.filter(b => b.category === 'streak').map(b => b.tier)
    expect(streakTiers).toEqual([5, 10, 25])
  })

  it('totalQuestions tiers are ascending: 50, 100, 500, 1000', () => {
    const tiers = BADGE_CATALOG.filter(b => b.category === 'totalQuestions').map(b => b.tier)
    expect(tiers).toEqual([50, 100, 500, 1000])
  })

  it('has exactly one perfect-category badge with a null tier', () => {
    const perfectBadges = BADGE_CATALOG.filter(b => b.category === 'perfect')
    expect(perfectBadges).toHaveLength(1)
    expect(perfectBadges[0].tier).toBe(null)
  })
})
