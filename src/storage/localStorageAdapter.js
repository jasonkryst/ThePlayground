import { DEFAULT_SETTINGS } from './adapter'

const SCORES_KEY   = 'playground_scores'
const SETTINGS_KEY = 'playground_settings'
const STREAKS_KEY = 'playground_best_streaks'
const PERSONAL_BESTS_KEY = 'playground_personal_bests'
const BADGES_KEY = 'playground_badges'
const ITEM_STATS_KEY = 'playground_item_stats'
const SESSION_RESUME_KEY = 'playground_session_resume'

// Wraps every localStorage.setItem call. QuotaExceededError is the most
// common failure mode (storage full); private-browsing restrictions can also
// make setItem throw. Log a warning so the developer can notice in DevTools,
// but don't rethrow — callers shouldn't crash on a failed save.
function safeSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch (err) {
    console.warn(`[storage] Failed to write "${key}":`, err)
  }
}

const localStorageAdapter = {
  async getScores() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SCORES_KEY) || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  },

  async addScore(score) {
    const scores = await localStorageAdapter.getScores()
    scores.push(score)
    safeSet(SCORES_KEY, JSON.stringify(scores))
  },

  async getSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
      const stored = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      const migrated = { ...stored }
      if (migrated.timerMode === undefined && migrated.timerDisplayEnabled !== undefined) {
        migrated.timerMode = migrated.timerDisplayEnabled ? 'countUp' : 'off'
      }
      return { ...DEFAULT_SETTINGS, ...migrated }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  },

  async saveSettings(settings) {
    safeSet(SETTINGS_KEY, JSON.stringify(settings))
  },

  async getBestStreaks() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STREAKS_KEY) || '{}')
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  },

  async saveBestStreaks(streaks) {
    safeSet(STREAKS_KEY, JSON.stringify(streaks))
  },

  async getPersonalBests() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PERSONAL_BESTS_KEY) || '{}')
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  },

  async savePersonalBests(bests) {
    safeSet(PERSONAL_BESTS_KEY, JSON.stringify(bests))
  },

  async getBadgeData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BADGES_KEY) || '{}')
      const valid = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      return {
        awards: valid && parsed.awards && typeof parsed.awards === 'object' ? parsed.awards : {},
        lifetimeQuestions: valid && parsed.lifetimeQuestions && typeof parsed.lifetimeQuestions === 'object' ? parsed.lifetimeQuestions : {},
        lifetimeCounters: valid && parsed.lifetimeCounters && typeof parsed.lifetimeCounters === 'object' ? parsed.lifetimeCounters : {},
      }
    } catch {
      return { awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} }
    }
  },

  async saveBadgeData(data) {
    safeSet(BADGES_KEY, JSON.stringify(data))
  },

  async getItemStats() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ITEM_STATS_KEY) || '{}')
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  },

  async saveItemStats(data) {
    safeSet(ITEM_STATS_KEY, JSON.stringify(data))
  },

  async getSessionResume() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SESSION_RESUME_KEY) || 'null')
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  },

  async saveSessionResume(state) {
    safeSet(SESSION_RESUME_KEY, JSON.stringify(state))
  },

  async clearSessionResume() {
    localStorage.removeItem(SESSION_RESUME_KEY)
  },
}

export default localStorageAdapter
