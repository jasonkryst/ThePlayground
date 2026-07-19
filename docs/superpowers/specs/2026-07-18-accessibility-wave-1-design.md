# Accessibility Wave 1 — Design (Issue #82)

**Date:** 2026-07-18
**Scope:** The three findings named in issue #82 (AU-1, AU-3, AU-6 from `docs/accessibility_usability.md`). AU-2 already shipped in v0.26.0; AU-4/5/7/8 are separate backlog items, not touched here.

## Decisions made during brainstorming

- **AU-1 glyph timing:** the ✓/✗ glyph appears only on the post-lock answer reveal (`.correct`, `.wrong`, and the lock-driven variant of `.highlight-correct`). It does **not** appear during the pre-lock hint ramp (`hintActive` without `locked`) — that stays a color-only, deliberately gradual nudge, unchanged by this work.
- **AU-1 outline mechanism:** `border`, not `outline` or `box-shadow`. `outline` is already claimed by `:focus-visible`, and a keyboard user's just-activated choice can legitimately be both focused and in a feedback state at the same instant — reusing `outline` would make one clobber the other. `box-shadow` is already driven by the `pulse-green`/`shake-red` keyframes, which would visually erase a static ring once the animation's `forwards` fill-mode settles. `border` is unclaimed by both and is already the technique this codebase uses for the same "add a ring around a choice" purpose (`.game__choice--bordered` in `ColorMatchGame.css`).
- **AU-6 formatter caching:** deliberately *not* cached (unlike `dateRangeUtils.js`'s per-locale month-formatter cache). `Intl.DateTimeFormat`'s resolved timezone is fixed at construction time, not read live on each `.format()` call — caching would freeze a stale timezone in a long-lived tab and would make the fix's own regression test (which stubs `TZ` mid-test) order-dependent on whichever test constructs the formatter first. `ScoreHistory` renders a bounded, small list, so the perf case for caching doesn't apply here the way it does for a heatmap's per-cell formatting.
- **Out of scope:** `ParentDashboard.jsx` has two more raw-ISO-date spots (trend table cells, heatmap tooltips) with the same underlying issue as AU-6, but issue #82 only names `ScoreHistory.jsx`. Left untouched; worth a future `docs/ENHANCEMENTS.md` entry if wanted.

## 1. AU-3 — Keyboard focus on quiz choices (`GameChoiceGrid.jsx`)

Mirrors the `bd6f16f` memory-tile fix exactly.

**Before:**
```jsx
disabled={locked || isDisabledWrong}
onClick={() => onChoose(item)}
```

**After:**
```jsx
const isChoiceDisabled = locked || isDisabledWrong
...
aria-disabled={isChoiceDisabled}
onClick={() => { if (!isChoiceDisabled) onChoose(item) }}
```

The button keeps its place in the tab order and stays focusable through the lock→advance transition; screen readers still announce it as disabled via `aria-disabled`. The underlying `handleChoice` in `useGameSession` already independently guards against locked/already-tried taps (belt-and-braces), so this change is purely about focus/DOM semantics, not about preventing double-scoring.

**CSS (`GameChoiceGrid.css`):** the two `:disabled` selectors become attribute selectors:
```css
.game__choice[aria-disabled="true"] { cursor: default; }
.game__choice:hover:not([aria-disabled="true"]) { transform: scale(1.04); }
```
No other stylesheet in the repo targets `.game__choice:disabled`, so this is the full CSS blast radius.

## 2. AU-1 — Non-color quiz feedback (`GameChoiceGrid.jsx` / `.css`)

**Glyph logic**, computed alongside the existing `cls` string (same three conditions that already drive `correct`/`wrong`/`highlight-correct`, so it can never desync from the color state):
```jsx
let glyph = null
if (locked && isSelected && isCorrect) glyph = '✓'
else if (locked && isSelected && !isCorrect) glyph = '✗'
else if (locked && !isSelected && isCorrect) glyph = '✓'
```
Rendered as a trailing sibling inside the button:
```jsx
{glyph && <span className="game__choice-glyph" aria-hidden="true">{glyph}</span>}
```
`aria-hidden` because the announcement channel is AU-2's job (already shipped) — this glyph is a sighted-user non-color signal only.

**CSS additions (`GameChoiceGrid.css`):**
```css
.game__choice-glyph {
  position: absolute;
  top: 6px;
  right: 10px;
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1;
  color: var(--color-text);
  pointer-events: none;
}

.game__choice.correct,
.game__choice.highlight-correct {
  border: 4px solid var(--color-teal-dark);
}

.game__choice.wrong {
  border: 4px solid var(--color-error);
}
```
The border rules apply only on the state classes (not reserved as a transparent border at rest), so no existing default-state visual baseline shifts — only the feedback-state baselines are new/changed.

**Storybook (`GameChoiceGrid.stories.jsx`):** add a `LockedWrong` story (currently only `Locked`, i.e. correct, exists) so both the wrong-choice ring/glyph and the correct-choice reveal ring/glyph are captured together in one frame.

**Visual regression:** `e2e/visual.spec.js` baselines for `Locked` (and the new `LockedWrong`) story will need regeneration since the button's rendered appearance changes.

## 3. AU-6 — Localized score-history dates (`ScoreHistory.jsx`)

```jsx
function formatScoreDate(isoDate, locale) {
  try {
    const [year, month, day] = isoDate.split('-').map(Number)
    // Validate parsed components to catch malformed dates early
    if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
      return isoDate
    }
    const date = new Date(year, month - 1, day)
    // Check if the date is valid
    if (Number.isNaN(date.getTime())) {
      return isoDate
    }
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
  } catch {
    return isoDate
  }
}
```
**Hardened during implementation (not in the original sketch below the fold of this spec's first draft):** a pre-existing regression suite, `src/components/__tests__/ScoreHistory.security.test.jsx`, feeds `date` malicious/malformed strings (an XSS payload, an attribute-injection string) to prove `ScoreHistory` never crashes or executes injected markup. A naive `isoDate.split('-').map(Number)` on a hyphen-less payload yields `NaN` components; `new Date(NaN, NaN, NaN)` is an `Invalid Date`; `Intl.DateTimeFormat.prototype.format()` throws a `RangeError` on an `Invalid Date`. `formatScoreDate` therefore validates the parsed components and falls back to returning `isoDate` verbatim (still safely escaped by React's default JSX text-child rendering) rather than throwing. Do not simplify this back to the two-function sketch without re-running that security suite.

Used in place of the raw `s.date ?? ...` interpolation:
```jsx
{s.date ? formatScoreDate(s.date, i18n.language) : new Date(s.timestamp).toLocaleDateString()}
```
`i18n.language` is already available via `useTranslation()`, just not currently destructured in this component.

Verified numerically (Node REPL) that this avoids the shift: naive `new Date('2026-06-07')` displayed under `TZ=America/Los_Angeles` renders `Jun 6, 2026`; `parseIsoDateLocal('2026-06-07')` renders `Jun 7, 2026` under the same TZ. The legacy no-`date` fallback path (`new Date(s.timestamp).toLocaleDateString()`) is untouched.

## Testing plan

Positive and negative cases at each layer, per standing preference.

**`GameChoiceGrid.test.jsx`** (replaces the `toBeDisabled()` assertions):
- Positive: locked/disabled-wrong choices carry `aria-disabled="true"`; non-disabled choices carry `aria-disabled="false"`; a disabled choice can still receive focus (`.focus(); expect(...).toHaveFocus()`).
- Negative: clicking an `aria-disabled` choice does not call `onChoose`.
- Positive: glyph present and correct (`✓`/`✗`) for each of the three locked states.
- Negative: no glyph rendered when not locked; no glyph on `highlight-correct` during the hint-only (non-locked) ramp; no glyph on `.game__choice--disabled-wrong`.
- Existing axe scan continues to cover the new markup/attributes.

**Per-game tests** (`ColorMatchGame`, `AnimalSoundsGame`, `CharacterMatchGame`, `CharacterMatchGameBluey` — wherever `toBeDisabled()` currently appears): update to assert `aria-disabled` instead, and add a focus-survives-lock assertion in at least one game as an integration-level check (mirroring how `AnimalMemoryMatchGame.test.jsx` got a companion update in the memory-tile fix).

**`ScoreHistory.test.jsx`:**
- Positive: a score with `date` renders the localized/formatted string (e.g. `Jun 7, 2026` for `en`).
- Negative: the raw ISO string (`2026-06-07`) is no longer present in the DOM.
- Positive: a legacy score without `date` still falls back to `toLocaleDateString()` on `timestamp`.
- Positive/negative timezone-boundary case: with `vi.stubEnv('TZ', 'America/Los_Angeles')`, a `2026-06-07` score still renders `Jun 7`, not the pre-fix `Jun 6` — directly exercising the day-shift bug this change fixes.
- Existing axe scan.

## Docs

- `docs/ENHANCEMENTS.md` § Accessibility: remove the AU-1, AU-3, AU-6 bullets (shipped).
- `CHANGELOG.md`: new `### Fixed` entry under the next version bump, issue #82 + AU-1/AU-3/AU-6.
- `docs/accessibility_usability.md` is a point-in-time audit record and is not edited retroactively (per its own header note) — left as-is.
