import { describe, it, expect, vi, beforeEach } from 'vitest'

const confettiMock = vi.fn()
vi.mock('canvas-confetti', () => ({ default: confettiMock }))

beforeEach(() => { confettiMock.mockClear() })

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
