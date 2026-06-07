# ThePlayground Infant Game Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React + Vite infant game dashboard with an Animal Sounds game, plugin-based game discovery, localStorage scoring via a swappable adapter, and a parent-facing admin settings page.

**Architecture:** Games live in `src/games/<id>/` with a `manifest.json` + `index.jsx`; Vite's `import.meta.glob` auto-discovers them at build time. Storage is abstracted behind an adapter interface so localStorage can be swapped for a backend later. All hooks depend only on the adapter interface, never on localStorage directly.

**Tech Stack:** React 18, Vite, React Router v6, Vitest, @testing-library/react, @testing-library/user-event, jsdom

---

### Task 1: Scaffold the project

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `src/main.jsx`
- Create: `src/App.jsx` (stub)
- Create: `src/index.css`

- [ ] **Step 1: Initialise Vite + React project**

Run from `ThePlayground/` directory:
```bash
npm create vite@latest . -- --template react
```
When prompted about non-empty directory, choose to continue.

- [ ] **Step 2: Install dependencies**

```bash
npm install react-router-dom
npm install --save-dev vitest @vitest/coverage-v8 @testing-library/react @testing-library/user-event jsdom
```

- [ ] **Step 3: Configure Vitest in `vite.config.js`**

Replace the file contents:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.js',
  },
})
```

- [ ] **Step 4: Create `src/test-setup.js`**

```js
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Install jest-dom**

```bash
npm install --save-dev @testing-library/jest-dom
```

- [ ] **Step 6: Add npm scripts to `package.json`**

Merge these into the `"scripts"` section (keep existing ones):
```json
"test": "vitest",
"coverage": "vitest run --coverage"
```

- [ ] **Step 7: Replace `src/index.css` with the design system**

```css
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap');

:root {
  --color-aqua:     #80DEEA;
  --color-teal:     #80CBC4;
  --color-lavender: #B39DDB;
  --color-lilac:    #CE93D8;
  --color-bg:       #F0FDFF;
  --color-surface:  #FFFFFF;
  --color-text:     #37474F;
  --radius-card:    20px;
  --radius-button:  16px;
  --font-main:      'Nunito', sans-serif;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-main);
  background: var(--color-bg);
  color: var(--color-text);
  min-height: 100vh;
  font-size: 18px;
}

button {
  cursor: pointer;
  font-family: var(--font-main);
  font-size: 18px;
  border: none;
  border-radius: var(--radius-button);
  min-width: 64px;
  min-height: 64px;
}

@keyframes pulse-green {
  0%   { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
  70%  { box-shadow: 0 0 0 16px rgba(76, 175, 80, 0); }
  100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
}

@keyframes shake-red {
  0%, 100% { transform: translateX(0); background: inherit; }
  20%       { transform: translateX(-8px); background: #ef9a9a; }
  40%       { transform: translateX(8px);  background: #ef9a9a; }
  60%       { transform: translateX(-8px); background: #ef9a9a; }
  80%       { transform: translateX(8px);  background: #ef9a9a; }
}

.correct { animation: pulse-green 0.6s ease forwards; background: #a5d6a7 !important; }
.wrong   { animation: shake-red   0.6s ease forwards; }
.highlight-correct { background: #a5d6a7 !important; }
```

- [ ] **Step 8: Stub `src/App.jsx`**

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div>Dashboard coming soon</div>} />
        <Route path="/admin" element={<div>Admin coming soon</div>} />
        <Route path="/game/:gameId" element={<div>Game coming soon</div>} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 9: Update `src/main.jsx`**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 10: Verify dev server starts**

```bash
npm run dev
```
Expected: Vite dev server running at `http://localhost:5173`. Open it — you should see "Dashboard coming soon".

- [ ] **Step 11: Verify test runner works**

```bash
npm test
```
Expected: "No test files found" or similar — no errors.

- [ ] **Step 12: Commit**

```bash
git init
git add .
git commit -m "chore: scaffold Vite + React project with design system and test setup"
```

---

### Task 2: Storage adapter interface and localStorage implementation

**Files:**
- Create: `src/storage/adapter.js`
- Create: `src/storage/localStorageAdapter.js`
- Create: `src/storage/index.js`

- [ ] **Step 1: Create `src/storage/adapter.js`**

This file documents the interface every adapter must fulfill. It exports the default settings so adapters don't duplicate them.

```js
export const DEFAULT_SETTINGS = {
  numChoices: 2,
  feedbackMode: 'immediate',
  questionsPerSession: 10,
}

/**
 * Storage adapter interface. Every adapter must implement these four async methods.
 *
 * getScores()              → Promise<Score[]>
 * addScore(score)          → Promise<void>
 * getSettings()            → Promise<Settings>
 * saveSettings(settings)   → Promise<void>
 *
 * Score shape:   { gameId, score, total, date, timestamp }
 * Settings shape: { numChoices, feedbackMode, questionsPerSession }
 */
```

- [ ] **Step 2: Create `src/storage/localStorageAdapter.js`**

