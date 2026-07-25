# Cross-Session Adaptive Item Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Weight quiz-game queues toward items the child has missed in *previous* sessions (decayed by recency, capped), gated by a new independent `adaptiveItemSelectionEnabled` setting, without changing any existing behavior when the setting is off.

**Architecture:** A pure `weightedShuffle` util (Efraimidis–Spirakis weighted sampling) sits alongside the existing `shuffle` in `buildQueue.js`, used only when a weight function is supplied. A pure `computeItemWeight` util turns stored per-item miss history into a bounded, decayed weight. A new `useItemStats` hook (adapter-backed, mirroring `usePersonalBest`) records misses at the end of every session and supplies the weight function to `useGameSession`'s existing queue-build logic.

**Tech Stack:** React hooks, Vitest + React Testing Library, existing `localStorageAdapter` pattern.

## Global Constraints

- No regression to existing `buildQueue` behavior when called without the new 4th argument — this is the majority of existing call sites and all existing tests.
- `adaptiveItemSelectionEnabled` must be fully independent of `spacedRepetitionEnabled` — either can be on/off in any combination.
- Weight formula: `effectiveMisses = min(missCount * 0.5 ** (daysSinceLastMissed / 14), 4)`; `weight = 1 + effectiveMisses * 0.5` (range 1x–3x).
- New localStorage key: `playground_item_stats`. Shape: `{ [gameId]: { [itemId]: { missCount: number, lastMissedAt: number } } }`.
- Spec: `docs/superpowers/specs/2026-07-24-cross-session-item-selection-design.md`.

---

### Task 1: `weightedShuffle` util

**Files:**
- Create: `src/utils/weightedShuffle.js`
- Test: `src/utils/__tests__/weightedShuffle.test.js`

**Interfaces:**
- Produces: `export default function weightedShuffle(items, weightOf)` — `weightOf` is `(item) => number > 0`. Returns a new array, same items, reordered.

- [ ] **Step 1: Write the failing tests**

```js
// src/utils/__tests__/weightedShuffle.test.js
import { describe, it, expect, vi, afterEach } from 'vitest'
import weightedShuffle from '../weightedShuffle'

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

describe('weightedShuffle', () => {
  it('returns all the same items, none dropped or duplicated', () => {
    const result = weightedShuffle(items, () => 1)
    expect(result.map(i => i.id).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('does not mutate the input array', () => {
    const copy = [...items]
    weightedShuffle(items, () => 1)
    expect(items).toEqual(copy)
  })

  it('equal weights produce more than one distinct ordering across many trials', () => {
    const orderings = new Set(
      Array.from({ length: 30 }, () => weightedShuffle(items, () => 1).map(i => i.id).join(','))
    )
    expect(orderings.size).toBeGreaterThan(1)
  })

  it('a heavily-weighted item is not first in every single trial (no runaway bias)', () => {
    const weightOf = item => (item.id === 'a' ? 3 : 1)
    const results = Array.from({ length: 40 }, () => weightedShuffle(items, weightOf)[0].id)
    const notAlwaysA = results.some(id => id !== 'a')
    expect(notAlwaysA).toBe(true)
  })

  it('a heavily-weighted item is first more often than an equal-weight item, over many trials', () => {
    const weightOf = item => (item.id === 'a' ? 5 : 1)
    const firstCounts = { a: 0, b: 0, c: 0, d: 0 }
    for (let i = 0; i < 200; i++) {
      firstCounts[weightedShuffle(items, weightOf)[0].id] += 1
    }
    expect(firstCounts.a).toBeGreaterThan(firstCounts.b)
  })
})

describe('weightedShuffle — pinned formula', () => {
  afterEach(() => vi.restoreAllMocks())

  it('key = random ** (1/weight), sorted descending by key', () => {
    // weight=1 for all → key equals the random draw itself; sorted descending
    // by that draw is a deterministic, checkable ordering.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2)  // a
      .mockReturnValueOnce(0.9)  // b
      .mockReturnValueOnce(0.1)  // c
      .mockReturnValueOnce(0.5)  // d
    const result = weightedShuffle(items, () => 1)
    expect(result.map(i => i.id)).toEqual(['b', 'd', 'a', 'c'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/weightedShuffle.test.js`
Expected: FAIL — `Cannot find module '../weightedShuffle'` (or similar import error).

- [ ] **Step 3: Write the implementation**

