import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ParentalLockGate from '../ParentalLockGate'

let mockParentalLock = { enabled: true, pin: '' }

vi.mock('../../hooks/useSettings', () => ({
  default: () => ({
    settings: { parentalLock: mockParentalLock },
    loaded: true,
    updateSetting: vi.fn(),
    resetSettings: vi.fn(),
  }),
}))

const { mockGetChallenge, mockVerifyUnlock } = vi.hoisted(() => ({
  mockGetChallenge: vi.fn(),
  mockVerifyUnlock: vi.fn(),
}))

vi.mock('../../lib/parentalLock', () => ({
  getChallenge: mockGetChallenge,
  verifyUnlock: mockVerifyUnlock,
}))

beforeEach(() => {
  sessionStorage.clear()
  mockParentalLock = { enabled: true, pin: '' }
  mockGetChallenge.mockReset()
  mockVerifyUnlock.mockReset()
  let call = 0
  mockGetChallenge.mockImplementation(() => {
    call += 1
    return { mode: 'math', a: call, b: call, answer: call * 2 }
  })
})

function renderGate() {
  return render(
    <ParentalLockGate>
      <div data-testid="protected-content">Secret</div>
    </ParentalLockGate>
  )
}

describe('ParentalLockGate', () => {
  it('renders children immediately when the lock is disabled (positive passthrough)', () => {
    mockParentalLock = { enabled: false, pin: '' }
    renderGate()
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })

  it('shows the challenge and withholds children when the lock is enabled and not yet unlocked (negative)', () => {
    renderGate()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Parents Only' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('unlocks and reveals children on a correct answer', () => {
    mockVerifyUnlock.mockReturnValue(true)
    renderGate()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(sessionStorage.getItem('pg-parental-lock-unlocked')).toBe('1')
  })

  it('stays locked, shows an error, clears the input, and rolls a new challenge on a wrong answer (negative)', () => {
    mockVerifyUnlock.mockReturnValue(false)
    renderGate()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '99' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent("That's not it")
    expect(screen.getByRole('textbox').value).toBe('')
    expect(mockGetChallenge).toHaveBeenCalledTimes(2)
  })

  it('shows the PIN prompt instead of a math prompt when the challenge is pin mode', () => {
    mockGetChallenge.mockReturnValue({ mode: 'pin', pin: '4242' })
    renderGate()
    expect(screen.getByText('Enter the PIN to continue')).toBeInTheDocument()
  })

  it('reveals children without showing the challenge when the session is already unlocked (positive)', () => {
    sessionStorage.setItem('pg-parental-lock-unlocked', '1')
    renderGate()
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Parents Only' })).not.toBeInTheDocument()
  })

  it('recomputes the challenge when parentalLock settings change after mount, e.g. async settings load resolving with a PIN (regression coverage for the async-recompute fix)', () => {
    const { rerender } = renderGate()
    expect(screen.getByRole('heading', { name: 'Parents Only' })).toBeInTheDocument()

    mockGetChallenge.mockReturnValue({ mode: 'pin', pin: '4242' })
    mockParentalLock = { enabled: true, pin: '4242' }
    rerender(
      <ParentalLockGate>
        <div data-testid="protected-content">Secret</div>
      </ParentalLockGate>
    )

    expect(screen.getByText('Enter the PIN to continue')).toBeInTheDocument()
  })
})
