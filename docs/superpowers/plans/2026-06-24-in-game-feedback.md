# In-Game Feedback (Celebration, Streak, Session Summary) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add celebration animations, streak tracking, and a richer end-of-game session summary to Animal Sounds and Color Match, via a shared game-session engine, and start a `CHANGELOG.md` for this and all future changes.

**Architecture:** Extract the duplicated queue-building and game-loop logic from both games into a shared `buildQueue` util and `useGameSession` hook. New `useBestStreak` hook persists the all-time best streak per game through two new storage-adapter methods. A shared `<GameResults>` component (with a game-supplied render override for missed items) and `<StreakBadge>` component replace each game's bespoke results/header markup. Confetti fires through a single wrapper module so it has one test seam.

**Tech Stack:** React 18, Vite, Vitest + React Testing Library + jsdom, jest-axe, `canvas-confetti` (new dependency), i18next.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-24-in-game-feedback-design.md`
- App is unpublished — no migration handling needed for schema/storage changes.
- `prefers-reduced-motion` auto-detection is explicitly out of scope for this phase; `animationsEnabled` setting is the only control.
- Confetti fires only on a correct answer, only when `settings.animationsEnabled` is true.
- Streak badge is hidden at streak 0 and 1, visible at streak ≥ 2.
- Existing Score shape `{ gameId, score, total, date, timestamp }` is unchanged.
- Tests covering timed feedback must use `vi.useFakeTimers()` + `fireEvent`, not `userEvent` (per CLAUDE.md — `userEvent` deadlocks with fake timers in this stack).
- Run `npm test -- run` (single run) and `npm run lint` before every commit that touches source files.

---

## Task 1: Changelog and version bump

**Files:**
- Create: `CHANGELOG.md`
- Modify: `package.json` (version field)
- Modify: `CLAUDE.md` (Versioning section)

**Interfaces:** None (docs/metadata only — no code consumed or produced).

- [ ] **Step 1: Create `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-06-24

### Added
- Celebration animation (confetti) on correct answers, with an `animationsEnabled` setting to disable it.
- Streak tracking: current streak shown in the game header (Animal Sounds, Color Match), all-time best streak persisted per game.
- Richer end-of-game session summary listing any missed items, or a "perfect run" message when none were missed.

### Changed
- Extracted the shared game-loop logic (queue building, answer/score state, results screen) out of `AnimalSoundsGame` and `ColorMatchGame` into a shared `useGameSession` hook and `GameResults` component.
```

- [ ] **Step 2: Bump `package.json` version**

In `package.json`, change:
```json
  "version": "0.2.0",
```
to:
```json
  "version": "0.3.0",
```

- [ ] **Step 3: Update CLAUDE.md Versioning section**

In `CLAUDE.md`, find:
```
**Versioning:** app version is read from `package.json` at build time and shown in the dashboard footer; each game's version comes from its own `manifest.json` and is shown in that game's header. Bump both when releasing.
```
Replace with:
```
**Versioning:** app version is read from `package.json` at build time and shown in the dashboard footer; each game's version comes from its own `manifest.json` and is shown in that game's header. Bump both when releasing, and add an entry to `CHANGELOG.md`.
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md package.json CLAUDE.md
git commit -m "chore: add CHANGELOG.md and bump version to 0.3.0"
```

---

## Task 2: Extract shared `buildQueue` util

**Files:**
- Create: `src/utils/buildQueue.js`
- Create: `src/utils/__tests__/buildQueue.test.js`
- Modify: `src/games/animal-sounds/index.jsx` (remove local `shuffle`/`buildQueue`, import shared util)
- Modify: `src/games/color-match/index.jsx` (remove local `shuffle`/`buildQueue`, import shared util)

**Interfaces:**
- Produces: `buildQueue(items, numChoices, questionsPerSession) → Array<{ correct: T, choices: T[] }>` where `T` is any object with an `id` field. Each queue entry's `choices` array has length `min(numChoices, items.length)` and contains `correct` exactly once.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/buildQueue.test.js`:

```js
import { describe, it, expect } from 'vitest'
import buildQueue from '../buildQueue'

const items = [
  { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' },
]

describe('buildQueue', () => {
  it('builds one queue entry per requested question', () => {
    const queue = buildQueue(items, 2, 3)
    expect(queue).toHaveLength(3)
  })

  it('caps queue length at the number of available items', () => {
    const queue = buildQueue(items, 2, 10)
    expect(queue).toHaveLength(items.length)
  })

  it('each entry includes the correct item exactly once in choices', () => {
    const queue = buildQueue(items, 3, 4)
    for (const entry of queue) {
      const matches = entry.choices.filter(c => c.id === entry.correct.id)
      expect(matches).toHaveLength(1)
    }
  })

  it('choices length matches numChoices when enough items exist', () => {
    const queue = buildQueue(items, 3, 1)
    expect(queue[0].choices).toHaveLength(3)
  })

  it('caps choices length when numChoices exceeds available items', () => {
    const queue = buildQueue(items, 10, 1)
    expect(queue[0].choices).toHaveLength(items.length)
  })

  it('choices contain no duplicate ids', () => {
    const queue = buildQueue(items, 4, 1)
    const ids = queue[0].choices.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/buildQueue.test.js`
Expected: FAIL — `Cannot find module '../buildQueue'`

- [ ] **Step 3: Write the implementation**

Create `src/utils/buildQueue.js`:

