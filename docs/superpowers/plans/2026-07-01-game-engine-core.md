# Game Engine Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a timer stopwatch, retry/hint engine mechanics, a live spaced-repetition queue, and difficulty auto-progression to the shared game engine, with both existing games updated to support all four.

**Architecture:** `useGameSession` gains a retry/hint state machine (`locked` replaces `answered`; new `disabledChoiceIds`, `hintActive`, `wrongAttempts`), live queue reinsertion via a new pure `reinsertMissed` util, and a difficulty-offer flag computed in `finishGame`. A new shared `GameChoiceGrid` component replaces the duplicated choice-rendering block in both games. A new `Timer` component surfaces `currentElapsedMs`. `GameResults` gains a dismissible difficulty-offer banner. Seven new settings are added to `DEFAULT_SETTINGS` and exposed in `AdminPage`.

**Tech Stack:** React 18, Vite, Vitest + React Testing Library, jest-axe, Playwright, react-i18next, CSS custom properties.

## Global Constraints

- No new npm dependencies — all features use the existing stack only.
- CSS uses design tokens from `src/index.css` (`var(--color-*)`, `var(--radius-*)`) for anything new; existing per-game CSS is left as-is except where a task explicitly says otherwise.
- All user-visible strings go in `src/i18n/en.json` under the appropriate namespace key; no string literals in JSX.
- Settings shape lives in `DEFAULT_SETTINGS` in `src/storage/adapter.js`. New keys: `timerDisplayEnabled` (bool, default `true`), `maxTries` (`'none' | 1 | 2 | 3 | 4 | 5 | 'unlimited'`, default `'none'`), `hintsEnabled` (bool, default `false`), `hintAfterWrongTaps` (`1-5`, default `2`), `retryCountsAsStreak` (bool, default `true`), `spacedRepetitionEnabled` (bool, default `false`), `difficultyAutoProgressionEnabled` (bool, default `false`).
- Score shape gains `attemptNumber` on each timing entry (additive, backward-compatible).
- Hook tests mock `src/storage/index.js` via `vi.hoisted()` + `vi.mock()` — see `src/hooks/__tests__/useGameSession.test.js` for the pattern.
- Tests covering timed feedback use `vi.useFakeTimers()` with `fireEvent`, not `userEvent`.
- Component tests wrap in `<MemoryRouter>` when the component uses `<Link>`.
- Every component/game test file gets an axe accessibility assertion.
- Both `AnimalSoundsGame` and `ColorMatchGame` must support every engine feature identically — no feature ships in only one game.
- All new settings default to preserving today's exact gameplay unless a parent opts in, except `timerDisplayEnabled` (defaults on, purely additive).
- Target version after this feature: **v0.6.0**.

---

## File Map

**Create:**
- `src/utils/reinsertMissed.js`
- `src/utils/__tests__/reinsertMissed.test.js`
- `src/components/Timer.jsx`
- `src/components/Timer.css`
- `src/components/__tests__/Timer.test.jsx`
- `src/components/Timer.stories.jsx`
- `src/components/GameChoiceGrid.jsx`
- `src/components/__tests__/GameChoiceGrid.test.jsx`
- `src/components/GameChoiceGrid.stories.jsx`
- `src/components/GameResults.stories.jsx`

**Modify:**
- `src/storage/adapter.js` — new `DEFAULT_SETTINGS` keys + interface doc comment
- `src/hooks/useGameSession.js` — retry/hint state machine, spaced repetition, difficulty offer, always-on timer interval
- `src/hooks/__tests__/useGameSession.test.js` — rename `answered`→`locked` assertions, add new coverage
- `src/components/GameResults.jsx` — difficulty-offer banner
- `src/components/__tests__/GameResults.test.jsx` — banner tests
- `src/games/animal-sounds/index.jsx` — use `GameChoiceGrid`, `Timer`, pass difficulty props to `GameResults`
- `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx` — retry/hint/timer coverage
- `src/games/color-match/index.jsx` — same as animal-sounds
- `src/games/color-match/__tests__/ColorMatchGame.test.jsx` — same as animal-sounds
- `src/index.css` — add `.game__choice--disabled-wrong` alongside existing `.correct`/`.wrong`/`.highlight-correct`
- `src/admin/AdminPage.jsx` — 7 new settings controls
- `src/admin/__tests__/AdminPage.test.jsx` — new controls' tests
- `src/i18n/en.json` — new translation keys
- `e2e/animal-sounds.spec.js`, `e2e/color-match.spec.js` — retry/hint E2E case
- `e2e/admin.spec.js` — new settings persistence
- `e2e/visual.spec.js` — new story ids
- `README.md` — settings reference table
- `CHANGELOG.md` — v0.6.0 entry
- `package.json` — version bump to 0.6.0
- `docs/ENHANCEMENTS.md` — move 4 items to Recently Completed, add "answer within N seconds" backlog item

---

## Task 1: New settings in `DEFAULT_SETTINGS`

**Files:**
- Modify: `src/storage/adapter.js`

**Interfaces:**
- Produces: `DEFAULT_SETTINGS` now includes `timerDisplayEnabled`, `maxTries`, `hintsEnabled`, `hintAfterWrongTaps`, `retryCountsAsStreak`, `spacedRepetitionEnabled`, `difficultyAutoProgressionEnabled`

- [ ] **Step 1: Update `DEFAULT_SETTINGS` and the interface doc comment**

Replace `src/storage/adapter.js`:

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
}

/**
 * Storage adapter interface. Every adapter must implement these four async methods.
 *
 * getScores()              → Promise<Score[]>
 * addScore(score)          → Promise<void>
 * getSettings()            → Promise<Settings>
 * saveSettings(settings)   → Promise<void>
 *
 * Score shape:   { gameId, score, total, date, timestamp, peakStreak?, timings? }
 *   peakStreak?: number — highest consecutive-correct run in that session (added v0.4.0)
 *   timings?: Array<{ questionIndex: number, itemId: string, correct: boolean, durationMs: number, attemptNumber: number }>
 *     itemId added in v0.4.0; older records omit it
 *     attemptNumber added in v0.6.0 (1 = first tap, 2 = first retry, etc.); older records omit it
 * Settings shape: { numChoices, feedbackMode, questionsPerSession, gaId, childName, animationsEnabled, tagOverrides,
 *                    timerDisplayEnabled, maxTries, hintsEnabled, hintAfterWrongTaps, retryCountsAsStreak,
 *                    spacedRepetitionEnabled, difficultyAutoProgressionEnabled }
 *   maxTries: 'none' | 1 | 2 | 3 | 4 | 5 | 'unlimited' — 'none' reproduces pre-v0.6.0 behavior (locks on first wrong tap)
 *
 * Best-streak adapter methods (added for per-game streak tracking):
 * getBestStreaks()            → Promise<{ [gameId: string]: number }>
 * saveBestStreaks(streaksMap) → Promise<void>
 */
```

- [ ] **Step 2: Run the full test suite to verify no regressions**

```bash
npx vitest run
```

Expected: all existing tests PASS (new fields are additive with backward-compatible defaults)

- [ ] **Step 3: Commit**

```bash
git add src/storage/adapter.js
git commit -m "feat: add 7 new settings for timer, retries/hints, spaced repetition, difficulty progression"
```

---

## Task 2: `reinsertMissed` util

**Files:**
- Create: `src/utils/reinsertMissed.js`
- Create: `src/utils/__tests__/reinsertMissed.test.js`

**Interfaces:**
- Produces: `reinsertMissed(queue, currentIndex, missedEntry) → newQueue` where `queue` is `Array<{ correct, choices }>` (the shape `buildQueue` produces) and `missedEntry` is one such entry.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/reinsertMissed.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest'
import reinsertMissed from '../reinsertMissed'

const entry = id => ({ correct: { id }, choices: [{ id }] })

afterEach(() => { vi.restoreAllMocks() })

describe('reinsertMissed', () => {
  it('reinserts the missed entry 2-4 questions ahead of the current index', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // offset = 2
    const queue = [entry('a'), entry('b'), entry('c'), entry('d'), entry('e')]
    const missed = entry('a')
    const next = reinsertMissed(queue, 0, missed)
    expect(next[2]).toBe(missed)
  })

  it('keeps the queue length unchanged', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // offset = 4
    const queue = [entry('a'), entry('b'), entry('c'), entry('d'), entry('e')]
    const next = reinsertMissed(queue, 0, entry('a'))
    expect(next).toHaveLength(queue.length)
  })

  it('clamps the target index to the end of the queue when there is not enough room', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // offset = 4
    const queue = [entry('a'), entry('b'), entry('c')]
    const missed = entry('a')
    const next = reinsertMissed(queue, 1, missed) // 1 + 4 = 5, clamp to length-1 = 2
    expect(next[2]).toBe(missed)
    expect(next).toHaveLength(3)
  })

  it('does not modify the queue when there is no room ahead of the current index', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const queue = [entry('a'), entry('b')]
    const missed = entry('a')
    const next = reinsertMissed(queue, 1, missed) // currentIndex is already the last index
    expect(next).toEqual(queue)
  })

  it('does not mutate the original queue array', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const queue = [entry('a'), entry('b'), entry('c'), entry('d')]
    const original = [...queue]
    reinsertMissed(queue, 0, entry('a'))
    expect(queue).toEqual(original)
  })

  it('displaces whatever entry currently occupies the target slot', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // offset = 2
    const queue = [entry('a'), entry('b'), entry('c'), entry('d')]
    const missed = entry('a')
    const next = reinsertMissed(queue, 0, missed)
    expect(next.filter(e => e === queue[2])).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/utils/__tests__/reinsertMissed.test.js
```

