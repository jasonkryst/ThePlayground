# Animal Memory Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Animal Memory Match game (issue #37) and the memory game *type* it requires: an engine session hook, a generic board component, fireworks, per-game badge catalogs, two new settings, and a grouped admin settings page.

**Architecture:** A new `useMemorySession` hook + `MemoryBoard` component form the engine layer for pair-matching games (parallel to `useGameSession` + `GameChoiceGrid` for quizzes). The game folder `src/games/animal-memory-match/` is thin (manifest, data, i18n, badges, wiring) and is auto-discovered like every other game. The badge engine gains per-game catalogs auto-discovered from `games/*/badges.js` with **full-replacement** semantics.

**Tech Stack:** React 18 + Vite, Vitest + React Testing Library + jsdom, Playwright (+ @axe-core/playwright), canvas-confetti, i18next, Storybook.

**Spec:** `docs/superpowers/specs/2026-07-09-animal-memory-match-design.md` — read it before starting.

## Global Constraints

- Repo conventions (CLAUDE.md): tests with timed feedback use `vi.useFakeTimers()` + `fireEvent`, never `userEvent` with fake timers. Hook tests mock `src/storage/index` via `vi.mock()` + `vi.hoisted()`. Colors via CSS custom properties (`var(--color-*)`), never hardcoded hex in game CSS.
- Game id is exactly `animal-memory-match`; i18n namespace is exactly `animalMemoryMatch` (top-level key collision with any other game's namespace throws at startup).
- All user-visible strings via i18next — no literals in JSX.
- New score-record fields are additive; `score`/`total` keep their existing meaning (`score = total = pairs`).
- Settings keys: `memoryPairs` (default `5`, allowed 3–6), `soundEffectsEnabled` (default `true`).
- Mismatch flip-back delay: `MISMATCH_DELAY_MS = 1200`. Delay before results screen after final match: `COMPLETE_DELAY_MS = 2000`.
- Run a single test file with: `npx vitest run <path>`. Full suite: `npm run coverage`. Lint: `npm run lint`.
- Commit after every task (each task ends with a commit step).

---

### Task 1: `buildDeck` utility

**Files:**
- Create: `src/utils/buildDeck.js`
- Test: `src/utils/__tests__/buildDeck.test.js`

**Interfaces:**
- Produces: `buildDeck(items, pairs)` → `Array<{ tileId: string, itemId: string }>` — shuffled, each chosen item appearing exactly twice (`tileId` = `${itemId}-a` / `${itemId}-b`). Throws `Error` when `pairs < 1`; clamps + `console.warn` when the pool is smaller than `pairs`. Consumed by Task 6 (`useMemorySession`).

- [ ] **Step 1: Write the failing test**

```js
// src/utils/__tests__/buildDeck.test.js
import { describe, it, expect, vi, afterEach } from 'vitest'
import buildDeck from '../buildDeck'

const ITEMS = [
  { id: 'dog' }, { id: 'cat' }, { id: 'cow' },
  { id: 'duck' }, { id: 'frog' }, { id: 'lion' },
]

afterEach(() => vi.restoreAllMocks())

describe('buildDeck', () => {
  it('returns 2×pairs tiles with each chosen item appearing exactly twice', () => {
    const deck = buildDeck(ITEMS, 5)
    expect(deck).toHaveLength(10)
    const counts = {}
    for (const tile of deck) counts[tile.itemId] = (counts[tile.itemId] ?? 0) + 1
    expect(Object.keys(counts)).toHaveLength(5)
    for (const c of Object.values(counts)) expect(c).toBe(2)
  })

  it('gives every tile a unique tileId derived from its itemId', () => {
    const deck = buildDeck(ITEMS, 3)
    const ids = deck.map(t => t.tileId)
    expect(new Set(ids).size).toBe(6)
    for (const tile of deck) expect(tile.tileId).toMatch(new RegExp(`^${tile.itemId}-(a|b)$`))
  })

  it('shuffles: 25 runs produce more than one distinct ordering', () => {
    const orderings = new Set(
      Array.from({ length: 25 }, () => buildDeck(ITEMS, 5).map(t => t.tileId).join(','))
    )
    expect(orderings.size).toBeGreaterThan(1)
  })

  it('clamps to the pool size and warns when pairs exceeds the pool', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const deck = buildDeck(ITEMS.slice(0, 2), 5)
    expect(deck).toHaveLength(4)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('throws when pairs < 1', () => {
    expect(() => buildDeck(ITEMS, 0)).toThrow(/pairs/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/buildDeck.test.js`
Expected: FAIL — cannot resolve `../buildDeck`.

- [ ] **Step 3: Write the implementation**

```js
// src/utils/buildDeck.js
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function buildDeck(items, pairs) {
  if (pairs < 1) throw new Error(`buildDeck: pairs must be >= 1, got ${pairs}`)
  if (items.length < pairs) {
    console.warn(`buildDeck: requested ${pairs} pairs but pool has ${items.length} items; clamping`)
  }
  const chosen = shuffle(items).slice(0, Math.min(pairs, items.length))
  const tiles = chosen.flatMap(item => [
    { tileId: `${item.id}-a`, itemId: item.id },
    { tileId: `${item.id}-b`, itemId: item.id },
  ])
  return shuffle(tiles)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/buildDeck.test.js`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/utils/buildDeck.js src/utils/__tests__/buildDeck.test.js
git commit -m "feat: add buildDeck util for memory game type"
```

---

### Task 2: `fireFireworks` in the confetti lib

**Files:**
- Modify: `src/lib/confetti.js`
- Test: `src/lib/__tests__/confetti.test.js` (append a describe block)

**Interfaces:**
- Produces: `fireFireworks()` — schedules `FIREWORKS_BURSTS` (6) canvas-confetti bursts at `FIREWORKS_INTERVAL_MS` (350 ms) intervals. Exported constants let tests advance fake timers exactly. Consumed by Task 6. Callers gate on `animationsEnabled` (same contract as `fireConfetti`).

- [ ] **Step 1: Write the failing test** — append to `src/lib/__tests__/confetti.test.js` (the file already mocks `canvas-confetti` as `confettiMock` at the top; reuse it):

```js
describe('fireFireworks', () => {
  it('fires the first burst immediately and all bursts within the window', async () => {
    vi.useFakeTimers()
    const { fireFireworks, FIREWORKS_BURSTS, FIREWORKS_INTERVAL_MS } = await import('../confetti')
    fireFireworks()
    vi.advanceTimersByTime(0)
    expect(confettiMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(FIREWORKS_BURSTS * FIREWORKS_INTERVAL_MS)
    expect(confettiMock).toHaveBeenCalledTimes(FIREWORKS_BURSTS)
    vi.useRealTimers()
  })

  it('does not keep firing after the last burst', async () => {
    vi.useFakeTimers()
    const { fireFireworks, FIREWORKS_BURSTS, FIREWORKS_INTERVAL_MS } = await import('../confetti')
    fireFireworks()
    vi.advanceTimersByTime(FIREWORKS_BURSTS * FIREWORKS_INTERVAL_MS * 3)
    expect(confettiMock).toHaveBeenCalledTimes(FIREWORKS_BURSTS)
    vi.useRealTimers()
  })

  it('varies burst origins across the sky', async () => {
    vi.useFakeTimers()
    const { fireFireworks, FIREWORKS_BURSTS, FIREWORKS_INTERVAL_MS } = await import('../confetti')
    fireFireworks()
    vi.advanceTimersByTime(FIREWORKS_BURSTS * FIREWORKS_INTERVAL_MS)
    for (const call of confettiMock.mock.calls) {
      expect(call[0].origin.x).toBeGreaterThanOrEqual(0)
      expect(call[0].origin.x).toBeLessThanOrEqual(1)
      expect(call[0].origin.y).toBeLessThanOrEqual(0.6)
    }
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/confetti.test.js`
Expected: FAIL — `fireFireworks` is not exported.

- [ ] **Step 3: Implement** — append to `src/lib/confetti.js`:

```js
export const FIREWORKS_BURSTS = 6
export const FIREWORKS_INTERVAL_MS = 350

export function fireFireworks() {
  for (let i = 0; i < FIREWORKS_BURSTS; i++) {
    setTimeout(() => {
      confetti({
        particleCount: 120,
        spread: 100,
        startVelocity: 45,
        origin: { x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.3 },
      })
    }, i * FIREWORKS_INTERVAL_MS)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/confetti.test.js`
Expected: all pass (existing `fireConfetti` tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/confetti.js src/lib/__tests__/confetti.test.js
git commit -m "feat: add fireFireworks multi-burst finale to confetti lib"
```

---

### Task 3: Badge engine — per-game catalogs + game-badge award computation

**Files:**
- Modify: `src/lib/badges.js`
- Create: `src/utils/computeGameBadgeAwards.js`
- Test: `src/lib/__tests__/badges.test.js` (append), `src/utils/__tests__/computeGameBadgeAwards.test.js`

**Interfaces:**
- Produces:
  - `buildGameBadgeCatalogs(modules)` → `{ [gameId]: catalogArray }` (pure; `modules` keyed by glob path like `'../games/animal-memory-match/badges.js'`).
  - `GAME_BADGE_CATALOGS` — the result of running the builder over `import.meta.glob('../games/*/badges.js', { eager: true })`.
  - `getBadgesForGame(gameId)` → the game's own catalog, else global `BADGE_CATALOG` (full replacement, no merge).
  - `computeGameBadgeAwards({ catalog, sessionStats, prevCounters, nextCounters })` → `string[]` of earned badge ids. Session entries: `{ kind: 'session', earned: (stats) => boolean }`. Lifetime entries: `{ kind: 'lifetime', counter: string, tier: number }`, awarded when `prev < tier <= next`.
- Consumed by: Task 4 (`useBadges`), Task 9 (`BadgeGallery`), Task 8 (the game's `badges.js` conforms to these entry shapes).

- [ ] **Step 1: Write the failing tests**

```js
// src/utils/__tests__/computeGameBadgeAwards.test.js
import { describe, it, expect } from 'vitest'
import computeGameBadgeAwards from '../computeGameBadgeAwards'

const CATALOG = [
  { id: 'sharpMind', kind: 'session', earned: s => s.flipAttempts <= s.pairs + 2 },
  { id: 'matchStreak', kind: 'session', earned: s => s.peakMatchStreak >= 3 },
  { id: 'pairSpotter', kind: 'lifetime', counter: 'pairsMatched', tier: 25 },
  { id: 'pairPro', kind: 'lifetime', counter: 'pairsMatched', tier: 100 },
]

describe('computeGameBadgeAwards', () => {
  it('awards a session badge whose predicate passes', () => {
    const earned = computeGameBadgeAwards({
      catalog: CATALOG,
      sessionStats: { pairs: 5, flipAttempts: 6, peakMatchStreak: 2 },
      prevCounters: {}, nextCounters: { pairsMatched: 5 },
    })
    expect(earned).toEqual(['sharpMind'])
  })

  it('does not award a session badge whose predicate fails', () => {
    const earned = computeGameBadgeAwards({
      catalog: CATALOG,
      sessionStats: { pairs: 5, flipAttempts: 12, peakMatchStreak: 0 },
      prevCounters: {}, nextCounters: { pairsMatched: 5 },
    })
    expect(earned).toEqual([])
  })

  it('awards a lifetime badge when the counter crosses its tier', () => {
    const earned = computeGameBadgeAwards({
      catalog: CATALOG,
      sessionStats: { pairs: 5, flipAttempts: 20, peakMatchStreak: 0 },
      prevCounters: { pairsMatched: 24 }, nextCounters: { pairsMatched: 29 },
    })
    expect(earned).toEqual(['pairSpotter'])
  })

  it('does not re-award a lifetime tier already crossed', () => {
    const earned = computeGameBadgeAwards({
      catalog: CATALOG,
      sessionStats: { pairs: 5, flipAttempts: 20, peakMatchStreak: 0 },
      prevCounters: { pairsMatched: 30 }, nextCounters: { pairsMatched: 35 },
    })
    expect(earned).toEqual([])
  })

  it('treats a counter missing from both maps as zero (no award)', () => {
    const earned = computeGameBadgeAwards({
      catalog: [{ id: 'x', kind: 'lifetime', counter: 'unknownCounter', tier: 1 }],
      sessionStats: {}, prevCounters: {}, nextCounters: {},
    })
    expect(earned).toEqual([])
  })
})
```

Append to `src/lib/__tests__/badges.test.js`:

```js
import { buildGameBadgeCatalogs, getBadgesForGame, GAME_BADGE_CATALOGS } from '../badges'

describe('per-game badge catalogs', () => {
  it('buildGameBadgeCatalogs keys catalogs by the game folder name', () => {
    const fake = [{ id: 'x', kind: 'session', earned: () => true }]
    const catalogs = buildGameBadgeCatalogs({
      '../games/animal-memory-match/badges.js': { default: fake },
    })
    expect(catalogs['animal-memory-match']).toBe(fake)
  })

  it('getBadgesForGame falls back to the global catalog for games without badges.js', () => {
    expect(getBadgesForGame('animal-sounds')).toBe(BADGE_CATALOG)
    expect(getBadgesForGame('no-such-game')).toBe(BADGE_CATALOG)
  })

  it('GAME_BADGE_CATALOGS never contains quiz games (they have no badges.js)', () => {
    expect(GAME_BADGE_CATALOGS['animal-sounds']).toBeUndefined()
    expect(GAME_BADGE_CATALOGS['color-match']).toBeUndefined()
  })
})
```

(Also add `buildGameBadgeCatalogs, getBadgesForGame, GAME_BADGE_CATALOGS` alongside the existing `BADGE_CATALOG` import at the top instead of a second import line.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/computeGameBadgeAwards.test.js src/lib/__tests__/badges.test.js`
Expected: FAIL — modules/exports missing.

- [ ] **Step 3: Implement**

Create `src/utils/computeGameBadgeAwards.js`:

```js
export default function computeGameBadgeAwards({ catalog, sessionStats, prevCounters, nextCounters }) {
  const earned = []
  for (const badge of catalog) {
    if (badge.kind === 'session' && badge.earned(sessionStats)) {
      earned.push(badge.id)
    } else if (badge.kind === 'lifetime') {
      const prev = prevCounters[badge.counter] ?? 0
      const next = nextCounters[badge.counter] ?? 0
      if (prev < badge.tier && next >= badge.tier) earned.push(badge.id)
    }
  }
  return earned
}
```

Append to `src/lib/badges.js`:

```js
export function buildGameBadgeCatalogs(modules) {
  const catalogs = {}
  for (const [path, mod] of Object.entries(modules)) {
    const gameId = path.match(/games\/([^/]+)\//)[1]
    catalogs[gameId] = mod.default ?? mod
  }
  return catalogs
}

// Auto-discovered, like game i18n files: a game ships src/games/<id>/badges.js
// and its catalog fully replaces the global quiz catalog for that game.
export const GAME_BADGE_CATALOGS = buildGameBadgeCatalogs(
  import.meta.glob('../games/*/badges.js', { eager: true })
)

export function getBadgesForGame(gameId) {
  return GAME_BADGE_CATALOGS[gameId] ?? BADGE_CATALOG
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/computeGameBadgeAwards.test.js src/lib/__tests__/badges.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/badges.js src/lib/__tests__/badges.test.js src/utils/computeGameBadgeAwards.js src/utils/__tests__/computeGameBadgeAwards.test.js
git commit -m "feat: per-game badge catalogs with session and lifetime badge kinds"
```

---

### Task 4: `useBadges` extension + `lifetimeCounters` storage

**Files:**
- Modify: `src/hooks/useBadges.js`, `src/storage/localStorageAdapter.js`, `src/storage/adapter.js` (doc comment only)
- Test: `src/hooks/__tests__/useBadges.test.js` (append), `src/storage/__tests__/` — check for an existing adapter test file (`ls src/storage/__tests__`) and append there if present

**Interfaces:**
- Consumes: `GAME_BADGE_CATALOGS`, `computeGameBadgeAwards` (Task 3).
- Produces: `awardSession(gameId, { peakStreak, isPerfect, questionsAnswered, sessionStats, counterIncrements })`. When `GAME_BADGE_CATALOGS[gameId]` exists it runs the game-badge path (counters + predicates); otherwise the existing quiz path, byte-for-byte behavior-compatible. Badge data shape is now `{ awards, lifetimeQuestions, lifetimeCounters }` (all additive). Consumed by Task 6.

- [ ] **Step 1: Write the failing tests** — append to `src/hooks/__tests__/useBadges.test.js`. The file already mocks `../../storage/index`. Game catalogs are real modules discovered by glob, so mock the badges lib for these tests by adding at the top (after the existing storage mock):

```js
vi.mock('../../lib/badges', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    GAME_BADGE_CATALOGS: {
      'memory-test-game': [
        { id: 'sharpMind', icon: '🧠', nameKey: 'x.sharpMind.name', descKey: 'x.sharpMind.desc', kind: 'session', earned: s => s.flipAttempts <= s.pairs + 2 },
        { id: 'pairSpotter', icon: '🐾', nameKey: 'x.pairSpotter.name', descKey: 'x.pairSpotter.desc', kind: 'lifetime', counter: 'pairsMatched', tier: 25 },
      ],
    },
  }
})
```

New describe block:

```js
describe('awardSession for games with their own badge catalog', () => {
  it('awards session and lifetime game badges and persists lifetimeCounters', async () => {
    mockGetBadgeData.mockResolvedValue({ awards: {}, lifetimeQuestions: {}, lifetimeCounters: { 'memory-test-game': { pairsMatched: 22 } } })
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.lifetimeCounters['memory-test-game'].pairsMatched).toBe(22))

    let earned
    await act(async () => {
      earned = await result.current.awardSession('memory-test-game', {
        sessionStats: { pairs: 5, flipAttempts: 7 },
        counterIncrements: { pairsMatched: 5 },
      })
    })

    expect(earned.map(b => b.id)).toEqual(['sharpMind', 'pairSpotter']) // 22 -> 27 crosses 25
    expect(earned[0].icon).toBe('🧠')
    expect(result.current.badgeData.lifetimeCounters['memory-test-game'].pairsMatched).toBe(27)
    expect(result.current.badgeData.awards['memory-test-game']).toEqual({ sharpMind: 1, pairSpotter: 1 })
    expect(mockSaveBadgeData).toHaveBeenCalledWith(
      expect.objectContaining({ lifetimeCounters: { 'memory-test-game': { pairsMatched: 27 } } })
    )
  })

  it('awards nothing when the session is inefficient and no tier is crossed', async () => {
    mockGetBadgeData.mockResolvedValue({ awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} })
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.lifetimeCounters).toEqual({}))

    let earned
    await act(async () => {
      earned = await result.current.awardSession('memory-test-game', {
        sessionStats: { pairs: 5, flipAttempts: 15 },
        counterIncrements: { pairsMatched: 5 },
      })
    })
    expect(earned).toEqual([])
    expect(result.current.badgeData.lifetimeCounters['memory-test-game'].pairsMatched).toBe(5)
  })

  it('does not touch lifetimeQuestions for game-catalog games, nor lifetimeCounters for quiz games', async () => {
    mockGetBadgeData.mockResolvedValue({ awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} })
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.awards).toEqual({}))

    await act(async () => {
      await result.current.awardSession('memory-test-game', { sessionStats: { pairs: 3, flipAttempts: 99 }, counterIncrements: { pairsMatched: 3 } })
      await result.current.awardSession('animal-sounds', { peakStreak: 0, isPerfect: false, questionsAnswered: 10 })
    })

    expect(result.current.badgeData.lifetimeQuestions).toEqual({ 'animal-sounds': 10 })
    expect(result.current.badgeData.lifetimeCounters).toEqual({ 'memory-test-game': { pairsMatched: 3 } })
  })

  it('tolerates stored badge data without a lifetimeCounters key (pre-existing installs)', async () => {
    mockGetBadgeData.mockResolvedValue({ awards: {}, lifetimeQuestions: {} })
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.awards).toEqual({}))

    let earned
    await act(async () => {
      earned = await result.current.awardSession('memory-test-game', {
        sessionStats: { pairs: 5, flipAttempts: 6 },
        counterIncrements: { pairsMatched: 5 },
      })
    })
    expect(earned.map(b => b.id)).toEqual(['sharpMind'])
  })
})
```

Note the existing `beforeEach` sets `mockGetBadgeData` without `lifetimeCounters` — the existing tests must keep passing unchanged; that is itself the backward-compatibility test for the quiz path.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useBadges.test.js`
Expected: new tests FAIL (`lifetimeCounters` undefined); old tests pass.

