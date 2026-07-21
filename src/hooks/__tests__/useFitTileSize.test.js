import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import useFitTileSize from '../useFitTileSize'

class MockResizeObserver {
  constructor(callback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }
  observe(el) { this.el = el }
  disconnect() { this.disconnected = true }
}
MockResizeObserver.instances = []

function makeBoardRef(width, height) {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {},
  })
  return { current: el }
}

beforeEach(() => {
  MockResizeObserver.instances = []
  global.ResizeObserver = MockResizeObserver
})

afterEach(() => {
  delete global.ResizeObserver
})

describe('useFitTileSize', () => {
  it('publishes the raw computed size when it already falls within [48, 140]', () => {
    // 5 cols x 2 rows, gap 12: widthPerTile=(700-48)/5=130.4, heightPerTile=(300-12)/2=144 -> min=130.4 -> floor 130
    const ref = makeBoardRef(700, 300)
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('130px')
  })

  it('clamps to the 140px cap on a generous box (negative: does not grow past the desktop default)', () => {
    const ref = makeBoardRef(2000, 1000)
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('140px')
  })

  it('floors to 48px on a height-tight box rather than the smaller raw value', () => {
    // heightPerTile=(100-12)/2=44 (raw min), but widthPerTile=90.4 has headroom -> floors to 48
    const ref = makeBoardRef(500, 100)
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('48px')
  })

  it('negative: never exceeds the width-derived size even when that is below the 48px floor (no horizontal overflow, ever)', () => {
    // widthPerTile=(200-48)/5=30.4 -- below the 48px floor itself; the floor must not push past it
    const ref = makeBoardRef(200, 300)
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('30px')
  })

  it('updates the property when the observed element resizes', () => {
    const ref = makeBoardRef(700, 300)
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    ref.current.getBoundingClientRect = () => ({ width: 2000, height: 1000 })
    MockResizeObserver.instances[0].callback()
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('140px')
  })

  it('disconnects the observer on unmount (negative: no further writes after unmount)', () => {
    const ref = makeBoardRef(700, 300)
    const { unmount } = renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    unmount()
    expect(MockResizeObserver.instances[0].disconnected).toBe(true)
    ref.current.getBoundingClientRect = () => ({ width: 2000, height: 1000 })
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('130px')
  })

  it('does nothing when ref.current is null (negative: no crash before the element mounts)', () => {
    const ref = { current: null }
    expect(() => renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))).not.toThrow()
  })

  it('does nothing when the measured box is zero-sized (negative: jsdom/pre-layout guard)', () => {
    const ref = makeBoardRef(0, 0)
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('')
  })

  it('does nothing when columns or rows is invalid (negative: guards a divide-by-zero shape)', () => {
    const ref = makeBoardRef(700, 300)
    renderHook(() => useFitTileSize(ref, { columns: 0, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('')
  })
})
