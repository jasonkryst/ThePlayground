# Graduated Hint Intensity — Design

**Issue:** #20 · **Date:** 2026-07-16 · **Status:** Approved

## Problem

`useGameSession`'s hint mechanism (`hintsEnabled`, `hintAfterWrongTaps`) is a flat
on/off signal today: once wrong attempts on the current question reach
`hintAfterWrongTaps`, `GameChoiceGrid` highlights the correct choice at full,
constant intensity for every remaining attempt. Issue #20 asks that the highlight
scale with urgency — subtle when several tries remain, and unmistakably bold when
only one try is left before the question locks as missed.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Core semantics | Hint intensity ramps with tries remaining: subtlest at the first hint-eligible attempt, full/bold on the last try before lock |
| Visual mechanism | Opacity ramp on the existing green (`#a5d6a7`) hint fill, via a `::after` overlay (not a swap of `background`) |
| `maxTries: 'unlimited'` | No natural "last try" exists; ramp over a fixed 3 wrong attempts past the threshold, then hold at full bold |
| Opacity floor | None added — the admin UI's ranges (`hintAfterWrongTaps` 1–5, numeric `maxTries` 1–5) cap the subtlest step at `1/4 = 25%`, already comfortably visible |
| Locked-state reveal (existing, unrelated feature) | Unchanged — stays solid/full-strength; the ramp only applies to the pre-lock hint |

## Data model: `hintStrength`

`useGameSession` gains a new return field, `hintStrength` (`number`, `0`–`1`),
alongside the existing `hintActive` boolean (semantics unchanged — still the
on/off gate; `hintStrength` is only meaningful while `hintActive` is `true`,
otherwise `0`).

```
resolvedMaxTries   = resolveMaxTries(maxTries)          // existing helper
effectiveMaxTries  = resolvedMaxTries === Infinity
                       ? hintAfterWrongTaps + UNLIMITED_HINT_RAMP_STEPS   // = 3
                       : resolvedMaxTries
totalHintSteps     = effectiveMaxTries - hintAfterWrongTaps
triesRemaining     = effectiveMaxTries - wrongAttempts
step               = clamp(totalHintSteps - triesRemaining + 1, 1, totalHintSteps)
hintStrength       = hintActive ? step / totalHintSteps : 0
```

Worked examples:
- `maxTries: 3, hintAfterWrongTaps: 1` → `totalHintSteps = 2`. First hint-eligible
  wrong attempt (`wrongAttempts === 1`) → strength `0.5`. Last try
  (`wrongAttempts === 2`) → strength `1`.
- `maxTries: 2, hintAfterWrongTaps: 1` → `totalHintSteps = 1`. The threshold *is*
  the last try, so strength is `1` immediately — satisfies "have one try, be bold
  about it" with no in-between subtlety.
- `maxTries: 'unlimited', hintAfterWrongTaps: 2` → ramps `1/3, 2/3, 1` across
  wrong attempts 2, 3, 4, then holds at `1` for any further wrong attempt.
- `maxTries: 'none'` (resolves to `1` try) or `hintAfterWrongTaps >= resolvedMaxTries`
  → `hintActive` never becomes `true` before lock (existing behavior, unchanged) —
  `hintStrength` stays `0`.

`hintStrength` resets to `0` on `advance()` (next question) and `restart()`,
mirroring the existing `wrongAttempts` reset.

## Visual rendering

