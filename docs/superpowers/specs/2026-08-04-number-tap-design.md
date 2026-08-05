# Number Tap — Design

Issue: #73 ("GAME - NUMBER TAP")

## Summary

A new game: a target number (1–5) is shown, the child taps that many objects on screen to build early counting skills. Unlike every existing game, the answer isn't "pick one of N discrete choices" — it's "select a subset of a larger pool until the count matches." That mechanic doesn't fit the existing `QuizGameShell`/`GameChoiceGrid` machinery, so this design (a) makes a small, behavior-preserving extraction inside `useGameSession` so the scoring/streak/timer/hint/retry/badge/personal-best/resume state machine can be driven by any interaction type, not just discrete choice-clicks, and (b) gives Number Tap its own rendering shell, following the precedent the memory games already set (they don't use `QuizGameShell` either).

Confirmed with the user: build the literal "tap individual objects" mechanic (not a fallback "pick the group with the matching count" quiz variant), and generalize the engine entry point so future similar mechanics can reuse it.

## Engine change — `src/hooks/useGameSession.js`

`handleChoice(item)` today does two things: (a) determines `isCorrect` by comparing the clicked item's id to `current.correct.id`, and (b) runs the entire per-attempt state machine (timings, score, streak, confetti, wrong-attempt counting, lock-as-missed, scheduling `advance`). Extract (b) into a new function:

```js
function handleAttempt(isCorrect) {
  // exact body of the current isCorrect-branch/else-branch/willLock logic
  // from handleChoice, unchanged — computed from current.correct.id, not
  // from any item the caller clicked
}
```

`handleChoice(item)` becomes:

```js
function handleChoice(item) {
  if (blockedRef.current || lockedRef.current) return
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

This is a pure refactor — every existing quiz/discrete-choice game keeps identical behavior (same timings entries, same `disabledChoiceIds` bookkeeping, same lock/advance timing). `handleAttempt` is added to the hook's returned object alongside `handleChoice`, so a game with no discrete "choices" array can report correctness directly.

No other change to `useGameSession` is needed — `buildQueue`/`items`/`current.correct` already work for Number Tap's queue (each queue entry's `correct` is a target-number item; the `choices` array `buildQueue` also builds is simply unused by this game, same as `numChoices` is otherwise unused here).

## Game mechanic

- **Items** (`src/games/number-tap/data/numbers.js`): 5 entries, `{ id: 'number-1' .. 'number-5', value: 1..5 }`. `questionsPerSession` still comes from the shared settings, drawn via the existing `buildQueue`/spaced-repetition/adaptive-selection machinery — Number Tap inherits all of it for free.
- **Object pool**: on each question, one icon is chosen at random from a fixed set (🍎 apple, ⭐ star, 🎈 balloon, ⚽ ball, 🌸 flower) and repeated `poolSize` times, where `poolSize = target + random(1..3)` (no upper cap needed — target tops out at 5 and extra tops out at 3, so pool size never exceeds 8 anyway). This guarantees there's always room for a wrong count — without at least one spare object, every question would be trivially correct. Computed once per question via `useMemo` keyed on `current.correct.id` so the pool doesn't reshuffle position on unrelated re-renders.
- **Interaction**: tapping an object toggles it selected/unselected (`aria-pressed`, not `aria-disabled` — unlike memory tiles, a tap here isn't a one-way commitment, so a misclick can be undone before confirming). A "Done ✓" button is always visible below the grid.
- **Evaluation**: only runs when "Done" is pressed (not per-tap — see below for why), comparing the tapped count at that moment to the target:
  - tapped count === target → `handleAttempt(true)` (correct)
  - tapped count ≠ target (too few or too many) → `handleAttempt(false)` (wrong)

  *Rejected alternative*: auto-evaluate after every tap, locking in "correct" the instant the running count first reaches the target, no button. This was the original plan approved with the user, but it doesn't work: since a tap only ever increases the count by one, the count always passes through exactly `target` before it could ever exceed it — so the question would always auto-lock as correct at that instant, and the child could never overshoot. The only way to ever be wrong would be a countdown timeout, which doesn't test counting at all. Caught during implementation planning and corrected with the user in favor of the explicit-button approach above.
- **Retry**: on a wrong "Done" press where tries remain (`maxTries` not yet exhausted), selections clear back to zero and the same pool stays on screen so the child recounts from scratch. On the final wrong attempt, `handleAttempt` locks the question as missed exactly as it does for discrete-choice games (existing `lockAsMissed`/`feedbackMode==='immediate'` advance-after-1500ms path, or the `parent-tap` Next-button path — both already handled by the hook and reused verbatim).
- **Hints**: when `hintActive` (existing `hintsEnabled`/`hintAfterWrongTaps` settings), the first `target` untapped objects (in DOM order) get a pulsing highlight, opacity scaled by `hintStrength` — the same ramp `GameChoiceGrid` already applies to the correct choice, just targeting a set of objects instead of one button.
- **Reveal on lock**: while locked (whether from the final wrong attempt or from a timeout), the first `target` objects (in DOM order, regardless of tap state) are highlighted as the "correct answer," mirroring how discrete-choice games reveal the correct choice when locked.
- **Timer/timeout**: untouched — `useGameSession`'s timeout effect already fires independent of how answers are submitted; `handleTimeout` already calls `lockAsMissed`, which needs no changes.

## Rendering — `src/games/number-tap/`

Does not use `QuizGameShell` (built around a discrete choice grid, which doesn't apply here). Following the `animal-memory-match`/`useMemorySession` precedent, `index.jsx` composes `GameIntro`, `GameResults`, `Timer`, and the shared correct/wrong live-region announcement pattern directly, calling `useGameSession` itself. The tappable object grid renders inline in `index.jsx` rather than as a separate component file — no game in this repo currently splits its board markup into a local subcomponent (`GameChoiceGrid`/`MemoryBoard` are shared *components* precisely because 2+ games use each; nothing here would share a `NumberTapBoard`), so a standalone file would be an unfollowed convention, not an established one.

### `src/games/number-tap/manifest.json`

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

`#90CAF9` (pastel blue) doesn't collide with any of the 8 existing per-game `color` values.