```js
import { DEFAULT_SETTINGS } from './adapter'

const SCORES_KEY   = 'playground_scores'
const SETTINGS_KEY = 'playground_settings'

const localStorageAdapter = {
  async getScores() {
    try {
      return JSON.parse(localStorage.getItem(SCORES_KEY) || '[]')
    } catch {
      return []
    }
  },

  async addScore(score) {
    const scores = await this.getScores()
    scores.push(score)
    localStorage.setItem(SCORES_KEY, JSON.stringify(scores))
  },

  async getSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
      return { ...DEFAULT_SETTINGS, ...stored }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  },

  async saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  },
}

export default localStorageAdapter
```

- [ ] **Step 3: Create `src/storage/index.js`**

```js
export { default } from './localStorageAdapter'
// To switch adapters in future: replace the above line with your new adapter's path
```

- [ ] **Step 4: Commit**

```bash
git add src/storage/
git commit -m "feat: add storage adapter interface and localStorage implementation"
```

---

### Task 3: useSettings hook

**Files:**
- Create: `src/hooks/useSettings.js`
- Create: `src/hooks/__tests__/useSettings.test.js`

- [ ] **Step 1: Write failing tests in `src/hooks/__tests__/useSettings.test.js`**

```js
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import useSettings from '../useSettings'

const mockAdapter = {
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}

vi.mock('../../storage/index', () => ({ default: mockAdapter }))

beforeEach(() => {
  vi.clearAllMocks()
  mockAdapter.getSettings.mockResolvedValue({
    numChoices: 2,
    feedbackMode: 'immediate',
    questionsPerSession: 10,
  })
  mockAdapter.saveSettings.mockResolvedValue(undefined)
})

describe('useSettings', () => {
  it('loads settings from adapter on mount', async () => {
    const { result } = renderHook(() => useSettings())
    await act(async () => {})
    expect(result.current.settings.numChoices).toBe(2)
    expect(result.current.settings.feedbackMode).toBe('immediate')
  })

  it('updateSetting merges new value and saves', async () => {
    const { result } = renderHook(() => useSettings())
    await act(async () => {})
    await act(async () => {
      await result.current.updateSetting('numChoices', 4)
    })
    expect(result.current.settings.numChoices).toBe(4)
    expect(mockAdapter.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ numChoices: 4 })
    )
  })

  it('resetSettings restores defaults', async () => {
    mockAdapter.getSettings.mockResolvedValue({
      numChoices: 4,
      feedbackMode: 'parent-tap',
      questionsPerSession: 20,
    })
    const { result } = renderHook(() => useSettings())
    await act(async () => {})
    await act(async () => {
      await result.current.resetSettings()
    })
    expect(result.current.settings.numChoices).toBe(2)
    expect(result.current.settings.feedbackMode).toBe('immediate')
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
npm test src/hooks/__tests__/useSettings.test.js
```
Expected: FAIL — `useSettings` not found.

- [ ] **Step 3: Implement `src/hooks/useSettings.js`**

```js
import { useState, useEffect } from 'react'
import adapter from '../storage/index'
import { DEFAULT_SETTINGS } from '../storage/adapter'

export default function useSettings() {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS })

  useEffect(() => {
    adapter.getSettings().then(setSettings)
  }, [])

  async function updateSetting(key, value) {
    const next = { ...settings, [key]: value }
    setSettings(next)
    await adapter.saveSettings(next)
  }

  async function resetSettings() {
    setSettings({ ...DEFAULT_SETTINGS })
    await adapter.saveSettings({ ...DEFAULT_SETTINGS })
  }

  return { settings, updateSetting, resetSettings }
}
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
npm test src/hooks/__tests__/useSettings.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/
git commit -m "feat: add useSettings hook with adapter-backed persistence"
```

---

### Task 4: useScores hook

**Files:**
- Create: `src/hooks/useScores.js`
- Create: `src/hooks/__tests__/useScores.test.js`

- [ ] **Step 1: Write failing tests in `src/hooks/__tests__/useScores.test.js`**

```js
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import useScores from '../useScores'

const mockAdapter = {
  getScores: vi.fn(),
  addScore: vi.fn(),
}

vi.mock('../../storage/index', () => ({ default: mockAdapter }))

const makeScore = (gameId, score, total, timestamp = Date.now()) => ({
  gameId, score, total,
  date: new Date(timestamp).toISOString().split('T')[0],
  timestamp,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockAdapter.addScore.mockResolvedValue(undefined)
})

describe('useScores', () => {
  it('addScore appends a record', async () => {
    mockAdapter.getScores.mockResolvedValue([])
    const { result } = renderHook(() => useScores())
    await act(async () => {})
    await act(async () => {
      await result.current.addScore(makeScore('animal-sounds', 8, 10))
    })
    expect(mockAdapter.addScore).toHaveBeenCalledTimes(1)
  })

  it('getBestScore returns highest score for a game', async () => {
    mockAdapter.getScores.mockResolvedValue([
      makeScore('animal-sounds', 5, 10, 1000),
      makeScore('animal-sounds', 9, 10, 2000),
      makeScore('animal-sounds', 7, 10, 3000),
    ])
    const { result } = renderHook(() => useScores())
    await act(async () => {})
    expect(result.current.getBestScore('animal-sounds')).toBe(9)
  })

  it('getBestScore returns 0 when no scores exist', async () => {
    mockAdapter.getScores.mockResolvedValue([])
    const { result } = renderHook(() => useScores())
    await act(async () => {})
    expect(result.current.getBestScore('animal-sounds')).toBe(0)
  })

  it('getScoresByGame returns only matching scores newest first', async () => {
    mockAdapter.getScores.mockResolvedValue([
      makeScore('animal-sounds', 5, 10, 1000),
      makeScore('colors', 3, 10, 1500),
      makeScore('animal-sounds', 9, 10, 2000),
    ])
    const { result } = renderHook(() => useScores())
    await act(async () => {})
    const scores = result.current.getScoresByGame('animal-sounds')
    expect(scores).toHaveLength(2)
    expect(scores[0].timestamp).toBe(2000)
    expect(scores[1].timestamp).toBe(1000)
  })

  it('getAllScores returns full history', async () => {
    const all = [
      makeScore('animal-sounds', 5, 10, 1000),
      makeScore('colors', 3, 10, 2000),
    ]
    mockAdapter.getScores.mockResolvedValue(all)
    const { result } = renderHook(() => useScores())
    await act(async () => {})
    expect(result.current.getAllScores()).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
npm test src/hooks/__tests__/useScores.test.js
```
Expected: FAIL — `useScores` not found.

