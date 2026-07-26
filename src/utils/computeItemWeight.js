const DECAY_HALF_LIFE_DAYS = 14
const MAX_EFFECTIVE_MISSES = 4
const BOOST_PER_MISS = 0.5
const DAY_MS = 24 * 60 * 60 * 1000

// Lazy, read-time decay from the single most recent miss: the whole
// accumulated missCount fades together the longer it's been since the item
// was last missed, rather than tracking (and decaying) individual miss
// events. See the design spec's "Trade-off, stated explicitly" section for
// why this simplification was chosen over per-event decay.
export default function computeItemWeight(stats, itemId, now = Date.now()) {
  const stat = stats[itemId]
  if (!stat) return 1

  const daysSince = (now - stat.lastMissedAt) / DAY_MS
  const decay = 0.5 ** (daysSince / DECAY_HALF_LIFE_DAYS)
  const effectiveMisses = Math.min(stat.missCount * decay, MAX_EFFECTIVE_MISSES)
  return 1 + effectiveMisses * BOOST_PER_MISS
}
