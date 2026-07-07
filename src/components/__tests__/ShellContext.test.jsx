import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ShellContext, useShellGameStatus, INACTIVE_GAME_STATUS } from '../ShellContext'

function Probe({ streak, sessionActive }) {
  useShellGameStatus({ streak, sessionActive })
  return null
}

function renderWithSpy(ui) {
  const setGameStatus = vi.fn()
  const utils = render(
    <ShellContext.Provider value={{ setGameStatus }}>{ui}</ShellContext.Provider>
  )
  return { setGameStatus, ...utils }
}

describe('useShellGameStatus', () => {
  it('publishes the given status to the shell', () => {
    const { setGameStatus } = renderWithSpy(<Probe streak={3} sessionActive={true} />)
    expect(setGameStatus).toHaveBeenLastCalledWith({ streak: 3, sessionActive: true })
  })

  it('re-publishes when the status changes', () => {
    const setGameStatus = vi.fn()
    const { rerender } = render(
      <ShellContext.Provider value={{ setGameStatus }}>
        <Probe streak={0} sessionActive={true} />
      </ShellContext.Provider>
    )
    rerender(
      <ShellContext.Provider value={{ setGameStatus }}>
        <Probe streak={2} sessionActive={true} />
      </ShellContext.Provider>
    )
    expect(setGameStatus).toHaveBeenLastCalledWith({ streak: 2, sessionActive: true })
  })

  it('resets to inactive on unmount so the shell never keeps stale game status', () => {
    const { setGameStatus, unmount } = renderWithSpy(<Probe streak={5} sessionActive={true} />)
    unmount()
    expect(setGameStatus).toHaveBeenLastCalledWith(INACTIVE_GAME_STATUS)
  })

  it('is a safe no-op without a provider (default context value)', () => {
    expect(() => render(<Probe streak={1} sessionActive={true} />)).not.toThrow()
  })
})
