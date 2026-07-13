import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'

const { mockPlay } = vi.hoisted(() => ({ mockPlay: vi.fn() }))
vi.mock('../../hooks/useSoundPlayer', () => ({
  default: () => ({ play: mockPlay, stop: vi.fn() }),
}))

import QuizGameShell from '../QuizGameShell'

const manifest = { icon: '🎨', name: 'Test Quiz', version: '1.0.0' }

function makeSession(overrides = {}) {
  return {
    current: { correct: { id: 'a' }, choices: [{ id: 'a' }, { id: 'b' }] },
    index: 0, total: 3, locked: false, disabledChoiceIds: [], hintActive: false, selected: null,
    score: 0, streak: 0, missed: [], done: false, feedbackMode: 'immediate',
    currentElapsedMs: 0, timerMode: 'countUp', timeLimitMs: undefined, timedOut: false,
    offerDifficultyBump: false, numChoices: 2, personalBestResult: null, newBadges: [],
    lastEvent: null, soundEffectsEnabled: true,
    showIntro: false, introResolved: true, settingsLoaded: true,
    dontShowAgain: false, setDontShowAgain: vi.fn(),
    handleChoice: vi.fn(), advance: vi.fn(), restart: vi.fn(),
    acceptDifficultyBump: vi.fn(), dismissDifficultyBump: vi.fn(), dismissIntro: vi.fn(),
    ...overrides,
  }
}

function renderShell(session, extra = {}) {
  return render(
    <QuizGameShell
      session={session}
      manifest={manifest}
      onGameEnd={vi.fn()}
      instructions="How to play"
      correctTestId="correct-test-id"
      prompt="Which one?"
      renderChoiceContent={item => item.id.toUpperCase()}
      renderMissedItem={item => item.id}
      {...extra}
    />
  )
}

beforeEach(() => vi.clearAllMocks())

describe('QuizGameShell — screens', () => {
  it('renders nothing until settings load and the intro resolves', () => {
    const { container } = renderShell(makeSession({ settingsLoaded: false, introResolved: false }))
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the intro (with manifest name) and starts via dismissIntro', () => {
    const session = makeSession({ showIntro: true })
    renderShell(session)
    expect(screen.getByText('Test Quiz')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('game-intro-start'))
    expect(session.dismissIntro).toHaveBeenCalledWith(false)
  })

  it('renders the question screen: progress, prompt, hidden correct-id testid, choices', () => {
    renderShell(makeSession())
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('Which one?')).toBeInTheDocument()
    expect(screen.getByTestId('correct-test-id')).toHaveTextContent('a')
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument()
  })

  it('supports a function prompt receiving the current question', () => {
    renderShell(makeSession(), { prompt: current => `Find ${current.correct.id}!` })
    expect(screen.getByText('Find a!')).toBeInTheDocument()
  })

  it('renders renderPromptExtra output inside the question block', () => {
    renderShell(makeSession(), { renderPromptExtra: current => <div data-testid="extra">{current.correct.id}</div> })
    expect(screen.getByTestId('extra')).toHaveTextContent('a')
  })

  it('tapping a choice calls handleChoice with the item', () => {
    const session = makeSession()
    renderShell(session)
    fireEvent.click(screen.getByRole('button', { name: 'B' }))
    expect(session.handleChoice).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
  })

  it('shows the results screen when done; Play Again restarts, Home reports the score', () => {
    const session = makeSession({ done: true, score: 2, total: 3, missed: [{ id: 'b' }] })
    const onGameEnd = vi.fn()
    render(
      <QuizGameShell
        session={session} manifest={manifest} onGameEnd={onGameEnd}
        instructions="x" correctTestId="correct-test-id" prompt="p"
        renderChoiceContent={i => i.id} renderMissedItem={i => i.id}
      />
    )
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /play again/i }))
    expect(session.restart).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /home/i }))
    expect(onGameEnd).toHaveBeenCalledWith(2, 3)
  })
})

