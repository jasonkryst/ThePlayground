# Testing

The Playground has five layers of automated testing, plus static linting that catches issues at edit time before any of them run — all runnable locally with no external accounts or services.

## Static linting (ESLint + Stylelint)

```bash
npm run lint      # ESLint, incl. eslint-plugin-jsx-a11y
npm run lint:css  # Stylelint
```

`eslint-plugin-jsx-a11y`'s recommended rules catch accessibility issues (missing `alt`, invalid `role`, non-focusable interactive elements) statically, in any code path — including ones no test currently exercises. This complements rather than replaces `jest-axe`/`@axe-core/playwright` below, which only catch issues in rendered output a test or story actually reaches.

**Stylelint is real CSS3 conformance checking, not just style preferences.** `stylelint-config-standard` (configured in `.stylelintrc.json`) extends `stylelint-config-recommended`, which enables `property-no-unknown`, `declaration-property-value-no-unknown`, `at-rule-no-unknown`, `selector-pseudo-class-no-unknown`, `selector-type-no-unknown`, and `media-query-no-invalid` — these validate every declaration against the actual CSS3 spec (an unknown property, or a value the spec doesn't allow for that property, is a lint error), the same class of check a W3C CSS validator performs. `-standard` layers additional style-preference rules on top (modern color-function notation, cascade ordering via `no-descending-specificity`, deprecated-property warnings) — two of those preference rules are intentionally disabled (`selector-class-pattern`, `declaration-block-single-line-max-declarations`) because they conflict with this codebase's own established conventions (BEM class names, compact single-line rules), not because they're wrong in general.

**Dynamic inline styles are validated separately** (`e2e/css-validity.spec.js`, runs under `npm run e2e` or standalone via `npm run validate:css`). Stylelint's file scan only reads `.css` files — it never sees the inline `style={{...}}` objects Color Match/Animal Sounds/GameCard set per item (colors, swatches, tag accents), since those are JS values assembled at runtime. This spec renders each affected route, extracts every element's actual `style` attribute from the live DOM, and runs each one through Stylelint's Node API — scoped to `stylelint-config-recommended` only (pure conformance), not `-standard`'s style-preference layer, since reading an inline style back via `getAttribute('style')` returns the browser's own CSSOM serialization (always legacy `rgb(r, g, b)` comma syntax, regardless of how the source authored the color), which would fail `-standard`'s modernization rules unconditionally and prove nothing.

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
- **`AppShell`:** `src/components/__tests__/AppShell.test.jsx` covers route-driven chrome states (home, subpages, game routes), footer visibility, route-entry focus, and the exit-guard dialog end to end (open on a guarded nav/home click, resume, leave, and focus restoring to the trigger element). `ExitConfirmDialog` has its own dedicated a11y test (`jest-axe`, no violations) alongside its interaction tests, including Escape-key dismissal.
- **Native date inputs:** drive `<input type="date">` fields with `fireEvent.change(input, { target: { value: 'YYYY-MM-DD' } })`, not `userEvent.type` — typing a date character-by-character through `userEvent` doesn't reliably produce a valid date-input value across browsers/jsdom. See `src/parent/__tests__/DateRangeFilter.test.jsx` for the pattern.

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

Specs live in `e2e/`, covering: the dashboard, every game's full play-through (launch → complete the session → results → home; one spec per game, including the memory game's flip-to-completion flow), admin settings persistence, the parent dashboard, the kids progress page, and — in `e2e/app-shell.spec.js` — the wrapper UI itself (chrome persisting across routes, and the exit-confirm dialog's guarded navigation via a real browser-level resume/leave pass). Playwright starts both `npm run dev` (port 5173) and `npm run storybook -- --ci` (port 6006) automatically via the `webServer` array in `playwright.config.js`.

## Visual regression (Storybook + Playwright screenshots)

```bash
npm run storybook         # browse stories locally at localhost:6006
npm run build-storybook   # production build check
```

Key components and every game have stories under `src/**/*.stories.jsx`. `e2e/visual.spec.js` navigates to each story's isolated URL and asserts `toHaveScreenshot()` against a baseline PNG committed in `e2e/visual.spec.js-snapshots/`.

**Updating a baseline after an intentional UI change:**

```bash
npx playwright test visual.spec.js --update-snapshots
```

Review the diff, then commit the updated PNGs alongside the UI change.

No Chromatic account is used — this is fully local. The setup is structured so Chromatic could be added later as an additional check without restructuring the stories.

## HTML5 validation (html-validate)

```bash
npm run validate:html
```

This app is a client-rendered SPA — the served `index.html` is a near-empty shell (`<div id="root">`), so validating that file proves nothing. `e2e/html-validity.spec.js` instead renders each major route (dashboard, admin, parent, kids-progress, and a game's gameplay screen) and validates the resulting DOM with `html-validate`, an offline validator (no dependency on the live W3C Nu Checker, which isn't reachable from every environment this suite runs in). It runs automatically as part of `npm run e2e`.

A handful of `html-validate:recommended` rules are tuned off in the spec's config, each with a comment explaining why (e.g. `no-inline-style` — this app's per-item dynamic colors are legitimately inline-styled; `no-implicit-button-type` — only consequential inside a `<form>`, and this app has none).

## i18n string convention

All user-facing UI strings live in `src/i18n/en.json`, organized by feature namespace (`dashboard.*`, `admin.*`, `animalSounds.*`, etc.). When adding a new game:

- Add a namespace for its UI strings (prompt, any game-specific labels).
- Give each data item (animal, color, shape, etc.) a `nameKey` field pointing at `<category>.<id>.name` instead of a literal `name` string.
- Call `useTranslation()` in the game component and resolve display text via `t(...)`, never hardcode literal English strings in JSX.

**File layout:** core cross-cutting strings (`common`, `dashboard`, `admin`, `parent`, `kids`, `scoreHistory`, `badges`) live in `src/i18n/en.json`. Each game's own strings (its `prompt`/`howToPlay` and its item-name catalog) live in `src/games/<id>/i18n/en.json` and are auto-merged at startup via `import.meta.glob`, mirroring the manifest/component auto-discovery pattern — no registry to edit when adding a game's strings. `mergeLocaleResources()` (`src/i18n/index.js`) throws if two files define the same top-level key.

Manifest fields (`name`, `description` in `manifest.json`) are NOT translated — they're game-author metadata, not core-engine UI strings.

**Pluralization:** a string that interpolates a `{{count}}` and needs correct singular/plural wording uses i18next's CLDR-based `_one`/`_other` key suffixes (e.g. `difficultyOfferHeading_one`/`difficultyOfferHeading_other` in `src/i18n/en.json`) rather than a single key with plural-only wording — `i18n.t(key, { count })` picks the right form automatically. Do this for any new interpolated string where the count could plausibly be 1, even if today's call sites never actually pass 1 — English's plural rule already treats "1" specially, and it's a much larger change to retrofit once real content depends on the wrong-shaped key.