- [ ] **Step 3: Implement** — replace `src/hooks/useBadges.js` with:

```js
import { useState, useEffect, useRef } from 'react'
import adapter from '../storage/index'
import computeBadgeAwards from '../utils/computeBadgeAwards'
import computeGameBadgeAwards from '../utils/computeGameBadgeAwards'
import { BADGE_CATALOG, GAME_BADGE_CATALOGS } from '../lib/badges'

const EMPTY = { awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} }

export default function useBadges() {
  const [badgeData, setBadgeData] = useState(EMPTY)
  const dataRef = useRef(EMPTY)

  useEffect(() => {
    adapter.getBadgeData().then(data => {
      const normalized = { ...EMPTY, ...data }
      dataRef.current = normalized
      setBadgeData(normalized)
    })
  }, [])

  async function awardSession(gameId, { peakStreak, isPerfect, questionsAnswered, sessionStats, counterIncrements } = {}) {
    const gameCatalog = GAME_BADGE_CATALOGS[gameId]
    let earnedIds
    let nextData

    if (gameCatalog) {
      const prevCounters = dataRef.current.lifetimeCounters?.[gameId] ?? {}
      const nextCounters = { ...prevCounters }
      for (const [counter, inc] of Object.entries(counterIncrements ?? {})) {
        nextCounters[counter] = (nextCounters[counter] ?? 0) + inc
      }
      earnedIds = computeGameBadgeAwards({ catalog: gameCatalog, sessionStats: sessionStats ?? {}, prevCounters, nextCounters })
      nextData = {
        ...dataRef.current,
        lifetimeCounters: { ...(dataRef.current.lifetimeCounters ?? {}), [gameId]: nextCounters },
      }
    } else {
      const prevLifetimeTotal = dataRef.current.lifetimeQuestions[gameId] ?? 0
      const newLifetimeTotal = prevLifetimeTotal + questionsAnswered
      earnedIds = computeBadgeAwards({ peakStreak, isPerfect, prevLifetimeTotal, newLifetimeTotal })
      nextData = {
        ...dataRef.current,
        lifetimeQuestions: { ...dataRef.current.lifetimeQuestions, [gameId]: newLifetimeTotal },
      }
    }

    const gameAwards = { ...(dataRef.current.awards[gameId] ?? {}) }
    for (const id of earnedIds) {
      gameAwards[id] = (gameAwards[id] ?? 0) + 1
    }
    nextData.awards = { ...dataRef.current.awards, [gameId]: gameAwards }

    dataRef.current = nextData
    setBadgeData(nextData)
    await adapter.saveBadgeData(nextData)

    const catalog = gameCatalog ?? BADGE_CATALOG
    return earnedIds.map(id => catalog.find(b => b.id === id))
  }

  return { badgeData, awardSession }
}
```

