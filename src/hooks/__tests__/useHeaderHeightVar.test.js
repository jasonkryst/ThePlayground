import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import useHeaderHeightVar from '../useHeaderHeightVar'

class MockResizeObserver {
  constructor(callback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }
  observe(el) { this.el = el }
  disconnect() { this.disconnected = true }
}
MockResizeObserver.instances = []

function makeHeaderRef(height) {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({
    height, width: 0, top: 0, left: 0, right: 0, bottom: height, x: 0, y: 0, toJSON() {},
  })
  return { current: el }
}

beforeEach(() => {
  MockResizeObserver.instances = []
  global.ResizeObserver = MockResizeObserver
  document.documentElement.style.removeProperty('--shell-header-height')
})

afterEach(() => {
  delete global.ResizeObserver
})

describe('useHeaderHeightVar', () => {
  it('publishes the header element\'s rendered height as a CSS custom property on mount', () => {
    const ref = makeHeaderRef(102)
    renderHook(() => useHeaderHeightVar(ref))
    expect(document.documentElement.style.getPropertyValue('--shell-header-height')).toBe('102px')
  })

  it('updates the property when the observed element resizes', () => {
    const ref = makeHeaderRef(102)
    renderHook(() => useHeaderHeightVar(ref))
    ref.current.getBoundingClientRect = () => ({ height: 132 })
    MockResizeObserver.instances[0].callback()
    expect(document.documentElement.style.getPropertyValue('--shell-header-height')).toBe('132px')
  })

  it('disconnects the observer on unmount (negative: no further writes after unmount)', () => {
    const ref = makeHeaderRef(102)
    const { unmount } = renderHook(() => useHeaderHeightVar(ref))
    unmount()
    expect(MockResizeObserver.instances[0].disconnected).toBe(true)
    ref.current.getBoundingClientRect = () => ({ height: 999 })
    expect(document.documentElement.style.getPropertyValue('--shell-header-height')).toBe('102px')
  })

  it('does nothing when ref.current is null (negative: no crash before the element mounts)', () => {
    const ref = { current: null }
    expect(() => renderHook(() => useHeaderHeightVar(ref))).not.toThrow()
    expect(document.documentElement.style.getPropertyValue('--shell-header-height')).toBe('')
  })
})