### i18n

Prompt is `"Tap {{count}}!"` — deliberately not a counted noun phrase ("Tap 3 apples!") since no existing game in this repo uses i18next pluralization (`_one`/`_other`/etc.) and introducing it for one string isn't worth the added translation surface across `en`/`es`/`pl`. Per-object accessible names use a fixed singular noun plus index (e.g. "Apple 2") for uniqueness, which needs no pluralization either. Keys (`src/games/number-tap/i18n/{en,es,pl}.json`):

- `numberTap.manifestName`, `numberTap.manifestDescription`
- `numberTap.howToPlay` — "A number appears — tap that many things on the screen!"
- `numberTap.prompt` — "Tap {{count}}!"
- `numberTap.objectLabel` — "{{name}} {{index}}"
- `numberTap.objects.apple` / `.star` / `.balloon` / `.ball` / `.flower`

## Testing (positive + negative, per project convention)

- **`src/hooks/__tests__/useGameSession.test.js`** (existing file, extend): add cases exercising `handleAttempt(true)`/`handleAttempt(false)` called directly (bypassing `handleChoice`), confirming score/streak/timings/lock/retry behavior matches calling `handleChoice` with a matching/non-matching item — i.e., the refactor is behavior-preserving for existing games *and* correct for the new direct-boolean path.
- **`src/games/number-tap/__tests__/numbers.test.js`**: data shape sanity (5 entries, values 1–5, unique ids).
- **`src/games/number-tap/__tests__/NumberTapGame.test.jsx`**:
  - *Positive*: tapping exactly `target` objects, then pressing Done, scores a point, advances, eventually reaches `GameResults`; personal-best and badge wiring fires the same as other games (mock the same seams `animal-sounds`/`emotions-match` tests mock).
  - *Positive*: retry path — pressing Done with the wrong count once (tries remaining) clears the selection, then tapping exactly `target` and pressing Done again on the second attempt still counts as a (non-streak, per `retryCountsAsStreak` setting) correct answer.
  - *Negative*: pressing Done with the wrong count on the final allowed try locks the question as missed and it appears in the results' missed list.
  - *Negative*: timeout (countdown `timerMode`) locks the question as missed without any taps.
  - A11y: tapped objects toggle `aria-pressed`; the Done button is a real `<button>`; hint highlighting appears only once `hintActive` is true.
- **`src/games/number-tap/NumberTapGame.stories.jsx`**: Storybook story matching the `EmotionsMatchGame.stories.jsx` precedent from this branch.

## Docs / versioning

- Remove the "Number Tap" line from `docs/ENHANCEMENTS.md`'s New Games list.
- Add a `CHANGELOG.md` entry.
- Bump `package.json` version and `src/games/number-tap/manifest.json` version (both to the next patch/minor per existing convention — this is a new feature, so minor).
- No `README.md` change beyond what the auto-discovery already covers, unless README maintains an explicit game list (verify during implementation).
