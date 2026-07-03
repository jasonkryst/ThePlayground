import { BADGE_CATALOG } from '../lib/badges'

export default function computeBadgeAwards({ peakStreak, isPerfect, prevLifetimeTotal, newLifetimeTotal }) {
  const earned = []

  for (const badge of BADGE_CATALOG) {
    if (badge.category === 'streak' && peakStreak >= badge.tier) {
      earned.push(badge.id)
    } else if (badge.category === 'perfect' && isPerfect) {
      earned.push(badge.id)
    } else if (badge.category === 'totalQuestions' && prevLifetimeTotal < badge.tier && newLifetimeTotal >= badge.tier) {
      earned.push(badge.id)
    }
  }

  return earned
}
