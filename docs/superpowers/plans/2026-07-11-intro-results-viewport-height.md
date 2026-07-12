# Intro/Results Viewport Height Fix Implementation Plan

**Goal:** Fix the intro and results screens exceeding one device screen's
height (issue #55) by removing a leftover `min-height: 100vh` in
`GameIntro.css`/`GameResults.css` that stacks on top of `AppShell`'s own
`min-height: 100vh`.

**Architecture:** Pure CSS fix, mirroring the pattern `GameLayout.css`'s
`.game` already uses (`flex: 1` instead of `min-height: 100vh`). All new
test coverage is Playwright e2e (real browser layout/overflow — not
observable in jsdom).

**Full background/root-cause analysis:** see
`docs/superpowers/specs/2026-07-11-intro-results-viewport-height-design.md`.

## Task 1: Write failing e2e tests

**Files:**
- Create: `e2e/intro-results-height.spec.js`

- [ ] **Step 1:** Write the spec:

```js
import { test, expect } from '@playwright/test'

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1366, height: 768 },
}

async function fitsOneScreen(page) {
  return page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)
}

for (const [label, viewport] of Object.entries(VIEWPORTS)) {
  test(`intro screen fits within one ${label} screen`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/game/color-match')
    await expect(page.getByTestId('game-intro-start')).toBeVisible()
    await expect(page.getByTestId('game-intro-start')).toBeInViewport()
    expect(await fitsOneScreen(page)).toBe(true)
  })

  test(`results screen fits within one ${label} screen`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/game/color-match')
    await page.getByTestId('game-intro-start').click()

    // Always answer correctly so this represents a normal/short results
    // screen (no missed-items list) -- a legitimately long one (lots of
    // missed items) is expected to scroll, and is covered separately below.
    for (let i = 0; i < 10; i++) {
      if (await page.getByText(/you scored/i).isVisible()) break
      const correctId = await page.getByTestId('correct-color-id').textContent()
      await page.locator(`[data-color-id="${correctId}"]`).click()
      await page.waitForTimeout(1600)
    }
    await expect(page.getByText(/you scored/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeInViewport()
    expect(await fitsOneScreen(page)).toBe(true)
  })
}

test('a legitimately long results screen is still allowed to scroll, not clipped', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone)
  await page.goto('/admin')
  await page.getByRole('heading', { name: 'Questions Per Session' })
    .locator('xpath=..')
    .getByRole('radio', { name: '20', exact: true })
    .check()

  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-start').click()

  for (let i = 0; i < 20; i++) {
    if (await page.getByText(/you scored/i).isVisible()) break
    const correctId = await page.getByTestId('correct-color-id').textContent()
    const wrongChoice = page.locator(`[data-color-id]:not([data-color-id="${correctId}"])`).first()
    await wrongChoice.click()
    await page.waitForTimeout(1600)
  }
  await expect(page.getByText(/you scored/i)).toBeVisible()

  const scrollable = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight
  )
  expect(scrollable).toBe(true)
  // The content isn't hidden — it's reachable by scrolling.
  await page.getByRole('button', { name: 'Play Again' }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible()
})
```

Adjust the "Questions Per Session" heading/label text and admin radio
selector to match `src/admin/AdminPage.jsx` exactly if it differs — check
`t('admin.questionsPerSessionHeading')` in `src/i18n/en.json` for the
literal string, same pattern `e2e/color-match.spec.js`'s "a wrong tap with
retries enabled..." test already uses for scoping ambiguous radios.

- [ ] **Step 2:** Run: `npx playwright test e2e/intro-results-height.spec.js`

Expected: the `fits within one screen` tests FAIL at phone/tablet/desktop
sizes (current `min-height: 100vh` stacking bug); the long-results
scroll-allowed test passes already (nothing currently prevents scrolling).

## Task 2: Apply the CSS fix

**Files:**
- Modify: `src/components/GameIntro.css:1-10`
- Modify: `src/components/GameResults.css:1`

- [ ] **Step 1:** In `GameIntro.css`, replace:

```css
.game-intro {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 24px;
  text-align: center;
}
```

with:

```css
/* Fills the shell's available content area (AppShell already reserves
   min-height: 100vh for header + content + footer) instead of also
   demanding a full extra viewport height here, which overflowed one screen
   on tablet/phone and modestly-sized desktop windows alike (issue #55).
   Mirrors .game in GameLayout.css. */
.game-intro {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  gap: 20px;
  padding: 24px;
  text-align: center;
}
```

- [ ] **Step 2:** In `GameResults.css`, replace the single-line rule:

```css
.results { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; padding: 24px; text-align: center; }
```

with:

```css
/* See the equivalent comment on .game-intro in GameIntro.css (issue #55). */
.results { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; width: 100%; gap: 24px; padding: 24px; text-align: center; }
```

- [ ] **Step 3:** Run: `npx playwright test e2e/intro-results-height.spec.js`

Expected: all tests PASS.

- [ ] **Step 4:** Lint: `npx stylelint src/components/GameIntro.css src/components/GameResults.css`

Expected: no output.

## Task 3: Update visual regression baselines

**Files:**
- Regenerate: `e2e/visual.spec.js-snapshots/components-gameintro--*.png`,
  `components-gameresults--*.png` (5 files total)

- [ ] **Step 1:** Run:

```bash
npx playwright test visual.spec.js --update-snapshots -g "gameintro|gameresults"
```

- [ ] **Step 2:** Visually review each regenerated PNG (Read tool or open the
  file) — content should still render correctly (icon/name/instructions/
  button for intro; score/badges/actions for results).

  **Actual result:** all 7 regenerated PNGs are byte-identical to the
  previously committed baselines (`git diff --stat` on the snapshots
  directory shows no change) — Storybook's box model keeps these components
  visually centered the same way with or without `min-height: 100vh`, so no
  new PNGs need to be committed. The real fix only has an observable effect
  inside `AppShell`'s actual flex layout, which is what
  `e2e/intro-results-height.spec.js` (Task 1) verifies directly.

- [ ] **Step 3:** Run the full visual suite to confirm nothing else moved:
  `npx playwright test visual.spec.js`

## Task 4: Full regression pass

- [ ] **Step 1:** `npm run lint`
- [ ] **Step 2:** `npm run lint:css`
- [ ] **Step 3:** `npx vitest run`
- [ ] **Step 4:** `npm run e2e`

Expected: all green, including the new `intro-results-height.spec.js`.

## Task 5: Manual verification

- [ ] Start `npm run dev`, open a game's intro and results screens at a
  phone-sized and a short-desktop-sized browser window, confirm no scroll
  is needed to reach the Start/Play Again buttons.

## Task 6: Version bump and changelog

**Files:**
- Modify: `package.json:2`
- Modify: `CHANGELOG.md`

- [ ] Bump patch version (`0.24.2` → `0.24.3`).
- [ ] Add `## [0.24.3]` `### Fixed` entry summarizing the issue #55 fix.

## Final Verification

- [ ] Re-run `npm run e2e` and `npx vitest run` one more time after the
  version/changelog edits (no code change expected, just confirming a clean
  final state).