Expected: FAIL — `Cannot find module '../reinsertMissed'`

- [ ] **Step 3: Implement `reinsertMissed`**

Create `src/utils/reinsertMissed.js`:

```js
export default function reinsertMissed(queue, currentIndex, missedEntry) {
  if (currentIndex >= queue.length - 1) return queue

  const offset = 2 + Math.floor(Math.random() * 3) // 2, 3, or 4 questions ahead
  const targetIndex = Math.min(currentIndex + offset, queue.length - 1)

  const next = [...queue]
  next[targetIndex] = missedEntry
  return next
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/utils/__tests__/reinsertMissed.test.js
```

Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/reinsertMissed.js src/utils/__tests__/reinsertMissed.test.js
git commit -m "feat: add reinsertMissed util for live spaced-repetition queue reordering"
```

---

## Task 3: `useGameSession` retry/hint/spaced-repetition/difficulty state machine

**Files:**
- Modify: `src/hooks/useGameSession.js`
- Modify: `src/hooks/__tests__/useGameSession.test.js`

**Interfaces:**
- Consumes from Task 2: `reinsertMissed(queue, currentIndex, missedEntry) → newQueue`
- Consumes: `settings.timerDisplayEnabled, maxTries, hintsEnabled, hintAfterWrongTaps, retryCountsAsStreak, spacedRepetitionEnabled, difficultyAutoProgressionEnabled` from `useSettings()`; `updateSetting` from `useSettings()`
- Produces: `useGameSession(...)` now returns `{ current, index, total, locked, disabledChoiceIds, hintActive, selected, score, streak, bestStreak, missed, done, feedbackMode, currentElapsedMs, timings, numChoices, offerDifficultyBump, handleChoice, advance, restart, acceptDifficultyBump, dismissDifficultyBump }`. **`answered` is removed — renamed to `locked`.** This is a breaking change to the hook's public shape; `AnimalSoundsGame`/`ColorMatchGame` are updated in Tasks 6-7 (not this task), so their existing tests will fail until then — that's expected and addressed in those tasks.

This is the core engine rewrite. Note: this task only needs `src/hooks/__tests__/useGameSession.test.js` to pass in isolation; do not run the full suite until Task 7 (game components still reference the old `answered` field until then).

- [ ] **Step 1: Rewrite `useGameSession.test.js`**

Replace `src/hooks/__tests__/useGameSession.test.js` in full:

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
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false,
}

vi.mock('../useSettings', () => ({
  default: () => ({ settings: mockSettings, updateSetting: mockUpdateSetting }),
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
  mockSettings = {
    numChoices: 2, feedbackMode: 'parent-tap', questionsPerSession: 3, animationsEnabled: true,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false,
  }
})

describe('useGameSession — existing behavior', () => {
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
    setSettings({ animationsEnabled: false })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(mockFireConfetti).not.toHaveBeenCalled()
  })

  it('wrong answer with default maxTries locks immediately, resets streak, adds missed item', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    expect(result.current.locked).toBe(true)
    expect(result.current.streak).toBe(0)
    expect(result.current.missed).toEqual([correctItem])
    expect(mockFireConfetti).not.toHaveBeenCalled()
  })

  it('handleChoice is a no-op once locked', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    await act(async () => { result.current.handleChoice(correctItem) })
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.score).toBe(1)
  })

  it('advance() moves to the next question and resets locked/selected', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    await act(async () => { result.current.handleChoice(result.current.current.correct) })
    await act(async () => { result.current.advance() })

    expect(result.current.index).toBe(1)
    expect(result.current.locked).toBe(false)
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

  it('records a timing entry with attemptNumber for a correct answer', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.timings).toHaveLength(1)
    expect(result.current.timings[0].questionIndex).toBe(0)
    expect(result.current.timings[0].correct).toBe(true)
    expect(result.current.timings[0].attemptNumber).toBe(1)
    expect(result.current.timings[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('clears timings on restart', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    await act(async () => { result.current.handleChoice(result.current.current.correct) })
    expect(result.current.timings).toHaveLength(1)

    await act(async () => { result.current.restart() })
    expect(result.current.timings).toHaveLength(0)
  })

  it('includes peakStreak in the addScore call after completing a session', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    for (let i = 0; i < 3; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(mockAddScore).toHaveBeenCalledWith(
      expect.objectContaining({ peakStreak: expect.any(Number) })
    )
  })

  it('calls onTimeout after timeLimitMs ms if not yet locked', () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const { result } = renderHook(() =>
      useGameSession({ gameId: 'test-game', items, timeLimitMs: 5000, onTimeout })
    )
    act(() => {})
    expect(result.current.current).toBeDefined()

    act(() => { vi.advanceTimersByTime(5001) })
    expect(onTimeout).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('does not call onTimeout if the question was already locked', () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const { result } = renderHook(() =>
      useGameSession({ gameId: 'test-game', items, timeLimitMs: 5000, onTimeout })
    )
    act(() => {})
    expect(result.current.current).toBeDefined()

    act(() => { result.current.handleChoice(result.current.current.correct) })
    act(() => { vi.advanceTimersByTime(5001) })
    expect(onTimeout).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('currentElapsedMs ticks up even without a timeLimitMs', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    act(() => {})
    expect(result.current.currentElapsedMs).toBe(0)

    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current.currentElapsedMs).toBeGreaterThanOrEqual(300)
    vi.useRealTimers()
  })
})

describe('useGameSession — retries and maxTries', () => {
  it('maxTries=2 allows one retry before locking', async () => {
    setSettings({ maxTries: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    expect(result.current.locked).toBe(false)
    expect(result.current.disabledChoiceIds).toEqual([wrongItem.id])
  })

  it('correct answer on a retry still resolves the question and scores it', async () => {
    setSettings({ maxTries: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.locked).toBe(true)
    expect(result.current.score).toBe(1)
  })

  it('exhausting maxTries with 3 choices locks the question as wrong after 2 wrong taps', async () => {
    setSettings({ maxTries: 2, numChoices: 3 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItems = result.current.current.choices.filter(c => c.id !== correctItem.id)
    expect(wrongItems.length).toBeGreaterThanOrEqual(2)

    await act(async () => { result.current.handleChoice(wrongItems[0]) })
    await act(async () => { result.current.handleChoice(wrongItems[1]) })

    expect(result.current.locked).toBe(true)
    expect(result.current.missed).toEqual([correctItem])
  })

  it('maxTries="unlimited" never locks on a wrong answer', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 3 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItems = result.current.current.choices.filter(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItems[0]) })
    await act(async () => { result.current.handleChoice(wrongItems[1]) })

    expect(result.current.locked).toBe(false)
    expect(result.current.disabledChoiceIds).toEqual([wrongItems[0].id, wrongItems[1].id])
  })

  it('a disabled wrong choice is tracked in disabledChoiceIds and stays there after further taps', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 3 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.disabledChoiceIds).toContain(wrongItem.id)
  })

  it('advance() resets disabledChoiceIds and wrongAttempts-derived hintActive for the next question', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 3, hintsEnabled: true, hintAfterWrongTaps: 1 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    expect(result.current.hintActive).toBe(true)

    await act(async () => { result.current.handleChoice(correctItem) })
    await act(async () => { result.current.advance() })

    expect(result.current.disabledChoiceIds).toEqual([])
    expect(result.current.hintActive).toBe(false)
  })
})

describe('useGameSession — retryCountsAsStreak', () => {
  it('retryCountsAsStreak=true keeps the streak alive after a correct-on-retry', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 3, retryCountsAsStreak: true })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.streak).toBe(1)
  })

  it('retryCountsAsStreak=false resets the streak even on a correct-on-retry', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 3, retryCountsAsStreak: false })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.streak).toBe(0)
    expect(result.current.score).toBe(1) // still scored correct, just no streak
  })
})

describe('useGameSession — hints', () => {
  it('hintActive is false before hintAfterWrongTaps is reached', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 4, hintsEnabled: true, hintAfterWrongTaps: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItems = result.current.current.choices.filter(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItems[0]) })

    expect(result.current.hintActive).toBe(false)
  })

  it('hintActive becomes true once hintAfterWrongTaps is reached', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 4, hintsEnabled: true, hintAfterWrongTaps: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItems = result.current.current.choices.filter(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItems[0]) })
    await act(async () => { result.current.handleChoice(wrongItems[1]) })

    expect(result.current.hintActive).toBe(true)
  })

  it('hintActive stays false when hintsEnabled is false, regardless of wrong taps', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 4, hintsEnabled: false, hintAfterWrongTaps: 1 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    expect(result.current.hintActive).toBe(false)
  })
})

describe('useGameSession — spaced repetition', () => {
  it('reinserts a missed item into the queue when spacedRepetitionEnabled is true', async () => {
    setSettings({ spacedRepetitionEnabled: true, questionsPerSession: 4 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(4))

    const missedCorrect = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== missedCorrect.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    // Walk the rest of the queue and confirm the missed item's id reappears as a `.correct.id`
    const seenCorrectIds = []
    while (!result.current.done) {
      seenCorrectIds.push(result.current.current.correct.id)
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }
    expect(seenCorrectIds.filter(id => id === missedCorrect.id).length).toBeGreaterThanOrEqual(1)
  })

  it('does not reinsert when spacedRepetitionEnabled is false', async () => {
    setSettings({ spacedRepetitionEnabled: false, questionsPerSession: 4 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(4))

    const missedCorrect = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== missedCorrect.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    const seenCorrectIds = []
    while (!result.current.done) {
      seenCorrectIds.push(result.current.current.correct.id)
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }
    expect(seenCorrectIds.filter(id => id === missedCorrect.id)).toHaveLength(0)
  })
})

describe('useGameSession — difficulty auto-progression', () => {
  it('offers a difficulty bump after a perfect session when enabled and below the ceiling', async () => {
    setSettings({ difficultyAutoProgressionEnabled: true, numChoices: 2, questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(result.current.offerDifficultyBump).toBe(true)
  })

  it('does not offer a bump when the session was not perfect', async () => {
    setSettings({ difficultyAutoProgressionEnabled: true, numChoices: 2, questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    const wrongItem = result.current.current.choices.find(c => c.id !== result.current.current.correct.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    await act(async () => { result.current.advance() })
    await act(async () => { result.current.handleChoice(result.current.current.correct) })
    await act(async () => { result.current.advance() })

    expect(result.current.offerDifficultyBump).toBe(false)
  })

  it('does not offer a bump when numChoices is already at the ceiling of 4', async () => {
    setSettings({ difficultyAutoProgressionEnabled: true, numChoices: 4, questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(result.current.offerDifficultyBump).toBe(false)
  })

  it('does not offer a bump when the setting is disabled', async () => {
    setSettings({ difficultyAutoProgressionEnabled: false, numChoices: 2, questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(result.current.offerDifficultyBump).toBe(false)
  })

  it('acceptDifficultyBump raises numChoices by 1 and clears the offer', async () => {
    setSettings({ difficultyAutoProgressionEnabled: true, numChoices: 2, questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }
    await act(async () => { result.current.acceptDifficultyBump() })

    expect(mockUpdateSetting).toHaveBeenCalledWith('numChoices', 3)
    expect(result.current.offerDifficultyBump).toBe(false)
  })

  it('dismissDifficultyBump clears the offer without changing settings', async () => {
    setSettings({ difficultyAutoProgressionEnabled: true, numChoices: 2, questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }
    await act(async () => { result.current.dismissDifficultyBump() })

    expect(mockUpdateSetting).not.toHaveBeenCalled()
    expect(result.current.offerDifficultyBump).toBe(false)
  })

  it('restart() clears offerDifficultyBump', async () => {
    setSettings({ difficultyAutoProgressionEnabled: true, numChoices: 2, questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }
    await act(async () => { result.current.restart() })

    expect(result.current.offerDifficultyBump).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/useGameSession.test.js
```

