// src/utils/__tests__/idealColumns.test.js
import { describe, it, expect } from 'vitest'
import idealColumns from '../idealColumns'

describe('idealColumns', () => {
  it('returns 3 for 6 tiles (3×2 — the 3-pairs memory board)', () => {
    expect(idealColumns(6)).toBe(3)
  })

  it('returns 4 for 8 tiles (4×2 — the 4-pairs memory board)', () => {
    expect(idealColumns(8)).toBe(4)
  })

  it('returns 5 for 10 tiles (5×2 — the default 5-pairs memory board)', () => {
    expect(idealColumns(10)).toBe(5)
  })

  it('returns 4 for 12 tiles (4×3 — the 6-pairs memory board)', () => {
    expect(idealColumns(12)).toBe(4)
  })

  it('returns 2 for 2 tiles (2×1)', () => {
    expect(idealColumns(2)).toBe(2)
  })

  it('returns 1 for a single tile', () => {
    expect(idealColumns(1)).toBe(1)
  })

  it('returns 1 for zero tiles, never dividing by zero', () => {
    expect(idealColumns(0)).toBe(1)
  })

  it('terminates and returns a divisor for a prime count instead of looping forever', () => {
    expect(idealColumns(7)).toBe(7)
  })
})