In `src/storage/localStorageAdapter.js`, extend `getBadgeData` to parse the new key (inside the returned object and the catch fallback):

```js
  async getBadgeData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BADGES_KEY) || '{}')
      const valid = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      return {
        awards: valid && parsed.awards && typeof parsed.awards === 'object' ? parsed.awards : {},
        lifetimeQuestions: valid && parsed.lifetimeQuestions && typeof parsed.lifetimeQuestions === 'object' ? parsed.lifetimeQuestions : {},
        lifetimeCounters: valid && parsed.lifetimeCounters && typeof parsed.lifetimeCounters === 'object' ? parsed.lifetimeCounters : {},
      }
    } catch {
      return { awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} }
    }
  },
```

In `src/storage/adapter.js`, update the badge doc comment line to:

```
 * getBadgeData()  → Promise<{ awards: { [gameId]: { [badgeId]: number } }, lifetimeQuestions: { [gameId]: number }, lifetimeCounters: { [gameId]: { [counter: string]: number } } }>
 *   lifetimeCounters added v0.23.0 for per-game badge catalogs (e.g. pairsMatched for memory games)
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/hooks/__tests__/useBadges.test.js src/storage` — all pass (if `src/storage/__tests__` has a `getBadgeData` test, extend its expected object with `lifetimeCounters: {}`).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBadges.js src/hooks/__tests__/useBadges.test.js src/storage/localStorageAdapter.js src/storage/adapter.js src/storage/__tests__ 2>/dev/null; git commit -m "feat: useBadges supports per-game catalogs via lifetimeCounters"
```

---

### Task 5: New settings defaults + shared sound library

**Files:**
- Modify: `src/storage/adapter.js` (DEFAULT_SETTINGS + doc comment), `src/games/animal-sounds/data/sounds.js`
- Create: `src/lib/soundLibrary.js`
- Move: `src/games/animal-sounds/sounds/*.mp3` → `src/assets/sounds/` (git mv)
- Test: `src/lib/__tests__/soundLibrary.test.js`; existing suites must stay green

**Interfaces:**
- Produces: `DEFAULT_SETTINGS.memoryPairs = 5`, `DEFAULT_SETTINGS.soundEffectsEnabled = true`; `getSoundUrl(filename)` from `src/lib/soundLibrary.js` resolving `src/assets/sounds/<filename>`. `animal-sounds/data/sounds.js` becomes a re-export so its callers/tests are untouched. Consumed by Tasks 6, 8, 10.

- [ ] **Step 1: Move the sound files**

```bash
mkdir -p src/assets/sounds
git mv src/games/animal-sounds/sounds/*.mp3 src/assets/sounds/
```

- [ ] **Step 2: Write the failing test**

```js
// src/lib/__tests__/soundLibrary.test.js
import { describe, it, expect } from 'vitest'
import { getSoundUrl } from '../soundLibrary'

describe('getSoundUrl', () => {
  it('resolves a known sound file to a url', () => {
    expect(getSoundUrl('cow.mp3')).toEqual(expect.any(String))
  })

  it('returns null for an unknown file', () => {
    expect(getSoundUrl('nope.mp3')).toBe(null)
  })
})
```

Run: `npx vitest run src/lib/__tests__/soundLibrary.test.js` — FAIL (module missing).

- [ ] **Step 3: Implement**

```js
// src/lib/soundLibrary.js
// Shared sound assets. Games resolve mp3 urls from src/assets/sounds via this
// single glob so multiple games can reference one copy of each file.
const sounds = import.meta.glob('../assets/sounds/*.mp3', { eager: true, query: '?url', import: 'default' })

export function getSoundUrl(filename) {
  const key = `../assets/sounds/${filename}`
  return sounds[key] ?? null
}
```

Replace the body of `src/games/animal-sounds/data/sounds.js` with a re-export (public API unchanged):

```js
export { getSoundUrl } from '../../../lib/soundLibrary'
```

- [ ] **Step 4: Add the settings keys** — in `src/storage/adapter.js` `DEFAULT_SETTINGS`, after `parentDateRange`:

```js
  memoryPairs: 5,
  soundEffectsEnabled: true,
```

And in the Settings-shape doc comment:

```
 *   memoryPairs: 3 | 4 | 5 | 6 — pairs per board for memory-type games (added v0.23.0)
 *   soundEffectsEnabled: boolean — gates celebratory sound effects (e.g. memory match sound); added v0.23.0
```

- [ ] **Step 5: Run the affected suites**

Run: `npx vitest run src/lib/__tests__/soundLibrary.test.js src/games/animal-sounds src/hooks/__tests__/useSettings.test.js src/storage`
Expected: all pass (animal-sounds' `sounds.test.js` still passes through the re-export).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: shared sound library in src/assets + memoryPairs/soundEffectsEnabled settings"
```

---

### Task 6: `useMemorySession` hook

**Files:**
- Create: `src/hooks/useMemorySession.js`
- Test: `src/hooks/__tests__/useMemorySession.test.js`

**Interfaces:**
- Consumes: `buildDeck` (Task 1), `fireConfetti`/`fireFireworks` (Task 2), `useBadges.awardSession` (Task 4), `memoryPairs`/`soundEffectsEnabled` settings (Task 5), `useSettings`, `useScores`.
- Produces (return object — Task 8's `index.jsx` destructures exactly these):
  `tiles` (`[{ tileId, itemId, state: 'down'|'up'|'matched'|'mismatch' }]`), `flipTile(tileId)`, `locked`, `flipAttempts`, `mismatches`, `matchStreak`, `pairsFound`, `totalPairs`, `done`, `newBadges`, `lastEvent` (`{ seq, type: 'match'|'mismatch'|'complete', itemId }|null`), `currentElapsedMs`, `timerMode`, `animationsEnabled`, `soundEffectsEnabled`, `showIntro`, `introResolved`, `settingsLoaded`, `dontShowAgain`, `setDontShowAgain`, `dismissIntro(flag)`, `restart()`.
  Also exports `MISMATCH_DELAY_MS = 1200` and `COMPLETE_DELAY_MS = 2000`.

- [ ] **Step 1: Write the failing tests**

```js
// src/hooks/__tests__/useMemorySession.test.js
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockAddScore, mockGetSettings } = vi.hoisted(() => ({
  mockAddScore: vi.fn().mockResolvedValue(undefined),
  mockGetSettings: vi.fn(),
}))

vi.mock('../../storage/index', () => ({
  default: {
    getSettings: mockGetSettings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
    getScores: vi.fn().mockResolvedValue([]),
    addScore: mockAddScore,
    getBadgeData: vi.fn().mockResolvedValue({ awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} }),
    saveBadgeData: vi.fn().mockResolvedValue(undefined),
  },
}))

const { mockFireConfetti, mockFireFireworks } = vi.hoisted(() => ({
  mockFireConfetti: vi.fn(),
  mockFireFireworks: vi.fn(),
}))
vi.mock('../../lib/confetti', () => ({
  fireConfetti: mockFireConfetti,
  fireFireworks: mockFireFireworks,
  FIREWORKS_BURSTS: 6,
  FIREWORKS_INTERVAL_MS: 350,
}))

import useMemorySession, { MISMATCH_DELAY_MS, COMPLETE_DELAY_MS } from '../useMemorySession'

const ITEMS = [
  { id: 'dog' }, { id: 'cat' }, { id: 'cow' },
  { id: 'duck' }, { id: 'frog' }, { id: 'lion' },
]

const SETTINGS = {
  memoryPairs: 3, animationsEnabled: true, soundEffectsEnabled: true,
  timerMode: 'countUp', introDismissed: { 'test-memory': true },
}

function findPair(tiles) {
  const down = tiles.filter(t => t.state === 'down')
  for (const t of down) {
    const twin = down.find(o => o.itemId === t.itemId && o.tileId !== t.tileId)
    if (twin) return [t.tileId, twin.tileId]
  }
  return null
}

function findNonPair(tiles) {
  const down = tiles.filter(t => t.state === 'down')
  const a = down[0]
  const b = down.find(t => t.itemId !== a.itemId)
  return [a.tileId, b.tileId]
}

async function renderSession() {
  const hook = renderHook(() => useMemorySession({ gameId: 'test-memory', items: ITEMS }))
  await waitFor(() => expect(hook.result.current.tiles.length).toBe(6))
  return hook
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSettings.mockResolvedValue(SETTINGS)
})
afterEach(() => vi.useRealTimers())

describe('useMemorySession', () => {
  it('builds a deck of 2×memoryPairs face-down tiles', async () => {
    const { result } = await renderSession()
    expect(result.current.totalPairs).toBe(3)
    expect(result.current.tiles.every(t => t.state === 'down')).toBe(true)
  })

  it('matching pair stays revealed, fires confetti, emits a match event', async () => {
    const { result } = await renderSession()
    const [a, b] = findPair(result.current.tiles)
    act(() => result.current.flipTile(a))
    act(() => result.current.flipTile(b))
    const matched = result.current.tiles.filter(t => t.state === 'matched')
    expect(matched.map(t => t.tileId).sort()).toEqual([a, b].sort())
    expect(result.current.pairsFound).toBe(1)
    expect(result.current.matchStreak).toBe(1)
    expect(result.current.flipAttempts).toBe(1)
    expect(mockFireConfetti).toHaveBeenCalledTimes(1)
    expect(result.current.lastEvent.type).toBe('match')
    expect(result.current.lastEvent.itemId).toBe(result.current.tiles.find(t => t.tileId === a).itemId)
  })

  // NOTE: activate fake timers only AFTER renderSession() — its waitFor
  // polls with real timers and can hang if they are already faked.
  it('non-matching pair enters mismatch state then flips back after the delay', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()
    const [a, b] = findNonPair(result.current.tiles)
    act(() => result.current.flipTile(a))
    act(() => result.current.flipTile(b))
    expect(result.current.tiles.filter(t => t.state === 'mismatch')).toHaveLength(2)
    expect(result.current.locked).toBe(true)
    expect(result.current.mismatches).toBe(1)
    expect(result.current.matchStreak).toBe(0)
    expect(result.current.lastEvent.type).toBe('mismatch')

    act(() => { vi.advanceTimersByTime(MISMATCH_DELAY_MS) })
    expect(result.current.tiles.every(t => t.state === 'down')).toBe(true)
    expect(result.current.locked).toBe(false)
  })

  it('ignores taps during the mismatch lock-out', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()
    const [a, b] = findNonPair(result.current.tiles)
    act(() => result.current.flipTile(a))
    act(() => result.current.flipTile(b))
    const third = result.current.tiles.find(t => t.state === 'down')
    act(() => result.current.flipTile(third.tileId))
    expect(result.current.tiles.find(t => t.tileId === third.tileId).state).toBe('down')
    act(() => { vi.advanceTimersByTime(MISMATCH_DELAY_MS) })
  })

  it('ignores tapping the same tile twice and tapping a matched tile', async () => {
    const { result } = await renderSession()
    const [a, b] = findPair(result.current.tiles)
    act(() => result.current.flipTile(a))
    act(() => result.current.flipTile(a)) // same tile again — not a flip attempt
    expect(result.current.flipAttempts).toBe(0)
    act(() => result.current.flipTile(b))
    expect(result.current.flipAttempts).toBe(1)
    act(() => result.current.flipTile(a)) // matched tile — no-op
    expect(result.current.flipAttempts).toBe(1)
    expect(result.current.tiles.find(t => t.tileId === a).state).toBe('matched')
  })

  it('completing all pairs fires fireworks, saves the score record, and awards badges', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()
    for (let i = 0; i < 3; i++) {
      const pair = findPair(result.current.tiles)
      act(() => result.current.flipTile(pair[0]))
      act(() => result.current.flipTile(pair[1]))
      await act(async () => {})
    }
    expect(mockFireFireworks).toHaveBeenCalledTimes(1)
    expect(result.current.lastEvent.type).toBe('complete')
    expect(result.current.done).toBe(false) // results deferred while fireworks play
    act(() => { vi.advanceTimersByTime(COMPLETE_DELAY_MS) })
    expect(result.current.done).toBe(true)
    expect(mockAddScore).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'test-memory', score: 3, total: 3,
      flipAttempts: 3, mismatches: 0, peakMatchStreak: 3,
      durationMs: expect.any(Number),
    }))
  })

  it('does not fire confetti or fireworks when animations are disabled', async () => {
    mockGetSettings.mockResolvedValue({ ...SETTINGS, animationsEnabled: false })
    const { result } = await renderSession()
    vi.useFakeTimers()
    for (let i = 0; i < 3; i++) {
      const pair = findPair(result.current.tiles)
      act(() => result.current.flipTile(pair[0]))
      act(() => result.current.flipTile(pair[1]))
      await act(async () => {})
    }
    expect(mockFireConfetti).not.toHaveBeenCalled()
    expect(mockFireFireworks).not.toHaveBeenCalled()
  })

  it('restart rebuilds the deck and resets all counters', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()
    const [a, b] = findNonPair(result.current.tiles)
    act(() => result.current.flipTile(a))
    act(() => result.current.flipTile(b))
    act(() => { vi.advanceTimersByTime(MISMATCH_DELAY_MS) })
    act(() => result.current.restart())
    expect(result.current.flipAttempts).toBe(0)
    expect(result.current.mismatches).toBe(0)
    expect(result.current.pairsFound).toBe(0)
    expect(result.current.done).toBe(false)
    expect(result.current.tiles.every(t => t.state === 'down')).toBe(true)
  })

  it('shows the intro when not previously dismissed', async () => {
    mockGetSettings.mockResolvedValue({ ...SETTINGS, introDismissed: {} })
    const { result } = renderHook(() => useMemorySession({ gameId: 'test-memory', items: ITEMS }))
    await waitFor(() => expect(result.current.introResolved).toBe(true))
    expect(result.current.showIntro).toBe(true)
    act(() => result.current.dismissIntro(false))
    expect(result.current.showIntro).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useMemorySession.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```js
// src/hooks/useMemorySession.js
import { useState, useEffect, useRef } from 'react'
import useSettings from './useSettings'
import useScores from './useScores'
import useBadges from './useBadges'
import { fireConfetti, fireFireworks } from '../lib/confetti'
import buildDeck from '../utils/buildDeck'

export const MISMATCH_DELAY_MS = 1200
export const COMPLETE_DELAY_MS = 2000

export default function useMemorySession({ gameId, items }) {
  const { settings, loaded, updateSetting } = useSettings()
  const { addScore } = useScores()
  const { awardSession } = useBadges()

  const { memoryPairs, animationsEnabled, soundEffectsEnabled, timerMode } = settings

  const [tiles,            setTiles]            = useState([])
  const [locked,           setLocked]           = useState(false)
  const [flipAttempts,     setFlipAttempts]     = useState(0)
  const [mismatches,       setMismatches]       = useState(0)
  const [matchStreak,      setMatchStreak]      = useState(0)
  const [pairsFound,       setPairsFound]       = useState(0)
  const [done,             setDone]             = useState(false)
  const [lastEvent,        setLastEvent]        = useState(null)
  const [currentElapsedMs, setCurrentElapsedMs] = useState(0)
  const [newBadges,        setNewBadges]        = useState([])
  const [showIntro,        setShowIntro]        = useState(false)
  const [introResolved,    setIntroResolved]    = useState(false)
  const [dontShowAgain,    setDontShowAgain]    = useState(false)

  // Refs avoid stale closures in setTimeout callbacks (same pattern as useGameSession)
  const tilesRef           = useRef([])
  const flippedRef         = useRef([])   // tileIds face-up but unresolved (length 0..1)
  const lockedRef          = useRef(false)
  const doneRef            = useRef(false)
  const flipAttemptsRef    = useRef(0)
  const mismatchesRef      = useRef(0)
  const matchStreakRef     = useRef(0)
  const peakMatchStreakRef = useRef(0)
  const pairsFoundRef      = useRef(0)
  const startRef           = useRef(Date.now())
  const seqRef             = useRef(0)
  const introInitializedRef = useRef(false)

  // Same intro-initialization contract as useGameSession (see its comment).
  useEffect(() => {
    if (!loaded || introInitializedRef.current) return
    introInitializedRef.current = true
    setIntroResolved(true)
    setShowIntro(!settings.introDismissed?.[gameId])
  }, [loaded, settings.introDismissed, gameId])

  useEffect(() => {
    if (!loaded) return
    const deck = buildDeck(items, memoryPairs).map(t => ({ ...t, state: 'down' }))
    tilesRef.current = deck
    setTiles(deck)
    startRef.current = Date.now()
  }, [loaded, memoryPairs, items])

  useEffect(() => {
    if (done || !introResolved || showIntro) return
    const id = setInterval(() => setCurrentElapsedMs(Date.now() - startRef.current), 100)
    return () => clearInterval(id)
  }, [done, introResolved, showIntro])

  function emit(type, itemId = null) {
    seqRef.current += 1
    setLastEvent({ seq: seqRef.current, type, itemId })
  }

  function setTileStates(tileIds, state) {
    tilesRef.current = tilesRef.current.map(t => (tileIds.includes(t.tileId) ? { ...t, state } : t))
    setTiles(tilesRef.current)
  }

  function flipTile(tileId) {
    if (lockedRef.current || doneRef.current) return
    const tile = tilesRef.current.find(t => t.tileId === tileId)
    if (!tile || tile.state !== 'down') return

    setTileStates([tileId], 'up')
    flippedRef.current = [...flippedRef.current, tileId]
    if (flippedRef.current.length < 2) return

    const [aId, bId] = flippedRef.current
    flippedRef.current = []
    const a = tilesRef.current.find(t => t.tileId === aId)
    const b = tilesRef.current.find(t => t.tileId === bId)

    flipAttemptsRef.current += 1
    setFlipAttempts(flipAttemptsRef.current)

    if (a.itemId === b.itemId) {
      setTileStates([aId, bId], 'matched')
      pairsFoundRef.current += 1
      setPairsFound(pairsFoundRef.current)
      matchStreakRef.current += 1
      setMatchStreak(matchStreakRef.current)
      if (matchStreakRef.current > peakMatchStreakRef.current) peakMatchStreakRef.current = matchStreakRef.current
      if (animationsEnabled) fireConfetti()
      emit('match', a.itemId)

      if (pairsFoundRef.current === tilesRef.current.length / 2) finishGame()
    } else {
      setTileStates([aId, bId], 'mismatch')
      mismatchesRef.current += 1
      setMismatches(mismatchesRef.current)
      matchStreakRef.current = 0
      setMatchStreak(0)
      lockedRef.current = true
      setLocked(true)
      emit('mismatch')
      setTimeout(() => {
        setTileStates([aId, bId], 'down')
        lockedRef.current = false
        setLocked(false)
      }, MISMATCH_DELAY_MS)
    }
  }

  async function finishGame() {
    doneRef.current = true
    const pairs = tilesRef.current.length / 2
    if (animationsEnabled) fireFireworks()
    emit('complete')

    await addScore({
      gameId,
      score:      pairs,
      total:      pairs,
      date:       new Date().toISOString().split('T')[0],
      timestamp:  Date.now(),
      flipAttempts:    flipAttemptsRef.current,
      mismatches:      mismatchesRef.current,
      peakMatchStreak: peakMatchStreakRef.current,
      durationMs:      Date.now() - startRef.current,
    })

    const earned = await awardSession(gameId, {
      sessionStats: {
        pairs,
        flipAttempts:    flipAttemptsRef.current,
        mismatches:      mismatchesRef.current,
        peakMatchStreak: peakMatchStreakRef.current,
      },
      counterIncrements: { pairsMatched: pairs },
    })
    setNewBadges(earned)

    setTimeout(() => setDone(true), COMPLETE_DELAY_MS)
  }

  function restart() {
    flippedRef.current = []
    lockedRef.current = false
    doneRef.current = false
    flipAttemptsRef.current = 0
    mismatchesRef.current = 0
    matchStreakRef.current = 0
    peakMatchStreakRef.current = 0
    pairsFoundRef.current = 0
    startRef.current = Date.now()
    const deck = buildDeck(items, memoryPairs).map(t => ({ ...t, state: 'down' }))
    tilesRef.current = deck
    setTiles(deck)
    setLocked(false)
    setFlipAttempts(0)
    setMismatches(0)
    setMatchStreak(0)
    setPairsFound(0)
    setDone(false)
    setLastEvent(null)
    setCurrentElapsedMs(0)
    setNewBadges([])
  }

  function dismissIntro(dontShowAgainFlag) {
    setShowIntro(false)
    startRef.current = Date.now()
    if (dontShowAgainFlag) {
      updateSetting('introDismissed', { ...settings.introDismissed, [gameId]: true })
    }
  }

  return {
    tiles, locked, flipAttempts, mismatches, matchStreak, pairsFound,
    totalPairs: tiles.length / 2, done, lastEvent, newBadges,
    currentElapsedMs, timerMode, animationsEnabled, soundEffectsEnabled,
    showIntro, introResolved, settingsLoaded: loaded, dontShowAgain, setDontShowAgain,
    flipTile, restart, dismissIntro,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useMemorySession.test.js`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMemorySession.js src/hooks/__tests__/useMemorySession.test.js
git commit -m "feat: useMemorySession engine hook for pair-matching games"
```

---

### Task 7: `MemoryBoard` component + core i18n strings

**Files:**
- Create: `src/components/MemoryBoard.jsx`, `src/components/MemoryBoard.css`, `src/components/MemoryBoard.stories.jsx`
- Modify: `src/i18n/en.json` (new top-level `memoryBoard` block)
- Test: `src/components/__tests__/MemoryBoard.test.jsx`

**Interfaces:**
- Consumes: tile shape from Task 6.
- Produces: `<MemoryBoard tiles onFlip renderFace getFaceLabel animationsEnabled liveMessage />` where `renderFace(itemId)` returns face JSX and `getFaceLabel(itemId)` returns the accessible item name. Every tile carries `data-item-id={tile.itemId}` and `data-tile-id={tile.tileId}` (the memory analog of the repo's hidden correct-answer testid convention). Consumed by Task 8.

- [ ] **Step 1: Add the core i18n strings** — in `src/i18n/en.json`, after the `"badges"` block (inside the root object, as a new top-level key):

```json
  "memoryBoard": {
    "hiddenTile": "Hidden tile {{position}} of {{total}}",
    "matchedLabel": "{{name}} — matched"
  }
```

- [ ] **Step 2: Write the failing tests**

```jsx
// src/components/__tests__/MemoryBoard.test.jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import MemoryBoard from '../MemoryBoard'
import '../../i18n/index'

const TILES = [
  { tileId: 'dog-a', itemId: 'dog', state: 'down' },
  { tileId: 'dog-b', itemId: 'dog', state: 'up' },
  { tileId: 'cat-a', itemId: 'cat', state: 'matched' },
  { tileId: 'cat-b', itemId: 'cat', state: 'mismatch' },
]

const renderFace = itemId => <span>{itemId === 'dog' ? '🐕' : '🐈'}</span>
const getFaceLabel = itemId => (itemId === 'dog' ? 'Dog' : 'Cat')

function renderBoard(overrides = {}) {
  const onFlip = vi.fn()
  const utils = render(
    <MemoryBoard tiles={TILES} onFlip={onFlip} renderFace={renderFace} getFaceLabel={getFaceLabel} liveMessage="" {...overrides} />
  )
  return { onFlip, ...utils }
}

describe('MemoryBoard', () => {
  it('labels tiles by state: hidden position, face name, matched name', () => {
    renderBoard()
    expect(screen.getByRole('button', { name: 'Hidden tile 1 of 4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dog' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cat — matched' })).toBeInTheDocument()
  })

  it('exposes data-item-id and data-tile-id on every tile', () => {
    renderBoard()
    const tiles = screen.getAllByRole('button')
    expect(tiles.filter(b => b.dataset.itemId === 'dog')).toHaveLength(2)
    expect(tiles.every(b => b.dataset.tileId)).toBe(true)
  })

  it('clicking a face-down tile calls onFlip with its tileId', () => {
    const { onFlip } = renderBoard()
    fireEvent.click(screen.getByRole('button', { name: 'Hidden tile 1 of 4' }))
    expect(onFlip).toHaveBeenCalledWith('dog-a')
  })

  it('matched tiles are disabled and not clickable', () => {
    const { onFlip } = renderBoard()
    const matched = screen.getByRole('button', { name: 'Cat — matched' })
    expect(matched).toBeDisabled()
    fireEvent.click(matched)
    expect(onFlip).not.toHaveBeenCalled()
  })

  it('mismatch tiles show a decorative cross marker', () => {
    const { container } = renderBoard()
    const cross = container.querySelector('.memory-board__cross')
    expect(cross).toBeInTheDocument()
    expect(cross.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders the live region with the given message', () => {
    renderBoard({ liveMessage: "It's a match! Dog!" })
    expect(screen.getByRole('status')).toHaveTextContent("It's a match! Dog!")
  })

  it('applies the no-animation modifier when animations are disabled', () => {
    const { container } = renderBoard({ animationsEnabled: false })
    expect(container.querySelector('.memory-board__grid--no-anim')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderBoard()
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

Run: `npx vitest run src/components/__tests__/MemoryBoard.test.jsx` — FAIL (module missing).

- [ ] **Step 3: Implement the component**

```jsx
// src/components/MemoryBoard.jsx
import { useTranslation } from 'react-i18next'
import './MemoryBoard.css'

export default function MemoryBoard({ tiles, onFlip, renderFace, getFaceLabel, animationsEnabled = true, liveMessage = '' }) {
  const { t } = useTranslation()
  const total = tiles.length

  return (
    <div className="memory-board">
      <div className={`memory-board__grid${animationsEnabled ? '' : ' memory-board__grid--no-anim'}`}>
        {tiles.map((tile, i) => {
          const faceUp = tile.state !== 'down'
          const label =
            tile.state === 'down' ? t('memoryBoard.hiddenTile', { position: i + 1, total })
            : tile.state === 'matched' ? t('memoryBoard.matchedLabel', { name: getFaceLabel(tile.itemId) })
            : getFaceLabel(tile.itemId)
          return (
            <button
              key={tile.tileId}
              className={`memory-board__tile memory-board__tile--${tile.state}`}
              data-item-id={tile.itemId}
              data-tile-id={tile.tileId}
              aria-label={label}
              disabled={tile.state === 'matched'}
              onClick={() => onFlip(tile.tileId)}
            >
              <span className="memory-board__tile-inner" aria-hidden="true">
                <span className="memory-board__tile-back">❓</span>
                <span className="memory-board__tile-face">{faceUp ? renderFace(tile.itemId) : null}</span>
              </span>
              {tile.state === 'mismatch' && <span className="memory-board__cross" aria-hidden="true">✗</span>}
            </button>
          )
        })}
      </div>
      <div className="sr-only" role="status" aria-live="polite">{liveMessage}</div>
    </div>
  )
}
```

```css
/* src/components/MemoryBoard.css */
.memory-board__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 0.75rem;
  max-width: 560px;
  margin: 0 auto;
}

