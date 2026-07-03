// src/storage/__tests__/localStorageAdapter.badges.test.js
import { vi, describe, it, expect, beforeEach } from 'vitest'
import localStorageAdapter from '../localStorageAdapter'

const BADGES_KEY = 'playground_badges'

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

describe('localStorageAdapter — badge data', () => {
  describe('getBadgeData', () => {
    it('returns empty awards/lifetimeQuestions when localStorage is empty', async () => {
      expect(await localStorageAdapter.getBadgeData()).toEqual({ awards: {}, lifetimeQuestions: {} })
    })

    it('returns stored data when valid', async () => {
      const stored = { awards: { 'animal-sounds': { hotStreak: 2 } }, lifetimeQuestions: { 'animal-sounds': 120 } }
      localStorage.setItem(BADGES_KEY, JSON.stringify(stored))
      expect(await localStorageAdapter.getBadgeData()).toEqual(stored)
    })

    it('returns empty shape when the stored value is invalid JSON', async () => {
      localStorage.setItem(BADGES_KEY, 'not{valid}json')
      expect(await localStorageAdapter.getBadgeData()).toEqual({ awards: {}, lifetimeQuestions: {} })
    })

    it('returns empty shape when the stored value is a JSON array', async () => {
      localStorage.setItem(BADGES_KEY, JSON.stringify([1, 2, 3]))
      expect(await localStorageAdapter.getBadgeData()).toEqual({ awards: {}, lifetimeQuestions: {} })
    })

    it('fills in an empty awards object when only lifetimeQuestions is present', async () => {
      localStorage.setItem(BADGES_KEY, JSON.stringify({ lifetimeQuestions: { 'color-match': 10 } }))
      expect(await localStorageAdapter.getBadgeData()).toEqual({ awards: {}, lifetimeQuestions: { 'color-match': 10 } })
    })
  })

  describe('saveBadgeData', () => {
    it('persists badge data to localStorage', async () => {
      const data = { awards: { 'color-match': { perfectSession: 1 } }, lifetimeQuestions: { 'color-match': 10 } }
      await localStorageAdapter.saveBadgeData(data)
      expect(JSON.parse(localStorage.getItem(BADGES_KEY))).toEqual(data)
    })

    it('overwrites the previous badge data', async () => {
      await localStorageAdapter.saveBadgeData({ awards: {}, lifetimeQuestions: { 'animal-sounds': 10 } })
      await localStorageAdapter.saveBadgeData({ awards: {}, lifetimeQuestions: { 'animal-sounds': 20 } })
      const stored = JSON.parse(localStorage.getItem(BADGES_KEY))
      expect(stored.lifetimeQuestions['animal-sounds']).toBe(20)
    })
  })
})