Expected: FAIL — hook doesn't yet expose `locked`, `disabledChoiceIds`, `hintActive`, `offerDifficultyBump`, `acceptDifficultyBump`, `dismissDifficultyBump`, or spaced-repetition/retry behavior

- [ ] **Step 3: Rewrite `useGameSession.js`**

Replace `src/hooks/useGameSession.js`:

```js
import { useState, useEffect, useRef } from 'react'
import useSettings from './useSettings'
import useScores from './useScores'
import useBestStreak from './useBestStreak'
import { fireConfetti } from '../lib/confetti'
import buildQueue from '../utils/buildQueue'
import reinsertMissed from '../utils/reinsertMissed'

function resolveMaxTries(maxTries) {
  if (maxTries === 'unlimited') return Infinity
  if (maxTries === 'none' || maxTries == null) return 1
  return Number(maxTries)
}

export default function useGameSession({ gameId, items, timeLimitMs, onTimeout }) {
  const { settings, updateSetting } = useSettings()
  const { addScore } = useScores()
  const { bestStreak, recordStreak } = useBestStreak(gameId)

  const {
    numChoices, feedbackMode, questionsPerSession, animationsEnabled,
    timerDisplayEnabled, maxTries, hintsEnabled, hintAfterWrongTaps,
    retryCountsAsStreak, spacedRepetitionEnabled, difficultyAutoProgressionEnabled,
  } = settings

  const [queue,               setQueue]               = useState([])
  const [index,                setIndex]               = useState(0)
  const [locked,               setLocked]              = useState(false)
  const [selected,             setSelected]            = useState(null)
  const [disabledChoiceIds,    setDisabledChoiceIds]   = useState([])
  const [wrongAttempts,        setWrongAttempts]       = useState(0)
  const [score,                setScore]               = useState(0)
  const [streak,               setStreak]              = useState(0)
  const [missed,                setMissed]              = useState([])
  const [done,                 setDone]                = useState(false)
  const [currentElapsedMs,     setCurrentElapsedMs]    = useState(0)
  const [timings,              setTimings]             = useState([])
  const [offerDifficultyBump,  setOfferDifficultyBump] = useState(false)

  // Refs avoid stale closures in setTimeout/setInterval callbacks
  const scoreRef        = useRef(0)
  const streakRef       = useRef(0)
  const peakStreakRef   = useRef(0)
  const missedRef       = useRef([])
  const indexRef        = useRef(0)
  const queueRef        = useRef([])
  const timingsRef      = useRef([])
  const lockedRef       = useRef(false)
  const wrongAttemptsRef    = useRef(0)
  const disabledChoiceIdsRef = useRef([])
  const questionStartRef = useRef(Date.now())
  const onTimeoutRef    = useRef(onTimeout)
  useEffect(() => { onTimeoutRef.current = onTimeout })

  useEffect(() => {
    if (numChoices && questionsPerSession) {
      const q = buildQueue(items, numChoices, questionsPerSession)
      queueRef.current = q
      setQueue(q)
    }
  }, [numChoices, questionsPerSession, items])

  // Per-question timer, retry-state reset, and optional timeout
  useEffect(() => {
    if (!queueRef.current[indexRef.current]) return
    questionStartRef.current = Date.now()
    lockedRef.current = false
    wrongAttemptsRef.current = 0
    disabledChoiceIdsRef.current = []
    setLocked(false)
    setWrongAttempts(0)
    setDisabledChoiceIds([])
    setCurrentElapsedMs(0)

    const intervalId = setInterval(() => {
      setCurrentElapsedMs(Date.now() - questionStartRef.current)
    }, 100)

    const timeoutId = timeLimitMs
      ? setTimeout(() => {
          if (!lockedRef.current) onTimeoutRef.current?.()
        }, timeLimitMs)
      : null

    return () => {
      clearInterval(intervalId)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [index, queue, timeLimitMs])

  const current = queue[index]
  const hintActive = hintsEnabled && !locked && wrongAttempts >= hintAfterWrongTaps

  function handleChoice(item) {
    if (lockedRef.current) return
    if (disabledChoiceIdsRef.current.includes(item.id)) return
    setSelected(item.id)

    const durationMs = Date.now() - questionStartRef.current
    const isCorrect = item.id === current.correct.id
    const attemptNumber = wrongAttemptsRef.current + 1

    const entry = { questionIndex: index, itemId: current.correct.id, correct: isCorrect, durationMs, attemptNumber }
    const nextTimings = [...timingsRef.current, entry]
    timingsRef.current = nextTimings
    setTimings(nextTimings)

    let willLock = false

    if (isCorrect) {
      scoreRef.current += 1
      setScore(scoreRef.current)

      const gotItOnRetry = wrongAttemptsRef.current > 0
      if (!gotItOnRetry || retryCountsAsStreak) {
        streakRef.current += 1
        setStreak(streakRef.current)
        if (streakRef.current > peakStreakRef.current) peakStreakRef.current = streakRef.current
        recordStreak(streakRef.current)
      } else {
        streakRef.current = 0
        setStreak(0)
      }
      if (animationsEnabled) fireConfetti()

      willLock = true
    } else {
      const nextWrongAttempts = wrongAttemptsRef.current + 1
      wrongAttemptsRef.current = nextWrongAttempts
      setWrongAttempts(nextWrongAttempts)

      const nextDisabled = [...disabledChoiceIdsRef.current, item.id]
      disabledChoiceIdsRef.current = nextDisabled
      setDisabledChoiceIds(nextDisabled)

      const resolvedMax = resolveMaxTries(maxTries)
      if (nextWrongAttempts >= resolvedMax) {
        streakRef.current = 0
        setStreak(0)
        missedRef.current = [...missedRef.current, current.correct]
        setMissed(missedRef.current)

        if (spacedRepetitionEnabled) {
          queueRef.current = reinsertMissed(queueRef.current, indexRef.current, current)
          setQueue(queueRef.current)
        }

        willLock = true
      }
    }

    if (willLock) {
      setLocked(true)
      lockedRef.current = true
      if (feedbackMode === 'immediate') {
        setTimeout(advance, 1500)
      }
    }
  }

  function advance() {
    const nextIndex = indexRef.current + 1
    if (nextIndex >= queueRef.current.length) {
      finishGame()
    } else {
      indexRef.current = nextIndex
      setIndex(nextIndex)
      setLocked(false)
      lockedRef.current = false
      setSelected(null)
      setDisabledChoiceIds([])
      disabledChoiceIdsRef.current = []
      setWrongAttempts(0)
      wrongAttemptsRef.current = 0
    }
  }

  async function finishGame() {
    const result = {
      gameId,
      score:      scoreRef.current,
      total:      queueRef.current.length,
      date:       new Date().toISOString().split('T')[0],
      timestamp:  Date.now(),
      timings:    timingsRef.current,
      peakStreak: peakStreakRef.current,
    }
    await addScore(result)

    if (
      difficultyAutoProgressionEnabled &&
      scoreRef.current === queueRef.current.length &&
      numChoices < 4
    ) {
      setOfferDifficultyBump(true)
    }

    setDone(true)
  }

  function acceptDifficultyBump() {
    updateSetting('numChoices', numChoices + 1)
    setOfferDifficultyBump(false)
  }

  function dismissDifficultyBump() {
    setOfferDifficultyBump(false)
  }

  function restart() {
    scoreRef.current      = 0
    streakRef.current     = 0
    peakStreakRef.current = 0
    missedRef.current     = []
    indexRef.current = 0
    timingsRef.current = []
    lockedRef.current = false
    wrongAttemptsRef.current = 0
    disabledChoiceIdsRef.current = []
    const q = buildQueue(items, numChoices, questionsPerSession)
    queueRef.current = q
    setQueue(q)
    setIndex(0)
    setLocked(false)
    setSelected(null)
    setDisabledChoiceIds([])
    setWrongAttempts(0)
    setScore(0)
    setStreak(0)
    setMissed([])
    setDone(false)
    setTimings([])
    setCurrentElapsedMs(0)
    setOfferDifficultyBump(false)
  }

  return {
    current, index, total: queue.length, locked, disabledChoiceIds, hintActive, selected,
    score, streak, bestStreak, missed, done, feedbackMode, numChoices,
    currentElapsedMs, timings, timerDisplayEnabled, offerDifficultyBump,
    handleChoice, advance, restart, acceptDifficultyBump, dismissDifficultyBump,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/useGameSession.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGameSession.js src/hooks/__tests__/useGameSession.test.js
git commit -m "feat: rewrite useGameSession with retries, hints, spaced repetition, difficulty auto-progression"
```

