# Child's Name Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `childName` setting so the dashboard title reads "<Name>'s Playground" when set, falling back to "Baby's Playground" otherwise.

**Architecture:** One new field (`childName`) on the existing flat settings object, surfaced through the existing `useSettings` hook and `localStorage` adapter with no interface changes. A new text input in `AdminPage.jsx` (mirroring the existing Google Analytics ID field) and a computed title string in `Dashboard.jsx`.

**Tech Stack:** React 18, Vite, Vitest + React Testing Library + jsdom.

## Global Constraints

- New setting field: `childName: ''` (default empty string), added to `DEFAULT_SETTINGS` in `src/storage/adapter.js`.
- No new storage adapter methods — `childName` flows through the existing `getSettings`/`saveSettings`/`updateSetting` pass-through.
- No validation or length limits on the field — consistent with the existing `gaId` free-text field.
- Dashboard title: `${name}'s Playground` when `settings.childName.trim()` is non-empty, else `"Baby's Playground"`. Rendered as `🌊 {title}` (keep existing emoji prefix).
- Admin UI: new "Child's Name" section placed **first** in `AdminPage.jsx`, above "Answer Choices". Same `admin__text-input`/`admin__hint` classes as the Google Analytics field — no new CSS.
- Tests covering timed feedback are not applicable here (no timers involved), but follow existing project conventions: `vi.mock()` for hooks, `getByLabelText`/`getByRole` queries, `userEvent` for typing (no fake timers needed for this feature).

---

### Task 1: Add `childName` to settings default and Admin UI

**Files:**
- Modify: `src/storage/adapter.js` (full file, 19 lines)
- Modify: `src/admin/AdminPage.jsx:1-20` (add new section before "Answer Choices")
- Test: `src/admin/__tests__/AdminPage.test.jsx`

**Interfaces:**
- Consumes: `useSettings()` → `{ settings, updateSetting, resetSettings }` (unchanged signature, `settings.childName` is the new field this task adds).
- Produces: `settings.childName` (string, default `''`) — consumed by Task 2's `Dashboard.jsx`.

- [ ] **Step 1: Write the failing tests**

Open `src/admin/__tests__/AdminPage.test.jsx`. Add `childName: ''` to the `mockSettings` object at the top of the file:

```js
const mockSettings = { numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 10, childName: '' }
```

Add two new tests inside the `describe('AdminPage', ...)` block, after the existing `'renders all setting controls'` test:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx`
Expected: FAIL — `getByLabelText(/child's name/i)` finds no element (the field doesn't exist yet).

- [ ] **Step 3: Add `childName` to `DEFAULT_SETTINGS`**

Replace the full contents of `src/storage/adapter.js`:

```js
export const DEFAULT_SETTINGS = {
  numChoices: 2,
  feedbackMode: 'immediate',
  questionsPerSession: 10,
  gaId: '',
  childName: '',
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
 * Settings shape: { numChoices, feedbackMode, questionsPerSession, gaId, childName }
 */
```

- [ ] **Step 4: Add the "Child's Name" section to `AdminPage.jsx`**

In `src/admin/AdminPage.jsx`, insert a new section immediately after the opening `<div className="admin__header">...</div>` block and before the existing `<div className="admin__section"><h2>Answer Choices</h2>` section:

```jsx
      <div className="admin__section">
        <h2>Child's Name</h2>
        <p className="admin__hint">Personalize the home page title.</p>
        <input
          className="admin__text-input"
          type="text"
          placeholder="e.g. Mia"
          value={settings.childName || ''}
          onChange={e => updateSetting('childName', e.target.value)}
          aria-label="Child's Name"
          spellCheck={false}
        />
      </div>

```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx`
Expected: PASS (6/6 tests — the 4 existing plus the 2 new ones).

- [ ] **Step 6: Commit**

```bash
git add src/storage/adapter.js src/admin/AdminPage.jsx src/admin/__tests__/AdminPage.test.jsx
git commit -m "feat: add childName setting and admin field"
```

---

### Task 2: Personalize the dashboard title

**Files:**
- Modify: `src/components/Dashboard.jsx` (full file, 33 lines)
- Test: `src/components/__tests__/Dashboard.test.jsx`

**Interfaces:**
- Consumes: `useSettings()` → `{ settings }` where `settings.childName` is a string (added in Task 1; default `''`).
- Produces: nothing consumed by later tasks — this is the final behavior task.

- [ ] **Step 1: Write the failing tests**

Open `src/components/__tests__/Dashboard.test.jsx`. This file does not currently mock `useSettings` — add the mock and two new tests. Replace the full file contents with:

```jsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
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

  it('passes correct bestScore to each GameCard', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText('Best: 7')).toBeInTheDocument()
    expect(screen.getByText('Best: 3')).toBeInTheDocument()
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
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/components/__tests__/Dashboard.test.jsx`
Expected: the 4 pre-existing tests pass; the 2 new tests FAIL because the title is still the hardcoded `"🌊 Baby's Playroom"` text (no match for `"🌊 Baby's Playground"` or `"🌊 Mia's Playground"`).

- [ ] **Step 3: Implement the personalized title**

Replace the full contents of `src/components/Dashboard.jsx`:

```jsx
import { Link } from 'react-router-dom'
import GameCard from './GameCard'
import useScores from '../hooks/useScores'
import useSettings from '../hooks/useSettings'
import { version } from '../../package.json'
import './Dashboard.css'