- [ ] **Step 3: Implement `src/hooks/useScores.js`**

```js
import { useState, useEffect } from 'react'
import adapter from '../storage/index'

export default function useScores() {
  const [scores, setScores] = useState([])

  useEffect(() => {
    adapter.getScores().then(setScores)
  }, [])

  async function addScore(result) {
    await adapter.addScore(result)
    const updated = await adapter.getScores()
    setScores(updated)
  }

  function getScoresByGame(gameId) {
    return scores
      .filter(s => s.gameId === gameId)
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  function getBestScore(gameId) {
    const game = scores.filter(s => s.gameId === gameId)
    return game.length === 0 ? 0 : Math.max(...game.map(s => s.score))
  }

  function getAllScores() {
    return scores
  }

  return { addScore, getScoresByGame, getBestScore, getAllScores }
}
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
npm test src/hooks/__tests__/useScores.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/
git commit -m "feat: add useScores hook with adapter-backed score persistence"
```

---

### Task 5: GameCard component

**Files:**
- Create: `src/components/GameCard.jsx`
- Create: `src/components/GameCard.css`
- Create: `src/components/__tests__/GameCard.test.jsx`

- [ ] **Step 1: Write failing test in `src/components/__tests__/GameCard.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import GameCard from '../GameCard'

const manifest = {
  id: 'animal-sounds',
  name: 'Animal Sounds',
  description: 'Match the animal to its sound!',
  icon: '🐘',
  color: '#B39DDB',
}

function renderCard(bestScore = 0) {
  return render(
    <MemoryRouter>
      <GameCard manifest={manifest} bestScore={bestScore} />
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
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
npm test src/components/__tests__/GameCard.test.jsx
```
Expected: FAIL — `GameCard` not found.

- [ ] **Step 3: Create `src/components/GameCard.css`**

```css
.game-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px 16px;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  text-decoration: none;
  color: var(--color-text);
  min-height: 180px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.game-card:hover,
.game-card:focus {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  outline: none;
}

.game-card__icon  { font-size: 52px; line-height: 1; }
.game-card__name  { font-size: 22px; font-weight: 800; text-align: center; }
.game-card__desc  { font-size: 15px; text-align: center; opacity: 0.75; }
.game-card__score { font-size: 14px; font-weight: 700; opacity: 0.6; }
```

- [ ] **Step 4: Create `src/components/GameCard.jsx`**

```jsx
import { Link } from 'react-router-dom'
import './GameCard.css'

export default function GameCard({ manifest, bestScore }) {
  const { id, name, description, icon, color } = manifest
  return (
    <Link
      to={`/game/${id}`}
      className="game-card"
      style={{ borderTop: `6px solid ${color}` }}
    >
      <span className="game-card__icon">{icon}</span>
      <span className="game-card__name">{name}</span>
      <span className="game-card__desc">{description}</span>
      {bestScore > 0 && (
        <span className="game-card__score">Best: {bestScore}</span>
      )}
    </Link>
  )
}
```

- [ ] **Step 5: Run tests — expect them to pass**

```bash
npm test src/components/__tests__/GameCard.test.jsx
```
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/
git commit -m "feat: add GameCard component"
```

---

### Task 6: ScoreHistory component

**Files:**
- Create: `src/components/ScoreHistory.jsx`
- Create: `src/components/ScoreHistory.css`
- Create: `src/components/__tests__/ScoreHistory.test.jsx`

- [ ] **Step 1: Write failing test in `src/components/__tests__/ScoreHistory.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ScoreHistory from '../ScoreHistory'

const scores = [
  { gameId: 'animal-sounds', score: 9, total: 10, date: '2026-06-07', timestamp: 2000 },
  { gameId: 'animal-sounds', score: 6, total: 10, date: '2026-06-06', timestamp: 1000 },
]

