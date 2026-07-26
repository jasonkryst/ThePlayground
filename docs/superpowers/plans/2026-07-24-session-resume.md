# Session Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a minimal snapshot of an in-progress quiz session after every question, and offer to resume it (or start fresh) the next time that game is opened, as long as the snapshot is less than 4 hours old.

**Architecture:** `useGameSession` gains a small init-time state machine: on mount, a resume-check reads a single global localStorage slot; a valid same-game snapshot within the TTL holds the whole init sequence at "awaiting resume choice" (exposed as `resumeAvailable`/`acceptResume`/`declineResume`) instead of resolving the intro or building a queue. A new `ResumePrompt` screen renders in `QuizGameShell` ahead of the existing intro gate. A snapshot is saved once per question transition and cleared on finish/decline/expiry.

**Tech Stack:** React hooks, Vitest + React Testing Library, existing `localStorageAdapter` pattern, react-i18next.

**Prerequisite:** This plan assumes the Cross-Session Adaptive Item Selection plan (`docs/superpowers/plans/2026-07-24-cross-session-item-selection.md`) has already been implemented — several edits below are anchored to the post-that-plan state of `useGameSession.js` (the `adaptiveItemSelectionEnabled` destructure, the `selectionWeightFn()` helper, and the `buildQueue(..., selectionWeightFn())` call sites). If that plan has not been implemented yet, implement it first.

## Global Constraints

- Scope is quiz sessions (`useGameSession`) only — memory sessions (`useMemorySession`) are explicitly out of scope.
- Single global localStorage slot (not per-game) — only one game is ever actively played at a time.
- `RESUME_TTL_MS` = 4 hours exactly.
- The saved snapshot embeds full item objects (the exact `buildQueue` output shape), never just ids.
- Nothing clears the snapshot except finishing the session, declining a resume offer, or TTL expiry — a deliberate exit via the exit guard's "Leave Game" must remain resumable.
- Spec: `docs/superpowers/specs/2026-07-24-session-resume-design.md`.

---

### Task 1: Adapter methods for session-resume storage

**Files:**
- Modify: `src/storage/adapter.js`
- Modify: `src/storage/localStorageAdapter.js`
- Test: `src/storage/__tests__/localStorageAdapter.sessionResume.test.js`

**Interfaces:**
- Produces: `adapter.getSessionResume()` → `Promise<SessionResumeState | null>`; `adapter.saveSessionResume(state)` → `Promise<void>`; `adapter.clearSessionResume()` → `Promise<void>`.

- [ ] **Step 1: Write the failing test**

```js
// src/storage/__tests__/localStorageAdapter.sessionResume.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import localStorageAdapter from '../localStorageAdapter'

beforeEach(() => localStorage.clear())

const sampleState = {
  gameId: 'animal-sounds',
  queue: [{ correct: { id: 'dog' }, choices: [{ id: 'dog' }, { id: 'cat' }] }],
  index: 1,
  score: 1,
  streak: 1,
  missed: [],
  timings: [{ questionIndex: 0, itemId: 'dog', correct: true, durationMs: 800, attemptNumber: 1 }],
  peakStreak: 1,
  savedAt: 1700000000000,
}

describe('localStorageAdapter — session resume', () => {
  it('returns null when nothing is stored', async () => {
    expect(await localStorageAdapter.getSessionResume()).toBe(null)
  })

  it('round-trips a saved session state', async () => {
    await localStorageAdapter.saveSessionResume(sampleState)
    expect(await localStorageAdapter.getSessionResume()).toEqual(sampleState)
  })

  it('clearSessionResume removes the saved state', async () => {
    await localStorageAdapter.saveSessionResume(sampleState)
    await localStorageAdapter.clearSessionResume()
    expect(await localStorageAdapter.getSessionResume()).toBe(null)
  })

  it('returns null when the stored value is corrupted JSON', async () => {
    localStorage.setItem('playground_session_resume', '{not valid json')
    expect(await localStorageAdapter.getSessionResume()).toBe(null)
  })

  it('returns null when the stored value is an array, not an object', async () => {
    localStorage.setItem('playground_session_resume', '[1,2,3]')
    expect(await localStorageAdapter.getSessionResume()).toBe(null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.sessionResume.test.js`
