# Standards Audit Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the findings in `docs/superpowers/specs/2026-07-05-standards-audit-findings.md`, ordered by risk/impact — live accessibility-correctness issues first, then convention drift, then process/tooling gaps that prevent future regressions. Every finding from the audit is tracked here, including items with no code action (deferred-by-design, informational) — nothing from the audit is left undocumented.

**Ordering rationale:** Risk/impact first, not effort. A cheap tooling fix (e.g. adding `coverage` to `.eslintignore`) ranks below a live, user-facing accessibility gap even though it's faster to ship, because the point of ordering is to fix what hurts users first.

## Global constraints

- Follow the existing `:focus { outline: none }` / `:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px }` pattern for any focus styling — don't invent a new treatment (see `docs/superpowers/plans/2026-07-05-accessibility-i18n-hardening.md` Task 10-12).
- Colors route through `var(--color-*)` tokens (`src/index.css`), never hardcoded hex, per `CLAUDE.md`.
- Every component/game test file asserts `expect(await axe(container)).toHaveNoViolations()`.
- The three game CSS files intentionally duplicate shared class rules rather than importing a shared stylesheet — apply any shared-class CSS fix identically to all three, not centralized.
- Bump `package.json` version and add a `CHANGELOG.md` entry as the final task.

---

## Priority 1 — Accessibility correctness (live user impact)

### Task 1: Verify and fix disabled-wrong-choice contrast ratio (WCAG 1.4.3)

**Files:** `src/index.css` (or wherever `.game__choice--disabled-wrong` / equivalent lives), one contrast-check script or manual DevTools measurement.

**Why first:** This is the single finding with unknown compliance status on a WCAG success criterion the current branch already targets. Every other accessibility finding is either confirmed-good or a known/scoped gap; this one is a genuine unknown.

**Status: Done (2026-07-06).** Measured precisely instead of via a single manual DevTools sample: reimplemented the CSS Filter Effects spec's `grayscale()`/`brightness()` math plus the WCAG relative-luminance/contrast formulas in a throwaway Node script, run against every real choice color/text pairing in all three games (not just one). Result: the v0.12.0 fix (`grayscale(85%) brightness(0.88)`) actually failed for Color Match's red (2.72:1) and blue (3.88:1) swatches — confirming this was a real gap, not a false alarm. Retuned to `grayscale(40%) brightness(1.2)`, which clears 4.5:1 with margin (minimum 5.06:1) across all 15 real color/text combinations checked (11 Color Match colors + Animal Sounds' 3 choice-background tokens + Character Match's fixed surface/text pair).

- [x] **Step 1:** ~~Run the app... measure via DevTools/evaluate_script~~ — done via an offline script computing the exact filter + WCAG math against every real color pair instead (more exhaustive than one manual sample).
- [x] **Step 2:** N/A — it failed (see above).
- [x] **Step 3:** Added `src/__tests__/disabledWrongChoiceContrast.test.js` (15 cases, all passing) and retuned `src/index.css:81`'s filter until every case cleared 4.5:1 with margin.
- [x] **Step 4:** `npx vitest run` — 521/521 pass. `npx playwright test` (full e2e incl. visual regression) — 70/70 pass, no baseline updates needed (no existing Storybook snapshot exercises the disabled-wrong state).
- [x] **Step 5:** Commit pending — see plan footer for the batch commit covering this task's files.

### Task 2: Complete the ARIA Tabs pattern

**Files:** `src/components/Dashboard.jsx`, `src/admin/AdminPage.jsx`, associated `__tests__` files.

**Status: Done (2026-07-06).**

