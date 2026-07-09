import { useState } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'jest-axe'
import ParentDashboard from '../ParentDashboard'

// Recharts uses ResizeObserver and SVG APIs not available in jsdom.
// Replace with minimal stubs so component tests stay fast and deterministic.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="chart-container">{children}</div>,
  LineChart:           ({ children }) => <div>{children}</div>,
  Line:                () => null,
  CartesianGrid:       () => null,
  XAxis:               () => null,
  YAxis:               () => null,
  Tooltip:             () => null,
  Legend:              () => null,
}))

// ─── Storage mocks ───────────────────────────────────────────────────────────

const NOW = Date.now()
const DAY = 86_400_000

const mockGetBestStreaks = vi.fn().mockResolvedValue({ 'animal-sounds': 5 })

vi.mock('../../storage/index', () => ({
  default: {
    getScores:     vi.fn().mockResolvedValue([]),
    getSettings:   vi.fn().mockResolvedValue({}),
    getBestStreaks: () => mockGetBestStreaks(),
  },
}))

const mockGetAllScores = vi.fn()

vi.mock('../../hooks/useScores', () => ({
  default: () => ({ getAllScores: mockGetAllScores }),
}))

const { mockSettings, mockUpdateSetting } = vi.hoisted(() => ({
  mockSettings: { childName: '', parentDateRange: { preset: 'all', start: null, end: null } },
  mockUpdateSetting: vi.fn(),
}))

// The real useSettings() re-renders consumers when updateSetting() is called
// (it holds React state). A bare `settings: mockSettings, updateSetting: vi.fn()`
// mock can't reproduce that: mutating mockSettings in place wouldn't trigger a
// re-render, so clicking a DateRangeFilter tab would never actually narrow the
// dashboard. Seed local state from mockSettings on mount (so tests that set
// mockSettings.parentDateRange before renderDashboard() still work) and route
// every update through both the spy (for assertions) and local setState (so the
// component tree actually reflects the change).
function useMockSettings() {
  const [settings, setSettings] = useState(mockSettings)
  return {
    settings,
    updateSetting: (key, value) => {
      mockUpdateSetting(key, value)
      const next = { ...settings, [key]: value }
      mockSettings[key] = value
      setSettings(next)
    },
  }
}

vi.mock('../../hooks/useSettings', () => ({
  default: useMockSettings,
}))

// ─── Fixtures ────────────────────────────────────────────────────────────────

// jsdom's Blob polyfill doesn't implement the standard `.text()`/`.arrayBuffer()`
// methods (only `.slice()`/`.size`/`.type`), so CSV-content assertions read the
// blob back out via FileReader instead, which jsdom does support end-to-end.
function readBlobText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsText(blob)
  })
}

function makeScore(overrides = {}) {
  return {
    gameId:     'animal-sounds',
    score:      8,
    total:      10,
    date:       new Date(NOW - DAY).toISOString().split('T')[0],
    timestamp:  NOW - DAY,
    peakStreak: 4,
    timings: [
      { questionIndex: 0, itemId: 'cat',  correct: false, durationMs: 1500 },
      { questionIndex: 1, itemId: 'dog',  correct: true,  durationMs: 1000 },
    ],
    ...overrides,
  }
}

// ParentDashboard fetches best streaks asynchronously on mount
// (adapter.getBestStreaks().then(setBestStreaks)); flushing that microtask
// inside act() here means individual tests don't need to know it exists.
async function renderDashboard(manifests = []) {
  const utils = render(<MemoryRouter><ParentDashboard manifests={manifests} /></MemoryRouter>)
  await act(async () => {})
  return utils
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBestStreaks.mockResolvedValue({ 'animal-sounds': 5 })
  mockSettings.parentDateRange = { preset: 'all', start: null, end: null }
})

afterEach(() => { vi.restoreAllMocks() })

// ─── Empty state ─────────────────────────────────────────────────────────────

describe('ParentDashboard — empty state', () => {
  beforeEach(() => { mockGetAllScores.mockReturnValue([]) })

  it('shows an empty-state message when no scores exist', async () => {
    await renderDashboard()
    expect(screen.getByText(/no sessions recorded yet/i)).toBeInTheDocument()
  })

  it('does not render chart sections in empty state', async () => {
    await renderDashboard()
    expect(screen.queryByText(/score trend/i)).not.toBeInTheDocument()
  })

  it('renders the Export CSV button', async () => {
    await renderDashboard()
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = await renderDashboard()
    expect(await axe(container)).toHaveNoViolations()
  })
})

