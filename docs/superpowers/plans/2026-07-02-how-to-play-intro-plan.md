# How-to-Play Intro Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a core-engine "how-to-play" intro screen that shows before a game's first question on initial mount, with a per-game "don't show again" opt-out and an admin control to bring it back.

**Architecture:** `useGameSession` gains the gating state (`showIntro`, `settingsLoaded`, `dontShowAgain`, `setDontShowAgain`, `dismissIntro`); a new shared `GameIntro` component renders when `showIntro` is true, following the exact boundary pattern `GameResults` already uses for `done`. Both existing games render it explicitly. A new `introDismissed` settings map persists permanent dismissal per game; AdminPage's Games tab gets a "Replay Intro" button per game to clear it.

**Tech Stack:** React 18, Vite, Vitest + React Testing Library + jest-axe, Playwright (E2E + visual regression + a11y), react-i18next, Storybook.

**Spec:** `docs/superpowers/specs/2026-07-02-how-to-play-intro-design.md`

## Global Constraints

- All user-facing UI strings go through `t('namespace.key')` — never hardcode English text in JSX (`docs/TESTING.md` i18n convention).
- `manifest.json` fields (`name`, `icon`, `description`) are game-author metadata, not translated.
- Component tests assert `expect(await axe(container)).toHaveNoViolations()` on every new/changed component.
- Hook/component tests mock `src/hooks/useSettings.js` (or `src/storage/index.js` for lower-level hook tests) — never hit real `localStorage`.
- Tests covering timed feedback use `vi.useFakeTimers()` + `fireEvent`, not `userEvent` (they deadlock together in this stack). Tests with no timed feedback may use `userEvent` normally.
- CSS uses existing design tokens (`var(--color-*)`, `var(--radius-button)`) rather than hardcoded equivalents.
- `package.json` version bumps `0.6.0` → `0.7.0` (minor — explicit user request); both game `manifest.json` files bump their own minor version (`1.2.0` → `1.3.0`) since both games' UI is changing.
- The app is unpublished — no migration handling needed for the new `introDismissed` settings field.

---

### Task 1: `useGameSession` — intro gating engine mechanic

**Files:**
- Modify: `src/storage/adapter.js`
- Modify: `src/hooks/useGameSession.js`
- Test: `src/hooks/__tests__/useGameSession.test.js`

**Interfaces:**
- Produces: `useGameSession(...)` return value gains `showIntro` (boolean), `settingsLoaded` (boolean), `dontShowAgain` (boolean), `setDontShowAgain(bool)`, `dismissIntro(dontShowAgainFlag)`. `DEFAULT_SETTINGS.introDismissed` (`{ [gameId: string]: true }`, default `{}`).

- [ ] **Step 1: Write the failing tests**

In `src/hooks/__tests__/useGameSession.test.js`, replace lines 1–52 (imports through the top-level `beforeEach`) with:

```js
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockAddScore, mockFireConfetti, mockRecordStreak, mockUpdateSetting } = vi.hoisted(() => ({
  mockAddScore: vi.fn().mockResolvedValue(undefined),
  mockFireConfetti: vi.fn(),
  mockRecordStreak: vi.fn().mockResolvedValue(undefined),
  mockUpdateSetting: vi.fn().mockResolvedValue(undefined),
}))

let mockSettings = {
  numChoices: 2, feedbackMode: 'parent-tap', questionsPerSession: 3, animationsEnabled: true,
  timerDisplayEnabled: true,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false,
  introDismissed: {},
}
let mockLoaded = true

vi.mock('../useSettings', () => ({
  default: () => ({ settings: mockSettings, loaded: mockLoaded, updateSetting: mockUpdateSetting }),
}))

vi.mock('../useScores', () => ({
  default: () => ({ addScore: mockAddScore }),
}))

vi.mock('../useBestStreak', () => ({
  default: () => ({ bestStreak: 4, recordStreak: mockRecordStreak }),
}))

vi.mock('../../lib/confetti', () => ({
  fireConfetti: mockFireConfetti,
}))

import useGameSession from '../useGameSession'

const items = [
  { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' },
]

function setSettings(overrides) {
  mockSettings = { ...mockSettings, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoaded = true
  mockSettings = {
    numChoices: 2, feedbackMode: 'parent-tap', questionsPerSession: 3, animationsEnabled: true,
    timerDisplayEnabled: true,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false,
    introDismissed: {},
  }
})
```

Then append this new `describe` block at the end of the file (after the closing `})` of `describe('useGameSession — difficulty auto-progression', ...)`):

