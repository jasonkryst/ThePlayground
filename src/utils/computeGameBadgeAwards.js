export default function computeGameBadgeAwards({ catalog, sessionStats, prevCounters, nextCounters }) {
  const earned = []
  for (const badge of catalog) {
    if (badge.kind === 'session' && badge.earned(sessionStats)) {
      earned.push(badge.id)
    } else if (badge.kind === 'lifetime') {
      const prev = prevCounters[badge.counter] ?? 0
      const next = nextCounters[badge.counter] ?? 0
      if (prev < badge.tier && next >= badge.tier) earned.push(badge.id)
    }
  }
  return earned
}
