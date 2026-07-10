# Filter Tab Hover Contrast Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the dashboard's active filter tab going unreadable (white text on a near-white background) whenever it's hovered or tapped, and close the identical untested gap in two sibling components that already have the CSS fix but no regression test for it.

**Architecture:** Pure CSS specificity fix (no JS/component changes) in `src/components/Dashboard.css`, following the exact convention already established in `src/admin/AdminPage.css` and `src/parent/DateRangeFilter.css`. All new test coverage is Playwright e2e (real browser `:hover`, which jsdom/Vitest cannot simulate — there is no real CSS cascade in jsdom for imported stylesheets, so this bug class is only observable/testable in a real browser).

**Tech Stack:** Vite/React (no changes), Playwright + `@axe-core/playwright` for e2e/a11y tests.

**Full background/root-cause analysis:** see `docs/superpowers/specs/2026-07-09-filter-tab-hover-contrast-design.md` — read it before starting if anything below is unclear.

## Global Constraints

- CSS custom property values used throughout: `--color-lavender-dark: #6A4FA3` → `rgb(106, 79, 163)`; the plain hover tint is `rgb(0 0 0 / 5%)` → `rgba(0, 0, 0, 0.05)`. Both browsers/Playwright report `getComputedStyle`/`toHaveCSS` values in this exact `rgb(r, g, b)` / `rgba(r, g, b, a)` comma-space format — use these exact strings in assertions.
- Every new CSS rule must follow the established repo convention: a comment above the `--active:hover` rule explaining the specificity trap (copy the wording style already used in `AdminPage.css`/`DateRangeFilter.css`, cross-referencing this fix).
- No changes to `AdminPage.css` or `DateRangeFilter.css` — they already contain the correct fix. Only new tests are added there.
- After any hover or click that changes `.dashboard__tab`/`.admin__tab`/`.date-range-filter__tab` background/color, wait 200ms before asserting or running an axe scan — these elements have `transition: background 0.15s, color 0.15s, border-color 0.15s`, and this repo's existing tests already use a 200ms settle wait for the same reason (see `e2e/admin.spec.js`'s "badges tab has no accessibility violations" test).
- Run `npm run e2e` for all e2e verification steps in this plan (Playwright's `webServer` config auto-starts/reuses the dev server on port 5173).

---

## Task 1: Fix the Dashboard active-tab hover contrast bug

**Files:**
- Modify: `src/components/Dashboard.css:43-51`
- Modify: `e2e/dashboard.spec.js` (append new tests at end of file, after the existing test ending at line 89)

**Interfaces:**
- Consumes: nothing new — targets the existing `#dashboard-tab-all` / `#dashboard-tab-sounds` / `#dashboard-tab-animals` elements rendered by `src/components/Dashboard.jsx` (unchanged), which carry classes `dashboard__tab` and, when active, `dashboard__tab--active`.
- Produces: nothing consumed by later tasks — this task is self-contained.

- [ ] **Step 1: Write the failing e2e tests**

Append to `e2e/dashboard.spec.js` (after the last test, which currently ends at line 89 with the closing `})` of `'dashboard has no accessibility violations after enhancements'`):

```js
test('active tab keeps its solid background when hovered', async ({ page }) => {
  await page.goto('/')
  const allTab = page.getByRole('tab', { name: 'All' })
  await allTab.hover()
  await page.waitForTimeout(200)
  await expect(allTab).toHaveCSS('background-color', 'rgb(106, 79, 163)')
  await expect(allTab).toHaveCSS('color', 'rgb(255, 255, 255)')
})

test('a tab keeps its solid background when hovered right after being clicked active', async ({ page }) => {
  await page.goto('/')
  const soundsTab = page.getByRole('tab', { name: 'Sounds' })
  await soundsTab.click()
  await soundsTab.hover()
  await page.waitForTimeout(200)
  await expect(soundsTab).toHaveCSS('background-color', 'rgb(106, 79, 163)')
  await expect(soundsTab).toHaveCSS('color', 'rgb(255, 255, 255)')
})

test('an inactive tab still shows the light hover tint, not the active color', async ({ page }) => {
  await page.goto('/')
  const animalsTab = page.getByRole('tab', { name: 'Animals' })
  await animalsTab.hover()
  await page.waitForTimeout(200)
  await expect(animalsTab).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.05)')
})

test('active tab has no accessibility violations while hovered', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const allTab = page.getByRole('tab', { name: 'All' })
  await allTab.hover()
  await page.waitForTimeout(200)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

- [ ] **Step 2: Run the new tests to confirm the bug reproduces**

Run: `npx playwright test e2e/dashboard.spec.js -g "hover"`

Expected: The first two tests (`active tab keeps its solid background when hovered`, `a tab keeps its solid background when hovered right after being clicked active`) FAIL — actual `background-color` will be `rgba(0, 0, 0, 0.05)`, not `rgb(106, 79, 163)`. The third test (inactive tab hover tint) and the fourth (axe scan) may pass or fail depending on whether axe's contrast check flags the hovered active tab — either way, do not fix yet; this step is only to confirm the first two fail for the documented reason.

- [ ] **Step 3: Apply the CSS fix**

In `src/components/Dashboard.css`, the current lines 43-51 read:

```css
.dashboard__tab:hover {
  background: rgb(0 0 0 / 5%);
}

.dashboard__tab--active {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-surface);
}
```

Replace with:

```css
.dashboard__tab:hover {
  background: rgb(0 0 0 / 5%);
}