---

## Task 4: `Timer` component

**Files:**
- Create: `src/components/Timer.jsx`
- Create: `src/components/Timer.css`
- Create: `src/components/__tests__/Timer.test.jsx`
- Create: `src/components/Timer.stories.jsx`

**Interfaces:**
- Consumes from Task 3: `currentElapsedMs: number` (ms)
- Produces: `<Timer elapsedMs={number} />`

- [ ] **Step 1: Write the failing tests**

Create `src/components/__tests__/Timer.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import Timer from '../Timer'

describe('Timer', () => {
  it('renders elapsed seconds to one decimal place', () => {
    render(<Timer elapsedMs={3200} />)
    expect(screen.getByText('3.2s')).toBeInTheDocument()
  })

  it('renders 0.0s at the start of a question', () => {
    render(<Timer elapsedMs={0} />)
    expect(screen.getByText('0.0s')).toBeInTheDocument()
  })

  it('rounds to one decimal place rather than truncating', () => {
    render(<Timer elapsedMs={3260} />)
    expect(screen.getByText('3.3s')).toBeInTheDocument()
  })

  it('has an aria-label describing the elapsed time', () => {
    render(<Timer elapsedMs={1000} />)
    expect(screen.getByLabelText('Elapsed time: 1.0 seconds')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Timer elapsedMs={2000} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/__tests__/Timer.test.jsx
```

Expected: FAIL — `Cannot find module '../Timer'`

- [ ] **Step 3: Implement `Timer`**

Create `src/components/Timer.jsx`:

```jsx
import './Timer.css'

export default function Timer({ elapsedMs }) {
  const seconds = (elapsedMs / 1000).toFixed(1)
  return (
    <div className="timer" aria-label={`Elapsed time: ${seconds} seconds`}>
      <span className="timer__icon" aria-hidden="true">⏱️</span>
      <span className="timer__value">{seconds}s</span>
    </div>
  )
}
```

- [ ] **Step 4: Create `Timer.css`**

Create `src/components/Timer.css`:

```css
.timer {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.timer__icon {
  display: inline-block;
  animation: timer-pulse 1s ease-in-out infinite;
}

.timer__value {
  font-variant-numeric: tabular-nums;
}

@keyframes timer-pulse {
  0%, 100% { transform: scale(1);    opacity: 0.7; }
  50%      { transform: scale(1.15); opacity: 1;   }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/components/__tests__/Timer.test.jsx
```

Expected: 5 tests PASS

- [ ] **Step 6: Create the Storybook story**

Create `src/components/Timer.stories.jsx`:

```jsx
import Timer from './Timer'

export default {
  title: 'Components/Timer',
  component: Timer,
}

export const Start   = { args: { elapsedMs: 0 } }
export const MidTick  = { args: { elapsedMs: 4700 } }
```

- [ ] **Step 7: Add the new story to the visual regression suite**

In `e2e/visual.spec.js`, add `'components-timer--start'` and `'components-timer--midtick'` to the `stories` array (alphabetical-ish grouping with the other `components-*` entries is fine, no strict ordering requirement — just add them near `components-scorehistory--*`).

- [ ] **Step 8: Commit**

```bash
git add src/components/Timer.jsx src/components/Timer.css src/components/__tests__/Timer.test.jsx src/components/Timer.stories.jsx e2e/visual.spec.js
git commit -m "feat: add Timer stopwatch component"
```

---

## Task 5: `GameChoiceGrid` shared component

**Files:**
- Create: `src/components/GameChoiceGrid.jsx`
- Create: `src/components/__tests__/GameChoiceGrid.test.jsx`
- Create: `src/components/GameChoiceGrid.stories.jsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes from Task 3: `locked, disabledChoiceIds, hintActive` from `useGameSession`
- Produces: `<GameChoiceGrid choices={item[]} correctId={string} selected={string|null} locked={bool} disabledChoiceIds={string[]} hintActive={bool} onChoose={fn} getChoiceProps={(item, i) => object} renderChoiceContent={(item, i) => ReactNode} />`

- [ ] **Step 1: Add the disabled-wrong CSS class**

In `src/index.css`, immediately after the existing `.highlight-correct` rule (`src/index.css:58`), add:

```css
.game__choice--disabled-wrong { opacity: 0.45; filter: grayscale(60%); animation: shake-red 0.6s ease; }
```

- [ ] **Step 2: Write the failing tests**

Create `src/components/__tests__/GameChoiceGrid.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import GameChoiceGrid from '../GameChoiceGrid'

const choices = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

function renderGrid(props = {}) {
  return render(
    <GameChoiceGrid
      choices={choices}
      correctId="a"
      selected={null}
      locked={false}
      disabledChoiceIds={[]}
      hintActive={false}
      onChoose={vi.fn()}
      getChoiceProps={item => ({ 'data-choice-id': item.id })}
      renderChoiceContent={item => item.id.toUpperCase()}
      {...props}
    />
  )
}

