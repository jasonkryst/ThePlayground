# Number Tap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new auto-discovered game, Number Tap (issue #73) — a target number (1–5) is shown, the child taps that many objects on screen to build early counting skills — plus a small, behavior-preserving `useGameSession` extraction that lets this and future non-discrete-choice game mechanics drive the same scoring/streak/timer/hint/retry/badge/personal-best/resume engine every other game already gets for free.

**Architecture:** `useGameSession`'s `handleChoice(item)` currently conflates "figure out if this click was correct" with "run the whole per-attempt state machine." Task 1 splits those into a new `handleAttempt(isCorrect)` (the state machine, unchanged in behavior) called by `handleChoice` (the choice-specific part). Number Tap (Tasks 2–3) is a new `src/games/number-tap/` folder — auto-discovered exactly like every other game (`CLAUDE.md`) — that calls `useGameSession` directly and calls `handleAttempt` itself once the child confirms their count, since its "tap several objects toward a running count, then confirm" interaction doesn't fit `QuizGameShell`'s discrete choice-grid. It composes `GameIntro`/`GameResults`/`ResumePrompt`/`Timer` directly instead, following the precedent `src/games/animal-memory-match/index.jsx` already set for games that don't use `QuizGameShell`. It reuses `GameChoiceGrid.css`'s `.game__choice`/`highlight-correct` card styling (for the tappable objects) and `QuizGameShell.css`'s `.game__question`/`.game__prompt`/`.game__progress`/`.game__next`/`.game__timeout` chrome (both are plain, non-component-coupled stylesheets already shared across every quiz game) so Number Tap looks consistent with its siblings without duplicating that CSS.

**Tech Stack:** React 18, react-i18next, Vitest + React Testing Library + jest-axe, Storybook.

## Global Constraints

