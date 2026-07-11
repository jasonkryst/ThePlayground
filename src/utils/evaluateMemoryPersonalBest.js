// Records are kept per board size (pairs): beating a 3-pair board in fewer
// flips — or less time — than a 6-pair record is not an improvement. The two
// records evaluate independently: a session can improve either, both, or
// neither, and only the improved one is persisted.
export default function evaluateMemoryPersonalBest({ flipAttempts, durationMs, pairs, previous }) {
  const updatedBests = { ...previous }

  const prevFlips = previous?.fewestFlips?.[pairs] ?? null
  const flipsImproved = prevFlips != null && flipAttempts < prevFlips.flips
  if (prevFlips == null || flipsImproved) {
    updatedBests.fewestFlips = {
      ...previous?.fewestFlips,
      [pairs]: { flips: flipAttempts, timestamp: Date.now() },
    }
  }

  // durationMs is optional so older callers (and quiz-shaped records) never
  // persist an undefined time.
  const hasDuration = durationMs != null
  const prevTime = previous?.fastestMs?.[pairs] ?? null
  const timeImproved = hasDuration && prevTime != null && durationMs < prevTime.ms
  if (hasDuration && (prevTime == null || timeImproved)) {
    updatedBests.fastestMs = {
      ...previous?.fastestMs,
      [pairs]: { ms: durationMs, timestamp: Date.now() },
    }
  }

  return {
    fewestFlips: { isNewRecord: flipsImproved, value: flipAttempts, previous: prevFlips },
    fastestMs:   { isNewRecord: timeImproved, value: hasDuration ? durationMs : null, previous: prevTime },
    updatedBests,
  }
}
