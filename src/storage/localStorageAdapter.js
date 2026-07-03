import { DEFAULT_SETTINGS } from './adapter'

const SCORES_KEY   = 'playground_scores'
const SETTINGS_KEY = 'playground_settings'
const STREAKS_KEY = 'playground_best_streaks'
const PERSONAL_BESTS_KEY = 'playground_personal_bests'
const BADGES_KEY = 'playground_badges'

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
    localStorage.setItem(SCORES_KEY, JSON.stringify(scores))
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
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
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
    localStorage.setItem(STREAKS_KEY, JSON.stringify(streaks))
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
    localStorage.setItem(PERSONAL_BESTS_KEY, JSON.stringify(bests))
  },

  async getBadgeData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BADGES_KEY) || '{}')
      const valid = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      return {
        awards: valid && parsed.awards && typeof parsed.awards === 'object' ? parsed.awards : {},
        lifetimeQuestions: valid && parsed.lifetimeQuestions && typeof parsed.lifetimeQuestions === 'object' ? parsed.lifetimeQuestions : {},
      }
    } catch {
      return { awards: {}, lifetimeQuestions: {} }
    }
  },

  async saveBadgeData(data) {
    localStorage.setItem(BADGES_KEY, JSON.stringify(data))
  },
}

export default localStorageAdapter
