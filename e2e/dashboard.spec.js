import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('dashboard shows both game cards and the settings link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Animal Sounds').first()).toBeVisible()
  await expect(page.getByText('Color Match').first()).toBeVisible()
  await expect(page.locator('a[href="/admin"]')).toHaveAttribute('href', '/admin')
})

test('dashboard has no accessibility violations', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('featured hero card is visible on dashboard load', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText("Today's Game")).toBeVisible()
})

test('featured hero card navigates to the game on click', async ({ page }) => {
  await page.goto('/')
  const heroLink = page.locator('.featured-card')
  const href = await heroLink.getAttribute('href')
  await heroLink.click()
  await expect(page).toHaveURL(href)
})

test('category tabs appear and filter the grid', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tab', { name: 'All' })).toBeVisible()
  // Click "Sounds" tab
  await page.getByRole('tab', { name: 'Sounds' }).click()
  await expect(page.getByRole('tab', { name: 'Sounds' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Animal Sounds')).toBeVisible()
  await expect(page.getByText('Color Match')).not.toBeVisible()
})

test('clicking All tab restores full grid', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Sounds' }).click()
  await page.getByRole('tab', { name: 'All' }).click()
  await expect(page.getByText('Color Match')).toBeVisible()
})

test('recently-played badge appears for a game with seeded scores', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    const scores = [{
      gameId: 'animal-sounds',
      score: 8,
      total: 10,
      date: new Date().toISOString().split('T')[0],
      timestamp: Date.now(),
    }]
    localStorage.setItem('playground_scores', JSON.stringify(scores))
  })
  await page.reload()
  await expect(page.getByTestId('recently-played-badge').first()).toBeVisible()
  await expect(page.getByTestId('recently-played-badge').first()).toHaveText(/today/i)
})

test('dashboard has no accessibility violations after enhancements', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