export default function Dashboard({ manifests = [] }) {
  const { getBestScore } = useScores()
  const { settings } = useSettings()

  const name = settings.childName?.trim()
  const title = name ? `${name}'s Playground` : "Baby's Playground"

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title">🌊 {title}</h1>
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

      <footer className="dashboard__footer">
        <span>The Playground</span>
        <span className="dashboard__version">v{version}</span>
      </footer>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/__tests__/Dashboard.test.jsx`
Expected: PASS (6/6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.jsx src/components/__tests__/Dashboard.test.jsx
git commit -m "feat: personalize dashboard title with child name"
```

---

### Task 3: Update documentation

**Files:**
- Modify: `README.md:11` (Admin / Settings bullet) and `README.md:197-212` (Settings Reference table + notes)
- Modify: `CLAUDE.md:29` (Settings shape line)

**Interfaces:**
- Consumes: nothing (docs-only task, depends on Tasks 1–2 being complete so the documented behavior is accurate).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the README feature bullet**

In `README.md`, line 11, change:

```
- **Admin / Settings** — configure answer choices (2–4), feedback mode, questions per session, and Google Analytics ID
```

to:

```
- **Admin / Settings** — configure child's name, answer choices (2–4), feedback mode, questions per session, and Google Analytics ID
```

- [ ] **Step 2: Update the README Settings Reference table**

In `README.md`, in the "## Settings Reference" section, change the table from:

```
| Setting | Default | Options |
|---|---|---|
| Answer choices | 2 | 2, 3, 4 |
| Feedback mode | Immediate | Immediate, Parent tap |
| Questions per session | 10 | 5, 10, 15, 20 |
| Google Analytics ID | *(empty)* | Any valid GA4 Measurement ID (e.g. `G-XXXXXXXXXX`) |
```

to:

```
| Setting | Default | Options |
|---|---|---|
| Child's Name | *(empty)* | Any text |
| Answer choices | 2 | 2, 3, 4 |
| Feedback mode | Immediate | Immediate, Parent tap |
| Questions per session | 10 | 5, 10, 15, 20 |
| Google Analytics ID | *(empty)* | Any valid GA4 Measurement ID (e.g. `G-XXXXXXXXXX`) |
```

- [ ] **Step 3: Add a note explaining the title behavior**

Immediately after the `**Google Analytics** — ...` paragraph in the same section, add:

```
**Child's Name** — when set, the dashboard title reads "<Name>'s Playground"; when left blank, it shows the default "Baby's Playground".
```

- [ ] **Step 4: Update `CLAUDE.md`'s Settings shape line**

In `CLAUDE.md`, change:

```
**Score shape:** `{ gameId, score, total, date, timestamp }`. **Settings shape:** see `DEFAULT_SETTINGS` in `src/storage/adapter.js` (`numChoices`, `feedbackMode`, `questionsPerSession`, `gaId`).
```

to:

```
**Score shape:** `{ gameId, score, total, date, timestamp }`. **Settings shape:** see `DEFAULT_SETTINGS` in `src/storage/adapter.js` (`numChoices`, `feedbackMode`, `questionsPerSession`, `gaId`, `childName`).
```

- [ ] **Step 5: Verify the full suite, lint, and build**

Run: `npm test -- run`
Expected: all tests pass (existing 61 plus the 4 new ones from Tasks 1–2 = 65 passed).

Run: `npm run build`
Expected: build succeeds (pre-existing `npm run lint` failure due to missing `eslint.config.js` is a known, out-of-scope repo issue — do not attempt to fix it as part of this task).

- [ ] **Step 6: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: document the Child's Name setting"
```
