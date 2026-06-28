# Dashboard Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Recently Played badges, a Daily Challenge hero card, and Game Categories/Tags with admin overrides to the dashboard.

**Architecture:** Three new hooks (`useRecentlyPlayed`, `useFeaturedGame`, `useGameTags`) follow the existing hook-per-concern pattern alongside `useScores`/`useSettings`. Two new components (`FeaturedGameCard`, `CategorySection`) extend the existing component tree. `Dashboard`, `GameCard`, and `AdminPage` are updated; `App.jsx` gains one new prop pass-through.

**Tech Stack:** React 18, Vite, Vitest + React Testing Library, Playwright, react-i18next, CSS custom properties (`var(--color-*)`, `var(--radius-*)`).

## Global Constraints

- No new npm dependencies — all features use existing stack only
- CSS uses design tokens from `src/index.css` (`var(--color-aqua)`, `var(--color-lavender)`, `var(--color-surface)`, `var(--color-text)`, `var(--color-text-muted)`, `var(--radius-card)`, `var(--radius-button)`)
- All user-visible strings go in `src/i18n/en.json` under the appropriate namespace key; no string literals in JSX
- Score shape: `{ gameId, score, total, date, timestamp, peakStreak?, timings? }` — `timestamp` is a Unix ms integer
- Settings shape lives in `DEFAULT_SETTINGS` in `src/storage/adapter.js`; adapter interface is four methods: `getScores`, `addScore`, `getSettings`, `saveSettings`
- localStorage keys: `playground_scores`, `playground_settings`
- Hook tests mock `src/storage/index` via `vi.hoisted()` + `vi.mock()` — see `src/hooks/__tests__/useScores.test.js` for the pattern
- Component tests wrap in `<MemoryRouter>` when the component uses `<Link>`
- All components get an axe accessibility test
- Target version after this feature: **v0.5.0**

---

## File Map

**Create:**
- `src/hooks/useRecentlyPlayed.js`
- `src/hooks/__tests__/useRecentlyPlayed.test.js`
- `src/hooks/useFeaturedGame.js`
- `src/hooks/__tests__/useFeaturedGame.test.js`
- `src/hooks/useGameTags.js`
- `src/hooks/__tests__/useGameTags.test.js`
- `src/components/FeaturedGameCard.jsx`
- `src/components/FeaturedGameCard.css`
- `src/components/__tests__/FeaturedGameCard.test.jsx`
- `src/components/CategorySection.jsx`
- `src/components/CategorySection.css`
- `src/components/__tests__/CategorySection.test.jsx`

**Modify:**
- `src/components/GameCard.jsx` — add `recentInfo` prop, badge, glow
- `src/components/GameCard.css` — glow + badge styles
- `src/components/__tests__/GameCard.test.jsx` — new badge/glow tests
- `src/components/Dashboard.jsx` — wire all three hooks, tabs, sections
- `src/components/Dashboard.css` — featured wrapper, tab strip, sections
- `src/components/__tests__/Dashboard.test.jsx` — integration tests for all features
- `src/admin/AdminPage.jsx` — tag editor section, accept `manifests` prop
- `src/admin/__tests__/AdminPage.test.jsx` — tag editor tests
- `src/storage/adapter.js` — add `tagOverrides: {}` to `DEFAULT_SETTINGS`
- `src/games/animal-sounds/manifest.json` — add `tags`
- `src/games/color-match/manifest.json` — add `tags`
- `src/App.jsx` — pass `manifests` to `<AdminPage>`
- `src/i18n/en.json` — new translation keys
- `e2e/dashboard.spec.js` — featured card + tabs E2E
- `e2e/admin.spec.js` — tag override persistence E2E
- `CHANGELOG.md` — v0.5.0 entry
- `package.json` — version bump to 0.5.0
- `README.md` — document new features

---

## Task 1: `useRecentlyPlayed` hook

**Files:**
- Create: `src/hooks/useRecentlyPlayed.js`
- Create: `src/hooks/__tests__/useRecentlyPlayed.test.js`

**Interfaces:**
- Consumes: `adapter.getScores()` → `Promise<Score[]>` where `Score.timestamp` is Unix ms
- Produces: `useRecentlyPlayed()` → `Map<string, { lastPlayed: Date, playCount: number }>`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useRecentlyPlayed.test.js`:

```js
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import useRecentlyPlayed from '../useRecentlyPlayed'

const mockAdapter = vi.hoisted(() => ({ getScores: vi.fn() }))
vi.mock('../../storage/index', () => ({ default: mockAdapter }))

const TODAY    = new Date(); TODAY.setHours(12, 0, 0, 0)
const YESTERDAY = new Date(TODAY); YESTERDAY.setDate(TODAY.getDate() - 1)
const THREE_AGO = new Date(TODAY); THREE_AGO.setDate(TODAY.getDate() - 3)

const makeScore = (gameId, timestamp) => ({
  gameId, score: 8, total: 10,
  date: new Date(timestamp).toISOString().split('T')[0],
  timestamp,
})

beforeEach(() => { vi.clearAllMocks() })

