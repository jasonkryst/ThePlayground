import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import ColorMatchGame from '../index'

vi.mock('../../../lib/confetti', () => ({ fireConfetti: vi.fn() }))

vi.mock('../../../hooks/useBestStreak', () => ({
  default: () => ({ bestStreak: 0, recordStreak: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({
    settings: { numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3 },
  }),
}))

vi.mock('../../../hooks/useScores', () => ({
  default: () => ({ addScore: vi.fn().mockResolvedValue(undefined), scores: [], getBestScore: () => 0, getScoresByGame: () => [], getAllScores: () => [] }),
}))

const onGameEnd = vi.fn()

beforeEach(() => { vi.clearAllMocks() })

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

  it('shows the streak badge after 2 correct answers in a row', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 2; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.colorId)
      const correctId = screen.getByTestId('correct-color-id').textContent
      const correctBtn = buttons.find(b => b.dataset.colorId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(screen.getByText(/2/)).toBeInTheDocument()
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
})
