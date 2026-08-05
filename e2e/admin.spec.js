import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
})

test('admin settings persist after reload', async ({ page }) => {
  await page.goto('/admin')
  await page.getByLabel("Child's Name").fill('Mia')

  // "Answer Choices" and "Retry Attempts" both have a radio named "4", so scope
  // from the section heading rather than using an unscoped role query.
  const answerChoicesRadio4 = page.getByRole('heading', { name: 'Answer Choices' })
    .locator('xpath=..')
    .getByRole('radio', { name: '4', exact: true })
  await answerChoicesRadio4.check()

  await page.reload()

  await expect(page.getByLabel("Child's Name")).toHaveValue('Mia')
  await expect(answerChoicesRadio4).toBeChecked()
})

test('admin page has no accessibility violations', async ({ page }) => {
  await page.goto('/admin')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('admin tag override persists across page reload', async ({ page }) => {
  await page.goto('/admin')
  await page.getByRole('tab', { name: /games/i }).click()

  const input = page.getByLabel('Tags for Animal Sounds')
  await input.clear()
  await input.fill('numbers, math')

  // Click the Save Tags button in the same row (scoped — the memory game sorts first)
  const row = page.locator('.admin__tag-row', { has: page.getByLabel('Tags for Animal Sounds') })
  await row.getByRole('button', { name: 'Save Tags' }).click()

  // Verify localStorage was updated before reloading (guards against reload race)
  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('playground_settings'))
    if (!raw) return null
    const s = JSON.parse(raw)
    return s?.tagOverrides?.['animal-sounds']
  }).toEqual(['numbers', 'math'])

  await page.reload()
  await page.getByRole('tab', { name: /games/i }).click()
  await expect(page.getByLabel('Tags for Animal Sounds')).toHaveValue('numbers, math')
})

test('new engine settings persist after reload', async ({ page }) => {
  await page.goto('/admin')

  // Scope to the "Timer" section — a countdown radio's label ("Answer within
  // 10s") is unique across the page, so no ambiguity guard is needed here,
  // but scoping keeps the pattern consistent with the section above.
  const timerSection = page.getByRole('heading', { name: 'Timer' }).locator('xpath=..')
  await timerSection.getByRole('radio', { name: 'Answer within 10s' }).check()
  await timerSection.getByRole('radio', { name: '⏱️ Show timer' }).check() // force a write back to countUp

  // "Retry Attempts" and "Answer Choices" share radios named "2"/"3"/"4", so scope
  // from the section heading rather than using an unscoped role query.
  await page.getByRole('heading', { name: 'Retry Attempts' })
    .locator('xpath=..')
    .getByRole('radio', { name: 'Unlimited' })
    .check()

  await page.reload()

  await expect(
    page.getByRole('heading', { name: 'Retry Attempts' })
      .locator('xpath=..')
      .getByRole('radio', { name: 'Unlimited' })
  ).toBeChecked()
})

test('timer countdown setting persists after reload', async ({ page }) => {
  await page.goto('/admin')
  const timerSection = page.getByRole('heading', { name: 'Timer' }).locator('xpath=..')
  await timerSection.getByRole('radio', { name: 'Answer within 15s' }).check()

  await page.reload()

  await expect(
    page.getByRole('heading', { name: 'Timer' }).locator('xpath=..').getByRole('radio', { name: 'Answer within 15s' })
  ).toBeChecked()
})

