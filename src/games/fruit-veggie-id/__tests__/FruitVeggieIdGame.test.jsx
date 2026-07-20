import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'jest-axe'
import FruitVeggieIdGame from '../index'
import { ShellContext } from '../../../components/ShellContext'
import i18n from '../../../i18n'

vi.mock('../../../lib/confetti', () => ({ fireConfetti: vi.fn() }))

// Mock the speech hook (per the "mock the hook, not the browser primitive" rule).
let mockSupported = true
const mockSpeak = vi.fn()
const mockCancel = vi.fn()
vi.mock('../../../hooks/useSpeech', () => ({
  default: () => ({ speak: mockSpeak, cancel: mockCancel, supported: mockSupported }),
}))

let mockSettings = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerMode: 'countUp',
  introDismissed: { 'fruit-veggie-id': true },
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
  mockSupported = true
  mockSettings = {
    numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerMode: 'countUp',
    introDismissed: { 'fruit-veggie-id': true },
  }
})

const foodButtons = () => screen.getAllByRole('button').filter(b => b.dataset.foodId)

describe('FruitVeggieIdGame', () => {
  it('renders the spoken-name prompt with picture choices', async () => {
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    expect(screen.getByText(/which one did you hear/i)).toBeInTheDocument()
    expect(foodButtons().length).toBeGreaterThanOrEqual(2)
  })

  it('speaks the name automatically when a question is shown', async () => {
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    expect(mockSpeak).toHaveBeenCalled()
  })

  it('shows a replay button that re-speaks the name on click', async () => {
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    const replay = screen.getByLabelText(/say it again/i)
    mockSpeak.mockClear()
    await act(async () => { await userEvent.click(replay) })
    expect(mockSpeak).toHaveBeenCalledTimes(1)
  })

  it('labels each picture choice with its name for screen readers', async () => {
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    for (const btn of foodButtons()) {
      expect(btn.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it('clicking the correct picture adds the correct class', async () => {
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    const correctId = screen.getByTestId('correct-food-id').textContent
    const correctBtn = foodButtons().find(b => b.dataset.foodId === correctId)
    await act(async () => { await userEvent.click(correctBtn) })
    expect(correctBtn.classList.contains('correct')).toBe(true)
  })

  it('shows results after all questions in immediate mode', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const correctId = screen.getByTestId('correct-food-id').textContent
      const correctBtn = foodButtons().find(b => b.dataset.foodId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
  })

  it('Home button calls onGameEnd', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const correctId = screen.getByTestId('correct-food-id').textContent
      const correctBtn = foodButtons().find(b => b.dataset.foodId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
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
          <FruitVeggieIdGame onGameEnd={onGameEnd} />
        </ShellContext.Provider>
      )
    })
    for (let i = 0; i < 2; i++) {
      const correctId = screen.getByTestId('correct-food-id').textContent
      const correctBtn = foodButtons().find(b => b.dataset.foodId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(setGameStatus).toHaveBeenLastCalledWith({ streak: 2, sessionActive: true })
  })

  it('cancels speech when advancing to the next question', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    const correctId = screen.getByTestId('correct-food-id').textContent
    const correctBtn = foodButtons().find(b => b.dataset.foodId === correctId)
    act(() => { fireEvent.click(correctBtn) })
    act(() => { vi.advanceTimersByTime(1600) })
    await act(async () => {})
    vi.useRealTimers()
    expect(mockCancel).toHaveBeenCalled()
  })

  it('cancels speech when the session ends', async () => {
    mockSettings = { ...mockSettings, questionsPerSession: 1 }
    vi.useFakeTimers()
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    const correctId = screen.getByTestId('correct-food-id').textContent
    const correctBtn = foodButtons().find(b => b.dataset.foodId === correctId)
    act(() => { fireEvent.click(correctBtn) })
    act(() => { vi.advanceTimersByTime(1600) })
    await act(async () => {})
    vi.useRealTimers()
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
    expect(mockCancel).toHaveBeenCalled()
  })

  it('shows missed foods in the results when an answer is wrong', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const correctId = screen.getByTestId('correct-food-id').textContent
      const wrongBtn = foodButtons().find(b => b.dataset.foodId !== correctId)
      act(() => { fireEvent.click(wrongBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(screen.getByText(/let's practice/i)).toBeInTheDocument()
  })

  it('hides the timer when timerMode is "off"', async () => {
    mockSettings = { ...mockSettings, timerMode: 'off' }
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByLabelText(/elapsed time/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    let container
    await act(async () => { container = render(<FruitVeggieIdGame onGameEnd={onGameEnd} />).container })
    expect(await axe(container)).toHaveNoViolations()
  })

  // Negative: audio-leak guard
  it('does not speak while settings/intro have not resolved', async () => {
    mockLoaded = false
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    expect(mockSpeak).not.toHaveBeenCalled()
  })

  // Negative: no-TTS fallback
  describe('when speech synthesis is unavailable', () => {
    beforeEach(() => { mockSupported = false })

    it('shows a fallback prompt naming the target and hides the replay button', async () => {
      await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
      expect(screen.getByText(/find the/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/say it again/i)).not.toBeInTheDocument()
      expect(mockSpeak).not.toHaveBeenCalled()
    })
  })
})

describe('FruitVeggieIdGame — how-to-play intro', () => {
  it('shows the intro before the first question when not dismissed', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    expect(screen.getByTestId('game-intro-start')).toBeInTheDocument()
    expect(screen.queryByText(/which one did you hear/i)).not.toBeInTheDocument()
  })

  it('starts the session after "Let\'s Play!" is clicked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(screen.getByText(/which one did you hear/i)).toBeInTheDocument()
  })

  it('persists introDismissed for this game when "don\'t show again" is checked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-dont-show-again')) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(mockUpdateSetting).toHaveBeenCalledWith('introDismissed', { 'fruit-veggie-id': true })
  })
})

describe('FruitVeggieIdGame — Spanish locale', () => {
  // changeLanguage triggers a state update in react-i18next's internal
  // subscription on any mounted useTranslation() consumer; wrap in act()
  // so the afterEach reset (which fires while the tree from this test's
  // render is still mounted) doesn't warn outside React's test render cycle.
  beforeEach(async () => { await act(async () => { await i18n.changeLanguage('es') }) })
  afterEach(async () => { await act(async () => { await i18n.changeLanguage('en') }) })

  it('replay button speaks the Spanish item name under the es locale', async () => {
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    mockSpeak.mockClear()
    const replay = screen.getByLabelText(/decirlo de nuevo/i)
    await act(async () => { await userEvent.click(replay) })
    const correctId = screen.getByTestId('correct-food-id').textContent
    const spanishNameById = {
      apple: 'Manzana', banana: 'Banana', orange: 'Naranja', strawberry: 'Fresa',
      grapes: 'Uvas', watermelon: 'Sandía', carrot: 'Zanahoria', tomato: 'Tomate',
      corn: 'Maíz', broccoli: 'Brócoli', potato: 'Papa', pepper: 'Pimiento',
    }
    expect(mockSpeak).toHaveBeenCalledWith(spanishNameById[correctId])
  })
})
