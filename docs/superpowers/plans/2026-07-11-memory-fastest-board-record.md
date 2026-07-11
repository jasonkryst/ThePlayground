# Memory Fastest-Board Personal Best Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "fastest board time" personal best for memory games — persisted per board size alongside the existing fewest-flips record, announced on the results screen.

**Architecture:** Extends the existing memory personal-best pipeline end-to-end: `evaluateMemoryPersonalBest` (pure evaluator) → `usePersonalBest.recordMemorySession` (persistence hook) → `useMemorySession.finishGame` (caller) → `GameResults` (banner). Storage is an additive key (`fastestMs`) in the same `personalBests[gameId]` slot; no migration.

**Tech Stack:** React 18, Vitest + React Testing Library + jsdom. Spec: `docs/superpowers/specs/2026-07-11-memory-fastest-board-record-design.md`.

## Global Constraints

- Record semantics: first session at a board size **persists but is not announced** (`isNewRecord: false`); only a **strictly faster** time is a record; ties/slower persist nothing. Flips and time evaluate **independently**.
- Storage shape: `fastestMs: { [pairs]: { ms, timestamp } }` — keyed per board size, sibling of `fewestFlips`.
- i18n: all user-visible strings go through `src/i18n/en.json` (`common.*`) — never hardcode copy in JSX.
- Tests touching timed game flow use `vi.useFakeTimers()` + `fireEvent` (NOT `userEvent` — it deadlocks with fake timers in this stack).
- Run a single test file with: `npx vitest run <path>`.
- Versioning: bump `package.json` to `0.24.0` and `src/games/animal-memory-match/manifest.json` to `1.1.0`; add a CHANGELOG entry.

---

### Task 1: `evaluateMemoryPersonalBest` — evaluate the fastest-board record

**Files:**
- Modify: `src/utils/evaluateMemoryPersonalBest.js`
- Test: `src/utils/__tests__/evaluateMemoryPersonalBest.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `evaluateMemoryPersonalBest({ flipAttempts, durationMs, pairs, previous })` returning `{ fewestFlips, fastestMs, updatedBests }` where `fastestMs = { isNewRecord: boolean, value: number|null, previous: { ms, timestamp }|null }`. When `durationMs` is `null`/`undefined`, the time record is skipped entirely (`isNewRecord: false`, `value: null`, no persistence). Existing `fewestFlips` behavior is unchanged.

- [ ] **Step 1: Write the failing tests**

Append this `describe` block inside the existing top-level `describe('evaluateMemoryPersonalBest', ...)` in `src/utils/__tests__/evaluateMemoryPersonalBest.test.js`:

```js
  describe('fastest-board record', () => {
    it('persists the first session time at a board size without announcing a record', () => {
      const { fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 9, durationMs: 42000, pairs: 5, previous: null })
      expect(fastestMs.isNewRecord).toBe(false)
      expect(fastestMs.value).toBe(42000)
      expect(fastestMs.previous).toBe(null)
      expect(updatedBests.fastestMs[5]).toEqual({ ms: 42000, timestamp: expect.any(Number) })
    })

    it('announces and persists a record when the session is strictly faster at the same board size', () => {
      const previous = { fastestMs: { 5: { ms: 42000, timestamp: 1 } } }
      const { fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 9, durationMs: 38500, pairs: 5, previous })
      expect(fastestMs.isNewRecord).toBe(true)
      expect(fastestMs.value).toBe(38500)
      expect(fastestMs.previous).toEqual({ ms: 42000, timestamp: 1 })
      expect(updatedBests.fastestMs[5].ms).toBe(38500)
    })

    it('does not announce or persist on a tie or a slower time', () => {
      const previous = { fastestMs: { 5: { ms: 38500, timestamp: 1 } } }
      for (const durationMs of [38500, 60000]) {
        const { fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 9, durationMs, pairs: 5, previous })
        expect(fastestMs.isNewRecord).toBe(false)
        expect(updatedBests.fastestMs[5]).toEqual({ ms: 38500, timestamp: 1 })
      }
    })

    it('tracks board sizes independently — a 3-pair time never beats a 5-pair record', () => {
      const previous = { fastestMs: { 5: { ms: 42000, timestamp: 1 } } }
      const { fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 4, durationMs: 20000, pairs: 3, previous })
      expect(fastestMs.isNewRecord).toBe(false) // first 3-pair session, not a beaten record
      expect(updatedBests.fastestMs[3].ms).toBe(20000)
      expect(updatedBests.fastestMs[5]).toEqual({ ms: 42000, timestamp: 1 })
    })

    it('evaluates flips and time independently — time can improve while flips worsen', () => {
      const previous = {
        fewestFlips: { 5: { flips: 7, timestamp: 1 } },
        fastestMs:   { 5: { ms: 40000, timestamp: 1 } },
      }
      const { fewestFlips, fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 12, durationMs: 30000, pairs: 5, previous })
      expect(fewestFlips.isNewRecord).toBe(false)
      expect(fastestMs.isNewRecord).toBe(true)
      expect(updatedBests.fewestFlips[5]).toEqual({ flips: 7, timestamp: 1 })
      expect(updatedBests.fastestMs[5].ms).toBe(30000)
    })

    it('evaluates flips and time independently — flips can improve while time worsens', () => {
      const previous = {
        fewestFlips: { 5: { flips: 7, timestamp: 1 } },
        fastestMs:   { 5: { ms: 40000, timestamp: 1 } },
      }
      const { fewestFlips, fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 5, durationMs: 55000, pairs: 5, previous })
      expect(fewestFlips.isNewRecord).toBe(true)
      expect(fastestMs.isNewRecord).toBe(false)
      expect(updatedBests.fewestFlips[5].flips).toBe(5)
      expect(updatedBests.fastestMs[5]).toEqual({ ms: 40000, timestamp: 1 })
    })

    it('skips the time record entirely when durationMs is not provided', () => {
      const { fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts: 9, pairs: 5, previous: null })
      expect(fastestMs.isNewRecord).toBe(false)
      expect(fastestMs.value).toBe(null)
      expect(updatedBests.fastestMs).toBeUndefined()
    })
  })
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/utils/__tests__/evaluateMemoryPersonalBest.test.js`
Expected: the 7 new tests FAIL (`fastestMs` is `undefined`); the 5 existing tests still PASS.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/utils/evaluateMemoryPersonalBest.js` with:

