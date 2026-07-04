# Kids' "My Progress" Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give kids their own page (`/my-progress`) to see per-game badges and simple stats (best score, best streak, total played), separate from the existing admin Badge Gallery (`/admin`, stays untouched) and the parent analytics dashboard (`/parent`, stays untouched).

**Architecture:** A new `src/kids/KidsProgressPage.jsx` (+ `.css`), following the exact data-sourcing pattern `ParentDashboard.jsx`/`AdminPage.jsx` already use (`useScores`, `useBadges`, `adapter.getBestStreaks()` on mount) and the exact "local subcomponents in one file" pattern `ParentDashboard.jsx` uses for its sections. One new pure utility, `computeBestAccuracy`, computes the best-accuracy stat. No new storage adapter methods, no new hooks — everything needed is already tracked.

**Tech Stack:** React + Vite, react-router-dom, react-i18next, Vitest + React Testing Library + jsdom + jest-axe, Playwright (E2E + visual regression), Storybook.

## Global Constraints

- All user-facing strings go through `src/i18n/en.json` and `useTranslation()` — never hardcode literal English strings in JSX (per `docs/TESTING.md`'s i18n convention).
- Use CSS custom properties (`var(--color-*)`, `var(--radius-*)`) from `src/index.css` — never hardcode hex colors (per `CLAUDE.md`).
- No new storage adapter methods — `getAllScores`, `badgeData` (via `useBadges`), and `adapter.getBestStreaks()` already provide everything needed.
- The existing `/admin` Badge Gallery (`src/components/BadgeGallery.jsx` and its tests) is NOT modified — it keeps its own "Locked" text-label treatment.
- The existing `/parent` `ParentDashboard.jsx` is NOT modified.
- Locked badges on the new page show a dimmed/grayscale icon with **no visible text**, conveyed to assistive tech only via `aria-label` — per the approved design spec (`docs/superpowers/specs/2026-07-04-kids-progress-page-design.md`).
- Version bump `0.8.0` → `0.9.0` in `package.json`, with a matching `CHANGELOG.md` entry, per `CLAUDE.md`'s versioning convention.

---

### Task 1: `computeBestAccuracy` utility

**Files:**
- Create: `src/utils/kidStats.js`
- Test: `src/utils/__tests__/kidStats.test.js`

**Interfaces:**
- Produces: `computeBestAccuracy(scores: Score[], gameId: string) → number | null` — the best (highest) rounded accuracy percentage across that game's sessions, or `null` if there are no eligible sessions. A session is eligible only if `s.gameId === gameId` and `s.total > 0`.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/kidStats.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { computeBestAccuracy } from '../kidStats'

describe('computeBestAccuracy', () => {
  it('returns the highest rounded accuracy percentage across a game\'s sessions', () => {
    const scores = [
      { gameId: 'animal-sounds', score: 9, total: 10 },
      { gameId: 'animal-sounds', score: 6, total: 10 },
      { gameId: 'color-match',   score: 10, total: 10 },
    ]
    expect(computeBestAccuracy(scores, 'animal-sounds')).toBe(90)
  })

  it('rounds a fractional percentage to the nearest whole number', () => {
    const scores = [{ gameId: 'animal-sounds', score: 2, total: 3 }] // 66.666...%
    expect(computeBestAccuracy(scores, 'animal-sounds')).toBe(67)
  })

  it('returns null for an empty scores array', () => {
    expect(computeBestAccuracy([], 'animal-sounds')).toBeNull()
  })

  it('returns null when no session matches the given gameId', () => {
    const scores = [{ gameId: 'color-match', score: 8, total: 10 }]
    expect(computeBestAccuracy(scores, 'animal-sounds')).toBeNull()
  })

  it('skips a session with total 0 instead of producing NaN/Infinity', () => {
    const scores = [
      { gameId: 'animal-sounds', score: 0, total: 0 },
      { gameId: 'animal-sounds', score: 5, total: 10 },
    ]
    expect(computeBestAccuracy(scores, 'animal-sounds')).toBe(50)
  })

  it('returns null when every matching session has total 0', () => {
    const scores = [{ gameId: 'animal-sounds', score: 0, total: 0 }]
    expect(computeBestAccuracy(scores, 'animal-sounds')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/kidStats.test.js`
Expected: FAIL — `Failed to resolve import "../kidStats"` (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/utils/kidStats.js`:

```js
/**
 * Best (highest) rounded accuracy percentage across a game's recorded sessions.
 * Returns null if there are no eligible sessions for that game.
 */
export function computeBestAccuracy(scores, gameId) {
  const percentages = scores
    .filter(s => s.gameId === gameId && s.total > 0)
    .map(s => Math.round((s.score / s.total) * 100))

  return percentages.length > 0 ? Math.max(...percentages) : null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/kidStats.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/kidStats.js src/utils/__tests__/kidStats.test.js
git commit -m "feat: add computeBestAccuracy utility for kids progress page"
```

---

### Task 2: `KidsProgressPage` component

**Files:**
- Create: `src/kids/KidsProgressPage.jsx`
- Create: `src/kids/KidsProgressPage.css`
- Test: `src/kids/__tests__/KidsProgressPage.test.jsx`
- Modify: `src/i18n/en.json` — add a new top-level `"kids"` namespace

**Interfaces:**
- Consumes: `computeBestAccuracy(scores, gameId)` from Task 1 (`../utils/kidStats`); `BADGE_CATALOG` from `src/lib/badges.js` (array of `{ id, icon, nameKey }`, 8 entries); `useScores()` → `{ getAllScores() }`; `useBadges()` → `{ badgeData: { awards, lifetimeQuestions } }`; `adapter` default export from `src/storage/index.js` → `getBestStreaks(): Promise<{ [gameId]: number }>`.
- Produces: `KidsProgressPage` default export, prop `manifests` (array of `{ id, name, icon, color }`, default `[]`) — consumed by Task 3's route.

- [ ] **Step 1: Add the `kids` i18n namespace**

In `src/i18n/en.json`, add a new top-level key (after `"scoreHistory"`, before `"animalSounds"` — anywhere at the top level works, but keep it near the other page namespaces for readability):

```json
  "kids": {
    "title": "🌟 My Progress",
    "back": "Back to dashboard",
    "statBestScore": "Best Score",
    "statBestStreak": "Best Streak",
    "statTotalPlayed": "Total Played",
    "badgeEarned": "{{name}} — earned",
    "badgeLocked": "{{name}} — locked"
  },
```

(Remember the trailing comma after the previous key's closing brace, and no trailing comma after this block if it's the last key before the next namespace — check the file's actual formatting before saving.)

- [ ] **Step 2: Write the failing component tests**

Create `src/kids/__tests__/KidsProgressPage.test.jsx`:

```jsx
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import KidsProgressPage from '../KidsProgressPage'

const mockGetBestStreaks = vi.fn()

vi.mock('../../storage/index', () => ({
  default: {
    getBestStreaks: () => mockGetBestStreaks(),
  },
}))

const mockGetAllScores = vi.fn()

vi.mock('../../hooks/useScores', () => ({
  default: () => ({ getAllScores: mockGetAllScores }),
}))

let mockBadgeData

vi.mock('../../hooks/useBadges', () => ({
  default: () => ({ badgeData: mockBadgeData }),
}))

const manifestsFixture = [
  { id: 'animal-sounds', name: 'Animal Sounds', icon: '🐘', color: '#B39DDB' },
  { id: 'color-match',   name: 'Color Match',   icon: '🎨', color: '#CE93D8' },
]

function renderPage() {
  return render(<MemoryRouter><KidsProgressPage manifests={manifestsFixture} /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBestStreaks.mockResolvedValue({})
  mockGetAllScores.mockReturnValue([])
  mockBadgeData = { awards: {}, lifetimeQuestions: {} }
})

// ─── With progress data ──────────────────────────────────────────────────────

describe('KidsProgressPage — with progress data', () => {
  beforeEach(() => {
    mockGetBestStreaks.mockResolvedValue({ 'animal-sounds': 7 })
    mockGetAllScores.mockReturnValue([
      { gameId: 'animal-sounds', score: 9, total: 10, date: '2026-07-01', timestamp: 1 },
      { gameId: 'animal-sounds', score: 6, total: 10, date: '2026-07-02', timestamp: 2 },
    ])
    mockBadgeData = {
      awards: { 'animal-sounds': { hotStreak: 3 } },
      lifetimeQuestions: { 'animal-sounds': 62 },
    }
  })

  it('renders the page title', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /my progress/i })).toBeInTheDocument()
  })

  it('renders a back link pointing to /', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/')
  })

  it('renders one section per manifest', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /animal sounds/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /color match/i })).toBeInTheDocument()
  })

  it('shows the best accuracy stat computed from scores', () => {
    renderPage()
    const section = screen.getByRole('heading', { name: /animal sounds/i }).closest('section')
    expect(within(section).getByText('90%')).toBeInTheDocument()
  })

  it('shows the best streak stat resolved from adapter.getBestStreaks', async () => {
    renderPage()
    const section = screen.getByRole('heading', { name: /animal sounds/i }).closest('section')
    expect(await within(section).findByText('7')).toBeInTheDocument()
  })

  it('shows the lifetime total-played stat', () => {
    renderPage()
    const section = screen.getByRole('heading', { name: /animal sounds/i }).closest('section')
    expect(within(section).getByText('62')).toBeInTheDocument()
  })

  it('shows an earned badge with its count and no "Locked" text anywhere on the page', () => {
    renderPage()
    expect(screen.getByText('Hot Streak ×3')).toBeInTheDocument()
    expect(screen.queryByText(/Locked/i)).not.toBeInTheDocument()
  })

  it('shows a locked badge with an aria-label ending in "locked" and no visible name text', () => {
    renderPage()
    const section = screen.getByRole('heading', { name: /animal sounds/i }).closest('section')
    const lockedBadge = within(section).getByRole('group', { name: /on fire.*locked/i })
    expect(within(lockedBadge).queryByText('On Fire')).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderPage()
    expect(await axe(container)).toHaveNoViolations()
  })
})

// ─── No data yet ─────────────────────────────────────────────────────────────

describe('KidsProgressPage — no data yet', () => {
  it('shows a dash for best accuracy and zero for streak and total played, without crashing', () => {
    renderPage()
    const section = screen.getByRole('heading', { name: /animal sounds/i }).closest('section')
    expect(within(section).getByText('—')).toBeInTheDocument()
    expect(within(section).getAllByText('0')).toHaveLength(2)
  })

  it('shows every badge as locked', () => {
    renderPage()
    const section = screen.getByRole('heading', { name: /animal sounds/i }).closest('section')
    expect(within(section).getAllByRole('group', { name: /locked/i })).toHaveLength(8) // BADGE_CATALOG has 8 entries
  })

  it('has no accessibility violations in the empty state', async () => {
    const { container } = renderPage()
    expect(await axe(container)).toHaveNoViolations()
  })
})

// ─── Empty manifests ─────────────────────────────────────────────────────────

describe('KidsProgressPage — no games', () => {
  it('renders the title without crashing when manifests is empty', () => {
    render(<MemoryRouter><KidsProgressPage manifests={[]} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /my progress/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/kids/__tests__/KidsProgressPage.test.jsx`
Expected: FAIL — `Failed to resolve import "../KidsProgressPage"` (component doesn't exist yet).

- [ ] **Step 4: Write the component**

Create `src/kids/KidsProgressPage.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useScores from '../hooks/useScores'
import useBadges from '../hooks/useBadges'
import adapter from '../storage/index'
import { computeBestAccuracy } from '../utils/kidStats'
import { BADGE_CATALOG } from '../lib/badges'
import './KidsProgressPage.css'

function StatTile({ icon, value, label }) {
  return (
    <div className="kid-progress__stat">
      <span className="kid-progress__stat-icon" aria-hidden="true">{icon}</span>
      <span className="kid-progress__stat-value">{value}</span>
      <span className="kid-progress__stat-label">{label}</span>
    </div>
  )
}

function BadgeChip({ badge, count, t }) {
  const earned = count > 0
  const name = t(badge.nameKey)
  const ariaLabel = earned
    ? t('kids.badgeEarned', { name })
    : t('kids.badgeLocked', { name })

  return (
    <div
      role="group"
      className={`kid-progress__badge${earned ? '' : ' kid-progress__badge--locked'}`}
      aria-label={ariaLabel}
    >
      <span className="kid-progress__badge-icon" aria-hidden="true">{badge.icon}</span>
      {earned && (
        <span className="kid-progress__badge-name">
          {name}{count > 1 ? ` ×${count}` : ''}
        </span>
      )}
    </div>
  )
}

function GameProgressSection({ manifest, scores, badgeData, bestStreak, t }) {
  const bestAccuracy = computeBestAccuracy(scores, manifest.id)
  const totalPlayed  = badgeData.lifetimeQuestions[manifest.id] ?? 0
  const awards       = badgeData.awards[manifest.id] ?? {}

  return (
    <section
      className="kid-progress__game"
      style={{ borderTop: `6px solid ${manifest.color}` }}
      aria-labelledby={`kid-progress-${manifest.id}`}
    >
      <h2 id={`kid-progress-${manifest.id}`} className="kid-progress__game-name">
        <span aria-hidden="true">{manifest.icon}</span> {manifest.name}
      </h2>

      <div className="kid-progress__stats">
        <StatTile
          icon="🎯"
          value={bestAccuracy != null ? `${bestAccuracy}%` : '—'}
          label={t('kids.statBestScore')}
        />
        <StatTile icon="🔥" value={bestStreak ?? 0} label={t('kids.statBestStreak')} />
        <StatTile icon="🔢" value={totalPlayed} label={t('kids.statTotalPlayed')} />
      </div>

      <div className="kid-progress__badges">
        {BADGE_CATALOG.map(badge => (
          <BadgeChip key={badge.id} badge={badge} count={awards[badge.id] ?? 0} t={t} />
        ))}
      </div>
    </section>
  )
}

export default function KidsProgressPage({ manifests = [] }) {
  const { t } = useTranslation()
  const { getAllScores } = useScores()
  const { badgeData } = useBadges()
  const [bestStreaks, setBestStreaks] = useState({})

  useEffect(() => {
    adapter.getBestStreaks().then(setBestStreaks)
  }, [])

  const scores = getAllScores()

  return (
    <div className="kid-progress">
      <main>
        <div className="kid-progress__header">
          <Link to="/" className="kid-progress__back" aria-label={t('kids.back')}>←</Link>
          <h1 className="kid-progress__title">{t('kids.title')}</h1>
        </div>

        {manifests.map(m => (
          <GameProgressSection
            key={m.id}
            manifest={m}
            scores={scores}
            badgeData={badgeData}
            bestStreak={bestStreaks[m.id]}
            t={t}
          />
        ))}
      </main>
    </div>
  )
}
```

Create `src/kids/KidsProgressPage.css`:

```css
.kid-progress { min-height: 100vh; padding: 24px 16px; }

.kid-progress__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.kid-progress__back {
  font-size: 28px;
  text-decoration: none;
  min-width: 56px;
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-button);
  color: inherit;
}

.kid-progress__back:hover         { background: rgba(0,0,0,0.06); }
.kid-progress__back:focus         { outline: none; }
.kid-progress__back:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }

.kid-progress__title { font-size: 28px; font-weight: 800; color: var(--color-lavender-dark); }

.kid-progress__game {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 20px;
  margin-bottom: 24px;
}

.kid-progress__game-name { font-size: 22px; font-weight: 800; margin-bottom: 16px; }

.kid-progress__stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.kid-progress__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: var(--color-bg);
  border-radius: var(--radius-button);
  padding: 12px 16px;
  min-width: 96px;
}

.kid-progress__stat-icon  { font-size: 28px; }
.kid-progress__stat-value { font-size: 22px; font-weight: 800; color: var(--color-teal-dark); }
.kid-progress__stat-label { font-size: 12px; font-weight: 700; color: var(--color-text-muted); text-align: center; }

.kid-progress__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.kid-progress__badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  border-radius: var(--radius-button);
  border: 2px solid var(--color-aqua);
  min-width: 72px;
  text-align: center;
}

.kid-progress__badge--locked {
  border-color: var(--color-text-muted);
  background: rgba(91, 107, 112, 0.08);
}

.kid-progress__badge--locked .kid-progress__badge-icon { opacity: 0.45; filter: grayscale(100%); }

.kid-progress__badge-icon { font-size: 32px; }
.kid-progress__badge-name { font-size: 13px; font-weight: 700; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/kids/__tests__/KidsProgressPage.test.jsx`
Expected: PASS (13 tests)

- [ ] **Step 6: Commit**

```bash
git add src/kids/KidsProgressPage.jsx src/kids/KidsProgressPage.css src/kids/__tests__/KidsProgressPage.test.jsx src/i18n/en.json
git commit -m "feat: add KidsProgressPage component with per-game stats and badges"
```

---

### Task 3: Wire up routing and dashboard navigation

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Dashboard.jsx`
- Modify: `src/components/__tests__/Dashboard.test.jsx`
- Modify: `src/i18n/en.json` — add `dashboard.myProgressLabel`

**Interfaces:**
- Consumes: `KidsProgressPage` from Task 2 (`./kids/KidsProgressPage` relative to `App.jsx`).
- Produces: route `/my-progress`; a `🌟` link in `Dashboard.jsx`'s nav row with `href="/my-progress"` — no later task consumes this directly, but Task 5's E2E spec exercises it.

- [ ] **Step 1: Add the nav-label string**

In `src/i18n/en.json`, inside the existing `"dashboard"` block, add a new key after `"parentLabel"`:

```json
    "parentLabel": "📊 Progress Dashboard",
    "myProgressLabel": "🌟 My Progress",
```

- [ ] **Step 2: Write the failing Dashboard test**

In `src/components/__tests__/Dashboard.test.jsx`, add this test right after the existing `'renders the parent dashboard link'` test (around line 64):

```jsx
  it('renders the my progress link', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /🌟/i })).toHaveAttribute('href', '/my-progress')
  })
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/Dashboard.test.jsx`
Expected: FAIL — `TestingLibraryElementError: Unable to find an accessible element with the role "link" and name /🌟/i`

- [ ] **Step 4: Add the route in `App.jsx`**

In `src/App.jsx`, add the import near the other page imports (after `import ParentDashboard from './parent/ParentDashboard'`):

```jsx
import KidsProgressPage from './kids/KidsProgressPage'
```

Add the route inside `<Routes>`, after the `/parent` route:

```jsx
        <Route path="/my-progress" element={<KidsProgressPage manifests={manifests} />} />
```

- [ ] **Step 5: Add the nav link in `Dashboard.jsx`**

In `src/components/Dashboard.jsx`, inside `.dashboard__nav`, add a third link after the existing `📊` link (around line 70-71):

```jsx
            <Link to="/parent" className="dashboard__nav-link" aria-label={t('dashboard.parentLabel')}>📊</Link>
            <Link to="/my-progress" className="dashboard__nav-link" aria-label={t('dashboard.myProgressLabel')}>🌟</Link>
            <Link to="/admin"  className="dashboard__nav-link" aria-label={t('dashboard.settingsLabel')}>⚙️</Link>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/Dashboard.test.jsx`
Expected: PASS (all Dashboard tests, including the new one)

- [ ] **Step 7: Manually verify the route in dev**

Run: `npm run dev` (leave running), then in a browser navigate to `http://localhost:5173/` and confirm the `🌟` icon appears in the header and clicking it navigates to `/my-progress`, which renders `KidsProgressPage`. Stop the dev server afterward.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/components/Dashboard.jsx src/components/__tests__/Dashboard.test.jsx src/i18n/en.json
git commit -m "feat: wire up /my-progress route and dashboard nav link"
```

---

### Task 4: Storybook story and visual regression baseline

**Files:**
- Create: `src/kids/KidsProgressPage.stories.jsx`
- Modify: `e2e/visual.spec.js`

**Interfaces:**
- Consumes: `KidsProgressPage` from Task 2.
- Produces: Storybook story id `pages-kidsprogresspage--default`, registered in `e2e/visual.spec.js`'s `stories` array; a committed baseline screenshot.

- [ ] **Step 1: Write the story**

Create `src/kids/KidsProgressPage.stories.jsx`:

```jsx
import { MemoryRouter } from 'react-router-dom'
import KidsProgressPage from './KidsProgressPage'

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds', icon: '🐘', color: '#B39DDB' },
  { id: 'color-match',   name: 'Color Match',   icon: '🎨', color: '#CE93D8' },
]

export default {
  title: 'Pages/KidsProgressPage',
  component: KidsProgressPage,
  decorators: [Story => <MemoryRouter><Story /></MemoryRouter>],
}

export const Default = { args: { manifests } }
```

- [ ] **Step 2: Verify the story renders in Storybook**

Run: `npm run storybook` (leave running), open `http://localhost:6006`, navigate to "Pages / KidsProgressPage / Default" in the sidebar, and confirm it renders without an error overlay (game sections all show locked badges and zero/dash stats, since Storybook reads from real, empty `localStorage`). Stop Storybook afterward.

- [ ] **Step 3: Register the story in the visual regression suite**

In `e2e/visual.spec.js`, add `'pages-kidsprogresspage--default'` to the `stories` array, after `'pages-adminpage--default'`:

```js
  'pages-adminpage--default',
  'pages-kidsprogresspage--default',
```

- [ ] **Step 4: Generate and commit the baseline screenshot**

Run: `npx playwright test visual.spec.js --update-snapshots`
Expected: a new `pages-kidsprogresspage--default.png` file is created under `e2e/visual.spec.js-snapshots/`. Review it visually (open the PNG) to confirm it shows the expected layout — game sections with stat tiles and badge chips, locked badges dimmed with no text.

- [ ] **Step 5: Run the full visual suite to confirm it passes**

Run: `npx playwright test visual.spec.js`
Expected: PASS (all stories, including the new one)

- [ ] **Step 6: Commit**

```bash
git add src/kids/KidsProgressPage.stories.jsx e2e/visual.spec.js "e2e/visual.spec.js-snapshots/pages-kidsprogresspage--default.png"
git commit -m "test: add KidsProgressPage Storybook story and visual regression baseline"
```

---

### Task 5: End-to-end coverage

**Files:**
- Create: `e2e/kids-progress.spec.js`

**Interfaces:**
- Consumes: the `/my-progress` route and `🌟` dashboard nav link from Task 3.

- [ ] **Step 1: Write the E2E spec**

Create `e2e/kids-progress.spec.js`:

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('my progress nav link navigates from the dashboard', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /my progress/i }).click()
  await expect(page).toHaveURL('/my-progress')
})

