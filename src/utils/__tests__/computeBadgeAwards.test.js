import { describe, it, expect } from 'vitest'
import computeBadgeAwards from '../computeBadgeAwards'

describe('computeBadgeAwards', () => {
  it('awards hotStreak when peakStreak reaches 5', () => {
    const earned = computeBadgeAwards({ peakStreak: 5, isPerfect: false, prevLifetimeTotal: 0, newLifetimeTotal: 5 })
    expect(earned).toEqual(['hotStreak'])
  })

  it('awards nothing when peakStreak is below every streak tier', () => {
    const earned = computeBadgeAwards({ peakStreak: 4, isPerfect: false, prevLifetimeTotal: 0, newLifetimeTotal: 5 })
    expect(earned).toEqual([])
  })

  it('awards multiple streak tiers at once when peakStreak crosses several thresholds in one session', () => {
    const earned = computeBadgeAwards({ peakStreak: 12, isPerfect: false, prevLifetimeTotal: 0, newLifetimeTotal: 12 })
    expect(earned).toEqual(['hotStreak', 'onFire'])
  })

  it('awards all three streak tiers when peakStreak reaches 25', () => {
    const earned = computeBadgeAwards({ peakStreak: 25, isPerfect: false, prevLifetimeTotal: 0, newLifetimeTotal: 25 })
    expect(earned).toEqual(['hotStreak', 'onFire', 'unstoppable'])
  })

  it('awards perfectSession when isPerfect is true, alongside any streak tiers earned', () => {
    const earned = computeBadgeAwards({ peakStreak: 5, isPerfect: true, prevLifetimeTotal: 0, newLifetimeTotal: 5 })
    expect(earned).toEqual(['hotStreak', 'perfectSession'])
  })

  it('does not award perfectSession when isPerfect is false', () => {
    const earned = computeBadgeAwards({ peakStreak: 0, isPerfect: false, prevLifetimeTotal: 0, newLifetimeTotal: 5 })
    expect(earned).toEqual([])
  })

  it('awards a totalQuestions tier exactly when it is crossed this session', () => {
    const earned = computeBadgeAwards({ peakStreak: 0, isPerfect: false, prevLifetimeTotal: 45, newLifetimeTotal: 50 })
    expect(earned).toEqual(['gettingStarted'])
  })

  it('does not re-award a totalQuestions tier that was already crossed before this session', () => {
    const earned = computeBadgeAwards({ peakStreak: 0, isPerfect: false, prevLifetimeTotal: 60, newLifetimeTotal: 70 })
    expect(earned).toEqual([])
  })

  it('awards multiple totalQuestions tiers crossed in one large session', () => {
    const earned = computeBadgeAwards({ peakStreak: 0, isPerfect: false, prevLifetimeTotal: 40, newLifetimeTotal: 120 })
    expect(earned).toEqual(['gettingStarted', 'centuryClub'])
  })

  it('awards nothing when no thresholds are crossed and the session is imperfect', () => {
    const earned = computeBadgeAwards({ peakStreak: 2, isPerfect: false, prevLifetimeTotal: 10, newLifetimeTotal: 15 })
    expect(earned).toEqual([])
  })
})
