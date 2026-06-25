export const DEFAULT_SETTINGS = {
  numChoices: 2,
  feedbackMode: 'immediate',
  questionsPerSession: 10,
  gaId: '',
  childName: '',
  animationsEnabled: true,
}

/**
 * Storage adapter interface. Every adapter must implement these four async methods.
 *
 * getScores()              → Promise<Score[]>
 * addScore(score)          → Promise<void>
 * getSettings()            → Promise<Settings>
 * saveSettings(settings)   → Promise<void>
 *
 * Score shape:   { gameId, score, total, date, timestamp }
 * Settings shape: { numChoices, feedbackMode, questionsPerSession, gaId, childName, animationsEnabled }
 *
 * Best-streak adapter methods (added for per-game streak tracking):
 * getBestStreaks()            → Promise<{ [gameId: string]: number }>
 * saveBestStreaks(streaksMap) → Promise<void>
 */
