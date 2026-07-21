import { act, renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import useTagRowOverflow from '../useTagRowOverflow'

class MockResizeObserver {
  constructor(callback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }
  observe(el) { this.el = el }
  disconnect() { this.disconnected = true }
}
MockResizeObserver.instances = []

function makePill({ offsetTop, height }) {
  const el = document.createElement('button')
  Object.defineProperty(el, 'offsetTop', { value: offsetTop, configurable: true })
  el.getBoundingClientRect = () => ({
    height, width: 0, top: offsetTop, left: 0, right: 0, bottom: offsetTop + height, x: 0, y: offsetTop, toJSON() {},
  })
  return el
}

function makeRow(pills) {
  const el = document.createElement('div')
  pills.forEach(p => el.appendChild(p))
  return { current: el }
}

beforeEach(() => {
  MockResizeObserver.instances = []
  global.ResizeObserver = MockResizeObserver
})

describe('useTagRowOverflow', () => {
  it("reports every child visible and the first child's height when all share the first row's offsetTop", () => {
    const ref = makeRow([
      makePill({ offsetTop: 0, height: 44 }),
      makePill({ offsetTop: 0, height: 44 }),
      makePill({ offsetTop: 0, height: 44 }),
    ])
    const { result } = renderHook(() => useTagRowOverflow(ref, 'a'))
    expect(result.current.visibleCount).toBe(3)
    expect(result.current.rowHeight).toBe(44)
  })

  it('excludes children that wrapped to a second row (larger offsetTop) from visibleCount', () => {
    const ref = makeRow([
      makePill({ offsetTop: 0, height: 44 }),
      makePill({ offsetTop: 0, height: 44 }),
      makePill({ offsetTop: 52, height: 44 }),
    ])
    const { result } = renderHook(() => useTagRowOverflow(ref, 'a'))
    expect(result.current.visibleCount).toBe(2)
  })

  it('negative: does nothing when ref.current is null', () => {
    const ref = { current: null }
    expect(() => renderHook(() => useTagRowOverflow(ref, 'a'))).not.toThrow()
  })

  it('negative: keeps the Infinity/null defaults when the row has no children yet', () => {
    const ref = makeRow([])
    const { result } = renderHook(() => useTagRowOverflow(ref, 'a'))
    expect(result.current.visibleCount).toBe(Infinity)
    expect(result.current.rowHeight).toBe(null)
  })

  it('recomputes when the observed element resizes (a wrapped pill now fits row 1)', () => {
    const ref = makeRow([
      makePill({ offsetTop: 0, height: 44 }),
      makePill({ offsetTop: 52, height: 44 }),
    ])
    const { result } = renderHook(() => useTagRowOverflow(ref, 'a'))
    expect(result.current.visibleCount).toBe(1)
    Object.defineProperty(ref.current.children[1], 'offsetTop', { value: 0, configurable: true })
    act(() => { MockResizeObserver.instances[0].callback() })
    expect(result.current.visibleCount).toBe(2)
  })

  it('recomputes when dep changes', () => {
    const ref = makeRow([makePill({ offsetTop: 0, height: 44 })])
    const { result, rerender } = renderHook(({ dep }) => useTagRowOverflow(ref, dep), {
      initialProps: { dep: 'a' },
    })
    expect(result.current.visibleCount).toBe(1)
    ref.current.appendChild(makePill({ offsetTop: 0, height: 44 }))
    rerender({ dep: 'b' })
    expect(result.current.visibleCount).toBe(2)
  })

  it('negative: disconnects the observer on unmount (no further recompute)', () => {
    const ref = makeRow([makePill({ offsetTop: 0, height: 44 })])
    const { unmount } = renderHook(() => useTagRowOverflow(ref, 'a'))
    unmount()
    expect(MockResizeObserver.instances[0].disconnected).toBe(true)
  })
})
