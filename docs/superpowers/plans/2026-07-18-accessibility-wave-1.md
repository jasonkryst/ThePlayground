# Accessibility Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three fixes named in GitHub issue #82 (AU-1, AU-3, AU-6 from `docs/accessibility_usability.md`): non-color quiz answer feedback, keyboard-focus-preserving quiz choices, and localized score-history dates.

**Architecture:** All three fixes live in `src/components/` (`GameChoiceGrid.jsx`/`.css` for AU-1 and AU-3, `ScoreHistory.jsx` for AU-6) and are consumed automatically by every quiz game through the existing `QuizGameShell` → `GameChoiceGrid` wiring — no per-game changes to game logic, only to the game-level tests that assert on the choice buttons' disabled state.

**Tech Stack:** React 18, Vitest + React Testing Library + jsdom, `jest-axe`, Storybook 8, Playwright (visual regression).

## Global Constraints

- Design tokens (colors) come from CSS custom properties in `src/index.css` — never hardcode hex values in new CSS (per `CLAUDE.md`). Use `var(--color-teal-dark)` and `var(--color-error)`, both already defined.
- Tests covering timed feedback must use `vi.useFakeTimers()` with `fireEvent`, not `userEvent` (per `CLAUDE.md` — this plan does not touch timer-dependent code, noted for context only).
- The full spec is `docs/superpowers/specs/2026-07-18-accessibility-wave-1-design.md` — every task below implements one section of it verbatim.

---

### Task 1: AU-3 — keyboard focus on quiz choices (`GameChoiceGrid`)

**Files:**
- Modify: `src/components/GameChoiceGrid.jsx`
- Modify: `src/components/GameChoiceGrid.css`
- Modify: `src/components/__tests__/GameChoiceGrid.test.jsx`

**Interfaces:**
- Produces: `GameChoiceGrid`'s rendered `<button>` elements now carry `aria-disabled="true"/"false"` instead of the native `disabled` attribute. `onChoose(item)` is only invoked when neither `locked` nor the item's id is in `disabledChoiceIds`. This behavior is relied on by Task 3 (which adds more attributes to the same button) and Task 2 (which updates game-level tests against this new attribute).

- [ ] **Step 1: Update `GameChoiceGrid.test.jsx`'s disabled-state tests to expect `aria-disabled`, and add focus/click-guard coverage**

Replace the three existing tests (`disables all choices when locked`, `disables only the wrong-tapped choice when not locked`, and the `game__choice--disabled-wrong` class test stays as-is) with:

```jsx
  it('marks all choices aria-disabled when locked, but keeps the native disabled state off', () => {
    renderGrid({ locked: true })
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toHaveAttribute('aria-disabled', 'true')
      expect(btn).not.toBeDisabled()
    }
  })

  it('aria-disables only the wrong-tapped choice when not locked', () => {
    renderGrid({ disabledChoiceIds: ['b'] })
    expect(screen.getByText('B').closest('button')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('A').closest('button')).toHaveAttribute('aria-disabled', 'false')
  })

  it('marks a disabled wrong choice with the disabled-wrong class, not locked', () => {
    renderGrid({ disabledChoiceIds: ['b'] })
    expect(screen.getByText('B').closest('button')).toHaveClass('game__choice--disabled-wrong')
  })

  it('keeps keyboard focus on a choice after it becomes aria-disabled (locked)', () => {
    renderGrid({ locked: true, selected: 'a' })
    const btn = screen.getByText('A').closest('button')
    btn.focus()
    expect(btn).toHaveFocus()
  })

  it('does not call onChoose when a locked choice is clicked', () => {
    const onChoose = vi.fn()
    renderGrid({ locked: true, onChoose })
    screen.getByText('A').click()
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('does not call onChoose when an already-tried wrong choice is clicked', () => {
    const onChoose = vi.fn()
    renderGrid({ disabledChoiceIds: ['b'], onChoose })
    screen.getByText('B').click()
    expect(onChoose).not.toHaveBeenCalled()
  })
```

Place these where the three replaced tests were (right after the `applies extra props from getChoiceProps` test, before `shows correct/wrong classes only once locked`).

- [ ] **Step 2: Run the test file and confirm the new/changed assertions fail**

Run: `npx vitest run src/components/__tests__/GameChoiceGrid.test.jsx`
Expected: FAIL — `aria-disabled` assertions fail because the button currently has no such attribute; the "keeps keyboard focus" test fails because a native-`disabled` button cannot receive focus.

