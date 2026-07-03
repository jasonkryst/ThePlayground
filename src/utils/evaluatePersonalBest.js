export default function evaluatePersonalBest({ score, total, timings, minAccuracyPct, previous }) {
  const accuracyRatio = total > 0 ? score / total : 0
  const prevAccuracy = previous?.accuracy ?? null
  const isFirstAccuracy = !prevAccuracy
  const accuracyImproved = !isFirstAccuracy && accuracyRatio > prevAccuracy.ratio
  const accuracyShouldPersist = isFirstAccuracy || accuracyImproved

  const correctDurations = timings.filter(t => t.correct).map(t => t.durationMs)
  const hasCorrect = correctDurations.length > 0
  const avgCorrectDurationMs = hasCorrect
    ? correctDurations.reduce((sum, ms) => sum + ms, 0) / correctDurations.length
    : null

  const meetsAccuracyGate = accuracyRatio >= minAccuracyPct / 100
  const speedEligible = hasCorrect && meetsAccuracyGate
  const prevSpeed = previous?.speedMs ?? null
  const isFirstSpeed = !prevSpeed
  const speedImproved = speedEligible && !isFirstSpeed && avgCorrectDurationMs < prevSpeed.avgMs
  const speedShouldPersist = speedEligible && (isFirstSpeed || speedImproved)

  const updatedBests = { ...previous }
  if (accuracyShouldPersist) {
    updatedBests.accuracy = { ratio: accuracyRatio, score, total, timestamp: Date.now() }
  }
  if (speedShouldPersist) {
    updatedBests.speedMs = { avgMs: avgCorrectDurationMs, timestamp: Date.now() }
  }

  return {
    accuracy: { isNewRecord: accuracyImproved, value: accuracyRatio, previous: prevAccuracy },
    speed: { isNewRecord: speedImproved, value: hasCorrect ? avgCorrectDurationMs : null, previous: prevSpeed },
    updatedBests,
  }
}
