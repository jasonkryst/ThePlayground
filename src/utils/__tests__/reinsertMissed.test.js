import { describe, it, expect, vi, afterEach } from 'vitest'
import reinsertMissed from '../reinsertMissed'

const entry = id => ({ correct: { id }, choices: [{ id }] })

afterEach(() => { vi.restoreAllMocks() })

describe('reinsertMissed', () => {
  it('reinserts the missed entry 2-4 questions ahead of the current index', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // offset = 2
    const queue = [entry('a'), entry('b'), entry('c'), entry('d'), entry('e')]
    const missed = entry('a')
    const next = reinsertMissed(queue, 0, missed)
    expect(next[2]).toBe(missed)
  })

  it('keeps the queue length unchanged', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // offset = 4
    const queue = [entry('a'), entry('b'), entry('c'), entry('d'), entry('e')]
    const next = reinsertMissed(queue, 0, entry('a'))
    expect(next).toHaveLength(queue.length)
  })

  it('clamps the target index to the end of the queue when there is not enough room', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // offset = 4
    const queue = [entry('a'), entry('b'), entry('c')]
    const missed = entry('a')
    const next = reinsertMissed(queue, 1, missed) // 1 + 4 = 5, clamp to length-1 = 2
    expect(next[2]).toBe(missed)
    expect(next).toHaveLength(3)
  })

  it('does not modify the queue when there is no room ahead of the current index', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const queue = [entry('a'), entry('b')]
    const missed = entry('a')
    const next = reinsertMissed(queue, 1, missed) // currentIndex is already the last index
    expect(next).toEqual(queue)
  })

  it('does not mutate the original queue array', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const queue = [entry('a'), entry('b'), entry('c'), entry('d')]
    const original = [...queue]
    reinsertMissed(queue, 0, entry('a'))
    expect(queue).toEqual(original)
  })

  it('displaces whatever entry currently occupies the target slot', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // offset = 2
    const queue = [entry('a'), entry('b'), entry('c'), entry('d')]
    const missed = entry('a')
    const next = reinsertMissed(queue, 0, missed)
    expect(next.filter(e => e === queue[2])).toHaveLength(0)
  })

  it('reaches offset 4 at the top of the random range in an unclamped queue (pins the multiplier, not just the clamped result)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const queue = [entry('a'), entry('b'), entry('c'), entry('d'), entry('e'), entry('f')]
    const missed = entry('a')
    const next = reinsertMissed(queue, 0, missed)
    expect(next[4]).toBe(missed)
  })
})
