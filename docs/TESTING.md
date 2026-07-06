# Testing

The Playground has four layers of automated testing, all runnable locally with no external accounts or services.

## Unit & component tests (Vitest + React Testing Library)

```bash
npm test          # watch mode
npm run coverage  # single run with coverage report
```

Tests live in `__tests__/` folders next to the code under test. A few patterns used throughout:

- **Fake timers:** tests covering timed feedback (correct/wrong answer delays) use `vi.useFakeTimers()` with `fireEvent`, not `userEvent` — `userEvent` deadlocks with fake timers in this stack.
- **Mocking the adapter:** hook tests mock `src/storage/index.js` via `vi.mock()` + `vi.hoisted()` so the mock exists before the hoisted call runs.
- **`data-testid` for game internals:** each game exposes a hidden `data-testid="correct-<thing>-id"` element so tests can assert the correct answer without depending on choice display order.
- **Mocking `canvas-confetti`:** any test exercising `useGameSession` or a game component mocks `src/lib/confetti.js` (`vi.mock('.../lib/confetti', () => ({ fireConfetti: vi.fn() }))`) rather than the `canvas-confetti` package directly — it's the one module in the codebase that imports the library, keeping the mock seam in one place.
- **Choice-rendering games:** new games should render their answer choices via `src/components/GameChoiceGrid.jsx` rather than duplicating the correct/wrong/hint/disabled class logic — see `AnimalSoundsGame`/`ColorMatchGame` for the render-prop pattern (`getChoiceProps`, `renderChoiceContent`).

## Accessibility audits (jest-axe + axe-core/playwright)

Two layers:

- **Component level:** every component/game test file asserts `expect(await axe(container)).toHaveNoViolations()` using `jest-axe`. Runs automatically with `npm test`.
- **Page level:** every E2E spec (below) includes an `@axe-core/playwright` scan of its main screen, catching layout/contrast issues a jsdom-based check can't see.

If either layer reports a violation, the failure message names the specific rule and element — fix the underlying component (usually a missing `aria-label`, invalid role, or heading order issue), don't suppress the check.

**CSS-filter contrast checks:** jsdom doesn't compute rendered CSS filter effects (e.g. `grayscale()`/`brightness()`), so `jest-axe` can't catch a filter that visually drops a color combination below WCAG contrast thresholds — it only sees the unfiltered DOM. `src/__tests__/disabledWrongChoiceContrast.test.js` is the pattern for this: it reimplements the relevant CSS Filter Effects math in plain JS and checks the WCAG contrast formula directly against every real color/text pairing in the data (not just one example), so a future palette addition that breaks contrast fails a fast unit test instead of shipping unnoticed. Reuse this pattern for any other CSS-filter-dependent contrast state.

## End-to-end tests (Playwright)

```bash
npm run e2e
```

Specs live in `e2e/`, covering: the dashboard, both games' full play-through (launch → answer all questions → results → home), and admin settings persistence. Playwright starts both `npm run dev` (port 5173) and `npm run storybook -- --ci` (port 6006) automatically via the `webServer` array in `playwright.config.js`.

## Visual regression (Storybook + Playwright screenshots)

```bash
npm run storybook         # browse stories locally at localhost:6006
npm run build-storybook   # production build check
```

Key components and both games have stories under `src/**/*.stories.jsx`. `e2e/visual.spec.js` navigates to each story's isolated URL and asserts `toHaveScreenshot()` against a baseline PNG committed in `e2e/visual.spec.js-snapshots/`.

**Updating a baseline after an intentional UI change:**

```bash
npx playwright test visual.spec.js --update-snapshots
```

Review the diff, then commit the updated PNGs alongside the UI change.

No Chromatic account is used — this is fully local. The setup is structured so Chromatic could be added later as an additional check without restructuring the stories.

## i18n string convention

All user-facing UI strings live in `src/i18n/en.json`, organized by feature namespace (`dashboard.*`, `admin.*`, `animalSounds.*`, etc.). When adding a new game:

- Add a namespace for its UI strings (prompt, any game-specific labels).
- Give each data item (animal, color, shape, etc.) a `nameKey` field pointing at `<category>.<id>.name` instead of a literal `name` string.
- Call `useTranslation()` in the game component and resolve display text via `t(...)`, never hardcode literal English strings in JSX.

**File layout:** core cross-cutting strings (`common`, `dashboard`, `admin`, `parent`, `kids`, `scoreHistory`, `badges`) live in `src/i18n/en.json`. Each game's own strings (its `prompt`/`howToPlay` and its item-name catalog) live in `src/games/<id>/i18n/en.json` and are auto-merged at startup via `import.meta.glob`, mirroring the manifest/component auto-discovery pattern — no registry to edit when adding a game's strings. `mergeLocaleResources()` (`src/i18n/index.js`) throws if two files define the same top-level key.

Manifest fields (`name`, `description` in `manifest.json`) are NOT translated — they're game-author metadata, not core-engine UI strings.
