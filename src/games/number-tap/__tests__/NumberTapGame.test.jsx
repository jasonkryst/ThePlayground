import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import NumberTapGame from '../index'
import { ShellContext } from '../../../components/ShellContext'

vi.mock('../../../lib/confetti', () => ({ fireConfetti: vi.fn() }))

let mockSettings = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, adaptiveItemSelectionEnabled: false,
  timerMode: 'countUp', timeLimitSeconds: 10, animationsEnabled: true, soundEffectsEnabled: false,
  introDismissed: { 'number-tap': true },
}
const mockUpdateSetting = vi.fn()
let mockLoaded = true

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings, loaded: mockLoaded, updateSetting: mockUpdateSetting }),
}))
vi.mock('../../../hooks/useScores', () => ({
  default: () => ({ addScore: vi.fn().mockResolvedValue(undefined) }),
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
vi.mock('../../../hooks/useItemStats', () => ({
  default: () => ({ itemStats: {}, recordMisses: vi.fn().mockResolvedValue(undefined) }),
}))

const { mockGetSessionResume } = vi.hoisted(() => ({
  mockGetSessionResume: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../../storage/index', () => ({
  default: {
    getSessionResume: mockGetSessionResume,
    saveSessionResume: vi.fn(),
    clearSessionResume: vi.fn(),
  },
}))

const onGameEnd = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockLoaded = true
  mockGetSessionResume.mockResolvedValue(null)
  mockSettings = {
    numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, adaptiveItemSelectionEnabled: false,
    timerMode: 'countUp', timeLimitSeconds: 10, animationsEnabled: true, soundEffectsEnabled: false,
    introDismissed: { 'number-tap': true },
  }
})

const objectButtons = () => screen.getAllByRole('button').filter(b => b.dataset.objectId)
const doneButton = () => screen.getByTestId('number-tap-done')
const targetCount = () => Number(screen.getByTestId('correct-number-id').dataset.value)

async function tapExactly(n) {
  const buttons = objectButtons().slice(0, n)
  for (const btn of buttons) {
    await act(async () => { await userEvent.click(btn) })
  }
}

describe('NumberTapGame', () => {
  it('renders the number prompt and a pool of tappable objects larger than the target', async () => {
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    expect(screen.getByText(/tap \d!/i)).toBeInTheDocument()
    expect(objectButtons().length).toBeGreaterThan(targetCount())
  })

  it('labels each object with an accessible name for screen readers', async () => {
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    for (const btn of objectButtons()) {
      expect(btn.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it('tapping an object toggles aria-pressed, tapping again untoggles it', async () => {
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    const [first] = objectButtons()
    expect(first.getAttribute('aria-pressed')).toBe('false')
    await act(async () => { await userEvent.click(first) })
    expect(first.getAttribute('aria-pressed')).toBe('true')
    await act(async () => { await userEvent.click(first) })
    expect(first.getAttribute('aria-pressed')).toBe('false')
  })

  // Positive: exact count + Done scores correctly
  it('tapping exactly the target count and pressing Done announces correct and locks the board', async () => {
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    const target = targetCount()
    await tapExactly(target)
    await act(async () => { await userEvent.click(doneButton()) })
    expect(screen.getByTestId('quiz-live-region')).toHaveTextContent(/correct/i)
    for (const btn of objectButtons()) {
      expect(btn.getAttribute('aria-disabled')).toBe('true')
    }
  })

  // Positive: full session with correct answers reaches results
  it('shows results after all questions answered correctly', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const target = targetCount()
      const buttons = objectButtons().slice(0, target)
      for (const btn of buttons) act(() => { fireEvent.click(btn) })
      act(() => { fireEvent.click(doneButton()) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
  })

  // Positive: retry path
  it('a wrong count with retries remaining clears the selection and allows a correct retry', async () => {
    mockSettings = { ...mockSettings, maxTries: 2 }
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    const target = targetCount()

    // Tap one too many, then confirm -- wrong, but a retry remains.
    await tapExactly(target + 1)
    await act(async () => { await userEvent.click(doneButton()) })

    // Selection must have cleared for the retry.
    for (const btn of objectButtons()) {
      expect(btn.getAttribute('aria-pressed')).toBe('false')
    }

    await tapExactly(target)
    await act(async () => { await userEvent.click(doneButton()) })
    expect(screen.getByTestId('quiz-live-region')).toHaveTextContent(/correct/i)
  })

  // Negative: wrong count on the final try locks the question as missed
  it('a wrong count on the final allowed try locks the question and shows it as missed', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const target = targetCount()
      const buttons = objectButtons().slice(0, target + 1) // always one too many
      for (const btn of buttons) act(() => { fireEvent.click(btn) })
      act(() => { fireEvent.click(doneButton()) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(screen.getByText(/let's practice/i)).toBeInTheDocument()
  })

  // Negative: timeout locks the question without any taps
  it('a countdown timeout locks the question as missed without any taps', async () => {
    mockSettings = { ...mockSettings, timerMode: 'countdown', timeLimitSeconds: 5, feedbackMode: 'immediate' }
    vi.useFakeTimers()
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    act(() => { vi.advanceTimersByTime(5000) })
    await act(async () => {})
    expect(screen.getByText(/time/i)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('does not tap or confirm while locked', async () => {
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    const target = targetCount()
    await tapExactly(target)
    await act(async () => { await userEvent.click(doneButton()) })
    // Question is now locked (correct, immediate feedback schedules advance) --
    // further taps on the (about-to-change) board must not throw or double-score.
    const [first] = objectButtons()
    await act(async () => { await userEvent.click(first) })
    expect(screen.getByTestId('quiz-live-region')).toHaveTextContent(/correct/i)
  })

  it('hides the timer when timerMode is "off"', async () => {
    mockSettings = { ...mockSettings, timerMode: 'off' }
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByLabelText(/elapsed time/i)).not.toBeInTheDocument()
  })

  it('Home button on the results screen calls onGameEnd', async () => {
    mockSettings = { ...mockSettings, questionsPerSession: 1 }
    vi.useFakeTimers()
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    const target = targetCount()
    const buttons = objectButtons().slice(0, target)
    for (const btn of buttons) act(() => { fireEvent.click(btn) })
    act(() => { fireEvent.click(doneButton()) })
    act(() => { vi.advanceTimersByTime(1600) })
    await act(async () => {})
    vi.useRealTimers()
    await act(async () => { await userEvent.click(screen.getByRole('button', { name: /home/i })) })
    expect(onGameEnd).toHaveBeenCalled()
  })

  it('reports the streak to the shell after 2 correct answers', async () => {
    vi.useFakeTimers()
    const setGameStatus = vi.fn()
    await act(async () => {
      render(
        <ShellContext.Provider value={{ setGameStatus }}>
          <NumberTapGame onGameEnd={onGameEnd} />
        </ShellContext.Provider>
      )
    })
    for (let i = 0; i < 2; i++) {
      const target = targetCount()
      const buttons = objectButtons().slice(0, target)
      for (const btn of buttons) act(() => { fireEvent.click(btn) })
      act(() => { fireEvent.click(doneButton()) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(setGameStatus).toHaveBeenLastCalledWith({ streak: 2, sessionActive: true })
  })

  it('has no accessibility violations', async () => {
    let container
    await act(async () => { container = render(<NumberTapGame onGameEnd={onGameEnd} />).container })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('does not offer a difficulty bump on the results screen', async () => {
    mockSettings = { ...mockSettings, questionsPerSession: 1, difficultyAutoProgressionEnabled: true }
    vi.useFakeTimers()
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    const target = targetCount()
    const buttons = objectButtons().slice(0, target)
    for (const btn of buttons) act(() => { fireEvent.click(btn) })
    act(() => { fireEvent.click(doneButton()) })
    act(() => { vi.advanceTimersByTime(1600) })
    await act(async () => {})
    vi.useRealTimers()
    expect(screen.queryByText(/harder/i)).not.toBeInTheDocument()
    expect(mockUpdateSetting).not.toHaveBeenCalledWith('numChoices', expect.anything())
  })
})

describe('NumberTapGame — how-to-play intro', () => {
  it('shows the intro before the first question when not dismissed', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    expect(screen.getByTestId('game-intro-start')).toBeInTheDocument()
    expect(screen.queryByText(/tap \d!/i)).not.toBeInTheDocument()
  })

  it('starts the session after "Let\'s Play!" is clicked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(screen.getByText(/tap \d!/i)).toBeInTheDocument()
  })
})

describe('NumberTapGame — session resume', () => {
  it('shows the resume prompt when a valid snapshot exists', async () => {
    const numbers = (await import('../data/numbers')).default
    const savedQueue = [
      { correct: numbers[0], choices: [numbers[0]] },
      { correct: numbers[1], choices: [numbers[1]] },
    ]
    mockGetSessionResume.mockResolvedValueOnce({
      gameId: 'number-tap', queue: savedQueue, index: 0, score: 0, streak: 0,
      missed: [], timings: [], peakStreak: 0, savedAt: Date.now(),
    })
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    await act(async () => {})
    expect(screen.getByTestId('resume-prompt-resume')).toBeInTheDocument()
  })
})