```js
// Records are kept per board size (pairs): beating a 3-pair board in fewer
// flips — or less time — than a 6-pair record is not an improvement. The two
// records evaluate independently: a session can improve either, both, or
// neither, and only the improved one is persisted.
export default function evaluateMemoryPersonalBest({ flipAttempts, durationMs, pairs, previous }) {
  const updatedBests = { ...previous }

  const prevFlips = previous?.fewestFlips?.[pairs] ?? null
  const flipsImproved = prevFlips != null && flipAttempts < prevFlips.flips
  if (prevFlips == null || flipsImproved) {
    updatedBests.fewestFlips = {
      ...previous?.fewestFlips,
      [pairs]: { flips: flipAttempts, timestamp: Date.now() },
    }
  }

  // durationMs is optional so older callers (and quiz-shaped records) never
  // persist an undefined time.
  const hasDuration = durationMs != null
  const prevTime = previous?.fastestMs?.[pairs] ?? null
  const timeImproved = hasDuration && prevTime != null && durationMs < prevTime.ms
  if (hasDuration && (prevTime == null || timeImproved)) {
    updatedBests.fastestMs = {
      ...previous?.fastestMs,
      [pairs]: { ms: durationMs, timestamp: Date.now() },
    }
  }

  return {
    fewestFlips: { isNewRecord: flipsImproved, value: flipAttempts, previous: prevFlips },
    fastestMs:   { isNewRecord: timeImproved, value: hasDuration ? durationMs : null, previous: prevTime },
    updatedBests,
  }
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/utils/__tests__/evaluateMemoryPersonalBest.test.js`
Expected: all 12 tests PASS (5 existing + 7 new).

- [ ] **Step 5: Commit**

```bash
git add src/utils/evaluateMemoryPersonalBest.js src/utils/__tests__/evaluateMemoryPersonalBest.test.js
git commit -m "feat: evaluate fastest-board time record in evaluateMemoryPersonalBest"
```

---

### Task 2: `usePersonalBest.recordMemorySession` — pass durationMs through

**Files:**
- Modify: `src/hooks/usePersonalBest.js:31-36`
- Test: `src/hooks/__tests__/usePersonalBest.test.js`

