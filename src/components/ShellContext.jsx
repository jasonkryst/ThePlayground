import { createContext, useContext, useEffect } from 'react'

export const INACTIVE_GAME_STATUS = { streak: 0, sessionActive: false }

// Default is a no-op so games render fine outside the shell (unit tests, Storybook).
export const ShellContext = createContext({ setGameStatus: () => {} })

// A game publishes its live status to the shell. Cleared on unmount so a
// left game never leaves stale status behind (exit guard is fail-open).
export function useShellGameStatus({ streak, sessionActive }) {
  const { setGameStatus } = useContext(ShellContext)

  useEffect(() => {
    setGameStatus({ streak, sessionActive })
  }, [setGameStatus, streak, sessionActive])

  useEffect(() => () => setGameStatus(INACTIVE_GAME_STATUS), [setGameStatus])
}