test('replay intro brings back a dismissed game intro', async ({ page }) => {
  await page.goto('/game/animal-sounds')
  await page.getByTestId('game-intro-dont-show-again').click()
  await page.getByTestId('game-intro-start').click()

  // Verify localStorage was updated before navigating away (guards against a navigation race)
  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('playground_settings'))
    if (!raw) return null
    const s = JSON.parse(raw)
    return s?.introDismissed?.['animal-sounds']
  }).toBe(true)

  await page.goto('/game/animal-sounds')
  await expect(page.getByTestId('game-intro-start')).not.toBeVisible()

  // Starting the session above also persisted a resumable snapshot (issue
  // #128: autosaved from the first queue build, not only after answering).
  // Dismiss it via Start Fresh so this test's own navigations don't get
  // stuck offering to resume an untouched, 0-answered session instead of
  // reaching the intro/game views it's actually asserting on below.
  await page.getByTestId('resume-prompt-start-fresh').click()

  // Start Fresh begins yet another untouched session (see the comment below,
  // where this test relies on it having been autosaved). Verify that
  // snapshot actually landed in localStorage before navigating away (guards
  // against a navigation race -- issues #147/#165: on CI's constrained
  // 2-worker runner, the goto below could otherwise fire before the fresh
  // session's snapshot finished persisting, so the next visit would find no
  // resumable snapshot at all and fall straight through to the intro
  // instead of the resume prompt this test asserts on further down).
  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('playground_session_resume'))
    if (!raw) return null
    const s = JSON.parse(raw)
    return s?.gameId === 'animal-sounds' && s?.index === 0 ? 'ready' : null
  }).toBe('ready')

  await page.goto('/admin')
  await page.getByRole('tab', { name: /games/i }).click()
  const soundsRow = page.locator('.admin__tag-row', { has: page.getByLabel('Tags for Animal Sounds') })
  await soundsRow.getByRole('button', { name: 'Replay Intro' }).click()

  await page.goto('/game/animal-sounds')
  // The Start Fresh above began yet another untouched session, which was
  // itself immediately autosaved as a resumable snapshot -- so this revisit
  // offers to resume it too, taking priority over the just-reset intro
  // (resumeAvailable always wins over showIntro). Dismiss it the same way to
  // reach the intro this test actually asserts on.
  await page.getByTestId('resume-prompt-start-fresh').click()
  await expect(page.getByTestId('game-intro-start')).toBeVisible()
})

test('badges tab shows the badge gallery for each game', async ({ page }) => {
  await page.goto('/admin')
  await page.getByRole('tab', { name: 'Badges' }).click()

  await expect(page.getByText('Animal Sounds')).toBeVisible()
  await expect(page.getByText('Color Match')).toBeVisible()

  // "Hot Streak" is a badge name shared by both games' badge sets, so scope from
  // the game heading rather than using an unscoped locator (same pattern as the
  // "Answer Choices" radio scoping above).
  const animalSoundsSection = page.getByRole('heading', { name: 'Animal Sounds' }).locator('xpath=..')
  await expect(animalSoundsSection.getByText('Hot Streak')).toBeVisible()
})

test('badges tab has no accessibility violations', async ({ page }) => {
  await page.goto('/admin')
  await page.getByRole('tab', { name: 'Badges' }).click()
  await page.waitForTimeout(200) // let the tab's 150ms background/color transition settle before scanning
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

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
  await expect(gamesTab).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.06)')
})

