import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'jest-axe'
import EmotionsMatchGame from '../index'
import { ShellContext } from '../../../components/ShellContext'
import i18n from '../../../i18n'
import emotions from '../data/emotions'

vi.mock('../../../lib/confetti', () => ({ fireConfetti: vi.fn() }))

// Mock the speech hook (per the "mock the hook, not the browser primitive" rule).
let mockSupported = true
let mockBlocked = false
const mockSpeak = vi.fn()
const mockCancel = vi.fn()
vi.mock('../../../hooks/useSpeech', () => ({
  default: () => ({ speak: mockSpeak, cancel: mockCancel, supported: mockSupported, blocked: mockBlocked }),
}))

let mockSettings = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, adaptiveItemSelectionEnabled: false, timerMode: 'countUp',
  introDismissed: { 'emotions-match': true },
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
  mockSupported = true
  mockBlocked = false
  mockSettings = {
    numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, adaptiveItemSelectionEnabled: false, timerMode: 'countUp',
    introDismissed: { 'emotions-match': true },
  }
})

const emotionButtons = () => screen.getAllByRole('button').filter(b => b.dataset.emotionId)

describe('EmotionsMatchGame', () => {
  it('renders the word prompt with picture choices', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByText(/find:/i)).toBeInTheDocument()
    expect(emotionButtons().length).toBeGreaterThanOrEqual(2)
  })

  it('speaks the name automatically when a question is shown', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(mockSpeak).toHaveBeenCalled()
  })

  it('shows a replay button that re-speaks the name on click', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    const replay = screen.getByLabelText(/say it again/i)
    mockSpeak.mockClear()
    await act(async () => { await userEvent.click(replay) })
    expect(mockSpeak).toHaveBeenCalledTimes(1)
  })

  it('labels each picture choice with its name for screen readers', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    for (const btn of emotionButtons()) {
      expect(btn.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it('clicking the correct picture adds the correct class', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    const correctId = screen.getByTestId('correct-emotion-id').textContent
    const correctBtn = emotionButtons().find(b => b.dataset.emotionId === correctId)
    await act(async () => { await userEvent.click(correctBtn) })
    expect(correctBtn.classList.contains('correct')).toBe(true)
  })

  it('shows results after all questions in immediate mode', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const correctId = screen.getByTestId('correct-emotion-id').textContent
      const correctBtn = emotionButtons().find(b => b.dataset.emotionId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
  })

  it('Home button calls onGameEnd', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const correctId = screen.getByTestId('correct-emotion-id').textContent
      const correctBtn = emotionButtons().find(b => b.dataset.emotionId === correctId)
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
          <EmotionsMatchGame onGameEnd={onGameEnd} />
        </ShellContext.Provider>
      )
    })
    for (let i = 0; i < 2; i++) {
      const correctId = screen.getByTestId('correct-emotion-id').textContent
      const correctBtn = emotionButtons().find(b => b.dataset.emotionId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(setGameStatus).toHaveBeenLastCalledWith({ streak: 2, sessionActive: true })
  })

  it('cancels speech when advancing to the next question', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    const correctId = screen.getByTestId('correct-emotion-id').textContent
    const correctBtn = emotionButtons().find(b => b.dataset.emotionId === correctId)
    act(() => { fireEvent.click(correctBtn) })
    act(() => { vi.advanceTimersByTime(1600) })
    await act(async () => {})
    vi.useRealTimers()
    expect(mockCancel).toHaveBeenCalled()
  })

  it('cancels speech when the session ends', async () => {
    mockSettings = { ...mockSettings, questionsPerSession: 1 }
    vi.useFakeTimers()
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    const correctId = screen.getByTestId('correct-emotion-id').textContent
    const correctBtn = emotionButtons().find(b => b.dataset.emotionId === correctId)
    act(() => { fireEvent.click(correctBtn) })
    act(() => { vi.advanceTimersByTime(1600) })
    await act(async () => {})
    vi.useRealTimers()
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
    expect(mockCancel).toHaveBeenCalled()
  })

  it('shows missed emotions in the results when an answer is wrong', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const correctId = screen.getByTestId('correct-emotion-id').textContent
      const wrongBtn = emotionButtons().find(b => b.dataset.emotionId !== correctId)
      act(() => { fireEvent.click(wrongBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(screen.getByText(/let's practice/i)).toBeInTheDocument()
  })

  it('hides the timer when timerMode is "off"', async () => {
    mockSettings = { ...mockSettings, timerMode: 'off' }
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByLabelText(/elapsed time/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    let container
    await act(async () => { container = render(<EmotionsMatchGame onGameEnd={onGameEnd} />).container })
    expect(await axe(container)).toHaveNoViolations()
  })

  // Negative: audio-leak guard
  it('does not speak while settings/intro have not resolved', async () => {
    mockLoaded = false
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(mockSpeak).not.toHaveBeenCalled()
  })

  it('shows the tap-to-hear recovery hint when speech is blocked', async () => {
    mockBlocked = true
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByText(/tap.*to hear/i)).toBeInTheDocument()
  })

  it('does not show the tap-to-hear hint when speech is not blocked', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByText(/tap.*to hear/i)).not.toBeInTheDocument()
  })

  it('does not show the recovery hint when speech is unsupported (no replay button at all)', async () => {
    mockSupported = false
    mockBlocked = true
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByText(/tap.*to hear/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations while the recovery hint is showing', async () => {
    mockBlocked = true
    let container
    await act(async () => { container = render(<EmotionsMatchGame onGameEnd={onGameEnd} />).container })
    expect(screen.getByText(/tap.*to hear/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  // Negative: the word is never hidden, unlike Fruit & Veggie ID
  describe('when speech synthesis is unavailable', () => {
    beforeEach(() => { mockSupported = false })

    it('still shows the word prompt and hides the replay button', async () => {
      await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
      expect(screen.getByText(/find:/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/say it again/i)).not.toBeInTheDocument()
      expect(mockSpeak).not.toHaveBeenCalled()
    })
  })
})

describe('EmotionsMatchGame — how-to-play intro', () => {
  it('shows the intro before the first question when not dismissed', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByTestId('game-intro-start')).toBeInTheDocument()
    expect(screen.queryByText(/find:/i)).not.toBeInTheDocument()
  })

  it('starts the session after "Let\'s Play!" is clicked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(screen.getByText(/find:/i)).toBeInTheDocument()
  })

  it('persists introDismissed for this game when "don\'t show again" is checked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-dont-show-again')) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(mockUpdateSetting).toHaveBeenCalledWith('introDismissed', { 'emotions-match': true })
  })
})

