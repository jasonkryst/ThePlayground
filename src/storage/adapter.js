export const DEFAULT_SETTINGS = {
  numChoices: 2,
  feedbackMode: 'immediate',
  questionsPerSession: 10,
  gaId: '',
  childName: '',
  animationsEnabled: true,
  tagOverrides: {},
  timerMode: 'countUp',
  timeLimitSeconds: 10,
  maxTries: 'none',
  hintsEnabled: false,
  hintAfterWrongTaps: 2,
  retryCountsAsStreak: true,
  spacedRepetitionEnabled: false,
  difficultyAutoProgressionEnabled: false,
  introDismissed: {},
  speedRecordMinAccuracy: 70,
  locale: 'en',
  parentDateRange: { preset: 'all', start: null, end: null },
}

/**
 * Storage adapter interface. Every adapter must implement these four async methods.
 *
 * getScores()              → Promise<Score[]>
 * addScore(score)          → Promise<void>
 * getSettings()             → Promise<Settings>
 * saveSettings(settings)   → Promise<void>
 *
 * Score shape:   { gameId, score, total, date, timestamp, peakStreak?, timings? }
 *   peakStreak?: number — highest consecutive-correct run in that session (added v0.4.0)
 *   timings?: Array<{ questionIndex: number, itemId: string, correct: boolean, durationMs: number, attemptNumber: number, timedOut?: boolean }>
 *     itemId added in v0.4.0; older records omit it
 *     attemptNumber added in v0.6.0 (1 = first tap, 2 = first retry, etc.); older records omit it
 *     timedOut added in v0.8.0 (true when the entry was recorded because the countdown ran out); older records omit it
 * Settings shape: { numChoices, feedbackMode, questionsPerSession, gaId, childName, animationsEnabled, tagOverrides,
 *                    timerMode, timeLimitSeconds, maxTries, hintsEnabled, hintAfterWrongTaps, retryCountsAsStreak,
 *                    spacedRepetitionEnabled, difficultyAutoProgressionEnabled, introDismissed, speedRecordMinAccuracy, locale,
 *                    parentDateRange }
 *   maxTries: 'none' | 1 | 2 | 3 | 4 | 5 | 'unlimited' — 'none' reproduces pre-v0.6.0 behavior (locks on first wrong tap)
 *   introDismissed: { [gameId: string]: true } — gameIds present here permanently suppress that game's how-to-play intro
 *   timerMode: 'off' | 'countUp' | 'countdown' — replaces the v0.6.0 boolean `timerDisplayEnabled` (added v0.8.0)
 *   timeLimitSeconds: 5 | 10 | 15 | 20 — only enforced when timerMode === 'countdown' (added v0.8.0)
 *   speedRecordMinAccuracy: 70 | 75 | 80 | 85 | 90 | 95 | 100 — minimum session accuracy % for a speed record to be eligible (added v0.8.0)
 *   locale: 'en' — active i18next language code (added for i18n locale-switching, v0.12.0)
 *   parentDateRange: { preset, start, end } — Parent Dashboard's active date filter.
 *     preset: '7d' | '30d' | '90d' | 'all' | 'custom'; start/end are 'YYYY-MM-DD'
 *     strings, only meaningful when preset === 'custom'. Added v0.21.0.
 *
 * Best-streak adapter methods (added for per-game streak tracking):
 * getBestStreaks()            → Promise<{ [gameId: string]: number }>
 * saveBestStreaks(streaksMap) → Promise<void>
 *
 * Personal-best adapter methods (added v0.8.0):
 * getPersonalBests()           → Promise<{ [gameId: string]: { accuracy?: {...}, speedMs?: {...} } }>
 * savePersonalBests(bestsMap)  → Promise<void>
 *
 * Badge adapter methods (added v0.8.0):
 * getBadgeData()  → Promise<{ awards: { [gameId: string]: { [badgeId: string]: number } }, lifetimeQuestions: { [gameId: string]: number } }>
 * saveBadgeData(data) → Promise<void>
 */
