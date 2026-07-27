import { useState, useCallback } from 'react'

const SESSION_KEY = 'pg-parental-lock-unlocked'

// Per-tab-session unlock for ParentalLockGate (issue #127): a sessionStorage
// flag, not localStorage, so closing the tab/browser re-locks. This hook is
// the seam a future login system would replace internals of (a real
// session/token check instead of a flag) without any consumer changing —
// see docs/superpowers/specs/2026-07-26-parental-lock-design.md.
export default function useParentalLockSession() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')

  const unlock = useCallback(() => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setUnlocked(true)
  }, [])

  const lock = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY)
    setUnlocked(false)
  }, [])

  return { unlocked, unlock, lock }
}