- New game folder: `src/games/number-tap/` (id `number-tap`).
- Full en/es/pl i18n parity is required for every string (this repo's existing convention).
- No `badges.js` (only the two memory-type games override the badge catalog), no `icon.<ext>` file (only the licensed-character games have one), no `orientation` manifest field (only memory games lock orientation).
- `useGameSession`'s existing behavior must not change for any current consumer — Task 1 is a pure extraction, verified by the full existing `useGameSession.test.js` suite continuing to pass unmodified.
- Number Tap must **not** pass `offerDifficultyBump`/`numChoices`/`onAcceptDifficultyBump`/`onDismissDifficultyBump` to `GameResults` (they default to `false`/`undefined`, matching how `animal-memory-match/index.jsx` already omits them) — `numChoices` is a global setting shared by every discrete-choice game, and accepting a "bump difficulty" offer here would silently change that setting for other games even though Number Tap has no concept of "choices."
- Spec: `docs/superpowers/specs/2026-08-04-number-tap-design.md`.

---

### Task 1: Engine change — extract `handleAttempt` from `useGameSession`

**Files:**
- Modify: `src/hooks/useGameSession.js:375-438` (the `handleChoice` function)
- Modify: `src/hooks/useGameSession.js:546-556` (the returned object)
- Modify: `src/hooks/__tests__/useGameSession.test.js` (append a new `describe` block)

**Interfaces:**
- Produces: `handleAttempt(isCorrect: boolean): void`, a new function returned by `useGameSession`, alongside the existing `handleChoice`. Task 3 calls `session.handleAttempt(isCorrect)` directly (no discrete item involved).
- Consumes: nothing new — this task only rearranges code already inside the hook.

- [ ] **Step 1: Add failing tests for the new `handleAttempt` entry point**

Open `src/hooks/__tests__/useGameSession.test.js` and add this new `describe` block right after the existing `describe('useGameSession — existing behavior', ...)` block closes (after line 260, immediately before `describe('useGameSession — retries and maxTries', ...)`):

```js
describe('useGameSession — handleAttempt (generalized attempt reporting)', () => {
  it('handleAttempt(true) scores, streaks, fires confetti, and locks, same as handleChoice with the correct item', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    await act(async () => { result.current.handleAttempt(true) })

    expect(result.current.score).toBe(1)
    expect(result.current.streak).toBe(1)
    expect(result.current.locked).toBe(true)
    expect(mockFireConfetti).toHaveBeenCalledTimes(1)
    expect(mockRecordStreak).toHaveBeenCalledWith(1)
  })

  it('handleAttempt(false) with default maxTries locks immediately and records the correct item as missed', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())
    const correctItem = result.current.current.correct

    await act(async () => { result.current.handleAttempt(false) })

    expect(result.current.locked).toBe(true)
    expect(result.current.streak).toBe(0)
    expect(result.current.missed).toEqual([correctItem])
  })

  it('handleAttempt(false) with maxTries=2 does not lock on the first wrong attempt, allowing a retry', async () => {
    setSettings({ maxTries: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    await act(async () => { result.current.handleAttempt(false) })
    expect(result.current.locked).toBe(false)

    await act(async () => { result.current.handleAttempt(true) })
    expect(result.current.score).toBe(1)
    expect(result.current.locked).toBe(true)
  })

  it('records a timings entry keyed to the current question on every attempt', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())
    const correctId = result.current.current.correct.id

    await act(async () => { result.current.handleAttempt(true) })

    expect(result.current.timings).toHaveLength(1)
    expect(result.current.timings[0]).toMatchObject({ questionIndex: 0, itemId: correctId, correct: true, attemptNumber: 1 })
  })

  // Negative/regression: handleChoice must still behave identically after the extraction
  it('handleChoice still scores and locks exactly as before', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())
    const correctItem = result.current.current.correct

    await act(async () => { result.current.handleChoice(correctItem) })

    expect(result.current.score).toBe(1)
    expect(result.current.streak).toBe(1)
    expect(result.current.locked).toBe(true)
  })
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: FAIL on the four new `handleAttempt` tests with `result.current.handleAttempt is not a function`; the pre-existing tests (including the new regression test at the bottom, which exercises only already-existing `handleChoice` behavior) still PASS.

- [ ] **Step 3: Extract `handleAttempt` out of `handleChoice`**

In `src/hooks/useGameSession.js`, replace the entire `handleChoice` function (lines 375–438) with:

```js
  // Shared per-attempt state machine: timings, score/streak, wrong-attempt
  // counting, lock-as-missed, and scheduling advance() for 'immediate'
  // feedback mode. Any interaction type reports its outcome here once it
  // knows whether the attempt was correct -- handleChoice (discrete
  // choice-click) is one caller; the hook makes no assumption about *how*
  // correctness was determined, so non-discrete interactions (e.g. Number
  // Tap's tap-until-the-count-matches-then-confirm) can call this directly.
  function handleAttempt(isCorrect) {
    const durationMs = Date.now() - questionStartRef.current
    const attemptNumber = wrongAttemptsRef.current + 1

    const entry = { questionIndex: index, itemId: current.correct.id, correct: isCorrect, durationMs, attemptNumber }
    const nextTimings = [...timingsRef.current, entry]
    timingsRef.current = nextTimings
    setTimings(nextTimings)
    emit(isCorrect ? 'correct' : 'wrong')

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

      const resolvedMax = resolveMaxTries(maxTries)
      if (nextWrongAttempts >= resolvedMax) {
        lockAsMissed(current.correct)
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

  function handleChoice(item) {
    if (blockedRef.current) return
    if (lockedRef.current) return
    if (disabledChoiceIdsRef.current.includes(item.id)) return
    setSelected(item.id)

    const isCorrect = item.id === current.correct.id
    if (!isCorrect) {
      const nextDisabled = [...disabledChoiceIdsRef.current, item.id]
      disabledChoiceIdsRef.current = nextDisabled
      setDisabledChoiceIds(nextDisabled)
    }
    handleAttempt(isCorrect)
  }
```

This is a pure rearrangement: every statement that was in `handleChoice` still runs, in the same relative order for each branch (only the `disabledChoiceIds` bookkeeping — which has no discrete-choice equivalent for a future non-choice caller — moved a few lines earlier in the wrong-branch; it still runs before `handleAttempt`'s own state updates commit, so no observable behavior changes).

- [ ] **Step 4: Add `handleAttempt` to the hook's return statement**

In `src/hooks/useGameSession.js`, find the `return { ... }` statement (around line 546) and change this line:

```js
    handleChoice, advance, restart, acceptDifficultyBump, dismissDifficultyBump, dismissIntro,
```

to:

```js
    handleChoice, handleAttempt, advance, restart, acceptDifficultyBump, dismissDifficultyBump, dismissIntro,
```

- [ ] **Step 5: Run the full hook test suite to verify everything passes**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js src/hooks/__tests__/useGameSession.pause.test.jsx`
Expected: PASS, all tests green — the 4 new `handleAttempt` tests, the new regression test, and every pre-existing test in both files.

- [ ] **Step 6: Run the full test suite to confirm no other consumer broke**

Run: `npx vitest run`
Expected: PASS. Every existing game's tests (they all go through `handleChoice`, which is now a thin wrapper) must be unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useGameSession.js src/hooks/__tests__/useGameSession.test.js
git commit -m "feat(73): extract handleAttempt from useGameSession's handleChoice"
```

---

### Task 2: Number Tap manifest, data, pool-builder utility, and i18n

**Files:**
- Create: `src/games/number-tap/manifest.json`
- Create: `src/games/number-tap/data/numbers.js`
- Create: `src/games/number-tap/data/objects.js`
- Create: `src/games/number-tap/utils/buildQuestionPool.js`
- Create: `src/games/number-tap/i18n/en.json`
- Create: `src/games/number-tap/i18n/es.json`
- Create: `src/games/number-tap/i18n/pl.json`
- Test: `src/games/number-tap/__tests__/numbers.test.js`
- Test: `src/games/number-tap/__tests__/buildQuestionPool.test.js`

**Interfaces:**
- Produces: `numbers` default export from `data/numbers.js` — array of exactly 5 objects `{ id: 'number-<value>', value: 1..5 }`. Task 3 imports this as `import numbers from './data/numbers'` and passes it to `useGameSession({ gameId: 'number-tap', items: numbers })`.
- Produces: `objectTypes` default export from `data/objects.js` — array of 5 objects `{ id: string, emoji: string, nameKey: string }`.
- Produces: `buildQuestionPool(target: number, objectTypes: Array, random?: () => number): { objectType: object, objects: Array<{ id: string, emoji: string, nameKey: string }> }` default export from `utils/buildQuestionPool.js`. `objects.length` is always `target + (1..3)`, every entry shares `objectType`'s `emoji`/`nameKey`, and each entry's `id` is `${objectType.id}-${i}` (unique within the pool). Task 3 calls this with `(current.correct.value, objectTypes)` (no `random` override — production always uses the default `Math.random`).
- Produces: i18n namespace `numberTap` (keys: `manifestName`, `manifestDescription`, `howToPlay`, `prompt`, `objectLabel`, `done`, `objects.apple`/`.star`/`.balloon`/`.ball`/`.flower`). Task 3 calls `t('numberTap.prompt', { count })`, `t('numberTap.howToPlay')`, `t('numberTap.objectLabel', { name, index })`, `t('numberTap.done')`, and `t(objectType.nameKey)`.
- Consumes: nothing (no dependency on Task 1).

- [ ] **Step 1: Create the manifest**

`src/games/number-tap/manifest.json`:

```json
{
  "id": "number-tap",
  "nameKey": "numberTap.manifestName",
  "descriptionKey": "numberTap.manifestDescription",
  "icon": "🔢",
  "color": "#90CAF9",
  "version": "1.0.0",
  "tags": ["math", "counting"]
}
```

- [ ] **Step 2: Create the numbers data file**

`src/games/number-tap/data/numbers.js`:

```js
const numbers = [
  { id: 'number-1', value: 1 },
  { id: 'number-2', value: 2 },
  { id: 'number-3', value: 3 },
  { id: 'number-4', value: 4 },
  { id: 'number-5', value: 5 },
]

export default numbers
```

- [ ] **Step 3: Create the object-icon data file**

`src/games/number-tap/data/objects.js`:

```js
const objectTypes = [
  { id: 'apple',   emoji: '🍎', nameKey: 'numberTap.objects.apple' },
  { id: 'star',    emoji: '⭐', nameKey: 'numberTap.objects.star' },
  { id: 'balloon', emoji: '🎈', nameKey: 'numberTap.objects.balloon' },
  { id: 'ball',    emoji: '⚽', nameKey: 'numberTap.objects.ball' },
  { id: 'flower',  emoji: '🌸', nameKey: 'numberTap.objects.flower' },
]

export default objectTypes
```

- [ ] **Step 4: Write the data tests**

`src/games/number-tap/__tests__/numbers.test.js`:

```js
import { describe, it, expect } from 'vitest'
import numbers from '../data/numbers'

describe('numbers data', () => {
  it('exports an array of exactly 5 numbers', () => {
    expect(Array.isArray(numbers)).toBe(true)
    expect(numbers.length).toBe(5)
  })

  it('values run 1 through 5 in order', () => {
    expect(numbers.map(n => n.value)).toEqual([1, 2, 3, 4, 5])
  })

  it('ids follow the number-<value> convention', () => {
    for (const n of numbers) {
      expect(n.id).toBe(`number-${n.value}`)
    }
  })

  // Negative: no collisions
  it('all ids are unique', () => {
    const ids = numbers.map(n => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

- [ ] **Step 5: Run the numbers data test to verify it passes**

Run: `npx vitest run src/games/number-tap/__tests__/numbers.test.js`
Expected: PASS, 4/4 (pure data, nothing to get wrong first).

- [ ] **Step 6: Write the failing pool-builder test**

`src/games/number-tap/__tests__/buildQuestionPool.test.js`:

```js
import { describe, it, expect } from 'vitest'
import buildQuestionPool from '../utils/buildQuestionPool'
import objectTypes from '../data/objects'

describe('buildQuestionPool', () => {
  it('adds between 1 and 3 extra objects beyond the target', () => {
    for (const random of [() => 0, () => 0.5, () => 0.999]) {
      const { objects } = buildQuestionPool(3, objectTypes, random)
      expect(objects.length).toBeGreaterThanOrEqual(4)
      expect(objects.length).toBeLessThanOrEqual(6)
    }
  })

  it('every pool entry shares the same emoji/nameKey as the returned objectType', () => {
    const { objectType, objects } = buildQuestionPool(3, objectTypes, () => 0.5)
    for (const obj of objects) {
      expect(obj.emoji).toBe(objectType.emoji)
      expect(obj.nameKey).toBe(objectType.nameKey)
    }
  })

  it('every pool entry has a unique id', () => {
    const { objects } = buildQuestionPool(4, objectTypes, () => 0.3)
    const ids = objects.map(o => o.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Negative: the pool must always exceed the target, or a wrong count (over
  // or under) would be impossible and every question would be trivially
  // correct (see the design spec's "rejected alternative" note).
  it('pool size is always strictly greater than the target, for every target 1-5', () => {
    for (const target of [1, 2, 3, 4, 5]) {
      const { objects } = buildQuestionPool(target, objectTypes, () => 0)
      expect(objects.length).toBeGreaterThan(target)
    }
  })

  it('defaults to Math.random when no random function is supplied', () => {
    const { objects } = buildQuestionPool(2, objectTypes)
    expect(objects.length).toBeGreaterThan(2)
  })
})
```

- [ ] **Step 7: Run the pool-builder test to verify it fails**

Run: `npx vitest run src/games/number-tap/__tests__/buildQuestionPool.test.js`
Expected: FAIL — `Cannot find module '../utils/buildQuestionPool'`.

- [ ] **Step 8: Implement the pool builder**

`src/games/number-tap/utils/buildQuestionPool.js`:

```js
const MIN_EXTRA = 1
const MAX_EXTRA = 3

// A question's pool must always contain more objects than the target count
// -- otherwise tapping "all of them" always lands exactly on the target and
// a wrong count (too few or too many) would never be reachable.
export default function buildQuestionPool(target, objectTypes, random = Math.random) {
  const objectType = objectTypes[Math.floor(random() * objectTypes.length)]
  const extra = MIN_EXTRA + Math.floor(random() * (MAX_EXTRA - MIN_EXTRA + 1))
  const poolSize = target + extra

  const objects = Array.from({ length: poolSize }, (_, i) => ({
    id: `${objectType.id}-${i}`,
    emoji: objectType.emoji,
    nameKey: objectType.nameKey,
  }))

  return { objectType, objects }
}
```

- [ ] **Step 9: Run the pool-builder test to verify it passes**

Run: `npx vitest run src/games/number-tap/__tests__/buildQuestionPool.test.js`
Expected: PASS, 5/5.

- [ ] **Step 10: Create the English i18n file**

`src/games/number-tap/i18n/en.json`:

```json
{
  "numberTap": {
    "manifestName": "Number Tap",
    "manifestDescription": "See a number, tap that many things!",
    "howToPlay": "A number appears — tap that many things on the screen, then press the checkmark!",
    "prompt": "Tap {{count}}!",
    "objectLabel": "{{name}} {{index}}",
    "done": "Done",
    "objects": {
      "apple": "apple",
      "star": "star",
      "balloon": "balloon",
      "ball": "ball",
      "flower": "flower"
    }
  }
}
```

- [ ] **Step 11: Create the Spanish i18n file**

`src/games/number-tap/i18n/es.json`:

```json
{
  "numberTap": {
    "manifestName": "Toca el Número",
    "manifestDescription": "¡Ve un número y toca esa cantidad de cosas!",
    "howToPlay": "Aparece un número — ¡toca esa cantidad de cosas en la pantalla y luego presiona la marca de verificación!",
    "prompt": "¡Toca {{count}}!",
    "objectLabel": "{{name}} {{index}}",
    "done": "Listo",
    "objects": {
      "apple": "manzana",
      "star": "estrella",
      "balloon": "globo",
      "ball": "pelota",
      "flower": "flor"
    }
  }
}
```

- [ ] **Step 12: Create the Polish i18n file**

`src/games/number-tap/i18n/pl.json`:

```json
{
  "numberTap": {
    "manifestName": "Dotknij Liczbę",
    "manifestDescription": "Zobacz liczbę i dotknij tyle rzeczy!",
    "howToPlay": "Pojawia się liczba — dotknij tyle rzeczy na ekranie, a potem naciśnij znak zaznaczenia!",
    "prompt": "Dotknij {{count}}!",
    "objectLabel": "{{name}} {{index}}",
    "done": "Gotowe",
    "objects": {
      "apple": "jabłko",
      "star": "gwiazda",
      "balloon": "balon",
      "ball": "piłka",
      "flower": "kwiat"
    }
  }
}
```

- [ ] **Step 13: Commit**

```bash
git add src/games/number-tap/manifest.json src/games/number-tap/data/ src/games/number-tap/utils/ src/games/number-tap/i18n/ src/games/number-tap/__tests__/numbers.test.js src/games/number-tap/__tests__/buildQuestionPool.test.js
git commit -m "feat(73): add Number Tap manifest, data, pool-builder utility, and i18n"
```

---

### Task 3: Game component and its test suite

**Files:**
- Create: `src/games/number-tap/index.jsx`
- Create: `src/games/number-tap/NumberTapGame.css`
- Test: `src/games/number-tap/__tests__/NumberTapGame.test.jsx`

**Interfaces:**
- Consumes: `numbers` from `../data/numbers` (Task 2), `objectTypes` from `../data/objects` (Task 2), `buildQuestionPool` from `../utils/buildQuestionPool` (Task 2), `manifest` from `../manifest.json` (Task 2), i18n namespace `numberTap.*` (Task 2). Also `handleAttempt` from `useGameSession` (Task 1). Also consumes existing shared modules unchanged: `useGameSession` (`src/hooks/useGameSession.js`), `useSoundPlayer` (`src/hooks/useSoundPlayer.js`, returns `{ play, stop, blocked }`), `getSoundUrl` (`src/lib/soundLibrary.js`), `useShellGameStatus` (`src/components/ShellContext.jsx`), `GameIntro` (props: `icon, name, instructions, orientation, dontShowAgain, onDontShowAgainChange, onStart`), `GameResults` (props used here: `score, total, missed, onPlayAgain, onHome, renderMissedItem, personalBestResult, newBadges, accentColor, gameType` — **not** `offerDifficultyBump`/`numChoices`/the accept/dismiss handlers, per the Global Constraints above), `ResumePrompt` (props: `index, total, score, onResume, onStartFresh`), `Timer` (props: `elapsedMs, mode, limitMs`).
- Produces: default export `NumberTapGame({ onGameEnd })`, a React component. `data-testid="correct-number-id"` hidden span with `data-value={current.correct.value}` and text content `current.correct.id` — later tests rely on reading `dataset.value` to know the target count for the current question. Each tappable object button carries `data-object-id={obj.id}`. The Done button carries `data-testid="number-tap-done"`.

- [ ] **Step 1: Write the failing test file**

`src/games/number-tap/__tests__/NumberTapGame.test.jsx`:

```jsx
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import NumberTapGame from '../index'
import { ShellContext } from '../../../components/ShellContext'

vi.mock('../../../lib/confetti', () => ({ fireConfetti: vi.fn() }))

let mockSettings = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, adaptiveItemSelectionEnabled: false,
  timerMode: 'countUp', timeLimitSeconds: 10, animationsEnabled: true, soundEffectsEnabled: false,
  introDismissed: { 'number-tap': true },
}
const mockUpdateSetting = vi.fn()
let mockLoaded = true

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings, loaded: mockLoaded, updateSetting: mockUpdateSetting }),
}))
vi.mock('../../../hooks/useScores', () => ({
  default: () => ({ addScore: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('../../../hooks/useBestStreak', () => ({
  default: () => ({ bestStreak: 0, recordStreak: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('../../../hooks/usePersonalBest', () => ({
  default: () => ({
    personalBest: null,
    recordSession: vi.fn().mockResolvedValue({
      accuracy: { isNewRecord: false, value: 0, previous: null },
      speed: { isNewRecord: false, value: null, previous: null },
    }),
  }),
}))
vi.mock('../../../hooks/useBadges', () => ({
  default: () => ({ badgeData: { awards: {}, lifetimeQuestions: {} }, awardSession: vi.fn().mockResolvedValue([]) }),
}))
vi.mock('../../../hooks/useItemStats', () => ({
  default: () => ({ itemStats: {}, recordMisses: vi.fn().mockResolvedValue(undefined) }),
}))

const { mockGetSessionResume } = vi.hoisted(() => ({
  mockGetSessionResume: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../../storage/index', () => ({
  default: {
    getSessionResume: mockGetSessionResume,
    saveSessionResume: vi.fn(),
    clearSessionResume: vi.fn(),
  },
}))

const onGameEnd = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockLoaded = true
  mockGetSessionResume.mockResolvedValue(null)
  mockSettings = {
    numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, adaptiveItemSelectionEnabled: false,
    timerMode: 'countUp', timeLimitSeconds: 10, animationsEnabled: true, soundEffectsEnabled: false,
    introDismissed: { 'number-tap': true },
  }
})

const objectButtons = () => screen.getAllByRole('button').filter(b => b.dataset.objectId)
const doneButton = () => screen.getByTestId('number-tap-done')
const targetCount = () => Number(screen.getByTestId('correct-number-id').dataset.value)

async function tapExactly(n) {
  const buttons = objectButtons().slice(0, n)
  for (const btn of buttons) {
    await act(async () => { await userEvent.click(btn) })
  }
}

describe('NumberTapGame', () => {
  it('renders the number prompt and a pool of tappable objects larger than the target', async () => {
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    expect(screen.getByText(/tap \d!/i)).toBeInTheDocument()
    expect(objectButtons().length).toBeGreaterThan(targetCount())
  })

  it('labels each object with an accessible name for screen readers', async () => {
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    for (const btn of objectButtons()) {
      expect(btn.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it('tapping an object toggles aria-pressed, tapping again untoggles it', async () => {
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    const [first] = objectButtons()
    expect(first.getAttribute('aria-pressed')).toBe('false')
    await act(async () => { await userEvent.click(first) })
    expect(first.getAttribute('aria-pressed')).toBe('true')
    await act(async () => { await userEvent.click(first) })
    expect(first.getAttribute('aria-pressed')).toBe('false')
  })

  // Positive: exact count + Done scores correctly
  it('tapping exactly the target count and pressing Done scores a point', async () => {
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    const target = targetCount()
    await tapExactly(target)
    await act(async () => { await userEvent.click(doneButton()) })
    expect(screen.getByText(new RegExp(`1 / ${mockSettings.questionsPerSession}`))).toBeInTheDocument()
  })

  // Positive: full session with correct answers reaches results
  it('shows results after all questions answered correctly', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const target = targetCount()
      const buttons = objectButtons().slice(0, target)
      for (const btn of buttons) act(() => { fireEvent.click(btn) })
      act(() => { fireEvent.click(doneButton()) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
    expect(screen.getByText(/3 \/ 3/)).toBeInTheDocument()
  })

  // Positive: retry path
  it('a wrong count with retries remaining clears the selection and allows a correct retry', async () => {
    mockSettings = { ...mockSettings, maxTries: 2 }
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    const target = targetCount()

    // Tap one too many, then confirm -- wrong, but a retry remains.
    await tapExactly(target + 1)
    await act(async () => { await userEvent.click(doneButton()) })

    // Selection must have cleared for the retry.
    for (const btn of objectButtons()) {
      expect(btn.getAttribute('aria-pressed')).toBe('false')
    }

    await tapExactly(target)
    await act(async () => { await userEvent.click(doneButton()) })
    expect(screen.getByText(/1 \//)).toBeInTheDocument()
  })

  // Negative: wrong count on the final try locks the question as missed
  it('a wrong count on the final allowed try locks the question and shows it as missed', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const target = targetCount()
      const buttons = objectButtons().slice(0, target + 1) // always one too many
      for (const btn of buttons) act(() => { fireEvent.click(btn) })
      act(() => { fireEvent.click(doneButton()) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(screen.getByText(/let's practice/i)).toBeInTheDocument()
  })

  // Negative: timeout locks the question without any taps
  it('a countdown timeout locks the question as missed without any taps', async () => {
    mockSettings = { ...mockSettings, timerMode: 'countdown', timeLimitSeconds: 5, feedbackMode: 'immediate' }
    vi.useFakeTimers()
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    act(() => { vi.advanceTimersByTime(5000) })
    await act(async () => {})
    expect(screen.getByText(/time/i)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('does not tap or confirm while locked', async () => {
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    const target = targetCount()
    await tapExactly(target)
    await act(async () => { await userEvent.click(doneButton()) })
    // Question is now locked (correct, immediate feedback schedules advance) --
    // further taps on the (about-to-change) board must not throw or double-score.
    const [first] = objectButtons()
    await act(async () => { await userEvent.click(first) })
    expect(screen.getByText(/1 \//)).toBeInTheDocument()
  })

  it('hides the timer when timerMode is "off"', async () => {
    mockSettings = { ...mockSettings, timerMode: 'off' }
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByLabelText(/elapsed time/i)).not.toBeInTheDocument()
  })

  it('Home button on the results screen calls onGameEnd', async () => {
    mockSettings = { ...mockSettings, questionsPerSession: 1 }
    vi.useFakeTimers()
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    const target = targetCount()
    const buttons = objectButtons().slice(0, target)
    for (const btn of buttons) act(() => { fireEvent.click(btn) })
    act(() => { fireEvent.click(doneButton()) })
    act(() => { vi.advanceTimersByTime(1600) })
    await act(async () => {})
    vi.useRealTimers()
    await act(async () => { await userEvent.click(screen.getByRole('button', { name: /home/i })) })
    expect(onGameEnd).toHaveBeenCalled()
  })

  it('reports the streak to the shell after 2 correct answers', async () => {
    vi.useFakeTimers()
    const setGameStatus = vi.fn()
    await act(async () => {
      render(
        <ShellContext.Provider value={{ setGameStatus }}>
          <NumberTapGame onGameEnd={onGameEnd} />
        </ShellContext.Provider>
      )
    })
    for (let i = 0; i < 2; i++) {
      const target = targetCount()
      const buttons = objectButtons().slice(0, target)
      for (const btn of buttons) act(() => { fireEvent.click(btn) })
      act(() => { fireEvent.click(doneButton()) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(setGameStatus).toHaveBeenLastCalledWith({ streak: 2, sessionActive: true })
  })

  it('has no accessibility violations', async () => {
    let container
    await act(async () => { container = render(<NumberTapGame onGameEnd={onGameEnd} />).container })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('does not offer a difficulty bump on the results screen', async () => {
    mockSettings = { ...mockSettings, questionsPerSession: 1, difficultyAutoProgressionEnabled: true }
    vi.useFakeTimers()
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    const target = targetCount()
    const buttons = objectButtons().slice(0, target)
    for (const btn of buttons) act(() => { fireEvent.click(btn) })
    act(() => { fireEvent.click(doneButton()) })
    act(() => { vi.advanceTimersByTime(1600) })
    await act(async () => {})
    vi.useRealTimers()
    expect(screen.queryByText(/harder/i)).not.toBeInTheDocument()
    expect(mockUpdateSetting).not.toHaveBeenCalledWith('numChoices', expect.anything())
  })
})

describe('NumberTapGame — how-to-play intro', () => {
  it('shows the intro before the first question when not dismissed', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    expect(screen.getByTestId('game-intro-start')).toBeInTheDocument()
    expect(screen.queryByText(/tap \d!/i)).not.toBeInTheDocument()
  })

  it('starts the session after "Let\'s Play!" is clicked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(screen.getByText(/tap \d!/i)).toBeInTheDocument()
  })
})

describe('NumberTapGame — session resume', () => {
  it('shows the resume prompt when a valid snapshot exists', async () => {
    const numbers = (await import('../data/numbers')).default
    const savedQueue = [
      { correct: numbers[0], choices: [numbers[0]] },
      { correct: numbers[1], choices: [numbers[1]] },
    ]
    mockGetSessionResume.mockResolvedValueOnce({
      gameId: 'number-tap', queue: savedQueue, index: 0, score: 0, streak: 0,
      missed: [], timings: [], peakStreak: 0, savedAt: Date.now(),
    })
    await act(async () => { render(<NumberTapGame onGameEnd={onGameEnd} />) })
    await act(async () => {})
    expect(screen.getByTestId('resume-prompt-resume')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `npx vitest run src/games/number-tap/__tests__/NumberTapGame.test.jsx`
Expected: FAIL — `Cannot find module '../index'`, since `index.jsx` doesn't exist yet.

- [ ] **Step 3: Write the CSS**

`src/games/number-tap/NumberTapGame.css`:

```css
/* Reuses .game__choice/.game__choices/highlight-correct from
   GameChoiceGrid.css and .game__question/.game__prompt/.game__progress/
   .game__next/.game__timeout from QuizGameShell.css (both plain shared
   stylesheets, imported directly below since this game doesn't render
   QuizGameShell or GameChoiceGrid) -- only what's genuinely new to this
   game's interaction lives here. */

.number-tap__object--tapped:not(.correct):not(.wrong) {
  box-shadow: inset 0 0 0 4px var(--color-aqua-dark);
}

.number-tap__done {
  margin-top: 20px;
  padding: 16px 48px;
  background: var(--color-teal-dark);
  color: var(--color-on-accent);
  font-size: 1.25rem;
  font-weight: 700;
  border-radius: var(--radius-button);
  border: none;
  min-height: 64px;
  cursor: pointer;
}

.number-tap__done[aria-disabled="true"] { cursor: default; opacity: 0.6; }
.number-tap__done:focus         { outline: none; }
.number-tap__done:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

- [ ] **Step 4: Write the component**

`src/games/number-tap/index.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import useSoundPlayer from '../../hooks/useSoundPlayer'
import { useShellGameStatus } from '../../components/ShellContext'
import GameIntro from '../../components/GameIntro'
import GameResults from '../../components/GameResults'
import ResumePrompt from '../../components/ResumePrompt'
import Timer from '../../components/Timer'
import { getSoundUrl } from '../../lib/soundLibrary'
import buildQuestionPool from './utils/buildQuestionPool'
import numbers from './data/numbers'
import objectTypes from './data/objects'
import manifest from './manifest.json'
import '../../components/QuizGameShell.css'
import '../../components/GameChoiceGrid.css'
import './NumberTapGame.css'

export default function NumberTapGame({ onGameEnd }) {
  const { t } = useTranslation()
  const session = useGameSession({ gameId: 'number-tap', items: numbers })
  const {
    current, index, total, locked, hintActive, hintStrength,
    score, streak, missed, done, feedbackMode, handleAttempt, advance, restart,
    currentElapsedMs, timerMode, timeLimitMs, timedOut,
    personalBestResult, newBadges, lastEvent, soundEffectsEnabled,
    showIntro, introResolved, settingsLoaded, dontShowAgain, setDontShowAgain, dismissIntro,
    resumeAvailable, acceptResume, declineResume,
  } = session

  useShellGameStatus({ streak, sessionActive: introResolved && !showIntro && !done && !resumeAvailable })

  const { play } = useSoundPlayer()
  useEffect(() => {
    if (!lastEvent || !soundEffectsEnabled) return
    play(getSoundUrl(lastEvent.type === 'correct' ? 'chime-correct.wav' : 'chime-wrong.wav'))
  }, [lastEvent, soundEffectsEnabled, play])

  const [tappedIds, setTappedIds] = useState([])
  const [lastOutcomeCorrect, setLastOutcomeCorrect] = useState(null)

  // Fresh board every question.
  useEffect(() => { setTappedIds([]); setLastOutcomeCorrect(null) }, [index])
  // A countdown timeout resolves the question without ever pressing Done.
  useEffect(() => { if (timedOut) setLastOutcomeCorrect(false) }, [timedOut])

  const { objects } = useMemo(() => {
    if (!current) return { objects: [] }
    return buildQuestionPool(current.correct.value, objectTypes)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one pool per question, not per render
  }, [current?.correct?.id])

  function toggleObject(id) {
    if (locked) return
    setTappedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleDone() {
    if (locked) return
    const isCorrect = tappedIds.length === current.correct.value
    setLastOutcomeCorrect(isCorrect)
    if (!isCorrect) setTappedIds([])
    handleAttempt(isCorrect)
  }

  if (!settingsLoaded) return null

  if (resumeAvailable) {
    return <ResumePrompt index={index} total={total} score={score} onResume={acceptResume} onStartFresh={declineResume} />
  }

  if (!introResolved) return null

  if (showIntro) {
    return (
      <GameIntro
        icon={manifest.icon}
        name={t(manifest.nameKey)}
        instructions={t('numberTap.howToPlay')}
        orientation={manifest.orientation}
        dontShowAgain={dontShowAgain}
        onDontShowAgainChange={setDontShowAgain}
        onStart={() => dismissIntro(dontShowAgain)}
      />
    )
  }

  if (done) {
    return (
      <GameResults
        score={score}
        total={total}
        missed={missed}
        onPlayAgain={restart}
        onHome={() => onGameEnd(score, total)}
        renderMissedItem={item => <>{t('numberTap.prompt', { count: item.value })}</>}
        personalBestResult={personalBestResult}
        newBadges={newBadges}
        accentColor={manifest.color}
        gameType={manifest.gameType}
      />
    )
  }

  if (!current) return null

  const announcement =
    lastEvent?.type === 'correct' ? t('common.answerCorrectAnnounce')
    : lastEvent?.type === 'wrong' ? t('common.answerWrongAnnounce')
    : ''

  const target = current.correct.value

  return (
    <div className="game">
      <span data-testid="correct-number-id" data-value={target} style={{ display: 'none' }}>{current.correct.id}</span>

      <div className="game__question">
        <div className="game__progress">{t('common.progress', { current: index + 1, total })}</div>
        <div className="game__prompt">{t('numberTap.prompt', { count: target })}</div>
        {timerMode !== 'off' && (
          <Timer elapsedMs={currentElapsedMs} mode={timerMode === 'countdown' ? 'countdown' : 'countUp'} limitMs={timeLimitMs} />
        )}
      </div>

      <div className="game__choices">
        {objects.map((obj, i) => {
          const isTapped = tappedIds.includes(obj.id)
          const isHintedCorrect = hintActive && !locked && !isTapped && i < target
          const isRevealed = locked && i < target

          let cls = 'game__choice number-tap__object'
          if (isTapped) cls += ' number-tap__object--tapped'
          if (locked && isTapped && lastOutcomeCorrect) cls += ' correct'
          if (locked && isTapped && !lastOutcomeCorrect) cls += ' wrong'
          if ((isHintedCorrect || isRevealed) && !isTapped) cls += ' highlight-correct'

          const style = isHintedCorrect ? { '--hint-strength': hintStrength } : undefined

          return (
            <button
              key={obj.id}
              type="button"
              className={cls}
              style={style}
              data-object-id={obj.id}
              aria-pressed={isTapped}
              aria-disabled={locked}
              aria-label={t('numberTap.objectLabel', { name: t(obj.nameKey), index: i + 1 })}
              onClick={() => toggleObject(obj.id)}
            >
              <span aria-hidden="true">{obj.emoji}</span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="number-tap__done"
        data-testid="number-tap-done"
        aria-disabled={locked}
        onClick={handleDone}
      >
        {t('numberTap.done')} ✓
      </button>

      <div className="sr-only" role="status" data-testid="quiz-live-region">{announcement}</div>

      {timedOut && <div className="game__timeout" role="status">{t('common.timeUp')}</div>}

      {locked && feedbackMode === 'parent-tap' && !timedOut && (
        <button className="game__next" onClick={advance}>{t('common.next')}</button>
      )}
    </div>
  )
}
```

Note the button click handlers guard on `locked` both in `toggleObject`/`handleDone` themselves and via `aria-disabled` — `aria-disabled` (not the native `disabled` attribute) keeps the buttons focusable while locked, matching this repo's existing convention for other post-answer disabled states (`GameChoiceGrid`'s disabled-wrong choices, matched memory tiles).

- [ ] **Step 5: Run the test file to verify it passes**

Run: `npx vitest run src/games/number-tap/__tests__/NumberTapGame.test.jsx`
Expected: PASS, all tests green.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions anywhere else.

- [ ] **Step 7: Run lint**

Run: `npm run lint && npm run lint:css`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/games/number-tap/index.jsx src/games/number-tap/NumberTapGame.css src/games/number-tap/__tests__/NumberTapGame.test.jsx
git commit -m "feat(73): add Number Tap game component"
```

---

### Task 4: Storybook stories

**Files:**
- Create: `src/games/number-tap/NumberTapGame.stories.jsx`

**Interfaces:**
- Consumes: default export from `./index` (Task 3).
- Produces: nothing consumed by later tasks — Storybook-only, verified by `npm run build-storybook`.

- [ ] **Step 1: Create the stories file**

`src/games/number-tap/NumberTapGame.stories.jsx` (mirrors `src/games/emotions-match/EmotionsMatchGame.stories.jsx`):

```jsx
import { useEffect, useRef } from 'react'
import NumberTapGame from './index'

// buildQuestionPool's icon/extra-count choice depends on Math.random -- pin
// it during this wrapper's render (parent-before-child) so the story's board
// is stable across re-renders, and restore it on unmount.
const pinRandom = (Story) => {
  function PinnedRandom() {
    const original = useRef(null)
    if (original.current === null) {
      original.current = Math.random
      Math.random = () => 0.5
    }
    useEffect(() => () => {
      Math.random = original.current
    }, [])
    return Story()
  }
  return <PinnedRandom />
}

// useSettings() loads settings from localStorage inside an async effect that
// resolves during the commit phase. Seed 'playground_settings' with
// introDismissed for this game during the wrapper's render so
// useGameSession() sees the intro as already dismissed on its very first
// settings read and renders gameplay, not the GameIntro screen. Merge with
// whatever's already in localStorage instead of clobbering it.
const seedIntroDismissed = (Story) => {
  function SeededIntroDismissed() {
    const seeded = useRef(false)
    if (!seeded.current) {
      seeded.current = true
      let existing = {}
      try {
        const parsed = JSON.parse(localStorage.getItem('playground_settings') || '{}')
        existing = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch {
        existing = {}
      }
      localStorage.setItem('playground_settings', JSON.stringify({
        ...existing,
        introDismissed: { ...existing.introDismissed, 'number-tap': true },
      }))
    }
    return Story()
  }
  return <SeededIntroDismissed />
}

export default {
  title: 'Games/NumberTapGame',
  component: NumberTapGame,
  decorators: [pinRandom, seedIntroDismissed],
}

export const Default = { args: { onGameEnd: () => {} } }
```

- [ ] **Step 2: Verify the Storybook build succeeds**

Run: `npm run build-storybook`
Expected: build succeeds with no errors mentioning `NumberTapGame`.

- [ ] **Step 3: Commit**

```bash
git add src/games/number-tap/NumberTapGame.stories.jsx
git commit -m "feat(73): add Number Tap Storybook stories"
```

---

### Task 5: Documentation and version bump

**Files:**
- Modify: `README.md` (games list + directory tree)
- Modify: `docs/ENHANCEMENTS.md` (remove shipped backlog item)
- Modify: `CHANGELOG.md` (new version entry)
- Modify: `package.json` (version bump)
- Modify: `src/games/number-tap/manifest.json` (version bump, if bumped past `1.0.0` — see Step 4)

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing (terminal task before final verification).

- [ ] **Step 1: Add the game to README's feature list**

In `README.md`, find the bullet-point game list (the `- **Emotions Match**` bullet added by the immediately preceding feature). Insert a new bullet immediately after it:

```markdown
- **Number Tap** (quiz) — a target number (1–5) is shown; the child taps that many objects on screen, then confirms with the checkmark
```

- [ ] **Step 2: Add the game to README's directory tree**

In `README.md`, the `games/` directory-tree comment block currently reads:

```
└── games/                     # One folder per game — animal-sounds, color-match, character-match,
    └── animal-memory-match/   #   character-match-bluey, fruit-veggie-id, emotions-match,
                                #   animal-memory-match, sound-memory-match; drop a new folder to add one
```

Change it to:

```
└── games/                     # One folder per game — animal-sounds, color-match, character-match,
    └── animal-memory-match/   #   character-match-bluey, fruit-veggie-id, emotions-match, number-tap,
                                #   animal-memory-match, sound-memory-match; drop a new folder to add one
```

- [ ] **Step 3: Remove the shipped item from ENHANCEMENTS.md**

In `docs/ENHANCEMENTS.md`, delete this line from the **New Games** section:

```
- **Number Tap** — display a number (1–5), child taps that many objects on screen; builds early counting.
```

- [ ] **Step 4: Bump the app version**

In `package.json`, change:

```json
  "version": "1.0.8",
```

to:

```json
  "version": "1.0.9",
```

Leave `src/games/number-tap/manifest.json`'s `"version": "1.0.0"` as-is — this is the game's first release, matching how every other game's manifest starts at `1.0.0` regardless of the app-wide version at ship time.

- [ ] **Step 5: Add a CHANGELOG entry**

In `CHANGELOG.md`, insert a new section above the current `## [1.0.8]` entry:

```markdown
## [1.0.9] - 2026-08-04

### Added

- Number Tap (issue #73): a new game teaching early counting. A target number (1–5) is shown, and the child taps that many objects from a larger pool (the pool always has 1-3 more objects than the target, so a wrong count is always reachable) then presses a "Done ✓" button to confirm — a wrong count (too few or too many) clears the selection for a retry, same `maxTries`/hint/streak/timer rules as every other game. This mechanic doesn't fit the existing discrete-choice quiz shell, so it's the first game to call `useGameSession` directly (composing `GameIntro`/`GameResults`/`ResumePrompt`/`Timer` itself, following the `animal-memory-match` precedent) instead of going through `QuizGameShell`.
- `useGameSession`'s `handleChoice` was split into a new `handleAttempt(isCorrect)` (the scoring/streak/timer/hint/retry/lock state machine) plus a thin `handleChoice(item)` wrapper that determines correctness from a discrete choice-click — a pure, behavior-preserving refactor (every existing game's tests pass unmodified) that lets Number Tap, and any future non-discrete-choice mechanic, drive the same engine by just reporting a boolean.
- Added `src/games/number-tap/__tests__/numbers.test.js`, `buildQuestionPool.test.js` (positive: pool always exceeds the target by 1-3 objects, for every target 1-5; negative: an equal-or-smaller pool would make every question trivially correct), and `NumberTapGame.test.jsx` (full session flow, retry-then-correct, wrong-count-on-final-try miss, countdown timeout, intro, session-resume, a11y, and a check that the results screen never offers the discrete-choice "harder difficulty" bump, which would otherwise silently change the shared `numChoices` setting for other games). Extended `useGameSession.test.js` with direct `handleAttempt` coverage plus a regression test proving `handleChoice`'s behavior is unchanged.
```

- [ ] **Step 6: Run the full verification suite**

Run: `npm run lint && npm run lint:css && npm run coverage && npm run build`
Expected: lint and lint:css report no new errors; the full unit suite passes including every Number Tap and `useGameSession` test; the production build succeeds.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/ENHANCEMENTS.md CHANGELOG.md package.json
git commit -m "docs(73): document Number Tap, remove shipped backlog item, bump version to 1.0.9"
```
