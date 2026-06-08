import { DEFAULT_SETTINGS } from './adapter'

const SCORES_KEY   = 'playground_scores'
const SETTINGS_KEY = 'playground_settings'

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
      return { ...DEFAULT_SETTINGS, ...stored }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  },

  async saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  },
}

export default localStorageAdapter