```js
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function buildQueue(items, numChoices, questionsPerSession) {
  const shuffled = shuffle(items)
  const count = Math.min(questionsPerSession, items.length)
  return shuffled.slice(0, count).map(correct => {
    const wrongPool = items.filter(item => item.id !== correct.id)
    const wrongCount = Math.min(numChoices - 1, wrongPool.length)
    const wrong = shuffle(wrongPool).slice(0, wrongCount)
    return { correct, choices: shuffle([correct, ...wrong]) }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/buildQueue.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Refactor `AnimalSoundsGame` to use the shared util**

In `src/games/animal-sounds/index.jsx`, remove the local `shuffle` and `buildQueue` functions (lines 17-33 in the current file) and the trailing blank line, then add the import:

```js
import buildQueue from '../../utils/buildQueue'
```

Replace both call sites:
```js
const q = buildQueue(numChoices, questionsPerSession)
```
with:
```js
const q = buildQueue(animals, numChoices, questionsPerSession)
```
(two call sites: inside the `useEffect` and inside `restart`).

- [ ] **Step 6: Refactor `ColorMatchGame` to use the shared util**

Apply the same change to `src/games/color-match/index.jsx`: remove the local `shuffle`/`buildQueue`, import the shared util, and change both `buildQueue(numChoices, questionsPerSession)` call sites to `buildQueue(colors, numChoices, questionsPerSession)`.

- [ ] **Step 7: Run the full existing test suite to confirm no regression**

Run: `npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx src/games/color-match/__tests__/ColorMatchGame.test.jsx`
Expected: PASS (all existing tests, unchanged)

- [ ] **Step 8: Commit**

```bash
git add src/utils/buildQueue.js src/utils/__tests__/buildQueue.test.js src/games/animal-sounds/index.jsx src/games/color-match/index.jsx
git commit -m "refactor: extract shared buildQueue util from both games"
```

---

## Task 3: Confetti wrapper module

**Files:**
- Modify: `package.json` (add `canvas-confetti` dependency)
- Create: `src/lib/confetti.js`
- Create: `src/lib/__tests__/confetti.test.js`

**Interfaces:**
- Produces: `fireConfetti() → void` — calls into `canvas-confetti`'s default export with a fixed options object. This is the only file in the codebase that imports `canvas-confetti`.

- [ ] **Step 1: Install the dependency**

Run: `npm install canvas-confetti`
Expected: `package.json` `dependencies` gains `"canvas-confetti": "^1.x.x"`, `package-lock.json` updates.

- [ ] **Step 2: Write the failing test**

Create `src/lib/__tests__/confetti.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const confettiMock = vi.fn()
vi.mock('canvas-confetti', () => ({ default: confettiMock }))

beforeEach(() => { confettiMock.mockClear() })