```js
describe('useGameSession — how-to-play intro', () => {
  it('shows the intro on initial mount when the game has no introDismissed entry', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.settingsLoaded).toBe(true))
    expect(result.current.showIntro).toBe(true)
  })

  it('does not show the intro when introDismissed is set for this gameId', async () => {
    setSettings({ introDismissed: { 'test-game': true } })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.settingsLoaded).toBe(true))
    expect(result.current.showIntro).toBe(false)
  })

  it('shows the intro when only a different gameId is dismissed', async () => {
    setSettings({ introDismissed: { 'other-game': true } })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.settingsLoaded).toBe(true))
    expect(result.current.showIntro).toBe(true)
  })

  it('settingsLoaded and showIntro are both false before settings resolve', () => {
    mockLoaded = false
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    expect(result.current.settingsLoaded).toBe(false)
    expect(result.current.showIntro).toBe(false)
  })

  it('dismissIntro(false) hides the intro without persisting a setting', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.showIntro).toBe(true))

    await act(async () => { result.current.dismissIntro(false) })

    expect(result.current.showIntro).toBe(false)
    expect(mockUpdateSetting).not.toHaveBeenCalled()
  })

  it('dismissIntro(true) hides the intro and persists introDismissed for this gameId', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.showIntro).toBe(true))

    await act(async () => { result.current.dismissIntro(true) })

    expect(result.current.showIntro).toBe(false)
    expect(mockUpdateSetting).toHaveBeenCalledWith('introDismissed', { 'test-game': true })
  })

  it('dismissIntro(true) preserves other games\' existing introDismissed entries', async () => {
    setSettings({ introDismissed: { 'other-game': true } })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.showIntro).toBe(true))

    await act(async () => { result.current.dismissIntro(true) })

    expect(mockUpdateSetting).toHaveBeenCalledWith('introDismissed', { 'other-game': true, 'test-game': true })
  })

  it('showIntro does not reappear after restart()', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.showIntro).toBe(true))

    await act(async () => { result.current.dismissIntro(false) })
    await act(async () => { result.current.restart() })

    expect(result.current.showIntro).toBe(false)
  })

  it('setDontShowAgain toggles the dontShowAgain flag, defaulting to false', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.settingsLoaded).toBe(true))
    expect(result.current.dontShowAgain).toBe(false)

    act(() => { result.current.setDontShowAgain(true) })

    expect(result.current.dontShowAgain).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: the 9 new tests in `useGameSession — how-to-play intro` FAIL (`showIntro`/`settingsLoaded`/`dontShowAgain`/`setDontShowAgain`/`dismissIntro` are `undefined`); all pre-existing tests in the file still PASS (the mock additions are additive and don't change existing behavior).

- [ ] **Step 3: Implement the intro-gating state**

In `src/storage/adapter.js`, add `introDismissed: {}` to `DEFAULT_SETTINGS` (after `difficultyAutoProgressionEnabled`):

```js
export const DEFAULT_SETTINGS = {
  numChoices: 2,
  feedbackMode: 'immediate',
  questionsPerSession: 10,
  gaId: '',
  childName: '',
  animationsEnabled: true,
  tagOverrides: {},
  timerDisplayEnabled: true,
  maxTries: 'none',
  hintsEnabled: false,
  hintAfterWrongTaps: 2,
  retryCountsAsStreak: true,
  spacedRepetitionEnabled: false,
  difficultyAutoProgressionEnabled: false,
  introDismissed: {},
}
```

And update the doc comment's Settings shape line and add a new line documenting it:

```js
 * Settings shape: { numChoices, feedbackMode, questionsPerSession, gaId, childName, animationsEnabled, tagOverrides,
 *                    timerDisplayEnabled, maxTries, hintsEnabled, hintAfterWrongTaps, retryCountsAsStreak,
 *                    spacedRepetitionEnabled, difficultyAutoProgressionEnabled, introDismissed }
 *   maxTries: 'none' | 1 | 2 | 3 | 4 | 5 | 'unlimited' — 'none' reproduces pre-v0.6.0 behavior (locks on first wrong tap)
 *   introDismissed: { [gameId: string]: true } — gameIds present here permanently suppress that game's how-to-play intro
```

In `src/hooks/useGameSession.js`:

Change line 16 from:
```js
  const { settings, updateSetting } = useSettings()
```
to:
```js
  const { settings, loaded, updateSetting } = useSettings()
```

Add two new pieces of state after the existing `useState` block (after the `offerDifficultyBump` line, before the `// Refs` comment):
```js
  const [showIntro,           setShowIntro]           = useState(false)
  const [dontShowAgain,       setDontShowAgain]        = useState(false)
```

Add a new ref alongside the other refs (after `pendingReinsertRef`):
```js
  const introInitializedRef = useRef(false)
```

Add a new effect, placed right after the `useEffect(() => { onTimeoutRef.current = onTimeout })` line and before the queue-building effect:
```js
  // Runs once, when settings finish their initial async load. The ref guard
  // prevents later introDismissed writes (including this hook's own
  // dismissIntro call) from re-evaluating and re-showing/re-hiding the intro
  // mid-session.
  useEffect(() => {
    if (!loaded || introInitializedRef.current) return
    introInitializedRef.current = true
    setShowIntro(!settings.introDismissed?.[gameId])
  }, [loaded, settings.introDismissed, gameId])
```

Add a new `dismissIntro` function, placed after `restart()` and before `return`:
```js
  function dismissIntro(dontShowAgainFlag) {
    setShowIntro(false)
    if (dontShowAgainFlag) {
      updateSetting('introDismissed', { ...settings.introDismissed, [gameId]: true })
    }
  }
```

