# Technical Test & i18n Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add i18n scaffolding, automated accessibility audits (jest-axe + axe-core/playwright), Playwright E2E coverage, and Storybook-based visual regression to The Playground, so the upcoming Gameplay/Dashboard/Scoring sub-projects can be built with full a11y + E2E coverage from day one.

**Architecture:** `react-i18next` with a single global instance (no provider wrapping needed in tests — `src/i18n/index.js` is imported once in `test-setup.js` and `main.jsx`). All existing UI strings move into `src/i18n/en.json`; translated output is byte-identical to current hardcoded text, so no existing test assertions change. `jest-axe` adds accessibility assertions to existing Vitest component tests. Playwright drives real-browser E2E specs (`e2e/`) covering the dashboard, both games, and admin settings, each including an `@axe-core/playwright` scan. Storybook hosts isolated component/game stories; Playwright's `toHaveScreenshot` diffs those stories against committed baseline PNGs for visual regression — no Chromatic account.

**Tech Stack:** React 18, Vite 6, Vitest 3 + React Testing Library + jsdom, react-router-dom 7, react-i18next/i18next, jest-axe, @playwright/test, @axe-core/playwright, Storybook (`@storybook/react-vite`).

## Global Constraints

- English only — no second locale, no language switcher (per spec: i18n is scaffold-only this round).
- No Chromatic — visual regression uses Storybook + Playwright's local `toHaveScreenshot`, structured so Chromatic can be added later without restructuring stories.
- No CI pipeline changes — that's a separate, unrequested `ENHANCEMENTS.md` item.
- Manifest fields (`name`, `description` in each game's `manifest.json`) are NOT translated — they're per-game author metadata, not core-engine UI strings. Only in-game UI strings (prompts, buttons, labels) and animal/color display names move to i18n.
- Translated strings must render byte-identical to current hardcoded text, so existing test assertions (`getByText`, `getByLabelText`, regex matches) continue to pass without modification unless explicitly noted in a task.
- No migration logic needed anywhere (app isn't in production; per the approved spec).
- Every new automated check (jest-axe assertion, Playwright spec) must actually run and pass before its task is considered done — if axe reports a violation, fix the underlying component (e.g. missing `aria-label`) as part of that task, don't suppress or skip the check.

---

### Task 1: i18n scaffold

**Files:**
- Create: `src/i18n/en.json`
- Create: `src/i18n/index.js`
- Create: `src/i18n/__tests__/i18n.test.js`
- Modify: `src/test-setup.js`
- Modify: `src/main.jsx`

**Interfaces:**
- Produces: `src/i18n/index.js` default-exports the initialized `i18next` instance. Any component can call `useTranslation()` from `react-i18next` and get a working `t()` without a `Provider` wrapper, because `test-setup.js` and `main.jsx` both import `../i18n` (or `./i18n`) for its side effect before anything renders.
- Produces: `src/i18n/en.json` keys consumed by later tasks: `common.scoreLabel`, `common.playAgain`, `common.home`, `common.progress`, `dashboard.*`, `gameCard.best`, `admin.*`, `scoreHistory.empty`, `animalSounds.*`, `colorMatch.*`, `animal.<id>.name`, `color.<id>.name`.

- [ ] **Step 1: Write the failing test**

```js
// src/i18n/__tests__/i18n.test.js
import { describe, it, expect } from 'vitest'
import i18n from '../index'

describe('i18n', () => {
  it('initializes synchronously with English resources', () => {
    expect(i18n.isInitialized).toBe(true)
    expect(i18n.t('common.home')).toBe('Home')
  })

  it('falls back to the key when a translation is missing', () => {
    expect(i18n.t('does.not.exist')).toBe('does.not.exist')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/i18n/__tests__/i18n.test.js`
Expected: FAIL — `Cannot find module '../index'`

- [ ] **Step 3: Write the locale file**

```json
// src/i18n/en.json
{
  "common": {
    "scoreLabel": "You scored {{score}} out of {{total}}!",
    "playAgain": "Play Again",
    "home": "Home",
    "progress": "Question {{current}} of {{total}}"
  },
  "dashboard": {
    "titleDefault": "Baby's Playground",
    "titleNamed": "{{name}}'s Playground",
    "settingsLabel": "⚙️ Settings",
    "empty": "No games found. Drop a game folder into src/games/.",
    "footerName": "The Playground"
  },
  "gameCard": {
    "best": "Best: {{score}}"
  },
  "admin": {
    "back": "Back to dashboard",
    "title": "⚙️ Settings",
    "childNameHeading": "Child's Name",
    "childNameHint": "Personalize the home page title.",
    "childNamePlaceholder": "e.g. Mia",
    "childNameLabel": "Child's Name",
    "answerChoicesHeading": "Answer Choices",
    "feedbackModeHeading": "Feedback Mode",
    "feedbackImmediate": "⚡ Immediate",
    "feedbackParentTap": "👆 Parent Tap",
    "questionsPerSessionHeading": "Questions Per Session",
    "gaHeading": "Google Analytics",
    "gaHint": "Enter your Measurement ID to enable analytics tracking.",
    "gaLabel": "Google Analytics Measurement ID",
    "reset": "Reset to Defaults",
    "scoreHistoryHeading": "Score History"
  },
  "scoreHistory": {
    "empty": "No scores yet — play a game!"
  },
  "animalSounds": {
    "prompt": "What animal makes this sound?",
    "replay": "Replay sound"
  },
  "colorMatch": {
    "prompt": "Which one is this color?"
  },
  "animal": {
    "elephant": { "name": "Elephant" },
    "lion": { "name": "Lion" },
    "cow": { "name": "Cow" },
    "dog": { "name": "Dog" },
    "cat": { "name": "Cat" },
    "frog": { "name": "Frog" },
    "duck": { "name": "Duck" },
    "horse": { "name": "Horse" },
    "pig": { "name": "Pig" },
    "sheep": { "name": "Sheep" },
    "rooster": { "name": "Rooster" },
    "owl": { "name": "Owl" }
  },
  "color": {
    "red": { "name": "Red" },
    "orange": { "name": "Orange" },
    "yellow": { "name": "Yellow" },
    "green": { "name": "Green" },
    "blue": { "name": "Blue" },
    "purple": { "name": "Purple" },
    "pink": { "name": "Pink" },
    "brown": { "name": "Brown" },
    "black": { "name": "Black" },
    "white": { "name": "White" },
    "gray": { "name": "Gray" }
  }
}
```

- [ ] **Step 4: Install dependencies and write the init module**

Run: `npm install react-i18next i18next`

```js
// src/i18n/index.js
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/i18n/__tests__/i18n.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Wire i18n into the app and test setup**

```js
// src/test-setup.js
import '@testing-library/jest-dom'
import './i18n'
```

```jsx
// src/main.jsx
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 7: Run the full test suite to confirm nothing broke**

Run: `npx vitest run`
Expected: PASS — same test count as before plus the 2 new i18n tests, no regressions.

- [ ] **Step 8: Commit**

```bash
git add src/i18n src/test-setup.js src/main.jsx package.json package-lock.json
git commit -m "feat(i18n): add react-i18next scaffold with English locale"
```

---

### Task 2: Migrate Dashboard + GameCard to i18n

**Files:**
- Modify: `src/components/Dashboard.jsx`
- Modify: `src/components/GameCard.jsx`

**Interfaces:**
- Consumes: `i18n.t()` keys `dashboard.titleDefault`, `dashboard.titleNamed`, `dashboard.settingsLabel`, `dashboard.empty`, `dashboard.footerName`, `gameCard.best` from Task 1's `en.json`.
- No change to component props or exports — `Dashboard({ manifests })` and `GameCard({ manifest, bestScore })` signatures are unchanged.

- [ ] **Step 1: Update Dashboard.jsx**

```jsx
// src/components/Dashboard.jsx
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import GameCard from './GameCard'
import useScores from '../hooks/useScores'
import useSettings from '../hooks/useSettings'
import { version } from '../../package.json'
import './Dashboard.css'

export default function Dashboard({ manifests = [] }) {
  const { t } = useTranslation()
  const { getBestScore } = useScores()
  const { settings } = useSettings()

  const name = settings.childName?.trim()
  const title = name ? t('dashboard.titleNamed', { name }) : t('dashboard.titleDefault')

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title">🌊 {title}</h1>
        <Link to="/admin" className="dashboard__admin" aria-label={t('dashboard.settingsLabel')}>⚙️</Link>
      </div>

      {manifests.length === 0 ? (
        <p className="dashboard__empty">{t('dashboard.empty')}</p>
      ) : (
        <div className="dashboard__grid">
          {manifests.map(m => (
            <GameCard key={m.id} manifest={m} bestScore={getBestScore(m.id)} />
          ))}
        </div>
      )}

      <footer className="dashboard__footer">
        <span>{t('dashboard.footerName')}</span>
        <span className="dashboard__version">v{version}</span>
      </footer>
    </div>
  )
}
```

- [ ] **Step 2: Update GameCard.jsx**

```jsx
// src/components/GameCard.jsx
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './GameCard.css'

export default function GameCard({ manifest, bestScore }) {
  const { t } = useTranslation()
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
        <span className="game-card__score">{t('gameCard.best', { score: bestScore })}</span>
      )}
    </Link>
  )
}
```

- [ ] **Step 3: Run existing tests to confirm no regressions**

Run: `npx vitest run src/components/__tests__/Dashboard.test.jsx src/components/__tests__/GameCard.test.jsx`
Expected: PASS — all existing assertions pass unchanged, since `t()` output is byte-identical to the original hardcoded strings.

- [ ] **Step 4: Commit**

```bash
git add src/components/Dashboard.jsx src/components/GameCard.jsx
git commit -m "feat(i18n): migrate Dashboard and GameCard strings to translation keys"
```

---

### Task 3: Migrate AdminPage + ScoreHistory to i18n

**Files:**
- Modify: `src/admin/AdminPage.jsx`
- Modify: `src/components/ScoreHistory.jsx`

**Interfaces:**
- Consumes: `i18n.t()` keys under `admin.*` and `scoreHistory.empty` from Task 1's `en.json`.
- No prop/export signature changes.

- [ ] **Step 1: Update AdminPage.jsx**

```jsx
// src/admin/AdminPage.jsx
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSettings from '../hooks/useSettings'
import useScores from '../hooks/useScores'
import ScoreHistory from '../components/ScoreHistory'
import './AdminPage.css'

export default function AdminPage() {
  const { t } = useTranslation()
  const { settings, updateSetting, resetSettings } = useSettings()
  const { getAllScores } = useScores()

  return (
    <div className="admin">
      <div className="admin__header">
        <Link to="/" className="admin__back" aria-label={t('admin.back')}>←</Link>
        <h1 className="admin__title">{t('admin.title')}</h1>
      </div>

      <div className="admin__section">
        <h2>{t('admin.childNameHeading')}</h2>
        <p className="admin__hint">{t('admin.childNameHint')}</p>
        <input
          className="admin__text-input"
          type="text"
          placeholder={t('admin.childNamePlaceholder')}
          value={settings.childName || ''}
          onChange={e => updateSetting('childName', e.target.value)}
          aria-label={t('admin.childNameLabel')}
          spellCheck={false}
        />
      </div>

      <div className="admin__section">
        <h2>{t('admin.answerChoicesHeading')}</h2>
        <div className="admin__radios">
          {[2, 3, 4].map(n => (
            <label
              key={n}
              className={`admin__radio-label${settings.numChoices === n ? ' selected' : ''}`}
            >
              <input
                type="radio"
                name="numChoices"
                checked={settings.numChoices === n}
                onChange={() => updateSetting('numChoices', n)}
                aria-label={String(n)}
              />
              {n}
            </label>
          ))}
        </div>
      </div>

      <div className="admin__section">
        <h2>{t('admin.feedbackModeHeading')}</h2>
        <div className="admin__toggle">
          {[
            { value: 'immediate', label: t('admin.feedbackImmediate') },
            { value: 'parent-tap', label: t('admin.feedbackParentTap') },
          ].map(opt => (
            <button
              key={opt.value}
              className={`admin__toggle-btn${settings.feedbackMode === opt.value ? ' active' : ''}`}
              onClick={() => updateSetting('feedbackMode', opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin__section">
        <h2>{t('admin.questionsPerSessionHeading')}</h2>
        <div className="admin__radios">
          {[5, 10, 15, 20].map(n => (
            <label
              key={n}
              className={`admin__radio-label${settings.questionsPerSession === n ? ' selected' : ''}`}
            >
              <input
                type="radio"
                name="questionsPerSession"
                checked={settings.questionsPerSession === n}
                onChange={() => updateSetting('questionsPerSession', n)}
                aria-label={String(n)}
              />
              {n}
            </label>
          ))}
        </div>
      </div>

      <div className="admin__section">
        <h2>{t('admin.gaHeading')}</h2>
        <p className="admin__hint">{t('admin.gaHint')}</p>
        <input
          className="admin__text-input"
          type="text"
          placeholder="G-XXXXXXXXXX"
          value={settings.gaId || ''}
          onChange={e => updateSetting('gaId', e.target.value)}
          aria-label={t('admin.gaLabel')}
          spellCheck={false}
        />
      </div>

      <button className="admin__reset" onClick={resetSettings}>
        {t('admin.reset')}
      </button>

      <div className="admin__section">
        <h2>{t('admin.scoreHistoryHeading')}</h2>
        <ScoreHistory scores={getAllScores()} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update ScoreHistory.jsx**

```jsx
// src/components/ScoreHistory.jsx
import { useTranslation } from 'react-i18next'
import './ScoreHistory.css'

export default function ScoreHistory({ scores = [] }) {
  const { t } = useTranslation()
  if (scores.length === 0) {
    return <p className="score-history__empty">{t('scoreHistory.empty')}</p>
  }
  return (
    <ul className="score-history">
      {scores.map(s => (
        <li key={s.timestamp} className="score-history__item">
          <span className="score-history__result">{s.score} / {s.total}</span>
          <span className="score-history__date">{s.date ?? new Date(s.timestamp).toLocaleDateString()}</span>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: Run existing tests to confirm no regressions**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx src/components/__tests__/ScoreHistory.test.jsx`
Expected: PASS — all existing assertions pass unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/admin/AdminPage.jsx src/components/ScoreHistory.jsx
git commit -m "feat(i18n): migrate AdminPage and ScoreHistory strings to translation keys"
```

---

### Task 4: Migrate Animal Sounds data + game component to i18n

**Files:**
- Modify: `src/games/animal-sounds/data/animals.js`
- Modify: `src/games/animal-sounds/index.jsx`
- Modify: `src/games/animal-sounds/__tests__/animals.test.js`

**Interfaces:**
- Produces: each animal object now has `nameKey` (e.g. `'animal.cow.name'`) instead of `name`. Consumed by `AnimalSoundsGame` via `t(animal.nameKey)`.
- Consumes: `i18n.t()` keys `animalSounds.prompt`, `animalSounds.replay`, `common.progress`, `common.scoreLabel`, `common.playAgain`, `common.home` from Task 1's `en.json`.

- [ ] **Step 1: Update the failing data test first**

```js
// src/games/animal-sounds/__tests__/animals.test.js
import { describe, it, expect } from 'vitest'
import animals from '../data/animals'

describe('animals data', () => {
  it('exports an array of at least 12 animals', () => {
    expect(Array.isArray(animals)).toBe(true)
    expect(animals.length).toBeGreaterThanOrEqual(12)
  })

  it('every animal has required fields', () => {
    for (const animal of animals) {
      expect(animal.id,      `${animal.nameKey} missing id`).toBeTruthy()
      expect(animal.nameKey, `${animal.id} missing nameKey`).toBeTruthy()
      expect(animal.emoji,   `${animal.id} missing emoji`).toBeTruthy()
      expect(animal.sound,   `${animal.id} missing sound`).toBeTruthy()
    }
  })

  it('all ids are unique', () => {
    const ids = animals.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all nameKeys point at a real translation key prefix', () => {
    for (const animal of animals) {
      expect(animal.nameKey).toBe(`animal.${animal.id}.name`)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/games/animal-sounds/__tests__/animals.test.js`
Expected: FAIL — `animal.nameKey` is undefined (data file still has `name`).

- [ ] **Step 3: Update the data file**

```js
// src/games/animal-sounds/data/animals.js
const animals = [
  { id: 'elephant', nameKey: 'animal.elephant.name', emoji: '🐘', sound: 'elephant.mp3' },
  { id: 'lion',     nameKey: 'animal.lion.name',     emoji: '🦁', sound: 'lion.mp3' },
  { id: 'cow',      nameKey: 'animal.cow.name',      emoji: '🐄', sound: 'cow.mp3' },
  { id: 'dog',      nameKey: 'animal.dog.name',      emoji: '🐕', sound: 'dog.mp3' },
  { id: 'cat',      nameKey: 'animal.cat.name',      emoji: '🐈', sound: 'cat.mp3' },
  { id: 'frog',     nameKey: 'animal.frog.name',     emoji: '🐸', sound: 'frog.mp3' },
  { id: 'duck',     nameKey: 'animal.duck.name',     emoji: '🦆', sound: 'duck.mp3' },
  { id: 'horse',    nameKey: 'animal.horse.name',    emoji: '🐴', sound: 'horse.mp3' },
  { id: 'pig',      nameKey: 'animal.pig.name',      emoji: '🐷', sound: 'pig.mp3' },
  { id: 'sheep',    nameKey: 'animal.sheep.name',    emoji: '🐑', sound: 'sheep.mp3' },
  { id: 'rooster',  nameKey: 'animal.rooster.name',  emoji: '🐓', sound: 'rooster.mp3' },
  { id: 'owl',      nameKey: 'animal.owl.name',      emoji: '🦉', sound: 'owl.mp3' },
]

export default animals
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/games/animal-sounds/__tests__/animals.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Update the game component**

In `src/games/animal-sounds/index.jsx`, add the import and hook, and replace the three hardcoded strings:

```jsx
// add near the top with the other imports
import { useTranslation } from 'react-i18next'
```

Inside `export default function AnimalSoundsGame({ onGameEnd }) {`, add as the first line of the body:

```jsx
  const { t } = useTranslation()
```

Replace the prompt line:

```jsx
        <div className="game__prompt">{t('animalSounds.prompt')}</div>
```

Replace the replay button's aria-label:

```jsx
        <button className="game__replay" aria-label={t('animalSounds.replay')} onClick={playSound}>🔊</button>
```

Replace the progress line:

```jsx
        <div className="game__progress">{t('common.progress', { current: index + 1, total: queue.length })}</div>
```

Replace the choice name span:

```jsx
              <span className="game__choice-name">{t(animal.nameKey)}</span>
```

In the results screen (`if (done)` block), replace the label and buttons:

```jsx
        <div className="results__label">{t('common.scoreLabel', { score: scoreRef.current, total })}</div>
        <div className="results__actions">
          <button className="results__btn results__btn--play" onClick={restart}>{t('common.playAgain')}</button>
          <button className="results__btn results__btn--home" onClick={() => onGameEnd(scoreRef.current, total)}>{t('common.home')}</button>
        </div>
```

- [ ] **Step 6: Run the game's existing test file to confirm no regressions**

Run: `npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`
Expected: PASS — all 5 existing tests pass unchanged (rendered text is byte-identical to before).

- [ ] **Step 7: Commit**

```bash
git add src/games/animal-sounds
git commit -m "feat(i18n): migrate Animal Sounds data and game strings to translation keys"
```

---

### Task 5: Migrate Color Match data + game component to i18n

**Files:**
- Modify: `src/games/color-match/data/colors.js`
- Modify: `src/games/color-match/index.jsx`
- Modify: `src/games/color-match/__tests__/colors.test.js`

**Interfaces:**
- Produces: each color object now has `nameKey` (e.g. `'color.red.name'`) instead of `name`. Consumed by `ColorMatchGame` via `t(color.nameKey)`.
- Consumes: `i18n.t()` keys `colorMatch.prompt`, `common.progress`, `common.scoreLabel`, `common.playAgain`, `common.home` from Task 1's `en.json`.

- [ ] **Step 1: Update the failing data test first**

```js
// src/games/color-match/__tests__/colors.test.js
import { describe, it, expect } from 'vitest'
import colors from '../data/colors'

describe('colors data', () => {
  it('exports an array of at least 8 colors', () => {
    expect(Array.isArray(colors)).toBe(true)
    expect(colors.length).toBeGreaterThanOrEqual(8)
  })

  it('every color has required fields', () => {
    for (const color of colors) {
      expect(color.id,      `${color.nameKey} missing id`).toBeTruthy()
      expect(color.nameKey, `${color.id} missing nameKey`).toBeTruthy()
      expect(color.emoji,   `${color.id} missing emoji`).toBeTruthy()
      expect(color.color,   `${color.id} missing color`).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('all ids are unique', () => {
    const ids = colors.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all nameKeys point at a real translation key prefix', () => {
    for (const color of colors) {
      expect(color.nameKey).toBe(`color.${color.id}.name`)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/games/color-match/__tests__/colors.test.js`
Expected: FAIL — `color.nameKey` is undefined.

- [ ] **Step 3: Update the data file**

```js
// src/games/color-match/data/colors.js
const colors = [
  { id: 'red',       nameKey: 'color.red.name',    color: '#E53935', emoji: '🍎' },
  { id: 'orange',    nameKey: 'color.orange.name', color: '#FB8C00', emoji: '🍊' },
  { id: 'yellow',    nameKey: 'color.yellow.name', color: '#FDD835', emoji: '🍌' },
  { id: 'green',     nameKey: 'color.green.name',  color: '#43A047', emoji: '🍃' },
  { id: 'blue',      nameKey: 'color.blue.name',   color: '#1E88E5', emoji: '🫐' },
  { id: 'purple',    nameKey: 'color.purple.name', color: '#8E24AA', emoji: '🍇' },
  { id: 'pink',      nameKey: 'color.pink.name',   color: '#F06292', emoji: '🌸' },
  { id: 'brown',     nameKey: 'color.brown.name',  color: '#6D4C41', emoji: '🌰' },
  { id: 'black',     nameKey: 'color.black.name',  color: '#212121', emoji: '🎩' },
  { id: 'white',     nameKey: 'color.white.name',  color: '#FAFAFA', emoji: '☁️' },
  { id: 'gray',      nameKey: 'color.gray.name',   color: '#9E9E9E', emoji: '🪨' },
]

export default colors
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/games/color-match/__tests__/colors.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Update the game component**

In `src/games/color-match/index.jsx`, add the import and hook:

```jsx
import { useTranslation } from 'react-i18next'
```

Inside `export default function ColorMatchGame({ onGameEnd }) {`, add as the first line of the body:

```jsx
  const { t } = useTranslation()
```

Replace the prompt line:

```jsx
        <div className="game__prompt">{t('colorMatch.prompt')}</div>
```

Replace the progress line:

```jsx
        <div className="game__progress">{t('common.progress', { current: index + 1, total: queue.length })}</div>
```

Replace the choice name span:

```jsx
              <span className="game__choice-name">{t(color.nameKey)}</span>
```

In the results screen (`if (done)` block), replace the label and buttons:

```jsx
        <div className="results__label">{t('common.scoreLabel', { score: scoreRef.current, total })}</div>
        <div className="results__actions">
          <button className="results__btn results__btn--play" onClick={restart}>{t('common.playAgain')}</button>
          <button className="results__btn results__btn--home" onClick={() => onGameEnd(scoreRef.current, total)}>{t('common.home')}</button>
        </div>
```

- [ ] **Step 6: Run the game's existing test file to confirm no regressions**

Run: `npx vitest run src/games/color-match/__tests__/ColorMatchGame.test.jsx`
Expected: PASS — all 5 existing tests pass unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/games/color-match
git commit -m "feat(i18n): migrate Color Match data and game strings to translation keys"
```

---

### Task 6: Automated accessibility audit (jest-axe)

**Files:**
- Modify: `src/test-setup.js`
- Modify: `src/components/__tests__/Dashboard.test.jsx`
- Modify: `src/components/__tests__/GameCard.test.jsx`
- Modify: `src/components/__tests__/ScoreHistory.test.jsx`
- Modify: `src/admin/__tests__/AdminPage.test.jsx`
- Modify: `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`
- Modify: `src/games/color-match/__tests__/ColorMatchGame.test.jsx`

**Interfaces:**
- Produces: `toHaveNoViolations` matcher available globally in every Vitest test via `expect.extend` in `test-setup.js`.
- Consumes: `jest-axe`'s `axe()` function and RTL's `render(...).container`.

- [ ] **Step 1: Install jest-axe**

Run: `npm install -D jest-axe`

- [ ] **Step 2: Extend the global matcher**

```js
// src/test-setup.js
import '@testing-library/jest-dom'
import { expect } from 'vitest'
import { toHaveNoViolations } from 'jest-axe'
import './i18n'

expect.extend(toHaveNoViolations)
```

- [ ] **Step 3: Add the assertion to Dashboard.test.jsx**

Add this import:

```js
import { axe } from 'jest-axe'
```

Add this test inside the existing `describe('Dashboard', ...)` block:

```js
  it('has no accessibility violations', async () => {
    const { container } = render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(await axe(container)).toHaveNoViolations()
  })
```

- [ ] **Step 4: Add the assertion to GameCard.test.jsx**

Add this import:

```js
import { axe } from 'jest-axe'
```

Add this test inside the existing `describe('GameCard', ...)` block:

```js
  it('has no accessibility violations', async () => {
    const { container } = renderCard()
    expect(await axe(container)).toHaveNoViolations()
  })
```

- [ ] **Step 5: Add the assertion to ScoreHistory.test.jsx**

Add this import:

```js
import { axe } from 'jest-axe'
```

Add this test inside the existing `describe('ScoreHistory', ...)` block:

```js
  it('has no accessibility violations', async () => {
    const { container } = render(<ScoreHistory scores={scores} />)
    expect(await axe(container)).toHaveNoViolations()
  })
```

- [ ] **Step 6: Add the assertion to AdminPage.test.jsx**

Add this import:

```js
import { axe } from 'jest-axe'
```

Add this test inside the existing `describe('AdminPage', ...)` block:

```js
  it('has no accessibility violations', async () => {
    const { container } = render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(await axe(container)).toHaveNoViolations()
  })
```

- [ ] **Step 7: Add the assertion to AnimalSoundsGame.test.jsx and ColorMatchGame.test.jsx**

Add this import to both files:

```js
import { axe } from 'jest-axe'
```

Add this test inside each `describe(...)` block (using each file's existing render pattern):

```js
  it('has no accessibility violations', async () => {
    let container
    await act(async () => { container = render(<AnimalSoundsGame onGameEnd={onGameEnd} />).container })
    expect(await axe(container)).toHaveNoViolations()
  })
```

(Use `ColorMatchGame` in place of `AnimalSoundsGame` in that file's copy.)

- [ ] **Step 8: Run the full test suite**

Run: `npx vitest run`
Expected: PASS. If any `toHaveNoViolations()` assertion fails, axe's error message names the specific rule and element (e.g. "aria-label" missing on a button) — fix that exact issue in the named component file, then re-run this command until everything passes.

- [ ] **Step 9: Commit**

```bash
git add src/test-setup.js src/components/__tests__ src/admin/__tests__ src/games package.json package-lock.json
git commit -m "test(a11y): add jest-axe accessibility assertions to component tests"
```

---

### Task 7: Playwright setup + dashboard/admin E2E specs

**Files:**
- Create: `playwright.config.js`
- Create: `e2e/dashboard.spec.js`
- Create: `e2e/admin.spec.js`
- Modify: `package.json` (add `e2e` script)
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run e2e` runs the full Playwright suite against `npm run dev` on `http://localhost:5173`.
- Consumes: nothing from prior tasks at runtime (E2E specs drive the real built app), but rely on Task 2/3's translated strings rendering the same text as before.

- [ ] **Step 1: Install Playwright and axe**

Run: `npm install -D @playwright/test @axe-core/playwright`
Run: `npx playwright install --with-deps chromium`

- [ ] **Step 2: Create the Playwright config**

```js
// playwright.config.js
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

- [ ] **Step 3: Add the npm script**

In `package.json`, add to `"scripts"`:

```json
    "e2e": "playwright test",
```

- [ ] **Step 4: Write the dashboard spec**

```js
// e2e/dashboard.spec.js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('dashboard shows both game cards and the settings link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Animal Sounds')).toBeVisible()
  await expect(page.getByText('Color Match')).toBeVisible()
  await expect(page.getByRole('link', { name: '⚙️ Settings' })).toHaveAttribute('href', '/admin')
})

test('dashboard has no accessibility violations', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

- [ ] **Step 5: Write the admin spec**

```js
// e2e/admin.spec.js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('admin settings persist after reload', async ({ page }) => {
  await page.goto('/admin')
  await page.getByLabel("Child's Name").fill('Mia')
  await page.getByRole('radio', { name: '4' }).check()

  await page.reload()

  await expect(page.getByLabel("Child's Name")).toHaveValue('Mia')
  await expect(page.getByRole('radio', { name: '4' })).toBeChecked()
})

test('admin page has no accessibility violations', async ({ page }) => {
  await page.goto('/admin')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

- [ ] **Step 6: Update .gitignore**

Add these lines:

```
# Playwright
playwright-report/
test-results/
```

- [ ] **Step 7: Run the new specs**

Run: `npm run e2e -- dashboard.spec.js admin.spec.js`
Expected: PASS (4 tests). If the admin reset between runs leaves `childName: 'Mia'` from a prior run, that's expected — the spec only checks the value round-trips, not what the value started as.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.js e2e/dashboard.spec.js e2e/admin.spec.js package.json package-lock.json .gitignore
git commit -m "test(e2e): add Playwright config and dashboard/admin E2E specs"
```

---

### Task 8: Game-session E2E specs

**Files:**
- Create: `e2e/animal-sounds.spec.js`
- Create: `e2e/color-match.spec.js`

**Interfaces:**
- Consumes: `[data-animal-id]` / `[data-color-id]` attributes already present on each game's choice buttons (see `src/games/animal-sounds/index.jsx` and `src/games/color-match/index.jsx`) and the `t('common.scoreLabel')` / `t('common.home')` text from Task 4/5.

- [ ] **Step 1: Write the Animal Sounds play-through spec**

```js
// e2e/animal-sounds.spec.js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('animal sounds: full play-through reaches results and returns home', async ({ page }) => {
  await page.goto('/game/animal-sounds')

  for (let i = 0; i < 10; i++) {
    if (await page.getByText(/you scored/i).isVisible()) break
    await page.locator('[data-animal-id]').first().click()
    await page.waitForTimeout(1600)
  }

  await expect(page.getByText(/you scored/i)).toBeVisible()

  await page.getByRole('button', { name: 'Home' }).click()
  await expect(page).toHaveURL('/')
})

test('animal sounds game screen has no accessibility violations', async ({ page }) => {
  await page.goto('/game/animal-sounds')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

- [ ] **Step 2: Write the Color Match play-through spec**

```js
// e2e/color-match.spec.js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('color match: full play-through reaches results and returns home', async ({ page }) => {
  await page.goto('/game/color-match')

  for (let i = 0; i < 10; i++) {
    if (await page.getByText(/you scored/i).isVisible()) break
    await page.locator('[data-color-id]').first().click()
    await page.waitForTimeout(1600)
  }

  await expect(page.getByText(/you scored/i)).toBeVisible()

  await page.getByRole('button', { name: 'Home' }).click()
  await expect(page).toHaveURL('/')
})

test('color match game screen has no accessibility violations', async ({ page }) => {
  await page.goto('/game/color-match')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

- [ ] **Step 3: Run the new specs**

Run: `npm run e2e -- animal-sounds.spec.js color-match.spec.js`
Expected: PASS (4 tests). Default settings are `numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 10` — the loop's 10-iteration cap matches the default session length with one margin iteration via the early-exit check.

- [ ] **Step 4: Commit**

```bash
git add e2e/animal-sounds.spec.js e2e/color-match.spec.js
git commit -m "test(e2e): add full play-through E2E specs for both games"
```

---

### Task 9: Storybook + stories for shared components

**Files:**
- Create: `.storybook/main.js`
- Create: `.storybook/preview.js`
- Create: `src/components/GameCard.stories.jsx`
- Create: `src/components/Dashboard.stories.jsx`
- Create: `src/components/ScoreHistory.stories.jsx`
- Create: `src/admin/AdminPage.stories.jsx`
- Modify: `package.json` (add `storybook` / `build-storybook` scripts)
- Modify: `.gitignore`

**Interfaces:**
- Produces: Storybook dev server on port 6006, serving each story at a predictable `iframe.html?id=<title-slug>--<export-slug>` URL, consumed by Task 10's visual regression spec.

- [ ] **Step 1: Install Storybook**

Run: `npm install -D storybook @storybook/react-vite @storybook/addon-essentials`

- [ ] **Step 2: Create Storybook config**

```js
// .storybook/main.js
/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: ['../src/**/*.stories.@(js|jsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
}

export default config
```

```js
// .storybook/preview.js
import '../src/index.css'
import '../src/i18n'

const disableMotionStyle = document.createElement('style')
disableMotionStyle.innerHTML = '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }'
document.head.appendChild(disableMotionStyle)

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  parameters: {
    controls: { expanded: true },
  },
}

export default preview
```

- [ ] **Step 3: Add npm scripts**

In `package.json`, add to `"scripts"`:

```json
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build",
```

- [ ] **Step 4: Write GameCard stories**

```jsx
// src/components/GameCard.stories.jsx
import { MemoryRouter } from 'react-router-dom'
import GameCard from './GameCard'

export default {
  title: 'Components/GameCard',
  component: GameCard,
  decorators: [Story => <MemoryRouter><Story /></MemoryRouter>],
}

const manifest = {
  id: 'animal-sounds',
  name: 'Animal Sounds',
  description: 'Match the animal to its sound!',
  icon: '🐘',
  color: '#B39DDB',
}

export const Default = { args: { manifest, bestScore: 0 } }
export const WithBestScore = { args: { manifest, bestScore: 8 } }
```

- [ ] **Step 5: Write Dashboard stories**

```jsx
// src/components/Dashboard.stories.jsx
import { MemoryRouter } from 'react-router-dom'
import Dashboard from './Dashboard'

export default {
  title: 'Components/Dashboard',
  component: Dashboard,
  decorators: [Story => <MemoryRouter><Story /></MemoryRouter>],
}

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds', description: 'Match the animal to its sound!', icon: '🐘', color: '#B39DDB' },
  { id: 'color-match', name: 'Color Match', description: 'Match the color to its object!', icon: '🎨', color: '#CE93D8' },
]

export const Default = { args: { manifests } }
export const Empty = { args: { manifests: [] } }
```

- [ ] **Step 6: Write ScoreHistory stories**

```jsx
// src/components/ScoreHistory.stories.jsx
import ScoreHistory from './ScoreHistory'

export default {
  title: 'Components/ScoreHistory',
  component: ScoreHistory,
}

const scores = [
  { gameId: 'animal-sounds', score: 9, total: 10, date: '2026-06-07', timestamp: 2000 },
  { gameId: 'animal-sounds', score: 6, total: 10, date: '2026-06-06', timestamp: 1000 },
]

export const Default = { args: { scores } }
export const Empty = { args: { scores: [] } }
```

- [ ] **Step 7: Write AdminPage stories**

```jsx
// src/admin/AdminPage.stories.jsx
import { MemoryRouter } from 'react-router-dom'
import AdminPage from './AdminPage'

export default {
  title: 'Pages/AdminPage',
  component: AdminPage,
  decorators: [Story => <MemoryRouter><Story /></MemoryRouter>],
}

export const Default = {}
```

- [ ] **Step 8: Update .gitignore**

Add this line:

```
storybook-static/
```

- [ ] **Step 9: Verify Storybook builds**

Run: `npm run build-storybook`
Expected: build succeeds, `storybook-static/` is generated with no errors.

- [ ] **Step 10: Commit**

```bash
git add .storybook src/components/GameCard.stories.jsx src/components/Dashboard.stories.jsx src/components/ScoreHistory.stories.jsx src/admin/AdminPage.stories.jsx package.json package-lock.json .gitignore
git commit -m "feat(storybook): add Storybook config and stories for shared components"
```

---

### Task 10: Game stories + visual regression baselines

**Files:**
- Create: `src/games/animal-sounds/AnimalSoundsGame.stories.jsx`
- Create: `src/games/color-match/ColorMatchGame.stories.jsx`
- Create: `e2e/visual.spec.js`
- Modify: `playwright.config.js` (add second `webServer` entry for Storybook)

**Interfaces:**
- Consumes: Storybook story IDs from Task 9 (`components-gamecard--default`, etc.) plus the two new game story IDs, by Storybook's standard `<title-slug>--<export-slug>` convention.
- Produces: committed baseline screenshots in `e2e/visual.spec.js-snapshots/`, diffed by every future `npm run e2e` run.

- [ ] **Step 1: Write Animal Sounds game stories**

```jsx
// src/games/animal-sounds/AnimalSoundsGame.stories.jsx
import AnimalSoundsGame from './index'

export default {
  title: 'Games/AnimalSoundsGame',
  component: AnimalSoundsGame,
}

export const Default = { args: { onGameEnd: () => {} } }
```

- [ ] **Step 2: Write Color Match game stories**

```jsx
// src/games/color-match/ColorMatchGame.stories.jsx
import ColorMatchGame from './index'

export default {
  title: 'Games/ColorMatchGame',
  component: ColorMatchGame,
}

export const Default = { args: { onGameEnd: () => {} } }
```

- [ ] **Step 3: Add Storybook as a second Playwright web server**

```js
// playwright.config.js
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run storybook -- --ci',
      url: 'http://localhost:6006',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

- [ ] **Step 4: Write the visual regression spec**

```js
// e2e/visual.spec.js
import { test, expect } from '@playwright/test'

const stories = [
  'components-gamecard--default',
  'components-gamecard--with-best-score',
  'components-dashboard--default',
  'components-dashboard--empty',
  'components-scorehistory--default',
  'components-scorehistory--empty',
  'pages-adminpage--default',
  'games-animalsoundsgame--default',
  'games-colormatchgame--default',
]

for (const id of stories) {
  test(`visual: ${id}`, async ({ page }) => {
    await page.goto(`http://localhost:6006/iframe.html?id=${id}&viewMode=story`)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot(`${id}.png`)
  })
}
```

- [ ] **Step 5: Generate baseline screenshots**

Run: `npm run e2e -- visual.spec.js`
Expected: every test FAILS the first time with "snapshot doesn't exist, writing actual" — this is expected; Playwright writes new baseline PNGs to `e2e/visual.spec.js-snapshots/`.

- [ ] **Step 6: Re-run to confirm baselines are stable**

Run: `npm run e2e -- visual.spec.js`
Expected: PASS (9 tests) — baselines now exist and match. If any test fails on this second run, the story has non-deterministic rendering (e.g. an animation not caught by the `preview.js` motion-disable rule); inspect the diff image Playwright outputs and add a more targeted override to `.storybook/preview.js` for that component.

- [ ] **Step 7: Commit, including the baseline images**

```bash
git add src/games/animal-sounds/AnimalSoundsGame.stories.jsx src/games/color-match/ColorMatchGame.stories.jsx e2e/visual.spec.js e2e/visual.spec.js-snapshots playwright.config.js
git commit -m "test(visual): add Storybook game stories and Playwright screenshot baselines"
```

---

### Task 11: Documentation updates

**Files:**
- Modify: `README.md`
- Create: `docs/TESTING.md`
- Modify: `CLAUDE.md`
- Modify: `docs/ENHANCEMENTS.md`

**Interfaces:**
- None — documentation only, no code interfaces produced or consumed.

- [ ] **Step 1: Create docs/TESTING.md**

```markdown
# Testing

The Playground has four layers of automated testing, all runnable locally with no external accounts or services.

## Unit & component tests (Vitest + React Testing Library)

```bash
npm test          # watch mode
npm run coverage  # single run with coverage report
```

Tests live in `__tests__/` folders next to the code under test. A few patterns used throughout:

- **Fake timers:** tests covering timed feedback (correct/wrong answer delays) use `vi.useFakeTimers()` with `fireEvent`, not `userEvent` — `userEvent` deadlocks with fake timers in this stack.
- **Mocking the adapter:** hook tests mock `src/storage/index.js` via `vi.mock()` + `vi.hoisted()` so the mock exists before the hoisted call runs.
- **`data-testid` for game internals:** each game exposes a hidden `data-testid="correct-<thing>-id"` element so tests can assert the correct answer without depending on choice display order.

## Accessibility audits (jest-axe + axe-core/playwright)

Two layers:

- **Component level:** every component/game test file asserts `expect(await axe(container)).toHaveNoViolations()` using `jest-axe`. Runs automatically with `npm test`.
- **Page level:** every E2E spec (below) includes an `@axe-core/playwright` scan of its main screen, catching layout/contrast issues a jsdom-based check can't see.

If either layer reports a violation, the failure message names the specific rule and element — fix the underlying component (usually a missing `aria-label`, invalid role, or heading order issue), don't suppress the check.

## End-to-end tests (Playwright)

```bash
npm run e2e
```

Specs live in `e2e/`, covering: the dashboard, both games' full play-through (launch → answer all questions → results → home), and admin settings persistence. Playwright starts both `npm run dev` (port 5173) and `npm run storybook -- --ci` (port 6006) automatically via the `webServer` array in `playwright.config.js`.

## Visual regression (Storybook + Playwright screenshots)

```bash
npm run storybook         # browse stories locally at localhost:6006
npm run build-storybook   # production build check
```

Key components and both games have stories under `src/**/*.stories.jsx`. `e2e/visual.spec.js` navigates to each story's isolated URL and asserts `toHaveScreenshot()` against a baseline PNG committed in `e2e/visual.spec.js-snapshots/`.

**Updating a baseline after an intentional UI change:**

```bash
npx playwright test visual.spec.js --update-snapshots
```

Review the diff, then commit the updated PNGs alongside the UI change.

No Chromatic account is used — this is fully local. The setup is structured so Chromatic could be added later as an additional check without restructuring the stories.

## i18n string convention

All user-facing UI strings live in `src/i18n/en.json`, organized by feature namespace (`dashboard.*`, `admin.*`, `animalSounds.*`, etc.). When adding a new game:

- Add a namespace for its UI strings (prompt, any game-specific labels).
- Give each data item (animal, color, shape, etc.) a `nameKey` field pointing at `<category>.<id>.name` instead of a literal `name` string.
- Call `useTranslation()` in the game component and resolve display text via `t(...)`, never hardcode literal English strings in JSX.

Manifest fields (`name`, `description` in `manifest.json`) are NOT translated — they're game-author metadata, not core-engine UI strings.
```

- [ ] **Step 2: Trim README.md's Testing section**

Replace the existing `## Testing` section (the block starting at `## Testing` and ending right before `## Settings Reference`) with:

```markdown
## Testing

The Playground has four layers of automated testing — unit/component (Vitest + RTL), accessibility audits (jest-axe + axe-core/playwright), end-to-end (Playwright), and visual regression (Storybook + Playwright screenshots) — all runnable locally with no external accounts. See [`docs/TESTING.md`](docs/TESTING.md) for the full reference, including how to run each layer and update visual baselines.

```bash
npm test          # unit/component tests, watch mode
npm run e2e        # end-to-end + accessibility + visual regression
npm run storybook  # browse component/game stories locally
```

---
```

- [ ] **Step 3: Update CLAUDE.md's Commands section**

In `CLAUDE.md`, replace the `## Commands` code block with:

```markdown
## Commands

```bash
npm run dev              # dev server (Vite, polling watcher enabled — repo lives on a network share)
npm run build             # production build → dist/
npm run lint               # eslint .
npm test                     # vitest, watch mode
npm run coverage              # vitest run --coverage (single run)
npm run e2e                    # playwright test — E2E, page-level a11y, and visual regression
npm run storybook                # browse component/game stories at localhost:6006
npm run build-storybook           # production Storybook build check
```

Run a single test file: `npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`

See [`docs/TESTING.md`](docs/TESTING.md) for the full testing reference (a11y, E2E, visual regression, i18n string convention).
```

- [ ] **Step 4: Remove completed items from docs/ENHANCEMENTS.md**

In `docs/ENHANCEMENTS.md`, delete these four bullets from the `## Technical` section:

```markdown
- **i18n / localization** — wrap UI strings in an i18n library so animal names and prompts can be translated
- **Automated accessibility audit** — add `axe-core` to the test suite to catch a11y regressions
- **End-to-end tests** — add Playwright tests for full game-session flows
- **Visual regression tests** — snapshot key screens with Storybook or Chromatic
```

Leave the remaining `## Technical` bullet (`CI pipeline`) and all other sections untouched.

- [ ] **Step 5: Run full verification**

Run: `npx vitest run`
Expected: PASS, all tests including new i18n and a11y assertions.

Run: `npm run e2e`
Expected: PASS, all E2E, page-level a11y, and visual regression specs.

Run: `npm run build`
Expected: production build succeeds with no errors.

- [ ] **Step 6: One-time dev/build parity check**

Run: `npm run build && npm run preview -- --port 4173` in one terminal, then in another: `npx playwright test dashboard.spec.js admin.spec.js animal-sounds.spec.js color-match.spec.js --config=playwright.config.js -g "" ` with `PLAYWRIGHT_BASE_URL=http://localhost:4173` — concretely:

```bash
npm run build
npm run preview -- --port 4173 &
PW_TEST_BASE_URL=http://localhost:4173 npx playwright test dashboard.spec.js admin.spec.js animal-sounds.spec.js color-match.spec.js
```

Expected: PASS against the production build too, confirming no dev-only behavior (e.g. HMR timing) masked a bug. This is a one-time sanity check for this sub-project, not a permanent dual-run — normal future use is just `npm run e2e` against `npm run dev`.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/TESTING.md CLAUDE.md docs/ENHANCEMENTS.md
git commit -m "docs: document testing layers and i18n convention; close out Technical enhancements"
```