.memory-board__tile {
  position: relative;
  aspect-ratio: 1;
  border: none;
  border-radius: var(--radius-md, 16px);
  background: transparent;
  padding: 0;
  cursor: pointer;
  perspective: 600px;
  font-size: 2.5rem;
}

.memory-board__tile-inner {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transition: transform 0.4s;
  border-radius: inherit;
}

.memory-board__tile--up .memory-board__tile-inner,
.memory-board__tile--matched .memory-board__tile-inner,
.memory-board__tile--mismatch .memory-board__tile-inner {
  transform: rotateY(180deg);
}

.memory-board__tile-back,
.memory-board__tile-face {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  backface-visibility: hidden;
  border-radius: inherit;
}

.memory-board__tile-back {
  background: var(--color-lavender-dark);
  color: #fff;
}

.memory-board__tile-face {
  background: var(--color-aqua);
  transform: rotateY(180deg);
}

.memory-board__tile--matched {
  cursor: default;
}

.memory-board__tile--matched .memory-board__tile-face {
  background: var(--color-teal);
  animation: memory-board-wiggle 0.5s ease-in-out;
}

.memory-board__tile--mismatch .memory-board__tile-face {
  background: var(--color-coral, #ffcdd2);
  outline: 4px solid #c62828;
  outline-offset: -4px;
}

.memory-board__cross {
  position: absolute;
  top: 0.25rem;
  right: 0.5rem;
  color: #c62828;
  font-size: 1.25rem;
  font-weight: bold;
}

@keyframes memory-board-wiggle {
  0%, 100% { transform: rotateY(180deg) rotateZ(0deg); }
  25%      { transform: rotateY(180deg) rotateZ(-6deg); }
  75%      { transform: rotateY(180deg) rotateZ(6deg); }
}

.memory-board__grid--no-anim .memory-board__tile-inner {
  transition: none;
}

.memory-board__grid--no-anim .memory-board__tile--matched .memory-board__tile-face {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .memory-board__tile-inner { transition: none; }
  .memory-board__tile--matched .memory-board__tile-face { animation: none; }
}
```

Check the exact `--color-*` custom-property names against `src/index.css` before using them (`grep -- "--color" src/index.css`) and substitute the closest existing tokens; only the two red hexes above (`#c62828`, `#ffcdd2` fallback) may stay literal if no red token exists.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/__tests__/MemoryBoard.test.jsx` — all pass. Also `npx vitest run src/i18n` (namespace-collision tests still green).

- [ ] **Step 5: Add the story**

```jsx
// src/components/MemoryBoard.stories.jsx
import MemoryBoard from './MemoryBoard'

const TILES = [
  { tileId: 'dog-a', itemId: 'dog', state: 'down' },
  { tileId: 'cat-a', itemId: 'cat', state: 'up' },
  { tileId: 'cow-a', itemId: 'cow', state: 'matched' },
  { tileId: 'cow-b', itemId: 'cow', state: 'matched' },
  { tileId: 'cat-b', itemId: 'cat', state: 'mismatch' },
  { tileId: 'dog-b', itemId: 'dog', state: 'down' },
]

const EMOJI = { dog: '🐕', cat: '🐈', cow: '🐄' }
const NAMES = { dog: 'Dog', cat: 'Cat', cow: 'Cow' }

export default {
  title: 'Components/MemoryBoard',
  component: MemoryBoard,
  args: {
    tiles: TILES,
    onFlip: () => {},
    renderFace: itemId => <span>{EMOJI[itemId]}</span>,
    getFaceLabel: itemId => NAMES[itemId],
    liveMessage: '',
  },
}

export const Default = {}
export const AllFaceDown = { args: { tiles: TILES.map(t => ({ ...t, state: 'down' })) } }
export const AnimationsDisabled = { args: { animationsEnabled: false } }
```

- [ ] **Step 6: Commit**

```bash
git add src/components/MemoryBoard.jsx src/components/MemoryBoard.css src/components/MemoryBoard.stories.jsx src/components/__tests__/MemoryBoard.test.jsx src/i18n/en.json
git commit -m "feat: generic MemoryBoard tile-grid component with built-in a11y"
```

---

### Task 8: The game folder — `animal-memory-match`

**Files:**
- Create: `src/games/animal-memory-match/manifest.json`, `index.jsx`, `data/animals.js`, `badges.js`, `i18n/en.json`, `AnimalMemoryMatchGame.css`, `AnimalMemoryMatchGame.stories.jsx`
- Test: `src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`, `src/games/animal-memory-match/__tests__/badges.test.js`

**Interfaces:**
- Consumes: `useMemorySession` return object (Task 6), `MemoryBoard` props (Task 7), `getSoundUrl` from `src/lib/soundLibrary` (Task 5), badge entry shapes (Task 3).
- Produces: the auto-discovered game (route `/game/animal-memory-match`); badge catalog for the badge engine glob.

- [ ] **Step 1: Create the static files**

`src/games/animal-memory-match/manifest.json`:

```json
{
  "id": "animal-memory-match",
  "name": "Animal Memory Match",
  "description": "Flip the tiles and find the matching animal pairs!",
  "icon": "🧠",
  "color": "#4DB6AC",
  "version": "1.0.0",
  "tags": ["memory", "animals"]
}
```

`src/games/animal-memory-match/data/animals.js` (6 items so 6-pair boards work; sounds exist in `src/assets/sounds/`):

```js
const animals = [
  { id: 'dog',  nameKey: 'animalMemoryMatch.animals.dog.name',  emoji: '🐕', sound: 'dog.mp3' },
  { id: 'cat',  nameKey: 'animalMemoryMatch.animals.cat.name',  emoji: '🐈', sound: 'cat.mp3' },
  { id: 'cow',  nameKey: 'animalMemoryMatch.animals.cow.name',  emoji: '🐄', sound: 'cow.mp3' },
  { id: 'duck', nameKey: 'animalMemoryMatch.animals.duck.name', emoji: '🦆', sound: 'duck.mp3' },
  { id: 'frog', nameKey: 'animalMemoryMatch.animals.frog.name', emoji: '🐸', sound: 'frog.mp3' },
  { id: 'lion', nameKey: 'animalMemoryMatch.animals.lion.name', emoji: '🦁', sound: 'lion.mp3' },
]

export default animals
```

`src/games/animal-memory-match/badges.js`:

```js
const badges = [
  { id: 'sharpMind',    icon: '🧠', nameKey: 'animalMemoryMatch.badges.sharpMind.name',    descKey: 'animalMemoryMatch.badges.sharpMind.desc',    kind: 'session',  earned: s => s.flipAttempts <= s.pairs + 2 },
  { id: 'matchStreak',  icon: '⚡', nameKey: 'animalMemoryMatch.badges.matchStreak.name',  descKey: 'animalMemoryMatch.badges.matchStreak.desc',  kind: 'session',  earned: s => s.peakMatchStreak >= 3 },
  { id: 'bigBoard',     icon: '🏁', nameKey: 'animalMemoryMatch.badges.bigBoard.name',     descKey: 'animalMemoryMatch.badges.bigBoard.desc',     kind: 'session',  earned: s => s.pairs >= 6 },
  { id: 'pairSpotter',  icon: '🐾', nameKey: 'animalMemoryMatch.badges.pairSpotter.name',  descKey: 'animalMemoryMatch.badges.pairSpotter.desc',  kind: 'lifetime', counter: 'pairsMatched', tier: 25 },
  { id: 'pairPro',      icon: '🐾', nameKey: 'animalMemoryMatch.badges.pairPro.name',      descKey: 'animalMemoryMatch.badges.pairPro.desc',      kind: 'lifetime', counter: 'pairsMatched', tier: 100 },
  { id: 'pairChampion', icon: '🐾', nameKey: 'animalMemoryMatch.badges.pairChampion.name', descKey: 'animalMemoryMatch.badges.pairChampion.desc', kind: 'lifetime', counter: 'pairsMatched', tier: 500 },
]

export default badges
```

`src/games/animal-memory-match/i18n/en.json`:

```json
{
  "animalMemoryMatch": {
    "prompt": "Find the matching pairs!",
    "progress": "{{found}} of {{total}} pairs found",
    "howToPlay": "Flip two tiles at a time and find all the matching animal pairs!",
    "matchAnnounce": "It's a match! {{name}}!",
    "noMatchAnnounce": "Not a match — try again!",
    "completeAnnounce": "You found all the pairs!",
    "animals": {
      "dog":  { "name": "Dog" },
      "cat":  { "name": "Cat" },
      "cow":  { "name": "Cow" },
      "duck": { "name": "Duck" },
      "frog": { "name": "Frog" },
      "lion": { "name": "Lion" }
    },
    "badges": {
      "sharpMind":    { "name": "Sharp Mind",    "desc": "Finish a board with almost no wasted flips." },
      "matchStreak":  { "name": "Match Streak",  "desc": "Match 3 pairs in a row without a miss." },
      "bigBoard":     { "name": "Big Board",     "desc": "Complete a 6-pair board." },
      "pairSpotter":  { "name": "Pair Spotter",  "desc": "Match 25 pairs in total." },
      "pairPro":      { "name": "Pair Pro",      "desc": "Match 100 pairs in total." },
      "pairChampion": { "name": "Pair Champion", "desc": "Match 500 pairs in total." }
    }
  }
}
```

`src/games/animal-memory-match/AnimalMemoryMatchGame.css`:

```css
.memory-game__question {
  text-align: center;
  margin-bottom: 1rem;
}

.memory-game__prompt {
  font-size: 1.3rem;
  font-weight: bold;
}

.memory-game__progress {
  color: var(--color-text-muted, #666);
  font-size: 0.9rem;
}
```

(Verify `--color-text-muted` exists in `src/index.css`; if not, use the muted token the other game CSS files use — check `src/games/color-match/ColorMatchGame.css`.)

- [ ] **Step 2: Write the failing badge-catalog test**

```js
// src/games/animal-memory-match/__tests__/badges.test.js
import { describe, it, expect } from 'vitest'
import badges from '../badges'

describe('animal-memory-match badge catalog', () => {
  it('has 6 entries with unique ids and complete display fields', () => {
    expect(badges).toHaveLength(6)
    expect(new Set(badges.map(b => b.id)).size).toBe(6)
    for (const b of badges) {
      expect(b.icon).toEqual(expect.any(String))
      expect(b.nameKey).toMatch(/^animalMemoryMatch\.badges\./)
      expect(b.descKey).toMatch(/^animalMemoryMatch\.badges\./)
      expect(['session', 'lifetime']).toContain(b.kind)
    }
  })

  it('sharpMind passes at pairs+2 flips and fails above it', () => {
    const sharpMind = badges.find(b => b.id === 'sharpMind')
    expect(sharpMind.earned({ pairs: 5, flipAttempts: 7 })).toBe(true)
    expect(sharpMind.earned({ pairs: 5, flipAttempts: 8 })).toBe(false)
  })

  it('matchStreak requires a peak streak of 3', () => {
    const matchStreak = badges.find(b => b.id === 'matchStreak')
    expect(matchStreak.earned({ peakMatchStreak: 3 })).toBe(true)
    expect(matchStreak.earned({ peakMatchStreak: 2 })).toBe(false)
  })

  it('bigBoard requires a 6-pair board', () => {
    const bigBoard = badges.find(b => b.id === 'bigBoard')
    expect(bigBoard.earned({ pairs: 6 })).toBe(true)
    expect(bigBoard.earned({ pairs: 5 })).toBe(false)
  })

  it('lifetime tiers are ascending 25, 100, 500 on pairsMatched', () => {
    const tiers = badges.filter(b => b.kind === 'lifetime')
    expect(tiers.map(b => b.tier)).toEqual([25, 100, 500])
    expect(tiers.every(b => b.counter === 'pairsMatched')).toBe(true)
  })
})
```

Run: `npx vitest run src/games/animal-memory-match/__tests__/badges.test.js` — should PASS already (files created in Step 1); if it fails, fix the catalog.

- [ ] **Step 3: Write the failing game-component tests**

```jsx
// src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx
import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'jest-axe'
import AnimalMemoryMatchGame from '../index'

const mockPlay = vi.fn().mockResolvedValue(undefined)
window.HTMLMediaElement.prototype.play  = mockPlay
window.HTMLMediaElement.prototype.pause = vi.fn()

vi.mock('../../../lib/confetti', () => ({ fireConfetti: vi.fn(), fireFireworks: vi.fn() }))
vi.mock('../../../lib/soundLibrary', () => ({ getSoundUrl: vi.fn(() => 'blob:mock-sound') }))

let mockSettings
const mockUpdateSetting = vi.fn()

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings, loaded: true, updateSetting: mockUpdateSetting }),
}))
vi.mock('../../../hooks/useScores', () => ({
  default: () => ({ addScore: vi.fn().mockResolvedValue(undefined), scores: [], getBestScore: () => 0, getScoresByGame: () => [], getAllScores: () => [] }),
}))
vi.mock('../../../hooks/useBadges', () => ({
  default: () => ({ badgeData: { awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} }, awardSession: vi.fn().mockResolvedValue([]) }),
}))

const onGameEnd = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockSettings = {
    memoryPairs: 3, animationsEnabled: true, soundEffectsEnabled: true,
    timerMode: 'countUp', introDismissed: { 'animal-memory-match': true },
  }
})
afterEach(() => vi.useRealTimers())

function getTiles() {
  return screen.getAllByRole('button').filter(b => b.dataset.itemId)
}

function findPairButtons() {
  const tiles = getTiles().filter(b => !b.disabled)
  for (const t of tiles) {
    const twin = tiles.find(o => o !== t && o.dataset.itemId === t.dataset.itemId)
    if (twin) return [t, twin]
  }
  return null
}

async function playFullBoard() {
  for (let i = 0; i < 3; i++) {
    const pair = findPairButtons()
    act(() => { fireEvent.click(pair[0]) })
    act(() => { fireEvent.click(pair[1]) })
    await act(async () => {})
  }
}

describe('AnimalMemoryMatchGame', () => {
  it('renders 2×memoryPairs face-down tiles', async () => {
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    expect(getTiles()).toHaveLength(6)
    expect(screen.getAllByRole('button', { name: /hidden tile/i })).toHaveLength(6)
  })

  it('shows the intro on first run and starts on dismiss', async () => {
    mockSettings.introDismissed = {}
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByTestId('game-intro-start')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByTestId('game-intro-start')) })
    expect(getTiles()).toHaveLength(6)
  })

  it('plays the animal sound on a match', async () => {
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(mockPlay).toHaveBeenCalledTimes(1)
  })

  it('does not play sound when soundEffectsEnabled is false', async () => {
    mockSettings.soundEffectsEnabled = false
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(mockPlay).not.toHaveBeenCalled()
  })

  it('announces the match in the live region', async () => {
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(screen.getByRole('status')).toHaveTextContent(/match/i)
  })

  it('shows the timer when timerMode is countUp and hides it when off', async () => {
    const { unmount } = render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />)
    await act(async () => {})
    expect(document.querySelector('.timer')).toBeInTheDocument()
    unmount()

    mockSettings = { ...mockSettings, timerMode: 'off' }
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    expect(document.querySelector('.timer')).not.toBeInTheDocument()
  })

  it('reaches the results screen after all pairs are found', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
  })

  it('Home button on results calls onGameEnd with pairs/pairs', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    vi.useRealTimers()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /home/i })) })
    expect(onGameEnd).toHaveBeenCalledWith(3, 3)
  })

  it('has no accessibility violations', async () => {
    let container
    await act(async () => { container = render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />).container })
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

Note the `.timer` class assertion — check `src/components/Timer.jsx` for its actual root class name first and adjust the selector if it differs.

Run: `npx vitest run src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx` — FAIL (`../index` missing).

- [ ] **Step 4: Implement `index.jsx`**

```jsx
// src/games/animal-memory-match/index.jsx
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useMemorySession from '../../hooks/useMemorySession'
import { useShellGameStatus } from '../../components/ShellContext'
import MemoryBoard from '../../components/MemoryBoard'
import GameResults from '../../components/GameResults'
import GameIntro from '../../components/GameIntro'
import Timer from '../../components/Timer'
import { getSoundUrl } from '../../lib/soundLibrary'
import animals from './data/animals'
import manifest from './manifest.json'
import './AnimalMemoryMatchGame.css'

export default function AnimalMemoryMatchGame({ onGameEnd }) {
  const { t } = useTranslation()
  const {
    tiles, locked, matchStreak, pairsFound, totalPairs, done, lastEvent, newBadges,
    currentElapsedMs, timerMode, animationsEnabled, soundEffectsEnabled,
    showIntro, introResolved, settingsLoaded, dontShowAgain, setDontShowAgain,
    flipTile, restart, dismissIntro,
  } = useMemorySession({ gameId: 'animal-memory-match', items: animals })

  useShellGameStatus({ streak: matchStreak, sessionActive: introResolved && !showIntro && !done })

  const itemById = id => animals.find(a => a.id === id)

  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'match' || !soundEffectsEnabled) return
    const url = getSoundUrl(itemById(lastEvent.itemId).sound)
    if (url) new Audio(url).play().catch(() => {})
  }, [lastEvent, soundEffectsEnabled])

  if (!settingsLoaded || !introResolved) return null

  if (showIntro) {
    return (
      <GameIntro
        icon={manifest.icon}
        name={manifest.name}
        instructions={t('animalMemoryMatch.howToPlay')}
        dontShowAgain={dontShowAgain}
        onDontShowAgainChange={setDontShowAgain}
        onStart={() => dismissIntro(dontShowAgain)}
      />
    )
  }

  if (done) {
    return (
      <GameResults
        score={pairsFound}
        total={totalPairs}
        missed={[]}
        renderMissedItem={() => null}
        onPlayAgain={restart}
        onHome={() => onGameEnd(pairsFound, totalPairs)}
        newBadges={newBadges}
      />
    )
  }

  if (tiles.length === 0) return null

  const liveMessage = !lastEvent ? ''
    : lastEvent.type === 'match' ? t('animalMemoryMatch.matchAnnounce', { name: t(itemById(lastEvent.itemId).nameKey) })
    : lastEvent.type === 'mismatch' ? t('animalMemoryMatch.noMatchAnnounce')
    : t('animalMemoryMatch.completeAnnounce')

  return (
    <div className="memory-game">
      <div className="memory-game__question">
        <div className="memory-game__progress">{t('animalMemoryMatch.progress', { found: pairsFound, total: totalPairs })}</div>
        <div className="memory-game__prompt">{t('animalMemoryMatch.prompt')}</div>
        {timerMode !== 'off' && <Timer elapsedMs={currentElapsedMs} mode="countUp" />}
      </div>

      <MemoryBoard
        tiles={tiles}
        onFlip={flipTile}
        renderFace={itemId => <span>{itemById(itemId).emoji}</span>}
        getFaceLabel={itemId => t(itemById(itemId).nameKey)}
        animationsEnabled={animationsEnabled}
        liveMessage={liveMessage}
      />
    </div>
  )
}
```

(`locked` is destructured but only consumed inside `flipTile`; drop it from the destructure if lint flags it as unused.)

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/games/animal-memory-match` — all pass.
Also: `npx vitest run src/i18n src/App.test.jsx` — namespace merge and app auto-discovery still green.

