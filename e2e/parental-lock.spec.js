import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

function seedPin(pin) {
  return page => page.addInitScript((p) => {
    localStorage.setItem('playground_settings', JSON.stringify({ parentalLock: { enabled: true, pin: p } }))
  }, pin)
}

test('cold visit to /admin shows the parental lock challenge, not the settings page (negative)', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Parents Only' })).toBeVisible()
  await expect(page.getByLabel("Child's Name")).not.toBeVisible()
})

test('cold visit to /parent shows the parental lock challenge, not the dashboard (negative)', async ({ page }) => {
  await page.goto('/parent')
  await expect(page.getByRole('heading', { name: 'Parents Only' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'All time' })).toHaveCount(0)
})

test('a wrong answer to the math challenge keeps /admin locked and shows an error (negative)', async ({ page }) => {
  await page.goto('/admin')
  await page.locator('#parental-lock-input').fill('999999')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('alert')).toContainText("not it")
  await expect(page.getByLabel("Child's Name")).not.toBeVisible()
})

test('a correct PIN unlocks /admin, and the session stays unlocked navigating to /parent', async ({ page }) => {
  await seedPin('4242')(page)
  await page.goto('/admin')
  await page.locator('#parental-lock-input').fill('4242')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByLabel("Child's Name")).toBeVisible()

  await page.goto('/parent')
  await expect(page.getByRole('heading', { name: 'Parents Only' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'All time' })).toBeVisible()
})

test('a wrong PIN is rejected (negative)', async ({ page }) => {
  await seedPin('4242')(page)
  await page.goto('/admin')
  await page.locator('#parental-lock-input').fill('0000')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel("Child's Name")).not.toBeVisible()
})

test('a fresh browser context is locked again after a previous unlock (negative — session only, not persistent)', async ({ page, browser }) => {
  await seedPin('4242')(page)
  await page.goto('/admin')
  await page.locator('#parental-lock-input').fill('4242')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByLabel("Child's Name")).toBeVisible()

  const freshContext = await browser.newContext()
  const freshPage = await freshContext.newPage()
  await seedPin('4242')(freshPage)
  await freshPage.goto('/admin')
  await expect(freshPage.getByRole('heading', { name: 'Parents Only' })).toBeVisible()
  await freshContext.close()
})

test('parental lock challenge screen has no accessibility violations', async ({ page }) => {
  await page.goto('/admin')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