**Interfaces:**
- Consumes: Task 1's `evaluateMemoryPersonalBest({ flipAttempts, durationMs, pairs, previous })` → `{ fewestFlips, fastestMs, updatedBests }`.
- Produces: `recordMemorySession({ flipAttempts, pairs, durationMs })` → `Promise<{ fewestFlips, fastestMs }>`.

- [ ] **Step 1: Write the failing tests**

Append these two tests inside `describe('usePersonalBest', ...)` in `src/hooks/__tests__/usePersonalBest.test.js` (after the existing `recordMemorySession` tests):

```js
  it('recordMemorySession persists an improved fastest-board record and returns it', async () => {
    mockGetPersonalBests.mockResolvedValue({
      'animal-memory-match': { fastestMs: { 5: { ms: 42000, timestamp: 1 } } },
    })
    const { result } = renderHook(() => usePersonalBest('animal-memory-match'))
    await waitFor(() => expect(result.current.personalBest).not.toBe(null))

    let outcome
    await act(async () => {
      outcome = await result.current.recordMemorySession({ flipAttempts: 9, pairs: 5, durationMs: 38500 })
    })

    expect(outcome.fastestMs.isNewRecord).toBe(true)
    expect(outcome.fastestMs.previous).toEqual({ ms: 42000, timestamp: 1 })
    expect(mockSavePersonalBests).toHaveBeenCalledWith(
      expect.objectContaining({
        'animal-memory-match': expect.objectContaining({ fastestMs: expect.objectContaining({ 5: expect.objectContaining({ ms: 38500 }) }) }),
      })
    )
    expect(result.current.personalBest.fastestMs[5].ms).toBe(38500)
  })

  it('recordMemorySession does not report a time record when the session is slower', async () => {
    mockGetPersonalBests.mockResolvedValue({
      'animal-memory-match': { fastestMs: { 5: { ms: 38500, timestamp: 1 } } },
    })
    const { result } = renderHook(() => usePersonalBest('animal-memory-match'))
    await waitFor(() => expect(result.current.personalBest).not.toBe(null))

    let outcome
    await act(async () => {
      outcome = await result.current.recordMemorySession({ flipAttempts: 9, pairs: 5, durationMs: 60000 })
    })

    expect(outcome.fastestMs.isNewRecord).toBe(false)
    expect(result.current.personalBest.fastestMs[5].ms).toBe(38500)
  })
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/hooks/__tests__/usePersonalBest.test.js`
Expected: the 2 new tests FAIL (`outcome.fastestMs` is `undefined`); all existing tests PASS.

- [ ] **Step 3: Write the implementation**

In `src/hooks/usePersonalBest.js`, replace the `recordMemorySession` function:

```js
  async function recordMemorySession({ flipAttempts, pairs, durationMs }) {
    const previous = bestsRef.current[gameId] ?? null
    const { fewestFlips, fastestMs, updatedBests } = evaluateMemoryPersonalBest({ flipAttempts, pairs, durationMs, previous })
    await persist(updatedBests)
    return { fewestFlips, fastestMs }
  }
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/hooks/__tests__/usePersonalBest.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePersonalBest.js src/hooks/__tests__/usePersonalBest.test.js
git commit -m "feat: recordMemorySession accepts durationMs and returns the fastest-board result"
```

---

### Task 3: `useMemorySession.finishGame` — compute durationMs once, pass to the record

**Files:**
- Modify: `src/hooks/useMemorySession.js:134-156` (the `finishGame` function)
- Test: `src/hooks/__tests__/useMemorySession.test.js`

**Interfaces:**
- Consumes: Task 2's `recordMemorySession({ flipAttempts, pairs, durationMs })`.
- Produces: `personalBestResult` state now includes `fastestMs` (consumed by the game's results screen via existing wiring — no signature change to the hook's return).

- [ ] **Step 1: Write the failing test**

Append inside `describe('useMemorySession', ...)` in `src/hooks/__tests__/useMemorySession.test.js` (after the `'completing all pairs fires fireworks...'` test; it reuses the same board-completion pattern — fake timers activated only AFTER `renderSession()`, per the note in that file):