describe('QuizGameShell — timer, timeout, next button', () => {
  it('renders the Timer in countUp mode', () => {
    renderShell(makeSession({ currentElapsedMs: 3000 }))
    expect(screen.getByText('3.0s')).toBeInTheDocument()
  })

  it('negative: no Timer when timerMode is off', () => {
    renderShell(makeSession({ timerMode: 'off', currentElapsedMs: 3000 }))
    expect(screen.queryByText('3.0s')).not.toBeInTheDocument()
  })

  it('shows the time-up row when timedOut', () => {
    renderShell(makeSession({ timedOut: true, locked: true }))
    expect(screen.getByText(/time's up/i)).toBeInTheDocument()
  })

  it('shows the Next button only when locked in parent-tap mode, and it advances', () => {
    const session = makeSession({ locked: true, feedbackMode: 'parent-tap' })
    renderShell(session)
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(session.advance).toHaveBeenCalled()
  })

  it('negative: no Next button in immediate mode, when unlocked, or after a timeout', () => {
    renderShell(makeSession({ locked: true, feedbackMode: 'immediate' }))
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()

    renderShell(makeSession({ locked: false, feedbackMode: 'parent-tap' }))
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()

    renderShell(makeSession({ locked: true, feedbackMode: 'parent-tap', timedOut: true }))
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()
  })
})

describe('QuizGameShell — chime layer', () => {
  it('plays the correct chime on a correct event', () => {
    renderShell(makeSession({ lastEvent: { seq: 1, type: 'correct' } }))
    expect(mockPlay).toHaveBeenCalledTimes(1)
    expect(mockPlay.mock.calls[0][0]).toContain('chime-correct')
  })

  it('plays the low tone on wrong and timeout events', () => {
    renderShell(makeSession({ lastEvent: { seq: 1, type: 'wrong' } }))
    expect(mockPlay.mock.calls[0][0]).toContain('chime-wrong')

    mockPlay.mockClear()
    renderShell(makeSession({ lastEvent: { seq: 1, type: 'timeout' } }))
    expect(mockPlay.mock.calls[0][0]).toContain('chime-wrong')
  })

  it('replays when seq advances even for the same event type', () => {
    const { rerender } = renderShell(makeSession({ lastEvent: { seq: 1, type: 'correct' } }))
    rerender(
      <QuizGameShell
        session={makeSession({ lastEvent: { seq: 2, type: 'correct' } })}
        manifest={manifest} onGameEnd={vi.fn()} instructions="x"
        correctTestId="correct-test-id" prompt="p"
        renderChoiceContent={i => i.id} renderMissedItem={i => i.id}
      />
    )
    expect(mockPlay).toHaveBeenCalledTimes(2)
  })

  it('negative: silent when soundEffectsEnabled is false', () => {
    renderShell(makeSession({ lastEvent: { seq: 1, type: 'correct' }, soundEffectsEnabled: false }))
    expect(mockPlay).not.toHaveBeenCalled()
  })

  it('negative: silent with no event', () => {
    renderShell(makeSession())
    expect(mockPlay).not.toHaveBeenCalled()
  })
})

describe('QuizGameShell — AU-2 live region', () => {
  it('is present and empty before any event', () => {
    renderShell(makeSession())
    expect(screen.getByTestId('quiz-live-region')).toHaveAttribute('role', 'status')
    expect(screen.getByTestId('quiz-live-region')).toHaveTextContent('')
  })

  it('announces correct and wrong events; stays silent on timeout (visible row announces it)', () => {
    renderShell(makeSession({ lastEvent: { seq: 1, type: 'correct' } }))
    expect(screen.getByTestId('quiz-live-region')).toHaveTextContent('Correct!')

    renderShell(makeSession({ lastEvent: { seq: 1, type: 'wrong' } }))
    expect(screen.getAllByTestId('quiz-live-region').at(-1)).toHaveTextContent('Not quite!')

    renderShell(makeSession({ lastEvent: { seq: 1, type: 'timeout' } }))
    expect(screen.getAllByTestId('quiz-live-region').at(-1)).toBeEmptyDOMElement()
  })

  it('question screen has no accessibility violations', async () => {
    const { container } = renderShell(makeSession())
    expect(await axe(container)).toHaveNoViolations()
  })
})
