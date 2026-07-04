import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import AnimalSoundsGame from '../index'

window.HTMLMediaElement.prototype.play  = vi.fn().mockResolvedValue(undefined)
window.HTMLMediaElement.prototype.pause = vi.fn()
window.HTMLMediaElement.prototype.load  = vi.fn()

vi.mock('../../../lib/confetti', () => ({ fireConfetti: vi.fn() }))

let mockSettings = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerMode: 'countUp',
  introDismissed: { 'animal-sounds': true },
}
const mockUpdateSetting = vi.fn()
let mockLoaded = true

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings, loaded: mockLoaded, updateSetting: mockUpdateSetting }),
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
  mockLoaded = true
  mockSettings = {
    numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerMode: 'countUp',
    introDismissed: { 'animal-sounds': true },
  }
})

describe('AnimalSoundsGame', () => {
  it('renders a question with answer buttons', async () => {
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    expect(screen.getByText(/what animal/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(2)
  })

  it('shows replay button', async () => {
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    expect(screen.getByLabelText(/replay/i)).toBeInTheDocument()
  })

  it('clicking correct answer adds correct class', async () => {
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    const buttons = screen.getAllByRole('button').filter(b => b.dataset.animalId)
    const correctId = screen.getByTestId('correct-animal-id').textContent
    const correctBtn = buttons.find(b => b.dataset.animalId === correctId)
    await act(async () => { await userEvent.click(correctBtn) })
    expect(correctBtn.classList.contains('correct')).toBe(true)
  })

  it('shows results screen after all questions in immediate mode', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.animalId)
      const correctId = screen.getByTestId('correct-animal-id').textContent
      const correctBtn = buttons.find(b => b.dataset.animalId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
  })

  it('Home button calls onGameEnd', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.animalId)
      const correctId = screen.getByTestId('correct-animal-id').textContent
      const correctBtn = buttons.find(b => b.dataset.animalId === correctId)
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
    await act(async () => { container = render(<AnimalSoundsGame onGameEnd={onGameEnd} />).container })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows the streak badge after 2 correct answers in a row', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 2; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.animalId)
      const correctId = screen.getByTestId('correct-animal-id').textContent
      const correctBtn = buttons.find(b => b.dataset.animalId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(screen.getByText(/2 in a row/i)).toBeInTheDocument()
  })

  it('shows missed animals in the results screen when an answer is wrong', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.animalId)
      const correctId = screen.getByTestId('correct-animal-id').textContent
      const wrongBtn = buttons.find(b => b.dataset.animalId !== correctId)
      act(() => { fireEvent.click(wrongBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(screen.getByText(/let's practice/i)).toBeInTheDocument()
  })

  it('shows the timer when timerMode is not "off"', async () => {
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    expect(screen.getByLabelText(/elapsed time/i)).toBeInTheDocument()
  })

  it('hides the timer when timerMode is "off"', async () => {
    mockSettings = { ...mockSettings, timerMode: 'off' }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByLabelText(/elapsed time/i)).not.toBeInTheDocument()
  })

  it('allows a retry when maxTries permits it, without locking the question', async () => {
    mockSettings = { ...mockSettings, feedbackMode: 'parent-tap', maxTries: 2, numChoices: 3 }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    const buttons = screen.getAllByRole('button').filter(b => b.dataset.animalId)
    const correctId = screen.getByTestId('correct-animal-id').textContent
    const wrongBtn = buttons.find(b => b.dataset.animalId !== correctId)
    await act(async () => { await userEvent.click(wrongBtn) })

    expect(wrongBtn).toBeDisabled()
    const correctBtn = buttons.find(b => b.dataset.animalId === correctId)
    expect(correctBtn).not.toBeDisabled()
  })

  it('does not render a Next button while the countdown timeout message is showing in parent-tap mode (regression guard against double-advance)', async () => {
    vi.useFakeTimers()
    mockSettings = { ...mockSettings, feedbackMode: 'parent-tap', timerMode: 'countdown', timeLimitSeconds: 5 }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    act(() => { vi.advanceTimersByTime(5001) })

    expect(screen.getByText(/time's up/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()

    vi.useRealTimers()
  })

  it('shows the difficulty-offer banner after a perfect session when enabled', async () => {
    mockSettings = { ...mockSettings, feedbackMode: 'parent-tap', difficultyAutoProgressionEnabled: true, questionsPerSession: 3, numChoices: 2 }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    vi.useFakeTimers()
    try {
      for (let i = 0; i < 3; i++) {
        const buttons = screen.getAllByRole('button').filter(b => b.dataset.animalId)
        const correctId = screen.getByTestId('correct-animal-id').textContent
        const correctBtn = buttons.find(b => b.dataset.animalId === correctId)
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

describe('AnimalSoundsGame — how-to-play intro', () => {
  it('shows the intro screen before the first question when not dismissed', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    expect(screen.getByTestId('game-intro-start')).toBeInTheDocument()
    expect(screen.queryByText(/what animal/i)).not.toBeInTheDocument()
  })

  it('starts the session after "Let\'s Play!" is clicked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(screen.getByText(/what animal/i)).toBeInTheDocument()
  })

  it('persists introDismissed for this game when "don\'t show again" is checked before starting', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-dont-show-again')) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(mockUpdateSetting).toHaveBeenCalledWith('introDismissed', { 'animal-sounds': true })
  })

  it('does not persist a setting when "don\'t show again" is left unchecked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(mockUpdateSetting).not.toHaveBeenCalled()
  })

  it('does not show the intro when already dismissed for this game', async () => {
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByTestId('game-intro-start')).not.toBeInTheDocument()
    expect(screen.getByText(/what animal/i)).toBeInTheDocument()
  })

  it('does not autoplay a sound while settings/intro have not finished resolving (no audio leak)', async () => {
    // Regression test for the render-N race: useGameSession's queue-build
    // effect runs independent of `loaded`, so `current` (and thus the
    // sound-autoplay effect's other guard condition) can be truthy before
    // useSettings() has resolved and before the intro decision (showIntro)
    // has settled. Without the introResolved gate, the autoplay effect's
    // guard `!current || showIntro` would be `false || false` here and
    // fire playSound() out loud even though the intro screen (or a loading
    // state) is what should be on display — before "Let's Play!" is ever
    // tapped.
    mockLoaded = false
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
  })
})
