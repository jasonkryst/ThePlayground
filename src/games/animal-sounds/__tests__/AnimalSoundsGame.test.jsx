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
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerDisplayEnabled: true,
}
const mockUpdateSetting = vi.fn()

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings, updateSetting: mockUpdateSetting }),
}))

vi.mock('../../../hooks/useScores', () => ({
  default: () => ({ addScore: vi.fn().mockResolvedValue(undefined), scores: [], getBestScore: () => 0, getScoresByGame: () => [], getAllScores: () => [] }),
}))

vi.mock('../../../hooks/useBestStreak', () => ({
  default: () => ({ bestStreak: 0, recordStreak: vi.fn().mockResolvedValue(undefined) }),
}))

const onGameEnd = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockSettings = {
    numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerDisplayEnabled: true,
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

  it('shows the timer when timerDisplayEnabled is true', async () => {
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    expect(screen.getByLabelText(/elapsed time/i)).toBeInTheDocument()
  })

  it('hides the timer when timerDisplayEnabled is false', async () => {
    mockSettings = { ...mockSettings, timerDisplayEnabled: false }
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

  it('shows the difficulty-offer banner after a perfect session when enabled', async () => {
    mockSettings = { ...mockSettings, feedbackMode: 'parent-tap', difficultyAutoProgressionEnabled: true, questionsPerSession: 3, numChoices: 2 }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.animalId)
      const correctId = screen.getByTestId('correct-animal-id').textContent
      const correctBtn = buttons.find(b => b.dataset.animalId === correctId)
      await act(async () => { await userEvent.click(correctBtn) })
      await act(async () => { await userEvent.click(screen.getByRole('button', { name: /next/i })) })
    }

    expect(screen.getByText(/perfect session/i)).toBeInTheDocument()
  })
})
