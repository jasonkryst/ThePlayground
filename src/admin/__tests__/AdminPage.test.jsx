import { render, screen, within, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import AdminPage from '../AdminPage'

const mockSettingsDefaults = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 10, childName: '', animationsEnabled: true,
  timerMode: 'countUp', timeLimitSeconds: 10, speedRecordMinAccuracy: 70,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2,
  retryCountsAsStreak: true, spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false,
  memoryPairs: 5, soundEffectsEnabled: true,
}
const mockUpdateSetting = vi.fn()
const mockResetSettings = vi.fn()
let mockIntroDismissed = {}

vi.mock('../../hooks/useSettings', () => ({
  default: () => ({
    settings: {
      ...mockSettingsDefaults,
      tagOverrides: {},
      introDismissed: mockIntroDismissed,
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

vi.mock('../../hooks/useBadges', () => ({
  default: () => ({
    badgeData: {
      awards: { 'animal-sounds': { hotStreak: 2 } },
      lifetimeQuestions: { 'animal-sounds': 45 },
    },
  }),
}))

const manifestsFixture = [
  { id: 'animal-sounds', nameKey: 'animalSounds.manifestName', tags: ['sounds', 'animals'], icon: '🐘', color: '#B39DDB' },
  { id: 'color-match',   nameKey: 'colorMatch.manifestName',   tags: ['visual', 'colors'],  icon: '🎨', color: '#CE93D8' },
]

function renderAdmin() {
  return render(<MemoryRouter><AdminPage manifests={manifestsFixture} /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIntroDismissed = {}
})

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

  it('links each tab to its tabpanel via aria-controls/id, labeled back via aria-labelledby', () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const settingsTab = screen.getByRole('tab', { name: 'Settings' })
    expect(settingsTab.id).toBeTruthy()
    const controlsId = settingsTab.getAttribute('aria-controls')
    expect(controlsId).toBeTruthy()
    const panel = document.getElementById(controlsId)
    expect(panel).toHaveAttribute('role', 'tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', settingsTab.id)
  })

  it('calls updateSetting when child name is typed', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const input = screen.getByLabelText(/child's name/i)
    await userEvent.type(input, 'M')
    expect(mockUpdateSetting).toHaveBeenCalledWith('childName', 'M')
  })

  it('calls updateSetting when a radio changes', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const answerChoicesSection = screen.getByText(/answer choices/i).closest('.admin__section')
    const { getByRole } = within(answerChoicesSection)
    const radioFor4 = getByRole('radio', { name: '4' })
    await userEvent.click(radioFor4)
    expect(mockUpdateSetting).toHaveBeenCalledWith('numChoices', 4)
  })

  it('requires a second click within a confirm window before calling resetSettings', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }))
    expect(mockResetSettings).not.toHaveBeenCalled()

    const confirmBtn = screen.getByRole('button', { name: /are you sure/i })
    await userEvent.click(confirmBtn)
    expect(mockResetSettings).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Reset to Defaults' })).toBeInTheDocument()
  })

  it('reverts the reset button to its normal label after the confirm window elapses without a second click', async () => {
    vi.useFakeTimers()
    try {
      render(<MemoryRouter><AdminPage /></MemoryRouter>)
      fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }))
      expect(screen.getByRole('button', { name: /are you sure/i })).toBeInTheDocument()

      await act(async () => { vi.advanceTimersByTime(4001) })
      expect(screen.getByRole('button', { name: 'Reset to Defaults' })).toBeInTheDocument()
      expect(mockResetSettings).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
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
    const animationsSection = screen.getByText(/celebration animations/i).closest('.admin__section')
    expect(animationsSection).toBeInTheDocument()
    const { getByRole } = within(animationsSection)
    await userEvent.click(getByRole('button', { name: /off/i }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('animationsEnabled', false)
  })

  it('renders the retry attempts radio group and calls updateSetting when changed', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const retrySection = screen.getByText(/retry attempts/i).closest('.admin__section')
    expect(retrySection).toBeInTheDocument()
    const { getByRole } = within(retrySection)
    await userEvent.click(getByRole('radio', { name: '3' }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('maxTries', 3)
  })

  it('calls updateSetting with "unlimited" when that option is selected', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('radio', { name: /unlimited/i }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('maxTries', 'unlimited')
  })

  it('renders the hints toggle and only shows hintAfterWrongTaps when hints are on', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(screen.queryByText(/show hint after/i)).not.toBeInTheDocument()
  })

  it('renders hintAfterWrongTaps when hintsEnabled is true', async () => {
    mockSettingsDefaults.hintsEnabled = true
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(screen.getByText(/show hint after/i)).toBeInTheDocument()
    mockSettingsDefaults.hintsEnabled = false
  })

  it('calls updateSetting when the hints toggle is turned on', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const hintsSection = screen.getByRole('heading', { name: /hints/i }).closest('.admin__section')
    const { getByRole } = within(hintsSection)
    await userEvent.click(getByRole('button', { name: /💡.*on/i }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('hintsEnabled', true)
  })

  it('renders the retry-counts-as-streak toggle', () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(screen.getByText(/retry counts toward streak/i)).toBeInTheDocument()
  })

  it('renders the spaced repetition toggle and calls updateSetting when turned on', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const spacedRepSection = screen.getByText(/spaced repetition/i).closest('.admin__section')
    const { getByRole } = within(spacedRepSection)
    await userEvent.click(getByRole('button', { name: /^on$/i }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('spacedRepetitionEnabled', true)
  })

  it('renders the difficulty auto-progression toggle and calls updateSetting when turned on', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const section = screen.getByText(/difficulty auto-progression/i).closest('.admin__section')
    const { getByRole } = within(section)
    await userEvent.click(getByRole('button', { name: /^on$/i }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('difficultyAutoProgressionEnabled', true)
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

  it('renders a Replay Intro button for each game', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await user.click(screen.getByRole('tab', { name: /games/i }))
    expect(screen.getAllByRole('button', { name: /replay intro/i })).toHaveLength(2)
  })

  it('clears introDismissed for the clicked game only, leaving other games untouched', async () => {
    mockIntroDismissed = { 'animal-sounds': true, 'color-match': true }
    const user = userEvent.setup()
    renderAdmin()
    await user.click(screen.getByRole('tab', { name: /games/i }))
    await user.click(screen.getAllByRole('button', { name: /replay intro/i })[0])
    expect(mockUpdateSetting).toHaveBeenCalledWith('introDismissed', { 'color-match': true })
  })

  it('shows a translated empty-state message on the Games tab when there are no games', async () => {
    render(<MemoryRouter><AdminPage manifests={[]} /></MemoryRouter>)
    await userEvent.click(screen.getByRole('tab', { name: /games/i }))
    expect(screen.getByText('No games found.')).toBeInTheDocument()
  })

  it('renders the timer radio row with 6 options', () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const timerSection = screen.getByRole('heading', { name: 'Timer' }).closest('.admin__section')
    expect(within(timerSection).getByRole('radio', { name: 'Off' })).toBeInTheDocument()
    expect(within(timerSection).getByRole('radio', { name: '⏱️ Show timer' })).toBeInTheDocument()
    expect(within(timerSection).getByRole('radio', { name: 'Answer within 5s' })).toBeInTheDocument()
    expect(within(timerSection).getByRole('radio', { name: 'Answer within 10s' })).toBeInTheDocument()
    expect(within(timerSection).getByRole('radio', { name: 'Answer within 15s' })).toBeInTheDocument()
    expect(within(timerSection).getByRole('radio', { name: 'Answer within 20s' })).toBeInTheDocument()
  })

  it('selecting a countdown option updates both timerMode and timeLimitSeconds', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const timerSection = screen.getByRole('heading', { name: 'Timer' }).closest('.admin__section')
    await userEvent.click(within(timerSection).getByRole('radio', { name: 'Answer within 15s' }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('timerMode', 'countdown')
    expect(mockUpdateSetting).toHaveBeenCalledWith('timeLimitSeconds', 15)
  })

  it('selecting "Off" sets timerMode to off', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const timerSection = screen.getByRole('heading', { name: 'Timer' }).closest('.admin__section')
    await userEvent.click(within(timerSection).getByRole('radio', { name: 'Off' }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('timerMode', 'off')
  })

  it('renders the speed record threshold radio row', () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const section = screen.getByRole('heading', { name: 'Speed Record Threshold' }).closest('.admin__section')
    expect(within(section).getByRole('radio', { name: '70%' })).toBeInTheDocument()
    expect(within(section).getByRole('radio', { name: '100%' })).toBeInTheDocument()
  })

  it('selecting a speed threshold option calls updateSetting', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const section = screen.getByRole('heading', { name: 'Speed Record Threshold' }).closest('.admin__section')
    await userEvent.click(within(section).getByRole('radio', { name: '90%' }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('speedRecordMinAccuracy', 90)
  })

  it('renders a Badges tab', () => {
    render(<MemoryRouter><AdminPage manifests={manifestsFixture} /></MemoryRouter>)
    expect(screen.getByRole('tab', { name: 'Badges' })).toBeInTheDocument()
  })

  it('shows the badge gallery when the Badges tab is active', async () => {
    render(<MemoryRouter><AdminPage manifests={manifestsFixture} /></MemoryRouter>)
    await userEvent.click(screen.getByRole('tab', { name: 'Badges' }))
    expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
    expect(screen.getByText('×2')).toBeInTheDocument() // hotStreak count for animal-sounds
  })
})

describe('settings groups', () => {
  it('renders the three group headings as h2 landmarks', () => {
    renderAdmin()
    for (const name of ['General', 'Quiz Games', 'Memory Games']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
  })

  it('demotes section headings to h3 (no section remains an h2)', () => {
    renderAdmin()
    expect(screen.getByRole('heading', { level: 3, name: 'Answer Choices' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Pairs Per Board' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Answer Choices' })).not.toBeInTheDocument()
  })

  it('selecting a pair count updates memoryPairs', () => {
    renderAdmin()
    const group = screen.getByRole('heading', { level: 3, name: 'Pairs Per Board' }).closest('.admin__section')
    fireEvent.click(within(group).getByLabelText('3'))
    expect(mockUpdateSetting).toHaveBeenCalledWith('memoryPairs', 3)
  })

  it('only offers pair counts 3 through 6', () => {
    renderAdmin()
    const group = screen.getByRole('heading', { level: 3, name: 'Pairs Per Board' }).closest('.admin__section')
    expect(within(group).getAllByRole('radio')).toHaveLength(4)
    expect(within(group).queryByLabelText('2')).not.toBeInTheDocument()
    expect(within(group).queryByLabelText('7')).not.toBeInTheDocument()
  })

  it('toggling sound effects updates soundEffectsEnabled', () => {
    renderAdmin()
    fireEvent.click(screen.getByRole('button', { name: /🔊 On/ }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('soundEffectsEnabled', true)
  })

  it('existing controls still update their keys after regrouping', () => {
    renderAdmin()
    fireEvent.click(screen.getByLabelText('4', { selector: 'input[name="numChoices"]' }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('numChoices', 4)
  })
})
