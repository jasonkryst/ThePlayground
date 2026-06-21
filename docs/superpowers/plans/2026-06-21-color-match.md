# Color Match Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new auto-discovered game, `color-match`, where a color swatch is shown and the child picks the matching colored object from picture buttons.

**Architecture:** New self-contained folder `src/games/color-match/` following the exact structural pattern of `src/games/animal-sounds/` (manifest + component + data + tests), with no audio — the "swatch" replaces the sound-trigger UI, and each choice button's background color is the data's own hex value rather than a positional color rotation.

**Tech Stack:** React 18, Vite (auto-discovery via `import.meta.glob`), Vitest + React Testing Library + jsdom.

## Global Constraints

- No new global settings — reuse `numChoices`, `feedbackMode`, `questionsPerSession` from `useSettings`.
- No audio assets, no Web Speech API.
- Score shape: `{ gameId: 'color-match', score, total, date, timestamp }` (per `src/storage/adapter.js`).
- Manifest fields: `id`, `name`, `description`, `icon`, `color`, `version` (per existing `manifest.json` pattern).
- Timed feedback tests must use `vi.useFakeTimers()` + `fireEvent`, never `userEvent`, per this codebase's documented convention (`userEvent` deadlocks with fake timers).
- `data-testid="correct-color-id"` on a hidden span exposes the correct answer to tests without depending on choice display order.

---

### Task 1: Color roster data module

**Files:**
- Create: `src/games/color-match/data/colors.js`
- Test: `src/games/color-match/__tests__/colors.test.js`

**Interfaces:**
- Produces: default export `colors` — an array of `{ id: string, name: string, color: string (hex), emoji: string }`. Later tasks (`index.jsx`) import this as `import colors from './data/colors'`.

- [ ] **Step 1: Write the failing test**

Create `src/games/color-match/__tests__/colors.test.js`:

```js
import { describe, it, expect } from 'vitest'
import colors from '../data/colors'

describe('colors data', () => {
  it('exports an array of at least 8 colors', () => {
    expect(Array.isArray(colors)).toBe(true)
    expect(colors.length).toBeGreaterThanOrEqual(8)
  })

  it('every color has required fields', () => {
    for (const color of colors) {
      expect(color.id,    `${color.name} missing id`).toBeTruthy()
      expect(color.name,  `${color.id} missing name`).toBeTruthy()
      expect(color.emoji, `${color.id} missing emoji`).toBeTruthy()
      expect(color.color, `${color.id} missing color`).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('all ids are unique', () => {
    const ids = colors.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/games/color-match/__tests__/colors.test.js`
