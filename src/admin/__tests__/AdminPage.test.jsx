import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import AdminPage from '../AdminPage'

const mockSettingsDefaults = { numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 10, childName: '', animationsEnabled: true }
const mockUpdateSetting = vi.fn()
const mockResetSettings = vi.fn()

vi.mock('../../hooks/useSettings', () => ({
  default: () => ({
    settings: {
      ...mockSettingsDefaults,
      tagOverrides: {},
    },
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

const manifestsFixture = [
  { id: 'animal-sounds', name: 'Animal Sounds', tags: ['sounds', 'animals'], icon: '🐘', color: '#B39DDB' },
  { id: 'color-match',   name: 'Color Match',   tags: ['visual', 'colors'],  icon: '🎨', color: '#CE93D8' },
]

function renderAdmin() {
  return render(<MemoryRouter><AdminPage manifests={manifestsFixture} /></MemoryRouter>)
}

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

  it('renders score history section', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await user.click(screen.getByRole('tab', { name: /history/i }))
    expect(screen.getByText(/score history/i)).toBeInTheDocument()
    expect(screen.getByText('8 / 10')).toBeInTheDocument()
  })

  it('renders the animations toggle and calls updateSetting when clicked', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(screen.getByText(/celebration animations/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /off/i }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('animationsEnabled', false)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders a tag input for each game', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await user.click(screen.getByRole('tab', { name: /games/i }))
    expect(screen.getByRole('heading', { name: /game tags/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/tags for animal sounds/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/tags for color match/i)).toBeInTheDocument()
  })

  it('pre-populates tag input with current effective tags', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await user.click(screen.getByRole('tab', { name: /games/i }))
    expect(screen.getByLabelText(/tags for animal sounds/i)).toHaveValue('sounds, animals')
  })

  it('deletes override when empty string is saved', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await user.click(screen.getByRole('tab', { name: /games/i }))
    const input = screen.getByLabelText(/tags for animal sounds/i)
    await user.clear(input)
    await user.click(screen.getAllByRole('button', { name: /save tags/i })[0])
    expect(mockUpdateSetting).toHaveBeenCalledWith(
      'tagOverrides',
      expect.not.objectContaining({ 'animal-sounds': expect.anything() })
    )
  })

  it('saves tagOverrides when valid tags are entered', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await user.click(screen.getByRole('tab', { name: /games/i }))
    const input = screen.getByLabelText(/tags for animal sounds/i)
    await user.clear(input)
    await user.type(input, 'numbers, math')
    await user.click(screen.getAllByRole('button', { name: /save tags/i })[0])
    expect(mockUpdateSetting).toHaveBeenCalledWith(
      'tagOverrides',
      expect.objectContaining({ 'animal-sounds': ['numbers', 'math'] })
    )
  })

  it('reset button clears override and restores manifest default', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await user.click(screen.getByRole('tab', { name: /games/i }))
    const input = screen.getByLabelText(/tags for animal sounds/i)
    const tagResetButtons = screen.getAllByRole('button', { name: 'Reset' })
    await user.click(tagResetButtons[0])
    expect(input).toHaveValue('sounds, animals')
    expect(mockUpdateSetting).toHaveBeenCalledWith(
      'tagOverrides',
      expect.not.objectContaining({ 'animal-sounds': expect.anything() })
    )
  })
})
