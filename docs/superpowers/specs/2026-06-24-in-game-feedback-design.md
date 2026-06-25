# Phase 1: In-Game Feedback — Celebration, Streak, Session Summary

Date: 2026-06-24
Status: Approved

## Context

Three backlog items from `docs/ENHANCEMENTS.md` are being implemented as the first of three phases pulled from a larger 9-feature request (the other two phases — dashboard features, and progress/admin features — are separate, later specs):

- Celebration animation on a correct answer
- Streak tracking, shown in the game header
- Richer end-of-game session summary showing missed items

`AnimalSoundsGame` and `ColorMatchGame` currently duplicate near-identical game-loop logic (queue building, answered/score/done state, results screen). Rather than adding these three features twice, the shared logic is extracted first and both games are refactored onto it.

The app is unpublished, so storage/settings schema changes do not need migration handling for existing user data.

## Architecture

### Shared engine

- `src/utils/buildQueue.js` — extracts the shuffle/queue-building function currently duplicated verbatim in both games. Signature: `buildQueue(items, numChoices, questionsPerSession)`.
- `src/hooks/useGameSession.js` — owns the game loop: `queue, index, answered, selected, score, streak, missed, done`. Exposes `handleChoice(item), advance(), restart(), finishGame()`. Correctness check is `item.id === current.correct.id` (already the convention in both games).
  - `streak` increments on each correct answer, resets to 0 on wrong.
  - `missed` accumulates `current.correct` for every wrong answer (cleared on restart).
  - On a correct answer: calls `fireConfetti()` if `settings.animationsEnabled`, and records the streak via `useBestStreak`.
  - On `finishGame()`: calls `addScore` with the existing `{ gameId, score, total, date, timestamp }` shape (unchanged).
- `src/hooks/useBestStreak.js` — wraps two new adapter methods, mirroring the existing `getSettings`/`saveSettings` whole-object pattern:
  - `getBestStreaks() → Promise<{ [gameId]: number }>`
  - `saveBestStreaks(map) → Promise<void>`
  - Exposes `bestStreak(gameId)` and `recordStreak(gameId, streak)` (only persists if `streak` exceeds the stored value).
  - New localStorage key: `playground_best_streaks`.
- `src/lib/confetti.js` — thin wrapper exporting `fireConfetti()`, the only file that imports `canvas-confetti`. Single mock seam for tests.

### Components

- `src/components/StreakBadge.jsx` — renders in the game header. Hidden when streak < 2, visible at ≥2 (avoids clutter at 0/1).
- `src/components/GameResults.jsx` — replaces the inline `results` JSX block duplicated in both games. Props: `score, total, missed, onPlayAgain, onHome, renderMissedItem`. Shows score/emoji as today, plus:
  - "Perfect run! 🎉" when `missed` is empty
  - otherwise a list of missed items, each rendered via the game-supplied `renderMissedItem(item)` (override point — Animal Sounds renders emoji+name, Color Match renders swatch+name)

### Refactor

`AnimalSoundsGame` and `ColorMatchGame` shrink to: call `useGameSession`, keep their bespoke question/choice rendering, add `<StreakBadge>` to the header, and replace their `results` block with `<GameResults>` passing their own `renderMissedItem`.

## Schema changes

- `DEFAULT_SETTINGS` (`src/storage/adapter.js`) gains `animationsEnabled: true`.
- Adapter interface gains `getBestStreaks()` / `saveBestStreaks(map)`, documented in the `adapter.js` interface comment alongside the existing four methods.
- `localStorageAdapter.js` implements both against the new `playground_best_streaks` key, following the same try/catch-and-fall-back-to-default pattern used by `getSettings`.

## Admin UI

New toggle in `AdminPage`, alongside the existing feedback-mode toggle: "Celebration animations: On / Off", wired through `updateSetting('animationsEnabled', ...)`.

## Confetti

`canvas-confetti` added as a runtime dependency. Triggered only via `fireConfetti()` from `useGameSession` on a correct answer, gated on `settings.animationsEnabled`. No `prefers-reduced-motion` auto-detection in this phase — the manual setting is the only control.

## Versioning & changelog

- A `CHANGELOG.md` is created at the repo root, used for this and all future changes (per [Keep a Changelog](https://keepachangelog.com/) conventions: `## [version] - date` sections with `Added`/`Changed`/`Fixed` subsections).
- `package.json` version bumps from `0.2.0` → `0.3.0` (minor, new features, no breaking changes).
- `CHANGELOG.md` gets a `## [0.3.0] - 2026-06-24` entry documenting: celebration animations, streak tracking, session summary, the new `animationsEnabled` setting, and the shared `useGameSession`/`GameResults`/`StreakBadge` refactor.
- CLAUDE.md's "Versioning" section is updated to mention `CHANGELOG.md` as part of the release process going forward.

## Testing

All new logic gets positive and negative cases:

- `buildQueue`: correct count and uniqueness of choices; edge case where `numChoices - 1` exceeds the number of available wrong items.
- `useGameSession`: streak increments on correct / resets on wrong; `missed` accumulates the right items and clears on restart; `fireConfetti` called only when correct AND `animationsEnabled` (not on wrong answers, not when disabled — mocked via `vi.mock('../lib/confetti')`); best streak persisted only when it exceeds the prior value; `finishGame` calls `addScore` with the existing shape; restart resets all state including streak/missed.
- `localStorageAdapter`: `getBestStreaks`/`saveBestStreaks` happy path plus malformed-JSON negative cases, matching the existing security-test style in `localStorageAdapter.security.test.js`.
- `StreakBadge`: hidden at streak 0 and 1, visible and correct at ≥2.
- `GameResults`: perfect-game case (no missed list) vs partial case (missed list rendered via `renderMissedItem`); play-again/home callbacks fire with correct args.
- Refactored `AnimalSoundsGame.test.jsx` / `ColorMatchGame` tests updated to mock `canvas-confetti`, verifying no regression in existing feedback-mode timing behavior (fake timers + `fireEvent`, per CLAUDE.md).
- `AdminPage` test: new `animationsEnabled` toggle persists via `updateSetting`.

## Documentation updates

- `README.md`: document the `animationsEnabled` setting and the celebration/streak/summary features.
- `docs/ENHANCEMENTS.md`: remove the three now-implemented backlog items.
- `docs/TESTING.md`: note the `canvas-confetti` mocking convention for future game authors.
- `CHANGELOG.md`: new file, see Versioning section above.
- `CLAUDE.md`: Versioning section updated to reference the changelog process.