test('active admin tab has no accessibility violations while hovered', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/admin')
  const settingsTab = page.getByRole('tab', { name: 'Settings' })
  await settingsTab.hover()
  await page.waitForTimeout(200)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test.describe('pill text overfill regression (issue #115)', () => {
  // 390x844 matches the "phone" reference viewport used in e2e/zoom-large-text.spec.js.
  const PHONE_VIEWPORT = { width: 390, height: 844 }

  function seedLocale(page, locale) {
    return page.addInitScript((loc) => {
      localStorage.setItem('playground_settings', JSON.stringify({ locale: loc }))
    }, locale)
  }

  async function noHorizontalOverflow(page) {
    return page.evaluate(() => {
      const de = document.documentElement
      return de.scrollWidth <= de.clientWidth + 1
    })
  }

  // Every button in this app is pill-shaped (`button { border-radius:
  // var(--radius-button) }` in src/index.css) and a11y-sized to a 64px
  // minimum tap target. `.admin__tab` (the Settings/Games/Badges
  // row) and `.admin__toggle-btn` (every On/Off control) are both `flex: 1`
  // siblings sharing equal width -- a single unbreakable word that doesn't
  // fit (Spanish "Configuración", Polish "Odznaki") used to blow the whole
  // Settings page 105px past the viewport edge instead of wrapping inside
  // its own pill, because `overflow-wrap` was unset. Checking overall page
  // scrollWidth on the default (Settings) tab panel exercises both surfaces
  // at once, since both render in that one panel.
  for (const locale of ['es', 'pl']) {
    test(`settings tab row + On/Off toggles: no horizontal page overflow at phone width (${locale} locale)`, async ({ page }) => {
      await seedLocale(page, locale)
      await page.setViewportSize(PHONE_VIEWPORT)
      await page.goto('/admin')
      await expect(page.getByRole('tablist')).toBeVisible()
      expect(await noHorizontalOverflow(page)).toBe(true)
    })
  }

  test('negative (baseline): English locale at the same phone width has no horizontal overflow either', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto('/admin')
    await expect(page.getByRole('tablist')).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('negative: the long Spanish tab label stays fully present, not truncated, once it wraps', async ({ page }) => {
    await seedLocale(page, 'es')
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto('/admin')
    // "Configuración" is the longest, single-word (no space to wrap at) tab
    // label -- the exact string that overflowed before the fix. A "fix" that
    // truncated with an ellipsis instead of wrapping would still pass the
    // no-overflow check above but fail this accessible-name check, since the
    // full word would no longer be present in the accessible name.
    await expect(page.getByRole('tab', { name: 'Configuración' })).toBeVisible()
  })

  test('settings page has no accessibility violations once its pills wrap to two lines (Spanish, phone width)', async ({ page }) => {
    await seedLocale(page, 'es')
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto('/admin')
    await expect(page.getByRole('tablist')).toBeVisible()
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })
})

test.describe('pill label single-line regression (issue #156)', () => {
  // Distinct from issue #115's checks above, which guard against a label's
  // text overflowing its pill or the page. These guard the other half of the
  // same underlying `flex: 1` + global `overflow-wrap: anywhere` (src/index.css)
  // interaction: even with no overflow at all, an equal-width pill could still
  // break its own label across two lines when the label didn't fit its share
  // of the row -- reproducible pre-fix even in English (e.g. the Settings/
  // Games/Badges tab row, and the 4-way Theme picker, both at an
  // ordinary 375-390px phone width). A label's text occupies more than one
  // CSS line box exactly when `Range.getClientRects()` over its content
  // reports more than one distinct `top` offset. (The History tab moved to
  // the Parent Dashboard in issue #173, but the underlying flex/wrap hazard
  // this guards is unchanged for the tabs that remain.)
  const PHONE_VIEWPORT = { width: 390, height: 844 }

  function seedLocale(page, locale) {
    return page.addInitScript((loc) => {
      localStorage.setItem('playground_settings', JSON.stringify({ locale: loc }))
    }, locale)
  }

  async function lineCount(locator) {
    return locator.evaluate(el => {
      const range = document.createRange()
      range.selectNodeContents(el)
      const tops = new Set(
        Array.from(range.getClientRects())
          .filter(r => r.width > 0 && r.height > 0)
          .map(r => Math.round(r.top))
      )
      return tops.size
    })
  }

  test('positive: every admin tab label stays on one line at phone width (English)', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto('/admin')
    for (const name of ['Settings', 'Games', 'Badges']) {
      expect(await lineCount(page.getByRole('tab', { name }))).toBe(1)
    }
  })

  test('positive: every Theme option label stays on one line at phone width (English)', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto('/admin')
    for (const name of ['System', 'Light', 'Dark', 'High Contrast']) {
      expect(await lineCount(page.getByRole('button', { name, exact: true }))).toBe(1)
    }
  })

  test('positive: the longest Spanish tab and Theme labels still stay on one line at phone width', async ({ page }) => {
    await seedLocale(page, 'es')
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto('/admin')
    expect(await lineCount(page.getByRole('tab', { name: 'Configuración' }))).toBe(1)
    expect(await lineCount(page.getByRole('button', { name: 'Alto contraste', exact: true }))).toBe(1)
  })

  // A "Spanish tab row actually spans two rows, proving whole pills wrap"
  // test used to live here, back when Settings/Games/Badges/History (4
  // tabs) genuinely didn't fit one row at 390px in Spanish. Issue #173
  // removed the History tab; the remaining 3 tabs now fit on one row even
  // in Spanish (verified: tablist height equals a single tab's height), so
  // that scenario no longer reproduces. The label-splitting invariant this
  // guarded (a pill's own text never breaks across two lines, whether or
  // not the row itself wraps) is still covered by the two
  // "stays on one line" tests above, which don't depend on row count.

  test('negative: a plain two-way On/Off toggle is unaffected by the --auto opt-out and still fills the row at phone width', async ({ page }) => {
    await seedLocale(page, 'pl')
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto('/admin')
    const onBox = await page.getByRole('button', { name: 'Włączone', exact: true }).first().boundingBox()
    const offBox = await page.getByRole('button', { name: 'Wyłączone', exact: true }).first().boundingBox()
    // Equal-width split (flex: 1, unchanged by this fix) means both pills in
    // a pair are still the same width, unlike the natural-width Theme pills.
    expect(Math.abs(onBox.width - offBox.width)).toBeLessThan(1)
  })
})