describe('fireConfetti', () => {
  it('calls the canvas-confetti library', async () => {
    const { fireConfetti } = await import('../confetti')
    fireConfetti()
    expect(confettiMock).toHaveBeenCalledTimes(1)
  })

  it('passes a particleCount option', async () => {
    const { fireConfetti } = await import('../confetti')
    fireConfetti()
    const options = confettiMock.mock.calls[0][0]
    expect(options.particleCount).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/confetti.test.js`
Expected: FAIL — `Cannot find module '../confetti'`

- [ ] **Step 4: Write the implementation**

Create `src/lib/confetti.js`:

```js
import confetti from 'canvas-confetti'

export function fireConfetti() {
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/confetti.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/confetti.js src/lib/__tests__/confetti.test.js
git commit -m "feat: add canvas-confetti dependency and fireConfetti wrapper"
```

---

## Task 4: `animationsEnabled` setting

**Files:**
- Modify: `src/storage/adapter.js`
- Modify: `src/storage/__tests__/localStorageAdapter.security.test.js`

**Interfaces:**
- Produces: `DEFAULT_SETTINGS.animationsEnabled` (boolean, default `true`). No adapter method changes — this rides through the existing `getSettings`/`saveSettings` merge-with-defaults behavior.

- [ ] **Step 1: Write the failing test**

In `src/storage/__tests__/localStorageAdapter.security.test.js`, inside the `describe('getSettings', ...)` block, add:

```js
    it('defaults animationsEnabled to true when not stored', async () => {
      const s = await localStorageAdapter.getSettings()
      expect(s.animationsEnabled).toBe(true)
    })

    it('preserves a stored false value for animationsEnabled', async () => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ animationsEnabled: false }))
      const s = await localStorageAdapter.getSettings()
      expect(s.animationsEnabled).toBe(false)
    })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.security.test.js`
Expected: FAIL — `expected undefined to be true`

- [ ] **Step 3: Write the implementation**

In `src/storage/adapter.js`, change:

```js
export const DEFAULT_SETTINGS = {
  numChoices: 2,
  feedbackMode: 'immediate',
  questionsPerSession: 10,
  gaId: '',
  childName: '',
}
```

to:

```js
export const DEFAULT_SETTINGS = {
  numChoices: 2,
  feedbackMode: 'immediate',
  questionsPerSession: 10,
  gaId: '',
  childName: '',
  animationsEnabled: true,
}
```

And update the trailing interface comment's `Settings shape` line:

```js
 * Settings shape: { numChoices, feedbackMode, questionsPerSession, gaId, childName, animationsEnabled }
 *
 * Best-streak adapter methods (added for per-game streak tracking):
 * getBestStreaks()            → Promise<{ [gameId: string]: number }>
 * saveBestStreaks(streaksMap) → Promise<void>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.security.test.js`
Expected: PASS (all tests including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/storage/adapter.js src/storage/__tests__/localStorageAdapter.security.test.js
git commit -m "feat: add animationsEnabled setting with default true"
```

---

## Task 5: Best-streak storage adapter methods

**Files:**
- Modify: `src/storage/localStorageAdapter.js`
- Create: `src/storage/__tests__/localStorageAdapter.bestStreaks.test.js`

**Interfaces:**
- Produces: `getBestStreaks() → Promise<{ [gameId]: number }>`, `saveBestStreaks(map) → Promise<void>`, following the same try/catch-and-fall-back-to-`{}` pattern as `getSettings`. New localStorage key `playground_best_streaks`.

- [ ] **Step 1: Write the failing tests**

Create `src/storage/__tests__/localStorageAdapter.bestStreaks.test.js`:

```js
import { vi, describe, it, expect, beforeEach } from 'vitest'
import localStorageAdapter from '../localStorageAdapter'

const STREAKS_KEY = 'playground_best_streaks'

const makeLocalStorage = () => {
  let store = {}
  return {
    getItem:    (key)        => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem:    (key, value) => { store[key] = String(value) },
    removeItem: (key)        => { delete store[key] },
    clear:      ()           => { store = {} },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorage())
})

describe('localStorageAdapter — best streaks', () => {
  describe('getBestStreaks', () => {
    it('returns {} when localStorage is empty', async () => {
      expect(await localStorageAdapter.getBestStreaks()).toEqual({})
    })

    it('returns stored streaks when data is valid', async () => {
      localStorage.setItem(STREAKS_KEY, JSON.stringify({ 'animal-sounds': 5 }))
      expect(await localStorageAdapter.getBestStreaks()).toEqual({ 'animal-sounds': 5 })
    })

    it('returns {} when streaks contain invalid JSON', async () => {
      localStorage.setItem(STREAKS_KEY, 'not{valid}json')
      expect(await localStorageAdapter.getBestStreaks()).toEqual({})
    })

    it('returns {} when streaks key holds JSON null', async () => {
      localStorage.setItem(STREAKS_KEY, 'null')
      expect(await localStorageAdapter.getBestStreaks()).toEqual({})
    })

    it('returns {} when streaks key holds a JSON array', async () => {
      localStorage.setItem(STREAKS_KEY, JSON.stringify([1, 2, 3]))
      expect(await localStorageAdapter.getBestStreaks()).toEqual({})
    })
  })

  describe('saveBestStreaks', () => {
    it('persists a streaks map to localStorage', async () => {
      await localStorageAdapter.saveBestStreaks({ 'animal-sounds': 7 })
      const stored = JSON.parse(localStorage.getItem(STREAKS_KEY))
      expect(stored).toEqual({ 'animal-sounds': 7 })
    })

    it('overwrites the previous streaks map', async () => {
      await localStorageAdapter.saveBestStreaks({ 'animal-sounds': 3 })
      await localStorageAdapter.saveBestStreaks({ 'animal-sounds': 9, 'color-match': 4 })
      const stored = JSON.parse(localStorage.getItem(STREAKS_KEY))
      expect(stored).toEqual({ 'animal-sounds': 9, 'color-match': 4 })
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.bestStreaks.test.js`
Expected: FAIL — `localStorageAdapter.getBestStreaks is not a function`

- [ ] **Step 3: Write the implementation**

In `src/storage/localStorageAdapter.js`, add a new key constant next to the existing ones:

```js
const STREAKS_KEY = 'playground_best_streaks'
```

Add two methods to the `localStorageAdapter` object (after `saveSettings`, before the closing `}`):

```js
  async getBestStreaks() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STREAKS_KEY) || '{}')
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  },

  async saveBestStreaks(streaks) {
    localStorage.setItem(STREAKS_KEY, JSON.stringify(streaks))
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.bestStreaks.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/storage/localStorageAdapter.js src/storage/__tests__/localStorageAdapter.bestStreaks.test.js
git commit -m "feat: add getBestStreaks/saveBestStreaks to localStorageAdapter"
```

---

## Task 6: `useBestStreak` hook

**Files:**
- Create: `src/hooks/useBestStreak.js`
- Create: `src/hooks/__tests__/useBestStreak.test.js`

**Interfaces:**
- Consumes: `adapter.getBestStreaks()`, `adapter.saveBestStreaks(map)` from `src/storage/index.js` (Task 5).
- Produces: `useBestStreak(gameId) → { bestStreak: number, recordStreak: (streak: number) => Promise<void> }`. `bestStreak` is the persisted value for `gameId` (0 if none). `recordStreak` only persists when `streak` exceeds the current stored value; resolves without writing otherwise.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useBestStreak.test.js`:

```js
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetBestStreaks, mockSaveBestStreaks } = vi.hoisted(() => ({
  mockGetBestStreaks: vi.fn(),
  mockSaveBestStreaks: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../storage/index', () => ({
  default: {
    getBestStreaks: mockGetBestStreaks,
    saveBestStreaks: mockSaveBestStreaks,
  },
}))

import useBestStreak from '../useBestStreak'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBestStreaks.mockResolvedValue({ 'animal-sounds': 4 })
})

