# Fix: Questions Per Session Doesn't Match Game Questions Per Session

GitHub Issue #34. Date: 2026-07-09.

## Problem

The admin "Questions per session" setting offers 5, 10, 15, or 20 (`DEFAULT_SETTINGS.questionsPerSession`, `src/storage/adapter.js`). Games build their session queue via `buildQueue(items, numChoices, questionsPerSession)` (`src/utils/buildQueue.js`), which does:

```js
const count = Math.min(questionsPerSession, items.length)
```

This silently truncates the session to the size of the game's item pool. Current pool sizes:

| Game | Items |
|---|---|
| Animal Sounds | 12 |
| Color Match | 11 |
| Character Match | 23 |

A parent who selects "20 questions per session" gets a 12-question Animal Sounds session and an 11-question Color Match session, with no indication why — the in-game progress (`current/total`) is internally consistent but never matches what was configured. Character Match happens to be unaffected today only because its pool exceeds the max selectable value.

## Fix

Change `buildQueue` to cycle through the item pool — reshuffling on each pass — until it has accumulated `questionsPerSession` correct-answer entries, instead of capping at `items.length`. This makes `queue.length === questionsPerSession` whenever the pool is non-empty and the session length is positive, which is the actual contract the setting promises.

Per-question **answer choices** (the `wrongPool` selection feeding `numChoices`) are unchanged — that logic already independently caps at the pool size and is orthogonal to this bug.

### Algorithm

Replace the single `shuffle(items).slice(0, count)` with a loop that:

1. Shuffles a full pass of `items`.
2. If the previous pass ended with the same item this pass would start with (and the pool has more than one item), swaps that first item with a different one in the same pass so no two adjacent questions repeat the same item across a pass boundary.
3. Appends items from the pass to the accumulating sequence until either the pass is exhausted or the target count is reached.
4. Repeats until the sequence reaches `questionsPerSession`.

This full-pass-cycling approach (rather than sampling with replacement) guarantees even distribution: every item appears `⌊n/pool⌋` or `⌈n/pool⌉` times in an n-question session, so no item is over- or under-represented. That matters here — this is a flash-card-style recognition game for toddlers, where consistent exposure per item is part of the design intent (matches the existing spaced-repetition precedent in `reinsertMissed.js`, which already treats seeing an item more than once per session as normal).

### Edge cases

- `items.length === 0` → return `[]` immediately (avoids an infinite loop, since a pass would never add anything).
- `questionsPerSession <= 0` → return `[]`.
- `items.length === 1` → every entry is necessarily that one item; the no-adjacent-repeat guard only applies when the pool has more than one item, so this doesn't loop or throw.
- `questionsPerSession <= items.length` → same observable behavior as before the fix: a single partial shuffled pass, no repeats.

### Downstream impact

None of the following need code changes — verified each only consumes `queue.length` / `timings`, not pool identity:

- `useGameSession`'s `total: queue.length` — now correctly reflects the configured session length, fixing the parent-facing progress bar and final `score/total`.
- `finishGame` — `isPerfect`, badge awarding (`questionsAnswered: total`), and personal-best recording all operate on `queue.length`/`timings`, which are already correct once `buildQueue` is fixed.
- `reinsertMissed` — index-based re-insertion of a missed entry into the queue; independent of whether the queue already contains repeated items.
- `GameResults`' missed-items list — already keys by `${item.id}-${i}`, so an item missed on more than one occurrence in a session renders correctly today with no dedup needed.

## Testing

**`src/utils/__tests__/buildQueue.test.js`** (update + add):
- Update the existing "caps queue length at the number of available items" test — it currently documents the bug. Replace with a positive test: requesting more questions than the pool has still returns exactly the requested count.
- Positive: even distribution — for `questionsPerSession` an exact multiple of `items.length`, every item's correct-id appears exactly `questionsPerSession / items.length` times.
- Positive: no two adjacent entries share the same `correct.id` when `items.length > 1`, across a run long enough to force multiple pass boundaries.
- Positive: `questionsPerSession <= items.length` still behaves as a single non-repeating pass (regression guard).
- Negative: `items = []` → returns `[]` regardless of `questionsPerSession` (no throw, no infinite loop).
- Negative: `questionsPerSession = 0` (and a negative value) → returns `[]`.
- Negative/edge: `items.length === 1` → returns an array of the requested length, all entries pointing at that one item, no throw.
- Existing choice-shape tests (correct-id-present-once, numChoices capping, no duplicate choice ids) remain valid and unchanged.

**`src/hooks/__tests__/useGameSession.test.js`** (add):
- Positive: with a mock `items` pool smaller than `questionsPerSession`, `result.current.total` equals `questionsPerSession` (not `items.length`) once the queue loads.
- Negative: sanity-check the pre-existing case where `questionsPerSession <= items.length` still yields `total === questionsPerSession` (already covered, keep as regression baseline).

No changes needed in per-game component tests (`AnimalSoundsGame.test.jsx`, etc.) — they don't assert on total session length independent of the hook.

## Documentation

- `README.md` Settings Reference: add a note under the "Questions per session" row (or as a line beneath the table) explaining that a game whose item pool is smaller than the selected count will repeat items to fill the session, distributed evenly, rather than truncating.
- `CHANGELOG.md`: new `[0.22.0]` entry under `### Fixed` describing the mismatch and the fix, bump `package.json` version to `0.22.0`.

## Out of scope

- Per-game settings UI (e.g., disabling unreachable radio options) — rejected during design in favor of always honoring the selected count via repetition.
- Changing `numChoices` capping behavior — unrelated axis, already correct.
