# Questions-Per-Session Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every game's session length always equal the configured "Questions per session" setting, even when the game's item pool is smaller than the selected count, by having `buildQueue` cycle through the pool (evenly, with no back-to-back repeats) instead of silently truncating.

**Architecture:** `src/utils/buildQueue.js` is a pure function consumed by `src/hooks/useGameSession.js` (on session start and restart). It currently does `Math.min(questionsPerSession, items.length)`. This plan replaces that with a loop that appends repeated shuffled full passes of `items` until the target count is reached, so `queue.length === questionsPerSession` whenever the pool is non-empty and the target is positive. No other file changes behavior — `useGameSession`, `GameResults`, badges, and personal-best code all already just read `queue.length`/`timings`.

**Tech Stack:** React, Vitest + React Testing Library (existing stack, no new dependencies).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-09-questions-per-session-fix-design.md`
- `buildQueue(items, numChoices, questionsPerSession)`'s per-question **answer choices** logic (the `wrongPool`/`numChoices` capping) must not change — only the correct-item sequence logic changes.
- `items.length === 0` or `questionsPerSession <= 0` must return `[]` (no throw, no infinite loop).
- No two adjacent queue entries may share the same `correct.id` when `items.length > 1`.
- Repeats must be evenly distributed: for `questionsPerSession` an exact multiple of `items.length`, every item appears exactly `questionsPerSession / items.length` times.
- Follow existing code style in `buildQueue.js` (no semicolons omitted inconsistently — match the file's existing semicolon-free style except where ASI requires a leading `;` as already used on line 5).
- Bump `package.json` **and** `package-lock.json` (both the top-level `version` and the nested root-package `version` at line 9) to `0.22.0` — this repo's convention keeps them in sync (see commit `8e74fde`).

---

### Task 1: Rewrite `buildQueue` to cycle-and-refill

**Files:**
- Modify: `src/utils/buildQueue.js`
- Test: `src/utils/__tests__/buildQueue.test.js`

**Interfaces:**
- Consumes: nothing new — `buildQueue(items: Array<{id: string, ...}>, numChoices: number, questionsPerSession: number) => Array<{correct: object, choices: object[]}>` (signature unchanged).
- Produces: `buildQueue` now guarantees `result.length === questionsPerSession` when `items.length > 0 && questionsPerSession > 0`, and `result.length === 0` otherwise. `src/hooks/useGameSession.js` (Task 2) relies on this.

- [ ] **Step 1: Replace the test file with the full updated suite (will fail against current implementation)**

Replace the entire contents of `src/utils/__tests__/buildQueue.test.js` with:

```js
import { describe, it, expect } from 'vitest'
import buildQueue from '../buildQueue'