describe('useBestStreak', () => {
  it('loads the stored best streak for the given gameId', async () => {
    const { result } = renderHook(() => useBestStreak('animal-sounds'))
    await waitFor(() => expect(result.current.bestStreak).toBe(4))
  })

  it('defaults to 0 when no streak is stored for the gameId', async () => {
    const { result } = renderHook(() => useBestStreak('color-match'))
    await waitFor(() => expect(result.current.bestStreak).toBe(0))
  })

  it('persists a new best streak when it exceeds the stored value', async () => {
    const { result } = renderHook(() => useBestStreak('animal-sounds'))
    await waitFor(() => expect(result.current.bestStreak).toBe(4))

    await act(async () => { await result.current.recordStreak(6) })

    expect(mockSaveBestStreaks).toHaveBeenCalledWith({ 'animal-sounds': 6 })
    expect(result.current.bestStreak).toBe(6)
  })

  it('does not persist when the new streak is lower than the stored value', async () => {
    const { result } = renderHook(() => useBestStreak('animal-sounds'))
    await waitFor(() => expect(result.current.bestStreak).toBe(4))

    await act(async () => { await result.current.recordStreak(2) })

    expect(mockSaveBestStreaks).not.toHaveBeenCalled()
    expect(result.current.bestStreak).toBe(4)
  })

  it('does not persist when the new streak equals the stored value', async () => {
    const { result } = renderHook(() => useBestStreak('animal-sounds'))
    await waitFor(() => expect(result.current.bestStreak).toBe(4))

    await act(async () => { await result.current.recordStreak(4) })

    expect(mockSaveBestStreaks).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useBestStreak.test.js`
Expected: FAIL — `Cannot find module '../useBestStreak'`

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useBestStreak.js`:

```js
import { useState, useEffect, useRef } from 'react'
import adapter from '../storage/index'

export default function useBestStreak(gameId) {
  const [bestStreak, setBestStreak] = useState(0)
  const streaksRef = useRef({})

  useEffect(() => {
    adapter.getBestStreaks().then(streaks => {
      streaksRef.current = streaks
      setBestStreak(streaks[gameId] || 0)
    })
  }, [gameId])

  async function recordStreak(streak) {
    const current = streaksRef.current[gameId] || 0
    if (streak <= current) return
    const next = { ...streaksRef.current, [gameId]: streak }
    streaksRef.current = next
    setBestStreak(streak)
    await adapter.saveBestStreaks(next)
  }

  return { bestStreak, recordStreak }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useBestStreak.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBestStreak.js src/hooks/__tests__/useBestStreak.test.js
git commit -m "feat: add useBestStreak hook"
```

---

## Task 7: `useGameSession` hook (core engine)

**Files:**
- Create: `src/hooks/useGameSession.js`
- Create: `src/hooks/__tests__/useGameSession.test.js`

**Interfaces:**
- Consumes: `buildQueue(items, numChoices, questionsPerSession)` (Task 2), `useSettings()` (existing — provides `settings.numChoices, feedbackMode, questionsPerSession, animationsEnabled`), `useScores()` (existing — `addScore`), `useBestStreak(gameId)` (Task 6), `fireConfetti()` (Task 3).
- Produces: `useGameSession({ gameId, items }) → { current, index, total, answered, selected, score, streak, bestStreak, missed, done, feedbackMode, handleChoice(item), advance(), restart() }`.
  - `current` is the active queue entry (`{ correct, choices }` or `undefined` before the queue loads).
  - `total` is `queue.length`.
  - `handleChoice(item)`: ignored if already `answered`; sets `answered`/`selected`; on correct, increments `score`/`streak`, calls `recordStreak`, calls `fireConfetti()` if `animationsEnabled`; on wrong, resets `streak` to 0 and appends `current.correct` to `missed`; auto-advances after 1500ms if `feedbackMode === 'immediate'`.
  - `advance()`: moves to next question or calls internal `finishGame()` (which calls `addScore` and sets `done`).
  - `restart()`: rebuilds the queue and resets all per-session state (`score`, `streak`, `missed`, `done`, `index`, `answered`, `selected`) — does NOT reset `bestStreak` (that's all-time, from Task 6).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useGameSession.test.js`:

```js
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockAddScore, mockFireConfetti, mockRecordStreak } = vi.hoisted(() => ({
  mockAddScore: vi.fn().mockResolvedValue(undefined),
  mockFireConfetti: vi.fn(),
  mockRecordStreak: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../useSettings', () => ({
  default: () => ({
    settings: { numChoices: 2, feedbackMode: 'parent-tap', questionsPerSession: 3, animationsEnabled: true },
  }),
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

beforeEach(() => { vi.clearAllMocks() })

describe('useGameSession', () => {
  it('loads a queue sized to questionsPerSession', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(3))
  })

  it('correct answer increments score and streak, fires confetti, records streak', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.score).toBe(1)
    expect(result.current.streak).toBe(1)
    expect(mockFireConfetti).toHaveBeenCalledTimes(1)
    expect(mockRecordStreak).toHaveBeenCalledWith(1)
  })

  it('does not fire confetti when animationsEnabled is false', async () => {
    vi.doMock('../useSettings', () => ({
      default: () => ({
        settings: { numChoices: 2, feedbackMode: 'parent-tap', questionsPerSession: 3, animationsEnabled: false },
      }),
    }))
    vi.resetModules()
    const { default: useGameSessionNoAnim } = await import('../useGameSession')
    const { result } = renderHook(() => useGameSessionNoAnim({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(mockFireConfetti).not.toHaveBeenCalled()
  })

  it('wrong answer resets streak to 0 and adds the missed item, does not fire confetti', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    expect(result.current.streak).toBe(0)
    expect(result.current.missed).toEqual([correctItem])
    expect(mockFireConfetti).not.toHaveBeenCalled()
  })

  it('handleChoice is a no-op once already answered', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    await act(async () => { result.current.handleChoice(correctItem) })
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.score).toBe(1)
  })

  it('advance() moves to the next question and resets answered/selected', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    await act(async () => { result.current.handleChoice(result.current.current.correct) })
    await act(async () => { result.current.advance() })

    expect(result.current.index).toBe(1)
    expect(result.current.answered).toBe(false)
    expect(result.current.selected).toBe(null)
  })

  it('advance() past the last question calls addScore and sets done', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    for (let i = 0; i < 3; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(result.current.done).toBe(true)
    expect(mockAddScore).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: 'test-game', score: 3, total: 3 })
    )
  })

  it('restart() rebuilds the queue and clears score, streak, missed, done', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const wrongItem = result.current.current.choices.find(c => c.id !== result.current.current.correct.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    await act(async () => { result.current.restart() })

    expect(result.current.score).toBe(0)
    expect(result.current.streak).toBe(0)
    expect(result.current.missed).toEqual([])
    expect(result.current.done).toBe(false)
    expect(result.current.index).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: FAIL — `Cannot find module '../useGameSession'`

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useGameSession.js`:

```js
import { useState, useEffect, useRef } from 'react'
import useSettings from './useSettings'
import useScores from './useScores'
import useBestStreak from './useBestStreak'
import { fireConfetti } from '../lib/confetti'
import buildQueue from '../utils/buildQueue'

export default function useGameSession({ gameId, items }) {
  const { settings } = useSettings()
  const { addScore } = useScores()
  const { bestStreak, recordStreak } = useBestStreak(gameId)

  const { numChoices, feedbackMode, questionsPerSession, animationsEnabled } = settings

  const [queue,    setQueue]    = useState([])
  const [index,    setIndex]    = useState(0)
  const [answered, setAnswered] = useState(false)
  const [selected, setSelected] = useState(null)
  const [score,    setScore]    = useState(0)
  const [streak,   setStreak]   = useState(0)
  const [missed,   setMissed]   = useState([])
  const [done,     setDone]     = useState(false)

  // Refs avoid stale closures in setTimeout callbacks
  const scoreRef  = useRef(0)
  const streakRef = useRef(0)
  const missedRef = useRef([])
  const indexRef  = useRef(0)
  const queueRef  = useRef([])

  useEffect(() => {
    if (numChoices && questionsPerSession) {
      const q = buildQueue(items, numChoices, questionsPerSession)
      queueRef.current = q
      setQueue(q)
    }
  }, [numChoices, questionsPerSession])

  const current = queue[index]

  function handleChoice(item) {
    if (answered) return
    setAnswered(true)
    setSelected(item.id)

    const isCorrect = item.id === current.correct.id
    if (isCorrect) {
      scoreRef.current += 1
      setScore(scoreRef.current)
      streakRef.current += 1
      setStreak(streakRef.current)
      recordStreak(streakRef.current)
      if (animationsEnabled) fireConfetti()
    } else {
      streakRef.current = 0
      setStreak(0)
      missedRef.current = [...missedRef.current, current.correct]
      setMissed(missedRef.current)
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
      gameId,
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
    streakRef.current = 0
    missedRef.current = []
    indexRef.current = 0
    const q = buildQueue(items, numChoices, questionsPerSession)
    queueRef.current = q
    setQueue(q)
    setIndex(0)
    setAnswered(false)
    setSelected(null)
    setScore(0)
    setStreak(0)
    setMissed([])
    setDone(false)
  }

  return {
    current, index, total: queue.length, answered, selected,
    score, streak, bestStreak, missed, done, feedbackMode,
    handleChoice, advance, restart,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGameSession.js src/hooks/__tests__/useGameSession.test.js
git commit -m "feat: add useGameSession hook encapsulating shared game-loop logic"
```

---

## Task 8: i18n strings for streak and results

**Files:**
- Modify: `src/i18n/en.json`

**Interfaces:** Produces translation keys consumed by Task 9 (`StreakBadge`) and Task 10 (`GameResults`).

- [ ] **Step 1: Add the new keys**

In `src/i18n/en.json`, inside `"common"`, add two keys (after `"progress"`):

```json
    "progress": "Question {{current}} of {{total}}",
    "streak": "🔥 {{count}} in a row!",
    "perfectRun": "Perfect run! 🎉",
    "missedHeading": "Let's practice these next time:"
```

(Note: `scoreLabel`, `playAgain`, `home`, `next` already exist above `progress` — only the three new keys are added, with a trailing comma added after the existing `"progress"` line.)

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/en.json', 'utf8')); console.log('valid')"`
Expected: prints `valid`

- [ ] **Step 3: Commit**

```bash
git add src/i18n/en.json
git commit -m "feat: add i18n strings for streak badge and session summary"
```

---

## Task 9: `StreakBadge` component

**Files:**
- Create: `src/components/StreakBadge.jsx`
- Create: `src/components/StreakBadge.css`
- Create: `src/components/__tests__/StreakBadge.test.jsx`

**Interfaces:**
- Produces: `<StreakBadge streak={number} />` — renders `null` when `streak < 2`, otherwise renders the streak count via the `common.streak` i18n key (Task 8).

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/StreakBadge.test.jsx`:

```js
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import StreakBadge from '../StreakBadge'

describe('StreakBadge', () => {
  it('renders nothing when streak is 0', () => {
    const { container } = render(<StreakBadge streak={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when streak is 1', () => {
    const { container } = render(<StreakBadge streak={1} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the count when streak is 2 or more', () => {
    render(<StreakBadge streak={5} />)
    expect(screen.getByText(/5/)).toBeInTheDocument()
  })

  it('has no accessibility violations when visible', async () => {
    const { container } = render(<StreakBadge streak={3} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/StreakBadge.test.jsx`
Expected: FAIL — `Cannot find module '../StreakBadge'`

- [ ] **Step 3: Write the implementation**

Create `src/components/StreakBadge.css`:

```css
.streak-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: var(--radius-button);
  background: var(--color-lilac);
  color: var(--color-text);
  font-weight: 700;
  font-size: 16px;
}
```

Create `src/components/StreakBadge.jsx`:

```jsx
import { useTranslation } from 'react-i18next'
import './StreakBadge.css'

export default function StreakBadge({ streak }) {
  const { t } = useTranslation()
  if (streak < 2) return null
  return (
    <span className="streak-badge">{t('common.streak', { count: streak })}</span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/StreakBadge.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/StreakBadge.jsx src/components/StreakBadge.css src/components/__tests__/StreakBadge.test.jsx
git commit -m "feat: add StreakBadge component"
```

---

## Task 10: `GameResults` component

**Files:**
- Create: `src/components/GameResults.jsx`
- Create: `src/components/GameResults.css`
- Create: `src/components/__tests__/GameResults.test.jsx`

**Interfaces:**
- Produces: `<GameResults score total missed onPlayAgain onHome renderMissedItem />`.
  - `score: number`, `total: number` — rendered the same way the old inline results block did (`results__score`, `results__label` via `common.scoreLabel`).
  - `missed: Array<T>` — when empty, renders `common.perfectRun`; otherwise renders `common.missedHeading` followed by a `<ul>` where each `<li>` is `renderMissedItem(item)`.
  - `onPlayAgain: () => void`, `onHome: () => void` — wired to the existing `results__btn--play` / `results__btn--home` buttons.
  - `renderMissedItem: (item: T) => ReactNode` — required prop; each game supplies its own (Animal Sounds: emoji + name; Color Match: swatch + name).

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/GameResults.test.jsx`:

```js
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import GameResults from '../GameResults'

const renderMissedItem = item => <span>{item.label}</span>

describe('GameResults', () => {
  it('shows the score', () => {
    render(<GameResults score={3} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    expect(screen.getByText('3 / 5')).toBeInTheDocument()
  })

  it('shows a perfect-run message when nothing was missed', () => {
    render(<GameResults score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    expect(screen.getByText(/perfect run/i)).toBeInTheDocument()
  })

  it('lists missed items via renderMissedItem when present', () => {
    render(<GameResults score={2} total={4} missed={[{ id: 'a', label: 'Apple' }, { id: 'b', label: 'Banana' }]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    expect(screen.getByText(/let's practice/i)).toBeInTheDocument()
    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('Banana')).toBeInTheDocument()
    expect(screen.queryByText(/perfect run/i)).not.toBeInTheDocument()
  })

  it('calls onPlayAgain when Play Again is clicked', async () => {
    const onPlayAgain = vi.fn()
    render(<GameResults score={3} total={5} missed={[]} onPlayAgain={onPlayAgain} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    await userEvent.click(screen.getByRole('button', { name: /play again/i }))
    expect(onPlayAgain).toHaveBeenCalledTimes(1)
  })

  it('calls onHome when Home is clicked', async () => {
    const onHome = vi.fn()
    render(<GameResults score={3} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={onHome} renderMissedItem={renderMissedItem} />)
    await userEvent.click(screen.getByRole('button', { name: /home/i }))
    expect(onHome).toHaveBeenCalledTimes(1)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<GameResults score={3} total={5} missed={[{ id: 'a', label: 'Apple' }]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/GameResults.test.jsx`
Expected: FAIL — `Cannot find module '../GameResults'`

- [ ] **Step 3: Write the implementation**

Create `src/components/GameResults.css`:

```css
.results__missed { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.results__missed-heading { font-size: 16px; font-weight: 700; opacity: 0.8; }
```

Create `src/components/GameResults.jsx`:

```jsx
import { useTranslation } from 'react-i18next'
import './GameResults.css'

export default function GameResults({ score, total, missed, onPlayAgain, onHome, renderMissedItem }) {
  const { t } = useTranslation()
  return (
    <div className="results">
      <div className="results__emoji">{score === total ? '🎉' : '⭐'}</div>
      <div className="results__score">{score} / {total}</div>
      <div className="results__label">{t('common.scoreLabel', { score, total })}</div>

      {missed.length === 0 ? (
        <div className="results__label">{t('common.perfectRun')}</div>
      ) : (
        <div>
          <div className="results__missed-heading">{t('common.missedHeading')}</div>
          <ul className="results__missed">
            {missed.map((item, i) => (
              <li key={`${item.id}-${i}`}>{renderMissedItem(item)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="results__actions">
        <button className="results__btn results__btn--play" onClick={onPlayAgain}>{t('common.playAgain')}</button>
        <button className="results__btn results__btn--home" onClick={onHome}>{t('common.home')}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/GameResults.test.jsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/GameResults.jsx src/components/GameResults.css src/components/__tests__/GameResults.test.jsx
git commit -m "feat: add GameResults component"
```

---

## Task 11: Refactor `AnimalSoundsGame` onto the shared engine

**Files:**
- Modify: `src/games/animal-sounds/index.jsx`
- Modify: `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`

**Interfaces:**
- Consumes: `useGameSession({ gameId, items })` (Task 7), `<StreakBadge streak />` (Task 9), `<GameResults score total missed onPlayAgain onHome renderMissedItem />` (Task 10).

This task touches game-specific audio-playback logic (`playSound`, `audioRef`) which `useGameSession` does NOT own — Animal Sounds keeps that logic locally, driven off `current` and `index` from the hook, exactly as today.

- [ ] **Step 1: Update the test mocks to match the new hook boundary**

Replace the existing mocks in `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx` (the `vi.mock('../../../hooks/useSettings', ...)` and `vi.mock('../../../hooks/useScores', ...)` blocks) with a mock of the confetti module only, keeping the rest of the test file (assertions) unchanged since they exercise the real `useGameSession` end-to-end:

```js
vi.mock('../../../lib/confetti', () => ({ fireConfetti: vi.fn() }))
```

Add this mock near the top of the file, after the existing `HTMLMediaElement` stubs and before the `useSettings`/`useScores` mocks — keep the existing `useSettings`/`useScores` mocks as-is (they still apply; `useGameSession` calls those same hooks internally, and mocking the module paths still intercepts them).

Also mock `useBestStreak` so the test doesn't depend on real storage:

```js
vi.mock('../../../hooks/useBestStreak', () => ({
  default: () => ({ bestStreak: 0, recordStreak: vi.fn().mockResolvedValue(undefined) }),
}))
```

- [ ] **Step 2: Run the existing tests to confirm they currently pass (baseline) and will fail once we touch the component**

Run: `npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`
Expected: PASS (baseline, before the component refactor below)

- [ ] **Step 3: Refactor the component**

Replace the full contents of `src/games/animal-sounds/index.jsx` with:

```jsx
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import StreakBadge from '../../components/StreakBadge'
import GameResults from '../../components/GameResults'
import animals from './data/animals'
import { getSoundUrl } from './data/sounds'
import manifest from './manifest.json'
import './AnimalSoundsGame.css'

const CHOICE_COLORS = [
  'var(--color-lavender-dark)',
  'var(--color-teal-dark)',
  'var(--color-aqua-dark)',
  'var(--color-lilac-dark)',
]

export default function AnimalSoundsGame({ onGameEnd }) {
  const { t } = useTranslation()
  const {
    current, index, total, answered, selected, score, streak, missed, done,
    feedbackMode, handleChoice, advance, restart,
  } = useGameSession({ gameId: 'animal-sounds', items: animals })

  const audioRef = useRef(null)

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

  useEffect(() => {
    if (!current) return
    playSound()
  }, [index, current])

  if (done) {
    return (
      <GameResults
        score={score}
        total={total}
        missed={missed}
        onPlayAgain={restart}
        onHome={() => onGameEnd(score, total)}
        renderMissedItem={animal => (
          <>
            <span aria-hidden="true">{animal.emoji}</span> {t(animal.nameKey)}
          </>
        )}
      />
    )
  }

  if (!current) return null

  return (
    <main className="game">
      {/* Hidden testid so tests can find the correct answer id */}
      <span data-testid="correct-animal-id" style={{ display: 'none' }}>{current.correct.id}</span>

      <div className="game__header">
        <h1 className="game__name">{manifest.name}</h1>
        <StreakBadge streak={streak} />
        <span className="game__version">v{manifest.version}</span>
      </div>

      <div className="game__question">
        <div className="game__progress">{t('common.progress', { current: index + 1, total })}</div>
        <div className="game__prompt">{t('animalSounds.prompt')}</div>
        <button className="game__replay" aria-label={t('animalSounds.replay')} onClick={playSound}>🔊</button>
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
              <span className="game__choice-name">{t(animal.nameKey)}</span>
            </button>
          )
        })}
      </div>

      {answered && feedbackMode === 'parent-tap' && (
        <button className="game__next" onClick={advance}>{t('common.next')}</button>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass against the refactored component**

Run: `npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`
Expected: PASS (all 6 existing tests)

- [ ] **Step 5: Add new tests for streak badge and missed-items summary**

Append to `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`:

```js
  it('shows the streak badge after 2 correct answers in a row', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 2; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.animalId)
      const correctId = screen.getByTestId('correct-animal-id').textContent
      const correctBtn = buttons.find(b => b.dataset.animalId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(screen.getByText(/2/)).toBeInTheDocument()
  })

  it('shows missed animals in the results screen when an answer is wrong', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.animalId)
      const correctId = screen.getByTestId('correct-animal-id').textContent
      const wrongBtn = buttons.find(b => b.dataset.animalId !== correctId)
      act(() => { fireEvent.click(wrongBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(screen.getByText(/let's practice/i)).toBeInTheDocument()
  })
```

- [ ] **Step 6: Run the full file to confirm everything passes**

Run: `npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`
Expected: PASS (8 tests)

- [ ] **Step 7: Commit**

```bash
git add src/games/animal-sounds/index.jsx src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx
git commit -m "refactor: rebuild AnimalSoundsGame on useGameSession with streak and summary"
```

---

## Task 12: Refactor `ColorMatchGame` onto the shared engine

**Files:**
- Modify: `src/games/color-match/index.jsx`
- Modify: `src/games/color-match/__tests__/ColorMatchGame.test.jsx`

**Interfaces:** Same as Task 11, applied to Color Match. No game-specific side logic (no audio) — this refactor is simpler than Animal Sounds.

- [ ] **Step 1: Update the test mocks**

In `src/games/color-match/__tests__/ColorMatchGame.test.jsx`, add the same two mocks added in Task 11 Step 1 (`../../../lib/confetti` and `../../../hooks/useBestStreak`), keeping the existing `useSettings`/`useScores` mocks.

- [ ] **Step 2: Refactor the component**

Replace the full contents of `src/games/color-match/index.jsx` with:

```jsx
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import StreakBadge from '../../components/StreakBadge'
import GameResults from '../../components/GameResults'
import colors from './data/colors'
import manifest from './manifest.json'
import './ColorMatchGame.css'

const BORDERED_IDS = new Set(['white', 'gray'])

export default function ColorMatchGame({ onGameEnd }) {
  const { t } = useTranslation()
  const {
    current, index, total, answered, selected, score, streak, missed, done,
    feedbackMode, handleChoice, advance, restart,
  } = useGameSession({ gameId: 'color-match', items: colors })

  if (done) {
    return (
      <GameResults
        score={score}
        total={total}
        missed={missed}
        onPlayAgain={restart}
        onHome={() => onGameEnd(score, total)}
        renderMissedItem={color => (
          <>
            <span
              aria-hidden="true"
              style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: color.color, verticalAlign: 'middle' }}
            />{' '}
            {t(color.nameKey)}
          </>
        )}
      />
    )
  }

  if (!current) return null

  return (
    <main className="game">
      {/* Hidden testid so tests can find the correct answer id */}
      <span data-testid="correct-color-id" style={{ display: 'none' }}>{current.correct.id}</span>

      <div className="game__header">
        <h1 className="game__name">{manifest.name}</h1>
        <StreakBadge streak={streak} />
        <span className="game__version">v{manifest.version}</span>
      </div>

      <div className="game__question">
        <div className="game__progress">{t('common.progress', { current: index + 1, total })}</div>
        <div className="game__prompt">{t('colorMatch.prompt')}</div>
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
              style={{ background: color.color, color: color.textColor }}
              disabled={answered}
              onClick={() => handleChoice(color)}
              data-color-id={color.id}
            >
              {color.emoji}
              <span className="game__choice-name">{t(color.nameKey)}</span>
            </button>
          )
        })}
      </div>

      {answered && feedbackMode === 'parent-tap' && (
        <button className="game__next" onClick={advance}>{t('common.next')}</button>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Run existing tests to confirm no regression**

Run: `npx vitest run src/games/color-match/__tests__/ColorMatchGame.test.jsx`
Expected: PASS (all 6 existing tests)

- [ ] **Step 4: Add new tests for streak badge and missed-items summary**

Append to `src/games/color-match/__tests__/ColorMatchGame.test.jsx`:

```js
  it('shows the streak badge after 2 correct answers in a row', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 2; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.colorId)
      const correctId = screen.getByTestId('correct-color-id').textContent
      const correctBtn = buttons.find(b => b.dataset.colorId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(screen.getByText(/2/)).toBeInTheDocument()
  })

  it('shows missed colors in the results screen when an answer is wrong', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.colorId)
      const correctId = screen.getByTestId('correct-color-id').textContent
      const wrongBtn = buttons.find(b => b.dataset.colorId !== correctId)
      act(() => { fireEvent.click(wrongBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(screen.getByText(/let's practice/i)).toBeInTheDocument()
  })
```

- [ ] **Step 5: Run the full file to confirm everything passes**

Run: `npx vitest run src/games/color-match/__tests__/ColorMatchGame.test.jsx`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add src/games/color-match/index.jsx src/games/color-match/__tests__/ColorMatchGame.test.jsx
git commit -m "refactor: rebuild ColorMatchGame on useGameSession with streak and summary"
```

---

## Task 13: Admin settings toggle for `animationsEnabled`

**Files:**
- Modify: `src/admin/AdminPage.jsx`
- Modify: `src/admin/__tests__/AdminPage.test.jsx`
- Modify: `src/i18n/en.json`

**Interfaces:** Consumes `settings.animationsEnabled` and `updateSetting('animationsEnabled', bool)` from the existing `useSettings()` hook — no new hook surface.

- [ ] **Step 1: Add i18n strings**

In `src/i18n/en.json`, inside `"admin"`, add (after `"feedbackParentTap"`):

```json
    "feedbackParentTap": "👆 Parent Tap",
    "animationsHeading": "Celebration Animations",
    "animationsOn": "✨ On",
    "animationsOff": "Off",
```

- [ ] **Step 2: Write the failing test**

In `src/admin/__tests__/AdminPage.test.jsx`, add `animationsEnabled: true` to `mockSettings`:

```js
const mockSettings = { numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 10, childName: '', animationsEnabled: true }
```

Add a new test inside the `describe('AdminPage', ...)` block:

```js
  it('renders the animations toggle and calls updateSetting when clicked', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(screen.getByText(/celebration animations/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /off/i }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('animationsEnabled', false)
  })
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx`
Expected: FAIL — `Unable to find an element with the text: /celebration animations/i`

- [ ] **Step 4: Write the implementation**

In `src/admin/AdminPage.jsx`, add a new `admin__section` block immediately after the existing Feedback Mode section (after its closing `</div>`, before the Questions Per Session section):

```jsx
        <div className="admin__section">
          <h2>{t('admin.animationsHeading')}</h2>
          <div className="admin__toggle">
            <button
              className={`admin__toggle-btn${settings.animationsEnabled ? ' active' : ''}`}
              onClick={() => updateSetting('animationsEnabled', true)}
            >
              {t('admin.animationsOn')}
            </button>
            <button
              className={`admin__toggle-btn${!settings.animationsEnabled ? ' active' : ''}`}
              onClick={() => updateSetting('animationsEnabled', false)}
            >
              {t('admin.animationsOff')}
            </button>
          </div>
        </div>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx`
Expected: PASS (all tests including the new one)

- [ ] **Step 6: Commit**

```bash
git add src/admin/AdminPage.jsx src/admin/__tests__/AdminPage.test.jsx src/i18n/en.json
git commit -m "feat: add admin toggle for celebration animations"
```

---

## Task 14: Documentation updates

**Files:**
- Modify: `README.md`
- Modify: `docs/ENHANCEMENTS.md`
- Modify: `docs/TESTING.md`

- [ ] **Step 1: Update `README.md` Settings Reference table**

In `README.md`, change the Settings Reference table (currently ending with the Google Analytics row) to add a row:

```markdown
| Celebration animations | On | On, Off |
```

inserted after the `Questions per session` row and before the `Google Analytics ID` row. Then add a new descriptive line after the existing "Child's Name" bullet (before the `---`):

```markdown
**Celebration animations** — when on, a confetti burst plays on every correct answer and the game header shows the current answer streak once it reaches 2; the end-of-game screen lists any missed items. Turning this off disables the confetti only — streak tracking and the missed-items summary remain.
```

- [ ] **Step 2: Update `docs/ENHANCEMENTS.md`**

Remove these three lines from the "Gameplay & UX" section (now implemented):

```markdown
- **Celebration animations** — confetti or star burst on a correct answer (CSS keyframes or a lightweight lib like `canvas-confetti`)
- **Streak tracking** — highlight current correct-answer streak in the game header
```

and from the same section:

```markdown
- **Session summary screen** — richer end-of-game recap showing which animals were missed
```

(Leave the remaining backlog items — hint system, sound replay, parental lock — untouched.)

- [ ] **Step 3: Update `docs/TESTING.md`**

In `docs/TESTING.md`, under "Unit & component tests", add a new bullet after the existing `data-testid` bullet:

```markdown
- **Mocking `canvas-confetti`:** any test exercising `useGameSession` or a game component mocks `src/lib/confetti.js` (`vi.mock('.../lib/confetti', () => ({ fireConfetti: vi.fn() }))`) rather than the `canvas-confetti` package directly — it's the one module in the codebase that imports the library, keeping the mock seam in one place.
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/ENHANCEMENTS.md docs/TESTING.md
git commit -m "docs: document celebration animations, streak, and session summary"
```

---

## Task 15: Full verification pass

**Files:** None modified — verification only.

- [ ] **Step 1: Run the full unit/component test suite**

Run: `npm test -- run`
Expected: All tests pass, no failures.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: Build succeeds, `dist/` produced.

- [ ] **Step 4: Run end-to-end tests**

Run: `npm run e2e`
Expected: All E2E, a11y, and visual-regression specs pass. (If visual regression baselines fail due to the new streak badge / results layout, update baselines per `docs/TESTING.md` and re-run.)

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`, open the app, play Animal Sounds and Color Match end-to-end:
- Confirm confetti fires on a correct answer.
- Confirm the streak badge appears after 2 correct answers and disappears after a wrong one.
- Confirm the end-of-game screen shows missed items (or "Perfect run!" if none).
- Toggle "Celebration Animations" off in Admin, confirm confetti no longer fires but streak/summary still work.

- [ ] **Step 6: Commit any baseline updates from Step 4, if needed**

```bash
git add e2e/__screenshots__   # or wherever visual baselines live, if updated
git commit -m "test: update visual regression baselines for streak badge and results layout"
```