```js
// src/utils/weightedShuffle.js

// Efraimidis-Spirakis weighted random sampling without replacement: each
// item gets a random key raised to 1/weight, then a plain descending sort
// on that key yields a weighted-random order. With weight=1 for every item
// this reduces to a uniform random permutation (the random draw IS the
// key), which is why callers with no real weight data can pass () => 1 and
// get ordinary shuffle-equivalent behavior.
export default function weightedShuffle(items, weightOf) {
  return items
    .map(item => ({ item, key: Math.random() ** (1 / weightOf(item)) }))
    .sort((a, b) => b.key - a.key)
    .map(({ item }) => item)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/weightedShuffle.test.js`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/weightedShuffle.js src/utils/__tests__/weightedShuffle.test.js
git commit -m "feat(121): add weightedShuffle util for weighted-random item ordering"
```

---

### Task 2: `computeItemWeight` util

**Files:**
- Create: `src/utils/computeItemWeight.js`
- Test: `src/utils/__tests__/computeItemWeight.test.js`

**Interfaces:**
- Consumes: `ItemStat = { missCount: number, lastMissedAt: number }` (epoch ms)
- Produces: `export default function computeItemWeight(stats, itemId, now = Date.now())` — `stats` is `{ [itemId]: ItemStat }`. Returns a number >= 1, capped at 3.

- [ ] **Step 1: Write the failing tests**

```js
// src/utils/__tests__/computeItemWeight.test.js
import { describe, it, expect } from 'vitest'
import computeItemWeight from '../computeItemWeight'

const DAY_MS = 24 * 60 * 60 * 1000

