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

function makeBoardRef({ width, top }) {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({
    width, top, height: 0, left: 0, right: width, bottom: top, x: 0, y: top, toJSON() {},
  })
  return { current: el }
}

function installFooter(height) {
  const footer = document.createElement('div')
  footer.className = 'shell__footer'
  footer.getBoundingClientRect = () => ({
    height, width: 0, top: 0, left: 0, right: 0, bottom: height, x: 0, y: 0, toJSON() {},
  })
  document.body.appendChild(footer)
  return footer
}

function setInnerHeight(value) {
  Object.defineProperty(window, 'innerHeight', { value, configurable: true })
}

const ORIGINAL_INNER_HEIGHT = window.innerHeight

beforeEach(() => {
  MockResizeObserver.instances = []
  global.ResizeObserver = MockResizeObserver
})

afterEach(() => {
  delete global.ResizeObserver
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  document.body.innerHTML = ''
  setInnerHeight(ORIGINAL_INNER_HEIGHT)
})

describe('useFitTileSize', () => {
  it('computes available height from innerHeight - top - footer height - game padding, not the wrapper\'s own box', () => {
    // Verified against the real running app at 900x490 (issue #104 design doc):
    // innerHeight=490, top=222, footer=43, GAME_BOTTOM_PADDING_PX=24 -> availableHeight=201.
    // 5 cols x 2 rows, gap 12: heightPerTile=(201-12)/2=94.5, widthPerTile=(853-48)/5=161 -> min=94.5 -> floor 94.
    setInnerHeight(490)
    installFooter(43)
    const ref = makeBoardRef({ width: 853, top: 222 })
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('94px')
  })

  it('produces the same result regardless of the page\'s current scroll position (issue #104: getBoundingClientRect().top is viewport-relative, so a scrolled page must not be read as extra available height)', () => {
    // Same inputs as the primary case above, but as if the page were
    // scrolled 91px (matches a real scenario found via Playwright: clicking
    // a below-the-fold intro "Start" button leaves the page scrolled after
    // the view switches to the board). The board's rect.top the browser
    // reports drops by the scroll amount even though its true position
    // relative to the (sticky, viewport-pinned) header hasn't changed.
    setInnerHeight(490)
    installFooter(43)
    Object.defineProperty(window, 'scrollY', { value: 91, configurable: true })
    const ref = makeBoardRef({ width: 853, top: 222 - 91 })
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('94px')
  })

  it('clamps to the 140px cap on a generous viewport (negative: does not grow past the desktop default)', () => {
    setInnerHeight(2000)
    installFooter(50)
    const ref = makeBoardRef({ width: 2000, top: 100 })
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('140px')
  })

  it('floors to 48px on a height-tight viewport rather than the smaller raw value', () => {
    // availableHeight=250-100-24-40=86, heightPerTile=(86-12)/2=37 (raw min), but
    // widthPerTile=(500-48)/5=90.4 has headroom -> floors to 48
    setInnerHeight(250)
    installFooter(40)
    const ref = makeBoardRef({ width: 500, top: 100 })
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('48px')
  })

  it('negative: never exceeds the width-derived size even when that is below the 48px floor (no horizontal overflow, ever)', () => {
    // widthPerTile=(200-48)/5=30.4 -- below the 48px floor itself; the floor must not push past it
    setInnerHeight(1000)
    installFooter(50)
    const ref = makeBoardRef({ width: 200, top: 50 })
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('30px')
  })

  it('negative: treats a missing shell footer as zero height rather than throwing', () => {
    setInnerHeight(2000)
    // no installFooter() call -- document.querySelector('.shell__footer') is null
    const ref = makeBoardRef({ width: 2000, top: 100 })
    expect(() => renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))).not.toThrow()
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('140px')
  })

  it('negative: does nothing when the board starts below the viewport (non-positive available height)', () => {
    setInnerHeight(300)
    installFooter(40)
    const ref = makeBoardRef({ width: 500, top: 400 }) // top alone already exceeds innerHeight
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('')
  })

  it('updates the property when the observed element resizes', () => {
    setInnerHeight(490)
    installFooter(43)
    const ref = makeBoardRef({ width: 853, top: 222 })
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('94px')
    ref.current.getBoundingClientRect = () => ({ width: 2000, top: 100 })
    MockResizeObserver.instances[0].callback()
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('140px')
  })

  it('updates the property on a window resize event', () => {
    setInnerHeight(490)
    installFooter(43)
    const ref = makeBoardRef({ width: 853, top: 222 })
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('94px')
    setInnerHeight(2000)
    window.dispatchEvent(new Event('resize'))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('140px')
  })

  it('disconnects the observer and removes the resize listener on unmount (negative: no further writes after unmount)', () => {
    setInnerHeight(490)
    installFooter(43)
    const ref = makeBoardRef({ width: 853, top: 222 })
    const { unmount } = renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('94px')
    unmount()
    expect(MockResizeObserver.instances[0].disconnected).toBe(true)
    // A real ResizeObserver never fires its callback again once disconnected
    // (unlike this mock's stored callback reference, which would still run
    // if invoked directly -- so this test relies only on genuine browser
    // behavior: window.removeEventListener actually stops the resize
    // listener from firing, which dispatchEvent below proves).
    setInnerHeight(2000)
    window.dispatchEvent(new Event('resize'))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('94px')
  })

  it('does nothing when ref.current is null (negative: no crash before the element mounts)', () => {
    const ref = { current: null }
    expect(() => renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))).not.toThrow()
  })

  it('does nothing when the measured width is zero (negative: jsdom/pre-layout guard)', () => {
    setInnerHeight(490)
    installFooter(43)
    const ref = makeBoardRef({ width: 0, top: 222 })
    renderHook(() => useFitTileSize(ref, { columns: 5, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('')
  })

  it('does nothing when columns or rows is invalid (negative: guards a divide-by-zero shape)', () => {
    setInnerHeight(490)
    installFooter(43)
    const ref = makeBoardRef({ width: 853, top: 222 })
    renderHook(() => useFitTileSize(ref, { columns: 0, rows: 2, gap: 12 }))
    expect(ref.current.style.getPropertyValue('--memory-board-tile-size')).toBe('')
  })
})
