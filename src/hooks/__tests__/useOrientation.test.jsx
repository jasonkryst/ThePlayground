import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import useOrientation from '../useOrientation'

// jsdom ships neither matchMedia nor screen.orientation, so each test
// installs exactly the API surface it wants and removes it afterwards.

function installMatchMedia({ coarse = false, landscape = true } = {}) {
  const state = { coarse, landscape }
  const listeners = new Set()
  window.matchMedia = query => ({
    get matches() {
      if (query === '(pointer: coarse)') return state.coarse
      if (query === '(orientation: landscape)') return state.landscape
      return false
    },
    media: query,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  })
  return {
    rotate(landscapeNow) {
      state.landscape = landscapeNow
      listeners.forEach(fn => fn())
    },
  }
}

function installScreenOrientation(initialType = 'landscape-primary') {
  const state = { type: initialType }
  const listeners = new Set()
  Object.defineProperty(window.screen, 'orientation', {
    configurable: true,
    value: {
      get type() { return state.type },
      addEventListener: (_type, fn) => listeners.add(fn),
      removeEventListener: (_type, fn) => listeners.delete(fn),
    },
  })
  return {
    change(newType) {
      state.type = newType
      listeners.forEach(fn => fn())
    },
  }
}

afterEach(() => {
  delete window.matchMedia
  delete window.screen.orientation
})

describe('useOrientation', () => {
  it('fine pointer: follows the (orientation: landscape) media query', () => {
    const media = installMatchMedia({ coarse: false, landscape: true })
    const { result } = renderHook(() => useOrientation())
    expect(result.current).toBe('landscape')
    act(() => media.rotate(false))
    expect(result.current).toBe('portrait')
    act(() => media.rotate(true))
    expect(result.current).toBe('landscape')
  })

  it('coarse pointer with screen.orientation: follows the physical device orientation', () => {
    installMatchMedia({ coarse: true, landscape: true })
    const device = installScreenOrientation('portrait-primary')
    const { result } = renderHook(() => useOrientation())
    expect(result.current).toBe('portrait')
    act(() => device.change('landscape-secondary'))
    expect(result.current).toBe('landscape')
  })

  it('coarse pointer WITHOUT screen.orientation falls back to the media query (negative)', () => {
    const media = installMatchMedia({ coarse: true, landscape: false })
    const { result } = renderHook(() => useOrientation())
    expect(result.current).toBe('portrait')
    act(() => media.rotate(true))
    expect(result.current).toBe('landscape')
  })

  it('no matchMedia at all degrades to landscape, never crashing (negative)', () => {
    const { result } = renderHook(() => useOrientation())
    expect(result.current).toBe('landscape')
  })

  it('unknown screen.orientation.type values degrade to landscape (negative)', () => {
    installMatchMedia({ coarse: true })
    installScreenOrientation('some-future-value')
    const { result } = renderHook(() => useOrientation())
    expect(result.current).toBe('landscape')
  })

  it('unsubscribes on unmount (no listener leak)', () => {
    const media = installMatchMedia({ coarse: false, landscape: true })
    const { unmount } = renderHook(() => useOrientation())
    unmount()
    expect(() => act(() => media.rotate(false))).not.toThrow()
  })
})