Today: `.highlight-correct { background: #a5d6a7 !important; }`. The `!important`
is load-bearing (see `src/index.css`'s comment) because Color Match/Animal Sounds
set an inline swatch `background` that only `!important` can override. Varying
that background's alpha directly would composite against whatever's *behind* the
button (page background), not the swatch it replaces — a faded hint on a red
swatch would look washed-out-on-white rather than faded-red-toward-green.

Instead, layer a translucent overlay on top of the button's real background:

- `.game__choice` gains `position: relative`.
- New rule:
  ```css
  .game__choice.highlight-correct::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: #a5d6a7;
    opacity: var(--hint-strength, 1);
    pointer-events: none;
    z-index: -1;
    transition: opacity 0.15s ease;
  }
  ```
  Per CSS stacking rules, a negative-`z-index` absolutely-positioned child paints
  above its containing block's own background/border but below normal-flow
  content — so this tints the real swatch color while keeping the emoji/text
  legible on top.
- `GameChoiceGrid` sets the `--hint-strength` CSS custom property inline **only**
  on the hint-driven highlight (`hintActive && !locked` case), merged into
  whatever `style` the game's `getChoiceProps` already supplies (so Color Match's
  swatch `style` isn't clobbered). The **locked** reveal (round over, answer
  shown) sets no inline var, so `var(--hint-strength, 1)` defaults to `1` —
  today's solid look, unchanged.
- The existing flat `.highlight-correct { background: ... !important }` rule is
  removed (superseded by the overlay); `.correct`/`.wrong` keep their own
  `!important` background rules as-is (untouched by this change).

## Wiring

Same path as today's `hintActive`: `useGameSession` → `QuizGameShell` →
`GameChoiceGrid`. No game-level code changes — Color Match, Animal Sounds,
Character Match, and Fruit & Veggie ID all consume this through the shared
`QuizGameShell`/`GameChoiceGrid` pair and need no per-game changes.

## Testing plan

- **`useGameSession`** (`src/hooks/__tests__/useGameSession.test.js`):
  - Positive: `hintStrength` ramps correctly across `wrongAttempts` for a
    multi-step numeric `maxTries` case; reaches exactly `1` on the last try;
    single-step case (`totalHintSteps === 1`) is `1` immediately; unlimited-tries
    ramps over 3 steps then holds at `1` for further wrong attempts.
  - Negative: `hintStrength` is `0` when `hintsEnabled` is `false` regardless of
    wrong taps; `0` before `hintAfterWrongTaps` is reached; resets to `0` on
    `advance()` and on `restart()`.
- **`GameChoiceGrid`** (`src/components/__tests__/GameChoiceGrid.test.jsx`):
  - Positive: hinted correct choice gets an inline `--hint-strength` style
    matching the `hintStrength` prop; merges correctly with an existing inline
    `style` from `getChoiceProps` (swatch color preserved alongside the var).
  - Negative: locked reveal gets no inline `--hint-strength` (relies on the CSS
    default); non-correct / non-hinted choices get no `highlight-correct` class
    or var at all.
- **`QuizGameShell`** (`src/components/__tests__/QuizGameShell.test.jsx`):
  - Positive: `hintStrength` from the session is passed through to
    `GameChoiceGrid`.
- **Stories** (`src/components/GameChoiceGrid.stories.jsx`): replace the single
  `HintActive` story with `HintActiveSubtle` (low strength, e.g. `0.33`) and
  `HintActiveBold` (strength `1`).
- **Visual regression** (`e2e/visual.spec.js`): swap
  `components-gamechoicegrid--hint-active` for the two new story IDs; regenerate
  baselines with `npx playwright test visual.spec.js --update-snapshots` after
  the implementation lands.

## Documentation

- `README.md` line 333 (hints description) updated to describe the ramp instead
  of a flat highlight.
- `docs/adapter.js` JSDoc / settings reference: no shape change (`hintStrength`
  is a derived session value, not a persisted setting), so no `adapter.js`
  changes needed.
- `CHANGELOG.md`: new entry for this change.
- `package.json` version bump per CLAUDE.md convention.

## Out of scope

- No new admin/settings UI — the ramp is fully derived from existing
  `hintsEnabled`, `hintAfterWrongTaps`, and `maxTries` settings.
- No change to the locked-state answer reveal's visual treatment.
- No change to non-quiz (memory) games — hints are a quiz-only concept today.
