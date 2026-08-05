const MIN_EXTRA = 1
const MAX_EXTRA = 3

// A question's pool must always contain more objects than the target count
// -- otherwise tapping "all of them" always lands exactly on the target and
// a wrong count (too few or too many) would never be reachable.
export default function buildQuestionPool(target, objectTypes, random = Math.random) {
  const objectType = objectTypes[Math.floor(random() * objectTypes.length)]
  const extra = MIN_EXTRA + Math.floor(random() * (MAX_EXTRA - MIN_EXTRA + 1))
  const poolSize = target + extra

  const objects = Array.from({ length: poolSize }, (_, i) => ({
    id: `${objectType.id}-${i}`,
    emoji: objectType.emoji,
    nameKey: objectType.nameKey,
  }))

  return { objectType, objects }
}