.dashboard__tab--active {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-surface);
}

/* `.dashboard__tab:hover` (a class + a pseudo-class) has higher specificity
   than the single-class `.dashboard__tab--active`, so without this rule,
   hovering the active tab silently strips its solid background back to a
   faint rgba(0,0,0,0.05) tint while its white text color is untouched -- a
   real WCAG 2 AA color-contrast failure (white text on a near-transparent
   background) that occurs whenever a pointer rests on the active tab, or on
   mobile where a tap leaves a tab in a sticky `:hover` state. Same pattern as
   `.admin__tab--active:hover` in src/admin/AdminPage.css and
   `.date-range-filter__tab--active:hover` in src/parent/DateRangeFilter.css;
   re-assert the active styling at equal specificity so it wins the cascade
   on hover too. */
.dashboard__tab--active:hover {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-surface);
}
```

- [ ] **Step 4: Run the tests again to confirm they now pass**

Run: `npx playwright test e2e/dashboard.spec.js -g "hover"`

Expected: All 4 tests PASS.

- [ ] **Step 5: Run the full dashboard e2e suite to check for regressions**

Run: `npx playwright test e2e/dashboard.spec.js`

Expected: All tests PASS (this file had 9 tests before this task; it now has 13).

- [ ] **Step 6: Lint the changed CSS**

Run: `npx stylelint src/components/Dashboard.css`

Expected: No output (no lint errors).

- [ ] **Step 7: Commit**

```bash
git add src/components/Dashboard.css e2e/dashboard.spec.js
git commit -m "fix: keep active dashboard filter tab readable when hovered or tapped

