# Game Engine Core — Timer, Retries/Hints, Spaced Repetition, Difficulty Auto-Progression

Date: 2026-07-01
Status: Approved

## Context

Four backlog items from `docs/ENHANCEMENTS.md`'s "Core Game Engine" section are being implemented as the first of three phases pulled from a larger 7-feature request (the other two phases — personal best/milestone badges, and Parent Dashboard filter/labels — are separate, later specs):

- Timer display — surface `currentElapsedMs` from `useGameSession`
- Spaced repetition queue — re-ask recently missed items more often within a session
- Difficulty auto-progression — offer to raise `numChoices` after a perfect session
- Hint system — highlight the correct answer after N wrong taps, which requires the engine to allow retries (it currently locks on the first tap)

All four are core mechanics and belong in the shared engine (`useGameSession`/`buildQueue`), not bolted onto one game. Both existing games (`AnimalSoundsGame`, `ColorMatchGame`) are updated to support whatever the engine now exposes — this repo has exactly two games today and they already share the entire game-loop pattern (see the 2026-06-24 in-game-feedback spec), so there is no precedent for a feature living in only one of them.

A related backlog item — a real "answer within N seconds" time limit — is explicitly **not** implemented in this phase; it is added fresh to `docs/ENHANCEMENTS.md` instead. This matters architecturally: `currentElapsedMs` currently only ticks when a `timeLimitMs` prop is passed to `useGameSession` (`src/hooks/useGameSession.js:58`), and no game passes one, so it is permanently `0` today. The timer display in this phase is a pure stopwatch with no limit behind it, which requires making the interval always run rather than gating it on `timeLimitMs`.

The app is unpublished, so storage/settings schema changes do not need migration handling for existing user data.

## New settings

Added to `DEFAULT_SETTINGS` in `src/storage/adapter.js`:

| Setting | Type / values | Default | Notes |
|---|---|---|---|
| `timerDisplayEnabled` | boolean | `true` | shows the stopwatch; purely additive, no behavior change to scoring |
| `maxTries` | `'none' \| 1 \| 2 \| 3 \| 4 \| 5 \| 'unlimited'` | `'none'` | `'none'` reproduces today's exact behavior (locks on first tap, no retries) |
| `hintsEnabled` | boolean | `false` | opt-in; changes what a wrong tap reveals |
| `hintAfterWrongTaps` | `1-5` | `2` | only relevant/rendered in admin when `hintsEnabled` is true |
| `retryCountsAsStreak` | boolean | `true` | when true, a correct answer reached after retries keeps the streak alive; when false, it still counts as correct for score but resets the streak |
| `spacedRepetitionEnabled` | boolean | `false` | opt-in; changes queue order live during a session |
| `difficultyAutoProgressionEnabled` | boolean | `false` | opt-in; surfaces the post-session offer banner |

Defaults preserve today's exact gameplay unless a parent opts in, except `timerDisplayEnabled` (passive/additive, defaults on).

## Architecture

### `useGameSession` — retry/hint state machine