- [x] **Step 1:** Added failing tests to `Dashboard.test.jsx`/`AdminPage.test.jsx` asserting `aria-controls`→`id`→`role="tabpanel"`→`aria-labelledby` linkage.
- [x] **Step 2:** Confirmed both failed (`toBeTruthy()` on an empty `aria-controls` attribute).
- [x] **Step 3:** `AdminPage.jsx`: each tab button got `id={`admin-tab-${tab.id}`}`/`aria-controls={`admin-panel-${tab.id}`}`; the settings/games/badges/history panels each got matching `role="tabpanel"`/`id`/`aria-labelledby` (games/badges/history already had a single wrapping `<div className="admin__section">` to annotate directly; settings' `<>` fragment became a `<div>`). `Dashboard.jsx`: same pattern, plus the single dynamic content region (sections or flat grid) wrapped in one `tabpanel` div keyed to `activeTag` — its ARIA attributes are only applied when `allTags.length > 0`, since with no tags no tab buttons render and an unconditional `aria-labelledby` would point at a nonexistent id.
- [x] **Step 4:** Both test files pass (54 tests); full suite 523/523; full `npx playwright test` (e2e + axe-core + visual regression) 70/70, no baseline changes.
- [x] **Step 5:** Committed together with Tasks 3–4 (see plan footer).

### Task 3: Verify tap-target size on answer-choice buttons (WCAG 2.2 SC 2.5.8)

**Files:** `src/games/*/​*.css`, `.game__choice` and related interactive elements.

**Status: Done (2026-07-06) — verified passing, no code change needed.** `src/index.css:44–52`'s base `button { min-width: 64px; min-height: 64px; }` applies globally; every game's `.game__choice` either inherits this or sets an equal/larger explicit `min-height` (120px in all three games). A repo-wide grep for sub-24px CSS dimensions found only decorative, non-interactive elements: recharts/heatmap cells and legend swatches (`ParentDashboard.css`, 10–14px, no click handlers), small icons inside already-large buttons (`KidsProgressPage.css`'s 22px icon sits inside a 56px-minimum tile), and the visually-hidden 1×1px native radio/checkbox inputs (`AdminPage.css`/`index.css`) whose actual click target is their much-larger wrapping `<label>`. Nothing interactive is under 24×24px.

- [x] **Step 1:** Measured via `grep` for sub-24px `width`/`height` declarations across all CSS, cross-referenced against which elements are actually interactive.
- [x] **Step 2:** All ≥ 24×24px (in practice ≥ 48px) — documented above, no code change needed.
- [x] **Step 3–4:** N/A.
- [x] **Step 5:** Committed together with Tasks 2 and 4.

### Task 4: Confirm no keyboard traps exist

**Files:** none expected — verification task.

**Status: Done (2026-07-06) — verified, no code change needed.** Repo-wide grep for `role="dialog"`, `Modal`, and `<dialog` across `src/` found zero matches — the app has no modal/dialog/overlay pattern anywhere, so there is nothing that could trap keyboard focus.

- [x] **Step 1:** Grepped `src/` for dialog/modal patterns — none found.
- [x] **Step 2:** Documented above; task closed with no code change.
- [x] **Step 3–4:** N/A.

---

## Priority 2 — Correctness & convention drift (moderate impact)

### Task 5: Replace hardcoded hex color with a design token

**Files:** `src/components/Dashboard.css:85`

- [ ] **Step 1:** Identify which existing `var(--color-*)` token `#fff` should map to (`--color-surface` is `#FFFFFF` in `src/index.css` — confirm it's the correct semantic fit for this rule before swapping).
- [ ] **Step 2:** Replace `color: #fff;` with `color: var(--color-surface);` (or the correct token).
- [ ] **Step 3:** Run `npm run e2e` (visual regression) — update the Storybook baseline if the swap shifts any pixels (`npx playwright test visual.spec.js --update-snapshots`), review the diff before committing.
- [ ] **Step 4:** Commit: `fix: route Dashboard.css's hardcoded white through the design-token convention`.

### Task 6: Resolve `!important` overrides in `src/index.css`

**Files:** `src/index.css:78` (`.correct`), `:80` (`.highlight-correct`)

- [ ] **Step 1:** Find what these rules are currently overriding (a more specific selector elsewhere, or an inline style) — a repo grep for `.correct`/`.highlight-correct` usage will show the competing rule.
- [ ] **Step 2:** Resolve at the selector level (increase specificity of `.correct`/`.highlight-correct` itself, or lower the specificity of what it's fighting) rather than keeping `!important`.
- [ ] **Step 3:** Run `npx vitest run` and visual regression (`npm run e2e`) to confirm the correct-answer highlight still renders identically.
- [ ] **Step 4:** Commit: `fix: resolve !important overrides on .correct/.highlight-correct via specificity`.

### Task 7: Add a confirmation step to the admin reset action

**Files:** `src/admin/AdminPage.jsx`, `src/admin/__tests__/AdminPage.test.jsx`, `src/i18n/en.json`

- [ ] **Step 1:** Write a failing test asserting that clicking `.admin__reset` shows a confirmation step (e.g. a second "confirm reset" button) before `resetSettings`/equivalent is actually called.
- [ ] **Step 2:** Implement a simple two-step confirm (toggle button label to "Confirm reset?" on first click, perform the reset and revert the label on a second click within a short window, or an inline confirm row) — follow whatever confirm pattern is simplest given the existing component structure, not a new modal system.
- [ ] **Step 3:** Add the new copy to `src/i18n/en.json` under `admin.*`, run through `t()`.
- [ ] **Step 4:** Run `npx vitest run src/admin/__tests__/AdminPage.test.jsx`, then the full suite.
- [ ] **Step 5:** Commit: `fix(usability): require confirmation before Admin reset takes effect`.

### Task 8: Fix `act()` warnings from the new focus-management effects

**Files:** `src/parent/__tests__/ParentDashboard.test.jsx`, `src/kids/__tests__/KidsProgressPage.test.jsx`, `src/games/color-match/__tests__/ColorMatchGame.test.jsx`, `src/games/character-match/__tests__/CharacterMatchGame.test.jsx`

- [ ] **Step 1:** Reproduce each warning: `npx vitest run <file>` and note the exact warning text/location for each of the four files.
- [ ] **Step 2:** Wrap the relevant render/interaction in `await waitFor(...)` or an explicit `act(async () => ...)` around the state update the new focus-on-mount effect triggers, per each file's existing test-utility conventions (`docs/TESTING.md`'s fake-timer/`fireEvent` notes apply to the timed-feedback tests specifically — don't switch those to `userEvent`).
- [ ] **Step 3:** Re-run each file individually to confirm the warning is gone and the assertions still pass.
- [ ] **Step 4:** Run the full suite: `npx vitest run`.
- [ ] **Step 5:** Commit: `fix(test): synchronize focus-management assertions with RTL async utilities`.

---

## Priority 3 — Process & tooling (prevents future regressions)

### Task 9: Add `eslint-plugin-jsx-a11y`

**Files:** `package.json`, `eslint.config.js`

- [ ] **Step 1:** `npm install --save-dev eslint-plugin-jsx-a11y`.
- [ ] **Step 2:** Add the plugin and its recommended rule set to `eslint.config.js`, scoped to `**/*.{js,jsx}` alongside the existing react-hooks/react-refresh config.
- [ ] **Step 3:** Run `npm run lint` — triage any new findings; fix genuine issues, and only add narrow per-line `eslint-disable` comments (with a one-line reason) for confirmed false positives, not blanket rule disables.
- [ ] **Step 4:** Commit: `chore(lint): add eslint-plugin-jsx-a11y for edit-time accessibility linting`.

### Task 10: Add Stylelint and `.editorconfig`

**Files:** new `.stylelintrc.json`, new `.editorconfig`, `package.json`

- [ ] **Step 1:** `npm install --save-dev stylelint stylelint-config-standard`.
- [ ] **Step 2:** Add a `.stylelintrc.json` extending `stylelint-config-standard`; add an `npm run lint:css` script.
- [ ] **Step 3:** Run it against `src/**/*.css`, triage findings (this is the point the RTL logical-property convention and any other CSS drift could be codified as a lint rule, not just documentation).
- [ ] **Step 4:** Add a minimal `.editorconfig` matching the project's actual indentation/line-ending conventions (check a few existing files rather than assuming).
- [ ] **Step 5:** Commit: `chore(lint): add Stylelint and .editorconfig`.

### Task 11: Fix coverage scoping in `vite.config.js`

**Files:** `vite.config.js`

- [ ] **Step 1:** Add `coverage: { include: ['src/**'] }` under the `test` block (alongside whatever coverage config already exists).
- [ ] **Step 2:** Run `npm run coverage` and confirm the "All files" rollup now reflects real `src/` numbers instead of `0 | 0 | 0 | 0`.
- [ ] **Step 3:** Commit: `fix(test): scope coverage rollup to src/ so the aggregate number is meaningful`.

### Task 12: Add `coverage` to ESLint's ignore list

**Files:** `eslint.config.js`

- [ ] **Step 1:** Add `'coverage'` to the `ignores` array (currently `['dist', 'node_modules', '.claude']`).
- [ ] **Step 2:** Run `npm run coverage` then `npm run lint` — confirm the 3 warnings from generated coverage-report JS are gone.
- [ ] **Step 3:** Commit: `chore(lint): stop linting generated coverage/ output`.

### Task 13: Wire an offline HTML5 validator into CI

**Files:** new script under `scripts/`, `package.json`

- [ ] **Step 1:** `npm install --save-dev html-validate` (works offline, unlike the W3C Nu Checker which this audit couldn't reach).
- [ ] **Step 2:** Write a small script that renders each key route (reuse the Playwright dev-server pattern already used by `e2e/`) and pipes the resulting DOM through `html-validate`.
- [ ] **Step 3:** Add an `npm run validate:html` script; decide with the user whether it runs in CI automatically or stays a manual/local check.
- [ ] **Step 4:** Run it once against all routes to get a real baseline (replacing this audit's manual-review substitute) and fix anything it finds.
- [ ] **Step 5:** Commit: `chore(ci): add offline HTML5 validation against rendered routes`.

---

## Deferred (tracked, not scheduled)

These were already explicitly deferred by the 2026-07-05 accessibility/i18n hardening design spec's own scope decisions — re-flagged here for completeness, not newly discovered:

- **RTL logical CSS properties** (`src/parent/ParentDashboard.css:104, :211` — `text-align: left`/`right` instead of `start`/`end`). Revisit when an RTL locale is actually planned.
- **i18n plural form for `common.difficultyOfferHeading`** (`src/i18n/en.json:11`). Revisit when a second locale with real plural rules is added — Task 10's Stylelint pass won't catch this (it's an i18n concern, not CSS), so track it here explicitly instead.

## Informational (no action required)

- **Google Analytics / COPPA.** Confirmed real, opt-in, off-by-default (`src/App.jsx:28–53`, `src/admin/AdminPage.jsx:210–218`). No fix needed — the decision trigger is future distribution with GA switched on, not the current self-hosted state. Revisit if/when this app is ever shared beyond one family.
- **Lighthouse SEO (83/100) / "Agentic Browsing" (67/100)** on the Dashboard. Outside the scope of what was asked; noted for awareness only, no task opened.
- **Everything the audit marked "Confirmed"** — focus-visible rings, focus management on transitions, `aria-live` scoping, `prefers-reduced-motion`, chart accessibility fallbacks, all four i18n fixes. Verified working; no action.
