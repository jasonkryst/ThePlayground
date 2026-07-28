# Testing

The Playground has **six layers of automated testing**, plus static linting that catches issues at edit time before any of them run — all runnable locally with no external accounts or services.

| Layer | Command | What it uniquely catches |
|---|---|---|
| *(edit time)* Static linting | `npm run lint` / `npm run lint:css` | a11y and CSS3 conformance issues in any code path, before anything runs |
| 1. Unit & component | `npm test` / `npm run coverage` | Logic, hooks, and component behavior in jsdom |
| 2. Accessibility audits | included in `npm test` and `npm run e2e` | WCAG violations in rendered output (jest-axe per component, axe-core per page) |
| 3. End-to-end | `npm run e2e` | Full play-throughs and layout behavior in a real browser |
| 4. Visual regression | included in `npm run e2e` | Unintended pixel-level UI changes, via Storybook story screenshots |
| 5. HTML5 validation | `npm run validate:html` (also in `e2e`) | Spec-invalid markup in the rendered DOM |
| 6. CSS validation (inline styles) | `npm run validate:css` (also in `e2e`) | Invalid CSS in runtime-generated `style={{...}}` objects |

## Static linting (ESLint + Stylelint)

```bash
npm run lint      # ESLint, incl. eslint-plugin-jsx-a11y
npm run lint:css  # Stylelint
```

`eslint-plugin-jsx-a11y`'s recommended rules catch accessibility issues (missing `alt`, invalid `role`, non-focusable interactive elements) statically, in any code path — including ones no test currently exercises. This complements rather than replaces `jest-axe`/`@axe-core/playwright` below, which only catch issues in rendered output a test or story actually reaches.

