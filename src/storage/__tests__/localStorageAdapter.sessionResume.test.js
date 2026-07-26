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

const sampleState = {
  gameId: 'animal-sounds',
  queue: [{ correct: { id: 'dog' }, choices: [{ id: 'dog' }, { id: 'cat' }] }],
  index: 1,
  score: 1,
  streak: 1,
  missed: [],
  timings: [{ questionIndex: 0, itemId: 'dog', correct: true, durationMs: 800, attemptNumber: 1 }],
  peakStreak: 1,
  savedAt: 1700000000000,
}

describe('localStorageAdapter — session resume', () => {
  it('returns null when nothing is stored', async () => {
    expect(await localStorageAdapter.getSessionResume()).toBe(null)
  })

  it('round-trips a saved session state', async () => {
    await localStorageAdapter.saveSessionResume(sampleState)
    expect(await localStorageAdapter.getSessionResume()).toEqual(sampleState)
  })

  it('clearSessionResume removes the saved state', async () => {
    await localStorageAdapter.saveSessionResume(sampleState)
    await localStorageAdapter.clearSessionResume()
    expect(await localStorageAdapter.getSessionResume()).toBe(null)
  })

  it('returns null when the stored value is corrupted JSON', async () => {
    localStorage.setItem('playground_session_resume', '{not valid json')
    expect(await localStorageAdapter.getSessionResume()).toBe(null)
  })

  it('returns null when the stored value is an array, not an object', async () => {
    localStorage.setItem('playground_session_resume', '[1,2,3]')
    expect(await localStorageAdapter.getSessionResume()).toBe(null)
  })
})
