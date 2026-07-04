import { vi, describe, it, expect, beforeEach } from 'vitest'
import localStorageAdapter from '../localStorageAdapter'

const PERSONAL_BESTS_KEY = 'playground_personal_bests'

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

describe('localStorageAdapter — personal bests', () => {
  describe('getPersonalBests', () => {
    it('returns {} when localStorage is empty', async () => {
      expect(await localStorageAdapter.getPersonalBests()).toEqual({})
    })

    it('returns stored bests when data is valid', async () => {
      const stored = { 'animal-sounds': { accuracy: { ratio: 0.8, score: 8, total: 10, timestamp: 1000 } } }
      localStorage.setItem(PERSONAL_BESTS_KEY, JSON.stringify(stored))
      expect(await localStorageAdapter.getPersonalBests()).toEqual(stored)
    })

    it('returns {} when the stored value is invalid JSON', async () => {
      localStorage.setItem(PERSONAL_BESTS_KEY, 'not{valid}json')
      expect(await localStorageAdapter.getPersonalBests()).toEqual({})
    })

    it('returns {} when the stored value is a JSON array', async () => {
      localStorage.setItem(PERSONAL_BESTS_KEY, JSON.stringify([1, 2, 3]))
      expect(await localStorageAdapter.getPersonalBests()).toEqual({})
    })
  })

  describe('savePersonalBests', () => {
    it('persists a bests map to localStorage', async () => {
      const bests = { 'color-match': { speedMs: { avgMs: 1800, timestamp: 2000 } } }
      await localStorageAdapter.savePersonalBests(bests)
      expect(JSON.parse(localStorage.getItem(PERSONAL_BESTS_KEY))).toEqual(bests)
    })

    it('overwrites the previous bests map', async () => {
      await localStorageAdapter.savePersonalBests({ 'animal-sounds': { accuracy: { ratio: 0.5, score: 5, total: 10, timestamp: 1 } } })
      await localStorageAdapter.savePersonalBests({ 'animal-sounds': { accuracy: { ratio: 0.9, score: 9, total: 10, timestamp: 2 } } })
      const stored = JSON.parse(localStorage.getItem(PERSONAL_BESTS_KEY))
      expect(stored['animal-sounds'].accuracy.ratio).toBe(0.9)
    })
  })
})
