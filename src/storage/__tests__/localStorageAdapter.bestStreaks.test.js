import { vi, describe, it, expect, beforeEach } from 'vitest'
import localStorageAdapter from '../localStorageAdapter'

const STREAKS_KEY = 'playground_best_streaks'

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

describe('localStorageAdapter — best streaks', () => {
  describe('getBestStreaks', () => {
    it('returns {} when localStorage is empty', async () => {
      expect(await localStorageAdapter.getBestStreaks()).toEqual({})
    })

    it('returns stored streaks when data is valid', async () => {
      localStorage.setItem(STREAKS_KEY, JSON.stringify({ 'animal-sounds': 5 }))
      expect(await localStorageAdapter.getBestStreaks()).toEqual({ 'animal-sounds': 5 })
    })

    it('returns {} when streaks contain invalid JSON', async () => {
      localStorage.setItem(STREAKS_KEY, 'not{valid}json')
      expect(await localStorageAdapter.getBestStreaks()).toEqual({})
    })

    it('returns {} when streaks key holds JSON null', async () => {
      localStorage.setItem(STREAKS_KEY, 'null')
      expect(await localStorageAdapter.getBestStreaks()).toEqual({})
    })

    it('returns {} when streaks key holds a JSON array', async () => {
      localStorage.setItem(STREAKS_KEY, JSON.stringify([1, 2, 3]))
      expect(await localStorageAdapter.getBestStreaks()).toEqual({})
    })
  })

  describe('saveBestStreaks', () => {
    it('persists a streaks map to localStorage', async () => {
      await localStorageAdapter.saveBestStreaks({ 'animal-sounds': 7 })
      const stored = JSON.parse(localStorage.getItem(STREAKS_KEY))
      expect(stored).toEqual({ 'animal-sounds': 7 })
    })

    it('overwrites the previous streaks map', async () => {
      await localStorageAdapter.saveBestStreaks({ 'animal-sounds': 3 })
      await localStorageAdapter.saveBestStreaks({ 'animal-sounds': 9, 'color-match': 4 })
      const stored = JSON.parse(localStorage.getItem(STREAKS_KEY))
      expect(stored).toEqual({ 'animal-sounds': 9, 'color-match': 4 })
    })
  })
})
