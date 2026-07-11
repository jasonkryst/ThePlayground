# Fastest-Board Personal Best for Memory Games — Design

**Date:** 2026-07-11
**Issue:** #51 (final remaining item; the stat tiles and fewest-flips record shipped in PR #50)
**Branch:** 51

## Goal

Add a "fastest board time" personal best for memory games, alongside the existing
fewest-flips record. When a session finishes faster than the stored record for the
same board size, persist the new time and announce it on the results screen.

Issue #49 (header redesign) was explicitly descoped from this work per user decision.

## Storage shape

Additive extension of the existing `personalBests[gameId]` slot — no migration:

```js
{
  fewestFlips: { [pairs]: { flips, timestamp } },   // existing
  fastestMs:   { [pairs]: { ms, timestamp } }        // new
}
```

Records are keyed per board size (`pairs`), same rationale as fewest-flips: a
3-pair time must never compete with a 6-pair record. Changing the `memoryPairs`
setting never invalidates old records; each board size keeps its own entry.

## Record semantics

Mirrors fewest-flips exactly:

- **First-ever session** for a board size: persist the time, but `isNewRecord: false`
  (no banner — there is nothing to beat).
- **Strictly faster** than the stored record: persist, `isNewRecord: true`.
- **Tie or slower:** do not persist, `isNewRecord: false`.
- The two records evaluate **independently** — a session can improve flips but not
  time, time but not flips, both, or neither. Persistence is per-record.

## Changes

1. **`src/utils/evaluateMemoryPersonalBest.js`** — accept `durationMs`; return
   `{ fewestFlips, fastestMs, updatedBests }` where
   `fastestMs = { isNewRecord, value, previous }` (`previous` is the stored
   `{ ms, timestamp }` entry for this board size, or `null`).
2. **`src/hooks/usePersonalBest.js`** — `recordMemorySession({ flipAttempts, pairs, durationMs })`;
   return `fastestMs` alongside `fewestFlips`.
3. **`src/hooks/useMemorySession.js`** — in `finishGame`, compute `durationMs` once
   and pass the same value to both `addScore` and `recordMemorySession` (today it is
   computed inline for `addScore` only).
4. **`src/components/GameResults.jsx` + `src/i18n/en.json`** — new banner keyed
   `common.newFastestBoardRecord`:
   `"⏱️ New record! Finished in {{seconds}}s (was {{prevSeconds}}s)"` —
   seconds formatted `(ms / 1000).toFixed(1)`, matching the quiz speed record.

## Testing

Positive and negative cases at every layer:

- **`evaluateMemoryPersonalBest`**: first session persists ms with
  `isNewRecord: false`; faster time is a record and persists; slower time is
  neither persisted nor a record; exact tie is not a record; a different board
  size's record is not compared against; flips-improved-but-time-worse persists
  only the flips entry (and the reverse); `updatedBests` preserves other games'
  data untouched.
- **`usePersonalBest`**: `recordMemorySession` forwards `durationMs` and persists
  the merged bests via the adapter; returns both record results.
- **`useMemorySession`**: `finishGame` passes `durationMs` to
  `recordMemorySession`, equal to the `durationMs` written on the score record.
- **`GameResults`**: banner renders when `fastestMs.isNewRecord` is true; absent
  when false or when `fastestMs` is missing (older callers); stacks with the
  fewest-flips banner when both fire.

Timed tests use `vi.useFakeTimers()` + `fireEvent` per the project testing notes.

## Docs & versioning

- `CHANGELOG.md` entry.
- README personal-best section updated to mention the fastest-board record.
- Bump `package.json` (0.23.0 → 0.24.0) and
  `src/games/animal-memory-match/manifest.json` (1.0.0 → 1.1.0).
- Closing comment on issue #51 when merged.

## Out of scope

- Issue #49 header redesign (user descoped).
- Surfacing fastest times on the kids progress page or parent dashboard (the
  stat tiles shipped in PR #50 are unchanged).
- Any change to quiz-game personal bests (`evaluatePersonalBest`).
