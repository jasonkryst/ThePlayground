import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import ColorMatchGame from '../index'
import { ShellContext } from '../../../components/ShellContext'

vi.mock('../../../lib/confetti', () => ({ fireConfetti: vi.fn() }))

vi.mock('../../../hooks/useSoundPlayer', () => ({
  default: () => ({ play: vi.fn(), stop: vi.fn() }),
}))

let mockSettings = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerMode: 'countUp',
  introDismissed: { 'color-match': true },
}
const mockUpdateSetting = vi.fn()

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings, loaded: true, updateSetting: mockUpdateSetting }),
}))

vi.mock('../../../hooks/useScores', () => ({
  default: () => ({ addScore: vi.fn().mockResolvedValue(undefined), scores: [], getBestScore: () => 0, getScoresByGame: () => [], getAllScores: () => [] }),
}))

vi.mock('../../../hooks/useBestStreak', () => ({
  default: () => ({ bestStreak: 0, recordStreak: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('../../../hooks/usePersonalBest', () => ({
  default: () => ({
    personalBest: null,
    recordSession: vi.fn().mockResolvedValue({
      accuracy: { isNewRecord: false, value: 0, previous: null },
      speed: { isNewRecord: false, value: null, previous: null },
    }),
  }),
}))

vi.mock('../../../hooks/useBadges', () => ({
  default: () => ({ badgeData: { awards: {}, lifetimeQuestions: {} }, awardSession: vi.fn().mockResolvedValue([]) }),
}))

const onGameEnd = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockSettings = {
    numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerMode: 'countUp',
    introDismissed: { 'color-match': true },
  }
})

describe('ColorMatchGame', () => {
  it('renders a question with a swatch and answer buttons', async () => {
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByText(/which one is this color/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(2)
  })

  it('clicking correct answer adds correct class', async () => {
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    const buttons = screen.getAllByRole('button').filter(b => b.dataset.colorId)
    const correctId = screen.getByTestId('correct-color-id').textContent
    const correctBtn = buttons.find(b => b.dataset.colorId === correctId)
    await act(async () => { await userEvent.click(correctBtn) })
    expect(correctBtn.classList.contains('correct')).toBe(true)
  })

  it('clicking wrong answer highlights the correct one', async () => {
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    const buttons = screen.getAllByRole('button').filter(b => b.dataset.colorId)
    const correctId = screen.getByTestId('correct-color-id').textContent
    const wrongBtn = buttons.find(b => b.dataset.colorId !== correctId)
    const correctBtn = buttons.find(b => b.dataset.colorId === correctId)
    await act(async () => { await userEvent.click(wrongBtn) })
    expect(wrongBtn.classList.contains('wrong')).toBe(true)
    expect(correctBtn.classList.contains('highlight-correct')).toBe(true)
  })

  it('shows results screen after all questions in immediate mode', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.colorId)
      const correctId = screen.getByTestId('correct-color-id').textContent
      const correctBtn = buttons.find(b => b.dataset.colorId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
  })

  it('Home button calls onGameEnd', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.colorId)
      const correctId = screen.getByTestId('correct-color-id').textContent
      const correctBtn = buttons.find(b => b.dataset.colorId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    await act(async () => { await userEvent.click(screen.getByRole('button', { name: /home/i })) })
    expect(onGameEnd).toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    let container
    await act(async () => { container = render(<ColorMatchGame onGameEnd={onGameEnd} />).container })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('reports the streak to the shell after 2 correct answers in a row', async () => {
    vi.useFakeTimers()
    const setGameStatus = vi.fn()
    await act(async () => {
      render(
        <ShellContext.Provider value={{ setGameStatus }}>
          <ColorMatchGame onGameEnd={onGameEnd} />
        </ShellContext.Provider>
      )
    })

    for (let i = 0; i < 2; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.colorId)
      const correctId = screen.getByTestId('correct-color-id').textContent
      const correctBtn = buttons.find(b => b.dataset.colorId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(setGameStatus).toHaveBeenLastCalledWith({ streak: 2, sessionActive: true })
  })

  it('shows missed colors in the results screen when an answer is wrong', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.colorId)
      const correctId = screen.getByTestId('correct-color-id').textContent
      const wrongBtn = buttons.find(b => b.dataset.colorId !== correctId)
      act(() => { fireEvent.click(wrongBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(screen.getByText(/let's practice/i)).toBeInTheDocument()
  })

  it('shows the timer when timerMode is not "off"', async () => {
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByLabelText(/elapsed time/i)).toBeInTheDocument()
  })

  it('hides the timer when timerMode is "off"', async () => {
    mockSettings = { ...mockSettings, timerMode: 'off' }
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByLabelText(/elapsed time/i)).not.toBeInTheDocument()
  })

  it('allows a retry when maxTries permits it, without locking the question', async () => {
    mockSettings = { ...mockSettings, feedbackMode: 'parent-tap', maxTries: 2, numChoices: 3 }
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })

    const buttons = screen.getAllByRole('button').filter(b => b.dataset.colorId)
    const correctId = screen.getByTestId('correct-color-id').textContent
    const wrongBtn = buttons.find(b => b.dataset.colorId !== correctId)
    await act(async () => { await userEvent.click(wrongBtn) })

    expect(wrongBtn).toHaveAttribute('aria-disabled', 'true')
    const correctBtn = buttons.find(b => b.dataset.colorId === correctId)
    expect(correctBtn).toHaveAttribute('aria-disabled', 'false')
  })

  it('keeps keyboard focus on the tapped choice through the lock transition (AU-3)', async () => {
    mockSettings = { ...mockSettings, feedbackMode: 'parent-tap', numChoices: 3 }
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })

    const buttons = screen.getAllByRole('button').filter(b => b.dataset.colorId)
    const correctId = screen.getByTestId('correct-color-id').textContent
    const correctBtn = buttons.find(b => b.dataset.colorId === correctId)
    correctBtn.focus()
    await act(async () => { await userEvent.click(correctBtn) })

    expect(correctBtn).toHaveAttribute('aria-disabled', 'true')
    expect(correctBtn).toHaveFocus()
  })

  it('does not render a Next button while the countdown timeout message is showing in parent-tap mode (regression guard against double-advance)', async () => {
    vi.useFakeTimers()
    mockSettings = { ...mockSettings, feedbackMode: 'parent-tap', timerMode: 'countdown', timeLimitSeconds: 5 }
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })

    act(() => { vi.advanceTimersByTime(5001) })

    expect(screen.getByText(/time's up/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()

    vi.useRealTimers()
  })

  it('shows the difficulty-offer banner after a perfect session when enabled', async () => {
    mockSettings = { ...mockSettings, feedbackMode: 'parent-tap', difficultyAutoProgressionEnabled: true, questionsPerSession: 3, numChoices: 2 }
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })

    vi.useFakeTimers()
    try {
      for (let i = 0; i < 3; i++) {
        const buttons = screen.getAllByRole('button').filter(b => b.dataset.colorId)
        const correctId = screen.getByTestId('correct-color-id').textContent
        const correctBtn = buttons.find(b => b.dataset.colorId === correctId)
        act(() => { fireEvent.click(correctBtn) })
        act(() => { fireEvent.click(screen.getByRole('button', { name: /next/i })) })
        await act(async () => {})
      }

      // Flush remaining microtasks from finishGame()'s async chain
      await act(async () => {})
    } finally {
      vi.useRealTimers()
    }

    expect(screen.getByText(/perfect session/i)).toBeInTheDocument()
  })
})

describe('ColorMatchGame — how-to-play intro', () => {
  it('shows the intro screen before the first question when not dismissed', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByTestId('game-intro-start')).toBeInTheDocument()
    expect(screen.queryByText(/which one is this color/i)).not.toBeInTheDocument()
  })

  it('starts the session after "Let\'s Play!" is clicked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(screen.getByText(/which one is this color/i)).toBeInTheDocument()
  })

  it('persists introDismissed for this game when "don\'t show again" is checked before starting', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-dont-show-again')) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    // Flush any state update the transition into gameplay schedules on a
    // later microtask than the click's own act() wrapper already awaited
    // (otherwise it lands outside any act() scope and React warns).
    await act(async () => {})
    expect(mockUpdateSetting).toHaveBeenCalledWith('introDismissed', { 'color-match': true })
  })

  it('does not persist a setting when "don\'t show again" is left unchecked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(mockUpdateSetting).not.toHaveBeenCalled()
  })

  it('does not show the intro when already dismissed for this game', async () => {
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByTestId('game-intro-start')).not.toBeInTheDocument()
    expect(screen.getByText(/which one is this color/i)).toBeInTheDocument()
  })
})
