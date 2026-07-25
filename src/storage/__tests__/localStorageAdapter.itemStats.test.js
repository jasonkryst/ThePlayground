import { vi, describe, it, expect, beforeEach } from 'vitest'
import localStorageAdapter from '../localStorageAdapter'

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

describe('localStorageAdapter — item stats', () => {
  it('returns an empty object when nothing is stored', async () => {
    expect(await localStorageAdapter.getItemStats()).toEqual({})
  })

  it('round-trips saved item stats', async () => {
    const data = { 'animal-sounds': { dog: { missCount: 2, lastMissedAt: 1700000000000 } } }
    await localStorageAdapter.saveItemStats(data)
    expect(await localStorageAdapter.getItemStats()).toEqual(data)
  })

  it('returns an empty object when the stored value is corrupted JSON', async () => {
    localStorage.setItem('playground_item_stats', '{not valid json')
    expect(await localStorageAdapter.getItemStats()).toEqual({})
  })

  it('returns an empty object when the stored value is an array, not an object', async () => {
    localStorage.setItem('playground_item_stats', '[1,2,3]')
    expect(await localStorageAdapter.getItemStats()).toEqual({})
  })
})
