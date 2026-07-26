import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import useParentalLockSession from '../useParentalLockSession'

beforeEach(() => {
  sessionStorage.clear()
})

describe('useParentalLockSession', () => {
  it('starts locked when no session flag is present (negative)', () => {
    const { result } = renderHook(() => useParentalLockSession())
    expect(result.current.unlocked).toBe(false)
  })

  it('unlock() flips unlocked to true and persists the session flag', () => {
    const { result } = renderHook(() => useParentalLockSession())
    act(() => result.current.unlock())
    expect(result.current.unlocked).toBe(true)
    expect(sessionStorage.getItem('pg-parental-lock-unlocked')).toBe('1')
  })

  it('a fresh hook instance reads a pre-existing session flag as already unlocked (positive persistence)', () => {
    sessionStorage.setItem('pg-parental-lock-unlocked', '1')
    const { result } = renderHook(() => useParentalLockSession())
    expect(result.current.unlocked).toBe(true)
  })

  it('lock() clears the flag and flips unlocked back to false (negative re-arm)', () => {
    const { result } = renderHook(() => useParentalLockSession())
    act(() => result.current.unlock())
    act(() => result.current.lock())
    expect(result.current.unlocked).toBe(false)
    expect(sessionStorage.getItem('pg-parental-lock-unlocked')).toBeNull()
  })
})
