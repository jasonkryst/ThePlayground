import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const DAY = 86_400_000

function seedScores(daysAgoList) {
  const now = Date.now()
  return daysAgoList.map((daysAgo, i) => ({
    gameId: 'animal-sounds',
    score: 8,
    total: 10,
    date: new Date(now - daysAgo * DAY).toISOString().split('T')[0],
    timestamp: now - daysAgo * DAY,
    peakStreak: 4,
    timings: [{ questionIndex: 0, itemId: `item-${i}`, correct: true, durationMs: 1000 }],
  }))
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
  // Seed scores before any app script runs so the very first render sees them.
  await page.addInitScript((scores) => {
    localStorage.setItem('playground_scores', JSON.stringify(scores))
  }, seedScores([1, 10, 45]))
})

test('default load shows all-time data; selecting 7 days narrows the charts', async ({ page }) => {
  await page.goto('/parent')
  await expect(page.getByRole('heading', { name: 'Score Trend' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'All time' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('tab', { name: '7 days' }).click()
  await expect(page.getByRole('tab', { name: '7 days' })).toHaveAttribute('aria-selected', 'true')
})

test('custom range via date inputs updates the dashboard and persists across a reload', async ({ page }) => {
  await page.goto('/parent')

  const from = new Date(Date.now() - 20 * DAY).toISOString().split('T')[0]
  const to   = new Date(Date.now() - 5  * DAY).toISOString().split('T')[0]
  await page.getByLabel('From').fill(from)
  // "To" is a substring of other accessible names on this page ("Back to home",
  // "Streak History"), so getByLabel's default substring match resolves to 4
  // elements in strict mode. Exact match scopes it to the date input's own label.
  await page.getByLabel('To', { exact: true }).fill(to)

  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('playground_settings'))
    if (!raw) return null
    return JSON.parse(raw)?.parentDateRange
  }).toEqual({ preset: 'custom', start: from, end: to })

  await page.reload()
  await expect(page.getByLabel('From')).toHaveValue(from)
  await expect(page.getByLabel('To', { exact: true })).toHaveValue(to)
})

test('an invalid custom range shows an inline error and does not clear the dashboard', async ({ page }) => {
  await page.goto('/parent')
  await expect(page.getByRole('heading', { name: 'Score Trend' })).toBeVisible()

  await page.getByLabel('From').fill('2026-07-10')
  await page.getByLabel('To', { exact: true }).fill('2026-07-01')

  await expect(page.getByRole('alert')).toHaveText(/end date must be on or after/i)
  // the previously-valid ("All time") data is still on screen, not cleared
  await expect(page.getByRole('heading', { name: 'Score Trend' })).toBeVisible()
})

test('parent dashboard has no accessibility violations with a filter applied', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/parent')
  await page.getByRole('tab', { name: '30 days' }).click()
  // Same known race as the Badges tab in e2e/admin.spec.js: the active tab's
  // background/color transition (150ms, see DateRangeFilter.css) can still be
  // mid-fade when axe scans immediately after click, producing a transient
  // low-contrast frame that isn't the tab's resting state.
  await page.waitForTimeout(200)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

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

test.describe('text overfill regression (issue #115)', () => {
  // 390x844 matches the "phone" reference viewport used in e2e/zoom-large-text.spec.js.
  const PHONE_VIEWPORT = { width: 390, height: 844 }

  async function noHorizontalOverflow(page) {
    return page.evaluate(() => {
      const de = document.documentElement
      return de.scrollWidth <= de.clientWidth + 1
    })
  }

  // The file-level beforeEach above seeds scores, so this exercises the
  // *full*, realistic dashboard -- date-range pills, plus the Streak History
  // table whose translated headers ("Mejor de todos los tiempos", "Najlepszy
  // wynik w historii") used to push the whole page past the viewport at
  // phone width (a `table-layout: auto` table is still allowed to grow past
  // its own `width: 100%` to fit a column's content-based minimum width).
  for (const locale of ['es', 'pl']) {
    test(`full dashboard (date-range pills + streak table): no horizontal page overflow at phone width (${locale} locale)`, async ({ page }) => {
      await page.addInitScript((loc) => {
        localStorage.setItem('playground_settings', JSON.stringify({ locale: loc }))
      }, locale)
      await page.setViewportSize(PHONE_VIEWPORT)
      await page.goto('/parent')
      await expect(page.getByRole('tablist')).toBeVisible()
      await expect(page.locator('.parent__streak-table')).toBeVisible()
      expect(await noHorizontalOverflow(page)).toBe(true)
    })
  }

  test('negative (baseline): English locale at the same phone width has no horizontal overflow either', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto('/parent')
    await expect(page.getByRole('tablist')).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('negative: the long Spanish streak-table header stays fully present, not truncated, once it wraps', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('playground_settings', JSON.stringify({ locale: 'es' }))
    })
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto('/parent')
    // "Mejor de todos los tiempos" is the longest streak-table header -- the
    // exact string that overflowed before the fix. A "fix" that truncated
    // with an ellipsis instead of wrapping would still pass the no-overflow
    // check above but fail this one, since the full text would no longer be
    // in the DOM/accessible name.
    await expect(page.getByRole('columnheader', { name: 'Mejor de todos los tiempos' })).toBeVisible()
  })
})
