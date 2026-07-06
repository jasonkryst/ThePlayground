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

vi.mock('../../hooks/useSettings', () => ({
  default: () => ({ settings: { childName: '' } }),
}))

// ─── Fixtures ────────────────────────────────────────────────────────────────

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
})

afterEach(() => { vi.restoreAllMocks() })

// ─── Empty state ─────────────────────────────────────────────────────────────

describe('ParentDashboard — empty state', () => {
  beforeEach(() => { mockGetAllScores.mockReturnValue([]) })

  it('renders the page title', async () => {
    await renderDashboard()
    expect(screen.getByRole('heading', { name: /progress dashboard/i })).toBeInTheDocument()
  })

  it('shows an empty-state message when no scores exist', async () => {
    await renderDashboard()
    expect(screen.getByText(/no sessions recorded yet/i)).toBeInTheDocument()
  })

  it('does not render chart sections in empty state', async () => {
    await renderDashboard()
    expect(screen.queryByText(/score trend/i)).not.toBeInTheDocument()
  })

  it('renders a back link pointing to /', async () => {
    await renderDashboard()
    const back = screen.getByRole('link', { name: /back to dashboard/i })
    expect(back).toHaveAttribute('href', '/')
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

describe('ParentDashboard — focus management', () => {
  it('moves focus to the page title on mount', async () => {
    mockGetAllScores.mockReturnValue([])
    await renderDashboard()
    expect(screen.getByRole('heading', { name: /progress dashboard/i })).toHaveFocus()
  })
})