describe('computeItemWeight', () => {
  it('returns 1 for an item with no recorded stat', () => {
    expect(computeItemWeight({}, 'unseen')).toBe(1)
  })

  it('returns more than 1 for an item missed very recently', () => {
    const now = Date.now()
    const stats = { dog: { missCount: 1, lastMissedAt: now } }
    expect(computeItemWeight(stats, 'dog', now)).toBeGreaterThan(1)
  })

  it('decays back toward 1 the longer ago the last miss was', () => {
    const now = Date.now()
    const recent = computeItemWeight({ dog: { missCount: 3, lastMissedAt: now - 1 * DAY_MS } }, 'dog', now)
    const old = computeItemWeight({ dog: { missCount: 3, lastMissedAt: now - 60 * DAY_MS } }, 'dog', now)
    expect(old).toBeLessThan(recent)
    expect(old).toBeCloseTo(1, 1)
  })

  it('never exceeds the 3x cap no matter how large missCount is', () => {
    const now = Date.now()
    const stats = { dog: { missCount: 1000, lastMissedAt: now } }
    expect(computeItemWeight(stats, 'dog', now)).toBeLessThanOrEqual(3)
  })

  it('a single fresh miss on a large historical count still hits the cap (documented trade-off)', () => {
    const now = Date.now()
    const stats = { dog: { missCount: 50, lastMissedAt: now } }
    expect(computeItemWeight(stats, 'dog', now)).toBe(3)
  })

  it('a very old, small miss count decays close to baseline', () => {
    const now = Date.now()
    const stats = { dog: { missCount: 1, lastMissedAt: now - 90 * DAY_MS } }
    expect(computeItemWeight(stats, 'dog', now)).toBeCloseTo(1, 2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/computeItemWeight.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// src/utils/computeItemWeight.js

const DECAY_HALF_LIFE_DAYS = 14
const MAX_EFFECTIVE_MISSES = 4
const BOOST_PER_MISS = 0.5
const DAY_MS = 24 * 60 * 60 * 1000

// Lazy, read-time decay from the single most recent miss: the whole
// accumulated missCount fades together the longer it's been since the item
// was last missed, rather than tracking (and decaying) individual miss
// events. See the design spec's "Trade-off, stated explicitly" section for
// why this simplification was chosen over per-event decay.
export default function computeItemWeight(stats, itemId, now = Date.now()) {
  const stat = stats[itemId]
  if (!stat) return 1

  const daysSince = (now - stat.lastMissedAt) / DAY_MS
  const decay = 0.5 ** (daysSince / DECAY_HALF_LIFE_DAYS)
  const effectiveMisses = Math.min(stat.missCount * decay, MAX_EFFECTIVE_MISSES)
  return 1 + effectiveMisses * BOOST_PER_MISS
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/computeItemWeight.test.js`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/computeItemWeight.js src/utils/__tests__/computeItemWeight.test.js
git commit -m "feat(121): add computeItemWeight util for decayed, capped miss weighting"
```

---

### Task 3: Wire optional weighting into `buildQueue`

**Files:**
- Modify: `src/utils/buildQueue.js`
- Modify: `src/utils/__tests__/buildQueue.test.js` (add new cases only — do not change existing ones)

**Interfaces:**
- Consumes: `weightedShuffle` from Task 1 (`src/utils/weightedShuffle.js`)
- Produces: `export default function buildQueue(items, numChoices, questionsPerSession, itemWeights)` — `itemWeights` is optional, `(item) => number`. When omitted/falsy, behavior is unchanged from today.

- [ ] **Step 1: Write the failing tests (append to the existing file)**

Add this new `describe` block at the end of `src/utils/__tests__/buildQueue.test.js` (after the existing `'buildQueue — pinned shuffle formula'` block, do not touch anything above it):

```js
describe('buildQueue — itemWeights', () => {
  it('omitting itemWeights behaves identically to today (regression guard)', () => {
    const queue = buildQueue(items, 2, 8)
    expect(queue).toHaveLength(8)
  })

  it('a heavily-weighted item appears more often than an equal-weight item across many sessions', () => {
    const itemWeights = item => (item.id === 'a' ? 5 : 1)
    const counts = { a: 0, b: 0, c: 0, d: 0 }
    for (let i = 0; i < 100; i++) {
      const queue = buildQueue(items, 2, 2, itemWeights) // 2 of 4 items per session
      for (const entry of queue) counts[entry.correct.id] += 1
    }
    expect(counts.a).toBeGreaterThan(counts.b)
  })

  it('weighting never creates more occurrences of one item in a session than the existing multi-pass ceiling allows', () => {
    const itemWeights = item => (item.id === 'a' ? 5 : 1)
    // 4 items, 9 questions -> ceil(9/4) = 3 is the existing structural ceiling
    for (let i = 0; i < 20; i++) {
      const queue = buildQueue(items, 2, 9, itemWeights)
      const counts = {}
      for (const entry of queue) counts[entry.correct.id] = (counts[entry.correct.id] || 0) + 1
      expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(3)
    }
  })

  it('still never repeats the same item on two consecutive questions with weighting applied', () => {
    const itemWeights = item => (item.id === 'a' ? 5 : 1)
    const queue = buildQueue(items, 2, 40, itemWeights)
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i].correct.id).not.toBe(queue[i - 1].correct.id)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/utils/__tests__/buildQueue.test.js`
Expected: the 4 new tests FAIL (weighting has no effect yet — `itemWeights` param doesn't exist); all pre-existing tests still PASS.

- [ ] **Step 3: Modify the implementation**

Modify `src/utils/buildQueue.js`. Current relevant section (lines 13–46, `buildCorrectSequence`) uses `shuffle(items)` on line 26. Change the function signature and that one call site:

```js
import weightedShuffle from './weightedShuffle'

function buildCorrectSequence(items, questionsPerSession, itemWeights) {
  if (items.length === 0 || questionsPerSession <= 0) return []

  const sequence = []
  let lastId = null

  while (sequence.length < questionsPerSession) {
    const pass = itemWeights ? weightedShuffle(items, itemWeights) : shuffle(items)

    if (items.length > 1 && pass[0].id === lastId) {
      const swapIndex = pass.findIndex(item => item.id !== lastId)
      ;[pass[0], pass[swapIndex]] = [pass[swapIndex], pass[0]]
    }

    for (const item of pass) {
      if (sequence.length >= questionsPerSession) break
      sequence.push(item)
      lastId = item.id
    }
  }

  return sequence
}

export default function buildQueue(items, numChoices, questionsPerSession, itemWeights) {
  const sequence = buildCorrectSequence(items, questionsPerSession, itemWeights)
  return sequence.map(correct => {
    const wrongPool = items.filter(item => item.id !== correct.id)
    const wrongCount = Math.min(numChoices - 1, wrongPool.length)
    const wrong = shuffle(wrongPool).slice(0, wrongCount)
    return { correct, choices: shuffle([correct, ...wrong]) }
  })
}
```

Keep the existing `shuffle` function (lines 1–11) and the existing Stryker-disable comments on it completely untouched — `shuffle` is still used for the wrong-choice pool and as the no-weights fallback.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/buildQueue.test.js`
Expected: PASS — all pre-existing tests (including the `Math.random`-pinned ones, since they call `buildQueue` without a 4th argument) plus the 4 new tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/buildQueue.js src/utils/__tests__/buildQueue.test.js
git commit -m "feat(121): thread an optional itemWeights function through buildQueue"
```

---

### Task 4: `adaptiveItemSelectionEnabled` setting + adapter item-stats methods

**Files:**
- Modify: `src/storage/adapter.js`
- Modify: `src/storage/localStorageAdapter.js`
- Test: `src/storage/__tests__/localStorageAdapter.itemStats.test.js`

**Interfaces:**
- Produces: `DEFAULT_SETTINGS.adaptiveItemSelectionEnabled = false`; `adapter.getItemStats()` → `Promise<{ [gameId]: { [itemId]: ItemStat } }>`; `adapter.saveItemStats(data)` → `Promise<void>`.

- [ ] **Step 1: Write the failing test**

```js
// src/storage/__tests__/localStorageAdapter.itemStats.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import localStorageAdapter from '../localStorageAdapter'

beforeEach(() => localStorage.clear())

describe('localStorageAdapter — item stats', () => {
  it('returns an empty object when nothing is stored', async () => {
    expect(await localStorageAdapter.getItemStats()).toEqual({})
  })

  it('round-trips saved item stats', async () => {
    const data = { 'animal-sounds': { dog: { missCount: 2, lastMissedAt: 1700000000000 } } }
    await localStorageAdapter.saveItemStats(data)
    expect(await localStorageAdapter.getItemStats()).toEqual(data)
  })

  it('returns an empty object when the stored value is corrupted JSON', async () => {
    localStorage.setItem('playground_item_stats', '{not valid json')
    expect(await localStorageAdapter.getItemStats()).toEqual({})
  })

  it('returns an empty object when the stored value is an array, not an object', async () => {
    localStorage.setItem('playground_item_stats', '[1,2,3]')
    expect(await localStorageAdapter.getItemStats()).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.itemStats.test.js`
Expected: FAIL — `localStorageAdapter.getItemStats is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/storage/adapter.js`, add to `DEFAULT_SETTINGS` (after line 15, `spacedRepetitionEnabled: false,`):

```js
  adaptiveItemSelectionEnabled: false,
```

Add to the JSDoc block, after the `spacedRepetitionEnabled` documentation line (find the line documenting settings shape, add alongside it):

```
 *   adaptiveItemSelectionEnabled: boolean — when true, future sessions' queues are weighted toward
 *     items missed in *previous* sessions (decayed by recency, capped at 3x baseline). Independent of
 *     spacedRepetitionEnabled, which only reinserts a missed item within the *same* session. (added v0.35.0)
```

Add a new JSDoc section after the Badge adapter methods documentation, at the end of the file:

```
 *
 * Item-stats adapter methods (added v0.35.0, for cross-session adaptive item selection):
 * getItemStats()      → Promise<{ [gameId]: { [itemId]: { missCount: number, lastMissedAt: number } } }>
 * saveItemStats(data) → Promise<void>
 */
```

In `src/storage/localStorageAdapter.js`, add a new key constant (after line 7, `const BADGES_KEY = 'playground_badges'`):

```js
const ITEM_STATS_KEY = 'playground_item_stats'
```

Add new methods to the `localStorageAdapter` object, after `saveBadgeData` (before the closing `}` of the object):

```js
  async getItemStats() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ITEM_STATS_KEY) || '{}')
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  },

  async saveItemStats(data) {
    localStorage.setItem(ITEM_STATS_KEY, JSON.stringify(data))
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.itemStats.test.js`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — no existing test reads `DEFAULT_SETTINGS` by exact key enumeration in a way a new key would break (confirm by checking output; if any settings-shape snapshot test fails, update it to include the new key).

- [ ] **Step 6: Commit**

```bash
git add src/storage/adapter.js src/storage/localStorageAdapter.js src/storage/__tests__/localStorageAdapter.itemStats.test.js
git commit -m "feat(121): add adaptiveItemSelectionEnabled setting and item-stats adapter methods"
```

---

### Task 5: `useItemStats` hook

**Files:**
- Create: `src/hooks/useItemStats.js`
- Test: `src/hooks/__tests__/useItemStats.test.js`

**Interfaces:**
- Consumes: `adapter.getItemStats()` / `adapter.saveItemStats(data)` from Task 4.
- Produces: `export default function useItemStats(gameId)` → `{ itemStats: { [itemId]: ItemStat }, recordMisses: (missedItemIds: string[]) => Promise<void> }`.

- [ ] **Step 1: Write the failing test**

```js
// src/hooks/__tests__/useItemStats.test.js
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetItemStats, mockSaveItemStats } = vi.hoisted(() => ({
  mockGetItemStats: vi.fn(),
  mockSaveItemStats: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../storage/index', () => ({
  default: {
    getItemStats: mockGetItemStats,
    saveItemStats: mockSaveItemStats,
  },
}))

import useItemStats from '../useItemStats'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetItemStats.mockResolvedValue({
    'animal-sounds': { dog: { missCount: 1, lastMissedAt: 1700000000000 } },
  })
})

describe('useItemStats', () => {
  it('loads the stored stats for the given gameId', async () => {
    const { result } = renderHook(() => useItemStats('animal-sounds'))
    await waitFor(() => expect(result.current.itemStats).toEqual({
      dog: { missCount: 1, lastMissedAt: 1700000000000 },
    }))
  })

  it('defaults to an empty object when no stats exist for the gameId', async () => {
    const { result } = renderHook(() => useItemStats('color-match'))
    await waitFor(() => expect(mockGetItemStats).toHaveBeenCalled())
    expect(result.current.itemStats).toEqual({})
  })

  it('recordMisses increments missCount and updates lastMissedAt for each missed item', async () => {
    const { result } = renderHook(() => useItemStats('animal-sounds'))
    await waitFor(() => expect(Object.keys(result.current.itemStats)).toContain('dog'))

    await act(async () => { await result.current.recordMisses(['dog', 'cat']) })

    expect(result.current.itemStats.dog.missCount).toBe(2)
    expect(result.current.itemStats.cat.missCount).toBe(1)
    expect(mockSaveItemStats).toHaveBeenCalledWith(
      expect.objectContaining({
        'animal-sounds': expect.objectContaining({
          dog: expect.objectContaining({ missCount: 2 }),
          cat: expect.objectContaining({ missCount: 1 }),
        }),
      })
    )
  })

  it('recordMisses with an empty list is a no-op — no save call', async () => {
    const { result } = renderHook(() => useItemStats('animal-sounds'))
    await waitFor(() => expect(Object.keys(result.current.itemStats)).toContain('dog'))

    await act(async () => { await result.current.recordMisses([]) })

    expect(mockSaveItemStats).not.toHaveBeenCalled()
  })

  it('keeps separate stats per gameId', async () => {
    const { result: animalResult } = renderHook(() => useItemStats('animal-sounds'))
    const { result: colorResult } = renderHook(() => useItemStats('color-match'))
    await waitFor(() => expect(Object.keys(animalResult.current.itemStats)).toContain('dog'))

    await act(async () => { await colorResult.current.recordMisses(['red']) })

    expect(mockSaveItemStats).toHaveBeenCalledWith(
      expect.objectContaining({
        'animal-sounds': expect.objectContaining({ dog: expect.objectContaining({ missCount: 1 }) }),
        'color-match': expect.objectContaining({ red: expect.objectContaining({ missCount: 1 }) }),
      })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useItemStats.test.js`
Expected: FAIL — `Cannot find module '../useItemStats'`.

- [ ] **Step 3: Write the implementation**

```js
// src/hooks/useItemStats.js
import { useState, useEffect, useRef } from 'react'
import adapter from '../storage/index'

export default function useItemStats(gameId) {
  const [itemStats, setItemStats] = useState({})
  const allStatsRef = useRef({})

  useEffect(() => {
    adapter.getItemStats().then(all => {
      allStatsRef.current = all
      setItemStats(all[gameId] ?? {})
    })
  }, [gameId])

  async function recordMisses(missedItemIds) {
    if (missedItemIds.length === 0) return

    const now = Date.now()
    const current = allStatsRef.current[gameId] ?? {}
    const updated = { ...current }
    for (const id of missedItemIds) {
      const prevCount = updated[id]?.missCount ?? 0
      updated[id] = { missCount: prevCount + 1, lastMissedAt: now }
    }

    const nextAll = { ...allStatsRef.current, [gameId]: updated }
    allStatsRef.current = nextAll
    setItemStats(updated)
    await adapter.saveItemStats(nextAll)
  }

  return { itemStats, recordMisses }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useItemStats.test.js`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useItemStats.js src/hooks/__tests__/useItemStats.test.js
git commit -m "feat(121): add useItemStats hook for per-game miss-history tracking"
```

---

### Task 6: Wire `useItemStats` into `useGameSession`

**Files:**
- Modify: `src/hooks/useGameSession.js`
- Modify: `src/hooks/__tests__/useGameSession.test.js` (add new cases only)

**Interfaces:**
- Consumes: `useItemStats` (Task 5), `computeItemWeight` (Task 2), `buildQueue`'s new 4th param (Task 3), `settings.adaptiveItemSelectionEnabled` (Task 4).

- [ ] **Step 1: Write the failing tests**

Add to `src/hooks/__tests__/useGameSession.test.js`: first, add the mock for the new hook near the other `vi.mock` calls (after the `useBadges` mock, before the `confetti` mock):

```js
const mockRecordMisses = vi.fn().mockResolvedValue(undefined)
let mockItemStats = {}

vi.mock('../useItemStats', () => ({
  default: () => ({ itemStats: mockItemStats, recordMisses: mockRecordMisses }),
}))
```

Add `mockItemStats = {}` to the top of the existing `beforeEach` block (alongside the existing `mockSettings = {...}` reset), and add `adaptiveItemSelectionEnabled: false` to both places `mockSettings` is defined (the `let mockSettings = {...}` at module scope and the reset inside `beforeEach`) so it matches the real settings shape.

Then add this new `describe` block at the end of the file:

```js
describe('useGameSession — adaptive item selection', () => {
  it('calls recordMisses with the ids of items missed this session, on finish', async () => {
    setSettings({ questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const wrongItem = result.current.current.choices.find(c => c.id !== result.current.current.correct.id)
    const missedId = result.current.current.correct.id
    await act(async () => { result.current.handleChoice(wrongItem) })
    await act(async () => { result.current.advance() })
    await act(async () => { result.current.handleChoice(result.current.current.correct) })
    await act(async () => { result.current.advance() })

    expect(mockRecordMisses).toHaveBeenCalledWith([missedId])
  })

  it('calls recordMisses with an empty array when nothing was missed', async () => {
    setSettings({ questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(mockRecordMisses).toHaveBeenCalledWith([])
  })

  it('does not throw and builds a full queue when adaptiveItemSelectionEnabled is on with existing stats', async () => {
    mockItemStats = { a: { missCount: 3, lastMissedAt: Date.now() } }
    setSettings({ adaptiveItemSelectionEnabled: true, questionsPerSession: 4 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(4))
  })

  it('builds an identical-shaped queue when adaptiveItemSelectionEnabled is off, regardless of stats', async () => {
    mockItemStats = { a: { missCount: 3, lastMissedAt: Date.now() } }
    setSettings({ adaptiveItemSelectionEnabled: false, questionsPerSession: 4 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(4))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: the 4 new tests FAIL (`recordMisses` never called — hook not wired yet); pre-existing tests still PASS.

- [ ] **Step 3: Modify the implementation**

In `src/hooks/useGameSession.js`:

Add the import (after the existing `usePersonalBest`/`useBadges` imports, near line 6-7):

```js
import useItemStats from './useItemStats'
import computeItemWeight from '../utils/computeItemWeight'
```

Add the hook call (after the existing `useBadges` call, near line 28):

```js
  const { itemStats, recordMisses } = useItemStats(gameId)
```

Destructure the new setting alongside the others (in the existing destructure block, lines 32-36 — add `adaptiveItemSelectionEnabled` to the list):

```js
  const {
    numChoices, feedbackMode, questionsPerSession, animationsEnabled,
    timerMode, timeLimitSeconds, maxTries, hintsEnabled, hintAfterWrongTaps,
    retryCountsAsStreak, spacedRepetitionEnabled, difficultyAutoProgressionEnabled,
    speedRecordMinAccuracy, soundEffectsEnabled, adaptiveItemSelectionEnabled,
  } = settings
```

Add an `itemStatsRef` mirror (alongside the other refs, near line 65-79 — add one new line):

```js
  const itemStatsRef     = useRef({})
```

Add an effect to keep it current (place it right after the existing intro-init effect, before the queue-build effect at line 98):

```js
  useEffect(() => { itemStatsRef.current = itemStats }, [itemStats])
```

Add a helper function (place it near the top of the function body, e.g. right before the queue-build effect):

```js
  function selectionWeightFn() {
    return adaptiveItemSelectionEnabled ? id => computeItemWeight(itemStatsRef.current, id) : null
  }
```

Modify the existing queue-build effect (lines 98-104) to pass the weight function:

```js
  useEffect(() => {
    if (numChoices && questionsPerSession) {
      const q = buildQueue(items, numChoices, questionsPerSession, selectionWeightFn())
      queueRef.current = q
      setQueue(q)
    }
  }, [numChoices, questionsPerSession, items, adaptiveItemSelectionEnabled])
```

(Note: `adaptiveItemSelectionEnabled` is added to the dependency array so toggling the setting mid-session rebuilds the queue with the new weighting mode — matching how this effect already rebuilds on other settings changes today.)

Modify `restart()` (currently lines 354-385) to use the same helper — find the line `const q = buildQueue(items, numChoices, questionsPerSession)` inside `restart()` and change it to:

```js
    const q = buildQueue(items, numChoices, questionsPerSession, selectionWeightFn())
```

Modify `finishGame()` (currently lines 314-343) to call `recordMisses`. Add this line immediately after the existing `await addScore(result)` call:

```js
    await recordMisses(missedRef.current.map(m => m.id))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: PASS — all pre-existing tests plus the 4 new ones.

- [ ] **Step 5: Update the five quiz-game test files that render the real `useGameSession` hook**

Each of these files mocks every one of `useGameSession`'s collaborator hooks individually (`useSettings`, `useScores`, `useBestStreak`, `usePersonalBest`, `useBadges`) so no test touches real storage — `useItemStats` is a new collaborator and needs the same treatment, or these files will fail (undefined `recordMisses`, or `buildQueue` receiving stats it doesn't expect). In each file below, add this block immediately after the existing `vi.mock('../../../hooks/useBadges', ...)` block:

```js
vi.mock('../../../hooks/useItemStats', () => ({
  default: () => ({ itemStats: {}, recordMisses: vi.fn().mockResolvedValue(undefined) }),
}))
```

Files to update (identical block, identical relative path, in each):
- `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`
- `src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`
- `src/games/character-match/__tests__/CharacterMatchGame.test.jsx`
- `src/games/character-match-bluey/__tests__/CharacterMatchGameBluey.test.jsx`
- `src/games/color-match/__tests__/ColorMatchGame.test.jsx`

Also add `adaptiveItemSelectionEnabled: false` to each file's `mockSettings` object (alongside the existing `spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false,` line), so the settings shape these tests pass through matches the real `DEFAULT_SETTINGS` shape.

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — the five updated game test files plus everything else.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useGameSession.js src/hooks/__tests__/useGameSession.test.js \
  src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx \
  src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx \
  src/games/character-match/__tests__/CharacterMatchGame.test.jsx \
  src/games/character-match-bluey/__tests__/CharacterMatchGameBluey.test.jsx \
  src/games/color-match/__tests__/ColorMatchGame.test.jsx
git commit -m "feat(121): wire cross-session item weighting into useGameSession"
```

---

### Task 7: Admin toggle + i18n strings

**Files:**
- Modify: `src/admin/AdminPage.jsx`
- Modify: `src/i18n/en.json`
- Modify: `src/admin/__tests__/AdminPage.test.jsx`

**Interfaces:**
- Consumes: `settings.adaptiveItemSelectionEnabled`, `updateSetting('adaptiveItemSelectionEnabled', boolean)` (both already available via the existing `useSettings` wiring `AdminPage.jsx` already has).

- [ ] **Step 1: Write the failing test**

Add `adaptiveItemSelectionEnabled: false` to `mockSettingsDefaults` in `src/admin/__tests__/AdminPage.test.jsx` (the object at the top of the file, alongside `spacedRepetitionEnabled: false`).

Add this test near the existing spaced-repetition toggle test (after the test containing `expect(mockUpdateSetting).toHaveBeenCalledWith('spacedRepetitionEnabled', true)`):

```js
  it('renders the adaptive item selection toggle and calls updateSetting when turned on', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const section = screen.getByText(/adaptive item selection/i).closest('.admin__section')
    const { getByRole } = within(section)
    await userEvent.click(getByRole('button', { name: /^on$/i }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('adaptiveItemSelectionEnabled', true)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx`
Expected: FAIL — `screen.getByText(/adaptive item selection/i)` finds nothing.

- [ ] **Step 3: Write the implementation**

In `src/i18n/en.json`, add after the `"spacedRepetitionOff": "Off",` line (line 159):

```json
    "adaptiveItemSelectionHeading": "Adaptive Item Selection",
    "adaptiveItemSelectionOn": "On",
    "adaptiveItemSelectionOff": "Off",
```

In `src/admin/AdminPage.jsx`, add a new `admin__section` block immediately after the spaced-repetition section (after line 414's closing `</div>`, before the difficulty-auto-progression section at line 416):

```jsx
            <div className="admin__section">
              <h3>{t('admin.adaptiveItemSelectionHeading')}</h3>
              <div className="admin__toggle">
                <button
                  className={`admin__toggle-btn${settings.adaptiveItemSelectionEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('adaptiveItemSelectionEnabled', true)}
                >
                  {t('admin.adaptiveItemSelectionOn')}
                </button>
                <button
                  className={`admin__toggle-btn${!settings.adaptiveItemSelectionEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('adaptiveItemSelectionEnabled', false)}
                >
                  {t('admin.adaptiveItemSelectionOff')}
                </button>
              </div>
            </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx`
Expected: PASS — including the pre-existing a11y test (`has no accessibility violations`), since this new section follows the exact same accessible toggle-button pattern already in use.

- [ ] **Step 5: Commit**

```bash
git add src/admin/AdminPage.jsx src/i18n/en.json src/admin/__tests__/AdminPage.test.jsx
git commit -m "feat(121): add Admin toggle for adaptive item selection"
```

---

### Task 8: Docs — README, CHANGELOG, ENHANCEMENTS, version bump

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/ENHANCEMENTS.md`
- Modify: `package.json`

- [ ] **Step 1: Update `README.md`**

Add a new row to the settings table (after line 319, `| Spaced repetition | Off | On, Off |`):

```
| Adaptive item selection | Off | On, Off |
```

Add a new paragraph after the "Spaced repetition" prose paragraph (after line 347):

```
**Adaptive item selection** — when on, future sessions weight their queue toward items your child has missed before (weighted more heavily the more recently they were missed), on top of — and independent from — same-session spaced repetition.
```

- [ ] **Step 2: Update `package.json`**

Change `"version": "0.34.1"` to `"version": "0.35.0"`.

- [ ] **Step 3: Update `CHANGELOG.md`**

Add a new section at the top, above the existing `## [0.34.1] - 2026-07-24` entry:

```markdown
## [0.35.0] - 2026-07-24

### Added

- Cross-session adaptive item selection (issue #121): a new `adaptiveItemSelectionEnabled` setting (default off, independent of `spacedRepetitionEnabled`) weights future sessions' queues toward items a child has missed in *previous* sessions. Per-item miss history (`missCount`, `lastMissedAt`) is tracked unconditionally after every session via a new `useItemStats` hook and adapter methods (`getItemStats`/`saveItemStats`); when the setting is on, `buildQueue` uses a new weighted-random ordering (`weightedShuffle`, Efraimidis-Spirakis sampling) instead of a plain shuffle, with weight decaying by recency (14-day half-life) and capped at 3x a fresh item's baseline so no single hard item can dominate a session. Omitting the new `buildQueue` parameter — every existing call site, and the setting-off path — is byte-for-byte identical to prior behavior.
```

- [ ] **Step 4: Update `docs/ENHANCEMENTS.md`**

Remove this line (in the "Game Features" section):

```
- **Cross-session adaptive item selection** — weight item queues toward items missed in *previous* sessions; today's spaced repetition (v0.6.0) only re-asks within the same session, so a consistently confused item gets no long-term reinforcement.
```

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md docs/ENHANCEMENTS.md package.json
git commit -m "docs(121): changelog, README, and enhancements-backlog updates for adaptive item selection"
```

---

### Task 9: Full verification pass

- [ ] **Step 1: Run the full unit/component suite**

Run: `npx vitest run --coverage`
Expected: PASS, no coverage regressions on touched files.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS. (If `storybook-static/` exists in the working tree from a prior local build, remove it first — its build output causes spurious lint failures unrelated to this change.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS, no errors.

- [ ] **Step 4: e2e / a11y (best-effort — this feature has no new user-facing screen, only an Admin toggle already covered by unit tests)**

Run: `npm run e2e`
Expected: PASS, no regressions to existing Admin or quiz-game specs.

- [ ] **Step 5: Final commit if anything needed fixing**

If any step above required a fix, commit it separately with a message describing what was fixed (e.g. `fix(121): ...`).