const items = [
  { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' },
]

describe('buildQueue', () => {
  it('builds one queue entry per requested question when enough items exist', () => {
    const queue = buildQueue(items, 2, 3)
    expect(queue).toHaveLength(3)
  })

  it('fills the queue to the requested count by repeating items when the pool is smaller', () => {
    const queue = buildQueue(items, 2, 10)
    expect(queue).toHaveLength(10)
  })

  it('distributes repeats evenly across full passes of the pool', () => {
    const queue = buildQueue(items, 2, 8) // 8 = 2 full passes of 4 items
    const counts = {}
    for (const entry of queue) {
      counts[entry.correct.id] = (counts[entry.correct.id] || 0) + 1
    }
    expect(Object.values(counts)).toEqual([2, 2, 2, 2])
  })

  it('never repeats the same item on two consecutive questions when the pool has more than one item', () => {
    const queue = buildQueue(items, 2, 40)
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i].correct.id).not.toBe(queue[i - 1].correct.id)
    }
  })

  it('does not repeat items when the requested count is within the pool size', () => {
    const queue = buildQueue(items, 2, 4)
    const ids = queue.map(entry => entry.correct.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns an empty queue when there are no items', () => {
    const queue = buildQueue([], 2, 10)
    expect(queue).toEqual([])
  })

  it('returns an empty queue when questionsPerSession is zero', () => {
    const queue = buildQueue(items, 2, 0)
    expect(queue).toEqual([])
  })

  it('returns an empty queue when questionsPerSession is negative', () => {
    const queue = buildQueue(items, 2, -5)
    expect(queue).toEqual([])
  })

  it('repeats the single item without throwing when the pool has exactly one item', () => {
    const singleItem = [{ id: 'only' }]
    const queue = buildQueue(singleItem, 2, 3)
    expect(queue).toHaveLength(3)
    expect(queue.every(entry => entry.correct.id === 'only')).toBe(true)
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

- [ ] **Step 2: Run the tests and confirm the new/changed ones fail**

Run: `npx vitest run src/utils/__tests__/buildQueue.test.js`

Expected: FAIL — specifically "fills the queue to the requested count by repeating items when the pool is smaller" (currently returns length 4, not 10), "distributes repeats evenly across full passes of the pool", "never repeats the same item on two consecutive questions...", and the three empty/negative-count tests should still pass by coincidence (current code already returns `[]` for `items=[]` since `Math.min(x, 0)` is 0 — but the negative `questionsPerSession` case (`-5`) will currently FAIL because `Math.min(-5, 4)` is `-5` and `.slice(0, -5)` returns `[]` too, so check actual output; if any of these three unexpectedly pass already, that's fine, the important failures are the repeat-related ones).

- [ ] **Step 3: Implement the cycle-and-refill logic**

Replace the entire contents of `src/utils/buildQueue.js` with:

```js
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildCorrectSequence(items, questionsPerSession) {
  if (items.length === 0 || questionsPerSession <= 0) return []

  const sequence = []
  let lastId = null

  while (sequence.length < questionsPerSession) {
    const pass = shuffle(items)

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

export default function buildQueue(items, numChoices, questionsPerSession) {
  const sequence = buildCorrectSequence(items, questionsPerSession)
  return sequence.map(correct => {
    const wrongPool = items.filter(item => item.id !== correct.id)
    const wrongCount = Math.min(numChoices - 1, wrongPool.length)
    const wrong = shuffle(wrongPool).slice(0, wrongCount)
    return { correct, choices: shuffle([correct, ...wrong]) }
  })
}
```

- [ ] **Step 4: Run the tests and confirm they all pass**

Run: `npx vitest run src/utils/__tests__/buildQueue.test.js`

Expected: PASS — all 13 tests green.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`

Expected: PASS — no other test file references `buildQueue`'s old capping behavior (confirmed during design research: only `src/hooks/useGameSession.js` and its own test file call `buildQueue`, and `useGameSession.test.js`'s `questionsPerSession` values never exceed its 4-item mock pool today, so none of its existing assertions change).

- [ ] **Step 6: Commit**

```bash
git add src/utils/buildQueue.js src/utils/__tests__/buildQueue.test.js
git commit -m "$(cat <<'EOF'
fix: buildQueue repeats items to fill questionsPerSession instead of truncating

Games whose item pool is smaller than the selected questions-per-session
setting (e.g. Animal Sounds' 12 items, Color Match's 11) previously capped
the session at the pool size, so a parent who picked 20 questions got 12 or
11 instead. buildQueue now cycles through evenly-shuffled full passes of the
pool until it reaches the requested count, with no item repeated on two
consecutive questions.
EOF
)"
```

---

### Task 2: Cover the fix at the `useGameSession` hook level

**Files:**
- Modify: `src/hooks/__tests__/useGameSession.test.js`

**Interfaces:**
- Consumes: `buildQueue` from Task 1 (already wired into `useGameSession.js` — no hook code changes needed, since it already just forwards `settings.questionsPerSession` into `buildQueue`).
- Produces: nothing new for later tasks; this is a leaf verification task.

- [ ] **Step 1: Add two tests immediately after the existing "loads a queue sized to questionsPerSession" test**

In `src/hooks/__tests__/useGameSession.test.js`, the file's mock `items` array (top of file, ~line 52) has 4 entries and `mockSettings.questionsPerSession` defaults to `3`. Insert the following two tests directly after the existing test block that ends at line 81 (`it('loads a queue sized to questionsPerSession', ...)`), inside the same `describe('useGameSession — existing behavior', ...)` block:

```js
  it('fills the queue to questionsPerSession even when the item pool is smaller', async () => {
    setSettings({ questionsPerSession: 10 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(10))
  })

  it('caps at questionsPerSession without repeats when the pool is at least as large', async () => {
    setSettings({ questionsPerSession: 4 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(4))
  })
```

- [ ] **Step 2: Run the test file and confirm both new tests pass**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`

Expected: PASS — all tests in the file green, including the two new ones. (They should pass immediately since Task 1 already fixed `buildQueue`; this task exists to lock in hook-level coverage of the fix, not to drive new implementation.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/__tests__/useGameSession.test.js
git commit -m "$(cat <<'EOF'
test(useGameSession): cover questionsPerSession fill behavior at the hook level

Locks in that useGameSession.total always matches the configured
questionsPerSession, both when the mock item pool is smaller (repeat-fill
path) and when it's exactly equal (no-repeat regression baseline).
EOF
)"
```

---

### Task 3: Update documentation

**Files:**
- Modify: `README.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Add a clarifying note to the Settings Reference**

In `README.md`, immediately after the Settings Reference table (currently ending at the "Google Analytics ID" row, followed by a blank line and then the `**Immediate**` paragraph — see current lines 277-279), insert a new paragraph before `**Immediate**`:

```markdown
**Questions per session** — if a game's item set is smaller than the selected count (for example, a 12-item game with "20" selected), items repeat to fill the session. Repeats are distributed evenly across the pool and the same item is never asked twice in a row.

```

So the surrounding text reads (table row for Google Analytics ID, then this new paragraph, then the existing Immediate/Parent tap/Google Analytics explanation paragraphs, unchanged).

- [ ] **Step 2: Verify the doc renders sensibly**

Run: `git diff README.md` and visually confirm the new paragraph sits between the table and the `**Immediate**` explanation, doesn't break table formatting, and doesn't duplicate the existing Google Analytics paragraph.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document that small item pools repeat to fill questionsPerSession"
```

---

### Task 4: Changelog and version bump

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:** None — metadata only.

- [ ] **Step 1: Add a changelog entry**

In `CHANGELOG.md`, insert a new section immediately after the `## Format follows...` line and before `## [0.21.0] - 2026-07-08` (i.e., as the new topmost dated entry):

```markdown
## [0.22.0] - 2026-07-09

### Fixed
- Games whose item pool is smaller than the selected "Questions per session" setting (e.g. Animal Sounds' 12 items, Color Match's 11) previously truncated the session to the pool size instead of honoring the configured count. `buildQueue` now cycles through evenly-shuffled full passes of the pool to fill the session exactly, with no item repeated on two consecutive questions.

```

- [ ] **Step 2: Bump the app version**

In `package.json`, change:
```json
  "version": "0.21.0",
```
to:
```json
  "version": "0.22.0",
```

In `package-lock.json`, change **both** occurrences (the top-level `"version": "0.21.0",` at line 3 and the root package entry's `"version": "0.21.0",` at line 9) to `"0.22.0"`.

- [ ] **Step 3: Verify version consistency**

Run: `grep -n '"version"' package.json package-lock.json | head -5`

Expected output shows `0.22.0` for `package.json`'s version and both of `package-lock.json`'s first two `version` fields.

- [ ] **Step 4: Run the full test suite one final time**

Run: `npm test -- --run`

Expected: PASS — all tests green (confirms the version/docs-only changes didn't touch any code path).

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md package.json package-lock.json
git commit -m "chore: bump version to 0.22.0 for questions-per-session fix"
```

---

## Self-Review Notes

- **Spec coverage:** Algorithm (Task 1), edge cases items=0/qps<=0/pool=1 (Task 1 tests), even distribution + no-adjacent-repeat guarantees (Task 1 tests), downstream `useGameSession.total` correctness (Task 2), README update (Task 3), CHANGELOG + version bump (Task 4). All spec sections have a corresponding task.
- **No placeholders:** every step has full, exact code or exact commands with expected output.
- **Type/signature consistency:** `buildQueue(items, numChoices, questionsPerSession)` signature and `{correct, choices}` entry shape are unchanged from the existing contract used by `useGameSession.js`, so no caller updates are needed anywhere.