Expected: FAIL — cannot find module `../data/colors` (file doesn't exist yet).

- [ ] **Step 3: Write the data module**

Create `src/games/color-match/data/colors.js`:

```js
const colors = [
  { id: 'red',       name: 'Red',       color: '#E53935', emoji: '🍎' },
  { id: 'orange',    name: 'Orange',    color: '#FB8C00', emoji: '🍊' },
  { id: 'yellow',    name: 'Yellow',    color: '#FDD835', emoji: '🍌' },
  { id: 'green',     name: 'Green',     color: '#43A047', emoji: '🍃' },
  { id: 'blue',      name: 'Blue',      color: '#1E88E5', emoji: '🫐' },
  { id: 'purple',    name: 'Purple',    color: '#8E24AA', emoji: '🍇' },
  { id: 'pink',      name: 'Pink',      color: '#F06292', emoji: '🌸' },
  { id: 'brown',     name: 'Brown',     color: '#6D4C41', emoji: '🌰' },
  { id: 'black',     name: 'Black',     color: '#212121', emoji: '🎩' },
  { id: 'white',     name: 'White',     color: '#FAFAFA', emoji: '☁️' },
  { id: 'gray',      name: 'Gray',      color: '#9E9E9E', emoji: '🪨' },
  { id: 'teal',      name: 'Teal',      color: '#00897B', emoji: '🌊' },
  { id: 'lime',      name: 'Lime',      color: '#C0CA33', emoji: '🎾' },
  { id: 'turquoise', name: 'Turquoise', color: '#00BCD4', emoji: '💎' },
  { id: 'gold',      name: 'Gold',      color: '#FFC107', emoji: '⭐' },
  { id: 'silver',    name: 'Silver',    color: '#B0BEC5', emoji: '🌙' },
]

export default colors
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/games/color-match/__tests__/colors.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/games/color-match/data/colors.js src/games/color-match/__tests__/colors.test.js
git commit -m "feat: add Color Match color roster data"
```

---

### Task 2: Game component, manifest, and styles

**Files:**
- Create: `src/games/color-match/manifest.json`
- Create: `src/games/color-match/ColorMatchGame.css`
- Create: `src/games/color-match/index.jsx`
- Test: `src/games/color-match/__tests__/ColorMatchGame.test.jsx`

**Interfaces:**
- Consumes: `colors` default export from `./data/colors` (Task 1) — array of `{ id, name, color, emoji }`. Consumes `useSettings` (`{ settings: { numChoices, feedbackMode, questionsPerSession } }`) and `useScores` (`{ addScore }`) from `../../hooks/useSettings` and `../../hooks/useScores`.
- Produces: default export `ColorMatchGame({ onGameEnd })` — a React component. `onGameEnd(score, total)` is called when the child taps "Home". This is the component `App.jsx`'s auto-discovery glob (`./games/*/index.jsx`) will pick up automatically — no other file needs to reference it.

- [ ] **Step 1: Write the failing component test**

Create `src/games/color-match/__tests__/ColorMatchGame.test.jsx`:

```jsx
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ColorMatchGame from '../index'

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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/games/color-match/__tests__/ColorMatchGame.test.jsx`
Expected: FAIL — cannot find module `../index` (component doesn't exist yet).

- [ ] **Step 3: Create the manifest**

Create `src/games/color-match/manifest.json`:

```json
{
  "id": "color-match",
  "name": "Color Match",
  "description": "Match the color to its object!",
  "icon": "🎨",
  "color": "#CE93D8",
  "version": "1.0.0"
}
```

- [ ] **Step 4: Create the stylesheet**

Create `src/games/color-match/ColorMatchGame.css`:

```css
.game { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 24px 16px; gap: 24px; }

.game__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: 480px;
}

.game__name    { font-size: 15px; font-weight: 700; opacity: 0.55; }
.game__version { font-size: 12px; opacity: 0.4; font-variant-numeric: tabular-nums; }

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

.game__prompt { color: white; font-size: 20px; font-weight: 700; text-align: center; }
.game__swatch { width: 96px; height: 96px; border-radius: var(--radius-card); box-shadow: 0 4px 12px rgba(0,0,0,0.25); border: 4px solid white; }

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
.game__choice--bordered { border: 2px solid rgba(0,0,0,0.15); }

.game__choice-name { font-size: 18px; font-weight: 700; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.4); }

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

.results { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; padding: 24px; text-align: center; }
.results__emoji  { font-size: 96px; }
.results__score  { font-size: 36px; font-weight: 800; color: var(--color-lavender); }
.results__label  { font-size: 20px; opacity: 0.7; }
.results__actions { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
.results__btn { padding: 16px 36px; font-size: 20px; font-weight: 700; border-radius: var(--radius-button); min-height: 64px; }
.results__btn--play  { background: var(--color-lavender); color: white; border: none; }
.results__btn--home  { background: transparent; border: 2px solid var(--color-aqua); color: var(--color-text); }
```

`.game__choice-name` adds `text-shadow` (Animal Sounds' version doesn't have this) because Color Match button backgrounds include near-white/light colors (white, silver, gold) where plain white text would lose contrast.

- [ ] **Step 5: Create the game component**

Create `src/games/color-match/index.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react'
import useSettings from '../../hooks/useSettings'
import useScores from '../../hooks/useScores'
import colors from './data/colors'
import manifest from './manifest.json'
import './ColorMatchGame.css'

const BORDERED_IDS = new Set(['white', 'silver', 'gray'])

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildQueue(numChoices, questionsPerSession) {
  const shuffled = shuffle(colors)
  const count = Math.min(questionsPerSession, colors.length)
  return shuffled.slice(0, count).map(correct => {
    const wrong = shuffle(colors.filter(c => c.id !== correct.id)).slice(0, numChoices - 1)
    return { correct, choices: shuffle([correct, ...wrong]) }
  })
}

export default function ColorMatchGame({ onGameEnd }) {
  const { settings } = useSettings()
  const { addScore }  = useScores()

  const [queue,    setQueue]    = useState([])
  const [index,    setIndex]    = useState(0)
  const [answered, setAnswered] = useState(false)
  const [selected, setSelected] = useState(null)
  const [score,    setScore]    = useState(0)
  const [done,     setDone]     = useState(false)

  // Refs avoid stale closures in setTimeout callbacks
  const scoreRef = useRef(0)
  const indexRef = useRef(0)
  const queueRef = useRef([])

  const { numChoices, feedbackMode, questionsPerSession } = settings

  useEffect(() => {
    if (numChoices && questionsPerSession) {
      const q = buildQueue(numChoices, questionsPerSession)
      queueRef.current = q
      setQueue(q)
    }
  }, [numChoices, questionsPerSession])

  const current = queue[index]

  function handleChoice(color) {
    if (answered) return
    setAnswered(true)
    setSelected(color.id)

    const isCorrect = color.id === current.correct.id
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
      gameId: 'color-match',
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
      <span data-testid="correct-color-id" style={{ display: 'none' }}>{current.correct.id}</span>

      <div className="game__header">
        <span className="game__name">{manifest.name}</span>
        <span className="game__version">v{manifest.version}</span>
      </div>

      <div className="game__question">
        <div className="game__progress">Question {index + 1} of {queue.length}</div>
        <div className="game__prompt">Which one is this color?</div>
        <div className="game__swatch" style={{ background: current.correct.color }} />
      </div>

      <div className="game__choices">
        {current.choices.map(color => {
          const isSelected = selected === color.id
          const isCorrect  = color.id === current.correct.id
          let cls = 'game__choice'
          if (BORDERED_IDS.has(color.id)) cls += ' game__choice--bordered'
          if (answered && isSelected && isCorrect)  cls += ' correct'
          if (answered && isSelected && !isCorrect) cls += ' wrong'
          if (answered && !isSelected && isCorrect) cls += ' highlight-correct'

          return (
            <button
              key={color.id}
              className={cls}
              style={{ background: color.color }}
              disabled={answered}
              onClick={() => handleChoice(color)}
              data-color-id={color.id}
            >
              {color.emoji}
              <span className="game__choice-name">{color.name}</span>
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

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/games/color-match/__tests__/ColorMatchGame.test.jsx src/games/color-match/__tests__/colors.test.js`
Expected: PASS (8 tests total across both files).

- [ ] **Step 7: Commit**

```bash
git add src/games/color-match/manifest.json src/games/color-match/ColorMatchGame.css src/games/color-match/index.jsx src/games/color-match/__tests__/ColorMatchGame.test.jsx
git commit -m "feat: add Color Match game"
```

---

### Task 3: Documentation updates and full verification

**Files:**
- Modify: `README.md` (Features list and "Adding a New Game" area stay as-is; add one line documenting the new game)
- Modify: `docs/ENHANCEMENTS.md:10` (remove the now-implemented backlog line)

**Interfaces:**
- None — this task only touches docs and runs verification; no new code interfaces.

- [ ] **Step 1: Add Color Match to the README feature list**

In `README.md`, the Features section currently has this line (around line 9):

```markdown
- **Animal Sounds** — an animal sound plays automatically; the child picks the matching animal from picture buttons
```

Add directly after it:

```markdown
- **Color Match** — a color swatch is shown; the child picks the matching colored object from picture buttons
```

- [ ] **Step 2: Remove the implemented item from the enhancements backlog**

In `docs/ENHANCEMENTS.md`, under `### New Game Types`, delete this line:

```markdown
- **Color Match** — show a color swatch, child picks the matching colored object from picture buttons
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test -- run`
Expected: All tests pass, including the existing Animal Sounds / Dashboard / hooks / storage tests plus the new `colors.test.js` and `ColorMatchGame.test.jsx`.

- [ ] **Step 4: Run lint and production build**

Run: `npm run lint && npm run build`
Expected: Both succeed with no errors (catches unused imports, JSX issues, or `import.meta.glob` path problems in the new game folder).

- [ ] **Step 5: Commit**

```bash
git add README.md docs/ENHANCEMENTS.md
git commit -m "docs: document Color Match game, remove from backlog"
```