- [ ] **Step 3: Implement the `aria-disabled` + click-guard change**

In `src/components/GameChoiceGrid.jsx`, add a computed disabled flag right after the existing `isHintedCorrect` line:

```jsx
        const isHintedCorrect = hintActive && !locked && !isSelected && isCorrect
        const isChoiceDisabled = locked || isDisabledWrong
```

Then change the button's props (replace the `disabled` and `onClick` lines):

```jsx
          <button
            key={item.id}
            className={cls}
            style={style}
            aria-disabled={isChoiceDisabled}
            onClick={() => { if (!isChoiceDisabled) onChoose(item) }}
            {...restExtraProps}
          >
```

- [ ] **Step 4: Update `GameChoiceGrid.css`'s two `:disabled` selectors**

Replace:
```css
.game__choice:disabled { cursor: default; }
.game__choice:focus         { outline: none; }
.game__choice:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
.game__choice:hover:not(:disabled) { transform: scale(1.04); }
```
with:
```css
.game__choice[aria-disabled="true"] { cursor: default; }
.game__choice:focus         { outline: none; }
.game__choice:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
.game__choice:hover:not([aria-disabled="true"]) { transform: scale(1.04); }
```

- [ ] **Step 5: Run the test file and confirm everything passes**

Run: `npx vitest run src/components/__tests__/GameChoiceGrid.test.jsx`
Expected: PASS (all tests, including the pre-existing `has no accessibility violations` axe check — `aria-disabled` is valid ARIA on a `<button>`, so this should stay clean).

- [ ] **Step 6: Commit**

```bash
git add src/components/GameChoiceGrid.jsx src/components/GameChoiceGrid.css src/components/__tests__/GameChoiceGrid.test.jsx
git commit -m "fix(82): keep keyboard focus on quiz choices (AU-3)

aria-disabled + a click-handler guard replace the native disabled
attribute, mirroring the v0.23.0 memory-tile fix — a keyboard user's
focus no longer drops to <body> when their chosen answer locks."
```

---

### Task 2: AU-3 — update per-game tests for `aria-disabled`

**Files:**
- Modify: `src/games/color-match/__tests__/ColorMatchGame.test.jsx`
- Modify: `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`
- Modify: `src/games/character-match/__tests__/CharacterMatchGame.test.jsx`
- Modify: `src/games/character-match-bluey/__tests__/CharacterMatchGameBluey.test.jsx`

**Interfaces:**
- Consumes: `GameChoiceGrid`'s `aria-disabled` attribute from Task 1 (already shipped by the time this task runs).

