import { vi, describe, it, expect, beforeEach } from 'vitest'
import localStorageAdapter from '../localStorageAdapter'

// These tests exercise the real adapter against a controlled in-memory
// localStorage stand-in (not mocked methods — real parsing/stringification).
// They verify the app stays stable when localStorage contains corrupt,
// missing, or adversarially shaped data.

const SCORES_KEY   = 'playground_scores'
const SETTINGS_KEY = 'playground_settings'

// In-memory localStorage compatible with the Web Storage API surface
const makeLocalStorage = () => {
  let store = {}
  return {
    getItem:    (key)        => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem:    (key, value) => { store[key] = String(value) },
    removeItem: (key)        => { delete store[key] },
    clear:      ()           => { store = {} },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorage())
})

describe('localStorageAdapter — data integrity', () => {
  describe('getScores', () => {
    it('returns [] when localStorage is empty', async () => {
      expect(await localStorageAdapter.getScores()).toEqual([])
    })

    it('returns [] when scores contain invalid JSON', async () => {
      localStorage.setItem(SCORES_KEY, 'not{valid}json')
      expect(await localStorageAdapter.getScores()).toEqual([])
    })

    it('returns [] when scores key holds JSON null', async () => {
      // JSON.parse('null') === null — must not be returned as-is
      localStorage.setItem(SCORES_KEY, 'null')
      const result = await localStorageAdapter.getScores()
      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([])
    })

    it('returns [] when scores key holds a JSON object instead of array', async () => {
      localStorage.setItem(SCORES_KEY, JSON.stringify({ not: 'an array' }))
      const result = await localStorageAdapter.getScores()
      expect(Array.isArray(result)).toBe(true)
    })

    it('returns [] when scores key holds a JSON primitive', async () => {
      localStorage.setItem(SCORES_KEY, '42')
      const result = await localStorageAdapter.getScores()
      expect(Array.isArray(result)).toBe(true)
    })

    it('returns stored scores when data is valid', async () => {
      const scores = [
        { gameId: 'animal-sounds', score: 8, total: 10, date: '2026-06-07', timestamp: 1 },
      ]
      localStorage.setItem(SCORES_KEY, JSON.stringify(scores))
      expect(await localStorageAdapter.getScores()).toEqual(scores)
    })
  })

  describe('addScore', () => {
    it('persists a score to localStorage', async () => {
      const score = { gameId: 'animal-sounds', score: 8, total: 10, date: '2026-06-07', timestamp: 1 }
      await localStorageAdapter.addScore(score)
      const stored = JSON.parse(localStorage.getItem(SCORES_KEY))
      expect(stored).toHaveLength(1)
      expect(stored[0].score).toBe(8)
    })

    it('appends without overwriting existing scores', async () => {
      const s1 = { gameId: 'animal-sounds', score: 5, total: 10, date: '2026-06-06', timestamp: 1 }
      const s2 = { gameId: 'animal-sounds', score: 9, total: 10, date: '2026-06-07', timestamp: 2 }
      await localStorageAdapter.addScore(s1)
      await localStorageAdapter.addScore(s2)
      expect(JSON.parse(localStorage.getItem(SCORES_KEY))).toHaveLength(2)
    })

    it('recovers from corrupt existing scores without throwing', async () => {
      localStorage.setItem(SCORES_KEY, 'totally-corrupt')
      const score = { gameId: 'animal-sounds', score: 7, total: 10, date: '2026-06-07', timestamp: 1 }
      await expect(localStorageAdapter.addScore(score)).resolves.not.toThrow()
      // New score is written cleanly after corrupt data is discarded
      const stored = JSON.parse(localStorage.getItem(SCORES_KEY))
      expect(stored).toHaveLength(1)
    })
  })

  describe('getSettings', () => {
    it('returns defaults when localStorage is empty', async () => {
      const s = await localStorageAdapter.getSettings()
      expect(s.numChoices).toBe(2)
      expect(s.feedbackMode).toBe('immediate')
      expect(s.questionsPerSession).toBe(10)
    })

    it('returns defaults when settings key contains invalid JSON', async () => {
      localStorage.setItem(SETTINGS_KEY, '{{broken')
      const s = await localStorageAdapter.getSettings()
      expect(s.numChoices).toBe(2)
      expect(s.feedbackMode).toBe('immediate')
    })

    it('returns defaults when settings key holds JSON null', async () => {
      localStorage.setItem(SETTINGS_KEY, 'null')
      const s = await localStorageAdapter.getSettings()
      expect(s.numChoices).toBe(2)
    })

    it('returns defaults when settings key holds a JSON array', async () => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify([1, 2, 3]))
      const s = await localStorageAdapter.getSettings()
      expect(s.numChoices).toBe(2)
    })

    it('merges stored values over defaults', async () => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ numChoices: 4 }))
      const s = await localStorageAdapter.getSettings()
      expect(s.numChoices).toBe(4)
      expect(s.feedbackMode).toBe('immediate') // default preserved
    })

    it('does not throw when stored settings contain unexpected value types', async () => {
      // Simulates a browser extension or tab writing unexpected data
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        numChoices: 'not-a-number',
        feedbackMode: 99999,
        questionsPerSession: null,
      }))
      await expect(localStorageAdapter.getSettings()).resolves.toBeDefined()
    })
  })

  describe('saveSettings', () => {
    it('persists settings to localStorage', async () => {
      await localStorageAdapter.saveSettings({ numChoices: 3, feedbackMode: 'parent-tap', questionsPerSession: 15 })
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY))
      expect(stored.numChoices).toBe(3)
      expect(stored.feedbackMode).toBe('parent-tap')
    })

    it('overwrites previous settings', async () => {
      await localStorageAdapter.saveSettings({ numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 10 })
      await localStorageAdapter.saveSettings({ numChoices: 4, feedbackMode: 'parent-tap', questionsPerSession: 20 })
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY))
      expect(stored.numChoices).toBe(4)
    })
  })
})