- [ ] **Step 6: Add the game story** — copy the `pinRandom` and `seedIntroDismissed` decorator pattern from `src/games/color-match/ColorMatchGame.stories.jsx` verbatim (adjusting the seeded gameId to `animal-memory-match`):

```jsx
// src/games/animal-memory-match/AnimalMemoryMatchGame.stories.jsx
// Copy the pinRandom + seedIntroDismissed decorators from
// src/games/color-match/ColorMatchGame.stories.jsx (they pin Math.random and
// seed playground_settings.introDismissed['animal-memory-match'] = true).
import AnimalMemoryMatchGame from './index'

export default {
  title: 'Games/AnimalMemoryMatchGame',
  component: AnimalMemoryMatchGame,
  decorators: [seedIntroDismissed, pinRandom],
}

export const Default = { args: { onGameEnd: () => {} } }
```

(Open the color-match stories file and reproduce the two decorator functions fully — they are ~40 lines and must be copied, not imported, following the existing per-game convention.)

- [ ] **Step 7: Commit**

```bash
git add src/games/animal-memory-match
git commit -m "feat: Animal Memory Match game (issue #37)"
```

---

### Task 9: `BadgeGallery` and `KidsProgressPage` use per-game catalogs

**Files:**
- Modify: `src/components/BadgeGallery.jsx`, `src/kids/KidsProgressPage.jsx:70`
- Test: `src/components/__tests__/BadgeGallery.test.jsx` (append), `src/kids/__tests__/KidsProgressPage.test.jsx` (append; note its existing assertion at line ~116 counts 8 global badges — that test must keep passing since quiz games keep the global catalog)