describe('ScoreHistory', () => {
  it('renders all scores in order', () => {
    render(<ScoreHistory scores={scores} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('9 / 10')
    expect(rows[1]).toHaveTextContent('6 / 10')
  })

  it('shows the date for each score', () => {
    render(<ScoreHistory scores={scores} />)
    expect(screen.getByText('2026-06-07')).toBeInTheDocument()
  })

  it('renders empty message when no scores', () => {
    render(<ScoreHistory scores={[]} />)
    expect(screen.getByText(/no scores yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
npm test src/components/__tests__/ScoreHistory.test.jsx
```
Expected: FAIL.

- [ ] **Step 3: Create `src/components/ScoreHistory.css`**

```css
.score-history { list-style: none; display: flex; flex-direction: column; gap: 8px; }

.score-history__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: var(--color-surface);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.07);
  font-size: 16px;
}

.score-history__result { font-weight: 700; }
.score-history__date   { opacity: 0.6; font-size: 14px; }
.score-history__empty  { opacity: 0.5; font-style: italic; }
```

- [ ] **Step 4: Create `src/components/ScoreHistory.jsx`**

```jsx
import './ScoreHistory.css'

export default function ScoreHistory({ scores }) {
  if (scores.length === 0) {
    return <p className="score-history__empty">No scores yet — play a game!</p>
  }
  return (
    <ul className="score-history">
      {scores.map(s => (
        <li key={s.timestamp} className="score-history__item">
          <span className="score-history__result">{s.score} / {s.total}</span>
          <span className="score-history__date">{s.date}</span>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 5: Run tests — expect them to pass**

```bash
npm test src/components/__tests__/ScoreHistory.test.jsx
```
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/
git commit -m "feat: add ScoreHistory component"
```

---

### Task 7: Dashboard component

**Files:**
- Create: `src/components/Dashboard.jsx`
- Create: `src/components/Dashboard.css`
- Create: `src/components/__tests__/Dashboard.test.jsx`

- [ ] **Step 1: Write failing test in `src/components/__tests__/Dashboard.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Dashboard from '../Dashboard'

vi.mock('../../hooks/useScores', () => ({
  default: () => ({ getBestScore: () => 5, getScoresByGame: () => [] }),
}))

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds', description: 'Sounds!', icon: '🐘', color: '#B39DDB' },
  { id: 'colors', name: 'Colors', description: 'Colors!', icon: '🎨', color: '#80DEEA' },
]

describe('Dashboard', () => {
  it('renders one card per manifest', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
    expect(screen.getByText('Colors')).toBeInTheDocument()
  })

  it('renders the admin gear link', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /⚙️/i })).toHaveAttribute('href', '/admin')
  })

  it('renders empty state when no manifests', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.getByText(/no games/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
npm test src/components/__tests__/Dashboard.test.jsx
```
Expected: FAIL.

- [ ] **Step 3: Create `src/components/Dashboard.css`**

```css
.dashboard { min-height: 100vh; padding: 24px 16px; }

.dashboard__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
}

.dashboard__title {
  font-size: 32px;
  font-weight: 800;
  color: var(--color-lavender);
}

.dashboard__admin {
  font-size: 28px;
  text-decoration: none;
  min-width: 64px;
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-button);
  transition: background 0.15s;
}

.dashboard__admin:hover { background: rgba(0,0,0,0.06); }

.dashboard__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.dashboard__empty { opacity: 0.5; font-style: italic; }
```

- [ ] **Step 4: Create `src/components/Dashboard.jsx`**

```jsx
import { Link } from 'react-router-dom'
import GameCard from './GameCard'
import useScores from '../hooks/useScores'
import './Dashboard.css'

export default function Dashboard({ manifests }) {
  const { getBestScore } = useScores()

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title">🌊 Baby's Playroom</h1>
        <Link to="/admin" className="dashboard__admin" aria-label="⚙️ Settings">⚙️</Link>
      </div>

      {manifests.length === 0 ? (
        <p className="dashboard__empty">No games found. Drop a game folder into src/games/.</p>
      ) : (
        <div className="dashboard__grid">
          {manifests.map(m => (
            <GameCard key={m.id} manifest={m} bestScore={getBestScore(m.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run tests — expect them to pass**

```bash
npm test src/components/__tests__/Dashboard.test.jsx
```
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/
git commit -m "feat: add Dashboard component with game card grid and admin link"
```

---

### Task 8: Admin page

**Files:**
- Create: `src/admin/AdminPage.jsx`
- Create: `src/admin/AdminPage.css`
- Create: `src/admin/__tests__/AdminPage.test.jsx`

- [ ] **Step 1: Write failing tests in `src/admin/__tests__/AdminPage.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AdminPage from '../AdminPage'

const mockSettings = { numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 10 }
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

  it('renders score history section', () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(screen.getByText(/score history/i)).toBeInTheDocument()
    expect(screen.getByText('8 / 10')).toBeInTheDocument()
  })

  it('calls updateSetting when a radio changes', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.click(screen.getByLabelText('4'))
    expect(mockUpdateSetting).toHaveBeenCalledWith('numChoices', 4)
  })

  it('calls resetSettings when reset button clicked', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(mockResetSettings).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
npm test src/admin/__tests__/AdminPage.test.jsx
```
Expected: FAIL.

- [ ] **Step 3: Create `src/admin/AdminPage.css`**

```css
.admin { min-height: 100vh; padding: 24px 16px; max-width: 600px; margin: 0 auto; }

.admin__header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}

.admin__back {
  font-size: 24px;
  text-decoration: none;
  min-width: 64px;
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-button);
  transition: background 0.15s;
}

.admin__back:hover { background: rgba(0,0,0,0.06); }

.admin__title { font-size: 28px; font-weight: 800; color: var(--color-lavender); }

.admin__section { margin-bottom: 28px; }

.admin__section h2 { font-size: 18px; font-weight: 700; margin-bottom: 12px; }

.admin__radios  { display: flex; gap: 12px; flex-wrap: wrap; }

.admin__radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 18px;
  cursor: pointer;
  padding: 10px 18px;
  border-radius: var(--radius-button);
  border: 2px solid var(--color-aqua);
  transition: background 0.15s;
}

.admin__radio-label:has(input:checked) {
  background: var(--color-aqua);
  color: white;
}

.admin__radio-label input { display: none; }

.admin__toggle {
  display: flex;
  gap: 12px;
}

.admin__toggle-btn {
  flex: 1;
  padding: 14px;
  font-size: 16px;
  font-weight: 700;
  border-radius: var(--radius-button);
  border: 2px solid var(--color-teal);
  background: transparent;
  color: var(--color-text);
  transition: background 0.15s;
  min-height: 64px;
}

.admin__toggle-btn.active {
  background: var(--color-teal);
  color: white;
}

.admin__reset {
  margin-top: 32px;
  width: 100%;
  padding: 16px;
  background: transparent;
  border: 2px solid #ef9a9a;
  color: #c62828;
  font-weight: 700;
  border-radius: var(--radius-button);
  min-height: 64px;
}

.admin__reset:hover { background: #ffebee; }
```

- [ ] **Step 4: Create `src/admin/AdminPage.jsx`**

```jsx
import { Link } from 'react-router-dom'
import useSettings from '../hooks/useSettings'
import useScores from '../hooks/useScores'
import ScoreHistory from '../components/ScoreHistory'
import './AdminPage.css'

export default function AdminPage() {
  const { settings, updateSetting, resetSettings } = useSettings()
  const { getAllScores } = useScores()

  return (
    <div className="admin">
      <div className="admin__header">
        <Link to="/" className="admin__back">←</Link>
        <h1 className="admin__title">⚙️ Settings</h1>
      </div>

      <div className="admin__section">
        <h2>Answer Choices</h2>
        <div className="admin__radios">
          {[2, 3, 4].map(n => (
            <label key={n} className="admin__radio-label" aria-label={String(n)}>
              <input
                type="radio"
                name="numChoices"
                checked={settings.numChoices === n}
                onChange={() => updateSetting('numChoices', n)}
              />
              {n}
            </label>
          ))}
        </div>
      </div>

      <div className="admin__section">
        <h2>Feedback Mode</h2>
        <div className="admin__toggle">
          {[
            { value: 'immediate', label: '⚡ Immediate' },
            { value: 'parent-tap', label: '👆 Parent Tap' },
          ].map(opt => (
            <button
              key={opt.value}
              className={`admin__toggle-btn ${settings.feedbackMode === opt.value ? 'active' : ''}`}
              onClick={() => updateSetting('feedbackMode', opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin__section">
        <h2>Questions Per Session</h2>
        <div className="admin__radios">
          {[5, 10, 15, 20].map(n => (
            <label key={n} className="admin__radio-label" aria-label={String(n)}>
              <input
                type="radio"
                name="questionsPerSession"
                checked={settings.questionsPerSession === n}
                onChange={() => updateSetting('questionsPerSession', n)}
              />
              {n}
            </label>
          ))}
        </div>
      </div>

      <button className="admin__reset" onClick={resetSettings}>
        Reset to Defaults
      </button>

      <div className="admin__section">
        <h2>Score History</h2>
        <ScoreHistory scores={getAllScores()} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests — expect them to pass**

```bash
npm test src/admin/__tests__/AdminPage.test.jsx
```
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/admin/
git commit -m "feat: add admin settings page"
```

---

### Task 9: Animal data file

**Files:**
- Create: `src/games/animal-sounds/data/animals.js`
- Create: `src/games/animal-sounds/__tests__/animals.test.js`

- [ ] **Step 1: Write failing test in `src/games/animal-sounds/__tests__/animals.test.js`**

```js
import { describe, it, expect } from 'vitest'
import animals from '../data/animals'

describe('animals data', () => {
  it('exports an array of at least 12 animals', () => {
    expect(Array.isArray(animals)).toBe(true)
    expect(animals.length).toBeGreaterThanOrEqual(12)
  })

  it('every animal has required fields', () => {
    for (const animal of animals) {
      expect(animal.id,    `${animal.name} missing id`).toBeTruthy()
      expect(animal.name,  `${animal.id} missing name`).toBeTruthy()
      expect(animal.emoji, `${animal.id} missing emoji`).toBeTruthy()
      expect(animal.sound, `${animal.id} missing sound`).toBeTruthy()
    }
  })

  it('all ids are unique', () => {
    const ids = animals.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
npm test src/games/animal-sounds/__tests__/animals.test.js
```
Expected: FAIL.

- [ ] **Step 3: Create `src/games/animal-sounds/data/animals.js`**

```js
const animals = [
  { id: 'elephant', name: 'Elephant', emoji: '🐘', sound: 'elephant.mp3' },
  { id: 'lion',     name: 'Lion',     emoji: '🦁', sound: 'lion.mp3' },
  { id: 'cow',      name: 'Cow',      emoji: '🐄', sound: 'cow.mp3' },
  { id: 'dog',      name: 'Dog',      emoji: '🐕', sound: 'dog.mp3' },
  { id: 'cat',      name: 'Cat',      emoji: '🐈', sound: 'cat.mp3' },
  { id: 'frog',     name: 'Frog',     emoji: '🐸', sound: 'frog.mp3' },
  { id: 'duck',     name: 'Duck',     emoji: '🦆', sound: 'duck.mp3' },
  { id: 'horse',    name: 'Horse',    emoji: '🐴', sound: 'horse.mp3' },
  { id: 'pig',      name: 'Pig',      emoji: '🐷', sound: 'pig.mp3' },
  { id: 'sheep',    name: 'Sheep',    emoji: '🐑', sound: 'sheep.mp3' },
  { id: 'rooster',  name: 'Rooster',  emoji: '🐓', sound: 'rooster.mp3' },
  { id: 'owl',      name: 'Owl',      emoji: '🦉', sound: 'owl.mp3' },
]

export default animals
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
npm test src/games/animal-sounds/__tests__/animals.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: Add sound files**

Place one `.mp3` file per animal into `src/games/animal-sounds/sounds/`. File names must exactly match the `sound` field in `animals.js`:
- `elephant.mp3`, `lion.mp3`, `cow.mp3`, `dog.mp3`, `cat.mp3`, `frog.mp3`, `duck.mp3`, `horse.mp3`, `pig.mp3`, `sheep.mp3`, `rooster.mp3`, `owl.mp3`

Free public-domain animal sounds: https://freesound.org (search each animal name, filter by CC0 licence). Download and rename each file to match the names above.

- [ ] **Step 6: Create the game manifest**

Create `src/games/animal-sounds/manifest.json`:
```json
{
  "id": "animal-sounds",
  "name": "Animal Sounds",
  "description": "Match the animal to its sound!",
  "icon": "🐘",
  "color": "#B39DDB"
}
```

- [ ] **Step 7: Commit**

```bash
git add src/games/animal-sounds/
git commit -m "feat: add animal data, manifest, and sound file placeholders"
```

---

### Task 10: Animal Sounds game component

**Files:**
- Create: `src/games/animal-sounds/index.jsx`
- Create: `src/games/animal-sounds/AnimalSoundsGame.css`

- [ ] **Step 1: Write failing tests in `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`**

```jsx
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AnimalSoundsGame from '../index'

// Suppress HTMLMediaElement errors in jsdom
window.HTMLMediaElement.prototype.play  = vi.fn().mockResolvedValue(undefined)
window.HTMLMediaElement.prototype.pause = vi.fn()
window.HTMLMediaElement.prototype.load  = vi.fn()

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({
    settings: { numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3 },
  }),
}))

vi.mock('../../../hooks/useScores', () => ({
  default: () => ({ addScore: vi.fn().mockResolvedValue(undefined) }),
}))

const onGameEnd = vi.fn()

beforeEach(() => { vi.clearAllMocks() })

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
      await act(async () => { await userEvent.click(correctBtn) })
      await act(async () => { vi.advanceTimersByTime(1600) })
    }

    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('Home button calls onGameEnd', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.animalId)
      const correctId = screen.getByTestId('correct-animal-id').textContent
      const correctBtn = buttons.find(b => b.dataset.animalId === correctId)
      await act(async () => { await userEvent.click(correctBtn) })
      await act(async () => { vi.advanceTimersByTime(1600) })
    }

    await act(async () => { await userEvent.click(screen.getByRole('button', { name: /home/i })) })
    expect(onGameEnd).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
npm test src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx
```
Expected: FAIL.

- [ ] **Step 3: Create `src/games/animal-sounds/AnimalSoundsGame.css`**

```css
.game { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 24px 16px; gap: 24px; }

.game__question {
  width: 100%;
  max-width: 480px;
  background: linear-gradient(135deg, var(--color-aqua), var(--color-lavender));
  border-radius: var(--radius-card);
  padding: 28px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
}

.game__prompt    { color: white; font-size: 20px; font-weight: 700; text-align: center; }
.game__replay    { font-size: 36px; background: rgba(255,255,255,0.3); border-radius: 50%; width: 72px; height: 72px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; transition: background 0.15s; }
.game__replay:hover { background: rgba(255,255,255,0.5); }

.game__progress { font-size: 15px; color: rgba(255,255,255,0.85); font-weight: 600; }

.game__choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  width: 100%;
  max-width: 480px;
}

.game__choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px 12px;
  border-radius: var(--radius-card);
  border: none;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  font-size: 48px;
  cursor: pointer;
  min-height: 120px;
  transition: transform 0.1s ease;
}

.game__choice:hover:not(:disabled) { transform: scale(1.04); }
.game__choice:disabled { cursor: default; }

.game__choice-name { font-size: 18px; font-weight: 700; color: white; }

.game__next {
  padding: 16px 48px;
  background: var(--color-teal);
  color: white;
  font-size: 20px;
  font-weight: 700;
  border-radius: var(--radius-button);
  border: none;
  min-height: 64px;
}

/* Results screen */
.results { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; padding: 24px; text-align: center; }
.results__emoji  { font-size: 96px; }
.results__score  { font-size: 36px; font-weight: 800; color: var(--color-lavender); }
.results__label  { font-size: 20px; opacity: 0.7; }
.results__actions { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
.results__btn { padding: 16px 36px; font-size: 20px; font-weight: 700; border-radius: var(--radius-button); min-height: 64px; }
.results__btn--play  { background: var(--color-lavender); color: white; border: none; }
.results__btn--home  { background: transparent; border: 2px solid var(--color-aqua); color: var(--color-text); }
```

- [ ] **Step 4: Create `src/games/animal-sounds/index.jsx`**

```jsx
import { useState, useEffect, useRef } from 'react'
import useSettings from '../../hooks/useSettings'
import useScores from '../../hooks/useScores'
import animals from './data/animals'
import './AnimalSoundsGame.css'

const CHOICE_COLORS = [
  'var(--color-lavender)',
  'var(--color-teal)',
  'var(--color-aqua)',
  'var(--color-lilac)',
]

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildQueue(numChoices, questionsPerSession) {
  const shuffled = shuffle(animals)
  const count = Math.min(questionsPerSession, animals.length)
  return shuffled.slice(0, count).map(correct => {
    const wrong = shuffle(animals.filter(a => a.id !== correct.id)).slice(0, numChoices - 1)
    return { correct, choices: shuffle([correct, ...wrong]) }
  })
}

export default function AnimalSoundsGame({ onGameEnd }) {
  const { settings } = useSettings()
  const { addScore }  = useScores()

  const [queue,    setQueue]    = useState([])
  const [index,    setIndex]    = useState(0)
  const [answered, setAnswered] = useState(false)
  const [selected, setSelected] = useState(null)
  const [score,    setScore]    = useState(0)
  const [done,     setDone]     = useState(false)

  // Refs avoid stale closures in setTimeout callbacks
  const audioRef   = useRef(null)
  const scoreRef   = useRef(0)
  const indexRef   = useRef(0)
  const queueRef   = useRef([])

  const { numChoices, feedbackMode, questionsPerSession } = settings

  useEffect(() => {
    if (numChoices && questionsPerSession) {
      const q = buildQueue(numChoices, questionsPerSession)
      queueRef.current = q
      setQueue(q)
    }
  }, [numChoices, questionsPerSession])

  const current = queue[index]

  useEffect(() => {
    if (!current) return
    playSound()
  }, [index, queue])

  function playSound() {
    if (!current) return
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    const audio = new Audio(`/src/games/animal-sounds/sounds/${current.correct.sound}`)
    audioRef.current = audio
    audio.play().catch(() => {})
  }

  function handleChoice(animal) {
    if (answered) return
    setAnswered(true)
    setSelected(animal.id)

    const isCorrect = animal.id === current.correct.id
    if (isCorrect) {
      scoreRef.current += 1
      setScore(scoreRef.current)
    }

    if (feedbackMode === 'immediate') {
      setTimeout(advance, 1500)
    }
  }

  function advance() {
    const nextIndex = indexRef.current + 1
    if (nextIndex >= queueRef.current.length) {
      finishGame()
    } else {
      indexRef.current = nextIndex
      setIndex(nextIndex)
      setAnswered(false)
      setSelected(null)
    }
  }

  async function finishGame() {
    const result = {
      gameId: 'animal-sounds',
      score: scoreRef.current,
      total: queueRef.current.length,
      date: new Date().toISOString().split('T')[0],
      timestamp: Date.now(),
    }
    await addScore(result)
    setDone(true)
  }

  function restart() {
    scoreRef.current = 0
    indexRef.current = 0
    const q = buildQueue(numChoices, questionsPerSession)
    queueRef.current = q
    setQueue(q)
    setIndex(0)
    setAnswered(false)
    setSelected(null)
    setScore(0)
    setDone(false)
  }

  if (done) {
    const total = queueRef.current.length
    return (
      <div className="results">
        <div className="results__emoji">{scoreRef.current === total ? '🎉' : '⭐'}</div>
        <div className="results__score">{scoreRef.current} / {total}</div>
        <div className="results__label">You scored {scoreRef.current} out of {total}!</div>
        <div className="results__actions">
          <button className="results__btn results__btn--play" onClick={restart}>Play Again</button>
          <button className="results__btn results__btn--home" onClick={() => onGameEnd(scoreRef.current, total)}>Home</button>
        </div>
      </div>
    )
  }

  if (!current) return null

  return (
    <div className="game">
      {/* Hidden testid so tests can find the correct answer id */}
      <span data-testid="correct-animal-id" style={{ display: 'none' }}>{current.correct.id}</span>

      <div className="game__question">
        <div className="game__progress">Question {index + 1} of {queue.length}</div>
        <div className="game__prompt">What animal makes this sound?</div>
        <button className="game__replay" aria-label="Replay sound" onClick={playSound}>🔊</button>
      </div>

      <div className="game__choices">
        {current.choices.map((animal, i) => {
          const isSelected = selected === animal.id
          const isCorrect  = animal.id === current.correct.id
          let cls = 'game__choice'
          if (answered && isSelected && isCorrect)  cls += ' correct'
          if (answered && isSelected && !isCorrect) cls += ' wrong'
          if (answered && !isSelected && isCorrect) cls += ' highlight-correct'

          return (
            <button
              key={animal.id}
              className={cls}
              style={{ background: CHOICE_COLORS[i % CHOICE_COLORS.length] }}
              disabled={answered}
              onClick={() => handleChoice(animal)}
              data-animal-id={animal.id}
            >
              {animal.emoji}
              <span className="game__choice-name">{animal.name}</span>
            </button>
          )
        })}
      </div>

      {answered && feedbackMode === 'parent-tap' && (
        <button className="game__next" onClick={advance}>Next →</button>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run tests — expect them to pass**

```bash
npm test src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx
```
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/games/animal-sounds/
git commit -m "feat: implement Animal Sounds game with auto-play, answer cards, and scoring"
```

---

### Task 11: Wire App.jsx with auto-discovery and routing

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Replace `src/App.jsx` stub with full implementation**

```jsx
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import Dashboard from './components/Dashboard'
import AdminPage from './admin/AdminPage'

const manifestModules = import.meta.glob('./games/*/manifest.json', { eager: true })
const gameModules     = import.meta.glob('./games/*/index.jsx')

const manifests = Object.values(manifestModules).map(m => m.default ?? m)

const gameComponents = Object.fromEntries(
  Object.entries(gameModules).map(([path, loader]) => {
    const id = path.match(/\.\/games\/(.+)\/index\.jsx/)[1]
    return [id, lazy(loader)]
  })
)

function GameRoute() {
  const { gameId } = useParams()
  const navigate   = useNavigate()
  const Game       = gameComponents[gameId]

  if (!Game) return <div style={{ padding: 24 }}>Game not found.</div>

  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
      <Game onGameEnd={() => navigate('/')} />
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"            element={<Dashboard manifests={manifests} />} />
        <Route path="/admin"       element={<AdminPage />} />
        <Route path="/game/:gameId" element={<GameRoute />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 2: Start the dev server and verify the dashboard shows the Animal Sounds card**

```bash
npm run dev
```
Open `http://localhost:5173`. You should see the dashboard with a "🐘 Animal Sounds" card.

- [ ] **Step 3: Click the game card — verify the game screen loads**

The question prompt and two answer buttons should appear. The sound will not play (sound files not yet in place) but no crash should occur.

- [ ] **Step 4: Navigate to `/admin` and verify all settings render**

Click the ⚙️ icon. You should see Answer Choices, Feedback Mode, and Questions Per Session controls.

- [ ] **Step 5: Run all tests**

```bash
npm test
```
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire auto-discovery routing in App.jsx — dashboard now driven by game manifests"
```

---

### Task 12: Sound file path fix for production build

**Files:**
- Modify: `src/games/animal-sounds/index.jsx`
- Modify: `vite.config.js`

The `new Audio('/src/...')` path works in dev but breaks in a production build (Vite moves assets). Use Vite's asset import system instead.

- [ ] **Step 1: Create `src/games/animal-sounds/data/sounds.js`**

```js
const sounds = import.meta.glob('../sounds/*.mp3', { eager: true, query: '?url', import: 'default' })

export function getSoundUrl(filename) {
  const key = `../sounds/${filename}`
  return sounds[key] ?? null
}
```

- [ ] **Step 2: Update the `playSound` function in `src/games/animal-sounds/index.jsx`**

Replace:
```js
import animals from './data/animals'
```
With:
```js
import animals from './data/animals'
import { getSoundUrl } from './data/sounds'
```

Replace the `playSound` function body:
```js
function playSound() {
  if (!current) return
  const url = getSoundUrl(current.correct.sound)
  if (!url) return
  if (audioRef.current) {
    audioRef.current.pause()
    audioRef.current.currentTime = 0
  }
  const audio = new Audio(url)
  audioRef.current = audio
  audio.play().catch(() => {})
}
```

- [ ] **Step 3: Verify dev server still works**

```bash
npm run dev
```
Sound should play when a question loads (once `.mp3` files are present in `sounds/`).

- [ ] **Step 4: Run all tests**

```bash
npm test
```
Expected: All tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/games/animal-sounds/
git commit -m "fix: use Vite asset import for sound files so paths survive production build"
```

---

### Task 13: Final check — run full test suite and build

- [ ] **Step 1: Run all tests with coverage**

```bash
npm run coverage
```
Expected: All tests pass. Review coverage output — all hooks, components, and the game should have meaningful coverage.

- [ ] **Step 2: Build for production**

```bash
npm run build
```
Expected: Build completes with no errors. Output goes to `dist/`.

- [ ] **Step 3: Preview the production build**

```bash
npm run preview
```
Open the URL shown. Verify the dashboard, game, and admin page all work.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: verify full test suite and production build pass"
```

---

## Adding Future Games

To add a new game once this foundation is in place:

1. Create `src/games/<game-id>/manifest.json` (copy the animal-sounds one, update fields)
2. Create `src/games/<game-id>/index.jsx` exporting a default component that accepts `{ onGameEnd }`
3. Run `npm run dev` — the new game card appears on the dashboard automatically
4. Write tests in `src/games/<game-id>/__tests__/`
5. Commit
