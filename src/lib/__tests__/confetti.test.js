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