describe('GameChoiceGrid', () => {
  it('renders one button per choice', () => {
    renderGrid()
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('calls onChoose with the tapped item', async () => {
    const onChoose = vi.fn()
    renderGrid({ onChoose })
    screen.getByText('A').click()
    expect(onChoose).toHaveBeenCalledWith(choices[0])
  })

  it('applies extra props from getChoiceProps', () => {
    renderGrid()
    expect(screen.getByText('A').closest('button')).toHaveAttribute('data-choice-id', 'a')
  })

  it('disables all choices when locked', () => {
    renderGrid({ locked: true })
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toBeDisabled()
    }
  })

  it('disables only the wrong-tapped choice when not locked', () => {
    renderGrid({ disabledChoiceIds: ['b'] })
    expect(screen.getByText('B').closest('button')).toBeDisabled()
    expect(screen.getByText('A').closest('button')).not.toBeDisabled()
  })

  it('marks a disabled wrong choice with the disabled-wrong class, not locked', () => {
    renderGrid({ disabledChoiceIds: ['b'] })
    expect(screen.getByText('B').closest('button')).toHaveClass('game__choice--disabled-wrong')
  })

  it('shows correct/wrong classes only once locked', () => {
    renderGrid({ locked: true, selected: 'b', disabledChoiceIds: ['b'] })
    expect(screen.getByText('A').closest('button')).toHaveClass('highlight-correct')
    expect(screen.getByText('B').closest('button')).toHaveClass('wrong')
  })

  it('shows highlight-correct when hintActive is true even if not locked', () => {
    renderGrid({ hintActive: true })
    expect(screen.getByText('A').closest('button')).toHaveClass('highlight-correct')
  })

  it('does not show highlight-correct when neither locked nor hintActive', () => {
    renderGrid()
    expect(screen.getByText('A').closest('button')).not.toHaveClass('highlight-correct')
  })

  it('has no accessibility violations', async () => {
    const { container } = renderGrid()
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/components/__tests__/GameChoiceGrid.test.jsx
```

Expected: FAIL — `Cannot find module '../GameChoiceGrid'`

- [ ] **Step 4: Implement `GameChoiceGrid`**

Create `src/components/GameChoiceGrid.jsx`:

```jsx
export default function GameChoiceGrid({
  choices, correctId, selected, locked, disabledChoiceIds, hintActive,
  onChoose, getChoiceProps, renderChoiceContent,
}) {
  return (
    <div className="game__choices">
      {choices.map((item, i) => {
        const isSelected = selected === item.id
        const isCorrect = item.id === correctId
        const isDisabledWrong = disabledChoiceIds.includes(item.id)

        let cls = 'game__choice'
        if (locked && isSelected && isCorrect) cls += ' correct'
        if (locked && isSelected && !isCorrect) cls += ' wrong'
        if ((locked || hintActive) && !isSelected && isCorrect) cls += ' highlight-correct'
        if (!locked && isDisabledWrong) cls += ' game__choice--disabled-wrong'

        const { className: extraClassName, ...restExtraProps } = getChoiceProps(item, i) ?? {}
        if (extraClassName) cls += ` ${extraClassName}`

        return (
          <button
            key={item.id}
            className={cls}
            disabled={locked || isDisabledWrong}
            onClick={() => onChoose(item)}
            {...restExtraProps}
          >
            {renderChoiceContent(item, i)}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/components/__tests__/GameChoiceGrid.test.jsx
```

Expected: 10 tests PASS

- [ ] **Step 6: Create the Storybook story**

Create `src/components/GameChoiceGrid.stories.jsx`:

```jsx
import GameChoiceGrid from './GameChoiceGrid'

const choices = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const baseArgs = {
  choices,
  correctId: 'a',
  onChoose: () => {},
  getChoiceProps: () => ({}),
  renderChoiceContent: item => item.id.toUpperCase(),
}

export default {
  title: 'Components/GameChoiceGrid',
  component: GameChoiceGrid,
}

export const Default = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: [], hintActive: false } }
export const RetryInProgress = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: ['b'], hintActive: false } }
export const HintActive = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: ['b'], hintActive: true } }
export const Locked = { args: { ...baseArgs, selected: 'a', locked: true, disabledChoiceIds: [], hintActive: false } }
```

- [ ] **Step 7: Add the new stories to the visual regression suite**

In `e2e/visual.spec.js`, add `'components-gamechoicegrid--default'`, `'components-gamechoicegrid--retryinprogress'`, `'components-gamechoicegrid--hintactive'`, `'components-gamechoicegrid--locked'` to the `stories` array.

- [ ] **Step 8: Commit**

```bash
git add src/components/GameChoiceGrid.jsx src/components/__tests__/GameChoiceGrid.test.jsx src/components/GameChoiceGrid.stories.jsx src/index.css e2e/visual.spec.js
git commit -m "feat: add shared GameChoiceGrid component for retry/hint choice rendering"
```

---

## Task 6: `GameResults` difficulty-offer banner

**Files:**
- Modify: `src/components/GameResults.jsx`
- Modify: `src/components/__tests__/GameResults.test.jsx`
- Create: `src/components/GameResults.stories.jsx`
- Modify: `src/i18n/en.json`

**Interfaces:**
- Consumes from Task 3: `offerDifficultyBump: bool`, `numChoices: number`, `acceptDifficultyBump: fn`, `dismissDifficultyBump: fn`
- Produces: `<GameResults ... offerDifficultyBump numChoices onAcceptDifficultyBump onDismissDifficultyBump />`

- [ ] **Step 1: Add i18n keys**

In `src/i18n/en.json`, add inside `"common"` (after `"missedHeading"`):

```json
"difficultyOfferHeading": "Perfect session! Try {{count}} choices next time?",
"difficultyOfferAccept": "Yes, level up!",
"difficultyOfferDismiss": "Not yet"
```

- [ ] **Step 2: Write the failing tests**

Add these tests to `src/components/__tests__/GameResults.test.jsx` (inside the existing `describe('GameResults')` block, keep all existing tests as-is):

```jsx
it('does not show the difficulty-offer banner by default', () => {
  render(<GameResults score={3} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
  expect(screen.queryByText(/perfect session/i)).not.toBeInTheDocument()
})

it('shows the difficulty-offer banner when offerDifficultyBump is true', () => {
  render(
    <GameResults
      score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
      offerDifficultyBump numChoices={2}
      onAcceptDifficultyBump={vi.fn()} onDismissDifficultyBump={vi.fn()}
    />
  )
  expect(screen.getByText('Perfect session! Try 3 choices next time?')).toBeInTheDocument()
})

it('calls onAcceptDifficultyBump when accepted', async () => {
  const onAccept = vi.fn()
  render(
    <GameResults
      score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
      offerDifficultyBump numChoices={2}
      onAcceptDifficultyBump={onAccept} onDismissDifficultyBump={vi.fn()}
    />
  )
  await userEvent.click(screen.getByRole('button', { name: /level up/i }))
  expect(onAccept).toHaveBeenCalledTimes(1)
})

it('calls onDismissDifficultyBump when dismissed', async () => {
  const onDismiss = vi.fn()
  render(
    <GameResults
      score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
      offerDifficultyBump numChoices={2}
      onAcceptDifficultyBump={vi.fn()} onDismissDifficultyBump={onDismiss}
    />
  )
  await userEvent.click(screen.getByRole('button', { name: /not yet/i }))
  expect(onDismiss).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/components/__tests__/GameResults.test.jsx
```

Expected: 4 new tests FAIL

- [ ] **Step 4: Implement the banner in `GameResults`**

Replace `src/components/GameResults.jsx`:

```jsx
import { useTranslation } from 'react-i18next'
import './GameResults.css'

export default function GameResults({
  score, total, missed, onPlayAgain, onHome, renderMissedItem,
  offerDifficultyBump = false, numChoices, onAcceptDifficultyBump, onDismissDifficultyBump,
}) {
  const { t } = useTranslation()
  return (
    <div className="results">
      <div className="results__emoji">{missed.length === 0 ? '🎉' : '⭐'}</div>
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

      {offerDifficultyBump && (
        <div className="results__difficulty-offer">
          <div className="results__label">{t('common.difficultyOfferHeading', { count: numChoices + 1 })}</div>
          <div className="results__actions">
            <button className="results__btn results__btn--play" onClick={onAcceptDifficultyBump}>
              {t('common.difficultyOfferAccept')}
            </button>
            <button className="results__btn results__btn--home" onClick={onDismissDifficultyBump}>
              {t('common.difficultyOfferDismiss')}
            </button>
          </div>
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

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/components/__tests__/GameResults.test.jsx
```

Expected: all tests PASS

- [ ] **Step 6: Create the Storybook story**

Create `src/components/GameResults.stories.jsx`:

```jsx
import GameResults from './GameResults'

const renderMissedItem = item => <span>{item.label}</span>

export default {
  title: 'Components/GameResults',
  component: GameResults,
}

export const PerfectRun = {
  args: { score: 5, total: 5, missed: [], onPlayAgain: () => {}, onHome: () => {}, renderMissedItem },
}

export const WithMissedItems = {
  args: {
    score: 3, total: 5,
    missed: [{ id: 'a', label: 'Apple' }, { id: 'b', label: 'Banana' }],
    onPlayAgain: () => {}, onHome: () => {}, renderMissedItem,
  },
}

export const PerfectWithDifficultyOffer = {
  args: {
    score: 5, total: 5, missed: [], onPlayAgain: () => {}, onHome: () => {}, renderMissedItem,
    offerDifficultyBump: true, numChoices: 2,
    onAcceptDifficultyBump: () => {}, onDismissDifficultyBump: () => {},
  },
}
```

- [ ] **Step 7: Add the new stories to the visual regression suite**

In `e2e/visual.spec.js`, add `'components-gameresults--perfectrun'`, `'components-gameresults--withmisseditems'`, `'components-gameresults--perfectwithdifficultyoffer'` to the `stories` array.

- [ ] **Step 8: Commit**

```bash
git add src/components/GameResults.jsx src/components/__tests__/GameResults.test.jsx src/components/GameResults.stories.jsx src/i18n/en.json e2e/visual.spec.js
git commit -m "feat: add difficulty auto-progression offer banner to GameResults"
```

---

## Task 7: Update `AnimalSoundsGame` to use the new engine

**Files:**
- Modify: `src/games/animal-sounds/index.jsx`
- Modify: `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`

**Interfaces:**
- Consumes from Task 3: `locked, disabledChoiceIds, hintActive, currentElapsedMs, timerDisplayEnabled, offerDifficultyBump, numChoices, acceptDifficultyBump, dismissDifficultyBump` from `useGameSession`
- Consumes from Task 4: `<Timer elapsedMs={...} />`
- Consumes from Task 5: `<GameChoiceGrid ... />`
- Consumes from Task 6: `<GameResults offerDifficultyBump ... />`

- [ ] **Step 1: Update the existing test file's `answered`-dependent assertions and add new coverage**

Replace `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx` in full:

```jsx
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import AnimalSoundsGame from '../index'

window.HTMLMediaElement.prototype.play  = vi.fn().mockResolvedValue(undefined)
window.HTMLMediaElement.prototype.pause = vi.fn()
window.HTMLMediaElement.prototype.load  = vi.fn()

vi.mock('../../../lib/confetti', () => ({ fireConfetti: vi.fn() }))

let mockSettings = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerDisplayEnabled: true,
}
const mockUpdateSetting = vi.fn()

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings, updateSetting: mockUpdateSetting }),
}))

vi.mock('../../../hooks/useScores', () => ({
  default: () => ({ addScore: vi.fn().mockResolvedValue(undefined), scores: [], getBestScore: () => 0, getScoresByGame: () => [], getAllScores: () => [] }),
}))

vi.mock('../../../hooks/useBestStreak', () => ({
  default: () => ({ bestStreak: 0, recordStreak: vi.fn().mockResolvedValue(undefined) }),
}))

const onGameEnd = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockSettings = {
    numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerDisplayEnabled: true,
  }
})

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
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
  })

  it('Home button calls onGameEnd', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.animalId)
      const correctId = screen.getByTestId('correct-animal-id').textContent
      const correctBtn = buttons.find(b => b.dataset.animalId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    await act(async () => { await userEvent.click(screen.getByRole('button', { name: /home/i })) })
    expect(onGameEnd).toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    let container
    await act(async () => { container = render(<AnimalSoundsGame onGameEnd={onGameEnd} />).container })
    expect(await axe(container)).toHaveNoViolations()
  })

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

  it('shows the timer when timerDisplayEnabled is true', async () => {
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    expect(screen.getByLabelText(/elapsed time/i)).toBeInTheDocument()
  })

  it('hides the timer when timerDisplayEnabled is false', async () => {
    mockSettings = { ...mockSettings, timerDisplayEnabled: false }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByLabelText(/elapsed time/i)).not.toBeInTheDocument()
  })

  it('allows a retry when maxTries permits it, without locking the question', async () => {
    mockSettings = { ...mockSettings, feedbackMode: 'parent-tap', maxTries: 2, numChoices: 3 }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    const buttons = screen.getAllByRole('button').filter(b => b.dataset.animalId)
    const correctId = screen.getByTestId('correct-animal-id').textContent
    const wrongBtn = buttons.find(b => b.dataset.animalId !== correctId)
    await act(async () => { await userEvent.click(wrongBtn) })

    expect(wrongBtn).toBeDisabled()
    const correctBtn = buttons.find(b => b.dataset.animalId === correctId)
    expect(correctBtn).not.toBeDisabled()
  })

  it('shows the difficulty-offer banner after a perfect session when enabled', async () => {
    mockSettings = { ...mockSettings, feedbackMode: 'parent-tap', difficultyAutoProgressionEnabled: true, questionsPerSession: 3, numChoices: 2 }
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.animalId)
      const correctId = screen.getByTestId('correct-animal-id').textContent
      const correctBtn = buttons.find(b => b.dataset.animalId === correctId)
      await act(async () => { await userEvent.click(correctBtn) })
      await act(async () => { await userEvent.click(screen.getByRole('button', { name: /next/i })) })
    }

    expect(screen.getByText(/perfect session/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify the new tests fail**

```bash
npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx
```

Expected: many tests FAIL — `index.jsx` still destructures the old `answered` field and doesn't render `Timer`/use `GameChoiceGrid`/pass difficulty props

- [ ] **Step 3: Update `AnimalSoundsGame`**

Replace `src/games/animal-sounds/index.jsx`:

```jsx
import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import StreakBadge from '../../components/StreakBadge'
import GameResults from '../../components/GameResults'
import GameChoiceGrid from '../../components/GameChoiceGrid'
import Timer from '../../components/Timer'
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
    current, index, total, locked, disabledChoiceIds, hintActive, selected,
    score, streak, missed, done, feedbackMode, handleChoice, advance, restart,
    currentElapsedMs, timerDisplayEnabled, offerDifficultyBump, numChoices,
    acceptDifficultyBump, dismissDifficultyBump,
  } = useGameSession({ gameId: 'animal-sounds', items: animals })

  const audioRef = useRef(null)

  const playSound = useCallback(() => {
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
  }, [current])

  useEffect(() => {
    if (!current) return
    playSound()
  }, [index, playSound, current])

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
        offerDifficultyBump={offerDifficultyBump}
        numChoices={numChoices}
        onAcceptDifficultyBump={acceptDifficultyBump}
        onDismissDifficultyBump={dismissDifficultyBump}
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
        {timerDisplayEnabled && <Timer elapsedMs={currentElapsedMs} />}
      </div>

      <GameChoiceGrid
        choices={current.choices}
        correctId={current.correct.id}
        selected={selected}
        locked={locked}
        disabledChoiceIds={disabledChoiceIds}
        hintActive={hintActive}
        onChoose={handleChoice}
        getChoiceProps={(animal, i) => ({
          style: { background: CHOICE_COLORS[i % CHOICE_COLORS.length] },
          'data-animal-id': animal.id,
        })}
        renderChoiceContent={animal => (
          <>
            {animal.emoji}
            <span className="game__choice-name">{t(animal.nameKey)}</span>
          </>
        )}
      />

      {locked && feedbackMode === 'parent-tap' && (
        <button className="game__next" onClick={advance}>{t('common.next')}</button>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/games/animal-sounds/index.jsx src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx
git commit -m "feat: wire retries/hints/timer/difficulty-offer into AnimalSoundsGame"
```

---

## Task 8: Update `ColorMatchGame` to use the new engine

**Files:**
- Modify: `src/games/color-match/index.jsx`
- Modify: `src/games/color-match/__tests__/ColorMatchGame.test.jsx`

**Interfaces:** same as Task 7, applied to Color Match's data shape (`color.color`/`color.textColor` instead of emoji/CHOICE_COLORS).

- [ ] **Step 1: Read the current `ColorMatchGame.test.jsx` before editing**

Run:

```bash
npx vitest run src/games/color-match/__tests__/ColorMatchGame.test.jsx
```

Note the existing test names and mocked hooks (structure mirrors `AnimalSoundsGame.test.jsx` from Task 7 but with `data-color-id` instead of `data-animal-id`, and `colorMatch.prompt` instead of `animalSounds.prompt`, and no sound/replay button). Update it following the exact same pattern as Task 7 Step 1: add the same `mockSettings`/`mockUpdateSetting` scaffolding, keep every existing test, and add four new tests analogous to Task 7's: timer shown/hidden, retry-without-locking, difficulty-offer banner. Use `b.dataset.colorId` instead of `b.dataset.animalId`, and `screen.getByTestId('correct-color-id')` instead of `correct-animal-id`.

- [ ] **Step 2: Run tests to verify the new tests fail**

```bash
npx vitest run src/games/color-match/__tests__/ColorMatchGame.test.jsx
```

Expected: new tests FAIL, `index.jsx` not yet updated

- [ ] **Step 3: Update `ColorMatchGame`**

Replace `src/games/color-match/index.jsx`:

```jsx
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import StreakBadge from '../../components/StreakBadge'
import GameResults from '../../components/GameResults'
import GameChoiceGrid from '../../components/GameChoiceGrid'
import Timer from '../../components/Timer'
import colors from './data/colors'
import manifest from './manifest.json'
import './ColorMatchGame.css'

const BORDERED_IDS = new Set(['white', 'gray'])

export default function ColorMatchGame({ onGameEnd }) {
  const { t } = useTranslation()
  const {
    current, index, total, locked, disabledChoiceIds, hintActive, selected,
    score, streak, missed, done, feedbackMode, handleChoice, advance, restart,
    currentElapsedMs, timerDisplayEnabled, offerDifficultyBump, numChoices,
    acceptDifficultyBump, dismissDifficultyBump,
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
        offerDifficultyBump={offerDifficultyBump}
        numChoices={numChoices}
        onAcceptDifficultyBump={acceptDifficultyBump}
        onDismissDifficultyBump={dismissDifficultyBump}
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
        {timerDisplayEnabled && <Timer elapsedMs={currentElapsedMs} />}
      </div>

      <GameChoiceGrid
        choices={current.choices}
        correctId={current.correct.id}
        selected={selected}
        locked={locked}
        disabledChoiceIds={disabledChoiceIds}
        hintActive={hintActive}
        onChoose={handleChoice}
        getChoiceProps={color => ({
          style: { background: color.color, color: color.textColor },
          className: BORDERED_IDS.has(color.id) ? 'game__choice--bordered' : undefined,
          'data-color-id': color.id,
        })}
        renderChoiceContent={color => (
          <>
            {color.emoji}
            <span className="game__choice-name">{t(color.nameKey)}</span>
          </>
        )}
      />

      {locked && feedbackMode === 'parent-tap' && (
        <button className="game__next" onClick={advance}>{t('common.next')}</button>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/games/color-match/__tests__/ColorMatchGame.test.jsx
```

Expected: all tests PASS

- [ ] **Step 5: Run the full test suite to verify no regressions anywhere**

```bash
npx vitest run
```

Expected: all tests PASS across the whole repo (this is the first point since Task 3 where the full suite is green again)

- [ ] **Step 6: Commit**

```bash
git add src/games/color-match/index.jsx src/games/color-match/__tests__/ColorMatchGame.test.jsx
git commit -m "feat: wire retries/hints/timer/difficulty-offer into ColorMatchGame"
```

---

## Task 9: `AdminPage` settings controls

**Files:**
- Modify: `src/admin/AdminPage.jsx`
- Modify: `src/admin/__tests__/AdminPage.test.jsx`
- Modify: `src/i18n/en.json`

**Interfaces:**
- Consumes from Task 1: 7 new keys in `DEFAULT_SETTINGS`
- Produces: 7 new sections in `AdminPage`'s Settings tab, each calling `updateSetting(key, value)`

- [ ] **Step 1: Add i18n keys**

In `src/i18n/en.json`, add inside `"admin"` (after `"gaLabel"`, before `"reset"`):

```json
"timerDisplayHeading": "Timer Display",
"timerDisplayOn": "⏱️ On",
"timerDisplayOff": "Off",
"maxTriesHeading": "Retry Attempts",
"maxTriesHint": "How many wrong taps are allowed before a question locks in as missed.",
"maxTriesNone": "None",
"maxTriesUnlimited": "Unlimited",
"hintsHeading": "Hints",
"hintsOn": "💡 On",
"hintsOff": "Off",
"hintAfterWrongTapsHeading": "Show Hint After",
"retryStreakHeading": "Retry Counts Toward Streak",
"retryStreakOn": "On",
"retryStreakOff": "Off",
"spacedRepetitionHeading": "Spaced Repetition",
"spacedRepetitionOn": "On",
"spacedRepetitionOff": "Off",
"difficultyAutoProgressionHeading": "Difficulty Auto-Progression",
"difficultyAutoProgressionOn": "On",
"difficultyAutoProgressionOff": "Off"
```

- [ ] **Step 2: Write the failing tests**

Add these tests to `src/admin/__tests__/AdminPage.test.jsx` (inside the existing `describe('AdminPage')` block; also update `mockSettingsDefaults` at the top of the file to include the 7 new keys with their defaults):

Update the top of the file:

```jsx
const mockSettingsDefaults = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 10, childName: '', animationsEnabled: true,
  timerDisplayEnabled: true, maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2,
  retryCountsAsStreak: true, spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false,
}
```

Add tests:

```jsx
it('renders the timer display toggle and calls updateSetting when turned off', async () => {
  render(<MemoryRouter><AdminPage /></MemoryRouter>)
  expect(screen.getByText(/timer display/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /^off$/i }))
  expect(mockUpdateSetting).toHaveBeenCalledWith('timerDisplayEnabled', false)
})

it('renders the retry attempts radio group and calls updateSetting when changed', async () => {
  render(<MemoryRouter><AdminPage /></MemoryRouter>)
  expect(screen.getByText(/retry attempts/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('radio', { name: '3' }))
  expect(mockUpdateSetting).toHaveBeenCalledWith('maxTries', 3)
})

it('calls updateSetting with "unlimited" when that option is selected', async () => {
  render(<MemoryRouter><AdminPage /></MemoryRouter>)
  await userEvent.click(screen.getByRole('radio', { name: /unlimited/i }))
  expect(mockUpdateSetting).toHaveBeenCalledWith('maxTries', 'unlimited')
})

it('renders the hints toggle and only shows hintAfterWrongTaps when hints are on', async () => {
  render(<MemoryRouter><AdminPage /></MemoryRouter>)
  expect(screen.queryByText(/show hint after/i)).not.toBeInTheDocument()
})

it('renders hintAfterWrongTaps when hintsEnabled is true', async () => {
  mockSettingsDefaults.hintsEnabled = true
  render(<MemoryRouter><AdminPage /></MemoryRouter>)
  expect(screen.getByText(/show hint after/i)).toBeInTheDocument()
  mockSettingsDefaults.hintsEnabled = false
})

it('calls updateSetting when the hints toggle is turned on', async () => {
  render(<MemoryRouter><AdminPage /></MemoryRouter>)
  const hintsButtons = screen.getAllByRole('button', { name: /^on$/i })
  const hintsOnButton = hintsButtons.find(b => b.closest('.admin__section')?.textContent.includes('Hints'))
  await userEvent.click(hintsOnButton)
  expect(mockUpdateSetting).toHaveBeenCalledWith('hintsEnabled', true)
})

it('renders the retry-counts-as-streak toggle', () => {
  render(<MemoryRouter><AdminPage /></MemoryRouter>)
  expect(screen.getByText(/retry counts toward streak/i)).toBeInTheDocument()
})

it('renders the spaced repetition toggle and calls updateSetting when turned on', async () => {
  render(<MemoryRouter><AdminPage /></MemoryRouter>)
  const spacedRepSection = screen.getByText(/spaced repetition/i).closest('.admin__section')
  const { getByRole } = within(spacedRepSection)
  await userEvent.click(getByRole('button', { name: /^on$/i }))
  expect(mockUpdateSetting).toHaveBeenCalledWith('spacedRepetitionEnabled', true)
})

it('renders the difficulty auto-progression toggle and calls updateSetting when turned on', async () => {
  render(<MemoryRouter><AdminPage /></MemoryRouter>)
  const section = screen.getByText(/difficulty auto-progression/i).closest('.admin__section')
  const { getByRole } = within(section)
  await userEvent.click(getByRole('button', { name: /^on$/i }))
  expect(mockUpdateSetting).toHaveBeenCalledWith('difficultyAutoProgressionEnabled', true)
})
```

Add `within` to the existing `@testing-library/react` import at the top of the file:

```jsx
import { render, screen, within } from '@testing-library/react'
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/admin/__tests__/AdminPage.test.jsx
```

Expected: new tests FAIL — controls not yet rendered

- [ ] **Step 4: Add the 7 new sections to `AdminPage`**

In `src/admin/AdminPage.jsx`, insert the following JSX inside the `activeTab === 'settings'` block, immediately after the existing "Google Analytics" section (`</div>` that closes the `gaHeading` section) and before the `<button className="admin__reset">` line:

```jsx
<div className="admin__section">
  <h2>{t('admin.timerDisplayHeading')}</h2>
  <div className="admin__toggle">
    <button
      className={`admin__toggle-btn${settings.timerDisplayEnabled ? ' active' : ''}`}
      onClick={() => updateSetting('timerDisplayEnabled', true)}
    >
      {t('admin.timerDisplayOn')}
    </button>
    <button
      className={`admin__toggle-btn${!settings.timerDisplayEnabled ? ' active' : ''}`}
      onClick={() => updateSetting('timerDisplayEnabled', false)}
    >
      {t('admin.timerDisplayOff')}
    </button>
  </div>
</div>

<div className="admin__section">
  <h2>{t('admin.maxTriesHeading')}</h2>
  <p className="admin__hint">{t('admin.maxTriesHint')}</p>
  <div className="admin__radios">
    {['none', 1, 2, 3, 4, 5, 'unlimited'].map(value => (
      <label
        key={value}
        className={`admin__radio-label${settings.maxTries === value ? ' selected' : ''}`}
      >
        <input
          type="radio"
          name="maxTries"
          checked={settings.maxTries === value}
          onChange={() => updateSetting('maxTries', value)}
          aria-label={value === 'none' ? t('admin.maxTriesNone') : value === 'unlimited' ? t('admin.maxTriesUnlimited') : String(value)}
        />
        {value === 'none' ? t('admin.maxTriesNone') : value === 'unlimited' ? t('admin.maxTriesUnlimited') : value}
      </label>
    ))}
  </div>
</div>

<div className="admin__section">
  <h2>{t('admin.hintsHeading')}</h2>
  <div className="admin__toggle">
    <button
      className={`admin__toggle-btn${settings.hintsEnabled ? ' active' : ''}`}
      onClick={() => updateSetting('hintsEnabled', true)}
    >
      {t('admin.hintsOn')}
    </button>
    <button
      className={`admin__toggle-btn${!settings.hintsEnabled ? ' active' : ''}`}
      onClick={() => updateSetting('hintsEnabled', false)}
    >
      {t('admin.hintsOff')}
    </button>
  </div>
  {settings.hintsEnabled && (
    <div className="admin__radios">
      <h3>{t('admin.hintAfterWrongTapsHeading')}</h3>
      {[1, 2, 3, 4, 5].map(n => (
        <label
          key={n}
          className={`admin__radio-label${settings.hintAfterWrongTaps === n ? ' selected' : ''}`}
        >
          <input
            type="radio"
            name="hintAfterWrongTaps"
            checked={settings.hintAfterWrongTaps === n}
            onChange={() => updateSetting('hintAfterWrongTaps', n)}
            aria-label={String(n)}
          />
          {n}
        </label>
      ))}
    </div>
  )}
</div>

<div className="admin__section">
  <h2>{t('admin.retryStreakHeading')}</h2>
  <div className="admin__toggle">
    <button
      className={`admin__toggle-btn${settings.retryCountsAsStreak ? ' active' : ''}`}
      onClick={() => updateSetting('retryCountsAsStreak', true)}
    >
      {t('admin.retryStreakOn')}
    </button>
    <button
      className={`admin__toggle-btn${!settings.retryCountsAsStreak ? ' active' : ''}`}
      onClick={() => updateSetting('retryCountsAsStreak', false)}
    >
      {t('admin.retryStreakOff')}
    </button>
  </div>
</div>

<div className="admin__section">
  <h2>{t('admin.spacedRepetitionHeading')}</h2>
  <div className="admin__toggle">
    <button
      className={`admin__toggle-btn${settings.spacedRepetitionEnabled ? ' active' : ''}`}
      onClick={() => updateSetting('spacedRepetitionEnabled', true)}
    >
      {t('admin.spacedRepetitionOn')}
    </button>
    <button
      className={`admin__toggle-btn${!settings.spacedRepetitionEnabled ? ' active' : ''}`}
      onClick={() => updateSetting('spacedRepetitionEnabled', false)}
    >
      {t('admin.spacedRepetitionOff')}
    </button>
  </div>
</div>

<div className="admin__section">
  <h2>{t('admin.difficultyAutoProgressionHeading')}</h2>
  <div className="admin__toggle">
    <button
      className={`admin__toggle-btn${settings.difficultyAutoProgressionEnabled ? ' active' : ''}`}
      onClick={() => updateSetting('difficultyAutoProgressionEnabled', true)}
    >
      {t('admin.difficultyAutoProgressionOn')}
    </button>
    <button
      className={`admin__toggle-btn${!settings.difficultyAutoProgressionEnabled ? ' active' : ''}`}
      onClick={() => updateSetting('difficultyAutoProgressionEnabled', false)}
    >
      {t('admin.difficultyAutoProgressionOff')}
    </button>
  </div>
</div>
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/admin/__tests__/AdminPage.test.jsx
```

Expected: all tests PASS

- [ ] **Step 6: Run the full suite**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/admin/AdminPage.jsx src/admin/__tests__/AdminPage.test.jsx src/i18n/en.json
git commit -m "feat: add admin settings controls for timer, retries/hints, spaced repetition, difficulty auto-progression"
```

---

## Task 10: E2E coverage

**Files:**
- Modify: `e2e/animal-sounds.spec.js`
- Modify: `e2e/color-match.spec.js`
- Modify: `e2e/admin.spec.js`

- [ ] **Step 1: Add a retry/hint E2E case to `animal-sounds.spec.js`**

Append to `e2e/animal-sounds.spec.js`:

```js
test('animal sounds: a wrong tap with retries enabled does not lock the question', async ({ page }) => {
  await page.goto('/admin')
  await page.getByRole('radio', { name: '3' }).check() // numChoices=3, ensures 2 wrong options exist
  await page.getByRole('radio', { name: '2', exact: true }).nth(1).check().catch(() => {}) // maxTries=2 if disambiguation needed; see note below
  await page.goto('/game/animal-sounds')

  const choices = page.locator('[data-animal-id]')
  const correctId = await page.getByTestId('correct-animal-id').textContent()
  const wrongChoice = choices.filter({ hasNot: page.locator(`[data-animal-id="${correctId}"]`) }).first()
  await wrongChoice.click()

  await expect(wrongChoice).toBeDisabled()
  const correctChoice = page.locator(`[data-animal-id="${correctId}"]`)
  await expect(correctChoice).toBeEnabled()
})
```

Note: the admin page has two separate radio groups that both contain a `"2"` option (`Answer Choices` and `Retry Attempts`), so `getByRole('radio', { name: '2' })` is ambiguous. Use `page.getByRole('heading', { name: 'Retry Attempts' }).locator('..').getByRole('radio', { name: '2' })` instead, i.e. scope from the section heading. Replace the ambiguous line above with:

```js
await page.getByRole('heading', { name: 'Retry Attempts' })
  .locator('xpath=..')
  .getByRole('radio', { name: '2', exact: true })
  .check()
```

- [ ] **Step 2: Add the equivalent case to `color-match.spec.js`**

First read `e2e/color-match.spec.js` to confirm its existing structure mirrors `animal-sounds.spec.js` (full play-through + a11y scan, using `[data-color-id]` and `correct-color-id`). Append a test with the same structure as Step 1 but using `page.goto('/game/color-match')`, `[data-color-id]`, and `getByTestId('correct-color-id')`.

- [ ] **Step 3: Add settings-persistence coverage to `admin.spec.js`**

Append to `e2e/admin.spec.js`:

```js
test('new engine settings persist after reload', async ({ page }) => {
  await page.goto('/admin')

  await page.getByRole('button', { name: '⏱️ On' }).click() // already default true, but click Off then On to force a write
  await page.getByRole('button', { name: 'Off', exact: true }).first().click()

  await page.getByRole('heading', { name: 'Retry Attempts' })
    .locator('xpath=..')
    .getByRole('radio', { name: 'Unlimited' })
    .check()

  await page.reload()

  await expect(
    page.getByRole('heading', { name: 'Retry Attempts' })
      .locator('xpath=..')
      .getByRole('radio', { name: 'Unlimited' })
  ).toBeChecked()
})
```

- [ ] **Step 4: Run the E2E suite**

```bash
npm run e2e
```

Expected: all tests PASS. If any locator ambiguity surfaces (Playwright's error output names the exact conflicting elements), scope the locator further using `.locator('xpath=..')` from the relevant section heading, following the pattern already used above.

- [ ] **Step 5: Commit**

```bash
git add e2e/animal-sounds.spec.js e2e/color-match.spec.js e2e/admin.spec.js
git commit -m "test: add E2E coverage for retries and new engine settings persistence"
```

---

## Task 11: Documentation updates

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `docs/ENHANCEMENTS.md`
- Modify: `docs/TESTING.md`

- [ ] **Step 1: Update `README.md` settings reference**

In `README.md`, replace the Settings Reference table (`README.md:217-224`):

```markdown
| Setting | Default | Options |
|---|---|---|
| Child's Name | *(empty)* | Any text |
| Answer choices | 2 | 2, 3, 4 |
| Feedback mode | Immediate | Immediate, Parent tap |
| Questions per session | 10 | 5, 10, 15, 20 |
| Celebration animations | On | On, Off |
| Timer display | On | On, Off |
| Retry attempts | None | None, 1, 2, 3, 4, 5, Unlimited |
| Hints | Off | On, Off |
| Show hint after | 2 | 1, 2, 3, 4, 5 (only shown when Hints is On) |
| Retry counts toward streak | On | On, Off |
| Spaced repetition | Off | On, Off |
| Difficulty auto-progression | Off | On, Off |
| Google Analytics ID | *(empty)* | Any valid GA4 Measurement ID (e.g. `G-XXXXXXXXXX`) |
```

Then, after the existing "Celebration animations" paragraph (`README.md:234`), add:

```markdown
**Timer display** — shows a running stopwatch next to the question, counting up from 0 each time a new question appears. Purely informational; there is no time limit today.

**Retry attempts** — how many wrong taps are allowed on a question before it locks in as missed. "None" reproduces the original behavior (locks on the very first wrong tap). Each wrong choice becomes disabled (but stays visible) so the child can try a different one.

**Hints** — when on, the correct answer is highlighted once the child has reached "Show hint after" wrong taps on the current question, without locking it.

**Retry counts toward streak** — when on, getting a question right after 1+ wrong taps still counts toward the answer streak. When off, a correct-after-retry still scores as correct but resets the streak to 0.

**Spaced repetition** — when on, a missed item reappears a few questions later in the same session (replacing one of the not-yet-asked items, so the session length stays the same).

**Difficulty auto-progression** — when on, finishing a session with a perfect score offers to raise Answer Choices by 1 (up to the maximum of 4) on the results screen.
```

- [ ] **Step 2: Bump the version**

In `package.json`, change `"version": "0.5.0"` to `"version": "0.6.0"`.

- [ ] **Step 3: Add the `CHANGELOG.md` entry**

In `CHANGELOG.md`, insert a new section immediately after the `# Changelog` header block and before `## [0.5.0]`:

```markdown
## [0.6.0] - 2026-07-01

### Added
- **Timer display** — a running stopwatch shown next to each question, togglable in admin settings.
- **Retry attempts** — a configurable number of wrong taps (None / 1-5 / Unlimited) allowed before a question locks in as missed; wrong choices become disabled but stay visible so the child can try again.
- **Hints** — after a configurable number of wrong taps, the correct answer is highlighted without locking the question.
- **Retry counts toward streak** — configurable whether a correct-after-retry keeps the answer streak alive.
- **Spaced repetition queue** — missed items reappear a few questions later in the same session, replacing a not-yet-asked item so session length stays fixed.
- **Difficulty auto-progression** — after a perfect session (with the setting enabled), the results screen offers to raise the number of answer choices by 1.
- 7 new settings: `timerDisplayEnabled`, `maxTries`, `hintsEnabled`, `hintAfterWrongTaps`, `retryCountsAsStreak`, `spacedRepetitionEnabled`, `difficultyAutoProgressionEnabled`.
- `Timer`, `GameChoiceGrid` shared components.
- `attemptNumber` field on each timing entry.

### Changed
- `useGameSession`'s `answered` field is renamed to `locked`, and gains `disabledChoiceIds`/`hintActive`. Both games updated to match.
```

- [ ] **Step 4: Update `docs/ENHANCEMENTS.md`**

In `docs/ENHANCEMENTS.md`, insert a new entry immediately after `## Recently Completed` and before `### v0.5.0`:

```markdown
### v0.6.0 — Game Engine Core (2026-07-01)
- **Timer display** — running stopwatch shown next to each question, togglable in admin settings
- **Retry attempts (maxTries)** — configurable number of wrong taps allowed before a question locks in as missed
- **Hint system** — highlights the correct answer after a configurable number of wrong taps, without locking the question
- **Spaced repetition queue** — missed items reappear a few questions later in the same session
- **Difficulty auto-progression** — offers to raise the number of answer choices by 1 after a perfect session
```

Then, in the `## Core Game Engine` section, remove the four now-implemented bullets (`Timer display`, `Spaced repetition queue`, `Difficulty auto-progression`, `Hint system`) and add:

```markdown
- **Answer within N seconds** — enforce `timeLimitMs`/`onTimeout` (already wired as unused parameters in `useGameSession`, reserved during the v0.6.0 timer work) as a configurable per-question time limit, pairing with the existing timer display
```

- [ ] **Step 5: Update `docs/TESTING.md`**

In `docs/TESTING.md`, add a new bullet to the list under "Unit & component tests (Vitest + React Testing Library)" (after the "Mocking `canvas-confetti`" bullet):

```markdown
- **Choice-rendering games:** new games should render their answer choices via `src/components/GameChoiceGrid.jsx` rather than duplicating the correct/wrong/hint/disabled class logic — see `AnimalSoundsGame`/`ColorMatchGame` for the render-prop pattern (`getChoiceProps`, `renderChoiceContent`).
```

- [ ] **Step 6: Run the full test suite one more time**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add README.md CHANGELOG.md package.json docs/ENHANCEMENTS.md docs/TESTING.md
git commit -m "docs: document v0.6.0 game engine core features and add answer-within-N-seconds to backlog"
```

---

## Task 12: Final full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run unit/component tests with coverage**

```bash
npm run coverage
```

Expected: all tests PASS; review the coverage report for `useGameSession.js`, `reinsertMissed.js`, `GameChoiceGrid.jsx`, `Timer.jsx`, and `GameResults.jsx` to confirm the new branches (retry paths, hint timing, spaced-repetition reinsertion, difficulty-offer edge cases) are exercised.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors

- [ ] **Step 3: Run the full E2E + visual regression suite**

```bash
npm run e2e
```

Expected: all tests PASS. New Storybook stories (`Timer`, `GameChoiceGrid` variants, `GameResults` variants) need baseline screenshots on first run — generate them with:

```bash
npx playwright test visual.spec.js --update-snapshots
```

Review the generated PNGs, then commit them.

- [ ] **Step 4: Run a production build**

```bash
npm run build
```

Expected: build succeeds with no errors

- [ ] **Step 5: Commit the new visual regression baselines**

```bash
git add e2e/visual.spec.js-snapshots/
git commit -m "test: add visual regression baselines for Timer, GameChoiceGrid, GameResults stories"
```