**Interfaces:**
- Consumes: `getBadgesForGame` (Task 3).

- [ ] **Step 1: Write the failing test** — append to the existing BadgeGallery test file (adapt to its existing render helpers/fixtures):

```jsx
it('shows a game-specific catalog for games that ship badges.js and the global catalog otherwise', () => {
  render(
    <BadgeGallery
      manifests={[
        { id: 'animal-sounds', name: 'Animal Sounds' },
        { id: 'animal-memory-match', name: 'Animal Memory Match' },
      ]}
      badgeData={{ awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} }}
    />
  )
  expect(screen.getByText('Sharp Mind')).toBeInTheDocument()      // memory badge shown
  expect(screen.getAllByText('Hot Streak')).toHaveLength(1)        // global badge listed once (quiz game only)
  expect(screen.queryAllByText('Sharp Mind')).toHaveLength(1)      // memory badge not under quiz game
})
```

Run: `npx vitest run src/components/__tests__/BadgeGallery.test.jsx` — new test FAILS (memory badges not rendered).

Append the equivalent test to `src/kids/__tests__/KidsProgressPage.test.jsx` (adapt to its existing fixtures/manifest list): add an `animal-memory-match` manifest to the rendered manifests and assert its section shows `Sharp Mind` (and 6 badge chips), while a quiz game's section still shows 8.