Update the final `return` statement to include the new fields:
```js
  return {
    current, index, total: queue.length, locked, disabledChoiceIds, hintActive, selected,
    score, streak, bestStreak, missed, done, feedbackMode, numChoices,
    currentElapsedMs, timings, timerDisplayEnabled, offerDifficultyBump,
    showIntro, settingsLoaded: loaded, dontShowAgain, setDontShowAgain,
    handleChoice, advance, restart, acceptDifficultyBump, dismissDifficultyBump, dismissIntro,
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: all tests PASS, including the 9 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/storage/adapter.js src/hooks/useGameSession.js src/hooks/__tests__/useGameSession.test.js
git commit -m "feat: add how-to-play intro gating to useGameSession"
```

---

### Task 2: `GameIntro` shared component

**Files:**
- Create: `src/components/GameIntro.jsx`
- Create: `src/components/GameIntro.css`
- Create: `src/components/GameIntro.stories.jsx`
- Modify: `src/i18n/en.json`
- Test: `src/components/__tests__/GameIntro.test.jsx`

**Interfaces:**
- Consumes: nothing from Task 1 directly (pure presentational component); pairs with `useGameSession`'s `showIntro`/`dontShowAgain`/`setDontShowAgain`/`dismissIntro` when a game renders it (Tasks 3–4).
- Produces: `<GameIntro icon name instructions dontShowAgain onDontShowAgainChange onStart />`. Test ids: `game-intro-dont-show-again`, `game-intro-start`.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/GameIntro.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import GameIntro from '../GameIntro'

