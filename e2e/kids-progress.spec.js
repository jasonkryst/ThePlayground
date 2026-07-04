import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('my progress nav link navigates from the dashboard', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /my progress/i }).click()
  await expect(page).toHaveURL('/my-progress')
})

test('my progress page shows a section per game', async ({ page }) => {
  await page.goto('/my-progress')
  await expect(page.getByRole('heading', { name: 'Animal Sounds' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Color Match' })).toBeVisible()
})

test('direct navigation to /my-progress works (SPA fallback)', async ({ page }) => {
  await page.goto('/my-progress')
  await expect(page.getByRole('heading', { name: /my progress/i })).toBeVisible()
})

test('my progress page has no accessibility violations', async ({ page }) => {
  await page.goto('/my-progress')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
