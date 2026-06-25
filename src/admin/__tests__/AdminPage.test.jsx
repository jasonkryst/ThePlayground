import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import AdminPage from '../AdminPage'

const mockSettings = { numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 10, childName: '' }
const mockUpdateSetting = vi.fn()
const mockResetSettings = vi.fn()

vi.mock('../../hooks/useSettings', () => ({
  default: () => ({
    settings: mockSettings,
    updateSetting: mockUpdateSetting,
    resetSettings: mockResetSettings,
  }),
}))

vi.mock('../../hooks/useScores', () => ({
  default: () => ({
    getAllScores: () => [
      { gameId: 'animal-sounds', score: 8, total: 10, date: '2026-06-07', timestamp: 1000 },
    ],
    getBestScore: () => 0,
    getScoresByGame: () => [],
    scores: [],
  }),
}))

beforeEach(() => { vi.clearAllMocks() })

describe('AdminPage', () => {
  it('renders all setting controls', () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(screen.getByText(/answer choices/i)).toBeInTheDocument()
    expect(screen.getByText(/feedback mode/i)).toBeInTheDocument()
    expect(screen.getByText(/questions per session/i)).toBeInTheDocument()
  })

  it('renders the child name field', () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(screen.getByLabelText(/child's name/i)).toBeInTheDocument()
  })

  it('calls updateSetting when child name is typed', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const input = screen.getByLabelText(/child's name/i)
    await userEvent.type(input, 'M')
    expect(mockUpdateSetting).toHaveBeenCalledWith('childName', 'M')
  })

  it('calls updateSetting when a radio changes', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const radioFor4 = screen.getByRole('radio', { name: '4' })
    await userEvent.click(radioFor4)
    expect(mockUpdateSetting).toHaveBeenCalledWith('numChoices', 4)
  })

  it('calls resetSettings when reset button clicked', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(mockResetSettings).toHaveBeenCalled()
  })

  it('renders score history section', () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(screen.getByText(/score history/i)).toBeInTheDocument()
    expect(screen.getByText('8 / 10')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(await axe(container)).toHaveNoViolations()
  })
})
