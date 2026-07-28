# Fix All Pipelines — Implementation Plan

**Issue:** GitHub #141
**Design:** `docs/superpowers/specs/2026-07-28-fix-ci-pipelines-design.md`
**Branch:** `141`

## Task 1 — `npm-audit`: `audit-ci` scoped allowlist

1. `npm install --save-dev audit-ci@^7.1.0`.
2. `.github/workflows/ci.yml`: replace the `npm-audit` job's gate step
   (`npm audit --omit=dev --audit-level=moderate`) with:
   ```yaml
   - name: Production dependency audit (gate)
     run: npx audit-ci --moderate --skip-dev --allowlist GHSA-qwww-vcr4-c8h2
   ```
   Add a short inline comment above it: what's allowlisted, why (RSC-mode
   advisory, this app never uses RSC/framework mode), and a pointer to the
   `docs/ENHANCEMENTS.md` backlog item for the real fix.
   Leave the dev-tree report-only step untouched.
3. `.github/__tests__/ci.test.js`:
   - Update the existing gate-step test to assert `audit-ci`, `--moderate`,
     `--skip-dev`, `--allowlist GHSA-qwww-vcr4-c8h2` are present, and
     `continue-on-error`/`|| true` are still absent.
   - Add a negative test: the gate step's `run` string contains exactly one
     `GHSA-` occurrence (regex count), so a future PR can't silently widen
     the allowlist without this test failing first.
   - Leave the dev-tree report-step tests as-is (unchanged step).
4. `docs/ENHANCEMENTS.md` (Security section): add
   `- **Upgrade to React 19 + react-router 8** — removes the need for the npm-audit allowlist entry covering GHSA-qwww-vcr4-c8h2 (RSC-mode CSRF advisory; not reachable via this app's BrowserRouter-only usage, but the dependency itself sits in the flagged range). Tracked as a real upgrade, not a quick fix, since react-router 8 requires React ≥19.2.7.`
5. `SECURITY.md`: update the `npm audit` in CI bullet to describe the
   `audit-ci` gate, the scoped allowlist, and the backlog pointer.
6. `docs/TESTING.md` Continuous Integration section: update the `npm-audit`
   description to name `audit-ci` and the allowlist.

## Task 2 — `lighthouse`: explicit Chrome setup

1. `.github/workflows/ci.yml`, `lighthouse` job: insert before the
   `npx lhci autorun` step:
   ```yaml
   - name: Set up Chrome for Lighthouse CI
     id: setup-chrome
     uses: browser-actions/setup-chrome@v2
     with:
       chrome-version: stable
   ```
   and add `env: { CHROME_PATH: ${{ steps.setup-chrome.outputs.chrome-path }} }`
   to the `lhci autorun` step.
2. `.github/__tests__/ci.test.js`: add a test asserting the `lighthouse`
   job has a step with `uses` starting `browser-actions/setup-chrome`,
   positioned before the `lhci autorun` step (compare step array indices);
   assert the `lhci autorun` step's `env.CHROME_PATH` contains
   `steps.setup-chrome.outputs.chrome-path`. Add a negative test: no other
   job defines a `browser-actions/setup-chrome` step.
3. `docs/TESTING.md`: note the explicit Chrome install step and why
   (`ubuntu-latest` no longer guarantees a pre-installed browser).

## Task 3 — Generate missing Linux visual baselines

1. Confirm exact `@playwright/test` version pin (`1.61.1`, per
   `package.json`/`playwright --version`).
2. Run, from repo root, inside `mcr.microsoft.com/playwright:v1.61.1-noble`
   (mounting the repo, running `npm ci` inside the container so native
   deps match the image, then Storybook + the targeted Playwright update):
   ```
   npx playwright test visual.spec.js --update-snapshots \
     -g "components-gameresults--with-accent|components-gameresults--with-accent-dark|components-gameresults--with-accent-high-contrast|components-gameresults--memory-perfect-run|games-soundmemorymatchgame--default"
   ```
3. Verify exactly 5 new files land in `e2e/visual.spec.js-snapshots/`,
   named `*-chromium-linux.png`, and that no existing snapshot (win32 or
   linux) is modified or deleted.
4. `git add` the 5 new PNGs.

## Task 4 — Fix header icon overflow (zoom-large-text regression)

1. Reproduce first: `npx playwright test e2e/zoom-large-text.spec.js -g "does not push the page into horizontal overflow"` — confirm the failure locally (already done during design).
2. `src/components/AppShell.css`: on `.shell__back`, `.shell__nav-link`,
   `.shell__home`, `.shell__theme-toggle` (all four share the icon-button
   pattern), change `font-size: 1.5rem;` to `font-size: 24px;` — a comment
   explaining why (icon glyph, not resizable text; must stay inside the
   already-fixed 48px touch target regardless of the large-text setting).
3. Update the `.shell__side` width-budget comment (currently computed for a
   3-icon nav row) to include the 4th icon
   (`.shell__theme-toggle`) in the arithmetic.
4. Re-run the same Playwright test — confirm it now passes. Re-run the full
   `e2e/zoom-large-text.spec.js` file (all tests, not just the one that was
   failing) to make sure the fixed-px change doesn't regress anything else
   in that file (e.g. the "negative: fixed-layout hidden data table still
   exposes every game column" test, or the heatmap-alignment tests).
5. Spot-check visually (dev server, phone-width viewport, both normal and
   simulated large text) that the header icons still look right — this is a
   visible UI change, not just a passing assertion.

## Task 5 — Fix confetti-csp worker race

1. `e2e/confetti-csp.spec.js`: add
   `test.describe.configure({ mode: 'serial' })` immediately after the
   `test.describe(...)` line (mirroring `e2e/visual.spec.js`'s existing use
   of the same directive), with a comment explaining the concurrent-`npm run
   build`-into-shared-`dist/` race this prevents.
2. Run the full file locally (`npx playwright test e2e/confetti-csp.spec.js`)
   to confirm all 3 tests still pass serialized, and that serializing didn't
   introduce a new timeout from running longer end-to-end (3 tests × build +
   docker startup, sequentially, might approach the per-test 60s budget
   summed — check total wall time is reasonable, not just individual test
   pass/fail).

## Task 6 — Final verification

1. `npm run lint && npm run lint:css`.
2. `npm run coverage` (full unit suite).
3. `npm run e2e` locally (full suite) — confirm the 7 previously-failing
   tests now pass and nothing else regressed.
4. `npx vitest run .github/__tests__/ci.test.js .github/__tests__/lighthouserc.test.js`.
5. Bump `package.json` version (patch/minor — infra fixes + one real CSS
   bugfix); add `CHANGELOG.md` entry summarizing all 5 fixes with issue
   #141 reference.
6. Push branch `141`, open a PR, and treat the resulting Actions run as the
   final proof for the two changes (lighthouse Chrome setup, confetti-csp
   serialization) that can't be fully verified outside real CI.
