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

**Status: Done (2026-07-06).** `.dashboard__tab--active`'s `color: #fff` → `color: var(--color-surface)`. Full suite + visual regression both pass with no baseline changes (identical rendered color).

### Task 6: Resolve `!important` overrides in `src/index.css`

**Files:** `src/index.css` (`.correct`, `.wrong`, `.highlight-correct`, `shake-red` keyframes)

**Status: Done (2026-07-06) — kept `!important`, because removing it is impossible here, and found a real bug investigating why.** Selector specificity cannot beat an inline `style` attribute (CSS fact, not a workaround) — and Color Match/Animal Sounds set each choice's resting `background` via inline `style`, so `.correct`/`.highlight-correct` need `!important` to override it regardless of selector shape. That's documented in a new comment at `src/index.css:78`.

While verifying this in a real browser (not assumed), found that `.wrong` — unlike `.correct`/`.highlight-correct` — never had `!important`, so its background silently never showed for Color Match/Animal Sounds under `prefers-reduced-motion: reduce` (confirmed via Playwright: computed background stayed the original swatch color, never red). Added `!important` to `.wrong` too, for the same reason its siblings have it.

Separately found the `shake-red` keyframe's `0%, 100% { background: inherit; }` resolves to the *parent's* background (not "this element's own resting value"), so after every wrong-answer shake animation in **all three games**, the choice button was left with a fully transparent background (confirmed via Playwright: `rgba(0, 0, 0, 0)` at rest) — not the swatch color, not red, just see-through. Fixed by removing `background: inherit` from that keyframe stop entirely, letting the animation fall back to the real underlying value at rest per the CSS Animations spec.

- [x] **Step 1:** Confirmed via grep + reasoning that `.correct`/`.highlight-correct` are fighting inline `style.background`, not another stylesheet rule.
- [x] **Step 2:** Verified empirically (Playwright, real Chromium, both motion-enabled and `prefers-reduced-motion: reduce`) rather than assumed. Added a new e2e test (`e2e/color-match.spec.js`: "a wrong choice keeps a real background after its shake animation ends") that failed before the keyframe fix and passes after.
- [x] **Step 3:** `npx vitest run` (524/524) and `npx playwright test` (71/71, no visual-regression baseline changes) both pass.
- [x] **Step 4:** Committed together with Task 5, 7, 8 (see plan footer).

### Task 7: Add a confirmation step to the admin reset action

**Files:** `src/admin/AdminPage.jsx`, `src/admin/__tests__/AdminPage.test.jsx`, `src/i18n/en.json`

**Status: Done (2026-07-06).** First click on `.admin__reset` switches its label to `admin.resetConfirm` ("Are you sure? Tap again to reset") and starts a 4s window; a second click within that window calls `resetSettings()` and reverts the label; letting the window elapse without a second click also reverts it (no accidental reset), matching the plan's "toggle label, then confirm within a short window" option.