Each of the four files has an identical `it('allows a retry when maxTries permits it, without locking the question', ...)` test ending in:
```jsx
    expect(wrongBtn).toBeDisabled()
    const correctBtn = buttons.find(b => b.dataset.<idField> === correctId)
    expect(correctBtn).not.toBeDisabled()
```
(`<idField>` is `colorId`/`animalId`/`characterId`/`characterId` respectively — already correct in each file, don't change it.)

- [ ] **Step 1: Update the four assertions**

In each of the four files, replace:
```jsx
    expect(wrongBtn).toBeDisabled()
```
```jsx
    const correctBtn = buttons.find(...)
    expect(correctBtn).not.toBeDisabled()
```
with:
```jsx
    expect(wrongBtn).toHaveAttribute('aria-disabled', 'true')
```
```jsx
    const correctBtn = buttons.find(...)
    expect(correctBtn).toHaveAttribute('aria-disabled', 'false')
```
(keep each file's own `buttons.find(...)` line exactly as it already reads — only the two `expect` lines change.)

- [ ] **Step 2: Add a focus-survives-lock integration test to `ColorMatchGame.test.jsx`**

Add this test directly after the (now-updated) `allows a retry when maxTries permits it, without locking the question` test in `src/games/color-match/__tests__/ColorMatchGame.test.jsx`:

```jsx
  it('keeps keyboard focus on the tapped choice through the lock transition (AU-3)', async () => {
    mockSettings = { ...mockSettings, feedbackMode: 'parent-tap', numChoices: 3 }
    await act(async () => { render(<ColorMatchGame onGameEnd={onGameEnd} />) })

    const buttons = screen.getAllByRole('button').filter(b => b.dataset.colorId)
    const correctId = screen.getByTestId('correct-color-id').textContent
    const correctBtn = buttons.find(b => b.dataset.colorId === correctId)
    correctBtn.focus()
    await act(async () => { await userEvent.click(correctBtn) })

    expect(correctBtn).toHaveAttribute('aria-disabled', 'true')
    expect(correctBtn).toHaveFocus()
  })
```

- [ ] **Step 3: Run all four affected test files and confirm they pass**

Run: `npx vitest run src/games/color-match/__tests__/ColorMatchGame.test.jsx src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx src/games/character-match/__tests__/CharacterMatchGame.test.jsx src/games/character-match-bluey/__tests__/CharacterMatchGameBluey.test.jsx`
Expected: PASS — all four suites green, including the new focus test.

- [ ] **Step 4: Commit**

```bash
git add src/games/color-match/__tests__/ColorMatchGame.test.jsx src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx src/games/character-match/__tests__/CharacterMatchGame.test.jsx src/games/character-match-bluey/__tests__/CharacterMatchGameBluey.test.jsx
git commit -m "test(82): assert aria-disabled instead of native disabled on quiz choices

Companion update to the AU-3 GameChoiceGrid fix; ColorMatchGame also
gains an integration-level check that focus survives the lock
transition end-to-end."
```

---

### Task 3: AU-1 — non-color quiz feedback (✓/✗ glyph + outline)

**Files:**
- Modify: `src/components/GameChoiceGrid.jsx`
- Modify: `src/components/GameChoiceGrid.css`
- Modify: `src/components/__tests__/GameChoiceGrid.test.jsx`
- Modify: `src/components/GameChoiceGrid.stories.jsx`

**Interfaces:**
- Produces: each `.game__choice` button conditionally renders a trailing `<span className="game__choice-glyph" aria-hidden="true">✓|✗</span>` when locked and either selected (correct/wrong) or the correct answer being revealed. No new props on `GameChoiceGrid` — purely internal to the render.

- [ ] **Step 1: Add glyph + border tests to `GameChoiceGrid.test.jsx`**

Add these tests after the `has no accessibility violations` test (or anywhere in the `describe` block — order doesn't matter, Vitest runs them all):

```jsx
  it('shows a check glyph on the selected correct choice once locked', () => {
    renderGrid({ locked: true, selected: 'a' })
    const glyph = screen.getByText('A').closest('button').querySelector('.game__choice-glyph')
    expect(glyph).toHaveTextContent('✓')
    expect(glyph).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows a cross glyph on the selected wrong choice once locked', () => {
    renderGrid({ locked: true, selected: 'b', disabledChoiceIds: ['b'] })
    const glyph = screen.getByText('B').closest('button').querySelector('.game__choice-glyph')
    expect(glyph).toHaveTextContent('✗')
  })

  it('shows a check glyph on the revealed correct choice when locked on a wrong pick', () => {
    renderGrid({ locked: true, selected: 'b', disabledChoiceIds: ['b'] })
    const btn = screen.getByText('A').closest('button')
    expect(btn).toHaveClass('highlight-correct')
    expect(btn.querySelector('.game__choice-glyph')).toHaveTextContent('✓')
  })

  it('shows no glyph on any choice before locking', () => {
    renderGrid()
    for (const btn of screen.getAllByRole('button')) {
      expect(btn.querySelector('.game__choice-glyph')).toBeNull()
    }
  })

  it('shows no glyph on the hint-only highlight-correct choice (not locked)', () => {
    renderGrid({ hintActive: true })
    const btn = screen.getByText('A').closest('button')
    expect(btn).toHaveClass('highlight-correct')
    expect(btn.querySelector('.game__choice-glyph')).toBeNull()
  })

  it('shows no glyph on a disabled-wrong choice before lock', () => {
    renderGrid({ disabledChoiceIds: ['b'] })
    expect(screen.getByText('B').closest('button').querySelector('.game__choice-glyph')).toBeNull()
  })
```

- [ ] **Step 2: Run the test file and confirm the new tests fail**

Run: `npx vitest run src/components/__tests__/GameChoiceGrid.test.jsx`
Expected: FAIL on the six new tests (no `.game__choice-glyph` element exists yet); the pre-existing tests from Task 1 still pass.

- [ ] **Step 3: Implement the glyph in `GameChoiceGrid.jsx`**

Add a `glyph` computation right after the `cls` block (after the four `cls +=` lines, before the `getChoiceProps` destructure):

```jsx
        let glyph = null
        if (locked && isSelected && isCorrect) glyph = '✓'
        else if (locked && isSelected && !isCorrect) glyph = '✗'
        else if (locked && !isSelected && isCorrect) glyph = '✓'
```

Render it as a second child of the button, after `{renderChoiceContent(item, i)}`:

```jsx
          >
            {renderChoiceContent(item, i)}
            {glyph && <span className="game__choice-glyph" aria-hidden="true">{glyph}</span>}
          </button>
```

- [ ] **Step 4: Add the border-ring and glyph CSS to `GameChoiceGrid.css`**

Append at the end of the file (after the existing `.game__choice-emoji` rule):

```css

/* AU-1 (WCAG 1.4.1): non-color signal for correct/wrong/highlight-correct
   feedback. `border` (not `outline`/`box-shadow`) so this ring never fights
   the :focus-visible outline above or the pulse-green/shake-red box-shadow
   keyframes in src/index.css. */
.game__choice.correct,
.game__choice.highlight-correct {
  border: 4px solid var(--color-teal-dark);
}

.game__choice.wrong {
  border: 4px solid var(--color-error);
}

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
```

- [ ] **Step 5: Run the test file and confirm everything passes**

Run: `npx vitest run src/components/__tests__/GameChoiceGrid.test.jsx`
Expected: PASS (all tests, axe scan still clean — `aria-hidden` on a purely decorative glyph is correct ARIA usage).

- [ ] **Step 6: Add a `LockedWrong` Storybook story**

In `src/components/GameChoiceGrid.stories.jsx`, add after the existing `Locked` export:

```jsx
export const LockedWrong = { args: { ...baseArgs, selected: 'b', locked: true, disabledChoiceIds: ['b'], hintActive: false } }
```

- [ ] **Step 7: Run the full component test suite once more (regression guard) and the lint/CSS lint check**

Run: `npx vitest run src/components/__tests__/GameChoiceGrid.test.jsx && npm run lint && npm run lint:css`
Expected: all PASS. (If `lint` fails on an unrelated `storybook-static/` artifact, remove that directory first — a known local footgun, not something this change introduces.)

- [ ] **Step 8: Commit**

```bash
git add src/components/GameChoiceGrid.jsx src/components/GameChoiceGrid.css src/components/__tests__/GameChoiceGrid.test.jsx src/components/GameChoiceGrid.stories.jsx
git commit -m "fix(82): non-color quiz answer feedback (AU-1)

Adds an aria-hidden checkmark/cross glyph and a border ring to
.correct/.wrong/.highlight-correct in GameChoiceGrid, so all three
quiz games inherit three-signal feedback (color + glyph + border)
instead of color alone — the memory board's mismatch state is the
in-repo model this mirrors. Glyph only appears on the post-lock
reveal, not the pre-lock hint ramp."
```

---

### Task 4: AU-6 — localized score-history dates

**Files:**
- Modify: `src/components/ScoreHistory.jsx`
- Modify: `src/components/__tests__/ScoreHistory.test.jsx`

**Interfaces:**
- Produces: `ScoreHistory` renders each score's `date` (a `YYYY-MM-DD` string) through `Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' })`, parsed via a local (non-UTC) `Date` construction. Scores without `date` keep the existing `toLocaleDateString()` fallback on `timestamp`.

- [ ] **Step 1: Update `ScoreHistory.test.jsx`**

Replace the `import` line to add `vi`:
```jsx
import { describe, it, expect, vi, afterEach } from 'vitest'
```

Replace the `shows the date for each score` test with:
```jsx
  it('shows the localized, formatted date for each score', () => {
    render(<ScoreHistory scores={scores} />)
    expect(screen.getByText('Jun 7, 2026')).toBeInTheDocument()
    expect(screen.queryByText('2026-06-07')).not.toBeInTheDocument()
  })

  it('falls back to the timestamp-derived date for legacy scores with no date field', () => {
    const legacyTimestamp = new Date(2026, 5, 7).getTime()
    const legacyScores = [{ gameId: 'animal-sounds', score: 5, total: 10, timestamp: legacyTimestamp }]
    render(<ScoreHistory scores={legacyScores} />)
    expect(screen.getByText(new Date(legacyTimestamp).toLocaleDateString())).toBeInTheDocument()
  })

  describe('timezone boundary', () => {
    afterEach(() => { vi.unstubAllEnvs() })

    it('avoids the UTC day-shift trap in a negative-offset timezone', () => {
      vi.stubEnv('TZ', 'America/Los_Angeles')
      render(<ScoreHistory scores={[{ gameId: 'animal-sounds', score: 1, total: 1, date: '2026-06-07', timestamp: 1 }]} />)
      expect(screen.getByText('Jun 7, 2026')).toBeInTheDocument()
      expect(screen.queryByText('Jun 6, 2026')).not.toBeInTheDocument()
    })
  })
```

- [ ] **Step 2: Run the test file and confirm the new/changed tests fail**

Run: `npx vitest run src/components/__tests__/ScoreHistory.test.jsx`
Expected: FAIL — the component still renders the raw `2026-06-07` string, not `Jun 7, 2026`.

- [ ] **Step 3: Implement the formatting helpers and use them in `ScoreHistory.jsx`**

Replace the full file with:

```jsx
import { useTranslation } from 'react-i18next'
import './ScoreHistory.css'

function parseIsoDateLocal(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatScoreDate(isoDate, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parseIsoDateLocal(isoDate))
}

export default function ScoreHistory({ scores = [] }) {
  const { t, i18n } = useTranslation()
  if (scores.length === 0) {
    return <p className="score-history__empty">{t('scoreHistory.empty')}</p>
  }
  return (
    <ul className="score-history">
      {scores.map(s => (
        <li key={s.timestamp} className="score-history__item">
          <span className="score-history__result">{s.score} / {s.total}</span>
          <span className="score-history__date">
            {s.date ? formatScoreDate(s.date, i18n.language) : new Date(s.timestamp).toLocaleDateString()}
          </span>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Run the test file and confirm everything passes**

Run: `npx vitest run src/components/__tests__/ScoreHistory.test.jsx`
Expected: PASS (all tests, including the pre-existing axe scan).

- [ ] **Step 5: Commit**

```bash
git add src/components/ScoreHistory.jsx src/components/__tests__/ScoreHistory.test.jsx
git commit -m "fix(82): localize score-history dates (AU-6)

ScoreHistory now formats the stored YYYY-MM-DD date via
Intl.DateTimeFormat(i18n.language, ...) instead of rendering the raw
ISO string. Parses the string into local Date components rather than
new Date(isoString) (which parses as UTC) to avoid shifting the
displayed day in negative-UTC-offset timezones — verified with a
stubbed America/Los_Angeles TZ test."
```

---

### Task 5: Regenerate visual-regression baselines

**Files:**
- Modify: `e2e/visual.spec.js`
- Modify (binary, regenerated): `e2e/visual.spec.js-snapshots/components-gamechoicegrid--locked-*.png`, `components-scorehistory--default-*.png`
- Create (binary): `e2e/visual.spec.js-snapshots/components-gamechoicegrid--locked-wrong-*.png`

**Interfaces:**
- Consumes: the `LockedWrong` story added in Task 3, the glyph/border CSS from Task 3, and the date formatting from Task 4 — this task only re-captures screenshots, no source changes beyond the spec's story-id list.

- [ ] **Step 1: Add the new story id to the tracked list**

In `e2e/visual.spec.js`, in the `stories` array, add a new entry directly after `'components-gamechoicegrid--locked',`:
```js
  'components-gamechoicegrid--locked',
  'components-gamechoicegrid--locked-wrong',
```

- [ ] **Step 2: Start Storybook in the background**

Run (background): `npm run storybook`
Wait for it to report ready on `http://localhost:6006` before proceeding.

- [ ] **Step 3: Regenerate the three affected baselines**

Run: `npx playwright test visual.spec.js --update-snapshots -g "components-gamechoicegrid--locked|components-scorehistory--default"`
Expected: the run reports new/updated snapshots written for `components-gamechoicegrid--locked`, `components-gamechoicegrid--locked-wrong`, and `components-scorehistory--default`; no other snapshot files touched.

- [ ] **Step 4: Run the full visual-regression suite once to confirm everything (including the untouched baselines) still passes**

Run: `npx playwright test visual.spec.js`
Expected: PASS, 0 failures. (This confirms Task 3/4's changes didn't leak into any story that wasn't supposed to change — e.g. `components-gamechoicegrid--default`, `--retry-in-progress`, `--hint-active-subtle`, `--hint-active-bold` should be pixel-identical to their existing baselines, since none of those states render a glyph, border, or reformatted date.)

- [ ] **Step 5: Stop the Storybook background process.**

- [ ] **Step 6: Commit**

```bash
git add e2e/visual.spec.js e2e/visual.spec.js-snapshots
git commit -m "test(82): regenerate visual baselines for AU-1/AU-6 changes

Adds the new LockedWrong GameChoiceGrid story to the tracked list and
regenerates its baseline plus the two existing baselines whose pixels
changed (locked correct-answer ring/glyph, localized score-history
date)."
```

---

### Task 6: Docs and version bump

**Files:**
- Modify: `docs/ENHANCEMENTS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`

**Interfaces:** none (documentation/metadata only).

- [ ] **Step 1: Remove the shipped AU-1/AU-3/AU-6 bullets from `docs/ENHANCEMENTS.md`**

In the `## Accessibility` section, delete these three lines:
```markdown
- **Non-color quiz feedback (AU-1, WCAG 1.4.1)** — `.correct`/`.wrong`/`.highlight-correct` are background-color-only (green vs red of similar lightness — the classic CVD-confusable pair), and the pulse/shake secondary cue is disabled under `prefers-reduced-motion`. Add an `aria-hidden` ✓/✗ glyph (and/or outline) in `GameChoiceGrid` so all three quiz games inherit three-signal feedback — the memory board's mismatch state (✗ + outline + color) is the in-repo model.
- **Keep keyboard focus on quiz choices (AU-3)** — `GameChoiceGrid` uses real `disabled`, dropping focus to `<body>` when the focused choice locks; mirror the v0.23.0 memory-tile fix (`aria-disabled` + click guard).
- **Localize score-history dates (AU-6, i18n)** — `ScoreHistory.jsx` renders the raw ISO `YYYY-MM-DD` string; format via `Intl.DateTimeFormat(i18n.language, …)` (parsing the ISO string as a *local* date to avoid the UTC day-shift trap).
```
Leave the section's intro paragraph and the remaining AU-5/200%-zoom/switch-access/AU-2-followup bullets untouched.

- [ ] **Step 2: Bump the version in `package.json`**

Change:
```json
  "version": "0.28.4",
```
to:
```json
  "version": "0.28.5",
```

- [ ] **Step 3: Add a `CHANGELOG.md` entry**

Insert a new section directly above the existing `## [0.28.4] - 2026-07-18` entry:

```markdown
## [0.28.5] - 2026-07-18

### Fixed
- Accessibility wave 1 (issue #82, audit findings AU-1/AU-3/AU-6): quiz answer feedback (`.correct`/`.wrong`/`.highlight-correct` in `GameChoiceGrid`) now carries an `aria-hidden` ✓/✗ glyph plus a border ring alongside its existing color change, so color-vision-deficient and reduced-motion users get the same signal sighted color-motion users always had — mirrors the memory board's ✗-glyph-plus-outline mismatch state. Quiz choices switched from a native `disabled` attribute to `aria-disabled` plus a click-handler guard, so keyboard focus no longer drops to `<body>` when a locked/already-tried choice would previously have removed itself from the tab order (mirrors the v0.23.0 memory-tile fix). `ScoreHistory` now renders its stored `YYYY-MM-DD` date through `Intl.DateTimeFormat(i18n.language, …)` instead of the raw ISO string, parsed as a local date to avoid a UTC day-shift in negative-offset timezones.
```

- [ ] **Step 4: Run the full unit test suite once more as a final regression check**

Run: `npm run coverage`
Expected: PASS, no unexpected failures or coverage regressions outside the files touched by this plan.

- [ ] **Step 5: Commit**

```bash
git add docs/ENHANCEMENTS.md CHANGELOG.md package.json
git commit -m "chore(82): changelog and version bump for accessibility wave 1"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1+2 → AU-3 (spec §1); Task 3 → AU-1 (spec §2, including the "no glyph during hint ramp" negative case decided during brainstorming); Task 4 → AU-6 (spec §3, including the explicit timezone-boundary test called out in the spec's testing plan); Task 5 → the spec's "Visual regression" and "Storybook" notes under AU-1; Task 6 → the spec's "Docs" section. All spec sections have a task.
- **Type/name consistency:** `isChoiceDisabled` (Task 1) is reused unchanged by Task 3's glyph logic context (same button render); `parseIsoDateLocal`/`formatScoreDate` (Task 4) are named and used consistently within that task's single file. No cross-task name drift.
- **Ordering:** Tasks 1→3 both touch `GameChoiceGrid.jsx`/`.css`/test file sequentially (Task 1's output is Task 3's starting point) — must run in order. Task 5 depends on Task 3 (new story) and Task 4 (date format) both being complete. Task 6 has no code dependencies but reads naturally as the closing task.