Expected: FAIL — `localStorageAdapter.getSessionResume is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/storage/adapter.js`, append a new JSDoc section at the end of the file (after the item-stats section added by the prerequisite plan):

```
 *
 * Session-resume adapter methods (added v0.36.0, issue #128):
 * getSessionResume()       → Promise<SessionResumeState | null>
 * saveSessionResume(state) → Promise<void>
 * clearSessionResume()     → Promise<void>
 *
 * SessionResumeState = {
 *   gameId: string, queue: QueueEntry[] (buildQueue's own output shape), index: number,
 *   score: number, streak: number, missed: Item[], timings: TimingEntry[],
 *   peakStreak: number, savedAt: number (epoch ms)
 * }
 * A single global slot, not per-game — only one game is ever actively played at a time.
 */
```

In `src/storage/localStorageAdapter.js`, add a new key constant (after the existing key constants, e.g. after `const ITEM_STATS_KEY = 'playground_item_stats'` if the prerequisite plan added it, otherwise after `const BADGES_KEY = 'playground_badges'`):

```js
const SESSION_RESUME_KEY = 'playground_session_resume'
```

Add new methods to the `localStorageAdapter` object, after the existing `saveItemStats`/`saveBadgeData` method (before the closing `}` of the object):

```js
  async getSessionResume() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SESSION_RESUME_KEY) || 'null')
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  },

  async saveSessionResume(state) {
    localStorage.setItem(SESSION_RESUME_KEY, JSON.stringify(state))
  },

  async clearSessionResume() {
    localStorage.removeItem(SESSION_RESUME_KEY)
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.sessionResume.test.js`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/storage/adapter.js src/storage/localStorageAdapter.js src/storage/__tests__/localStorageAdapter.sessionResume.test.js
git commit -m "feat(128): add session-resume adapter methods"
```

---

### Task 2: `isResumeValid` util

**Files:**
- Create: `src/utils/sessionResume.js`
- Test: `src/utils/__tests__/sessionResume.test.js`

**Interfaces:**
- Produces: `export const RESUME_TTL_MS = 4 * 60 * 60 * 1000`; `export function isResumeValid(saved, gameId, now = Date.now())` → `boolean`.

- [ ] **Step 1: Write the failing tests**

```js
// src/utils/__tests__/sessionResume.test.js
import { describe, it, expect } from 'vitest'
import { isResumeValid, RESUME_TTL_MS } from '../sessionResume'