.dashboard__tab:hover has higher CSS specificity than the single-class
.dashboard__tab--active, so hovering (desktop) or tapping (mobile, which
leaves a sticky :hover state) the currently selected tab silently reverted
its solid dark-purple background to a near-transparent tint while its white
text stayed white -- a real WCAG 2 AA contrast failure (fixes #47). Re-assert
the active styling at equal specificity, matching the existing
.admin__tab--active:hover / .date-range-filter__tab--active:hover pattern."
```

---

## Task 2: Add hover-contrast regression tests to AdminPage (CSS already correct)

**Files:**
- Modify: `e2e/admin.spec.js` (append new tests at end of file, after the existing test ending at line 134)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing consumed by later tasks.

**Context:** `src/admin/AdminPage.css` already has `.admin__tab--active:hover` (added in a past commit). No CSS change is needed here — this task only adds the regression test that was missing, so a future accidental deletion of that rule would be caught. The default active tab on `/admin` load is "Settings" (`src/admin/AdminPage.jsx:18`, `useState('settings')`); "Games" and "Badges" are the other two tabs already exercised elsewhere in this file.

- [ ] **Step 1: Write the tests**

Append to `e2e/admin.spec.js` (after the last test, which currently ends at line 134):

```js
test('active admin tab keeps its solid background when hovered', async ({ page }) => {
  await page.goto('/admin')
  const settingsTab = page.getByRole('tab', { name: 'Settings' })
  await settingsTab.hover()
  await page.waitForTimeout(200)
  await expect(settingsTab).toHaveCSS('background-color', 'rgb(106, 79, 163)')
  await expect(settingsTab).toHaveCSS('color', 'rgb(255, 255, 255)')
})

test('an admin tab keeps its solid background when hovered right after being clicked active', async ({ page }) => {
  await page.goto('/admin')
  const badgesTab = page.getByRole('tab', { name: 'Badges' })
  await badgesTab.click()
  await badgesTab.hover()
  await page.waitForTimeout(200)
  await expect(badgesTab).toHaveCSS('background-color', 'rgb(106, 79, 163)')
  await expect(badgesTab).toHaveCSS('color', 'rgb(255, 255, 255)')
})

test('an inactive admin tab still shows the light hover tint, not the active color', async ({ page }) => {
  await page.goto('/admin')
  const gamesTab = page.getByRole('tab', { name: /games/i })
  await gamesTab.hover()
  await page.waitForTimeout(200)
  await expect(gamesTab).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.05)')
})