describe('EmotionsMatchGame — Spanish locale', () => {
  beforeEach(async () => { await act(async () => { await i18n.changeLanguage('es') }) })
  afterEach(async () => { await act(async () => { await i18n.changeLanguage('en') }) })

  it('replay button speaks the Spanish item name under the es locale', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    mockSpeak.mockClear()
    const replay = screen.getByLabelText(/decirlo de nuevo/i)
    await act(async () => { await userEvent.click(replay) })
    const correctId = screen.getByTestId('correct-emotion-id').textContent
    const spanishNameById = {
      happy: 'Feliz', sad: 'Triste', angry: 'Enojado', scared: 'Asustado',
      surprised: 'Sorprendido', tired: 'Cansado', silly: 'Gracioso', calm: 'Tranquilo',
    }
    expect(mockSpeak).toHaveBeenCalledWith(spanishNameById[correctId])
  })
})

describe('EmotionsMatchGame — session resume (issue #153)', () => {
  const savedQueue = [
    { correct: emotions[0], choices: [emotions[0], emotions[1]] },
    { correct: emotions[1], choices: [emotions[0], emotions[1]] },
  ]
  const savedSnapshot = {
    gameId: 'emotions-match', queue: savedQueue, index: 0, score: 1, streak: 1,
    missed: [], timings: [], peakStreak: 1, savedAt: Date.now(),
  }

  it('does NOT speak the name while the resume prompt is showing', async () => {
    mockGetSessionResume.mockResolvedValueOnce(savedSnapshot)
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => {})

    expect(screen.getByTestId('resume-prompt-resume')).toBeInTheDocument()
    expect(mockSpeak).not.toHaveBeenCalled()
  })

  it('speaks the name once the player chooses to resume', async () => {
    mockGetSessionResume.mockResolvedValueOnce(savedSnapshot)
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => {})

    await act(async () => { await userEvent.click(screen.getByTestId('resume-prompt-resume')) })

    expect(mockSpeak).toHaveBeenCalled()
  })

  it('speaks the name once the player starts fresh instead of resuming', async () => {
    mockGetSessionResume.mockResolvedValueOnce(savedSnapshot)
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => {})

    await act(async () => { await userEvent.click(screen.getByTestId('resume-prompt-start-fresh')) })

    expect(mockSpeak).toHaveBeenCalled()
  })
})

describe('EmotionsMatchGame — Polish locale', () => {
  beforeEach(async () => { await act(async () => { await i18n.changeLanguage('pl') }) })
  afterEach(async () => { await act(async () => { await i18n.changeLanguage('en') }) })

  it('replay button speaks the Polish item name under the pl locale', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    mockSpeak.mockClear()
    const replay = screen.getByLabelText(/powiedz ponownie/i)
    await act(async () => { await userEvent.click(replay) })
    const correctId = screen.getByTestId('correct-emotion-id').textContent
    const polishNameById = {
      happy: 'Wesoły', sad: 'Smutny', angry: 'Zły', scared: 'Przestraszony',
      surprised: 'Zaskoczony', tired: 'Zmęczony', silly: 'Głupkowaty', calm: 'Spokojny',
    }
    expect(mockSpeak).toHaveBeenCalledWith(polishNameById[correctId])
  })
})