- [ ] **Step 2: Implement** — in `src/components/BadgeGallery.jsx`, replace the import and catalog reference:

```jsx
import { getBadgesForGame } from '../lib/badges'
```

and inside the map: `{getBadgesForGame(game.id).map(badge => {` (replacing `BADGE_CATALOG.map`). Remove the now-unused `BADGE_CATALOG` import.

In `src/kids/KidsProgressPage.jsx`, make the same change: import `getBadgesForGame` instead of `BADGE_CATALOG`, and at line ~70 render `{getBadgesForGame(manifest.id).map(badge => (`.

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/components/__tests__/BadgeGallery.test.jsx src/kids` — all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/BadgeGallery.jsx src/components/__tests__/BadgeGallery.test.jsx src/kids
git commit -m "feat: badge displays render per-game catalogs (gallery + kids progress)"
```

---

### Task 10: Admin settings — grouped sections + new controls

**Files:**
- Modify: `src/admin/AdminPage.jsx`, `src/admin/AdminPage.css`, `src/i18n/en.json`
- Test: `src/admin/__tests__/AdminPage.test.jsx` (append + update mock settings)

**Interfaces:**
- Consumes: `memoryPairs` / `soundEffectsEnabled` settings keys (Task 5).
- Produces: Settings tab organized into three headed groups — General / Quiz Games / Memory Games. Group headings are `h2`; every existing section heading inside the tab drops from `h2` to `h3`. No setting keys or handlers change.

- [ ] **Step 1: Add i18n keys** — in the `"admin"` block of `src/i18n/en.json`:

```json
    "groupGeneral": "General",
    "groupQuizGames": "Quiz Games",
    "groupMemoryGames": "Memory Games",
    "memoryPairsHeading": "Pairs Per Board",
    "memoryPairsHint": "How many animal pairs are hidden on the memory board.",
    "soundEffectsHeading": "Sound Effects",
    "soundEffectsOn": "🔊 On",
    "soundEffectsOff": "Off",
```

- [ ] **Step 2: Update the test mocks and write failing tests** — in `src/admin/__tests__/AdminPage.test.jsx`, add `memoryPairs: 5, soundEffectsEnabled: true` to `mockSettingsDefaults`, then append:

