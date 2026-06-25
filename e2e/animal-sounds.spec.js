import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('animal sounds: full play-through reaches results and returns home', async ({ page }) => {
  await page.goto('/game/animal-sounds')

  for (let i = 0; i < 10; i++) {
    if (await page.getByText(/you scored/i).isVisible()) break
    await page.locator('[data-animal-id]').first().click()
    await page.waitForTimeout(1600)
  }

  await expect(page.getByText(/you scored/i)).toBeVisible()

  await page.getByRole('button', { name: 'Home' }).click()
  await expect(page).toHaveURL('/')
})

test('animal sounds game screen has no accessibility violations', async ({ page }) => {
  await page.goto('/game/animal-sounds')
  await page.locator('[data-animal-id]').first().waitFor()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