```js
  it('persists a fastest-board time equal to the score record durationMs on completion', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()
    for (let i = 0; i < 3; i++) {
      const pair = findPair(result.current.tiles)
      act(() => result.current.flipTile(pair[0]))
      act(() => result.current.flipTile(pair[1]))
      await act(async () => {})
    }
    const scoredDurationMs = mockAddScore.mock.calls[0][0].durationMs
    expect(mockSavePersonalBests).toHaveBeenCalledWith(
      expect.objectContaining({
        'test-memory': expect.objectContaining({
          fastestMs: expect.objectContaining({ 3: expect.objectContaining({ ms: scoredDurationMs }) }),
        }),
      })
    )
  })
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `npx vitest run src/hooks/__tests__/useMemorySession.test.js`
Expected: the new test FAILS (savePersonalBests payload has no `fastestMs`); all existing tests PASS.

- [ ] **Step 3: Write the implementation**

In `src/hooks/useMemorySession.js` `finishGame`, hoist the duration and pass it to both consumers. Replace:

```js
    await addScore({
      gameId,
      score:      pairs,
      total:      pairs,
      date:       new Date().toISOString().split('T')[0],
      timestamp:  Date.now(),
      flipAttempts:    flipAttemptsRef.current,
      mismatches:      mismatchesRef.current,
      peakStreak:      peakMatchStreakRef.current,
      peakMatchStreak: peakMatchStreakRef.current,
      durationMs:      Date.now() - startRef.current,
    })

    await recordStreak(peakMatchStreakRef.current)

    const bestResult = await recordMemorySession({ flipAttempts: flipAttemptsRef.current, pairs })
