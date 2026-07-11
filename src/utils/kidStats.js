/**
 * Best (highest) rounded accuracy percentage across a game's recorded sessions.
 * Returns null if there are no eligible sessions for that game.
 */
export function computeBestAccuracy(scores, gameId) {
  const percentages = scores
    .filter(s => s.gameId === gameId && s.total > 0)
    .map(s => Math.round((s.score / s.total) * 100))

  return percentages.length > 0 ? Math.max(...percentages) : null
}

/**
 * Lowest flip count across a memory game's recorded sessions.
 * Returns null if no session recorded a positive flipAttempts.
 */
export function computeFewestFlips(scores, gameId) {
  const flips = scores
    .filter(s => s.gameId === gameId && Number.isFinite(s.flipAttempts) && s.flipAttempts > 0)
    .map(s => s.flipAttempts)

  return flips.length > 0 ? Math.min(...flips) : null
}