```jsx
describe('settings groups', () => {
  it('renders the three group headings as h2 landmarks', () => {
    renderAdmin() // use the file's existing render helper
    for (const name of ['General', 'Quiz Games', 'Memory Games']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
  })

  it('demotes section headings to h3 (no section remains an h2)', () => {
    renderAdmin()
    expect(screen.getByRole('heading', { level: 3, name: 'Answer Choices' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Pairs Per Board' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Answer Choices' })).not.toBeInTheDocument()
  })

  it('selecting a pair count updates memoryPairs', () => {
    renderAdmin()
    const group = screen.getByRole('heading', { level: 3, name: 'Pairs Per Board' }).closest('.admin__section')
    fireEvent.click(within(group).getByLabelText('3'))
    expect(mockUpdateSetting).toHaveBeenCalledWith('memoryPairs', 3)
  })

  it('only offers pair counts 3 through 6', () => {
    renderAdmin()
    const group = screen.getByRole('heading', { level: 3, name: 'Pairs Per Board' }).closest('.admin__section')
    expect(within(group).getAllByRole('radio')).toHaveLength(4)
    expect(within(group).queryByLabelText('2')).not.toBeInTheDocument()
    expect(within(group).queryByLabelText('7')).not.toBeInTheDocument()
  })

  it('toggling sound effects updates soundEffectsEnabled', () => {
    renderAdmin()
    fireEvent.click(screen.getByRole('button', { name: /🔊 On/ }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('soundEffectsEnabled', true)
  })

  it('existing controls still update their keys after regrouping', () => {
    renderAdmin()
    fireEvent.click(screen.getByLabelText('4', { selector: 'input[name="numChoices"]' }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('numChoices', 4)
  })
})
```

(Adapt `renderAdmin` to whatever helper the file actually uses; keep the axe test in that file green — it validates the new heading hierarchy.)

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx` — new tests FAIL.

- [ ] **Step 3: Restructure `AdminPage.jsx` settings panel**

Inside the `activeTab === 'settings'` tabpanel:

1. Wrap the existing sections in three `<section className="admin__group">` blocks:
   - **General**: `LocaleSelector`, Child's Name, Celebration Animations, new Sound Effects, Google Analytics.
   - **Quiz Games**: Answer Choices, Feedback Mode, Questions Per Session, Timer, Speed Record Threshold, Retry Attempts, Hints, Retry Counts Toward Streak, Spaced Repetition, Difficulty Auto-Progression.
   - **Memory Games**: new Pairs Per Board.
2. Each group starts with `<h2 className="admin__group-heading">{t('admin.groupGeneral')}</h2>` (etc.).
3. Change every section's `<h2>` inside the settings tab to `<h3>` (the Games/Badges/History tabs keep their `h2`s).
4. The reset button stays at the bottom of the tabpanel, outside the groups.

New Sound Effects section (in General, after Celebration Animations — same toggle pattern as animations):

```jsx
          <div className="admin__section">
            <h3>{t('admin.soundEffectsHeading')}</h3>
            <div className="admin__toggle">
              <button
                className={`admin__toggle-btn${settings.soundEffectsEnabled ? ' active' : ''}`}
                onClick={() => updateSetting('soundEffectsEnabled', true)}
              >
                {t('admin.soundEffectsOn')}
              </button>
              <button
                className={`admin__toggle-btn${!settings.soundEffectsEnabled ? ' active' : ''}`}
                onClick={() => updateSetting('soundEffectsEnabled', false)}
              >
                {t('admin.soundEffectsOff')}
              </button>
            </div>
          </div>
```

New Pairs Per Board section (the entire Memory Games group):

```jsx
        <section className="admin__group">
          <h2 className="admin__group-heading">{t('admin.groupMemoryGames')}</h2>
          <div className="admin__section">
            <h3>{t('admin.memoryPairsHeading')}</h3>
            <p className="admin__hint">{t('admin.memoryPairsHint')}</p>
            <div className="admin__radios">
              {[3, 4, 5, 6].map(n => (
                <label
                  key={n}
                  className={`admin__radio-label${settings.memoryPairs === n ? ' selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="memoryPairs"
                    checked={settings.memoryPairs === n}
                    onChange={() => updateSetting('memoryPairs', n)}
                    aria-label={String(n)}
                  />
                  {n}
                </label>
              ))}
            </div>
          </div>
        </section>
```

Add to `AdminPage.css`:

```css
.admin__group {
  margin-bottom: 2rem;
}

.admin__group-heading {
  font-size: 1.1rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted, #666);
  border-bottom: 2px solid var(--color-lavender, #e0d7f5);
  padding-bottom: 0.35rem;
  margin: 0 0 1rem;
}
```

(Use existing tokens from `src/index.css`; verify names before use.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/admin` — all pass, including the pre-existing axe test (valid h1→h2→h3 hierarchy).

- [ ] **Step 5: Commit**

```bash
git add src/admin src/i18n/en.json
git commit -m "feat: group admin settings (General/Quiz/Memory) + memoryPairs and soundEffectsEnabled controls"
```

---

### Task 11: E2E spec + visual regression + full-suite verification

**Files:**
- Create: `e2e/animal-memory-match.spec.js`
- Modify: `e2e/visual.spec.js` (add two story ids)

**Interfaces:**
- Consumes: `data-item-id` tile attributes (Task 7), intro testids (existing `GameIntro`), story ids from Tasks 7 & 8.

- [ ] **Step 1: Write the E2E spec** (model: `e2e/color-match.spec.js`)

```js
// e2e/animal-memory-match.spec.js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function startGame(page) {
  await page.goto('/game/animal-memory-match')
  await page.getByTestId('game-intro-start').click()
  await page.locator('[data-tile-id]').first().waitFor()
}

test('memory match: intro shows on first visit and starts the board', async ({ page }) => {
  await page.goto('/game/animal-memory-match')
  await expect(page.getByTestId('game-intro-start')).toBeVisible()
  expect(await page.locator('[data-tile-id]').count()).toBe(0)

  await page.getByTestId('game-intro-start').click()
  await expect(page.locator('[data-tile-id]')).toHaveCount(10) // default 5 pairs
})

test('memory match: matched pair stays revealed; mismatched pair flips back', async ({ page }) => {
  await startGame(page)
  const ids = await page.locator('[data-tile-id]').evaluateAll(els => els.map(e => e.dataset.itemId))
  const pairId = ids.find(id => ids.filter(x => x === id).length === 2)
  const otherId = ids.find(id => id !== pairId)

  // mismatch first: red highlight then flip back
  await page.locator(`[data-item-id="${pairId}"]`).first().click()
  await page.locator(`[data-item-id="${otherId}"]`).first().click()
  await expect(page.locator('.memory-board__tile--mismatch')).toHaveCount(2)
  await expect(page.locator('.memory-board__tile--mismatch')).toHaveCount(0, { timeout: 3000 })

  // now the real pair: stays matched
  const pair = page.locator(`[data-item-id="${pairId}"]`)
  await pair.nth(0).click()
  await pair.nth(1).click()
  await expect(page.locator('.memory-board__tile--matched')).toHaveCount(2)
})

test('memory match: full play-through reaches results and returns home', async ({ page }) => {
  await startGame(page)
  const ids = await page.locator('[data-tile-id]').evaluateAll(els => els.map(e => e.dataset.itemId))
  for (const id of [...new Set(ids)]) {
    const pair = page.locator(`[data-item-id="${id}"]`)
    await pair.nth(0).click()
    await pair.nth(1).click()
  }
  await expect(page.getByText(/you scored/i)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page).toHaveURL('/')
})

test('memory match game screen has no accessibility violations', async ({ page }) => {
  await startGame(page)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

- [ ] **Step 2: Register the visual stories** — in `e2e/visual.spec.js`, extend the `stories` array:

```js
  'components-memoryboard--default',
  'games-animalmemorymatchgame--default',
```

- [ ] **Step 3: Run the E2E suite**

Run: `npm run e2e -- animal-memory-match.spec.js` then the full `npm run e2e` (visual snapshots for the two new stories are created on first run — commit them).
Expected: new spec passes; existing specs unaffected.

- [ ] **Step 4: Run the full unit suite and lint**

```bash
npm run coverage
npm run lint
```

Expected: everything green.

- [ ] **Step 5: Commit**

```bash
git add e2e
git commit -m "test: e2e play-through, a11y scan, and visual snapshots for memory match"
```

---

### Task 12: Versioning, changelog, docs

**Files:**
- Modify: `package.json` (version → `0.23.0`), `CHANGELOG.md`, `README.md` (settings reference), `docs/ENHANCEMENTS.md`

- [ ] **Step 1: Bump the app version** — `package.json` `"version": "0.23.0"`.

- [ ] **Step 2: CHANGELOG entry** — prepend under the header:

```markdown
## [0.23.0] - 2026-07-09

### Added
- **Animal Memory Match** (issue #37) — new game and new *memory* game type: 10 face-down tiles (5 animal pairs, parent-configurable 3–6 via the new "Pairs Per Board" setting); flip two at a time, confetti + the animal's sound on a match, red highlight + flip-back on a mismatch, full fireworks on completing the board. Fully keyboard-playable with screen-reader announcements.
- Engine additions reusable by future matching games: `useMemorySession` hook, `MemoryBoard` component, `buildDeck` util, `fireFireworks()` in the confetti lib, and a shared sound library (`src/assets/sounds`).
- Per-game badge catalogs, auto-discovered from `src/games/<id>/badges.js` (full replacement of the global quiz catalog for that game). Memory match ships six badges: Sharp Mind, Match Streak, Big Board, and Pair Spotter/Pro/Champion lifetime tiers.
- New settings: `memoryPairs` (3–6, default 5) and `soundEffectsEnabled` (default on).

### Changed
- Admin Settings tab reorganized into headed groups — General, Quiz Games, Memory Games — instead of one flat list.
- Animal-sounds mp3 files moved to the shared `src/assets/sounds/` (no behavior change).
```

- [ ] **Step 3: README settings reference** — add rows for `memoryPairs` and `soundEffectsEnabled` to the settings table, matching its existing format.

- [ ] **Step 4: ENHANCEMENTS backlog** — in `docs/ENHANCEMENTS.md`, mark the Animal Memory Match entry (line ~122) as shipped in 0.23.0, following however other shipped items are marked in that file (check first).

- [ ] **Step 5: Verify and commit**

```bash
npm run build     # production build sanity check
git add package.json CHANGELOG.md README.md docs/ENHANCEMENTS.md
git commit -m "chore: bump version to 0.23.0 for Animal Memory Match"
```

---

## Self-Review Notes (already applied)

- Spec coverage: scoring/settings/badges/extras/a11y/i18n/settings-grouping/tests/versioning all map to Tasks 1–12; personal bests are explicitly out of scope per the spec.
- Type consistency: tile shape `{ tileId, itemId, state }`, event shape `{ seq, type, itemId }`, badge entry kinds, and the `awardSession` options object are identical across Tasks 3, 4, 6, 7, 8.
- Deliberate simplification: the game plays sound via `lastEvent` effect (no `onMatch` callback prop on the hook) — single event channel for sound + live region.