describe('GameIntro', () => {
  it('renders the icon, name, and instructions', () => {
    render(
      <GameIntro
        icon="🐘" name="Animal Sounds" instructions="Listen to the sound, then tap the matching animal!"
        dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()}
      />
    )
    expect(screen.getByText('🐘')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Animal Sounds' })).toBeInTheDocument()
    expect(screen.getByText(/listen to the sound/i)).toBeInTheDocument()
  })

  it('the "don\'t show again" checkbox is unchecked when dontShowAgain is false', () => {
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />)
    expect(screen.getByTestId('game-intro-dont-show-again')).not.toBeChecked()
  })

  it('the "don\'t show again" checkbox is checked when dontShowAgain is true', () => {
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" dontShowAgain onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />)
    expect(screen.getByTestId('game-intro-dont-show-again')).toBeChecked()
  })

  it('calls onDontShowAgainChange with the new checked state when toggled', async () => {
    const onChange = vi.fn()
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" dontShowAgain={false} onDontShowAgainChange={onChange} onStart={vi.fn()} />)
    await userEvent.click(screen.getByTestId('game-intro-dont-show-again'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onStart when "Let\'s Play!" is clicked', async () => {
    const onStart = vi.fn()
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={onStart} />)
    await userEvent.click(screen.getByTestId('game-intro-start'))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('does not call onStart merely from rendering', () => {
    const onStart = vi.fn()
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={onStart} />)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <GameIntro icon="🐘" name="Animal Sounds" instructions="Listen to the sound, then tap the matching animal!" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/GameIntro.test.jsx`
Expected: FAIL — `Cannot find module '../GameIntro'`.

- [ ] **Step 3: Add the i18n strings**

In `src/i18n/en.json`, add two keys to the existing `common` object (after `"timerAriaLabel"`):

```json
    "timerAriaLabel": "Elapsed time: {{seconds}} seconds",
    "gameIntroStart": "Let's Play!",
    "gameIntroDontShowAgain": "Don't show this again"
```

- [ ] **Step 4: Implement the component**

Create `src/components/GameIntro.jsx`:

```jsx
import { useTranslation } from 'react-i18next'
import './GameIntro.css'

export default function GameIntro({ icon, name, instructions, dontShowAgain, onDontShowAgainChange, onStart }) {
  const { t } = useTranslation()
  return (
    <main className="game-intro">
      <div className="game-intro__icon" aria-hidden="true">{icon}</div>
      <h1 className="game-intro__name">{name}</h1>
      <p className="game-intro__instructions">{instructions}</p>

      <label className="game-intro__checkbox-label">
        <input
          type="checkbox"
          data-testid="game-intro-dont-show-again"
          checked={dontShowAgain}
          onChange={e => onDontShowAgainChange(e.target.checked)}
        />
        {t('common.gameIntroDontShowAgain')}
      </label>

      <button className="game-intro__start" data-testid="game-intro-start" onClick={onStart}>
        {t('common.gameIntroStart')}
      </button>
    </main>
  )
}
```

Create `src/components/GameIntro.css`:

```css
.game-intro {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 24px;
  text-align: center;
}

.game-intro__icon {
  font-size: 96px;
}

.game-intro__name {
  font-size: 28px;
  font-weight: 800;
  margin: 0;
}

.game-intro__instructions {
  font-size: 20px;
  opacity: 0.8;
  max-width: 480px;
  margin: 0;
}

.game-intro__checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  opacity: 0.8;
}

.game-intro__checkbox-label input[type='checkbox'] {
  width: 24px;
  height: 24px;
}

.game-intro__start {
  padding: 16px 36px;
  font-size: 20px;
  font-weight: 700;
  border-radius: var(--radius-button);
  min-height: 64px;
  background: var(--color-lavender);
  color: white;
  border: none;
}
```

Create `src/components/GameIntro.stories.jsx`:

```jsx
import GameIntro from './GameIntro'

export default {
  title: 'Components/GameIntro',
  component: GameIntro,
}

export const Default = {
  args: {
    icon: '🐘',
    name: 'Animal Sounds',
    instructions: 'Listen to the sound, then tap the matching animal!',
    dontShowAgain: false,
    onDontShowAgainChange: () => {},
    onStart: () => {},
  },
}

export const DontShowAgainChecked = {
  args: {
    icon: '🎨',
    name: 'Color Match',
    instructions: 'A color swatch shows — tap the matching colored object!',
    dontShowAgain: true,
    onDontShowAgainChange: () => {},
    onStart: () => {},
  },
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/GameIntro.test.jsx`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/GameIntro.jsx src/components/GameIntro.css src/components/GameIntro.stories.jsx src/components/__tests__/GameIntro.test.jsx src/i18n/en.json
git commit -m "feat: add shared GameIntro component"
```

---

### Task 3: Wire the intro into `AnimalSoundsGame`

**Files:**
- Modify: `src/games/animal-sounds/index.jsx`
- Modify: `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`
- Modify: `src/i18n/en.json`

**Interfaces:**
- Consumes: `useGameSession`'s `showIntro`, `settingsLoaded`, `dontShowAgain`, `setDontShowAgain`, `dismissIntro` (Task 1); `<GameIntro>` (Task 2).

- [ ] **Step 1: Write the failing tests**

In `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`, replace lines 13–22 (the `mockSettings`/`mockUpdateSetting`/`vi.mock('../../../hooks/useSettings', ...)` block) with:

```jsx
let mockSettings = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerDisplayEnabled: true,
  introDismissed: { 'animal-sounds': true },
}
const mockUpdateSetting = vi.fn()

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings, loaded: true, updateSetting: mockUpdateSetting }),
}))
```

Replace the `beforeEach` block (lines 34–41) with:

```jsx
beforeEach(() => {
  vi.clearAllMocks()
  mockSettings = {
    numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerDisplayEnabled: true,
    introDismissed: { 'animal-sounds': true },
  }
})
```

(This keeps every existing test in the file passing unmodified — the intro is dismissed by default — while allowing the new tests below to override it back to `{}`.)

Append this new `describe` block at the end of the file, after the closing `})` of `describe('AnimalSoundsGame', ...)`:

```jsx
describe('AnimalSoundsGame — how-to-play intro', () => {
  it('shows the intro screen before the first question when not dismissed', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    expect(screen.getByTestId('game-intro-start')).toBeInTheDocument()
    expect(screen.queryByText(/what animal/i)).not.toBeInTheDocument()
  })

  it('starts the session after "Let\'s Play!" is clicked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(screen.getByText(/what animal/i)).toBeInTheDocument()
  })

  it('persists introDismissed for this game when "don\'t show again" is checked before starting', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-dont-show-again')) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(mockUpdateSetting).toHaveBeenCalledWith('introDismissed', { 'animal-sounds': true })
  })

  it('does not persist a setting when "don\'t show again" is left unchecked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(mockUpdateSetting).not.toHaveBeenCalled()
  })

  it('does not show the intro when already dismissed for this game', async () => {
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByTestId('game-intro-start')).not.toBeInTheDocument()
    expect(screen.getByText(/what animal/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`
Expected: the 5 new tests FAIL (no `game-intro-start` test id is rendered yet — the game renders its question screen directly regardless of `introDismissed`); all pre-existing tests still PASS.

- [ ] **Step 3: Wire `GameIntro` into the game**

In `src/games/animal-sounds/index.jsx`, add the import (after the `Timer` import):
```jsx
import GameIntro from '../../components/GameIntro'
```

Update the hook destructure to include the new fields:
```jsx
  const {
    current, index, total, locked, disabledChoiceIds, hintActive, selected,
    score, streak, missed, done, feedbackMode, handleChoice, advance, restart,
    currentElapsedMs, timerDisplayEnabled, offerDifficultyBump, numChoices,
    acceptDifficultyBump, dismissDifficultyBump,
    showIntro, settingsLoaded, dontShowAgain, setDontShowAgain, dismissIntro,
  } = useGameSession({ gameId: 'animal-sounds', items: animals })
```

**Do not** place the intro's early return before `audioRef`/`playSound`/`useEffect` — React hooks must run unconditionally on every render, and an early return above them would change the hook count between the intro render and the question render (a Rules-of-Hooks violation). Instead, keep all three existing hooks exactly where they are, but change the `useEffect`'s guard so the animal sound doesn't auto-play underneath the intro screen: change
```jsx
  useEffect(() => {
    if (!current) return
    playSound()
  }, [index, playSound, current])
```
to
```jsx
  useEffect(() => {
    if (!current || showIntro) return
    playSound()
  }, [index, playSound, current, showIntro])
```

Then add the intro gating block *after* that `useEffect` and before the existing `if (done) {`:
```jsx
  if (!settingsLoaded) return null

  if (showIntro) {
    return (
      <GameIntro
        icon={manifest.icon}
        name={manifest.name}
        instructions={t('animalSounds.howToPlay')}
        dontShowAgain={dontShowAgain}
        onDontShowAgainChange={setDontShowAgain}
        onStart={() => dismissIntro(dontShowAgain)}
      />
    )
  }
```

- [ ] **Step 4: Add the i18n key**

In `src/i18n/en.json`, add `howToPlay` to the `animalSounds` object:
```json
  "animalSounds": {
    "prompt": "What animal makes this sound?",
    "replay": "Replay sound",
    "howToPlay": "Listen to the sound, then tap the matching animal!"
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/games/animal-sounds/index.jsx src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx src/i18n/en.json
git commit -m "feat: show how-to-play intro before Animal Sounds sessions"
```

---

### Task 4: Wire the intro into `ColorMatchGame`

**Files:**
- Modify: `src/games/color-match/index.jsx`
- Modify: `src/games/color-match/__tests__/ColorMatchGame.test.jsx`
- Modify: `src/i18n/en.json`

**Interfaces:**
- Consumes: same as Task 3, for `gameId: 'color-match'`. Independent of Task 3 — can be done in parallel.

- [ ] **Step 1: Write the failing tests**

In `src/games/color-match/__tests__/ColorMatchGame.test.jsx`, replace lines 9–18 with:

```jsx
let mockSettings = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerDisplayEnabled: true,
  introDismissed: { 'color-match': true },
}
const mockUpdateSetting = vi.fn()

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings, loaded: true, updateSetting: mockUpdateSetting }),
}))
```

Replace the `beforeEach` block (lines 30–37) with:

```jsx
beforeEach(() => {
  vi.clearAllMocks()
  mockSettings = {
    numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerDisplayEnabled: true,
    introDismissed: { 'color-match': true },
  }
})
```

Append this new `describe` block at the end of the file, after the closing `})` of `describe('ColorMatchGame', ...)`:

```jsx
describe('ColorMatchGame — how-to-play intro', () => {
  it('shows the intro screen before the first question when not dismissed', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByTestId('game-intro-start')).toBeInTheDocument()
    expect(screen.queryByText(/which one is this color/i)).not.toBeInTheDocument()
  })

  it('starts the session after "Let\'s Play!" is clicked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(screen.getByText(/which one is this color/i)).toBeInTheDocument()
  })

  it('persists introDismissed for this game when "don\'t show again" is checked before starting', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-dont-show-again')) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(mockUpdateSetting).toHaveBeenCalledWith('introDismissed', { 'color-match': true })
  })

  it('does not persist a setting when "don\'t show again" is left unchecked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(mockUpdateSetting).not.toHaveBeenCalled()
  })

  it('does not show the intro when already dismissed for this game', async () => {
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByTestId('game-intro-start')).not.toBeInTheDocument()
    expect(screen.getByText(/which one is this color/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/games/color-match/__tests__/ColorMatchGame.test.jsx`
Expected: the 5 new tests FAIL; all pre-existing tests still PASS.

- [ ] **Step 3: Wire `GameIntro` into the game**

In `src/games/color-match/index.jsx`, add the import (after the `Timer` import):
```jsx
import GameIntro from '../../components/GameIntro'
```

Update the hook destructure:
```jsx
  const {
    current, index, total, locked, disabledChoiceIds, hintActive, selected,
    score, streak, missed, done, feedbackMode, handleChoice, advance, restart,
    currentElapsedMs, timerDisplayEnabled, offerDifficultyBump, numChoices,
    acceptDifficultyBump, dismissDifficultyBump,
    showIntro, settingsLoaded, dontShowAgain, setDontShowAgain, dismissIntro,
  } = useGameSession({ gameId: 'color-match', items: colors })
```

Add this block right after the hook call and before `if (done) {`:
```jsx
  if (!settingsLoaded) return null

  if (showIntro) {
    return (
      <GameIntro
        icon={manifest.icon}
        name={manifest.name}
        instructions={t('colorMatch.howToPlay')}
        dontShowAgain={dontShowAgain}
        onDontShowAgainChange={setDontShowAgain}
        onStart={() => dismissIntro(dontShowAgain)}
      />
    )
  }
```

- [ ] **Step 4: Add the i18n key**

In `src/i18n/en.json`, add `howToPlay` to the `colorMatch` object:
```json
  "colorMatch": {
    "prompt": "Which one is this color?",
    "howToPlay": "A color swatch shows — tap the matching colored object!"
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/games/color-match/__tests__/ColorMatchGame.test.jsx`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/games/color-match/index.jsx src/games/color-match/__tests__/ColorMatchGame.test.jsx src/i18n/en.json
git commit -m "feat: show how-to-play intro before Color Match sessions"
```

---

### Task 5: AdminPage — "Replay Intro" control

**Files:**
- Modify: `src/admin/AdminPage.jsx`
- Modify: `src/admin/AdminPage.css`
- Modify: `src/admin/__tests__/AdminPage.test.jsx`
- Modify: `src/i18n/en.json`

**Interfaces:**
- Consumes: `settings.introDismissed` (Task 1), `updateSetting` (existing `useSettings` hook).
- Produces: a "Replay Intro" button per game row in the Games tab that clears that game's `introDismissed` entry.

- [ ] **Step 1: Write the failing tests**

In `src/admin/__tests__/AdminPage.test.jsx`, replace lines 13–25 (from `const mockUpdateSetting` through the closing `}))` of the `useSettings` mock) with:

```jsx
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
```

Replace line 47 (`beforeEach(() => { vi.clearAllMocks() })`) with:

```jsx
beforeEach(() => {
  vi.clearAllMocks()
  mockIntroDismissed = {}
})
```

Append these two tests inside the existing `describe('AdminPage', ...)` block, right before its closing `})` (after the `'reset button clears override and restores manifest default'` test):

```jsx
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
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx`
Expected: the 2 new tests FAIL (no "Replay Intro" button exists yet); all pre-existing tests still PASS.

- [ ] **Step 3: Add the i18n key**

In `src/i18n/en.json`, add `introReplayButton` to the `admin` object (after `"tagsResetButton"`):
```json
    "tagsResetButton": "Reset",
    "introReplayButton": "Replay Intro"
