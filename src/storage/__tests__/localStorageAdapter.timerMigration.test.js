import { vi, describe, it, expect, beforeEach } from 'vitest'
import localStorageAdapter from '../localStorageAdapter'

const SETTINGS_KEY = 'playground_settings'

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

describe('localStorageAdapter — timerMode migration', () => {
  it('maps a stored timerDisplayEnabled=true to timerMode="countUp" when timerMode is absent', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ timerDisplayEnabled: true }))
    const settings = await localStorageAdapter.getSettings()
    expect(settings.timerMode).toBe('countUp')
  })

  it('maps a stored timerDisplayEnabled=false to timerMode="off" when timerMode is absent', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ timerDisplayEnabled: false }))
    const settings = await localStorageAdapter.getSettings()
    expect(settings.timerMode).toBe('off')
  })

  it('does not override an already-stored timerMode with the legacy flag', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ timerDisplayEnabled: false, timerMode: 'countdown', timeLimitSeconds: 15 }))
    const settings = await localStorageAdapter.getSettings()
    expect(settings.timerMode).toBe('countdown')
    expect(settings.timeLimitSeconds).toBe(15)
  })

  it('defaults to timerMode="countUp" when neither timerMode nor the legacy flag is stored', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({}))
    const settings = await localStorageAdapter.getSettings()
    expect(settings.timerMode).toBe('countUp')
  })

  it('defaults speedRecordMinAccuracy to 70 and timeLimitSeconds to 10', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({}))
    const settings = await localStorageAdapter.getSettings()
    expect(settings.speedRecordMinAccuracy).toBe(70)
    expect(settings.timeLimitSeconds).toBe(10)
  })
})