**Stylelint is real CSS3 conformance checking, not just style preferences.** `stylelint-config-standard` (configured in `.stylelintrc.json`) extends `stylelint-config-recommended`, which enables `property-no-unknown`, `declaration-property-value-no-unknown`, `at-rule-no-unknown`, `selector-pseudo-class-no-unknown`, `selector-type-no-unknown`, and `media-query-no-invalid` — these validate every declaration against the actual CSS3 spec (an unknown property, or a value the spec doesn't allow for that property, is a lint error), the same class of check a W3C CSS validator performs. `-standard` layers additional style-preference rules on top (modern color-function notation, cascade ordering via `no-descending-specificity`, deprecated-property warnings) — two of those preference rules are intentionally disabled (`selector-class-pattern`, `declaration-block-single-line-max-declarations`) because they conflict with this codebase's own established conventions (BEM class names, compact single-line rules), not because they're wrong in general.

## Layer 1: Unit & component tests (Vitest + React Testing Library)

```bash
npm test          # watch mode
npm run coverage  # single run with coverage report
```

Tests live in `__tests__/` folders next to the code under test. Patterns used throughout:

- **Fake timers:** tests covering timed feedback (correct/wrong answer delays) use `vi.useFakeTimers()` with `fireEvent`, not `userEvent` — `userEvent` deadlocks with fake timers in this stack.
- **Mocking the adapter:** hook tests mock `src/storage/index.js` via `vi.mock()` + `vi.hoisted()` so the mock exists before the hoisted call runs.
- **`data-testid` for game internals:** each game exposes a hidden `data-testid="correct-<thing>-id"` element so tests can assert the correct answer without depending on choice display order — follow this pattern for new games.
- **Mocking `canvas-confetti`:** any test exercising `useGameSession`, `useMemorySession`, or a game component mocks `src/lib/confetti.js` (`vi.mock('.../lib/confetti', () => ({ fireConfetti: vi.fn(), fireFireworks: vi.fn() }))`) rather than the `canvas-confetti` package directly — it's the one module in the codebase that imports the library, keeping the mock seam in one place.
- **Mocking audio:** games play audio through the `useSoundPlayer` hook (`src/hooks/useSoundPlayer.js`) — mock the hook, not the browser `Audio` constructor, for the same one-seam reason as confetti.
- **Mocking speech:** games whose prompt is a spoken word (Fruit & Veggie ID) get their audio from the `useSpeech` hook (`src/hooks/useSpeech.js`) — mock that hook (not `window.speechSynthesis`) in component tests, and toggle its `supported` flag to exercise the no-TTS on-screen-text fallback. `useSpeech`'s own hook test is the one place that stubs the raw `SpeechSynthesis` globals.
- **Memory-game internals:** matched tiles use `aria-disabled` (not `disabled`, which would drop keyboard focus mid-game) — query and assert accordingly. Memory session tests drive `useMemorySession` through real tile clicks on `MemoryBoard` rather than calling hook internals.
- **Choice-rendering games:** new quiz games should render their answer choices via `src/components/GameChoiceGrid.jsx` rather than duplicating the correct/wrong/hint/disabled class logic — see `AnimalSoundsGame`/`ColorMatchGame` for the render-prop pattern (`getChoiceProps`, `renderChoiceContent`).
- **Shared quiz scaffold:** intro/results wiring, timer row, chimes, and the screen-reader live region are covered once in `src/components/__tests__/QuizGameShell.test.jsx`; per-game tests focus on game-specific content and the preserved DOM contract.
- **`AppShell`:** `src/components/__tests__/AppShell.test.jsx` covers route-driven chrome states (home, subpages, game routes), footer visibility, route-entry focus, and the exit-guard dialog end to end (open on a guarded nav/home click, resume, leave, and focus restoring to the trigger element). `ExitConfirmDialog` has its own dedicated a11y test (`jest-axe`, no violations) alongside its interaction tests, including Escape-key dismissal.
- **Native date inputs:** drive `<input type="date">` fields with `fireEvent.change(input, { target: { value: 'YYYY-MM-DD' } })`, not `userEvent.type` — typing a date character-by-character through `userEvent` doesn't reliably produce a valid date-input value across browsers/jsdom. See `src/parent/__tests__/DateRangeFilter.test.jsx` for the pattern.
- **Mocking orientation APIs:** jsdom has neither `window.matchMedia` nor `screen.orientation`. Orientation tests install getter-based mocks (see `src/hooks/__tests__/useOrientation.test.jsx` — `installMatchMedia` / `installScreenOrientation`, with listener sets the test fires manually) and delete them in `afterEach`. Production code fails open to `'landscape'` when the APIs are missing, so unmocked jsdom renders are never blocked.
- **Orientation-gate pause:** hooks that must react to the rotate overlay read `useOrientationGate()` (default `{ blocked: false }`); tests drive it by wrapping `renderHook` in an `OrientationGateContext.Provider` whose value the test flips (see `useMemorySession.pause.test.jsx`).
- **Storage-adapter contract:** `src/storage/__tests__/adapterContract.js` exports `runAdapterContractTests(adapterFactory, { label })`, an adapter-agnostic suite asserting the ten-method interface documented in `src/storage/adapter.js` (default/empty shapes, round-trips, key isolation). Any adapter's own test file calls it in one line — see `localStorageAdapter.contract.test.js`. It's separate from `localStorageAdapter.*.test.js`, which cover localStorage-specific behavior (corrupt-JSON recovery, migrations) out of the contract's scope.

## Layer 2: Accessibility audits (jest-axe + axe-core/playwright)

Two levels:

- **Component level:** every component/game test file asserts `expect(await axe(container)).toHaveNoViolations()` using `jest-axe`. Runs automatically with `npm test`.
- **Page level:** every E2E spec (below) includes an `@axe-core/playwright` scan of its main screen, catching layout/contrast issues a jsdom-based check can't see.

If either level reports a violation, the failure message names the specific rule and element — fix the underlying component (usually a missing `aria-label`, invalid role, or heading order issue), don't suppress the check.

**CSS-filter contrast checks:** jsdom doesn't compute rendered CSS filter effects (e.g. `grayscale()`/`brightness()`), so `jest-axe` can't catch a filter that visually drops a color combination below WCAG contrast thresholds — it only sees the unfiltered DOM. `src/__tests__/disabledWrongChoiceContrast.test.js` is the pattern for this: it reimplements the relevant CSS Filter Effects math in plain JS and checks the WCAG contrast formula directly against every real color/text pairing in the data (not just one example), so a future palette addition that breaks contrast fails a fast unit test instead of shipping unnoticed. Reuse this pattern for any other CSS-filter-dependent contrast state.

`src/__tests__/themeTokenContrast.test.js` follows the same pattern for the Light/Dark/High-Contrast token layer in `src/index.css` — it duplicates each theme's token hex values (kept in sync manually with `index.css`, same convention) and checks every text/background and border/background pairing against the WCAG formula directly.

## Layer 3: End-to-end tests (Playwright)

```bash
npm run e2e
```

Playwright starts both `npm run dev` (port 5173) and Storybook (port 6006) automatically via the `webServer` array in `playwright.config.js`. `globalSetup` (`e2e/global-setup.js`) then visits every route once, single-threaded, before the parallel test workers start — CI runs with only 2 workers sharing that one dev server, and Vite compiles each route's module graph lazily on first request, so without this warm-up two workers' simultaneous first-touch navigations to different routes could occasionally exceed even the 60s test timeout (issue #141). The specs in `e2e/`:

| Spec | Covers |
|---|---|
| `dashboard.spec.js` | The home dashboard: cards, categories, featured game |
| `admin.spec.js` | Settings persistence through the admin page |
| `parent-dashboard.spec.js` | The `/parent` analytics page |
| `kids-progress.spec.js` | The `/my-progress` page |
| `app-shell.spec.js` | The wrapper UI itself: chrome persisting across routes, and the exit-confirm dialog's guarded navigation via a real browser-level resume/leave pass |
| `animal-sounds.spec.js` | Full play-through: launch → complete session → results → home |
| `color-match.spec.js` | Full play-through |
| `character-match.spec.js` | Full play-through |
| `animal-memory-match.spec.js` | Full flip-to-completion memory flow, plus a computed-style guard on the board layout |
| `sound-memory-match.spec.js` | Same memory flow as Animal Memory Match, plus checks that an unresolved or mismatched flip always renders the same generic speaker glyph (never a picture, since matching happens by ear) while a matched pair reveals the real picture as a reward |
| `orientation-gate.spec.js` | Manifest-driven forced-landscape enforcement: overlay blocks portrait play, clears on rotate, home stays reachable, axe scan of the overlay, and a no-flag game never blocks |
| `intro-results-height.spec.js` | Intro/results screens fit one device screen at phone/tablet/desktop sizes (primary button reachable without scrolling), while legitimately long content still scrolls rather than clips — layout behavior not observable in jsdom |
| `nginx-headers.spec.js` | Live nginx security-header (SEC-1, SEC-2, SEC-3) and non-root-process (SEC-4) coverage: boots `nginx.conf` in the real `nginxinc/nginx-unprivileged:1.30-alpine` container (not the app's dev server) and asserts all security headers (including CSP and Permissions-Policy) on every asset tier plus a 404, that the `Server` header discloses no version, and that the nginx process is non-root. Skips (doesn't fail) when Docker isn't available — see below |
| `confetti-csp.spec.js` | Confetti/fireworks actually draw pixels under the real production CSP (issue #109), plus a negative check that disabling the animations setting still shows no canvas at all. Boots the same live nginx container as `nginx-headers.spec.js`, but serving a real `npm run build` output and driving actual gameplay — see below |
| `tap-target-standard.spec.js` | Real-rendered tap-target sizes (issue #91): dashboard tag pills and the parent date-range tabs meet the app's 64px primary standard, while the dashboard's own secondary controls and the admin tab bar — the one genuine smaller-by-design exception — stay below 64px but above the WCAG 2.5.8 24px minimum |
| `visual.spec.js` | Visual regression (layer 4, below) |
| `html-validity.spec.js` | HTML5 validation (layer 5, below) |
| `css-validity.spec.js` | Inline-style CSS validation (layer 6, below) |
| `parental-lock.spec.js` | Route-gating challenge (issue #127): cold-visit lock screen on `/admin` and `/parent`, wrong math/PIN rejection, correct-PIN unlock with shared-session persistence between the two routes, a fresh-context re-lock, and an axe scan of the challenge screen |
| `themes.spec.js` | Light/Dark/High Contrast: axe-core scans (including `color-contrast`) of Dashboard/Admin/a game's results screen under each theme, `system` resolving correctly under both `prefers-color-scheme` values via `page.emulateMedia`, and the header theme-toggle's click-cycle + persistence across reload |

**`nginx-headers.spec.js` and `confetti-csp.spec.js` are the two specs that aren't browser tests against the dev server** — the app's `vite dev` server never applies `nginx.conf` (or its CSP) at all, so the only way to prove the shipped config actually behaves correctly is to run it in real nginx. `nginx-headers.spec.js` boots the same pinned `nginxinc/nginx-unprivileged:1.30-alpine` image the Dockerfile ships (mounting `nginx.conf`, `nginx/security-headers.conf`, and a handful of fixture asset files — not the full `Dockerfile` build, which needs `npm run build` first and is much slower) and drives it with Playwright's `request` fixture. `confetti-csp.spec.js` boots the same image but *does* run `npm run build` first and mounts the real `dist/`, then drives an actual `page` through a memory-match play-through: `canvas-confetti`'s default export tries to build its animation loop from a `blob:` Web Worker, which this app's CSP silently kills (no `worker-src`, and `script-src` doesn't allow `blob:`) — that's exactly what broke confetti/fireworks in every real deployment despite the setting being on, and only a real browser enforcing the real CSP can prove the fix (`src/lib/confetti.js` forcing main-thread rendering via `create(null, { useWorker: false })`) actually renders pixels again. Both specs require a running Docker daemon; both `test.skip()` with a clear reason when Docker isn't available, so `npm run e2e` still runs everywhere else. A companion fast check with no Docker dependency, `nginx/__tests__/securityHeaders.test.js` (runs under `npm test`), statically parses `nginx.conf` and fails if any `location` block sets its own `add_header` without including the shared security-headers snippet — this is what actually catches a headers regression on a machine without Docker; `src/lib/__tests__/confetti.test.js` is the equivalent fast, Docker-free guard for the confetti fix, asserting (with a mocked `canvas-confetti`) that `create()` is always called with `useWorker: false`.

## Layer 4: Visual regression (Storybook + Playwright screenshots)

```bash
npm run storybook         # browse stories locally at localhost:6006
npm run build-storybook   # production build check
```

Key components and every game have stories under `src/**/*.stories.jsx`. `e2e/visual.spec.js` navigates to each story's isolated URL and asserts `toHaveScreenshot()` against a baseline PNG committed in `e2e/visual.spec.js-snapshots/`.

Dashboard, AdminPage, GameChoiceGrid, and GameResults each get an additional Dark and High-Contrast baseline (8 total) via a `parameters: { theme: 'dark' | 'high-contrast' }` story parameter, applied by a global Storybook decorator in `.storybook/preview.js` that sets `document.documentElement.dataset.theme`. The other 38 stories are Light-only — Light's token values never change, so no theme parameter is needed there.

**Updating a baseline after an intentional UI change:**

```bash
npx playwright test visual.spec.js --update-snapshots
```

Review the diff, then commit the updated PNGs alongside the UI change.

No Chromatic account is used — this is fully local. The setup is structured so Chromatic could be added later as an additional check without restructuring the stories.

## Layer 5: HTML5 validation (html-validate)

```bash
npm run validate:html
```

This app is a client-rendered SPA — the served `index.html` is a near-empty shell (`<div id="root">`), so validating that file proves nothing. `e2e/html-validity.spec.js` instead renders each major route (dashboard, admin, parent, kids-progress, and a game's gameplay screen) and validates the resulting DOM with `html-validate`, an offline validator (no dependency on the live W3C Nu Checker, which isn't reachable from every environment this suite runs in). It runs automatically as part of `npm run e2e`.

A handful of `html-validate:recommended` rules are tuned off in the spec's config, each with a comment explaining why (e.g. `no-inline-style` — this app's per-item dynamic colors are legitimately inline-styled; `no-implicit-button-type` — only consequential inside a `<form>`, and this app has none).

## Layer 6: CSS validation of dynamic inline styles

```bash
npm run validate:css
```

**Dynamic inline styles are the one CSS surface Stylelint's file scan can't reach.** `npm run lint:css` only reads `.css` files — it never sees the inline `style={{...}}` objects Color Match/Animal Sounds/GameCard set per item (colors, swatches, tag accents), since those are JS values assembled at runtime. `e2e/css-validity.spec.js` renders each affected route, extracts every element's actual `style` attribute from the live DOM, and runs each one through Stylelint's Node API — scoped to `stylelint-config-recommended` only (pure conformance), not `-standard`'s style-preference layer, since reading an inline style back via `getAttribute('style')` returns the browser's own CSSOM serialization (always legacy `rgb(r, g, b)` comma syntax, regardless of how the source authored the color), which would fail `-standard`'s modernization rules unconditionally and prove nothing. It runs automatically as part of `npm run e2e`.

## Mutation testing (Stryker)

```bash
npm run mutation   # stryker run
```

Mutation testing is a diagnostic developer tool, not a pass/fail CI layer — it isn't part of the six layers above and isn't run automatically. It answers a different question than coverage: coverage shows a line *executed*, mutation testing shows whether a test actually *pins the behavior* of that line. Stryker rewrites the source in small ways (`<` → `<=`, `&&` → `||`, drops a branch) one mutation at a time and reruns the tests; a mutant that still passes ("survived") means no test would catch that regression.

`stryker.config.json` scopes mutation to `buildQueue.js`, `buildDeck.js`, `reinsertMissed.js`, `evaluatePersonalBest.js`, `evaluateMemoryPersonalBest.js`, `computeBadgeAwards.js`, and `computeGameBadgeAwards.js` — the engine's pure-function utils named in issue #89, which have high test counts and no UI to exercise them through. Scoping to these files (rather than all of `src/`) keeps a run to a couple of minutes.

**Handling a surviving mutant:** open `reports/mutation/mutation.html` (or read the `clear-text` output) for the exact mutation and which tests ran against it, then either add/strengthen a unit test that fails against the mutant, or — if the mutant is truly behaviorally unobservable — mark it `// Stryker disable next-line <MutatorName>: <reason>` directly above the line, with the reasoning written out (see `src/utils/buildQueue.js` and `buildDeck.js` for examples: e.g., a Fisher-Yates loop's `i > 0` vs `i >= 0` bound is equivalent because the `i === 0` iteration is always a self-swap no-op). Don't disable a mutant just because writing the killing test is inconvenient — an unexplained disable defeats the point of running this at all.

## Continuous Integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request targeting `main`, as 9 independent parallel jobs (no job waits on another):

- **`lint`** / **`lint-css`** — `npm run lint`, `npm run lint:css`.
- **`unit-tests`** — `npm run coverage`; uploads the `coverage/` report as a build artifact on every run.
- **`build`** — `npm run build`, proving the production Vite bundle still compiles.
- **`e2e`** — installs Playwright's Chromium browser, then `npm run e2e` (all six local layers that live under `e2e/`, including the live Docker-based nginx header checks, since GitHub-hosted runners ship Docker). Uploads `playwright-report/` and `test-results/` only when something fails.
- **`docker-build`** — `docker build` against the repo's `Dockerfile` (build-only, no push, no registry login — publishing an image on release is `.github/workflows/docker-image.yml`'s job, not CI's).
- **`npm-audit`** — two-tier `npm audit` gate, see below.
- **`trivy`** — Trivy image vulnerability scan, see below.
- **`lighthouse`** — Lighthouse CI budgets, see below.

**`npm audit` gate:** `audit-ci --moderate --skip-dev --allowlist GHSA-qwww-vcr4-c8h2` fails the job (and therefore the PR check) on moderate/high/critical findings in the *production* dependency tree — plain `npm audit` has no per-advisory allowlist, so the gate uses `audit-ci` instead, which adds exactly one: the react-router RSC-mode CSRF advisory this app can't reach (see `SECURITY.md`'s Dependency policy section). Any other finding still fails the gate. A separate `npm audit --omit=prod` step always runs (even if the gate step failed) and never fails the job itself — its output is appended to the workflow run's own step summary, so *dev*-tree findings (like the 3 moderate Storybook-chain advisories noted in `SECURITY.md`) stay visible without blocking a merge.

**Trivy image scan:** the `trivy` job builds the Docker image (independently of the `docker-build` job) and scans it with [Trivy](https://trivy.dev/) (`aquasecurity/trivy-action`). A gate step fails the job on CRITICAL/HIGH findings that have an available fix (`ignore-unfixed: true` — skips upstream Alpine CVEs with no patch yet, so the gate only trips on things a version bump could actually fix). A second step, which runs even if the gate failed, scans again for every severity including unfixed findings and uploads the result as SARIF to the repository's Security tab (Code Scanning), so lower-severity or currently-unfixable findings stay visible for tracking without ever blocking a merge — the same report-without-blocking posture as the `npm-audit` job's dev-tree step.

**Lighthouse budgets:** `lighthouserc.json` (repo root) drives `@lhci/cli` against a real production build — `npm run build` then `vite preview` (not the dev server, so scores reflect the minified/bundled app that actually ships). `ubuntu-latest` doesn't guarantee a pre-installed Chrome for `lhci` to launch, so the job installs one explicitly (`browser-actions/setup-chrome@v2`) and points `lhci` at it via the `CHROME_PATH` env var. Four routes are scored: the dashboard (`/`), a representative game (`/game/animal-sounds`), the parent analytics dashboard (`/parent`), and the kid-facing progress page (`/my-progress`). All four Lighthouse categories — performance, accessibility, best-practices, SEO — must score at least 0.8 or the job fails; each run's actual report is uploaded to Lighthouse's temporary public storage (link printed in the job log), so a score drifting down toward 0.8 is visible before it ever crosses the line.

Both new workflow-adjacent config files have their own static structure tests — `.github/__tests__/ci.test.js` parses `ci.yml` and asserts its trigger scope, job set, the audit gate's exact flags, and the `trivy` job's gate/report/upload shape; `.github/__tests__/lighthouserc.test.js` asserts the 4 routes and 4 category thresholds. Like the nginx security-header tests, these prove the *configuration's shape* — the configuration's real behavior (including whether Trivy actually finds anything) is proven every time the workflow actually runs in Actions.

## i18n string convention

All user-facing UI strings live in i18n JSON, organized by feature namespace (`dashboard.*`, `admin.*`, `animalSounds.*`, etc.). When adding a new game:

- Add a namespace for its UI strings (prompt, any game-specific labels).
- Give each data item (animal, color, shape, etc.) a `nameKey` field pointing at `<category>.<id>.name` instead of a literal `name` string.
- Call `useTranslation()` in the game component and resolve display text via `t(...)`, never hardcode literal English strings in JSX.

**File layout:** core cross-cutting strings (`common`, `dashboard`, `admin`, `parent`, `kids`, `scoreHistory`, `badges`) live in `src/i18n/en.json`. Each game's own strings (its `prompt`/`howToPlay` and its item-name catalog) live in `src/games/<id>/i18n/en.json` and are auto-merged at startup via `import.meta.glob`, mirroring the manifest/component auto-discovery pattern — no registry to edit when adding a game's strings. `mergeLocaleResources()` (`src/i18n/index.js`) throws if two files define the same top-level key.

**Cross-locale parity:** `src/i18n/__tests__/i18n.test.js` walks the fully-merged `en`, `es`, and `pl` resource bundles (`i18n.getResourceBundle(locale, 'translation')`) and, after stripping any `_one`/`_few`/`_many`/`_other` plural suffix, asserts all three expose the exact same set of base key paths — core plus every game. It separately asserts that `en`/`es` each define exactly the `one`/`other` plural forms for a pluralizable key while `pl` defines all four CLDR forms (`one`/`few`/`many`/`other`), since Polish grammar needs categories English and Spanish don't. Adding a key to one locale's JSON without the others fails this test immediately, rather than silently falling back to English (or worse, rendering the raw key) at runtime for whichever locale was missed.

Manifest `name`/`description` ARE translated — as of issue #105's follow-up, each `manifest.json` carries `nameKey`/`descriptionKey` (e.g. `"nameKey": "animalSounds.manifestName"`) instead of literal text, pointing into that game's own i18n namespace exactly like the item-`nameKey` pattern above; components resolve them via `t(manifest.nameKey)`. Other manifest fields (`icon`, `color`, `tags`, `version`, `orientation`, `gameType`) remain untranslated metadata.

**Pluralization:** a string that interpolates a `{{count}}` and needs correct singular/plural wording uses i18next's CLDR-based plural key suffixes (e.g. `difficultyOfferHeading_one`/`difficultyOfferHeading_other` in `src/i18n/en.json`) rather than a single key with plural-only wording — `i18n.t(key, { count })` picks the right form automatically via `Intl.PluralRules(lng).select(count)`. Do this for any new interpolated string where the count could plausibly be 1, even if today's call sites never actually pass 1 — English's plural rule already treats "1" specially, and it's a much larger change to retrofit once real content depends on the wrong-shaped key. The exact suffix set is locale-dependent, not a fixed `_one`/`_other` pair: English and Spanish both use CLDR's `one`/`other` categories, but Polish needs all four (`one`/`few`/`many`/`other`) — e.g. `playCount_one`/`playCount_few`/`playCount_many`/`playCount_other` in `src/i18n/pl.json`. When adding a locale, check that locale's CLDR plural rules (or empirically test with `new Intl.PluralRules(locale).select(n)` for a range of `n`) rather than assuming `one`/`other` is universal.
