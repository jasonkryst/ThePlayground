import { vi, beforeEach } from 'vitest'
import localStorageAdapter from '../localStorageAdapter'
import { runAdapterContractTests } from './adapterContract'

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

runAdapterContractTests(() => localStorageAdapter, { label: 'localStorageAdapter' })
