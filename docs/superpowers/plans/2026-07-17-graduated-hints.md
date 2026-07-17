# Graduated Hint Intensity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the quiz-game hint highlight (issue #20) ramp in visual intensity with wrong taps — subtle when several tries remain, full/bold on the last try before the question locks as missed — instead of today's flat, constant-intensity highlight.

**Architecture:** `useGameSession` gains a derived `hintStrength` (0–1) field alongside the existing `hintActive` boolean. It threads through the existing `QuizGameShell` → `GameChoiceGrid` prop chain (no per-game code changes). `GameChoiceGrid` renders the hint as a `::after` overlay whose opacity is driven by an inline `--hint-strength` CSS custom property, instead of the current flat `!important` background swap.

**Tech Stack:** React function components/hooks, Vitest + React Testing Library (`jsdom`), Storybook + Playwright visual regression.

**Full design reference:** `docs/superpowers/specs/2026-07-16-graduated-hints-design.md`

## Global Constraints

- Hint intensity ramps with tries remaining: subtlest at the first hint-eligible wrong attempt, full bold on the last try before lock.
- `maxTries: 'unlimited'` has no natural "last try" — substitute a fixed 3-attempt ramp past the threshold, then hold at full bold.
- No opacity floor beyond what the ramp naturally produces (admin UI's ranges cap the subtlest step at `1/4 = 25%`).
- No new persisted setting — `hintStrength` is fully derived from the existing `hintsEnabled` / `hintAfterWrongTaps` / `maxTries` settings; `src/storage/adapter.js`'s JSDoc needs no changes.
- The **locked**-state answer-reveal highlight (round over, showing the correct answer) must stay visually unchanged — full-strength/solid, same as today.
- Zero per-game changes — Color Match, Animal Sounds, Character Match, and Fruit & Veggie ID all consume this through the shared `QuizGameShell`/`GameChoiceGrid` pair.
- Every new test suite gets both positive and negative cases, per project testing convention.
- After any Storybook story change, regenerate visual-regression baselines with `npx playwright test visual.spec.js --update-snapshots` and commit the updated PNGs.
- This is an engine-level change: bump `package.json`'s app version and add a `CHANGELOG.md` entry; no individual game `manifest.json` needs a version bump.

---

### Task 1: `useGameSession` — derive `hintStrength`

**Files:**
- Modify: `src/hooks/useGameSession.js:12-16` (add ramp constant near `resolveMaxTries`), `:162-163` (add the calculation), `:376` (expose it)
- Test: `src/hooks/__tests__/useGameSession.test.js` (new `describe('useGameSession — hint strength ramp', ...)` block)

**Interfaces:**
- Produces: `hintStrength` (`number`, `0`–`1`) on the object returned by `useGameSession`, alongside the existing `hintActive` (`boolean`). `0` whenever `hintActive` is `false`.

- [ ] **Step 1: Write the failing tests**

Open `src/hooks/__tests__/useGameSession.test.js`. Insert a new `describe` block immediately after the existing `describe('useGameSession — hints', ...)` block (which ends right before `describe('useGameSession — spaced repetition', ...)`, i.e. after the line `})` that closes the hints block around line 395):

```javascript
describe('useGameSession — hint strength ramp', () => {
  it('hintStrength is 0 before hintAfterWrongTaps is reached', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 4, hintsEnabled: true, hintAfterWrongTaps: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItems = result.current.current.choices.filter(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItems[0]) })

    expect(result.current.hintStrength).toBe(0)
  })

  it('hintStrength is 0 when hintsEnabled is false, regardless of wrong taps', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 4, hintsEnabled: false, hintAfterWrongTaps: 1 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    expect(result.current.hintStrength).toBe(0)
  })

  it('hintStrength ramps across a multi-step numeric maxTries window, reaching 1 on the last try', async () => {
    setSettings({ maxTries: 3, numChoices: 4, hintsEnabled: true, hintAfterWrongTaps: 1 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItems = result.current.current.choices.filter(c => c.id !== correctItem.id)

    await act(async () => { result.current.handleChoice(wrongItems[0]) })
    expect(result.current.hintStrength).toBe(0.5)

    await act(async () => { result.current.handleChoice(wrongItems[1]) })
    expect(result.current.hintStrength).toBe(1)
  })

  it('hintStrength is 1 immediately when only one try separates the threshold from lock', async () => {
    setSettings({ maxTries: 2, numChoices: 2, hintsEnabled: true, hintAfterWrongTaps: 1 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)

    await act(async () => { result.current.handleChoice(wrongItem) })
    expect(result.current.hintStrength).toBe(1)
  })

  it('hintStrength ramps over a fixed 3 steps then holds at 1 when maxTries is unlimited', async () => {
    const fiveItems = [...items, { id: 'e' }]
    setSettings({ maxTries: 'unlimited', numChoices: 5, hintsEnabled: true, hintAfterWrongTaps: 1 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items: fiveItems }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItems = result.current.current.choices.filter(c => c.id !== correctItem.id)
    expect(wrongItems.length).toBe(4)

    await act(async () => { result.current.handleChoice(wrongItems[0]) })
    expect(result.current.hintStrength).toBeCloseTo(1 / 3)

    await act(async () => { result.current.handleChoice(wrongItems[1]) })
    expect(result.current.hintStrength).toBeCloseTo(2 / 3)

    await act(async () => { result.current.handleChoice(wrongItems[2]) })
    expect(result.current.hintStrength).toBe(1)

    await act(async () => { result.current.handleChoice(wrongItems[3]) })
    expect(result.current.hintStrength).toBe(1)
  })

  it('hintStrength resets to 0 after advance() moves to the next question', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 3, hintsEnabled: true, hintAfterWrongTaps: 1 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    expect(result.current.hintStrength).toBeGreaterThan(0)

    await act(async () => { result.current.handleChoice(correctItem) })
    await act(async () => { result.current.advance() })

    expect(result.current.hintStrength).toBe(0)
  })

  it('hintStrength resets to 0 after restart()', async () => {
    setSettings({ maxTries: 'unlimited', numChoices: 3, hintsEnabled: true, hintAfterWrongTaps: 1 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })
    expect(result.current.hintStrength).toBeGreaterThan(0)

    await act(async () => { result.current.restart() })

    expect(result.current.hintStrength).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: FAIL — 7 new failures under `useGameSession — hint strength ramp`, each with an error like `expect(received).toBe(expected)` / `TypeError: Cannot read properties of undefined` because `result.current.hintStrength` is `undefined` (the field doesn't exist yet). All pre-existing tests in the file still pass.

- [ ] **Step 3: Implement `hintStrength` in `useGameSession.js`**

Add the ramp constant right after `resolveMaxTries` (after line 16, before the blank line and `export default function useGameSession`):

```javascript
function resolveMaxTries(maxTries) {
  if (maxTries === 'unlimited') return Infinity
  if (maxTries === 'none' || maxTries == null) return 1
  return Number(maxTries)
}

// maxTries: 'unlimited' has no natural "last try" to ramp toward, so the hint
// ramp treats it as if lock happened this many wrong attempts past the hint
// threshold, then holds at full strength for any further wrong attempt.
const UNLIMITED_HINT_RAMP_STEPS = 3
```

Then replace the `hintActive` line (currently line 163):

```javascript
  const current = queue[index]
  const hintActive = hintsEnabled && !locked && wrongAttempts >= hintAfterWrongTaps
```

with:

```javascript
  const current = queue[index]
  const hintActive = hintsEnabled && !locked && wrongAttempts >= hintAfterWrongTaps

  // Ramp: subtlest (1/totalHintSteps) on the first hint-eligible wrong
  // attempt, full strength (1) on the last try before the question locks as
  // missed. clamp() keeps this well-defined once maxTries is 'unlimited'
  // (effectiveMaxTries substitutes a fixed ramp window) or once wrongAttempts
  // has already passed that window.
  const resolvedMaxTries = resolveMaxTries(maxTries)
  const effectiveMaxTries = resolvedMaxTries === Infinity
    ? hintAfterWrongTaps + UNLIMITED_HINT_RAMP_STEPS
    : resolvedMaxTries
  const totalHintSteps = effectiveMaxTries - hintAfterWrongTaps
  const triesRemaining = effectiveMaxTries - wrongAttempts
  const hintStep = Math.min(Math.max(totalHintSteps - triesRemaining + 1, 1), totalHintSteps)
  const hintStrength = hintActive ? hintStep / totalHintSteps : 0
```

Finally, add `hintStrength` to the returned object (currently line 376):

```javascript
  return {
    current, index, total: queue.length, locked, disabledChoiceIds, hintActive, hintStrength, selected,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: PASS — all tests in the file, including the 7 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGameSession.js src/hooks/__tests__/useGameSession.test.js
git commit -m "$(cat <<'EOF'
feat(20): ramp hint intensity with wrong taps in useGameSession

EOF
)"
```

---

### Task 2: `GameChoiceGrid` — overlay-based hint ramp

**Files:**
- Modify: `src/components/GameChoiceGrid.jsx`
- Modify: `src/components/GameChoiceGrid.css`
- Modify: `src/index.css:90-101`
- Test: `src/components/__tests__/GameChoiceGrid.test.jsx`

**Interfaces:**
- Consumes: nothing from Task 1 directly (this task's tests pass `hintStrength` as a plain prop; wiring the real value from `useGameSession` happens in Task 4).
- Produces: `GameChoiceGrid` accepts a new `hintStrength` prop (`number`, default `1`), which it applies as an inline `--hint-strength` CSS custom property on the hinted correct choice only (merged into any existing inline `style` from `getChoiceProps`).

- [ ] **Step 1: Write the failing tests**

Open `src/components/__tests__/GameChoiceGrid.test.jsx`. Insert these three tests immediately after the existing `it('does not show highlight-correct when neither locked nor hintActive', ...)` test (around line 75) and before the `it('has no accessibility violations', ...)` test:

```javascript
  it('sets --hint-strength on the hinted correct choice to match the hintStrength prop', () => {
    renderGrid({ hintActive: true, hintStrength: 0.5 })
    expect(screen.getByText('A').closest('button').style.getPropertyValue('--hint-strength')).toBe('0.5')
  })

  it('does not set an inline --hint-strength on the locked answer reveal', () => {
    renderGrid({ locked: true, selected: 'b', disabledChoiceIds: ['b'] })
    const correctBtn = screen.getByText('A').closest('button')
    expect(correctBtn).toHaveClass('highlight-correct')
    expect(correctBtn.style.getPropertyValue('--hint-strength')).toBe('')
  })

  it('merges --hint-strength into an existing inline style from getChoiceProps', () => {
    renderGrid({
      hintActive: true,
      hintStrength: 0.5,
      getChoiceProps: item => ({ style: { background: 'hotpink' }, 'data-choice-id': item.id }),
    })
    const correctBtn = screen.getByText('A').closest('button')
    expect(correctBtn.style.background).toBe('hotpink')
    expect(correctBtn.style.getPropertyValue('--hint-strength')).toBe('0.5')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/__tests__/GameChoiceGrid.test.jsx`
Expected: FAIL for `sets --hint-strength on the hinted correct choice...` (actual `''`, expected `'0.5'`) and `merges --hint-strength into an existing inline style...` (actual `''`, expected `'0.5'`). The `does not set an inline --hint-strength on the locked answer reveal` test already PASSES (no `style` is set on that button today either) — that's expected; it's a regression guard for the change about to be made, not a behavior change itself. All pre-existing tests still pass.

- [ ] **Step 3: Implement the `hintStrength` prop in `GameChoiceGrid.jsx`**

Replace the full contents of `src/components/GameChoiceGrid.jsx` with:

```jsx
import './GameChoiceGrid.css'

export default function GameChoiceGrid({
  choices, correctId, selected, locked, disabledChoiceIds, hintActive, hintStrength = 1,
  onChoose, getChoiceProps, renderChoiceContent,
}) {
  return (
    <div className="game__choices">
      {choices.map((item, i) => {
        const isSelected = selected === item.id
        const isCorrect = item.id === correctId
        const isDisabledWrong = disabledChoiceIds.includes(item.id)
        const isHintedCorrect = hintActive && !locked && !isSelected && isCorrect

        let cls = 'game__choice'
        if (locked && isSelected && isCorrect) cls += ' correct'
        if (locked && isSelected && !isCorrect) cls += ' wrong'
        if ((locked || hintActive) && !isSelected && isCorrect) cls += ' highlight-correct'
        if (!locked && isDisabledWrong) cls += ' game__choice--disabled-wrong'

        const { className: extraClassName, style: extraStyle, ...restExtraProps } = getChoiceProps(item, i) ?? {}
        if (extraClassName) cls += ` ${extraClassName}`

        const style = isHintedCorrect ? { ...extraStyle, '--hint-strength': hintStrength } : extraStyle

        return (
          <button
            key={item.id}
            className={cls}
            style={style}
            disabled={locked || isDisabledWrong}
            onClick={() => onChoose(item)}
            {...restExtraProps}
          >
            {renderChoiceContent(item, i)}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Move the hint highlight from a flat background to a ramped overlay in CSS**

In `src/components/GameChoiceGrid.css`, add `position: relative;` to `.game__choice` (so the new overlay's `position: absolute` is scoped to the button):

```css
.game__choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px 12px;
  border-radius: var(--radius-card);
  border: none;
  box-shadow: 0 4px 16px rgb(0 0 0 / 10%);
  font-size: 48px;
  cursor: pointer;
  min-height: 120px;
  transition: transform 0.1s ease;
  position: relative;
}
```

Then add this new rule immediately after `.game__choice:hover:not(:disabled) { transform: scale(1.04); }` and before `.game__choice-name`:

```css
/* Hint highlight is a translucent overlay, not a background swap, so it
   tints whatever's really behind the button (an inline swatch color, e.g.
   Color Match, or the default) instead of replacing it outright.
   --hint-strength is set inline only for the pre-lock hint ramp (issue #20);
   the locked answer-reveal sets no inline value and gets the full-strength
   default below. */
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

Now remove the now-superseded flat `.highlight-correct` background rule from `src/index.css`. Replace the comment block and the three rules at lines 90-101:

```css
/* !important on these three is load-bearing, not a specificity oversight:
   Color Match/Animal Sounds set each choice's resting background via an
   inline `style`, which no non-important stylesheet rule — regardless of
   selector specificity — can out-rank. `.wrong` needs it for the same
   reason `.correct`/`.highlight-correct` already had it: without it, a
   reduced-motion user (who never gets the shake-red animation, only this
   static rule) sees no red at all on a wrong Color Match/Animal Sounds
   choice, since the inline background silently wins. Verified via a real
   browser, not assumed — see e2e/color-match.spec.js's shake-animation test. */
.correct { background: #a5d6a7 !important; }
.wrong   { background: #ef9a9a !important; }
.highlight-correct { background: #a5d6a7 !important; }
```

with:

```css
/* !important on these two is load-bearing, not a specificity oversight:
   Color Match/Animal Sounds set each choice's resting background via an
   inline `style`, which no non-important stylesheet rule — regardless of
   selector specificity — can out-rank. `.wrong` needs it for the same
   reason `.correct` already had it: without it, a
   reduced-motion user (who never gets the shake-red animation, only this
   static rule) sees no red at all on a wrong Color Match/Animal Sounds
   choice, since the inline background silently wins. Verified via a real
   browser, not assumed — see e2e/color-match.spec.js's shake-animation test.
   `.highlight-correct` (the hint ramp / answer-reveal highlight, issue #20)
   no longer needs this treatment: GameChoiceGrid.css layers it as a
   `::after` overlay instead of replacing `background`, so it paints over
   any inline color without an !important fight. */
.correct { background: #a5d6a7 !important; }
.wrong   { background: #ef9a9a !important; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/__tests__/GameChoiceGrid.test.jsx`
Expected: PASS — all tests in the file, including the 3 new ones and the pre-existing `highlight-correct` class-presence tests (those only assert the class, not the background, so they're unaffected by the CSS change).

- [ ] **Step 6: Run stylelint**

Run: `npm run lint:css`
Expected: PASS — no new stylelint violations in `GameChoiceGrid.css` or `index.css`.

- [ ] **Step 7: Commit**

```bash
git add src/components/GameChoiceGrid.jsx src/components/GameChoiceGrid.css src/index.css src/components/__tests__/GameChoiceGrid.test.jsx
git commit -m "$(cat <<'EOF'
feat(20): render the hint highlight as a ramped overlay in GameChoiceGrid

EOF
)"
```

---

### Task 3: Storybook stories + visual regression baseline

**Files:**
- Modify: `src/components/GameChoiceGrid.stories.jsx`
- Modify: `e2e/visual.spec.js`

**Interfaces:**
- Consumes: `GameChoiceGrid`'s `hintStrength` prop from Task 2.

- [ ] **Step 1: Replace the single `HintActive` story with two ramp-endpoint stories**

In `src/components/GameChoiceGrid.stories.jsx`, replace:

```javascript
export const HintActive = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: ['b'], hintActive: true } }
```

with:

```javascript
export const HintActiveSubtle = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: ['b'], hintActive: true, hintStrength: 0.33 } }
export const HintActiveBold = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: ['b'], hintActive: true, hintStrength: 1 } }
```

- [ ] **Step 2: Update the visual regression story list**

In `e2e/visual.spec.js`, replace the line:

```javascript
  'components-gamechoicegrid--hint-active',
```

with:

```javascript
  'components-gamechoicegrid--hint-active-subtle',
  'components-gamechoicegrid--hint-active-bold',
```

- [ ] **Step 3: Regenerate the visual regression baselines**

Run: `npx playwright test visual.spec.js --update-snapshots`
Expected: All `visual: components-gamechoicegrid--*` tests PASS (screenshots regenerated) — including the two new IDs (no prior baseline, so they're created fresh) and the renamed-away-from `hint-active` baseline no longer being referenced. Every other story in the suite should also PASS unchanged, confirming this change didn't affect unrelated components.

Review the new/changed PNGs under `e2e/visual.spec.js-snapshots/` — `hint-active-subtle` should show a faint green tint on the correct choice, `hint-active-bold` a fully solid one (matching today's old `hint-active` baseline).

- [ ] **Step 4: Commit**

```bash
git add src/components/GameChoiceGrid.stories.jsx e2e/visual.spec.js e2e/visual.spec.js-snapshots
git commit -m "$(cat <<'EOF'
test(20): split HintActive story into subtle/bold ramp endpoints

EOF
)"
```

---

### Task 4: `QuizGameShell` — pass `hintStrength` through

**Files:**
- Modify: `src/components/QuizGameShell.jsx:25`, `:100-110`
- Test: `src/components/__tests__/QuizGameShell.test.jsx`

**Interfaces:**
- Consumes: `hintStrength` from the `session` object (Task 1's `useGameSession` return shape) and `GameChoiceGrid`'s `hintStrength` prop (Task 2).

- [ ] **Step 1: Write the failing test**

In `src/components/__tests__/QuizGameShell.test.jsx`, add `hintStrength: 0,` to the `makeSession()` defaults object, right after the existing `hintActive: false,` on line 17:

```javascript
    current: { correct: { id: 'a' }, choices: [{ id: 'a' }, { id: 'b' }] },
    index: 0, total: 3, locked: false, disabledChoiceIds: [], hintActive: false, hintStrength: 0, selected: null,
```

Then add this test inside the `describe('QuizGameShell — screens', ...)` block, after the `it('tapping a choice calls handleChoice with the item', ...)` test:

```javascript
  it('passes hintStrength through to GameChoiceGrid', () => {
    renderShell(makeSession({ hintActive: true, hintStrength: 0.5 }))
    const correctBtn = screen.getByRole('button', { name: 'A' })
    expect(correctBtn.style.getPropertyValue('--hint-strength')).toBe('0.5')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/QuizGameShell.test.jsx`
Expected: FAIL on the new test — actual `--hint-strength` is `'1'` (GameChoiceGrid's default, since QuizGameShell doesn't forward the prop yet), expected `'0.5'`. All pre-existing tests still pass.

- [ ] **Step 3: Thread `hintStrength` through `QuizGameShell.jsx`**

Replace line 25:

```javascript
    current, index, total, locked, disabledChoiceIds, hintActive, selected,
```

with:

```javascript
    current, index, total, locked, disabledChoiceIds, hintActive, hintStrength, selected,
```

Replace lines 100-110 (the `GameChoiceGrid` element):

```jsx
      <GameChoiceGrid
        choices={current.choices}
        correctId={current.correct.id}
        selected={selected}
        locked={locked}
        disabledChoiceIds={disabledChoiceIds}
        hintActive={hintActive}
        onChoose={handleChoice}
        getChoiceProps={getChoiceProps}
        renderChoiceContent={renderChoiceContent}
      />
```

with:

```jsx
      <GameChoiceGrid
        choices={current.choices}
        correctId={current.correct.id}
        selected={selected}
        locked={locked}
        disabledChoiceIds={disabledChoiceIds}
        hintActive={hintActive}
        hintStrength={hintStrength}
        onChoose={handleChoice}
        getChoiceProps={getChoiceProps}
        renderChoiceContent={renderChoiceContent}
      />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/QuizGameShell.test.jsx`
Expected: PASS — all tests in the file, including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/components/QuizGameShell.jsx src/components/__tests__/QuizGameShell.test.jsx
git commit -m "$(cat <<'EOF'
feat(20): thread hintStrength from useGameSession through QuizGameShell

EOF
)"
```

---

### Task 5: Documentation and versioning

**Files:**
- Modify: `README.md:333`
- Modify: `CHANGELOG.md`
- Modify: `package.json:4`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Update the Hints description in README.md**

Replace line 333:

```markdown
**Hints** — when on, the correct answer is highlighted once the child has reached "Show hint after" wrong taps on the current question, without locking it.
```

with:

```markdown
**Hints** — when on, the correct answer is highlighted once the child has reached "Show hint after" wrong taps on the current question, without locking it. The highlight starts subtle and grows bolder with each further wrong tap, reaching full strength on the last try before the question locks in as missed (or, with Retry attempts set to Unlimited, after a fixed few wrong taps past the threshold).
```

- [ ] **Step 2: Add a CHANGELOG.md entry**

Insert a new version section at the top of `CHANGELOG.md`, immediately after the format-note line and before the existing `## [0.27.0] - 2026-07-14` section:

```markdown
## [0.28.0] - 2026-07-17

### Changed
- Hints (issue #20): the correct-answer highlight now ramps in intensity with wrong taps instead of a flat highlight — subtle on the first hint-eligible attempt, reaching full strength on the last try before the question locks as missed (a fixed 3-attempt ramp when Retry attempts is Unlimited). `useGameSession` exposes this as `hintStrength`; `GameChoiceGrid` renders it via a `--hint-strength`-driven overlay instead of swapping the choice's background outright, which also means the highlight no longer needs an `!important` override to beat a game's inline swatch color.

```

- [ ] **Step 3: Bump the app version in package.json**

In `package.json`, replace:

```json
  "version": "0.27.0",
```

with:

```json
  "version": "0.28.0",
```

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md package.json
git commit -m "$(cat <<'EOF'
docs(20): document graduated hint ramp; v0.28.0

EOF
)"
```

---

### Task 6: Full verification pass

**Files:** None (verification only).

- [ ] **Step 1: Run the full unit/component test suite**

Run: `npm test -- run`
Expected: PASS — all suites, no failures introduced by Tasks 1-4.

- [ ] **Step 2: Run ESLint**

Run: `npm run lint`
Expected: PASS. If `storybook-static/` exists in the repo root from a prior `build-storybook` run, remove it first (`rm -rf storybook-static`) — its build output can cause spurious lint failures unrelated to this change.

- [ ] **Step 3: Run Stylelint**

Run: `npm run lint:css`
Expected: PASS.

- [ ] **Step 4: Run the full Playwright e2e suite (includes the updated visual baselines from Task 3)**

Run: `npm run e2e`
Expected: PASS — including HTML5/CSS validation, accessibility checks, and the full visual regression suite.

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`, open a quiz game (e.g. Color Match) at `/game/color-match`, enable Hints and set "Show hint after" to 1 with Retry attempts at 3 or more in the admin settings, then deliberately tap wrong answers and confirm the correct choice's highlight visibly starts faint and gets bolder with each subsequent wrong tap, reaching a solid highlight on the last available try. Stop the dev server afterward.

- [ ] **Step 6: Review the full diff**

Run: `git status` and `git diff main...HEAD` (or `git log --oneline main..HEAD`) to confirm only the intended files changed across all six tasks, then report the branch as ready for `superpowers:finishing-a-development-branch`.
