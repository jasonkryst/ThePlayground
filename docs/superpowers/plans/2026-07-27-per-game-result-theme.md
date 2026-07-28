# Per-Game Result Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the shared `GameResults` screen a light per-game theming hook — an accent color pulled from the game's `manifest.color`, and a headline that reads correctly for quiz vs. memory games — without forking the component, per GitHub issue #92.

**Architecture:** `GameResults` gains two new optional props, `accentColor` and `gameType`, both applied via plain conditional inline styles/i18n-key selection (no CSS custom properties, no new CSS file rules). The two existing call sites (`QuizGameShell`, `animal-memory-match/index.jsx`) forward `manifest.color`/`manifest.gameType`, which every manifest already carries. Full design rationale: `docs/superpowers/specs/2026-07-27-per-game-result-theme-design.md`.

**Tech Stack:** React 18, Vitest + React Testing Library + jest-axe, react-i18next, Playwright (e2e + Storybook visual regression).

## Global Constraints

- `accentColor`/`gameType` are optional; omitting both must render `GameResults` byte-identical to its current output (no new `style` attribute, no wording change).
- Accent styling is decorative only (border/ring) — never text-on-fill — so it carries no WCAG text-contrast obligation, matching the one existing `manifest.color` precedent (`KidsProgressPage.jsx`'s `borderTop`).
- New i18n key `common.scoreLabelMemory` must be added to `en.json`, `es.json`, and `pl.json` together (the cross-locale parity test fails otherwise), and left unsuffixed (no `_one`/`_other`), matching its sibling `common.scoreLabel`.
- No `GameResults.css` changes — all new styling is inline `style={{...}}`, matching `KidsProgressPage`'s existing technique exactly.
- Follow this repo's test conventions from `docs/TESTING.md`: `jest-axe` on every new/modified render path, positive AND negative cases for every conditional branch.

---

### Task 1: `GameResults` accent + game-type props, i18n, unit tests

**Files:**
- Modify: `src/i18n/en.json:3` (add `scoreLabelMemory` after `scoreLabel`)
- Modify: `src/i18n/es.json:3` (same)
- Modify: `src/i18n/pl.json:3` (same)
- Modify: `src/components/GameResults.jsx`
- Modify: `src/components/__tests__/GameResults.test.jsx`

**Interfaces:**
- Produces: `GameResults` accepts two new optional props — `accentColor?: string` (a CSS color, e.g. `"#4DB6AC"`) and `gameType?: string` (e.g. `"memory"`; any other value or `undefined` is treated as the quiz default). Later tasks (2, 3, 4) rely on exactly these two prop names.

- [ ] **Step 1: Add the new i18n key to all three locale files**

`src/i18n/en.json` — insert immediately after line 3 (`"scoreLabel": "You scored {{score}} out of {{total}}!",`):

```json
    "scoreLabelMemory": "You found {{score}} out of {{total}} pairs!",
```

`src/i18n/es.json` — insert immediately after line 3 (`"scoreLabel": "¡Sacaste {{score}} de {{total}}!",`):

```json
    "scoreLabelMemory": "¡Encontraste {{score}} de {{total}} pares!",
```

`src/i18n/pl.json` — insert immediately after line 3 (`"scoreLabel": "Wynik: {{score}} na {{total}}!",`):

```json
    "scoreLabelMemory": "Znaleziono {{score}} z {{total}} par!",
```

- [ ] **Step 2: Run the i18n parity test to confirm no locale is out of sync**

Run: `npx vitest run src/i18n/__tests__/i18n.test.js`
Expected: PASS (the new key exists in all three files, so `baseKeySet` parity holds)

- [ ] **Step 3: Write the failing component tests**

Add to `src/components/__tests__/GameResults.test.jsx`, immediately before the closing `})` of the `describe('GameResults', ...)` block (after the existing `'moves focus to the results heading on mount'` test):

```jsx
  it('applies the accent color as a top border and an emoji ring when accentColor is given', () => {
    const { container } = render(
      <GameResults
        score={3} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        accentColor="#4DB6AC"
      />
    )
    expect(container.querySelector('.results')).toHaveStyle({ borderTop: '6px solid #4DB6AC' })
    expect(container.querySelector('.results__emoji')).toHaveStyle({
      border: '4px solid #4DB6AC',
      borderRadius: '50%',
    })
  })

  it('negative: adds no inline styling when accentColor is omitted', () => {
    const { container } = render(
      <GameResults score={3} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />
    )
    expect(container.querySelector('.results')).not.toHaveAttribute('style')
    expect(container.querySelector('.results__emoji')).not.toHaveAttribute('style')
  })

  it('shows the memory-phrased headline when gameType is "memory"', () => {
    render(
      <GameResults
        score={4} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        gameType="memory"
      />
    )
    expect(screen.getByText('You found 4 out of 5 pairs!')).toBeInTheDocument()
    expect(screen.queryByText(/you scored/i)).not.toBeInTheDocument()
  })

  it('negative: shows the quiz-phrased headline when gameType is omitted or not "memory"', () => {
    const { rerender } = render(
      <GameResults score={4} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />
    )
    expect(screen.getByText('You scored 4 out of 5!')).toBeInTheDocument()
    expect(screen.queryByText(/you found/i)).not.toBeInTheDocument()

    rerender(
      <GameResults
        score={4} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        gameType="quiz"
      />
    )
    expect(screen.getByText('You scored 4 out of 5!')).toBeInTheDocument()
  })

  it('has no accessibility violations with accentColor and a memory gameType set', async () => {
    const { container } = render(
      <GameResults
        score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        accentColor="#4DB6AC" gameType="memory"
      />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/components/__tests__/GameResults.test.jsx`
Expected: the four new tests FAIL (no `accentColor`/`gameType` prop exists yet on `GameResults`, so no styling and no memory wording appear); all pre-existing tests still PASS.

- [ ] **Step 5: Implement the props in `GameResults.jsx`**

Replace the full contents of `src/components/GameResults.jsx` with:

```jsx
import { useTranslation } from 'react-i18next'
import useFocusOnMount from '../hooks/useFocusOnMount'
import './GameResults.css'

export default function GameResults({
  score, total, missed, onPlayAgain, onHome, renderMissedItem,
  offerDifficultyBump = false, numChoices, onAcceptDifficultyBump, onDismissDifficultyBump,
  personalBestResult = null, newBadges = [],
  accentColor, gameType,
}) {
  const { t } = useTranslation()
  const headingRef = useFocusOnMount()

  // Light per-game theming hook (issue #92): purely decorative (border/ring,
  // never text-on-fill), so it carries no WCAG text-contrast obligation —
  // same technique as KidsProgressPage's manifest.color border-top.
  const scoreLabelKey = gameType === 'memory' ? 'common.scoreLabelMemory' : 'common.scoreLabel'
  const rootStyle = accentColor ? { borderTop: `6px solid ${accentColor}` } : undefined
  const emojiStyle = accentColor
    ? { border: `4px solid ${accentColor}`, borderRadius: '50%', padding: '10px' }
    : undefined

  return (
    <div className="results" style={rootStyle}>
      <h2 className="sr-only" tabIndex={-1} ref={headingRef}>{t('common.resultsHeading')}</h2>
      <div className="results__emoji" style={emojiStyle}>{missed.length === 0 ? '🎉' : '⭐'}</div>
      <div className="results__score">{score} / {total}</div>
      <div className="results__label">{t(scoreLabelKey, { score, total })}</div>

      {personalBestResult?.accuracy?.isNewRecord && (
        <div className="results__record">
          {t('common.newAccuracyRecord', {
            score, total,
            prevScore: personalBestResult.accuracy.previous.score,
            prevTotal: personalBestResult.accuracy.previous.total,
          })}
        </div>
      )}

      {personalBestResult?.fewestFlips?.isNewRecord && (
        <div className="results__record">
          {t('common.newFewestFlipsRecord', {
            flips: personalBestResult.fewestFlips.value,
            prevFlips: personalBestResult.fewestFlips.previous.flips,
          })}
        </div>
      )}

      {personalBestResult?.fastestMs?.isNewRecord && (
        <div className="results__record">
          {t('common.newFastestBoardRecord', {
            seconds: (personalBestResult.fastestMs.value / 1000).toFixed(1),
            prevSeconds: (personalBestResult.fastestMs.previous.ms / 1000).toFixed(1),
          })}
        </div>
      )}

      {personalBestResult?.speed?.isNewRecord && (
        <div className="results__record">
          {t('common.newSpeedRecord', {
            seconds: (personalBestResult.speed.value / 1000).toFixed(1),
            prevSeconds: (personalBestResult.speed.previous.avgMs / 1000).toFixed(1),
          })}
        </div>
      )}

      {newBadges.map(badge => (
        <div key={badge.id} className="results__badge-award">
          {t('common.newBadgeAnnounce')} {badge.icon} {t(badge.nameKey)}
        </div>
      ))}

      {missed.length === 0 ? (
        <div className="results__label">{t('common.perfectRun')}</div>
      ) : (
        <div>
          <div className="results__missed-heading">{t('common.missedHeading')}</div>
          <ul className="results__missed">
            {missed.map((item, i) => (
              <li key={`${item.id}-${i}`}>{renderMissedItem(item)}</li>
            ))}
          </ul>
        </div>
      )}

      {offerDifficultyBump && (
        <div className="results__difficulty-offer">
          <div className="results__label">{t('common.difficultyOfferHeading', { count: numChoices + 1 })}</div>
          <div className="results__actions">
            <button className="results__btn results__btn--play" onClick={onAcceptDifficultyBump}>
              {t('common.difficultyOfferAccept')}
            </button>
            <button className="results__btn results__btn--home" onClick={onDismissDifficultyBump}>
              {t('common.difficultyOfferDismiss')}
            </button>
          </div>
        </div>
      )}

      <div className="results__actions">
        <button className="results__btn results__btn--play" onClick={onPlayAgain}>{t('common.playAgain')}</button>
        <button className="results__btn results__btn--home" onClick={onHome}>{t('common.home')}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/__tests__/GameResults.test.jsx`
Expected: PASS (all tests, old and new)

- [ ] **Step 7: Run the full unit suite and lint to catch any collateral break**

Run: `npm test -- --run && npm run lint`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/i18n/en.json src/i18n/es.json src/i18n/pl.json src/components/GameResults.jsx src/components/__tests__/GameResults.test.jsx
git commit -m "feat(92): add accentColor and gameType theming hooks to GameResults"
```

---

### Task 2: Storybook stories + visual regression baselines

**Files:**
- Modify: `src/components/GameResults.stories.jsx`
- Modify: `e2e/visual.spec.js`
- Create: `e2e/visual.spec.js-snapshots/components-gameresults--with-accent-*.png`, `components-gameresults--with-accent-dark-*.png`, `components-gameresults--with-accent-high-contrast-*.png`, `components-gameresults--memory-perfect-run-*.png` (generated by Step 4, not hand-authored)

**Interfaces:**
- Consumes: `GameResults`'s `accentColor`/`gameType` props from Task 1.

- [ ] **Step 1: Add the new stories**

Add to `src/components/GameResults.stories.jsx`, after the existing `WithNewBadges` export:

```jsx
export const WithAccent = {
  args: {
    score: 4, total: 5, missed: [], onPlayAgain: () => {}, onHome: () => {}, renderMissedItem,
    accentColor: '#4DB6AC',
  },
}

export const WithAccentDark = { ...WithAccent, parameters: { theme: 'dark' } }
export const WithAccentHighContrast = { ...WithAccent, parameters: { theme: 'high-contrast' } }

export const MemoryPerfectRun = {
  args: {
    score: 5, total: 5, missed: [], onPlayAgain: () => {}, onHome: () => {}, renderMissedItem,
    gameType: 'memory',
  },
}
```

- [ ] **Step 2: Add the new story IDs to the visual regression list**

In `e2e/visual.spec.js`, insert into the `stories` array immediately after `'components-gameresults--with-new-badges',`:

```js
  'components-gameresults--with-accent',
  'components-gameresults--with-accent-dark',
  'components-gameresults--with-accent-high-contrast',
  'components-gameresults--memory-perfect-run',
```

- [ ] **Step 3: Manually verify the emoji ring renders as a clean circle**

Run: `npm run storybook`, open `http://localhost:6006/?path=/story/components-gameresults--with-accent`.

Confirm: the teal (`#4DB6AC`) border-top spans the results panel, and the ring around 🎉 reads as a clean circle (not clipped or oval). If the `padding`/`border` values from Task 1 Step 5 need adjustment to look right, adjust `emojiStyle` in `GameResults.jsx` now and re-verify — this is the only step in the plan where those exact pixel values may still move.

- [ ] **Step 4: Capture fresh baselines for the 4 new stories**

Run: `npx playwright test visual.spec.js --update-snapshots`
Expected: the 4 new snapshot files are created under `e2e/visual.spec.js-snapshots/`; all other (pre-existing) snapshots stay pixel-identical, since they don't pass `accentColor`/`gameType`.

- [ ] **Step 5: Run the full visual regression suite to confirm everything passes clean**

Run: `npx playwright test visual.spec.js`
Expected: all tests PASS, including the 4 new ones (screenshot now matches the just-captured baseline) and every pre-existing one (unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/components/GameResults.stories.jsx e2e/visual.spec.js e2e/visual.spec.js-snapshots/
git commit -m "test(92): add Storybook stories and visual baselines for GameResults theming"
```

---

### Task 3: Wire `QuizGameShell` (quiz games)

**Files:**
- Modify: `src/components/QuizGameShell.jsx:74-89`
- Modify: `src/components/__tests__/QuizGameShell.test.jsx`

**Interfaces:**
- Consumes: `GameResults`'s `accentColor`/`gameType` props (Task 1); `manifest.color`/`manifest.gameType` (already present on every game's `manifest.json`, `gameType` absent for all 5 quiz games today).

- [ ] **Step 1: Write the failing prop-forwarding test**

In `src/components/__tests__/QuizGameShell.test.jsx`, change line 20 from:

```jsx
const manifest = { icon: '🎨', nameKey: 'quizGameShellTest.name', version: '1.0.0' }
```

to:

```jsx
const manifest = { icon: '🎨', nameKey: 'quizGameShellTest.name', version: '1.0.0', color: '#4DB6AC' }
```

Then add this test inside the `describe('QuizGameShell — screens', ...)` block, immediately after the existing `'shows the results screen when done; Play Again restarts, Home reports the score'` test:

```jsx
  it('forwards manifest.color as the results accent (quiz games have no gameType, so the quiz headline wording is used)', () => {
    const session = makeSession({ done: true, score: 2, total: 3, missed: [] })
    const { container } = renderShell(session)
    expect(container.querySelector('.results')).toHaveStyle({ borderTop: '6px solid #4DB6AC' })
    expect(screen.getByText('You scored 2 out of 3!')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/QuizGameShell.test.jsx -t "forwards manifest.color"`
Expected: FAIL (`.results` has no `style` attribute yet — `QuizGameShell` doesn't pass `accentColor`/`gameType` to `GameResults`)

- [ ] **Step 3: Wire the props in `QuizGameShell.jsx`**

In `src/components/QuizGameShell.jsx`, change the `<GameResults>` call (currently lines 74–89):

```jsx
  if (done) {
    return (
      <GameResults
        score={score}
        total={total}
        missed={missed}
        onPlayAgain={restart}
        onHome={() => onGameEnd(score, total)}
        renderMissedItem={renderMissedItem}
        offerDifficultyBump={offerDifficultyBump}
        numChoices={numChoices}
        onAcceptDifficultyBump={acceptDifficultyBump}
        onDismissDifficultyBump={dismissDifficultyBump}
        personalBestResult={personalBestResult}
        newBadges={newBadges}
      />
    )
  }
```

to:

```jsx
  if (done) {
    return (
      <GameResults
        score={score}
        total={total}
        missed={missed}
        onPlayAgain={restart}
        onHome={() => onGameEnd(score, total)}
        renderMissedItem={renderMissedItem}
        offerDifficultyBump={offerDifficultyBump}
        numChoices={numChoices}
        onAcceptDifficultyBump={acceptDifficultyBump}
        onDismissDifficultyBump={dismissDifficultyBump}
        personalBestResult={personalBestResult}
        newBadges={newBadges}
        accentColor={manifest.color}
        gameType={manifest.gameType}
      />
    )
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/QuizGameShell.test.jsx`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Run the full unit suite**

Run: `npm test -- --run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/QuizGameShell.jsx src/components/__tests__/QuizGameShell.test.jsx
git commit -m "feat(92): wire manifest color/gameType into QuizGameShell's results screen"
```

---

### Task 4: Wire the memory game, update dependent test/e2e wording

**Files:**
- Modify: `src/games/animal-memory-match/index.jsx:57-67`
- Modify: `src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`
- Modify: `e2e/animal-memory-match.spec.js`

**Interfaces:**
- Consumes: `GameResults`'s `accentColor`/`gameType` props (Task 1); `manifest.color` (`"#4DB6AC"`) and `manifest.gameType` (`"memory"`) from `src/games/animal-memory-match/manifest.json`, already imported in this file as `manifest`.

- [ ] **Step 1: Write the failing prop-forwarding test**

Add to `src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`, immediately after the existing `'reaches the results screen after all pairs are found'` test:

```jsx
  it('shows the memory-phrased headline and the manifest accent color on the results screen', async () => {
    vi.useFakeTimers()
    let container
    await act(async () => { container = render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />).container })
    await playFullBoard()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    expect(screen.getByText('You found 3 out of 3 pairs!')).toBeInTheDocument()
    expect(screen.queryByText(/you scored/i)).not.toBeInTheDocument()
    expect(container.querySelector('.results')).toHaveStyle({ borderTop: '6px solid #4DB6AC' })
  })
```

- [ ] **Step 2: Update the three pre-existing assertions that hardcode the old "you scored" wording**

These three tests currently assert `/you scored/i` for this memory game's results screen, which is about to become factually wrong once the headline switches to the memory-phrased wording. Update each:

`'stops the final match sound when the results screen appears (issue #52)'` — change:
```jsx
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
```
to:
```jsx
    expect(screen.getByText(/you found/i)).toBeInTheDocument()
```

`'reaches the results screen after all pairs are found'` — same change (`/you scored/i` → `/you found/i`).

`'shows no record banner when the session did not break the record'` — same change (`/you scored/i` → `/you found/i`).

- [ ] **Step 3: Run the tests to verify the new test fails and confirm the wording-update tests currently fail too**

Run: `npx vitest run src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`
Expected: FAIL on the new test (no accent border, wording still says "you scored") and on the 3 updated assertions (wording hasn't changed yet, so `/you found/i` doesn't match).

- [ ] **Step 4: Wire the props in `animal-memory-match/index.jsx`**

Change the `<GameResults>` call (currently lines 57–66):

```jsx
      <GameResults
        score={pairsFound}
        total={totalPairs}
        missed={[]}
        renderMissedItem={() => null}
        onPlayAgain={restart}
        onHome={() => onGameEnd(pairsFound, totalPairs)}
        personalBestResult={personalBestResult}
        newBadges={newBadges}
      />
```

to:

```jsx
      <GameResults
        score={pairsFound}
        total={totalPairs}
        missed={[]}
        renderMissedItem={() => null}
        onPlayAgain={restart}
        onHome={() => onGameEnd(pairsFound, totalPairs)}
        personalBestResult={personalBestResult}
        newBadges={newBadges}
        accentColor={manifest.color}
        gameType={manifest.gameType}
      />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`
Expected: PASS (all tests)

- [ ] **Step 6: Update the e2e wording assertion and extend the styling test with an accent check**

In `e2e/animal-memory-match.spec.js`, change the `'memory match: full play-through reaches results and returns home'` test's assertion (currently line 50):

```js
  await expect(page.getByText(/you scored/i)).toBeVisible({ timeout: 10_000 })
```

to:

```js
  await expect(page.getByText(/you found/i)).toBeVisible({ timeout: 10_000 })
```

Then extend the existing `'memory match: results screen receives the shared themed styling (#53)'` test (currently the last test in the file) to also assert the accent border, changing:

```js
test('memory match: results screen receives the shared themed styling (#53)', async ({ page }) => {
  // Direct navigation matters: the bug only reproduced when no quiz game's
  // stylesheet (which used to carry the .results rules) had been loaded first.
  await startGame(page)
  await completeBoard(page)
  const results = page.locator('.results')
  await expect(results).toBeVisible({ timeout: 10_000 })
  await expect(results).toHaveCSS('display', 'flex')
  await expect(results).toHaveCSS('text-align', 'center')
  await expect(page.getByRole('button', { name: /play again/i })).toHaveCSS('border-radius', '16px')
})
```

to:

```js
test('memory match: results screen receives the shared themed styling (#53) and the manifest accent color (#92)', async ({ page }) => {
  // Direct navigation matters: the bug only reproduced when no quiz game's
  // stylesheet (which used to carry the .results rules) had been loaded first.
  await startGame(page)
  await completeBoard(page)
  const results = page.locator('.results')
  await expect(results).toBeVisible({ timeout: 10_000 })
  await expect(results).toHaveCSS('display', 'flex')
  await expect(results).toHaveCSS('text-align', 'center')
  await expect(page.getByRole('button', { name: /play again/i })).toHaveCSS('border-radius', '16px')
  await expect(results).toHaveCSS('border-top-color', 'rgb(77, 182, 172)') // manifest.color #4DB6AC
})
```

- [ ] **Step 7: Run the full unit suite and this e2e file**

Run: `npm test -- --run && npx playwright test animal-memory-match.spec.js`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/games/animal-memory-match/index.jsx src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx e2e/animal-memory-match.spec.js
git commit -m "feat(92): wire manifest color/gameType into Animal Memory Match's results screen"
```

---

### Task 5: Docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/ENHANCEMENTS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`

**Interfaces:**
- None — this task only updates documentation/metadata after Tasks 1–4 are merged and verified.

- [ ] **Step 1: Document `manifest.color` in `CLAUDE.md`**

In `CLAUDE.md`'s Architecture section, find this sentence (in the "Auto-discovery is the core mechanic" paragraph):

```
Dropping a new folder under `src/games/<id>/` with a `manifest.json` (the `tags` field is required; memory games also set `gameType: "memory"`; and games that require a specific layout set `"orientation": "landscape"` or `"orientation": "portrait"` — the engine's `OrientationGate` (wrapping every game route in `src/App.jsx`) then blocks play in the wrong orientation with a rotate overlay and publishes `{ blocked }` via `OrientationGateContext`, which both `useMemorySession` and `useGameSession` consume to pause timing) and `index.jsx` (default export accepting `onGameEnd`) makes it appear on the dashboard and routable at `/game/<id>` — no registry or import to edit.
```

Replace it with (only change: a new clause about `color` inserted before the closing parenthesis of the `manifest.json` explanation):

```
Dropping a new folder under `src/games/<id>/` with a `manifest.json` (the `tags` field is required; memory games also set `gameType: "memory"`; games that require a specific layout set `"orientation": "landscape"` or `"orientation": "portrait"` — the engine's `OrientationGate` (wrapping every game route in `src/App.jsx`) then blocks play in the wrong orientation with a rotate overlay and publishes `{ blocked }` via `OrientationGateContext`, which both `useMemorySession` and `useGameSession` consume to pause timing; and an optional `color` hex string is a light per-game accent, consumed as a plain inline style — never behind text, so it carries no WCAG contrast obligation — by `KidsProgressPage`'s card border and `GameResults`'s results-screen accent/ring) and `index.jsx` (default export accepting `onGameEnd`) makes it appear on the dashboard and routable at `/game/<id>` — no registry or import to edit.
```

- [ ] **Step 2: Remove the now-implemented backlog bullet from `docs/ENHANCEMENTS.md`**

In `docs/ENHANCEMENTS.md`'s `## UI` section, remove this line entirely:

```
- **Per-game-type results theming** — the shared `GameResults` screen is deliberately generic; a light theming hook (accent color from the game's manifest `color`, game-type-appropriate stat labels) would make results feel like part of each game without forking the component.
```

- [ ] **Step 3: Bump the version in `package.json`**

Change line 4 from:

```json
  "version": "0.38.0",
```

to:

```json
  "version": "0.39.0",
```

- [ ] **Step 4: Add a `CHANGELOG.md` entry**

Insert a new section at the top of `CHANGELOG.md`, immediately after the header block (before the existing `## [0.38.0] - 2026-07-27` entry). Use today's actual date when this step is executed (`YYYY-MM-DD`, matching the format of every entry above it):

```markdown
## [0.39.0] - 2026-07-27

### Added

- Per-game result theming (issue #92): the shared `GameResults` screen now takes two optional props, `accentColor` and `gameType`, wired from every game's own `manifest.json` (`manifest.color`, `manifest.gameType`) at the two existing call sites (`QuizGameShell`, Animal Memory Match's `index.jsx`). `accentColor` draws a thin colored top border and a matching ring around the results emoji — purely decorative inline styles, the same technique `KidsProgressPage`'s existing `manifest.color` border already used, so it carries no WCAG text-contrast obligation across Light/Dark/High-Contrast. `gameType === 'memory'` switches the results headline from "You scored X out of Y!" to "You found X out of Y pairs!" (new `common.scoreLabelMemory` i18n key, added to all three locales), matching the wording already used in-game. Omitting both props renders `GameResults` identically to before this change.
```

- [ ] **Step 5: Verify the docs changes don't break anything**

Run: `npm run lint && npm test -- --run`
Expected: PASS (docs-only changes plus a version bump; no test depends on the removed `ENHANCEMENTS.md` bullet or the `CLAUDE.md` prose)

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/ENHANCEMENTS.md CHANGELOG.md package.json
git commit -m "docs(92): document manifest.color, changelog + version bump for per-game result theming"
```

---

## Final verification

- [ ] Run the full local suite end to end: `npm run lint && npm run lint:css && npm run coverage && npm run build && npm run e2e`
- [ ] Confirm all 5 commits are present on the branch (`git log --oneline -5`)
