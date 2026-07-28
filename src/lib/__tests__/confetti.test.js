import { describe, it, expect, vi, beforeEach } from 'vitest'

const confettiMock = vi.fn()
const defaultExportMock = vi.fn()
const createMock = vi.fn(() => confettiMock)

vi.mock('canvas-confetti', () => ({
  default: defaultExportMock,
  create: createMock,
}))

beforeEach(() => {
  vi.resetModules()
  confettiMock.mockClear()
  defaultExportMock.mockClear()
  createMock.mockClear()
})

describe('fireConfetti', () => {
  it('calls the canvas-confetti library', async () => {
    const { fireConfetti } = await import('../confetti')
    fireConfetti()
    expect(confettiMock).toHaveBeenCalledTimes(1)
  })

  it('passes a particleCount option', async () => {
    const { fireConfetti } = await import('../confetti')
    fireConfetti()
    const options = confettiMock.mock.calls[0][0]
    expect(options.particleCount).toBeGreaterThan(0)
  })
})

describe('fireFireworks', () => {
  it('fires the first burst immediately and all bursts within the window', async () => {
    vi.useFakeTimers()
    const { fireFireworks, FIREWORKS_BURSTS, FIREWORKS_INTERVAL_MS } = await import('../confetti')
    fireFireworks()
    vi.advanceTimersByTime(0)
    expect(confettiMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(FIREWORKS_BURSTS * FIREWORKS_INTERVAL_MS)
    expect(confettiMock).toHaveBeenCalledTimes(FIREWORKS_BURSTS)
    vi.useRealTimers()
  })

  it('does not keep firing after the last burst', async () => {
    vi.useFakeTimers()
    const { fireFireworks, FIREWORKS_BURSTS, FIREWORKS_INTERVAL_MS } = await import('../confetti')
    fireFireworks()
    vi.advanceTimersByTime(FIREWORKS_BURSTS * FIREWORKS_INTERVAL_MS * 3)
    expect(confettiMock).toHaveBeenCalledTimes(FIREWORKS_BURSTS)
    vi.useRealTimers()
  })

  it('varies burst origins across the sky', async () => {
    vi.useFakeTimers()
    const { fireFireworks, FIREWORKS_BURSTS, FIREWORKS_INTERVAL_MS } = await import('../confetti')
    fireFireworks()
    vi.advanceTimersByTime(FIREWORKS_BURSTS * FIREWORKS_INTERVAL_MS)
    for (const call of confettiMock.mock.calls) {
      expect(call[0].origin.x).toBeGreaterThanOrEqual(0)
      expect(call[0].origin.x).toBeLessThanOrEqual(1)
      expect(call[0].origin.y).toBeLessThanOrEqual(0.6)
    }
    vi.useRealTimers()
  })
})

// Regression coverage for issue #109: confetti/fireworks rendered nothing in
// production because the library's bare default export lazily builds a
// shared cannon with `useWorker: true`, which loads a `blob:` Worker — and
// this app's CSP has no `worker-src`, so it falls back to `script-src`,
// which disallows `blob:`. The Worker fails silently (no console error,
// no thrown exception) and the transferred canvas never has anything drawn
// to it. See e2e/confetti-csp.spec.js for a live-CSP reproduction of the
// actual bug; these are the fast unit-level guards against regressing the
// fix in src/lib/confetti.js.
describe('CSP-safe cannon construction (issue #109 regression guard)', () => {
  it('builds its own cannon via create() with useWorker disabled, so it never depends on a blob: Worker', async () => {
    await import('../confetti')
    expect(createMock).toHaveBeenCalledTimes(1)
    const [canvasArg, options] = createMock.mock.calls[0]
    // Canvas stays null (library-created, appended lazily on first real
    // burst) rather than a self-supplied element -- e2e/confetti-csp.spec.js
    // depends on no <canvas> existing in the DOM until a burst actually
    // fires (e.g. when the animations setting is off).
    expect(canvasArg).toBeNull()
    expect(options.useWorker).toBe(false)
  })

  it('never falls back to the bare default export (which would still be CSP-unsafe)', async () => {
    const { fireConfetti, fireFireworks, FIREWORKS_BURSTS, FIREWORKS_INTERVAL_MS } = await import('../confetti')
    vi.useFakeTimers()
    fireConfetti()
    fireFireworks()
    vi.advanceTimersByTime(FIREWORKS_BURSTS * FIREWORKS_INTERVAL_MS)
    vi.useRealTimers()
    expect(defaultExportMock).not.toHaveBeenCalled()
  })
})

// Regression coverage for the "region" axe-core rule (page content not
// contained by a landmark) firing on any screen rendered after a correct
// answer -- canvas-confetti's own auto-created canvas is decorative
// (pointer-events: none, nothing meant to be perceived by assistive tech)
// but isn't marked aria-hidden by the library itself.
describe('decorative canvas is hidden from the accessibility tree', () => {
  // The mocked create()/confetti() above never touches the DOM (that's the
  // real library's job), so simulate what it leaves behind: a bare <canvas>
  // appended to the body, exactly as canvas-confetti's own getCanvas() does.
  function appendUnlabeledCanvas() {
    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    return canvas
  }

  it('marks a newly-appended canvas aria-hidden after fireConfetti', async () => {
    const { fireConfetti } = await import('../confetti')
    const canvas = appendUnlabeledCanvas()
    fireConfetti()
    expect(canvas.getAttribute('aria-hidden')).toBe('true')
  })

  it('marks a newly-appended canvas aria-hidden after each fireFireworks burst', async () => {
    const { fireFireworks, FIREWORKS_BURSTS, FIREWORKS_INTERVAL_MS } = await import('../confetti')
    vi.useFakeTimers()
    const canvas = appendUnlabeledCanvas()
    fireFireworks()
    vi.advanceTimersByTime(FIREWORKS_BURSTS * FIREWORKS_INTERVAL_MS)
    vi.useRealTimers()
    expect(canvas.getAttribute('aria-hidden')).toBe('true')
  })

  it('negative: a canvas already carrying an aria-hidden value is left untouched', async () => {
    const { fireConfetti } = await import('../confetti')
    const canvas = appendUnlabeledCanvas()
    canvas.setAttribute('aria-hidden', 'false')
    fireConfetti()
    expect(canvas.getAttribute('aria-hidden')).toBe('false')
  })
})