```

with:

```js
    const durationMs = Date.now() - startRef.current
    await addScore({
      gameId,
      score:      pairs,
      total:      pairs,
      date:       new Date().toISOString().split('T')[0],
      timestamp:  Date.now(),
      flipAttempts:    flipAttemptsRef.current,
      mismatches:      mismatchesRef.current,
      peakStreak:      peakMatchStreakRef.current,
      peakMatchStreak: peakMatchStreakRef.current,
      durationMs,
    })

    await recordStreak(peakMatchStreakRef.current)

    const bestResult = await recordMemorySession({ flipAttempts: flipAttemptsRef.current, pairs, durationMs })
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/hooks/__tests__/useMemorySession.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMemorySession.js src/hooks/__tests__/useMemorySession.test.js
git commit -m "feat: memory finishGame records the board time for the fastest-board personal best"
```

---

### Task 4: `GameResults` banner + i18n string

**Files:**
- Modify: `src/components/GameResults.jsx:30-37` (insert after the fewest-flips block)
- Modify: `src/i18n/en.json` (`common` section)
- Test: `src/components/__tests__/GameResults.test.jsx`

**Interfaces:**
- Consumes: `personalBestResult.fastestMs = { isNewRecord, value, previous: { ms, timestamp } }` (Task 1 shape, delivered via Tasks 2–3).
- Produces: banner copy `⏱️ New record! Finished in {{seconds}}s (was {{prevSeconds}}s)` under the key `common.newFastestBoardRecord`; seconds formatted `(ms / 1000).toFixed(1)`.

- [ ] **Step 1: Write the failing tests**

Append inside the top-level `describe` in `src/components/__tests__/GameResults.test.jsx`, after the existing fewest-flips tests (mirror their prop shape — `renderMissedItem` is the helper already defined in that file):

```jsx
  it('shows the fastest-board banner with previous seconds when isNewRecord is true', () => {
    render(
      <GameResults
        score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        personalBestResult={{
          fastestMs: { isNewRecord: true, value: 42300, previous: { ms: 51800, timestamp: 1 } },
        }}
      />
    )
    expect(screen.getByText('⏱️ New record! Finished in 42.3s (was 51.8s)')).toBeInTheDocument()
  })

  it('does not show a fastest-board banner when the record was not broken', () => {
    render(
      <GameResults
        score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        personalBestResult={{
          fastestMs: { isNewRecord: false, value: 60000, previous: { ms: 51800, timestamp: 1 } },
        }}
      />
    )
    expect(screen.queryByText(/new record/i)).not.toBeInTheDocument()
  })

  it('stacks the fewest-flips and fastest-board banners when both records break', () => {
    render(
      <GameResults
        score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        personalBestResult={{
          fewestFlips: { isNewRecord: true, value: 7, previous: { flips: 9, timestamp: 1 } },
          fastestMs:   { isNewRecord: true, value: 42300, previous: { ms: 51800, timestamp: 1 } },
        }}
      />
    )
    expect(screen.getByText('🃏 New record! Solved in 7 flips (was 9)')).toBeInTheDocument()
    expect(screen.getByText('⏱️ New record! Finished in 42.3s (was 51.8s)')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/components/__tests__/GameResults.test.jsx`
Expected: the 2 positive tests FAIL (banner text not found); the negative test passes trivially — that's fine, it guards the regression direction.

- [ ] **Step 3: Write the implementation**

In `src/i18n/en.json`, add after the `"newFewestFlipsRecord"` line:

```json
    "newFastestBoardRecord": "⏱️ New record! Finished in {{seconds}}s (was {{prevSeconds}}s)",
```

In `src/components/GameResults.jsx`, insert after the `fewestFlips` banner block (after line 37) and before the `speed` block:

```jsx
      {personalBestResult?.fastestMs?.isNewRecord && (
        <div className="results__record">
          {t('common.newFastestBoardRecord', {
            seconds: (personalBestResult.fastestMs.value / 1000).toFixed(1),
            prevSeconds: (personalBestResult.fastestMs.previous.ms / 1000).toFixed(1),
          })}
        </div>
      )}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/components/__tests__/GameResults.test.jsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/GameResults.jsx src/i18n/en.json src/components/__tests__/GameResults.test.jsx
git commit -m "feat: fastest-board record banner on the results screen"
```

---

### Task 5: Game-level integration test (AnimalMemoryMatchGame)

**Files:**
- Test: `src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`

**Interfaces:**
- Consumes: the file's existing `mockMemoryBestOutcome` fixture (the mocked resolution of `recordMemorySession`) and `playFullBoard()` helper.
- Produces: nothing — regression coverage that the wired-up game surfaces the new banner.

- [ ] **Step 1: Write the failing test**

Append after the existing `'shows the fewest-flips record banner on the results screen'` test:

```jsx
  it('shows the fastest-board record banner on the results screen', async () => {
    mockMemoryBestOutcome = {
      fewestFlips: { isNewRecord: false, value: 3, previous: { flips: 3, timestamp: 1 } },
      fastestMs:   { isNewRecord: true, value: 42300, previous: { ms: 51800, timestamp: 1 } },
    }
    vi.useFakeTimers()
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    expect(screen.getByText(/finished in 42\.3s/i)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails, then it should pass without implementation changes — verify why**

Run: `npx vitest run src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`
Expected: PASS immediately — Tasks 1–4 already wired the pipeline; this test pins the integration (mock outcome → GameResults banner) against regressions. If it FAILS, the wiring between `AnimalMemoryMatchGame`, `useMemorySession.personalBestResult`, and `GameResults` is broken — fix that before proceeding.

- [ ] **Step 3: Run the full suite and lint**

Run: `npx vitest run && npm run lint`
Expected: all tests PASS, lint clean.

- [ ] **Step 4: Commit**

```bash
git add src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx
git commit -m "test: integration coverage for the fastest-board banner in animal memory match"
```

---

### Task 6: Docs, versioning, changelog

**Files:**
- Modify: `package.json` (version `0.23.0` → `0.24.0`)
- Modify: `src/games/animal-memory-match/manifest.json` (version `1.0.0` → `1.1.0`)
- Modify: `CHANGELOG.md`
- Modify: `README.md:13` (My Progress feature bullet unchanged; extend the Features list)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Bump versions**

In `package.json`: `"version": "0.24.0"`.
In `src/games/animal-memory-match/manifest.json`: `"version": "1.1.0"`.

- [ ] **Step 2: Add CHANGELOG entry**

Insert directly under the `Format follows...` line in `CHANGELOG.md`:

```markdown
## [0.24.0] - 2026-07-11

### Added
- Fastest-board personal best for memory games (issue #51, final item): the quickest completion time is tracked per board size alongside the fewest-flips record and announced with a "⏱️ New record!" banner on the results screen. Additive `fastestMs` storage key — no migration.
```

- [ ] **Step 3: Update README**

In `README.md`, add a Features bullet after the "Persistent scoring" line (line 15):

```markdown
- **Personal bests** — quiz games track best accuracy and average answer speed; memory games track fewest flips and fastest board time per board size; new records are announced on the results screen
```

- [ ] **Step 4: Verify build + full suite still green**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add package.json src/games/animal-memory-match/manifest.json CHANGELOG.md README.md
git commit -m "docs: changelog, README, and version bumps for the fastest-board record (0.24.0)"
```