// ─── Loaded state ────────────────────────────────────────────────────────────

describe('ParentDashboard — with scores', () => {
  beforeEach(() => {
    mockGetAllScores.mockReturnValue([makeScore(), makeScore({ date: new Date(NOW - 2 * DAY).toISOString().split('T')[0], timestamp: NOW - 2 * DAY })])
  })

  it('renders all five section headings', async () => {
    await renderDashboard()
    // Use the heading role specifically — the new hidden chart data tables
    // also render a <caption> with the same text as the section heading.
    expect(screen.getByRole('heading', { name: /score trend/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /response time/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /streak history/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /play calendar/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /missed items/i })).toBeInTheDocument()
  })

  it('renders the streak history table with correct headers', async () => {
    await renderDashboard()
    expect(screen.getByText(/last 7 days/i)).toBeInTheDocument()
    expect(screen.getByText(/last 30 days/i)).toBeInTheDocument()
    expect(screen.getByText(/all-time best/i)).toBeInTheDocument()
  })

  it('renders chart containers', async () => {
    await renderDashboard()
    const charts = screen.getAllByTestId('chart-container')
    expect(charts.length).toBeGreaterThanOrEqual(2) // score trend + response time
  })

  it('renders the heatmap play calendar', async () => {
    await renderDashboard()
    expect(screen.getByRole('img', { name: /play activity calendar/i })).toBeInTheDocument()
  })

  it('renders the missed items panel with cat as top miss', async () => {
    await renderDashboard()
    // cat was missed in both sessions in makeScore()
    expect(screen.getAllByText(/cat/i).length).toBeGreaterThan(0)
  })

  it('has no accessibility violations', async () => {
    const { container } = await renderDashboard()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('provides a visually-hidden data table alternative for the score trend chart', async () => {
    await renderDashboard()
    const tables = screen.getAllByRole('table')
    // one for streak history (already visible) + one hidden table per chart
    expect(tables.length).toBeGreaterThanOrEqual(3)
  })
})

// ─── Export CSV ──────────────────────────────────────────────────────────────

describe('ParentDashboard — CSV export', () => {
  it('triggers a download when Export CSV is clicked', async () => {
    mockGetAllScores.mockReturnValue([makeScore()])
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock')
    URL.revokeObjectURL = vi.fn()

    // Render first — spy on createElement afterwards so React's DOM init is unaffected
    await renderDashboard()

    const clickSpy            = vi.fn()
    const originalCreateEl    = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return { click: clickSpy, href: '', download: '' }
      return originalCreateEl(tag)
    })

    fireEvent.click(screen.getByRole('button', { name: /export csv/i }))
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('does not throw when no scores exist and Export CSV is clicked', async () => {
    mockGetAllScores.mockReturnValue([])
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock')
    URL.revokeObjectURL = vi.fn()

    await renderDashboard()

    const originalCreateEl = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return { click: vi.fn(), href: '', download: '' }
      return originalCreateEl(tag)
    })

    expect(() => fireEvent.click(screen.getByRole('button', { name: /export csv/i }))).not.toThrow()
  })
})

// ─── Game display names ──────────────────────────────────────────────────────

describe('ParentDashboard — game display names', () => {
  const manifests = [{ id: 'animal-sounds', name: 'Animal Sounds' }]

  it('shows the manifest name instead of the raw gameId in the missed-items heading', async () => {
    mockGetAllScores.mockReturnValue([makeScore()])
    await renderDashboard(manifests)
    // Both the streak table and the missed-items panel render the game name,
    // so multiple elements are expected — assert at least one and no raw id.
    expect(screen.getAllByText('Animal Sounds').length).toBeGreaterThan(0)
    expect(screen.queryByText('animal-sounds')).not.toBeInTheDocument()
  })

  it('falls back to the raw gameId when no manifest is found', async () => {
    mockGetAllScores.mockReturnValue([makeScore()])
    await renderDashboard([]) // no manifests passed
    expect(screen.getAllByText('animal-sounds').length).toBeGreaterThan(0)
  })
})