test('active admin tab has no accessibility violations while hovered', async ({ page }) => {
  await page.goto('/admin')
  const settingsTab = page.getByRole('tab', { name: 'Settings' })
  await settingsTab.hover()
  await page.waitForTimeout(200)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

- [ ] **Step 2: Run the tests to confirm they pass (no code fix expected)**

Run: `npx playwright test e2e/admin.spec.js -g "hover"`

Expected: All 4 tests PASS immediately — `AdminPage.css` already has the fix. If any of these fail, stop and re-check `src/admin/AdminPage.css:40-44` still contains `.admin__tab--active:hover` before investigating further; do not "fix" by weakening the assertion.

- [ ] **Step 3: Run the full admin e2e suite to check for regressions**

Run: `npx playwright test e2e/admin.spec.js`

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/admin.spec.js
git commit -m "test: cover admin active-tab hover contrast (was fixed but untested)

.admin__tab--active:hover already re-asserts the active styling against
.admin__tab:hover's higher specificity, but nothing simulated a real :hover
to verify it -- existing coverage only guarded the click transition timing.
Add the missing regression test so deleting that rule would be caught."
```

---

## Task 3: Add hover-contrast regression tests to DateRangeFilter (CSS already correct)

**Files:**
- Modify: `e2e/parent-dashboard.spec.js` (append new tests at end of file, after the existing test ending at line 80)

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces: nothing consumed by later tasks.

**Context:** `src/parent/DateRangeFilter.css` already has `.date-range-filter__tab--active:hover`. No CSS change is needed — same rationale as Task 2. The default active preset on `/parent` load is "All time" (`e2e/parent-dashboard.spec.js:29` already asserts this); "7 days" and "30 days" are the other presets already exercised elsewhere in this file. This file's `test.beforeEach` (lines 19-24) seeds scores via `page.addInitScript` before every test — no change needed there, it applies automatically to the new tests too.

- [ ] **Step 1: Write the tests**

Append to `e2e/parent-dashboard.spec.js` (after the last test, which currently ends at line 80):

```js
test('active date-range tab keeps its solid background when hovered', async ({ page }) => {
  await page.goto('/parent')
  const allTimeTab = page.getByRole('tab', { name: 'All time' })
  await allTimeTab.hover()
  await page.waitForTimeout(200)
  await expect(allTimeTab).toHaveCSS('background-color', 'rgb(106, 79, 163)')
  await expect(allTimeTab).toHaveCSS('color', 'rgb(255, 255, 255)')
})

test('a date-range tab keeps its solid background when hovered right after being clicked active', async ({ page }) => {
  await page.goto('/parent')
  const sevenDaysTab = page.getByRole('tab', { name: '7 days' })
  await sevenDaysTab.click()
  await sevenDaysTab.hover()
  await page.waitForTimeout(200)
  await expect(sevenDaysTab).toHaveCSS('background-color', 'rgb(106, 79, 163)')
  await expect(sevenDaysTab).toHaveCSS('color', 'rgb(255, 255, 255)')
})

test('an inactive date-range tab still shows the light hover tint, not the active color', async ({ page }) => {
  await page.goto('/parent')
  const thirtyDaysTab = page.getByRole('tab', { name: '30 days' })
  await thirtyDaysTab.hover()
  await page.waitForTimeout(200)
  await expect(thirtyDaysTab).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.05)')
})

test('active date-range tab has no accessibility violations while hovered', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/parent')
  const allTimeTab = page.getByRole('tab', { name: 'All time' })
  await allTimeTab.hover()
  await page.waitForTimeout(200)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

- [ ] **Step 2: Run the tests to confirm they pass (no code fix expected)**

Run: `npx playwright test e2e/parent-dashboard.spec.js -g "hover"`

Expected: All 4 tests PASS immediately — `DateRangeFilter.css` already has the fix. If any fail, stop and re-check `src/parent/DateRangeFilter.css:37-41` still contains `.date-range-filter__tab--active:hover` before investigating further.

- [ ] **Step 3: Run the full parent-dashboard e2e suite to check for regressions**

Run: `npx playwright test e2e/parent-dashboard.spec.js`

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/parent-dashboard.spec.js
git commit -m "test: cover date-range active-tab hover contrast (was fixed but untested)

Same rationale as the admin.spec.js commit: .date-range-filter__tab--active:hover
already fixes the specificity bug, but nothing simulated a real :hover to
verify it. Add the missing regression test."
```

---

## Task 4: Version bump and changelog

**Files:**
- Modify: `package.json:2` (`"version"` field)
- Modify: `CHANGELOG.md` (insert new section at top, before the existing `## [0.22.1] - 2026-07-09` entry)

**Interfaces:**
- Consumes: nothing (documentation-only task, run last so it reflects the final state of Tasks 1-3).
- Produces: nothing.

- [ ] **Step 1: Bump the version**

In `package.json`, change:

```json
  "version": "0.22.1",
```

to:

```json
  "version": "0.22.2",
```

- [ ] **Step 2: Add the changelog entry**

In `CHANGELOG.md`, insert this new section immediately after line 4 (the blank line after the format-reference line) and before the existing `## [0.22.1] - 2026-07-09` heading:

```markdown
## [0.22.2] - 2026-07-09

### Fixed
- The active category filter tab on the home dashboard became unreadable (white text on a near-white background) whenever it was hovered on desktop or tapped on mobile (where a tap leaves a tab in a sticky hovered state) — `.dashboard__tab:hover`'s higher CSS specificity was silently overriding the active tab's solid background while leaving its white text untouched. Added the same `--active:hover` cascade fix already used in the Admin and Parent Dashboard tab bars. Also added the equivalent hover-contrast regression test to those two, which had the fix but no test guarding it.

```

- [ ] **Step 3: Verify the version is consistent**

Run: `grep -n '"version"' package.json`

Expected output: `2:  "version": "0.22.2",`

- [ ] **Step 4: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore: bump version to 0.22.2 for filter-tab hover contrast fix"
```

---

## Final Verification

- [ ] **Step 1: Run the full e2e suite**

Run: `npm run e2e`

Expected: All tests PASS, including the 12 new tests added across Tasks 1-3.

- [ ] **Step 2: Run lint and unit tests to confirm no unrelated breakage**

Run: `npm run lint && npx vitest run`

Expected: Both PASS (no unit test changes were made in this plan — this is a sanity check that the CSS/test-only changes didn't break anything else).