describe('isResumeValid', () => {
  it('is false when there is no saved state', () => {
    expect(isResumeValid(null, 'animal-sounds')).toBe(false)
    expect(isResumeValid(undefined, 'animal-sounds')).toBe(false)
  })

  it('is true for a matching gameId saved just now', () => {
    const now = Date.now()
    expect(isResumeValid({ gameId: 'animal-sounds', savedAt: now }, 'animal-sounds', now)).toBe(true)
  })

  it('is false when the gameId does not match', () => {
    const now = Date.now()
    expect(isResumeValid({ gameId: 'color-match', savedAt: now }, 'animal-sounds', now)).toBe(false)
  })

  it('is false once the snapshot is older than the TTL', () => {
    const now = Date.now()
    expect(isResumeValid({ gameId: 'animal-sounds', savedAt: now - RESUME_TTL_MS - 1 }, 'animal-sounds', now)).toBe(false)
  })

  it('is true one millisecond before the TTL boundary', () => {
    const now = Date.now()
    expect(isResumeValid({ gameId: 'animal-sounds', savedAt: now - RESUME_TTL_MS + 1 }, 'animal-sounds', now)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/sessionResume.test.js`
Expected: FAIL — `Cannot find module '../sessionResume'`.

- [ ] **Step 3: Write the implementation**

```js
// src/utils/sessionResume.js
export const RESUME_TTL_MS = 4 * 60 * 60 * 1000

export function isResumeValid(saved, gameId, now = Date.now()) {
  return !!saved && saved.gameId === gameId && (now - saved.savedAt) < RESUME_TTL_MS
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/sessionResume.test.js`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/sessionResume.js src/utils/__tests__/sessionResume.test.js
git commit -m "feat(128): add isResumeValid TTL/gameId-match util"
```

---

### Task 3: Wire the resume state machine into `useGameSession`

**Files:**
- Modify: `src/hooks/useGameSession.js`
- Modify: `src/hooks/__tests__/useGameSession.test.js` (add new cases and one new mock only — do not remove existing mocks/tests)

**Interfaces:**
- Consumes: `adapter` (`src/storage/index`, methods from Task 1), `isResumeValid` (Task 2).
- Produces: adds `resumeAvailable: boolean`, `acceptResume: () => void`, `declineResume: () => void` to the hook's returned object.

- [ ] **Step 1: Write the failing tests**

Add the import and mock to `src/hooks/__tests__/useGameSession.test.js`. First, add to the existing `vi.hoisted` block's returned object (find `const { mockAddScore, mockFireConfetti, mockRecordStreak, mockUpdateSetting } = vi.hoisted(...)` and add three more mocks alongside them):

```js
const { mockAddScore, mockFireConfetti, mockRecordStreak, mockUpdateSetting,
        mockGetSessionResume, mockSaveSessionResume, mockClearSessionResume } = vi.hoisted(() => ({
  mockAddScore: vi.fn().mockResolvedValue(undefined),
  mockFireConfetti: vi.fn(),
  mockRecordStreak: vi.fn().mockResolvedValue(undefined),
  mockUpdateSetting: vi.fn().mockResolvedValue(undefined),
  mockGetSessionResume: vi.fn(),
  mockSaveSessionResume: vi.fn(),
  mockClearSessionResume: vi.fn(),
}))
```

Add a new mock block near the other `vi.mock` calls (after the `useBadges` mock, before the `confetti` mock):

```js
vi.mock('../../storage/index', () => ({
  default: {
    getSessionResume: mockGetSessionResume,
    saveSessionResume: mockSaveSessionResume,
    clearSessionResume: mockClearSessionResume,
  },
}))
```

Add `mockGetSessionResume.mockResolvedValue(null)` to the existing `beforeEach` block (so every pre-existing test — which knows nothing about resume — proceeds straight through the "no snapshot" path, identically to today).

Then add this new `describe` block at the end of the file:

```js
describe('useGameSession — session resume', () => {
  it('offers to resume a valid same-game snapshot within the TTL', async () => {
    mockGetSessionResume.mockResolvedValue({
      gameId: 'test-game',
      queue: [{ correct: items[0], choices: [items[0], items[1]] }],
      index: 0, score: 2, streak: 1, missed: [], timings: [], peakStreak: 1, savedAt: Date.now(),
    })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.resumeAvailable).toBe(true))
  })

  it('does not offer resume, and leaves storage untouched, when the snapshot is for a different gameId', async () => {
    mockGetSessionResume.mockResolvedValue({
      gameId: 'other-game', queue: [], index: 0, score: 0, streak: 0, missed: [], timings: [], peakStreak: 0, savedAt: Date.now(),
    })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())
    expect(result.current.resumeAvailable).toBe(false)
    expect(mockClearSessionResume).not.toHaveBeenCalled()
  })

  it('does not offer resume, and clears it, when the snapshot is older than 4 hours', async () => {
    mockGetSessionResume.mockResolvedValue({
      gameId: 'test-game', queue: [], index: 0, score: 0, streak: 0, missed: [], timings: [], peakStreak: 0,
      savedAt: Date.now() - 5 * 60 * 60 * 1000,
    })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())
    expect(result.current.resumeAvailable).toBe(false)
    expect(mockClearSessionResume).toHaveBeenCalled()
  })

  it('treats a missing/undefined saved state as no snapshot', async () => {
    mockGetSessionResume.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())
    expect(result.current.resumeAvailable).toBe(false)
  })

  it('acceptResume restores score, streak, index, queue, and timings, and skips the intro', async () => {
    const savedQueue = [
      { correct: items[0], choices: [items[0], items[1]] },
      { correct: items[1], choices: [items[0], items[1]] },
      { correct: items[2], choices: [items[1], items[2]] },
    ]
    mockGetSessionResume.mockResolvedValue({
      gameId: 'test-game', queue: savedQueue, index: 1, score: 1, streak: 1,
      missed: [], timings: [{ questionIndex: 0, itemId: items[0].id, correct: true, durationMs: 500, attemptNumber: 1 }],
      peakStreak: 1, savedAt: Date.now(),
    })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.resumeAvailable).toBe(true))

    await act(async () => { result.current.acceptResume() })

    expect(result.current.resumeAvailable).toBe(false)
    expect(result.current.index).toBe(1)
    expect(result.current.score).toBe(1)
    expect(result.current.streak).toBe(1)
    expect(result.current.total).toBe(3)
    expect(result.current.timings).toHaveLength(1)
    expect(result.current.showIntro).toBe(false)
    expect(result.current.introResolved).toBe(true)
  })

  it('declineResume clears storage and proceeds through the normal fresh-queue flow', async () => {
    mockGetSessionResume.mockResolvedValue({
      gameId: 'test-game',
      queue: [{ correct: items[0], choices: [items[0], items[1]] }],
      index: 0, score: 5, streak: 2, missed: [], timings: [], peakStreak: 2, savedAt: Date.now(),
    })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.resumeAvailable).toBe(true))

    await act(async () => { result.current.declineResume() })

    expect(mockClearSessionResume).toHaveBeenCalled()
    expect(result.current.resumeAvailable).toBe(false)
    await waitFor(() => expect(result.current.current).toBeDefined())
    expect(result.current.score).toBe(0)
    expect(result.current.total).toBe(3)
  })

  it('saves a snapshot after each question transition', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    await act(async () => { result.current.handleChoice(result.current.current.correct) })
    await act(async () => { result.current.advance() })

    expect(mockSaveSessionResume).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: 'test-game', index: 1, score: 1 })
    )
  })

  it('clears the snapshot once the session finishes', async () => {
    setSettings({ questionsPerSession: 1 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    await act(async () => { result.current.handleChoice(result.current.current.correct) })
    await act(async () => { result.current.advance() })

    expect(result.current.done).toBe(true)
    expect(mockClearSessionResume).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: the 8 new tests FAIL (`resumeAvailable` is `undefined`, `acceptResume`/`declineResume` don't exist); pre-existing tests still PASS (since `mockGetSessionResume` isn't consulted by the hook yet, it's simply an unused mock at this point).

- [ ] **Step 3: Modify the implementation**

In `src/hooks/useGameSession.js`, add the import (alongside the existing imports, e.g. after `import reinsertMissed from '../utils/reinsertMissed'`):

```js
import adapter from '../storage/index'
import { isResumeValid } from '../utils/sessionResume'
```

Add new state (alongside the existing `useState` declarations, e.g. after `const [lastEvent, setLastEvent] = useState(null)`):

```js
  const [resumeAvailable, setResumeAvailable] = useState(false)
  const [sessionReady,    setSessionReady]    = useState(false)
```

Add new refs (alongside the existing `useRef` declarations, e.g. after `const introInitializedRef = useRef(false)`):

```js
  const resumeSnapshotRef    = useRef(null)
  const suppressNextBuildRef = useRef(false)
```

Find the existing intro-init effect:

```js
  useEffect(() => {
    if (!loaded || introInitializedRef.current) return
    introInitializedRef.current = true
    setIntroResolved(true)
    setShowIntro(!settings.introDismissed?.[gameId])
  }, [loaded, settings.introDismissed, gameId])
```

Replace it with:

```js
  function markSessionReadyFresh() {
    setIntroResolved(true)
    setShowIntro(!settings.introDismissed?.[gameId])
    setSessionReady(true)
  }

  function acceptResume() {
    const saved = resumeSnapshotRef.current
    queueRef.current = saved.queue
    setQueue(saved.queue)
    indexRef.current = saved.index
    setIndex(saved.index)
    scoreRef.current = saved.score
    setScore(saved.score)
    streakRef.current = saved.streak
    setStreak(saved.streak)
    peakStreakRef.current = saved.peakStreak
    missedRef.current = saved.missed
    setMissed(saved.missed)
    timingsRef.current = saved.timings
    setTimings(saved.timings)

    resumeSnapshotRef.current = null
    setResumeAvailable(false)
    suppressNextBuildRef.current = true
    setIntroResolved(true)
    setShowIntro(false)
    setSessionReady(true)
  }

  function declineResume() {
    adapter.clearSessionResume()
    resumeSnapshotRef.current = null
    setResumeAvailable(false)
    markSessionReadyFresh()
  }

  // Resume-check runs once, before anything else in the init sequence
  // decides what to show: a valid same-game snapshot within the 4-hour TTL
  // (isResumeValid) holds the whole sequence at "awaiting resume choice"
  // (resumeAvailable) instead of resolving the intro or letting the
  // queue-build effect below run. acceptResume()/declineResume() (above)
  // are what eventually move the sequence to sessionReady.
  useEffect(() => {
    if (!loaded || introInitializedRef.current) return
    introInitializedRef.current = true
    adapter.getSessionResume().then(saved => {
      if (isResumeValid(saved, gameId)) {
        resumeSnapshotRef.current = saved
        setResumeAvailable(true)
      } else {
        if (saved && saved.gameId === gameId) adapter.clearSessionResume()
        markSessionReadyFresh()
      }
    })
  }, [loaded, settings.introDismissed, gameId])
```

Find the queue-build effect (as left by the prerequisite plan):

```js
  useEffect(() => {
    if (numChoices && questionsPerSession) {
      const q = buildQueue(items, numChoices, questionsPerSession, selectionWeightFn())
      queueRef.current = q
      setQueue(q)
    }
  }, [numChoices, questionsPerSession, items, adaptiveItemSelectionEnabled])
```

Replace it with:

```js
  useEffect(() => {
    if (!sessionReady || !numChoices || !questionsPerSession) return
    if (suppressNextBuildRef.current) { suppressNextBuildRef.current = false; return }
    const q = buildQueue(items, numChoices, questionsPerSession, selectionWeightFn())
    queueRef.current = q
    setQueue(q)
  }, [sessionReady, numChoices, questionsPerSession, items, adaptiveItemSelectionEnabled])
```

Add a new effect immediately after it, to save a resumable snapshot once per question transition:

```js
  // Persists a resumable snapshot once per question transition (not
  // per-tap): score/streak/missed/timings all finish updating, synchronously,
  // before index ever advances (advance() runs only after the scoring
  // effects of the just-answered question have already committed), so by
  // the time this effect re-runs, the snapshot it captures is always fully
  // settled — never a half-answered question where index still points at
  // the old one. Cleared the moment the session finishes.
  useEffect(() => {
    if (done) { adapter.clearSessionResume(); return }
    if (!queue.length) return
    adapter.saveSessionResume({
      gameId, queue, index, score, streak, missed, timings,
      peakStreak: peakStreakRef.current, savedAt: Date.now(),
    })
  }, [gameId, queue, index, done])
```

Finally, add the three new values to the hook's return statement (in the existing `return { ... }` object, add alongside the other flags):

```js
    resumeAvailable, acceptResume, declineResume,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: PASS — all pre-existing tests plus the 8 new ones.

- [ ] **Step 5: Update the five quiz-game test files that render the real `useGameSession` hook**

These files don't mock `storage/index` today (every other collaborator is mocked at the hook level instead), so the new direct `adapter` import in `useGameSession.js` would otherwise hit the real, jsdom-provided `localStorage` during these tests. Add this block to each file, immediately after its existing `vi.mock('../../../hooks/useItemStats', ...)` block (added by the prerequisite plan) — or, if that plan wasn't applied to this file for some reason, after the `useBadges` mock:

```js
vi.mock('../../../storage/index', () => ({
  default: {
    getSessionResume: vi.fn().mockResolvedValue(null),
    saveSessionResume: vi.fn(),
    clearSessionResume: vi.fn(),
  },
}))
```

Files to update (identical block, identical relative path, in each):
- `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`
- `src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`
- `src/games/character-match/__tests__/CharacterMatchGame.test.jsx`
- `src/games/character-match-bluey/__tests__/CharacterMatchGameBluey.test.jsx`
- `src/games/color-match/__tests__/ColorMatchGame.test.jsx`

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useGameSession.js src/hooks/__tests__/useGameSession.test.js \
  src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx \
  src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx \
  src/games/character-match/__tests__/CharacterMatchGame.test.jsx \
  src/games/character-match-bluey/__tests__/CharacterMatchGameBluey.test.jsx \
  src/games/color-match/__tests__/ColorMatchGame.test.jsx
git commit -m "feat(128): wire the resume state machine into useGameSession"
```

---

### Task 4: `ResumePrompt` component

**Files:**
- Create: `src/components/ResumePrompt.jsx`
- Create: `src/components/ResumePrompt.css`
- Modify: `src/i18n/en.json`
- Test: `src/components/__tests__/ResumePrompt.test.jsx`

**Interfaces:**
- Produces: `export default function ResumePrompt({ index, total, score, onResume, onStartFresh })`

- [ ] **Step 1: Write the failing test**

```js
// src/components/__tests__/ResumePrompt.test.jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import ResumePrompt from '../ResumePrompt'

describe('ResumePrompt', () => {
  it('shows the saved progress', () => {
    render(<ResumePrompt index={2} total={10} score={2} onResume={vi.fn()} onStartFresh={vi.fn()} />)
    expect(screen.getByText(/3 of 10/i)).toBeInTheDocument()
  })

  it('calls onResume when the resume action is tapped', async () => {
    const onResume = vi.fn()
    render(<ResumePrompt index={2} total={10} score={2} onResume={onResume} onStartFresh={vi.fn()} />)
    await userEvent.click(screen.getByTestId('resume-prompt-resume'))
    expect(onResume).toHaveBeenCalled()
  })

  it('calls onStartFresh when the start-fresh action is tapped', async () => {
    const onStartFresh = vi.fn()
    render(<ResumePrompt index={2} total={10} score={2} onResume={vi.fn()} onStartFresh={onStartFresh} />)
    await userEvent.click(screen.getByTestId('resume-prompt-start-fresh'))
    expect(onStartFresh).toHaveBeenCalled()
  })

  it('renders sensibly at zero progress (question 1, score 0)', () => {
    render(<ResumePrompt index={0} total={10} score={0} onResume={vi.fn()} onStartFresh={vi.fn()} />)
    expect(screen.getByText(/1 of 10/i)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ResumePrompt index={0} total={10} score={0} onResume={vi.fn()} onStartFresh={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/ResumePrompt.test.jsx`
Expected: FAIL — `Cannot find module '../ResumePrompt'`.

- [ ] **Step 3: Write the implementation**

Add to `src/i18n/en.json`, in the `"common"` section, after the existing `"tapToHear": "Tap 🔊 to hear it!"` line (add a comma to that line):

```json
    "tapToHear": "Tap 🔊 to hear it!",
    "resumeHeading": "Welcome back!",
    "resumeProgress": "You were on question {{current}} of {{total}}, with a score of {{score}}.",
    "resumeAction": "Continue Where I Left Off",
    "resumeStartFreshAction": "Start Fresh"
```

```jsx
// src/components/ResumePrompt.jsx
import { useTranslation } from 'react-i18next'
import './ResumePrompt.css'

export default function ResumePrompt({ index, total, score, onResume, onStartFresh }) {
  const { t } = useTranslation()

  return (
    <div className="resume-prompt">
      <h2 className="resume-prompt__heading">{t('common.resumeHeading')}</h2>
      <p className="resume-prompt__progress">
        {t('common.resumeProgress', { current: index + 1, total, score })}
      </p>
      <div className="resume-prompt__actions">
        <button className="resume-prompt__resume" data-testid="resume-prompt-resume" onClick={onResume}>
          {t('common.resumeAction')}
        </button>
        <button className="resume-prompt__start-fresh" data-testid="resume-prompt-start-fresh" onClick={onStartFresh}>
          {t('common.resumeStartFreshAction')}
        </button>
      </div>
    </div>
  )
}
```

```css
/* src/components/ResumePrompt.css */
/* Mirrors .game-intro in GameIntro.css: fills the shell's content area
   rather than demanding a full extra viewport height. */
.resume-prompt {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  gap: 20px;
  padding: 24px;
  text-align: center;
}

.resume-prompt__heading {
  font-size: 1.75rem;
  font-weight: 800;
  margin: 0;
}

.resume-prompt__progress {
  font-size: 1.25rem;
  opacity: 0.8;
  max-width: 480px;
  margin: 0;
}

.resume-prompt__actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 320px;
}

.resume-prompt__resume,
.resume-prompt__start-fresh {
  padding: 16px 36px;
  font-size: 1.25rem;
  font-weight: 700;
  border-radius: var(--radius-button);
  min-height: 64px;
  border: none;
}

.resume-prompt__resume {
  background: var(--color-lavender-dark);
  color: white;
}

.resume-prompt__start-fresh {
  background: transparent;
  color: var(--color-text-muted);
  border: 2px solid var(--color-text-muted);
}

.resume-prompt__resume:focus,
.resume-prompt__start-fresh:focus         { outline: none; }
.resume-prompt__resume:focus-visible,
.resume-prompt__start-fresh:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/ResumePrompt.test.jsx`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ResumePrompt.jsx src/components/ResumePrompt.css src/components/__tests__/ResumePrompt.test.jsx src/i18n/en.json
git commit -m "feat(128): add ResumePrompt component"
```

---

### Task 5: Wire `ResumePrompt` into `QuizGameShell`

**Files:**
- Modify: `src/components/QuizGameShell.jsx`
- Modify: `src/components/__tests__/QuizGameShell.test.jsx`

**Interfaces:**
- Consumes: `ResumePrompt` (Task 4), `session.resumeAvailable`/`acceptResume`/`declineResume` (Task 3).

- [ ] **Step 1: Write the failing test**

This file's existing `makeSession(overrides)` helper (top of the file) builds the default session prop object; add `resumeAvailable: false, acceptResume: vi.fn(), declineResume: vi.fn()` to its returned object so every pre-existing test keeps passing unchanged:

```js
function makeSession(overrides = {}) {
  return {
    current: { correct: { id: 'a' }, choices: [{ id: 'a' }, { id: 'b' }] },
    index: 0, total: 3, locked: false, disabledChoiceIds: [], hintActive: false, hintStrength: 0, selected: null,
    score: 0, streak: 0, missed: [], done: false, feedbackMode: 'immediate',
    currentElapsedMs: 0, timerMode: 'countUp', timeLimitMs: undefined, timedOut: false,
    offerDifficultyBump: false, numChoices: 2, personalBestResult: null, newBadges: [],
    lastEvent: null, soundEffectsEnabled: true,
    showIntro: false, introResolved: true, settingsLoaded: true,
    resumeAvailable: false, acceptResume: vi.fn(), declineResume: vi.fn(),
    dontShowAgain: false, setDontShowAgain: vi.fn(),
    handleChoice: vi.fn(), advance: vi.fn(), restart: vi.fn(),
    acceptDifficultyBump: vi.fn(), dismissDifficultyBump: vi.fn(), dismissIntro: vi.fn(),
    ...overrides,
  }
}
```

Then add these two tests to the `'QuizGameShell — screens'` describe block, using the file's existing `renderShell(session, extra)` helper and `fireEvent` (this file uses `fireEvent`, not `userEvent`):

```js
  it('shows the resume prompt instead of the intro when resumeAvailable is true, and defers to it over everything else', () => {
    renderShell(makeSession({ resumeAvailable: true, showIntro: true, introResolved: false, index: 2, total: 10, score: 4 }))
    expect(screen.getByTestId('resume-prompt-resume')).toBeInTheDocument()
    expect(screen.queryByTestId('game-intro-start')).not.toBeInTheDocument()
  })

  it('calls session.acceptResume when the resume action is tapped', () => {
    const session = makeSession({ resumeAvailable: true, index: 2, total: 10, score: 4 })
    renderShell(session)
    fireEvent.click(screen.getByTestId('resume-prompt-resume'))
    expect(session.acceptResume).toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/__tests__/QuizGameShell.test.jsx`
Expected: the 2 new tests FAIL (no resume prompt renders yet); pre-existing tests still PASS.

- [ ] **Step 3: Modify the implementation**

In `src/components/QuizGameShell.jsx`, add the import (alongside the existing `GameIntro`/`GameResults` imports):

```js
import ResumePrompt from './ResumePrompt'
```

Add the three new destructured props (in the existing destructure of `session`, alongside `showIntro, introResolved, settingsLoaded, ...`):

```js
    resumeAvailable, acceptResume, declineResume,
```

Find:

```js
  if (!settingsLoaded || !introResolved) return null

  if (showIntro) {
```

Replace with:

```js
  if (!settingsLoaded) return null

  if (resumeAvailable) {
    return <ResumePrompt index={index} total={total} score={score} onResume={acceptResume} onStartFresh={declineResume} />
  }

  if (!introResolved) return null

  if (showIntro) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/__tests__/QuizGameShell.test.jsx`
Expected: PASS — all pre-existing tests plus the 2 new ones.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/QuizGameShell.jsx src/components/__tests__/QuizGameShell.test.jsx
git commit -m "feat(128): render ResumePrompt ahead of the intro gate in QuizGameShell"
```

---

### Task 6: Docs — README, CHANGELOG, ENHANCEMENTS, version bump

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/ENHANCEMENTS.md`
- Modify: `package.json`

- [ ] **Step 1: Update `README.md`**

Add a new bullet to the top feature list, immediately after the existing "Kid-safe exit guard" bullet:

```
- **Session resume** — a browser crash, tab close, reload, or even a deliberate exit mid-session leaves a resumable snapshot; reopening that game within 4 hours offers to continue where the child left off, or start fresh
```

- [ ] **Step 2: Update `package.json`**

Change the version to `"0.36.0"` (one minor version above whatever the prerequisite plan left it at — confirm the current value in `package.json` before editing, since this plan assumes that plan already bumped it to `0.35.0`).

- [ ] **Step 3: Update `CHANGELOG.md`**

Add a new section at the top, above the previous latest entry:

```markdown
## [0.36.0] - 2026-07-24

### Added

- Session resume after interruption (issue #128): a browser crash, tab close, reload, or a deliberate exit via the exit guard's "Leave Game" button no longer loses an in-progress quiz session. `useGameSession` now persists a minimal snapshot (`gameId`, `queue`, `index`, `score`, `streak`, `missed`, `timings`, `peakStreak`) after every question transition via three new adapter methods (`getSessionResume`/`saveSessionResume`/`clearSessionResume`, a single global localStorage slot since only one game is ever active at a time). Reopening that same game within 4 hours shows a new `ResumePrompt` screen ("Welcome back!") offering to continue exactly where the child left off or start fresh; the saved queue embeds full item data, so resuming never depends on the current state of the game's content catalog. Scoped to quiz games; memory games are unaffected.
```

- [ ] **Step 4: Update `docs/ENHANCEMENTS.md`**

Remove this line (in the "UX" section):

```
- **Session resume after interruption** — the exit guard (v0.18.0) stops accidental exits, but a browser crash, tab close, or reload still loses an in-progress session; persisting minimal session state would let it offer "pick up where you left off."
```

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md docs/ENHANCEMENTS.md package.json
git commit -m "docs(128): changelog, README, and enhancements-backlog updates for session resume"
```

---

### Task 7: e2e coverage

**Files:**
- Create: `e2e/session-resume.spec.js`

Check an existing e2e spec (e.g. `e2e/tap-target-standard.spec.js` or any spec that navigates to a game route) for this repo's Playwright setup conventions (base URL, how `localStorage` is seeded/read, selectors used) before writing this file, and match its style. The test must:

- [ ] **Step 1: Write the e2e test**

Seed `localStorage` with a valid, unexpired `playground_session_resume` snapshot for a real game (e.g. `animal-sounds`) with `index` partway through, `score` non-zero, and a `queue` shaped exactly like real `buildQueue` output for that game's real item pool. Navigate to that game's route and assert the resume prompt appears with the right progress text (`data-testid="resume-prompt-resume"` visible). Click resume, and assert the game view shows the correct question index and score. Reload and repeat, this time clicking start-fresh, and assert `localStorage.getItem('playground_session_resume')` is `null` and the game restarts at question 1 with score 0.

- [ ] **Step 2: Run the e2e test**

Run: `npx playwright test e2e/session-resume.spec.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/session-resume.spec.js
git commit -m "test(128): e2e coverage for session resume"
```

---

### Task 8: Full verification pass

- [ ] **Step 1: Run the full unit/component suite**

Run: `npx vitest run --coverage`
Expected: PASS, no coverage regressions on touched files.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS. (Remove `storybook-static/` first if present, per this repo's known lint-vs-storybook-static-build-output caveat.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS, no errors.

- [ ] **Step 4: Full e2e suite**

Run: `npm run e2e`
Expected: PASS, no regressions to existing game or a11y specs.

- [ ] **Step 5: Final commit if anything needed fixing**

If any step above required a fix, commit it separately with a message describing what was fixed (e.g. `fix(128): ...`).
