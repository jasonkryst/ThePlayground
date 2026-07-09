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
