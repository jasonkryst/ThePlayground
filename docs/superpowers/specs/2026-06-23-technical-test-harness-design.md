# Technical Test & i18n Harness — Design

**Status:** Approved for implementation
**Sub-project:** 1 of 4 (Technical → Gameplay & UX → Dashboard → Scoring & Progress)
**Why first:** Gameplay/Dashboard/Scoring sub-projects all need automated a11y and E2E coverage as they're built, not backfilled afterward. This sub-project installs that harness.

## Scope

From `docs/ENHANCEMENTS.md` → Technical section, all four items:
- i18n / localization (scaffold only, English strings extracted)
- Automated accessibility audit (axe-core)
- End-to-end tests (Playwright)
- Visual regression tests (Storybook + local screenshot diffing, not Chromatic)

Out of scope: CI pipeline (remains a future `ENHANCEMENTS.md` item, not requested this round). Second language for i18n. Chromatic cloud integration (structured so it can be added later without rework).

## Dependencies added

| Package | Purpose |
|---|---|
| `react-i18next`, `i18next` | i18n provider + `t()` hook |
| `jest-axe` (+ vitest matcher extension) | a11y assertions inside existing Vitest component tests |
| `@playwright/test` | E2E test runner |
| `@axe-core/playwright` | Page-level a11y scans inside E2E specs |
| `@storybook/react-vite` | Component story baselines for visual regression |

## i18n

- `src/i18n/en.json` — all user-facing strings: dashboard labels, per-game prompts ("What animal makes this sound?"), buttons, admin settings labels, and per-game data names.
- `src/i18n/index.js` — `i18next.init()` config, English as default/only locale.
- `I18nProvider` (react-i18next's `I18nextProvider`) wraps the app in `src/main.jsx`.
- Components switch from literal strings to `useTranslation()` + `t('key')`.
- `src/games/animal-sounds/data/animals.js` and `src/games/color-match/data/colors.js`: the `name` field becomes a translation key (e.g. `animal.cow.name`) resolved via `t()` at render time, not stored as literal English text.
- No language switcher in this pass — only the `en` locale exists. Plumbing is in place for a future second locale.

## Automated accessibility audit (axe-core)

Two layers, both added in this sub-project:

**Component level (jest-axe):**
- `vitest.setup.js` extends `expect` with `toHaveNoViolations` (jest-axe).
- Every existing component test file gets one added assertion: render, then `expect(await axe(container)).toHaveNoViolations()`.
  - Files: `Dashboard.test.jsx`, `GameCard.test.jsx`, `AnimalSoundsGame.test.jsx`, `ColorMatchGame.test.jsx`, `AdminPage.test.jsx`, `ScoreHistory.test.jsx`.

**Page level (@axe-core/playwright):**
- Each new Playwright spec (below) includes one axe scan of its main screen, run against the real browser-rendered page (catches contrast/layout issues jsdom can't).

## End-to-end tests (Playwright)

- `playwright.config.js` at repo root. Specs live in `e2e/`.
- `npm run e2e` → `playwright test`.
- Core flow specs (initial scope — no edge cases yet):
  - `e2e/dashboard.spec.js` — load dashboard, see game cards for both games.
  - `e2e/animal-sounds.spec.js` — launch → answer all questions → results screen → Home.
  - `e2e/color-match.spec.js` — same flow for Color Match.
  - `e2e/admin.spec.js` — open settings, change a value, reload, verify persisted.
- Each spec runs an `@axe-core/playwright` scan on its main screen as part of the same test.
- Specs run against both `npm run dev` and `npm run build && npm run preview` during initial implementation to catch dev/build discrepancies (not a permanent dual-run in normal CI use — documented as a one-time verification step).

## Visual regression (Storybook + local screenshot diffing)

- Storybook (`@storybook/react-vite`) added with stories for: `GameCard`, `Dashboard`, `AnimalSoundsGame` (mocked settings/scores), `ColorMatchGame`, `AdminPage`, `ScoreHistory`.
- No Chromatic account in this pass. Instead, Playwright navigates to each story's isolated Storybook URL and asserts `toHaveScreenshot()` against a baseline PNG committed to `e2e/__screenshots__/`.
- CSS transitions/animations disabled in story renders to avoid screenshot flakiness.
- `npm run storybook` (dev) and `npm run build-storybook` (CI-style build check) scripts added.
- Structured so Chromatic could later replace or supplement the local-diff step without restructuring the stories themselves.

## Documentation updates

- `README.md`: short "Testing" overview section (one paragraph + links) pointing to a new dedicated doc, rather than embedding all detail inline.
- New `docs/TESTING.md`: full detail on all four testing layers — unit/component (Vitest+RTL), a11y (jest-axe + axe-core/playwright), E2E (Playwright), visual regression (Storybook + screenshot diffing) — including how to run each, how to update screenshot baselines, and the i18n string-key convention for new games.
- `CLAUDE.md`: add `npm run e2e`, `npm run storybook`, `npm run build-storybook` to the Commands list; one-line pointers to `docs/TESTING.md` and the i18n convention (don't duplicate detail already in `docs/TESTING.md`).
- `docs/ENHANCEMENTS.md`: remove the 4 completed Technical items.

## Testing the harness itself (implementation-time verification, not permanent tests)

- Temporarily break an `aria-label` in one component, confirm jest-axe fails, then revert — sanity-checks the matcher is wired correctly.
- Run the new E2E specs against both `npm run dev` and `npm run build && npm run preview`.
- Run Storybook's screenshot comparison twice in a row to confirm no false diffs from animation/timing flakiness.

## Security notes

- i18n strings are static JSON loaded at build time; no dynamic interpolation of user input into `t()` keys — no injection surface.
- No new runtime dependencies touch stored data (localStorage) or user input paths.