- [x] **Step 1:** Two failing tests added (confirm-then-reset, and revert-after-timeout using fake timers per this repo's `fireEvent`-with-fake-timers convention).
- [x] **Step 2:** Implemented via `resetConfirming` state + a cleared-on-unmount `setTimeout` — no new modal/dialog component.
- [x] **Step 3:** `admin.resetConfirm` added to `src/i18n/en.json`, routed through `t()`.
- [x] **Step 4:** `AdminPage.test.jsx` 34/34 pass; full suite 524/524.
- [x] **Step 5:** Committed together with Tasks 5, 6, 8.

### Task 8: Fix `act()` warnings from the new focus-management effects

**Files:** `src/parent/__tests__/ParentDashboard.test.jsx`, `src/kids/__tests__/KidsProgressPage.test.jsx`, `src/games/color-match/__tests__/ColorMatchGame.test.jsx`, `src/games/character-match/__tests__/CharacterMatchGame.test.jsx`

**Status: Done (2026-07-06).** Root cause differed per file: `ParentDashboard`/`KidsProgressPage` fetch best-streaks asynchronously on mount (`adapter.getBestStreaks().then(setBestStreaks)`) and most tests never awaited that flush; `ColorMatchGame`/`CharacterMatchGame`'s intro-dismissal tests needed one more `act()` flush after the final click, since the transition into gameplay schedules a state update on a later microtask than the click's own `act()` wrapper covered.

- [x] **Step 1:** Reproduced all four; exact warning text differed (`ParentDashboard`/`KidsProgressPage`: "was not wrapped in act(...)"; Color/Character Match: "environment is not configured to support act(...)").
- [x] **Step 2:** `ParentDashboard.test.jsx`: `renderDashboard()` helper made `async`, flushing once via `await act(async () => {})`, all 20 call sites updated to `await` it. `KidsProgressPage.test.jsx`: the one offending test switched from a bare `render()` to `await screen.findByRole(...)` before asserting focus (matching the file's own existing `renderPage()` helper pattern). Color/Character Match: added one more `await act(async () => {})` after the last click, before the assertion.
- [x] **Step 3:** Each file re-run individually — zero warnings, all pass.
- [x] **Step 4:** Full suite `npx vitest run` — 524/524.
- [x] **Step 5:** Committed together with Tasks 5–7.

---

## Priority 3 — Process & tooling (prevents future regressions)

### Task 9: Add `eslint-plugin-jsx-a11y`

**Files:** `package.json`, `eslint.config.js`

**Status: Done (2026-07-06).** Wired via `jsxA11y.flatConfigs.recommended.rules`. Lint came back clean with zero new findings — consistent with the audit's other results (zero axe violations anywhere) — so nothing needed fixing or suppressing.

- [x] **Steps 1–4:** installed, wired into `eslint.config.js`, `npm run lint` clean (0 errors, 0 warnings), committed together with Tasks 11–12.

### Task 10: Add Stylelint and `.editorconfig`

**Files:** `.stylelintrc.json` (new), `.editorconfig` (new), `package.json`, plus CSS fixes across `src/`

**Status: Done (2026-07-06).** Initial run against `src/**/*.css` with bare `stylelint-config-standard` returned 500 problems — almost all from two rules that conflict with this codebase's own established, consistent conventions rather than real defects: `selector-class-pattern` (BEM naming — `.game__choice--disabled-wrong` — isn't plain kebab-case) and `declaration-block-single-line-max-declarations` (this codebase deliberately writes compact single-line rules throughout). Both disabled in `.stylelintrc.json` rather than mass-reformatting every CSS file for a cosmetic preference.

After that, 125 remained: `--fix` handled legacy `rgba()`/alpha-value modernization to CSS Color 4 syntax (114 of them) automatically — safe, since the computed colors are identical. The rest were real: `no-descending-specificity` on 6 selector pairs across `BadgeGallery.css`, `KidsProgressPage.css`, and all three game CSS files' `.game__choice:disabled`/`:focus`/`:focus-visible` vs `:hover:not(:disabled)` — reordered so ascending-specificity reads top-to-bottom (no behavior change, since the higher-specificity rule already won regardless of position). And one genuine deprecation: `.sr-only`'s `clip: rect(...)` — added `clip-path: inset(50%)` as the modern rule, kept `clip` as an explicitly-commented legacy fallback with a targeted `stylelint-disable-next-line`.

- [x] **Step 1:** `npm install --save-dev stylelint stylelint-config-standard`.
- [x] **Step 2:** `.stylelintrc.json` added; `npm run lint:css` script added.
- [x] **Step 3:** All findings triaged as above — 0 remaining errors.
- [x] **Step 4:** `.editorconfig` added, matching the repo's actual conventions (checked via `file`/`cat -A`: UTF-8, CRLF, 2-space indent).
- [x] **Step 5:** `npx vitest run` (524/524), `npm run lint`/`lint:css` (both clean), full `npx playwright test` (76/76 incl. visual regression, no baseline changes) all pass. Committed together with Task 13 (the CSS reorders/clip-path fix touch the same files a straight tooling-only commit would, so they're bundled).

### Task 11: Fix coverage scoping in `vite.config.js`

**Files:** `vite.config.js`

**Status: Done (2026-07-06).** Added `coverage: { include: ['src/**'] }`. "All files" rollup now reports 88.78% instead of `0 | 0 | 0 | 0`.

- [x] **Steps 1–3:** done, verified, committed together with Tasks 9 and 12.

### Task 12: Add `coverage` to ESLint's ignore list

**Files:** `eslint.config.js`

**Status: Done (2026-07-06).** Added `'coverage'` to `ignores`. The 3 pre-existing "unused eslint-disable directive" warnings from generated coverage-report JS are gone.

- [x] **Steps 1–2:** done, verified (`npm run lint` — 0 errors, 0 warnings), committed together with Tasks 9 and 11.

### Task 13: Wire an offline HTML5 validator into CI

**Files:** `e2e/html-validity.spec.js` (new), `package.json`

**Status: Done (2026-07-06).** Chose a Playwright e2e spec over a standalone script — it plugs directly into the existing dev-server/webServer machinery `e2e/*.spec.js` already uses, and runs automatically under `npm run e2e` (this repo's de facto CI gate) without a second server-orchestration path to maintain. Checks the rendered DOM (not the near-empty `index.html` shell) on `/`, `/admin`, `/parent`, `/my-progress`, and Color Match's gameplay screen, via `html-validate` (fully offline — the live W3C Nu Checker was unreachable from this audit's sandbox).

The first run surfaced one genuine finding: `Timer.jsx`'s root `<div>` had `aria-label` with no ARIA role, which `aria-label-misuse` correctly flags as not reliably read by assistive tech on a bare, role-less `div`. Fixed by adding `role="timer"` (WAI-ARIA 1.2's exact semantic match for "elapsed/remaining time" — doesn't imply `aria-live` behavior, so the design spec's deliberate "no announce every tick" choice is unaffected).

Everything else `html-validate:recommended` flagged was tuned off with a documented reason rather than treated as a defect: `no-inline-style` (this app's per-item dynamic colors are legitimately inline-styled — valid HTML5, just a style preference beyond conformance), `no-implicit-button-type` (only consequential inside a `<form>`, and this app has none, anywhere), `no-trailing-whitespace` and `attribute-boolean-style` (both artifacts of how `page.content()` serializes live browser DOM state, not something authored in JSX), and `doctype-style` (set to match what the serialized DOM actually contains, not the source file's casing).

- [x] **Step 1:** `npm install --save-dev html-validate`.
- [x] **Step 2:** `e2e/html-validity.spec.js` renders each route/state and calls `HtmlValidate.validateString()` against `page.content()`.
- [x] **Step 3:** Added both `npm run validate:html` (standalone) and it runs automatically as part of `npm run e2e` (no separate CI wiring needed — this repo doesn't have a separate CI config file to touch).
- [x] **Step 4:** Ran against all 5 routes/states — 1 real fix (Timer's `role="timer"`), rest were rule-tuning as documented above. All green now.
- [x] **Step 5:** Committed together with Task 10 (see below).

---

## Deferred (tracked, not scheduled)

These were already explicitly deferred by the 2026-07-05 accessibility/i18n hardening design spec's own scope decisions — re-flagged here for completeness, not newly discovered:

- **RTL logical CSS properties** (`src/parent/ParentDashboard.css:104, :211` — `text-align: left`/`right` instead of `start`/`end`). Revisit when an RTL locale is actually planned.
- **i18n plural form for `common.difficultyOfferHeading`** (`src/i18n/en.json:11`). Revisit when a second locale with real plural rules is added — Task 10's Stylelint pass won't catch this (it's an i18n concern, not CSS), so track it here explicitly instead.

## Informational (no action required)

- **Google Analytics / COPPA.** Confirmed real, opt-in, off-by-default (`src/App.jsx:28–53`, `src/admin/AdminPage.jsx:210–218`). No fix needed — the decision trigger is future distribution with GA switched on, not the current self-hosted state. Revisit if/when this app is ever shared beyond one family.
- **Lighthouse SEO (83/100) / "Agentic Browsing" (67/100)** on the Dashboard. Outside the scope of what was asked; noted for awareness only, no task opened.
- **Everything the audit marked "Confirmed"** — focus-visible rings, focus management on transitions, `aria-live` scoping, `prefers-reduced-motion`, chart accessibility fallbacks, all four i18n fixes. Verified working; no action.