test('my progress page shows a section per game', async ({ page }) => {
  await page.goto('/my-progress')
  await expect(page.getByRole('heading', { name: 'Animal Sounds' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Color Match' })).toBeVisible()
})

test('direct navigation to /my-progress works (SPA fallback)', async ({ page }) => {
  await page.goto('/my-progress')
  await expect(page.getByRole('heading', { name: /my progress/i })).toBeVisible()
})

test('my progress page has no accessibility violations', async ({ page }) => {
  await page.goto('/my-progress')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

- [ ] **Step 2: Run the new spec**

Run: `npx playwright test kids-progress.spec.js`
Expected: PASS (4 tests). If the `my progress nav link` test fails to match the link by accessible name, verify the running app is picking up Task 3's changes (restart the Playwright-managed dev server if needed — see `docs/TESTING.md`'s E2E section for how `npm run e2e` starts `npm run dev` automatically).

- [ ] **Step 3: Run the full E2E suite**

Run: `npm run e2e`
Expected: PASS (all specs, including the new one, with no regressions in `dashboard.spec.js`, `admin.spec.js`, etc.)

- [ ] **Step 4: Commit**

```bash
git add e2e/kids-progress.spec.js
git commit -m "test: add e2e coverage for the kids My Progress page"
```

---

### Task 6: Documentation and versioning

**Files:**
- Modify: `README.md`
- Modify: `docs/ENHANCEMENTS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Update `README.md`'s Features list**

Add a new bullet to the `## Features` list (after the `**Admin / Settings**` bullet, around line 11):

```markdown
- **My Progress page** — a kid-facing `/my-progress` page (🌟 link on the dashboard) showing each game's best score, best streak, total questions answered, and earned badges, with locked badges shown dimmed rather than as unreadable text; separate from the parent-facing `/parent` analytics dashboard and the admin `/admin` settings page
```

- [ ] **Step 2: Add a "My Progress Page" subsection**

Under `## Dashboard Features` (after the `### How-to-Play Intro` section, around line 42-44), add:

```markdown
### My Progress Page

A dedicated `/my-progress` page, linked via the 🌟 button on the main dashboard, shows kids their own progress: for each game, a best-score percentage, best streak, and lifetime questions answered, plus every milestone badge earned so far. Locked badges are shown as dimmed icons with no text label (rather than the admin page's "Locked" text), since the intended audience can't read yet — earned/locked state is still conveyed to assistive tech via each badge's `aria-label`.
```

- [ ] **Step 3: Update the Docker section's route example**

In `README.md`'s Docker section (around line 195), update:

```markdown
The production image is a two-stage build: a Node LTS container compiles `dist/`, then a lean `nginx:alpine` container (~25 MB) serves the static files. `nginx.conf` includes an SPA fallback (`try_files`) so React Router routes like `/admin`, `/my-progress`, and `/game/animal-sounds` work on direct navigation and page refresh.
```

- [ ] **Step 4: Add the `docs/ENHANCEMENTS.md` entry**

In `docs/ENHANCEMENTS.md`, under `## Recently Completed`, add a new entry above `### v0.8.0 — ...` (so it reads newest-first):

```markdown
### v0.9.0 — Kids' "My Progress" Page (2026-07-04)
- **`/my-progress` route** — a kid-facing progress page, linked via a new 🌟 button on the main dashboard, separate from the existing admin Badge Gallery (`/admin`) and parent analytics dashboard (`/parent`), both of which are unchanged
- **Per-game stat tiles** — best accuracy %, best streak, and lifetime questions answered, shown with icons rather than text-heavy tables
- **Toddler-legible badge display** — locked badges are dimmed/grayscale icons with no text label (vs. the admin gallery's "Locked" text), with locked/earned state still exposed to assistive tech via `aria-label`
- `computeBestAccuracy` pure utility function in `src/utils/kidStats.js`
```

- [ ] **Step 5: Add the `CHANGELOG.md` entry**

In `CHANGELOG.md`, add a new section above `## [0.8.0] - 2026-07-03`:

```markdown
## [0.9.0] - 2026-07-04

### Added
- **Kids' "My Progress" page** (`/my-progress`) — a kid-facing page, linked via a new 🌟 dashboard button, showing per-game best accuracy %, best streak, lifetime questions answered, and every milestone badge earned so far. Locked badges show a dimmed/grayscale icon with no text label (unlike the admin Badge Gallery's "Locked" text), since the target audience can't read; locked/earned state is still exposed to assistive tech via each badge's `aria-label`.
- `computeBestAccuracy` pure utility function (`src/utils/kidStats.js`).
- `KidsProgressPage` component (`src/kids/`).
```

- [ ] **Step 6: Bump the version**

In `package.json`, change:

```json
  "version": "0.8.0",
```

to:

```json
  "version": "0.9.0",
```

- [ ] **Step 7: Verify the footer picks up the new version**

Run: `npm run dev` (leave running), open `http://localhost:5173/`, and confirm the dashboard footer shows `v0.9.0`. Stop the dev server afterward.

- [ ] **Step 8: Commit**

```bash
git add README.md docs/ENHANCEMENTS.md CHANGELOG.md package.json
git commit -m "docs: document the kids My Progress page; bump version to 0.9.0"
```

---

## Final verification

- [ ] Run the full unit/component suite: `npm run coverage` — expect all tests passing, including every new file from Tasks 1-3.
- [ ] Run lint: `npm run lint` — expect no errors.
- [ ] Run the full E2E + visual suite: `npm run e2e` — expect all specs passing, including `kids-progress.spec.js` and the new Storybook story screenshot.
- [ ] Run the Storybook production build check: `npm run build-storybook` — expect it to complete without errors.