The current `answered` boolean is overloaded: it means both "locked, no more taps" and "reveal the correct answer" at once (via the existing `highlight-correct` CSS class already present in both games' choice-rendering, keyed off `answered && !isSelected && isCorrect`). These two concerns split:

- **`locked`** (replaces `answered` in the hook's return value) — true once the question is fully resolved: a correct tap, or wrong taps have reached the resolved `maxTries`. Drives the choice grid's `disabled` state and the `correct`/`wrong` reveal classes, exactly as `answered` does today.
- **`disabledChoiceIds`** (new, array) — ids of choices the child has tapped wrong so far this question. These render visually but are not tappable, without locking the question. Cleared on `advance()`/`restart()`.
- **`hintActive`** (new, boolean) — true once `wrongAttempts >= hintAfterWrongTaps` and `hintsEnabled` is on. Drives the `highlight-correct` class independently of `locked`, so the correct answer can be revealed before the question locks.

`handleChoice(item)` behavior:
1. If `locked`, no-op (unchanged).
2. If `item` is correct: record the timing entry (`attemptNumber` added to the existing `{ questionIndex, itemId, correct, durationMs }` shape), increment score, update streak (increment normally; if this was reached after 1+ wrong attempts and `retryCountsAsStreak` is false, reset to 0 instead of incrementing), fire confetti if enabled, set `locked = true`.
3. If `item` is wrong: add `item.id` to `disabledChoiceIds`, increment `wrongAttempts`, record a timing entry for the attempt. Resolve `maxTries` to a numeric bound (`'none'` → 1, `'unlimited'` → `Infinity`, else the numeric value). If `wrongAttempts >= resolvedMaxTries`, this is a final miss: append to `missed`, reset streak to 0, invoke the spaced-repetition reinsertion (below), and set `locked = true`. Otherwise the question stays open for another attempt.

`restart()` resets `disabledChoiceIds`, `wrongAttempts`, and `hintActive` alongside existing state.

### Spaced repetition queue

`buildQueue` is unchanged (still produces the initial shuffled array). `useGameSession` gains live reinsertion, triggered only on a **final** miss (after all retries in `maxTries` are exhausted — not on every individual wrong tap):

- Pick a random offset of 2–4 questions ahead of the current index (clamped to the remaining queue length).
- If a not-yet-asked item occupies that slot, swap it out: the missed item takes that slot, the displaced item is dropped from this session's queue. This keeps the total question count fixed at `questionsPerSession`.
- If there's no room (session is near its end), append the missed item as the new last question in the remaining queue, dropping the previous last item instead — same fixed-length invariant.
- Only active when `spacedRepetitionEnabled` is true; otherwise the queue is static as today.

This is a fixed-offset scheme rather than a weighted-random draw: sessions are short (5–20 questions), so "reappear within a few questions" delivers the intended effect without the complexity and non-deterministic testing surface of weighted sampling.

### Difficulty auto-progression

On `finishGame()`, if `difficultyAutoProgressionEnabled`, `score === total` (perfect session), and `numChoices < 4` (the existing ceiling in `AdminPage`'s radio group), the hook returns `offerDifficultyBump: true` alongside the existing result state. `GameResults` renders a dismissible banner ("Perfect session! Try {numChoices + 1} choices next time?") with Accept/Dismiss actions:
- Accept calls `updateSetting('numChoices', numChoices + 1)`.
- Dismiss just hides the banner for this results screen; it is not persisted as "don't ask again," so it can reappear after a future perfect session. (Simplicity choice — no additional setting for permanent dismissal in this phase.)

### Timer component

New `src/components/Timer.jsx` (or similar), rendered in both games' headers when `timerDisplayEnabled` is true. Requires the per-question interval effect in `useGameSession` (`src/hooks/useGameSession.js:51-74`) to always run (remove the `if (timeLimitMs)` gate around `setInterval`), since `currentElapsedMs` must tick regardless of whether a time limit exists. `timeLimitMs`/`onTimeout` stay as unused-today parameters (reserved for the future "answer within N seconds" backlog item) — the timeout `setTimeout` branch stays gated on `timeLimitMs` since that part *is* about enforcing a limit, only the elapsed-time interval becomes unconditional.

Displays as a simple numeric stopwatch (e.g. `"3.2s"`) with a lightweight animated visual accent (e.g. a subtly pulsing icon or ring) per your request for "something visually interesting" — no cosmetic progress-bar-toward-a-cap, since that would imply a limit that doesn't exist yet.

### Shared choice-rendering component

`AnimalSoundsGame` and `ColorMatchGame` currently duplicate an ~15-line choice-mapping block (class logic for `correct`/`wrong`/`highlight-correct`, `disabled={answered}`, `onClick`). Both need the same edit for `disabledChoiceIds`/`hintActive` support, so this block is extracted into a shared `src/components/GameChoiceGrid.jsx`. Props: `choices, selected, locked, disabledChoiceIds, hintActive, correctId, onChoose, renderChoice(item)` (render-prop for the game-specific visual — emoji+color background for Animal Sounds, swatch+text-color for Color Match), keeping each game's bespoke styling.

## Testing

Per `docs/TESTING.md`'s four layers:

- **Unit (Vitest):** extend `useGameSession.test.js` for the new retry/hint/spaced-repetition/difficulty-progression logic (positive and negative cases for each: retry sequencing, `disabledChoiceIds` accumulation, `hintActive` timing relative to `hintAfterWrongTaps`, lock only after resolved `maxTries`, streak behavior under both `retryCountsAsStreak` values, spaced-repetition reinsertion offset and fixed-length invariant, difficulty-offer flag only on a true perfect session and only below the `numChoices` ceiling). New tests for `GameChoiceGrid`, the `Timer` component, and the `GameResults` difficulty-offer banner. Extend `AdminPage.test.jsx` for the 7 new settings controls. Fake timers + `fireEvent` used wherever timing is involved, per the documented convention; `canvas-confetti` and `src/storage/index.js` mocked as usual.
- **Accessibility (jest-axe):** `expect(await axe(container)).toHaveNoViolations()` added to every new/changed component test — the stopwatch, disabled-choice buttons (proper `disabled`/`aria-disabled`), and the hint highlight (must not rely on color alone — pair with an icon or text cue).
- **E2E (Playwright):** extend both games' existing play-through specs with a retry-then-correct case and a retry-then-locked-with-hint case; add an admin-settings-persistence case covering the new settings, matching the existing pattern in `e2e/`.
- **Visual regression (Storybook + Playwright screenshots):** new stories for `Timer`, `GameChoiceGrid` in its disabled/hint states, and the difficulty-offer banner, each with a committed baseline screenshot.

## Documentation updates

- `README.md` — settings reference table gains the 7 new rows.
- `CHANGELOG.md` — new `## [0.6.0]` entry documenting all four features and the new settings.
- `package.json` — version bump `0.5.0` → `0.6.0`.
- `docs/ENHANCEMENTS.md` — move these four items from "Core Game Engine" into a new "Recently Completed" entry (`### v0.6.0 — Game Engine Core`); **add** a new backlog item under "Core Game Engine": *"Answer within N seconds — enforce `timeLimitMs`/`onTimeout` (already wired as unused parameters in `useGameSession`) as a configurable per-question time limit, pairing with the existing timer display."*
- `docs/TESTING.md` — no new test layer; no structural change needed unless the `GameChoiceGrid` extraction introduces a pattern worth documenting for future game authors (e.g. "new games should use `GameChoiceGrid` rather than duplicating choice-rendering").