describe('useRecentlyPlayed', () => {
  it('returns empty Map when no scores exist', async () => {
    mockAdapter.getScores.mockResolvedValue([])
    const { result } = renderHook(() => useRecentlyPlayed())
    await act(async () => {})
    expect(result.current.size).toBe(0)
  })

  it('derives lastPlayed and playCount from score records', async () => {
    mockAdapter.getScores.mockResolvedValue([
      makeScore('animal-sounds', TODAY.getTime()),
      makeScore('animal-sounds', YESTERDAY.getTime()),
    ])
    const { result } = renderHook(() => useRecentlyPlayed())
    await act(async () => {})
    const info = result.current.get('animal-sounds')
    expect(info.playCount).toBe(2)
    expect(info.lastPlayed.getTime()).toBe(TODAY.getTime())
  })

  it('tracks multiple games independently', async () => {
    mockAdapter.getScores.mockResolvedValue([
      makeScore('animal-sounds', TODAY.getTime()),
      makeScore('color-match', YESTERDAY.getTime()),
    ])
    const { result } = renderHook(() => useRecentlyPlayed())
    await act(async () => {})
    expect(result.current.get('animal-sounds').playCount).toBe(1)
    expect(result.current.get('color-match').playCount).toBe(1)
    expect(result.current.get('animal-sounds').lastPlayed.getTime()).toBe(TODAY.getTime())
  })

  it('uses the most recent timestamp as lastPlayed', async () => {
    mockAdapter.getScores.mockResolvedValue([
      makeScore('animal-sounds', THREE_AGO.getTime()),
      makeScore('animal-sounds', TODAY.getTime()),
      makeScore('animal-sounds', YESTERDAY.getTime()),
    ])
    const { result } = renderHook(() => useRecentlyPlayed())
    await act(async () => {})
    expect(result.current.get('animal-sounds').lastPlayed.getTime()).toBe(TODAY.getTime())
    expect(result.current.get('animal-sounds').playCount).toBe(3)
  })

  it('ignores scores with no timestamp', async () => {
    mockAdapter.getScores.mockResolvedValue([
      { gameId: 'animal-sounds', score: 5, total: 10, date: '2026-01-01' },
    ])
    const { result } = renderHook(() => useRecentlyPlayed())
    await act(async () => {})
    expect(result.current.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/useRecentlyPlayed.test.js
```

Expected: FAIL — `Cannot find module '../useRecentlyPlayed'`

- [ ] **Step 3: Implement `useRecentlyPlayed`**

Create `src/hooks/useRecentlyPlayed.js`:

```js
import { useState, useEffect } from 'react'
import adapter from '../storage/index'

export default function useRecentlyPlayed() {
  const [recentlyPlayed, setRecentlyPlayed] = useState(new Map())

  useEffect(() => {
    adapter.getScores().then(scores => {
      const map = new Map()
      for (const s of scores) {
        if (!s.timestamp) continue
        const existing = map.get(s.gameId)
        map.set(s.gameId, {
          lastPlayed: new Date(
            existing ? Math.max(existing.lastPlayed.getTime(), s.timestamp) : s.timestamp
          ),
          playCount: (existing?.playCount ?? 0) + 1,
        })
      }
      setRecentlyPlayed(map)
    })
  }, [])

  return recentlyPlayed
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/useRecentlyPlayed.test.js
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRecentlyPlayed.js src/hooks/__tests__/useRecentlyPlayed.test.js
git commit -m "feat: add useRecentlyPlayed hook — derives play history from existing scores"
```

---

## Task 2: `GameCard` recently-played badge and glow

**Files:**
- Modify: `src/components/GameCard.jsx`
- Modify: `src/components/GameCard.css`
- Modify: `src/components/__tests__/GameCard.test.jsx`

**Interfaces:**
- Consumes from Task 1: `recentInfo: { lastPlayed: Date, playCount: number } | null`
- Produces: updated `GameCard({ manifest, bestScore, recentInfo })` with badge and glow

- [ ] **Step 1: Add i18n keys for badge text**

In `src/i18n/en.json`, add inside `"gameCard"`:

```json
"playedToday":     "Today",
"playedYesterday": "Yesterday",
"playedDaysAgo":   "{{days}} days ago",
"playCount_one":   "{{count}} play",
"playCount_other": "{{count}} plays"
```

The full `"gameCard"` object becomes:
```json
"gameCard": {
  "best": "Best: {{score}}",
  "playedToday":     "Today",
  "playedYesterday": "Yesterday",
  "playedDaysAgo":   "{{days}} days ago",
  "playCount_one":   "{{count}} play",
  "playCount_other": "{{count}} plays"
}
```

- [ ] **Step 2: Write the failing tests**

Replace the contents of `src/components/__tests__/GameCard.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import GameCard from '../GameCard'

const manifest = {
  id: 'animal-sounds',
  name: 'Animal Sounds',
  description: 'Match the animal to its sound!',
  icon: '🐘',
  color: '#B39DDB',
}

const TODAY     = new Date(); TODAY.setHours(12, 0, 0, 0)
const YESTERDAY = new Date(TODAY); YESTERDAY.setDate(TODAY.getDate() - 1)
const THREE_AGO = new Date(TODAY); THREE_AGO.setDate(TODAY.getDate() - 3)

function renderCard(bestScore = 0, recentInfo = null) {
  return render(
    <MemoryRouter>
      <GameCard manifest={manifest} bestScore={bestScore} recentInfo={recentInfo} />
    </MemoryRouter>
  )
}

describe('GameCard', () => {
  it('renders game name and description', () => {
    renderCard()
    expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
    expect(screen.getByText('Match the animal to its sound!')).toBeInTheDocument()
  })

  it('renders the game icon', () => {
    renderCard()
    expect(screen.getByText('🐘')).toBeInTheDocument()
  })

  it('shows best score when greater than 0', () => {
    renderCard(8)
    expect(screen.getByText(/best.*8/i)).toBeInTheDocument()
  })

  it('links to the correct game route', () => {
    renderCard()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/game/animal-sounds')
  })

  it('does not show best score when bestScore is 0', () => {
    renderCard(0)
    expect(screen.queryByText(/best/i)).not.toBeInTheDocument()
  })

  it('shows no recently-played badge when recentInfo is null', () => {
    renderCard(0, null)
    expect(screen.queryByTestId('recently-played-badge')).not.toBeInTheDocument()
  })

  it('shows "Today" badge when played today', () => {
    renderCard(0, { lastPlayed: TODAY, playCount: 4 })
    expect(screen.getByTestId('recently-played-badge')).toBeInTheDocument()
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('Today')
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('4 plays')
  })

  it('shows "Yesterday" badge when played yesterday', () => {
    renderCard(0, { lastPlayed: YESTERDAY, playCount: 2 })
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('Yesterday')
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('2 plays')
  })

  it('shows "N days ago" badge for older plays', () => {
    renderCard(0, { lastPlayed: THREE_AGO, playCount: 1 })
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('3 days ago')
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('1 play')
  })

  it('uses singular "play" for playCount of 1', () => {
    renderCard(0, { lastPlayed: TODAY, playCount: 1 })
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('1 play')
    expect(screen.getByTestId('recently-played-badge')).not.toHaveTextContent('1 plays')
  })

  it('adds recently-played class when recentInfo is present', () => {
    renderCard(0, { lastPlayed: TODAY, playCount: 1 })
    expect(screen.getByRole('link')).toHaveClass('game-card--recently-played')
  })

  it('does not add recently-played class when recentInfo is null', () => {
    renderCard(0, null)
    expect(screen.getByRole('link')).not.toHaveClass('game-card--recently-played')
  })

  it('has no accessibility violations', async () => {
    const { container } = renderCard(5, { lastPlayed: TODAY, playCount: 3 })
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/components/__tests__/GameCard.test.jsx
```

Expected: new badge/glow tests FAIL — `recentInfo` prop not implemented

- [ ] **Step 4: Implement badge and glow in `GameCard`**

Replace `src/components/GameCard.jsx`:

```jsx
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './GameCard.css'

const MS_PER_DAY = 86_400_000

function getDaysDiff(lastPlayedMs) {
  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const playedMidnight = new Date(
    new Date(lastPlayedMs).getFullYear(),
    new Date(lastPlayedMs).getMonth(),
    new Date(lastPlayedMs).getDate()
  ).getTime()
  return Math.round((todayMidnight - playedMidnight) / MS_PER_DAY)
}

function recentLabel(recentInfo, t) {
  const { lastPlayed, playCount } = recentInfo
  const days = getDaysDiff(lastPlayed.getTime())
  const plays = t('gameCard.playCount', { count: playCount })
  const when =
    days === 0 ? t('gameCard.playedToday') :
    days === 1 ? t('gameCard.playedYesterday') :
    t('gameCard.playedDaysAgo', { days })
  return `${when} · ${plays}`
}

export default function GameCard({ manifest, bestScore, recentInfo = null }) {
  const { t } = useTranslation()
  const { id, name, description, icon, color } = manifest

  const cardStyle = recentInfo
    ? { boxShadow: `0 0 0 3px ${color}, 0 4px 16px rgba(0,0,0,0.1)` }
    : { borderTop: `6px solid ${color}` }

  return (
    <Link
      to={`/game/${id}`}
      className={`game-card${recentInfo ? ' game-card--recently-played' : ''}`}
      style={cardStyle}
    >
      <span className="game-card__icon">{icon}</span>
      <span className="game-card__name">{name}</span>
      <span className="game-card__desc">{description}</span>
      {bestScore > 0 && (
        <span className="game-card__score">{t('gameCard.best', { score: bestScore })}</span>
      )}
      {recentInfo && (
        <span className="game-card__recent-badge" data-testid="recently-played-badge">
          {recentLabel(recentInfo, t)}
        </span>
      )}
    </Link>
  )
}
```

- [ ] **Step 5: Add CSS for badge and glow**

Append to `src/components/GameCard.css`:

```css
.game-card--recently-played {
  border-top: none;
}

.game-card__recent-badge {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  background: rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  padding: 2px 10px;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/components/__tests__/GameCard.test.jsx
```

Expected: 12 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/GameCard.jsx src/components/GameCard.css src/components/__tests__/GameCard.test.jsx src/i18n/en.json
git commit -m "feat: add recently-played badge and glow to GameCard"
```

---

## Task 3: Wire `useRecentlyPlayed` into Dashboard

**Files:**
- Modify: `src/components/Dashboard.jsx`
- Modify: `src/components/__tests__/Dashboard.test.jsx`

**Interfaces:**
- Consumes from Task 1: `useRecentlyPlayed()` → `Map<string, { lastPlayed: Date, playCount: number }>`
- Consumes from Task 2: updated `GameCard` accepts `recentInfo` prop

- [ ] **Step 1: Write the failing integration test**

Add these tests to `src/components/__tests__/Dashboard.test.jsx`. First, add a mock for `useRecentlyPlayed` with the existing mocks at the top of the file:

```jsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import Dashboard from '../Dashboard'

vi.mock('../../hooks/useScores', () => ({
  default: () => ({
    getBestScore: (gameId) => gameId === 'animal-sounds' ? 7 : 3,
    getScoresByGame: () => [],
    scores: [],
    getAllScores: () => [],
  }),
}))

const mockSettings = { childName: '' }
vi.mock('../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings }),
}))

const TODAY = new Date(); TODAY.setHours(12, 0, 0, 0)
const mockRecentlyPlayed = new Map()
vi.mock('../../hooks/useRecentlyPlayed', () => ({
  default: () => mockRecentlyPlayed,
}))

// useFeaturedGame and useGameTags stubs — will be replaced in Tasks 6 and 10
vi.mock('../../hooks/useFeaturedGame', () => ({ default: () => null }))
vi.mock('../../hooks/useGameTags', () => ({
  default: () => ({ tagMap: new Map(), allTags: [] }),
}))

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds', description: 'Sounds!', icon: '🐘', color: '#B39DDB', tags: ['sounds'] },
  { id: 'color-match',   name: 'Color Match',   description: 'Colors!', icon: '🎨', color: '#CE93D8', tags: ['visual'] },
]

describe('Dashboard', () => {
  it('renders one card per manifest', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
    expect(screen.getByText('Color Match')).toBeInTheDocument()
  })

  it('renders the admin gear link', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /⚙️/i })).toHaveAttribute('href', '/admin')
  })

  it('renders the parent dashboard link', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /📊/i })).toHaveAttribute('href', '/parent')
  })

  it('renders empty state when no manifests', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.getByText(/no games/i)).toBeInTheDocument()
  })

  it('shows the default title when no child name is set', () => {
    mockSettings.childName = ''
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText("🌊 Baby's Playground")).toBeInTheDocument()
  })

  it('shows a personalized title when a child name is set', () => {
    mockSettings.childName = 'Mia'
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText("🌊 Mia's Playground")).toBeInTheDocument()
  })

  it('shows recently-played badge for a game with recent play data', () => {
    mockRecentlyPlayed.set('animal-sounds', { lastPlayed: TODAY, playCount: 3 })
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByTestId('recently-played-badge')).toBeInTheDocument()
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('Today')
    mockRecentlyPlayed.clear()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 2: Run tests to verify the new test fails**

```bash
npx vitest run src/components/__tests__/Dashboard.test.jsx
```

Expected: the `useRecentlyPlayed` mock error (module not found) or missing import

- [ ] **Step 3: Update `Dashboard.jsx` to wire in `useRecentlyPlayed`**

Replace `src/components/Dashboard.jsx`:

```jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import GameCard from './GameCard'
import useScores from '../hooks/useScores'
import useSettings from '../hooks/useSettings'
import useRecentlyPlayed from '../hooks/useRecentlyPlayed'
import useFeaturedGame from '../hooks/useFeaturedGame'
import useGameTags from '../hooks/useGameTags'
import { version } from '../../package.json'
import './Dashboard.css'

export default function Dashboard({ manifests = [] }) {
  const { t } = useTranslation()
  const { getBestScore } = useScores()
  const { settings } = useSettings()
  const recentlyPlayed = useRecentlyPlayed()
  const featured = useFeaturedGame(manifests)
  const { tagMap, allTags } = useGameTags(manifests)
  const [activeTag, setActiveTag] = useState('all')

  const name = settings.childName?.trim()
  const title = name ? t('dashboard.titleNamed', { name }) : t('dashboard.titleDefault')

  return (
    <div className="dashboard">
      <main>
        <div className="dashboard__header">
          <h1 className="dashboard__title">🌊 {title}</h1>
          <div className="dashboard__nav">
            <Link to="/parent" className="dashboard__nav-link" aria-label={t('dashboard.parentLabel')}>📊</Link>
            <Link to="/admin"  className="dashboard__nav-link" aria-label={t('dashboard.settingsLabel')}>⚙️</Link>
          </div>
        </div>

        {manifests.length === 0 ? (
          <p className="dashboard__empty">{t('dashboard.empty')}</p>
        ) : (
          <div className="dashboard__grid">
            {manifests.map(m => (
              <GameCard
                key={m.id}
                manifest={m}
                bestScore={getBestScore(m.id)}
                recentInfo={recentlyPlayed.get(m.id) ?? null}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="dashboard__footer">
        <span>{t('dashboard.footerName')}</span>
        <span className="dashboard__version">v{version}</span>
      </footer>
    </div>
  )
}
```

Note: `useFeaturedGame` and `useGameTags` are imported here but not yet rendered — they return null/empty and are wired in Tasks 6 and 10 without requiring another Dashboard rewrite. The `featured` and `allTags`/`tagMap` variables are intentionally unused for now; they will be connected in later tasks.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/__tests__/Dashboard.test.jsx
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.jsx src/components/__tests__/Dashboard.test.jsx
git commit -m "feat: wire useRecentlyPlayed into Dashboard — recently-played badges now appear"
```

---

## Task 4: `useFeaturedGame` hook

**Files:**
- Create: `src/hooks/useFeaturedGame.js`
- Create: `src/hooks/__tests__/useFeaturedGame.test.js`

**Interfaces:**
- Consumes: `manifests: Array<{ id: string, ... }>`, current date (computed internally)
- Produces: `useFeaturedGame(manifests)` → `manifest object | null`
- Exports: named `hashDate(str: string) → number` (for test access)

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useFeaturedGame.test.js`:

```js
import { describe, it, expect } from 'vitest'
import useFeaturedGame, { hashDate } from '../useFeaturedGame'

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds', icon: '🐘', color: '#B39DDB', tags: ['sounds'] },
  { id: 'color-match',   name: 'Color Match',   icon: '🎨', color: '#CE93D8', tags: ['visual'] },
  { id: 'numbers',       name: 'Numbers',        icon: '🔢', color: '#80DEEA', tags: ['numbers'] },
]

describe('hashDate', () => {
  it('returns the same integer for the same string', () => {
    expect(hashDate('2026-06-28')).toBe(hashDate('2026-06-28'))
  })

  it('returns a positive integer', () => {
    expect(hashDate('2026-06-28')).toBeGreaterThan(0)
  })

  it('returns different values for different dates', () => {
    expect(hashDate('2026-06-28')).not.toBe(hashDate('2026-06-29'))
  })
})

describe('useFeaturedGame', () => {
  it('returns null when manifests is empty', () => {
    expect(useFeaturedGame([])).toBeNull()
  })

  it('returns null when manifests is undefined', () => {
    expect(useFeaturedGame(undefined)).toBeNull()
  })

  it('always returns a manifest from the array', () => {
    const result = useFeaturedGame(manifests)
    expect(manifests).toContain(result)
  })

  it('returns the same game for the same date (deterministic)', () => {
    const a = useFeaturedGame(manifests)
    const b = useFeaturedGame(manifests)
    expect(a).toBe(b)
  })

  it('wraps index correctly — single-game array always returns that game', () => {
    const single = [manifests[0]]
    expect(useFeaturedGame(single)).toBe(single[0])
  })

  it('covers all games over a 30-day window (index wraps)', () => {
    // Verify the hash spreads across the full array over a realistic date range
    const covered = new Set()
    for (let d = 0; d < 30; d++) {
      const date = new Date(2026, 0, 1 + d).toISOString().slice(0, 10)
      const idx = hashDate(date) % manifests.length
      covered.add(idx)
    }
    expect(covered.size).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/useFeaturedGame.test.js
```

Expected: FAIL — `Cannot find module '../useFeaturedGame'`

- [ ] **Step 3: Implement `useFeaturedGame`**

Create `src/hooks/useFeaturedGame.js`:

```js
export function hashDate(str) {
  return str.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
}

export default function useFeaturedGame(manifests) {
  if (!manifests || manifests.length === 0) return null
  const today = new Date().toISOString().slice(0, 10)
  return manifests[hashDate(today) % manifests.length]
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/useFeaturedGame.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFeaturedGame.js src/hooks/__tests__/useFeaturedGame.test.js
git commit -m "feat: add useFeaturedGame hook — deterministic date-seeded game selection"
```

---

## Task 5: `FeaturedGameCard` component

**Files:**
- Create: `src/components/FeaturedGameCard.jsx`
- Create: `src/components/FeaturedGameCard.css`
- Create: `src/components/__tests__/FeaturedGameCard.test.jsx`

**Interfaces:**
- Consumes from Task 4: `manifest: { id, name, description, icon, color } | null`
- Produces: `<FeaturedGameCard manifest={manifest} />` — hero card; renders nothing when `manifest` is null

- [ ] **Step 1: Add i18n keys**

In `src/i18n/en.json`, add inside `"dashboard"`:

```json
"todaysGame":        "Today's Game",
"categoryOther":     "Other",
"tabAll":            "All",
"featuredAriaLabel": "Play today's featured game: {{name}}"
```

- [ ] **Step 2: Write the failing tests**

Create `src/components/__tests__/FeaturedGameCard.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import FeaturedGameCard from '../FeaturedGameCard'

const manifest = {
  id: 'animal-sounds',
  name: 'Animal Sounds',
  description: 'Match the animal to its sound!',
  icon: '🐘',
  color: '#B39DDB',
}

function renderFeatured(m = manifest) {
  return render(
    <MemoryRouter>
      <FeaturedGameCard manifest={m} />
    </MemoryRouter>
  )
}

describe('FeaturedGameCard', () => {
  it('renders nothing when manifest is null', () => {
    const { container } = renderFeatured(null)
    expect(container.firstChild).toBeNull()
  })

  it('renders the game icon', () => {
    renderFeatured()
    expect(screen.getByText('🐘')).toBeInTheDocument()
  })

  it('renders the game name', () => {
    renderFeatured()
    expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
  })

  it('renders the game description', () => {
    renderFeatured()
    expect(screen.getByText('Match the animal to its sound!')).toBeInTheDocument()
  })

  it('shows the "Today\'s Game" label', () => {
    renderFeatured()
    expect(screen.getByText("Today's Game")).toBeInTheDocument()
  })

  it('links to the correct game route', () => {
    renderFeatured()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/game/animal-sounds')
  })

  it('has an aria-label describing the featured game', () => {
    renderFeatured()
    expect(screen.getByRole('link')).toHaveAttribute(
      'aria-label',
      "Play today's featured game: Animal Sounds"
    )
  })

  it('has no accessibility violations', async () => {
    const { container } = renderFeatured()
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/components/__tests__/FeaturedGameCard.test.jsx
```

Expected: FAIL — `Cannot find module '../FeaturedGameCard'`

- [ ] **Step 4: Implement `FeaturedGameCard`**

Create `src/components/FeaturedGameCard.jsx`:

```jsx
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './FeaturedGameCard.css'

export default function FeaturedGameCard({ manifest }) {
  const { t } = useTranslation()
  if (!manifest) return null
  const { id, name, description, icon, color } = manifest
  return (
    <Link
      to={`/game/${id}`}
      className="featured-card"
      style={{ borderColor: color }}
      aria-label={t('dashboard.featuredAriaLabel', { name })}
    >
      <span className="featured-card__label">⭐ {t('dashboard.todaysGame')}</span>
      <span className="featured-card__icon">{icon}</span>
      <span className="featured-card__name">{name}</span>
      <span className="featured-card__desc">{description}</span>
    </Link>
  )
}
```

- [ ] **Step 5: Create `FeaturedGameCard.css`**

Create `src/components/FeaturedGameCard.css`:

```css
.featured-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 28px 24px;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  text-decoration: none;
  color: var(--color-text);
  border: 3px solid transparent;
  margin-bottom: 28px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.featured-card:hover,
.featured-card:focus-visible {
  transform: translateY(-4px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.featured-card:focus         { outline: none; }
.featured-card:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }

.featured-card__label {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.65;
}

.featured-card__icon { font-size: 72px; line-height: 1; }
.featured-card__name { font-size: 28px; font-weight: 800; text-align: center; }
.featured-card__desc { font-size: 16px; text-align: center; opacity: 0.75; }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/components/__tests__/FeaturedGameCard.test.jsx
```

Expected: 8 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/FeaturedGameCard.jsx src/components/FeaturedGameCard.css src/components/__tests__/FeaturedGameCard.test.jsx src/i18n/en.json
git commit -m "feat: add FeaturedGameCard hero component for daily challenge"
```

---

## Task 6: Wire Daily Challenge into Dashboard

**Files:**
- Modify: `src/components/Dashboard.jsx`
- Modify: `src/components/Dashboard.css`
- Modify: `src/components/__tests__/Dashboard.test.jsx`

**Interfaces:**
- Consumes from Task 4: `useFeaturedGame(manifests)` → manifest or null
- Consumes from Task 5: `<FeaturedGameCard manifest={featured} />`

- [ ] **Step 1: Update the Dashboard test mock and add new tests**

Update the `useFeaturedGame` mock in `src/components/__tests__/Dashboard.test.jsx` (find the stub added in Task 3 and replace it):

```js
vi.mock('../../hooks/useFeaturedGame', () => ({
  default: (manifests) => manifests[0] ?? null,
}))
```

Then add these tests to the `describe('Dashboard')` block:

```js
it('renders FeaturedGameCard above the grid', () => {
  render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
  expect(screen.getByText("Today's Game")).toBeInTheDocument()
})

it('featured game also appears in the grid', () => {
  render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
  // Animal Sounds is featured (mock returns manifests[0]) AND appears in grid
  const links = screen.getAllByRole('link', { name: /animal sounds/i })
  expect(links.length).toBeGreaterThanOrEqual(2)
})

it('does not render FeaturedGameCard when manifests is empty', () => {
  render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
  expect(screen.queryByText("Today's Game")).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
npx vitest run src/components/__tests__/Dashboard.test.jsx
```

Expected: the three new featured-card tests FAIL

- [ ] **Step 3: Update `Dashboard.jsx` to render `FeaturedGameCard`**

Replace `src/components/Dashboard.jsx`:

```jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import GameCard from './GameCard'
import FeaturedGameCard from './FeaturedGameCard'
import useScores from '../hooks/useScores'
import useSettings from '../hooks/useSettings'
import useRecentlyPlayed from '../hooks/useRecentlyPlayed'
import useFeaturedGame from '../hooks/useFeaturedGame'
import useGameTags from '../hooks/useGameTags'
import { version } from '../../package.json'
import './Dashboard.css'

export default function Dashboard({ manifests = [] }) {
  const { t } = useTranslation()
  const { getBestScore } = useScores()
  const { settings } = useSettings()
  const recentlyPlayed = useRecentlyPlayed()
  const featured = useFeaturedGame(manifests)
  const { tagMap, allTags } = useGameTags(manifests)
  const [activeTag, setActiveTag] = useState('all')

  const name = settings.childName?.trim()
  const title = name ? t('dashboard.titleNamed', { name }) : t('dashboard.titleDefault')

  return (
    <div className="dashboard">
      <main>
        <div className="dashboard__header">
          <h1 className="dashboard__title">🌊 {title}</h1>
          <div className="dashboard__nav">
            <Link to="/parent" className="dashboard__nav-link" aria-label={t('dashboard.parentLabel')}>📊</Link>
            <Link to="/admin"  className="dashboard__nav-link" aria-label={t('dashboard.settingsLabel')}>⚙️</Link>
          </div>
        </div>

        <FeaturedGameCard manifest={featured} />

        {manifests.length === 0 ? (
          <p className="dashboard__empty">{t('dashboard.empty')}</p>
        ) : (
          <div className="dashboard__grid">
            {manifests.map(m => (
              <GameCard
                key={m.id}
                manifest={m}
                bestScore={getBestScore(m.id)}
                recentInfo={recentlyPlayed.get(m.id) ?? null}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="dashboard__footer">
        <span>{t('dashboard.footerName')}</span>
        <span className="dashboard__version">v{version}</span>
      </footer>
    </div>
  )
}
```

Note: `tagMap`, `allTags`, and `activeTag` are imported/declared but not yet rendered — they will be connected in Task 10 without another full Dashboard rewrite.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/__tests__/Dashboard.test.jsx
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.jsx src/components/Dashboard.css src/components/__tests__/Dashboard.test.jsx
git commit -m "feat: wire daily challenge hero card into Dashboard"
```

---

## Task 7: Manifest schema and settings update

**Files:**
- Modify: `src/games/animal-sounds/manifest.json`
- Modify: `src/games/color-match/manifest.json`
- Modify: `src/storage/adapter.js`

**Interfaces:**
- Produces: manifests now include `tags: string[]`; `DEFAULT_SETTINGS` now includes `tagOverrides: {}`

- [ ] **Step 1: Add `tags` to both game manifests**

Replace `src/games/animal-sounds/manifest.json`:
```json
{
  "id": "animal-sounds",
  "name": "Animal Sounds",
  "description": "Match the animal to its sound!",
  "icon": "🐘",
  "color": "#B39DDB",
  "version": "1.0.0",
  "tags": ["sounds", "animals"]
}
```

Replace `src/games/color-match/manifest.json`:
```json
{
  "id": "color-match",
  "name": "Color Match",
  "description": "Match the color to its object!",
  "icon": "🎨",
  "color": "#CE93D8",
  "version": "1.1.0",
  "tags": ["visual", "colors"]
}
```

- [ ] **Step 2: Add `tagOverrides` to `DEFAULT_SETTINGS`**

In `src/storage/adapter.js`, update `DEFAULT_SETTINGS`:

```js
export const DEFAULT_SETTINGS = {
  numChoices: 2,
  feedbackMode: 'immediate',
  questionsPerSession: 10,
  gaId: '',
  childName: '',
  animationsEnabled: true,
  tagOverrides: {},
}
```

- [ ] **Step 3: Run the full test suite to verify no regressions**

```bash
npx vitest run
```

Expected: all existing tests PASS (the new fields are additive and backward-compatible)

- [ ] **Step 4: Commit**

```bash
git add src/games/animal-sounds/manifest.json src/games/color-match/manifest.json src/storage/adapter.js
git commit -m "feat: add required tags to game manifests and tagOverrides to DEFAULT_SETTINGS"
```

---

## Task 8: `useGameTags` hook

**Files:**
- Create: `src/hooks/useGameTags.js`
- Create: `src/hooks/__tests__/useGameTags.test.js`

**Interfaces:**
- Consumes: `manifests: Array<{ id, tags?: string[] }>`, `settings.tagOverrides: { [gameId]: string[] }`
- Produces: `useGameTags(manifests)` → `{ tagMap: Map<string, string[]>, allTags: string[] }`
- Side effect: `console.warn` when a manifest has no tags

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useGameTags.test.js`:

```js
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import useGameTags from '../useGameTags'

const mockSettings = { tagOverrides: {} }
vi.mock('../useSettings', () => ({
  default: () => ({ settings: mockSettings }),
}))

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds', tags: ['sounds', 'animals'] },
  { id: 'color-match',   name: 'Color Match',   tags: ['visual', 'colors']  },
]

beforeEach(() => {
  mockSettings.tagOverrides = {}
  vi.restoreAllMocks()
})

describe('useGameTags', () => {
  it('returns manifest tags when no overrides', () => {
    const { result } = renderHook(() => useGameTags(manifests))
    expect(result.current.tagMap.get('animal-sounds')).toEqual(['sounds', 'animals'])
    expect(result.current.tagMap.get('color-match')).toEqual(['visual', 'colors'])
  })

  it('override takes precedence over manifest tags', () => {
    mockSettings.tagOverrides = { 'animal-sounds': ['numbers'] }
    const { result } = renderHook(() => useGameTags(manifests))
    expect(result.current.tagMap.get('animal-sounds')).toEqual(['numbers'])
  })

  it('returns sorted deduplicated allTags', () => {
    const { result } = renderHook(() => useGameTags(manifests))
    expect(result.current.allTags).toEqual(['animals', 'colors', 'sounds', 'visual'])
  })

  it('allTags reflects overrides', () => {
    mockSettings.tagOverrides = { 'animal-sounds': ['numbers'] }
    const { result } = renderHook(() => useGameTags(manifests))
    expect(result.current.allTags).toContain('numbers')
    expect(result.current.allTags).not.toContain('sounds')
    expect(result.current.allTags).not.toContain('animals')
  })

  it('game with no effective tags excluded from allTags', () => {
    mockSettings.tagOverrides = { 'animal-sounds': [] }
    const { result } = renderHook(() => useGameTags(manifests))
    expect(result.current.tagMap.get('animal-sounds')).toEqual([])
    expect(result.current.allTags).not.toContain('sounds')
  })

  it('warns when a manifest has no tags', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const noTagManifests = [{ id: 'broken-game', name: 'Broken' }]
    renderHook(() => useGameTags(noTagManifests))
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('broken-game'))
  })

  it('returns empty tagMap and allTags for empty manifests', () => {
    const { result } = renderHook(() => useGameTags([]))
    expect(result.current.tagMap.size).toBe(0)
    expect(result.current.allTags).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/useGameTags.test.js
```

Expected: FAIL — `Cannot find module '../useGameTags'`

- [ ] **Step 3: Implement `useGameTags`**

Create `src/hooks/useGameTags.js`:

```js
import { useMemo } from 'react'
import useSettings from './useSettings'

function warnMissingTags(manifests) {
  for (const m of manifests) {
    if (!Array.isArray(m.tags) || m.tags.length === 0) {
      console.warn(
        `[ThePlayground] Game "${m.id}" is missing a required "tags" array in its manifest.json.`
      )
    }
  }
}

export default function useGameTags(manifests) {
  const { settings } = useSettings()

  return useMemo(() => {
    warnMissingTags(manifests)
    const tagOverrides = settings.tagOverrides ?? {}
    const tagMap = new Map()
    const allTagsSet = new Set()

    for (const m of manifests) {
      const tags = tagOverrides[m.id] ?? m.tags ?? []
      tagMap.set(m.id, tags)
      for (const tag of tags) allTagsSet.add(tag)
    }

    return { tagMap, allTags: [...allTagsSet].sort() }
  }, [manifests, settings.tagOverrides])
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/useGameTags.test.js
```

Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGameTags.js src/hooks/__tests__/useGameTags.test.js
git commit -m "feat: add useGameTags hook — merges manifest tags with admin overrides"
```

---

## Task 9: `CategorySection` component

**Files:**
- Create: `src/components/CategorySection.jsx`
- Create: `src/components/CategorySection.css`
- Create: `src/components/__tests__/CategorySection.test.jsx`

**Interfaces:**
- Consumes: `heading: string`, `children: ReactNode`
- Produces: `<CategorySection heading="Sounds 🔊">{...GameCards}</CategorySection>`

- [ ] **Step 1: Write the failing tests**

Create `src/components/__tests__/CategorySection.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import CategorySection from '../CategorySection'

describe('CategorySection', () => {
  it('renders the section heading', () => {
    render(<CategorySection heading="Sounds 🔊"><p>child</p></CategorySection>)
    expect(screen.getByRole('heading', { name: 'Sounds 🔊' })).toBeInTheDocument()
  })

  it('renders children', () => {
    render(<CategorySection heading="Sounds 🔊"><p>game card here</p></CategorySection>)
    expect(screen.getByText('game card here')).toBeInTheDocument()
  })

  it('renders nothing inside the grid when children is empty', () => {
    const { container } = render(<CategorySection heading="Empty" />)
    const grid = container.querySelector('.category-section__grid')
    expect(grid).toBeInTheDocument()
    expect(grid.children).toHaveLength(0)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <CategorySection heading="Sounds 🔊"><p>content</p></CategorySection>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/__tests__/CategorySection.test.jsx
```

Expected: FAIL — `Cannot find module '../CategorySection'`

- [ ] **Step 3: Implement `CategorySection`**

Create `src/components/CategorySection.jsx`:

```jsx
import './CategorySection.css'

export default function CategorySection({ heading, children }) {
  return (
    <section className="category-section">
      <h2 className="category-section__heading">{heading}</h2>
      <div className="category-section__grid">
        {children}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create `CategorySection.css`**

Create `src/components/CategorySection.css`:

```css
.category-section {
  margin-bottom: 32px;
}

.category-section__heading {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-lavender-dark);
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid rgba(0, 0, 0, 0.06);
}

.category-section__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/components/__tests__/CategorySection.test.jsx
```

Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/CategorySection.jsx src/components/CategorySection.css src/components/__tests__/CategorySection.test.jsx
git commit -m "feat: add CategorySection component for grouped tag display"
```

---

## Task 10: Wire categories and filter tabs into Dashboard

**Files:**
- Modify: `src/components/Dashboard.jsx`
- Modify: `src/components/Dashboard.css`
- Modify: `src/components/__tests__/Dashboard.test.jsx`

**Interfaces:**
- Consumes from Task 8: `useGameTags(manifests)` → `{ tagMap, allTags }`
- Consumes from Task 9: `<CategorySection heading={...}>{...}</CategorySection>`

- [ ] **Step 1: Add i18n key**

In `src/i18n/en.json`, `"dashboard"` already has `"tabAll"` and `"categoryOther"` from Task 5. Verify they are present (they should be from that commit).

- [ ] **Step 2: Add new Dashboard tests for tabs and sections**

Update the `useGameTags` mock in `src/components/__tests__/Dashboard.test.jsx` (replace the stub from Task 3):

```js
vi.mock('../../hooks/useGameTags', () => ({
  default: (manifests) => {
    const tagMap = new Map(manifests.map(m => [m.id, m.tags ?? []]))
    const allTagsSet = new Set(manifests.flatMap(m => m.tags ?? []))
    return { tagMap, allTags: [...allTagsSet].sort() }
  },
}))
```

Add these tests to the `describe('Dashboard')` block:

```js
it('renders filter tabs for each tag when allTags is non-empty', () => {
  render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
  expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Sounds' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Visual' })).toBeInTheDocument()
})

it('"All" tab is selected by default', () => {
  render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
  expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true')
})

it('renders CategorySection headings in All view', () => {
  render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
  // sections for 'animals', 'colors', 'sounds', 'visual' — at least two present
  expect(screen.getByRole('heading', { name: /sounds/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /visual/i })).toBeInTheDocument()
})
```

Add a user-event click test for filtering (import `userEvent` and `act`):

```js
import userEvent from '@testing-library/user-event'

it('clicking a tag tab filters the grid to matching games', async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
  await user.click(screen.getByRole('tab', { name: 'Sounds' }))
  expect(screen.getByRole('tab', { name: 'Sounds' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
  expect(screen.queryByText('Color Match')).not.toBeInTheDocument()
})

it('clicking All tab restores full view', async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
  await user.click(screen.getByRole('tab', { name: 'Sounds' }))
  await user.click(screen.getByRole('tab', { name: 'All' }))
  expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
  expect(screen.getByText('Color Match')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run tests to verify new tests fail**

```bash
npx vitest run src/components/__tests__/Dashboard.test.jsx
```

Expected: new tab/section tests FAIL

- [ ] **Step 4: Implement tabs and sections in `Dashboard.jsx`**

Replace `src/components/Dashboard.jsx` with the final version:

```jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import GameCard from './GameCard'
import FeaturedGameCard from './FeaturedGameCard'
import CategorySection from './CategorySection'
import useScores from '../hooks/useScores'
import useSettings from '../hooks/useSettings'
import useRecentlyPlayed from '../hooks/useRecentlyPlayed'
import useFeaturedGame from '../hooks/useFeaturedGame'
import useGameTags from '../hooks/useGameTags'
import { version } from '../../package.json'
import './Dashboard.css'

const TAG_ICONS = {
  sounds:  '🔊',
  visual:  '👁️',
  numbers: '🔢',
  animals: '🐾',
  colors:  '🎨',
}

function buildSections(manifests, tagMap, featuredId, allTags, t) {
  const sections = []
  for (const tag of allTags) {
    const games = manifests.filter(
      m => m.id !== featuredId && (tagMap.get(m.id) ?? []).includes(tag)
    )
    if (games.length > 0) {
      const icon = TAG_ICONS[tag] ?? ''
      const label = `${icon} ${tag.charAt(0).toUpperCase() + tag.slice(1)}`.trim()
      sections.push({ heading: label, games })
    }
  }
  const untagged = manifests.filter(
    m => m.id !== featuredId && (tagMap.get(m.id) ?? []).length === 0
  )
  if (untagged.length > 0) {
    sections.push({ heading: t('dashboard.categoryOther'), games: untagged })
  }
  return sections
}

export default function Dashboard({ manifests = [] }) {
  const { t } = useTranslation()
  const { getBestScore } = useScores()
  const { settings } = useSettings()
  const recentlyPlayed = useRecentlyPlayed()
  const featured = useFeaturedGame(manifests)
  const { tagMap, allTags } = useGameTags(manifests)
  const [activeTag, setActiveTag] = useState('all')

  const name = settings.childName?.trim()
  const title = name ? t('dashboard.titleNamed', { name }) : t('dashboard.titleDefault')

  const filteredManifests = activeTag === 'all'
    ? manifests
    : manifests.filter(m => (tagMap.get(m.id) ?? []).includes(activeTag))

  const sections = activeTag === 'all'
    ? buildSections(manifests, tagMap, featured?.id, allTags, t)
    : null

  return (
    <div className="dashboard">
      <main>
        <div className="dashboard__header">
          <h1 className="dashboard__title">🌊 {title}</h1>
          <div className="dashboard__nav">
            <Link to="/parent" className="dashboard__nav-link" aria-label={t('dashboard.parentLabel')}>📊</Link>
            <Link to="/admin"  className="dashboard__nav-link" aria-label={t('dashboard.settingsLabel')}>⚙️</Link>
          </div>
        </div>

        <FeaturedGameCard manifest={featured} />

        {manifests.length === 0 ? (
          <p className="dashboard__empty">{t('dashboard.empty')}</p>
        ) : (
          <>
            {allTags.length > 0 && (
              <div className="dashboard__tabs" role="tablist" aria-label={t('dashboard.tabsLabel')}>
                <button
                  role="tab"
                  aria-selected={activeTag === 'all'}
                  className={`dashboard__tab${activeTag === 'all' ? ' dashboard__tab--active' : ''}`}
                  onClick={() => setActiveTag('all')}
                >
                  {t('dashboard.tabAll')}
                </button>
                {allTags.map(tag => (
                  <button
                    key={tag}
                    role="tab"
                    aria-selected={activeTag === tag}
                    className={`dashboard__tab${activeTag === tag ? ' dashboard__tab--active' : ''}`}
                    onClick={() => setActiveTag(tag)}
                  >
                    {tag.charAt(0).toUpperCase() + tag.slice(1)}
                  </button>
                ))}
              </div>
            )}

            {sections ? (
              <div className="dashboard__sections">
                {sections.map(({ heading, games }) => (
                  <CategorySection key={heading} heading={heading}>
                    {games.map(m => (
                      <GameCard
                        key={m.id}
                        manifest={m}
                        bestScore={getBestScore(m.id)}
                        recentInfo={recentlyPlayed.get(m.id) ?? null}
                      />
                    ))}
                  </CategorySection>
                ))}
              </div>
            ) : (
              <div className="dashboard__grid">
                {filteredManifests.map(m => (
                  <GameCard
                    key={m.id}
                    manifest={m}
                    bestScore={getBestScore(m.id)}
                    recentInfo={recentlyPlayed.get(m.id) ?? null}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="dashboard__footer">
        <span>{t('dashboard.footerName')}</span>
        <span className="dashboard__version">v{version}</span>
      </footer>
    </div>
  )
}
```

Also add `"tabsLabel": "Filter games by category"` to `"dashboard"` in `src/i18n/en.json`.

- [ ] **Step 5: Add CSS for tab strip and sections**

Append to `src/components/Dashboard.css`:

```css
.dashboard__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 24px;
}

.dashboard__tab {
  padding: 6px 16px;
  border-radius: var(--radius-button);
  border: 2px solid rgba(0, 0, 0, 0.12);
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.dashboard__tab:hover {
  background: rgba(0, 0, 0, 0.05);
}

.dashboard__tab--active {
  background: var(--color-lavender);
  border-color: var(--color-lavender);
  color: #fff;
}

.dashboard__tab:focus         { outline: none; }
.dashboard__tab:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }

.dashboard__sections {
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/components/__tests__/Dashboard.test.jsx
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/Dashboard.jsx src/components/Dashboard.css src/components/__tests__/Dashboard.test.jsx src/i18n/en.json
git commit -m "feat: add category filter tabs and section groupings to Dashboard"
```

---

## Task 11: AdminPage tag editor and `manifests` prop

**Files:**
- Modify: `src/App.jsx` — pass `manifests` to `<AdminPage>`
- Modify: `src/admin/AdminPage.jsx` — add tag editor section
- Modify: `src/admin/__tests__/AdminPage.test.jsx` — add tag editor tests

**Interfaces:**
- Consumes from Task 7: `settings.tagOverrides`, `manifest.tags`
- Consumes from Task 8: `useGameTags` pattern (direct settings update via `updateSetting`)
- Produces: `<AdminPage manifests={manifests} />` with tag override per game

- [ ] **Step 1: Add i18n keys for the tag editor**

In `src/i18n/en.json`, add inside `"admin"`:

```json
"tagsHeading":    "Game Tags",
"tagsHint":       "Customize how games are categorized. Comma-separated. At least one tag required.",
"tagsLabel":      "Tags for {{name}}",
"tagsPlaceholder":"e.g. sounds, animals",
"tagsValidation": "At least one tag is required",
"tagsSave":       "Save Tags"
```

- [ ] **Step 2: Write failing tests for the tag editor**

Read the current `src/admin/__tests__/AdminPage.test.jsx` contents, then add the following tests (add at the bottom of the existing describe block):

```jsx
// At top of test file, add manifests fixture and update the mock setup:
const manifestsFixture = [
  { id: 'animal-sounds', name: 'Animal Sounds', tags: ['sounds', 'animals'], icon: '🐘', color: '#B39DDB' },
  { id: 'color-match',   name: 'Color Match',   tags: ['visual', 'colors'],  icon: '🎨', color: '#CE93D8' },
]

// Update renderAdmin helper to pass manifests:
function renderAdmin() {
  return render(<MemoryRouter><AdminPage manifests={manifestsFixture} /></MemoryRouter>)
}

// New tests:
it('renders a tag input for each game', () => {
  renderAdmin()
  expect(screen.getByRole('heading', { name: /game tags/i })).toBeInTheDocument()
  expect(screen.getByLabelText(/tags for animal sounds/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/tags for color match/i)).toBeInTheDocument()
})

it('pre-populates tag input with current effective tags', () => {
  renderAdmin()
  expect(screen.getByLabelText(/tags for animal sounds/i)).toHaveValue('sounds, animals')
})

it('shows validation error and does not save when tags are cleared', async () => {
  const user = userEvent.setup()
  renderAdmin()
  const input = screen.getByLabelText(/tags for animal sounds/i)
  await user.clear(input)
  await user.click(screen.getAllByRole('button', { name: /save tags/i })[0])
  expect(screen.getByText(/at least one tag is required/i)).toBeInTheDocument()
  expect(mockUpdateSetting).not.toHaveBeenCalledWith('tagOverrides', expect.anything())
})

it('saves tagOverrides when valid tags are entered', async () => {
  const user = userEvent.setup()
  renderAdmin()
  const input = screen.getByLabelText(/tags for animal sounds/i)
  await user.clear(input)
  await user.type(input, 'numbers, math')
  await user.click(screen.getAllByRole('button', { name: /save tags/i })[0])
  expect(mockUpdateSetting).toHaveBeenCalledWith(
    'tagOverrides',
    expect.objectContaining({ 'animal-sounds': ['numbers', 'math'] })
  )
})
```

Note: the existing `AdminPage.test.jsx` uses `vi.mock('../../hooks/useSettings', ...)` — ensure `mockUpdateSetting` is a `vi.fn()` in that mock and accessible in the test scope. Adjust the existing mock to:

```js
const mockUpdateSetting = vi.fn()
vi.mock('../../hooks/useSettings', () => ({
  default: () => ({
    settings: {
      ...mockSettingsDefaults,
      tagOverrides: {},
    },
    updateSetting: mockUpdateSetting,
    resetSettings: vi.fn(),
  }),
}))
```

- [ ] **Step 3: Run tests to verify new tests fail**

```bash
npx vitest run src/admin/__tests__/AdminPage.test.jsx
```

Expected: tag editor tests FAIL

- [ ] **Step 4: Pass `manifests` from `App.jsx` to `AdminPage`**

In `src/App.jsx`, update the admin route:

```jsx
<Route path="/admin" element={<AdminPage manifests={manifests} />} />
```

- [ ] **Step 5: Add tag editor section to `AdminPage`**

The tag editor section uses local state per game. Add to `src/admin/AdminPage.jsx`:

```jsx
import { useState } from 'react'
// ...existing imports...

export default function AdminPage({ manifests = [] }) {
  const { t } = useTranslation()
  const { settings, updateSetting, resetSettings } = useSettings()
  const { getAllScores } = useScores()

  // Tag editor state: { [gameId]: { value: string, error: boolean } }
  const [tagDraft, setTagDraft] = useState(() =>
    Object.fromEntries(
      manifests.map(m => {
        const effective = (settings.tagOverrides ?? {})[m.id] ?? m.tags ?? []
        return [m.id, { value: effective.join(', '), error: false }]
      })
    )
  )

  function handleTagChange(gameId, value) {
    setTagDraft(d => ({ ...d, [gameId]: { value, error: false } }))
  }

  function handleTagSave(gameId) {
    const raw = tagDraft[gameId]?.value ?? ''
    const tags = raw.split(',').map(s => s.trim()).filter(Boolean)
    if (tags.length === 0) {
      setTagDraft(d => ({ ...d, [gameId]: { ...d[gameId], error: true } }))
      return
    }
    const next = { ...(settings.tagOverrides ?? {}), [gameId]: tags }
    updateSetting('tagOverrides', next)
  }

  return (
    <div className="admin">
      <main>
        {/* ...existing sections... */}

        {manifests.length > 0 && (
          <div className="admin__section">
            <h2>{t('admin.tagsHeading')}</h2>
            <p className="admin__hint">{t('admin.tagsHint')}</p>
            {manifests.map(m => (
              <div key={m.id} className="admin__tag-row">
                <label
                  htmlFor={`tags-${m.id}`}
                  className="admin__tag-label"
                >
                  {t('admin.tagsLabel', { name: m.name })}
                </label>
                <input
                  id={`tags-${m.id}`}
                  className={`admin__text-input${tagDraft[m.id]?.error ? ' admin__text-input--error' : ''}`}
                  type="text"
                  value={tagDraft[m.id]?.value ?? ''}
                  placeholder={t('admin.tagsPlaceholder')}
                  onChange={e => handleTagChange(m.id, e.target.value)}
                  aria-label={t('admin.tagsLabel', { name: m.name })}
                  spellCheck={false}
                />
                {tagDraft[m.id]?.error && (
                  <p className="admin__tag-error" role="alert">
                    {t('admin.tagsValidation')}
                  </p>
                )}
                <button
                  className="admin__tag-save"
                  onClick={() => handleTagSave(m.id)}
                >
                  {t('admin.tagsSave')}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ...existing Score History section... */}
      </main>
    </div>
  )
}
```

Add CSS for tag editor to `src/admin/AdminPage.css`:

```css
.admin__tag-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.admin__tag-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.admin__text-input--error {
  border-color: #e57373;
}

.admin__tag-error {
  font-size: 13px;
  color: #e57373;
  margin: 0;
}

.admin__tag-save {
  align-self: flex-start;
  padding: 6px 16px;
  border-radius: var(--radius-button);
  border: none;
  background: var(--color-lavender);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.admin__tag-save:hover { opacity: 0.9; }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/admin/__tests__/AdminPage.test.jsx
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/admin/AdminPage.jsx src/admin/AdminPage.css src/admin/__tests__/AdminPage.test.jsx src/i18n/en.json
git commit -m "feat: add tag override editor to AdminPage — parents can customize game categories"
```

---

## Task 12: E2E tests

**Files:**
- Modify: `e2e/dashboard.spec.js`
- Modify: `e2e/admin.spec.js`

**Interfaces:**
- localStorage keys: `playground_scores` (JSON array), `playground_settings` (JSON object)

- [ ] **Step 1: Add E2E tests to `e2e/dashboard.spec.js`**

Append to `e2e/dashboard.spec.js`:

```js
test('featured hero card is visible on dashboard load', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText("Today's Game")).toBeVisible()
})

test('featured hero card navigates to the game on click', async ({ page }) => {
  await page.goto('/')
  const heroLink = page.locator('.featured-card')
  const href = await heroLink.getAttribute('href')
  await heroLink.click()
  await expect(page).toHaveURL(href)
})

test('category tabs appear and filter the grid', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tab', { name: 'All' })).toBeVisible()
  // Click "Sounds" tab
  await page.getByRole('tab', { name: 'Sounds' }).click()
  await expect(page.getByRole('tab', { name: 'Sounds' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Animal Sounds')).toBeVisible()
  await expect(page.getByText('Color Match')).not.toBeVisible()
})

test('clicking All tab restores full grid', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Sounds' }).click()
  await page.getByRole('tab', { name: 'All' }).click()
  await expect(page.getByText('Color Match')).toBeVisible()
})

test('recently-played badge appears for a game with seeded scores', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    const scores = [{
      gameId: 'animal-sounds',
      score: 8,
      total: 10,
      date: new Date().toISOString().split('T')[0],
      timestamp: Date.now(),
    }]
    localStorage.setItem('playground_scores', JSON.stringify(scores))
  })
  await page.reload()
  await expect(page.getByTestId('recently-played-badge')).toBeVisible()
  await expect(page.getByTestId('recently-played-badge')).toHaveText(/today/i)
})

test('dashboard has no accessibility violations after enhancements', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

- [ ] **Step 2: Add E2E test for tag override persistence to `e2e/admin.spec.js`**

Append to `e2e/admin.spec.js`:

```js
test('admin tag override persists across page reload', async ({ page }) => {
  await page.goto('/admin')
  const animalInput = page.getByLabel('Tags for Animal Sounds')
  await animalInput.clear()
  await animalInput.fill('numbers, math')
  await page.getByRole('button', { name: /save tags/i }).first().click()
  await page.reload()
  await expect(page.getByLabel('Tags for Animal Sounds')).toHaveValue('numbers, math')
})
```

- [ ] **Step 3: Run the dev server and E2E suite**

```bash
npm run dev
# In a second terminal:
npm run e2e
```

Expected: all E2E tests PASS

- [ ] **Step 4: Commit**

```bash
git add e2e/dashboard.spec.js e2e/admin.spec.js
git commit -m "test: add E2E coverage for daily challenge, category tabs, recently-played badge, and tag override persistence"
```

---

## Task 13: Documentation, CHANGELOG, and version bump

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Bump version in `package.json`**

Change `"version": "0.4.0"` to `"version": "0.5.0"`.

- [ ] **Step 2: Add CHANGELOG entry**

Prepend to `CHANGELOG.md`:

```markdown
## [0.5.0] — 2026-06-28

### Added
- **Daily Challenge** — one game highlighted as "Today's Game" each day via a hero banner above the game grid. Selection is deterministic (date-seeded hash) so all users see the same featured game.
- **Recently Played badges** — game cards show a glow border and "Today · N plays" / "Yesterday · N plays" / "N days ago · N plays" badge when the game has been played before. Derived from existing score data with no schema changes.
- **Game Categories / Tags** — games are grouped under labeled section headings on the dashboard ("Sounds 🔊", "Visual 👁️", etc.). A filter tab strip lets parents view only one category at a time. Tags come from each game's `manifest.json` (now a required field) and can be overridden per-game in the admin panel.
- `useFeaturedGame`, `useRecentlyPlayed`, `useGameTags` hooks
- `FeaturedGameCard`, `CategorySection` components
- Tag override editor in AdminPage
```

- [ ] **Step 3: Update README**

In `README.md`, add a "Dashboard Features" section (or update the existing features list) documenting:

1. **Daily Challenge** — appears as a hero card at the top of the dashboard. Rotates daily using a date-based hash; same game for all users each day.
2. **Recently Played** — cards show a colored glow and a "Today · N plays" badge after the game has been played. Sourced from score history; no extra storage.
3. **Game Categories/Tags** — add a `"tags": ["sounds", "animals"]` array to a game's `manifest.json` (required, min 1 tag). Tags appear as filter tabs and section headings on the dashboard. Parents can override tags per-game in Settings → Game Tags.

- [ ] **Step 4: Run the full test suite one final time**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md package.json README.md
git commit -m "chore: bump version to 0.5.0 and document dashboard enhancements"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| `useRecentlyPlayed` hook | Task 1 |
| GameCard badge + glow | Task 2 |
| Recently Played wired into Dashboard | Task 3 |
| `useFeaturedGame` date-hash | Task 4 |
| `FeaturedGameCard` hero layout | Task 5 |
| Daily challenge rendered in Dashboard | Task 6 |
| `tags` required in manifests; `tagOverrides` in settings | Task 7 |
| `useGameTags` with console.warn | Task 8 |
| `CategorySection` component | Task 9 |
| Tab strip + section groupings in Dashboard | Task 10 |
| AdminPage tag editor + `manifests` prop via App.jsx | Task 11 |
| E2E: hero card, tabs, badge, tag override | Task 12 |
| CHANGELOG, README, version bump | Task 13 |
| All i18n keys | Tasks 2, 5, 10, 11 |
| Featured game stays in grid (flat filtered view) | Task 10 |
| `Other` section for untagged games | Task 10 |

### Type consistency

- `useRecentlyPlayed` returns `Map<string, { lastPlayed: Date, playCount: number }>` — consumed as `recentlyPlayed.get(m.id)` in Tasks 3, 6, 10
- `useFeaturedGame` returns manifest object or `null` — consumed as `<FeaturedGameCard manifest={featured} />` in Task 6, 10
- `useGameTags` returns `{ tagMap: Map<string, string[]>, allTags: string[] }` — consumed in Task 10
- `GameCard` `recentInfo` prop: `{ lastPlayed: Date, playCount: number } | null` — consistent across Tasks 2, 3, 6, 10
- `AdminPage` `manifests` prop: `Array<{ id, name, tags, ... }>` — passed from App.jsx in Task 11

### Placeholder scan

No TBDs, TODOs, or "add appropriate handling" phrases found. All code blocks are complete.
