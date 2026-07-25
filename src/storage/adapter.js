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
  adaptiveItemSelectionEnabled: false,
  difficultyAutoProgressionEnabled: false,
  introDismissed: {},
  speedRecordMinAccuracy: 70,
  locale: 'en',
  parentDateRange: { preset: 'all', start: null, end: null },
  memoryPairs: 5,
  soundEffectsEnabled: true,
}

/**
 * Storage adapter interface. Every adapter must implement all ten async
 * methods below: the score, settings, best-streak, personal-best, and
 * badge-data get/save pairs.
 *
 * getScores()              → Promise<Score[]>
 * addScore(score)          → Promise<void>
 * getSettings()             → Promise<Settings>
 * saveSettings(settings)   → Promise<void>
 *
 * Score shape:   { gameId, score, total, date, timestamp, peakStreak?, timings?,
 *                  flipAttempts?, mismatches?, peakMatchStreak?, durationMs? }
 *   peakStreak?: number — highest consecutive-correct run in that session (added v0.4.0);
 *     memory sessions (v0.23.0+) also write it, mirroring peakMatchStreak
 *   Quiz sessions (useGameSession) add:
 *   timings?: Array<{ questionIndex: number, itemId: string, correct: boolean, durationMs: number, attemptNumber: number, timedOut?: boolean }>
 *     itemId added in v0.4.0; older records omit it
 *     attemptNumber added in v0.6.0 (1 = first tap, 2 = first retry, etc.); older records omit it
 *     timedOut added in v0.8.0 (true when the entry was recorded because the countdown ran out); older records omit it
 *   Memory sessions (useMemorySession, added v0.23.0) add:
 *   flipAttempts?: number — pair-flip attempts taken to clear the board
 *   mismatches?: number — flips that revealed a non-matching pair
 *   peakMatchStreak?: number — longest run of consecutive matches
 *   durationMs?: number — wall-clock board time (excludes time paused behind the
 *     orientation overlay; added v0.24.0)
 * Settings shape: { numChoices, feedbackMode, questionsPerSession, gaId, childName, animationsEnabled, tagOverrides,
 *                    timerMode, timeLimitSeconds, maxTries, hintsEnabled, hintAfterWrongTaps, retryCountsAsStreak,
 *                    spacedRepetitionEnabled, adaptiveItemSelectionEnabled, difficultyAutoProgressionEnabled, introDismissed, speedRecordMinAccuracy, locale,
 *                    parentDateRange, memoryPairs, soundEffectsEnabled }
 *   maxTries: 'none' | 1 | 2 | 3 | 4 | 5 | 'unlimited' — 'none' reproduces pre-v0.6.0 behavior (locks on first wrong tap)
 *   introDismissed: { [gameId: string]: true } — gameIds present here permanently suppress that game's how-to-play intro
 *   timerMode: 'off' | 'countUp' | 'countdown' — replaces the v0.6.0 boolean `timerDisplayEnabled` (added v0.8.0)
 *   timeLimitSeconds: 5 | 10 | 15 | 20 — only enforced when timerMode === 'countdown' (added v0.8.0)
 *   speedRecordMinAccuracy: 70 | 75 | 80 | 85 | 90 | 95 | 100 — minimum session accuracy % for a speed record to be eligible (added v0.8.0)
 *   locale: 'en' — active i18next language code (added for i18n locale-switching, v0.12.0)
 *   parentDateRange: { preset, start, end } — Parent Dashboard's active date filter.
 *     preset: '7d' | '30d' | '90d' | 'all' | 'custom'; start/end are 'YYYY-MM-DD'
 *     strings, only meaningful when preset === 'custom'. Added v0.21.0.
 *   memoryPairs: 3 | 4 | 5 | 6 — pairs per board for memory-type games (added v0.23.0)
 *   soundEffectsEnabled: boolean — gates game sound effects: memory match sounds and quiz correct/wrong chimes (added v0.23.0; quiz chimes v0.26.0)
 *   adaptiveItemSelectionEnabled: boolean — when true, future sessions' queues are weighted toward
 *     items missed in *previous* sessions (decayed by recency, capped at 3x baseline). Independent of
 *     spacedRepetitionEnabled, which only reinserts a missed item within the *same* session. (added v0.35.0)
 *
 * Best-streak adapter methods (added for per-game streak tracking):
 * getBestStreaks()            → Promise<{ [gameId: string]: number }>
 * saveBestStreaks(streaksMap) → Promise<void>
 *
 * Personal-best adapter methods (added v0.8.0):
 * getPersonalBests()           → Promise<{ [gameId: string]: { accuracy?: {...}, speedMs?: {...}, fewestFlips?: {...}, fastestMs?: {...} } }>
 *   fewestFlips?: { [pairs]: { flips, timestamp } } — per-board-size personal best for memory games (added v0.23.0)
 *   fastestMs?: { [pairs]: { ms, timestamp } } — per-board-size fastest-time personal best for memory games (added v0.24.0)
 * savePersonalBests(bestsMap)  → Promise<void>
 *
 * Badge adapter methods (added v0.8.0):
 * getBadgeData()  → Promise<{ awards: { [gameId]: { [badgeId]: number } }, lifetimeQuestions: { [gameId]: number }, lifetimeCounters: { [gameId]: { [counter: string]: number } } }>
 *   lifetimeCounters added v0.23.0 for per-game badge catalogs (e.g. pairsMatched for memory games)
 * saveBadgeData(data) → Promise<void>
 *
 * Item-stats adapter methods (added v0.35.0, for cross-session adaptive item selection):
 * getItemStats()      → Promise<{ [gameId]: { [itemId]: { missCount: number, lastMissedAt: number } } }>
 * saveItemStats(data) → Promise<void>
 */