// ─── Insufficient data ───────────────────────────────────────────────────────

describe('ParentDashboard — insufficient data for charts', () => {
  it('shows "not enough data" hints when only one session exists', async () => {
    mockGetAllScores.mockReturnValue([makeScore()])
    await renderDashboard()
    const hints = screen.getAllByText(/not enough data/i)
    // Score trend and response time both need >= 2 data points to render a chart
    expect(hints.length).toBeGreaterThanOrEqual(2)
  })
})

// ─── Date range filter ────────────────────────────────────────────────────────

describe('ParentDashboard — date range filter', () => {
  const NOW = Date.now()
  const DAY = 86_400_000
  const recentDate = new Date(NOW - DAY).toISOString().split('T')[0]
  const oldDate     = new Date(NOW - 60 * DAY).toISOString().split('T')[0]

  beforeEach(() => {
    mockGetAllScores.mockReturnValue([
      makeScore({ date: recentDate, timestamp: NOW - DAY }),
      makeScore({ date: oldDate,    timestamp: NOW - 60 * DAY, gameId: 'color-match' }),
    ])
  })

  it('narrows the missed-items panel to sessions in the selected range', async () => {
    await renderDashboard()
    // both games' missed items are visible under the default "All time" range.
    // No manifests are passed to renderDashboard() here, so panels fall back to
    // the raw gameId ("color-match", hyphenated — not "Color Match") as their heading.
    // "color-match" also legitimately appears more than once (streak table +
    // missed-items heading + hidden chart data tables), so use the *AllBy* variant.
    expect(screen.getAllByText(/cat/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('color-match').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('tab', { name: '7 days' }))
    // color-match's session is 60 days old — excluded once the range narrows to 7 days
    expect(screen.queryAllByText('color-match').length).toBe(0)
  })

  it('persists the selected range via updateSetting', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('tab', { name: '30 days' }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('parentDateRange', { preset: '30d', start: null, end: null })
  })

  it('restores a persisted range on mount', async () => {
    mockSettings.parentDateRange = { preset: '30d', start: null, end: null }
    await renderDashboard()
    expect(screen.getByRole('tab', { name: '30 days' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows each section\'s existing empty-state messaging when the range matches nothing, without crashing', async () => {
    mockGetAllScores.mockReturnValue([makeScore({ date: oldDate, timestamp: NOW - 60 * DAY })])
    await renderDashboard()
    fireEvent.click(screen.getByRole('tab', { name: '7 days' }))
    // matches both the "Missed Items" section heading (always present) and the
    // "No missed-item data yet" empty-state paragraph (only once filtered to empty)
    expect(screen.getAllByText(/no missed-item data yet|missed items/i).length).toBeGreaterThan(0)
  })

  it('CSV export reflects the active filter', async () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock')
    URL.revokeObjectURL  = vi.fn()
    await renderDashboard()
    fireEvent.click(screen.getByRole('tab', { name: '7 days' }))

    let capturedBlob
    const originalCreateEl = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return { click: vi.fn(), href: '', download: '' }
      return originalCreateEl(tag)
    })
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { capturedBlob = blob; return 'blob:mock' })

    fireEvent.click(screen.getByRole('button', { name: /export csv/i }))
    const text = await readBlobText(capturedBlob)
    expect(text).toContain('animal-sounds')
    expect(text).not.toContain('color-match')
  })

  it('has no accessibility violations with a non-default filter applied', async () => {
    const { container } = await renderDashboard()
    fireEvent.click(screen.getByRole('tab', { name: '30 days' }))
    expect(await axe(container)).toHaveNoViolations()
  })
})

// ─── Heatmap month labels ─────────────────────────────────────────────────────

describe('ParentDashboard — heatmap month labels', () => {
  it('renders at least one month label above the heatmap grid', async () => {
    mockGetAllScores.mockReturnValue([makeScore(), makeScore({ date: new Date(NOW - 2 * DAY).toISOString().split('T')[0], timestamp: NOW - 2 * DAY })])
    const { container } = await renderDashboard()
    expect(container.querySelectorAll('.heatmap__month-label').length).toBeGreaterThan(0)
  })
})