```

- [ ] **Step 4: Implement the button**

In `src/admin/AdminPage.jsx`, add a handler function after `handleTagReset` (before the `const tabs = [...]` line):
```jsx
  function handleIntroReplay(gameId) {
    const { [gameId]: _, ...rest } = settings.introDismissed ?? {}
    updateSetting('introDismissed', rest)
  }
```

In the Games tab's per-game row (inside the `admin__tag-buttons` div), add a third button after the existing "Reset" button. Note this uses a new `admin__intro-replay` class, not `admin__tag-reset` — that class is styled in red (`--color-error`) for the destructive "clear tag override" action, which would wrongly flag this harmless "show the tutorial again" action as alarming:
```jsx
                <div className="admin__tag-buttons">
                  <button className="admin__tag-save" onClick={() => handleTagSave(m.id)}>
                    {t('admin.tagsSaveButton')}
                  </button>
                  <button className="admin__tag-reset" onClick={() => handleTagReset(m.id)}>
                    {t('admin.tagsResetButton')}
                  </button>
                  <button className="admin__intro-replay" onClick={() => handleIntroReplay(m.id)}>
                    {t('admin.introReplayButton')}
                  </button>
                </div>
```

In `src/admin/AdminPage.css`, add a new rule after `.admin__tag-reset:hover { ... }`:
```css
.admin__intro-replay {
  padding: 6px 16px;
  border-radius: var(--radius-button);
  border: 2px solid var(--color-aqua);
  background: transparent;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.admin__intro-replay:hover {
  background: color-mix(in srgb, var(--color-aqua) 15%, transparent);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/admin/AdminPage.jsx src/admin/AdminPage.css src/admin/__tests__/AdminPage.test.jsx src/i18n/en.json
git commit -m "feat: add Replay Intro control to AdminPage Games tab"
```

---

### Task 6: Visual regression baseline for `GameIntro`

**Files:**
- Modify: `e2e/visual.spec.js`

**Interfaces:**
- Consumes: `GameIntro.stories.jsx` (Task 2) — must be committed already for Storybook to serve these story ids.

- [ ] **Step 1: Add the new story ids**

In `e2e/visual.spec.js`, add two entries to the `stories` array, after `'components-gameresults--perfect-with-difficulty-offer'`:
```js
  'components-gameresults--perfect-with-difficulty-offer',
  'components-gameintro--default',
  'components-gameintro--dont-show-again-checked',
  'pages-adminpage--default',
```

- [ ] **Step 2: Generate the baseline screenshots**

Run: `npx playwright test visual.spec.js --update-snapshots`
Expected: PASS, and two new files appear under `e2e/visual.spec.js-snapshots/`: `components-gameintro--default.png` and `components-gameintro--dont-show-again-checked.png`.

- [ ] **Step 3: Review the generated screenshots**

Open the two new PNG files and confirm they show the expected `GameIntro` layout (icon, heading, instructions, checkbox, "Let's Play!" button) matching the `Default` and `DontShowAgainChecked` story args from Task 2 — the checked variant should visibly show the checkbox ticked.

- [ ] **Step 4: Commit**

```bash
git add e2e/visual.spec.js e2e/visual.spec.js-snapshots/components-gameintro--default.png e2e/visual.spec.js-snapshots/components-gameintro--dont-show-again-checked.png
git commit -m "test: add visual regression baseline for GameIntro stories"
```

---

### Task 7: E2E coverage

**Files:**
- Modify: `e2e/animal-sounds.spec.js`
- Modify: `e2e/color-match.spec.js`
- Modify: `e2e/admin.spec.js`

**Interfaces:**
- Consumes: `data-testid="game-intro-start"` / `data-testid="game-intro-dont-show-again"` (Task 2); `admin.introReplayButton` = "Replay Intro" button (Task 5); `localStorage` key `playground_settings` (existing convention, `e2e/admin.spec.js`).

- [ ] **Step 1: Replace `e2e/animal-sounds.spec.js` in full**

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('animal sounds: how-to-play intro shows on first visit and starts the session', async ({ page }) => {
  await page.goto('/game/animal-sounds')

  await expect(page.getByTestId('game-intro-start')).toBeVisible()
  expect(await page.locator('[data-animal-id]').count()).toBe(0)

  await page.getByTestId('game-intro-start').click()

  await expect(page.locator('[data-animal-id]').first()).toBeVisible()
})

test('animal sounds: "don\'t show again" suppresses the intro on the next visit', async ({ page }) => {
  await page.goto('/game/animal-sounds')
  await page.getByTestId('game-intro-dont-show-again').click()
  await page.getByTestId('game-intro-start').click()

  await page.goto('/game/animal-sounds')
  await expect(page.getByTestId('game-intro-start')).not.toBeVisible()
  await expect(page.locator('[data-animal-id]').first()).toBeVisible()
})

test('animal sounds: intro does not reappear after Play Again in the same visit', async ({ page }) => {
  await page.goto('/game/animal-sounds')
  await page.getByTestId('game-intro-start').click()

  for (let i = 0; i < 10; i++) {
    if (await page.getByText(/you scored/i).isVisible()) break
    await page.locator('[data-animal-id]').first().click()
    await page.waitForTimeout(1600)
  }
  await expect(page.getByText(/you scored/i)).toBeVisible()

  await page.getByRole('button', { name: 'Play Again' }).click()
  await expect(page.getByTestId('game-intro-start')).not.toBeVisible()
  await expect(page.locator('[data-animal-id]').first()).toBeVisible()
})

test('animal sounds: full play-through reaches results and returns home', async ({ page }) => {
  await page.goto('/game/animal-sounds')
  await page.getByTestId('game-intro-start').click()

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
  await page.getByTestId('game-intro-start').click()
  await page.locator('[data-animal-id]').first().waitFor()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('animal sounds: how-to-play intro screen has no accessibility violations', async ({ page }) => {
  await page.goto('/game/animal-sounds')
  await page.getByTestId('game-intro-start').waitFor()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('animal sounds: a wrong tap with retries enabled does not lock the question', async ({ page }) => {
  await page.goto('/admin')

  // "3" is ambiguous unscoped — both "Answer Choices" and "Retry Attempts" have a "3" radio.
  await page.getByRole('heading', { name: 'Answer Choices' })
    .locator('xpath=..')
    .getByRole('radio', { name: '3', exact: true })
    .check() // numChoices=3, ensures 2 wrong options exist

  // "2" is likewise ambiguous unscoped.
  await page.getByRole('heading', { name: 'Retry Attempts' })
    .locator('xpath=..')
    .getByRole('radio', { name: '2', exact: true })
    .check() // maxTries=2

  await page.goto('/game/animal-sounds')
  await page.getByTestId('game-intro-start').click()

  const choices = page.locator('[data-animal-id]')
  const correctId = await page.getByTestId('correct-animal-id').textContent()
  const wrongChoice = choices.filter({ hasNot: page.locator(`[data-animal-id="${correctId}"]`) }).first()
  await wrongChoice.click()

  await expect(wrongChoice).toBeDisabled()
  const correctChoice = page.locator(`[data-animal-id="${correctId}"]`)
  await expect(correctChoice).toBeEnabled()
})
```

- [ ] **Step 2: Replace `e2e/color-match.spec.js` in full**

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('color match: how-to-play intro shows on first visit and starts the session', async ({ page }) => {
  await page.goto('/game/color-match')

  await expect(page.getByTestId('game-intro-start')).toBeVisible()
  expect(await page.locator('[data-color-id]').count()).toBe(0)

  await page.getByTestId('game-intro-start').click()

  await expect(page.locator('[data-color-id]').first()).toBeVisible()
})

test('color match: "don\'t show again" suppresses the intro on the next visit', async ({ page }) => {
  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-dont-show-again').click()
  await page.getByTestId('game-intro-start').click()

  await page.goto('/game/color-match')
  await expect(page.getByTestId('game-intro-start')).not.toBeVisible()
  await expect(page.locator('[data-color-id]').first()).toBeVisible()
})

test('color match: intro does not reappear after Play Again in the same visit', async ({ page }) => {
  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-start').click()

  for (let i = 0; i < 10; i++) {
    if (await page.getByText(/you scored/i).isVisible()) break
    await page.locator('[data-color-id]').first().click()
    await page.waitForTimeout(1600)
  }
  await expect(page.getByText(/you scored/i)).toBeVisible()

  await page.getByRole('button', { name: 'Play Again' }).click()
  await expect(page.getByTestId('game-intro-start')).not.toBeVisible()
  await expect(page.locator('[data-color-id]').first()).toBeVisible()
})

test('color match: full play-through reaches results and returns home', async ({ page }) => {
  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-start').click()

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
  await page.getByTestId('game-intro-start').click()
  await page.locator('[data-color-id]').first().waitFor()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('color match: how-to-play intro screen has no accessibility violations', async ({ page }) => {
  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-start').waitFor()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('color match: a wrong tap with retries enabled does not lock the question', async ({ page }) => {
  await page.goto('/admin')

  // "3" is ambiguous unscoped — both "Answer Choices" and "Retry Attempts" have a "3" radio.
  await page.getByRole('heading', { name: 'Answer Choices' })
    .locator('xpath=..')
    .getByRole('radio', { name: '3', exact: true })
    .check() // numChoices=3, ensures 2 wrong options exist

  // "2" is likewise ambiguous unscoped.
  await page.getByRole('heading', { name: 'Retry Attempts' })
    .locator('xpath=..')
    .getByRole('radio', { name: '2', exact: true })
    .check() // maxTries=2

  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-start').click()

  const choices = page.locator('[data-color-id]')
  const correctId = await page.getByTestId('correct-color-id').textContent()
  const wrongChoice = choices.filter({ hasNot: page.locator(`[data-color-id="${correctId}"]`) }).first()
  await wrongChoice.click()

  await expect(wrongChoice).toBeDisabled()
  const correctChoice = page.locator(`[data-color-id="${correctId}"]`)
  await expect(correctChoice).toBeEnabled()
})
```

- [ ] **Step 3: Add a "Replay Intro" round-trip test to `e2e/admin.spec.js`**

Append this test at the end of `e2e/admin.spec.js`:

```js
test('replay intro brings back a dismissed game intro', async ({ page }) => {
  await page.goto('/game/animal-sounds')
  await page.getByTestId('game-intro-dont-show-again').click()
  await page.getByTestId('game-intro-start').click()

  // Verify localStorage was updated before navigating away (guards against a navigation race)
  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('playground_settings'))
    if (!raw) return null
    const s = JSON.parse(raw)
    return s?.introDismissed?.['animal-sounds']
  }).toBe(true)

  await page.goto('/game/animal-sounds')
  await expect(page.getByTestId('game-intro-start')).not.toBeVisible()

  await page.goto('/admin')
  await page.getByRole('tab', { name: /games/i }).click()
  await page.getByRole('button', { name: 'Replay Intro' }).first().click()

  await page.goto('/game/animal-sounds')
  await expect(page.getByTestId('game-intro-start')).toBeVisible()
})
```

- [ ] **Step 4: Run the full E2E suite**

Run: `npm run e2e`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/animal-sounds.spec.js e2e/color-match.spec.js e2e/admin.spec.js
git commit -m "test: add E2E coverage for how-to-play intro and Replay Intro"
```

---

### Task 8: Documentation and versioning

**Files:**
- Modify: `package.json`
- Modify: `src/games/animal-sounds/manifest.json`
- Modify: `src/games/color-match/manifest.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/ENHANCEMENTS.md`
- Modify: `README.md`

**Interfaces:** None — documentation only, no code interfaces produced or consumed.

- [ ] **Step 1: Bump versions**

In `package.json`, change:
```json
  "version": "0.6.0",
```
to:
```json
  "version": "0.7.0",
```

In `src/games/animal-sounds/manifest.json`, change:
```json
  "version": "1.2.0",
```
to:
```json
  "version": "1.3.0",
```

In `src/games/color-match/manifest.json`, change:
```json
  "version": "1.2.0",
```
to:
```json
  "version": "1.3.0",
```

- [ ] **Step 2: Add the CHANGELOG entry**

In `CHANGELOG.md`, insert a new section after the header/format line and before `## [0.6.0] - 2026-07-01`:

```markdown
## [0.7.0] - 2026-07-02

### Added
- **How-to-play intro screens** — each game now shows an intro screen (icon, name, one-line instructions) before its first question on initial visit. A "Don't show this again" checkbox lets a parent permanently dismiss it per game; the admin Games tab gains a "Replay Intro" button to bring a dismissed intro back. The intro does not reappear after "Play Again" within the same visit.
- `introDismissed` setting: `{ [gameId]: true }`, default `{}`.
- `GameIntro` shared component.
- `useGameSession` gains `showIntro`, `settingsLoaded`, `dontShowAgain`, `setDontShowAgain`, `dismissIntro`.

```

- [ ] **Step 3: Update `docs/ENHANCEMENTS.md`**

Insert a new entry at the top of the "Recently Completed" section (immediately after the `## Recently Completed` heading, before `### v0.6.0 — Game Engine Core (2026-07-01)`):

```markdown
### v0.7.0 — How-to-Play Intro Screens (2026-07-02)
- **How-to-play intro screens** (issue #13) — a core engine mechanic in `useGameSession` that shows a `GameIntro` screen (icon, name, instructions) before a game's first question on initial mount; skipped on subsequent "Play Again" rounds in the same visit
- **"Don't show this again"** checkbox permanently suppresses a game's intro via the new `introDismissed` setting
- **"Replay Intro"** admin control (Games tab) clears a game's dismissed flag

```

- [ ] **Step 4: Update `README.md`**

Add a bullet to the `## Features` list, after the `**Admin / Settings**` bullet:
```markdown
- **How-to-play intro screens** — each game shows a brief instructional screen before its first question; parents can permanently dismiss it per game, or bring it back from the admin Games tab
```

Add a new subsection under `## Dashboard Features`, after the `### Game Categories & Tags` subsection and before the closing `---`:

```markdown
### How-to-Play Intro

The first time a game is opened, it shows a full-screen intro with the game's icon, name, and a one-sentence explanation of how to play, before any question appears. A "Don't show this again" checkbox permanently dismisses it for that game (stored in the `introDismissed` setting); leaving it unchecked means the intro reappears the next time the game is opened fresh (it does not reappear after tapping "Play Again" within the same visit). Parents can bring back a dismissed intro from the admin page's **Games** tab via the "Replay Intro" button next to each game's tags.
```

- [ ] **Step 5: Verify the docs build/lint cleanly**

Run: `npm run lint`
Expected: no errors (documentation-only changes don't affect lint, but this confirms the version-bump JSON edits didn't break JSON parsing via any tooling that reads `package.json`/manifests).

- [ ] **Step 6: Commit**

```bash
git add package.json src/games/animal-sounds/manifest.json src/games/color-match/manifest.json CHANGELOG.md docs/ENHANCEMENTS.md README.md
git commit -m "docs: document v0.7.0 how-to-play intro screens and bump versions"
```
