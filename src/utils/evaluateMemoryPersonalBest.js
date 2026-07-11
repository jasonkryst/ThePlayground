// Fewest-flips records are kept per board size (pairs): beating a 3-pair
// board in fewer flips than a 6-pair record is not an improvement.
export default function evaluateMemoryPersonalBest({ flipAttempts, pairs, previous }) {
  const prevForPairs = previous?.fewestFlips?.[pairs] ?? null
  const isFirst = !prevForPairs
  const improved = !isFirst && flipAttempts < prevForPairs.flips
  const shouldPersist = isFirst || improved

  const updatedBests = { ...previous }
  if (shouldPersist) {
    updatedBests.fewestFlips = {
      ...previous?.fewestFlips,
      [pairs]: { flips: flipAttempts, timestamp: Date.now() },
    }
  }

  return {
    fewestFlips: { isNewRecord: improved, value: flipAttempts, previous: prevForPairs },
    updatedBests,
  }
}
