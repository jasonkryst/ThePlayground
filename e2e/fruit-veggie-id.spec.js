import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
})

test('fruit-veggie-id: how-to-play intro screen has no accessibility violations', async ({ page }) => {
  await page.goto('/game/fruit-veggie-id')
  await page.getByTestId('game-intro-start').waitFor()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('fruit-veggie-id: game screen has no accessibility violations', async ({ page }) => {
  await page.goto('/game/fruit-veggie-id')
  await page.getByTestId('game-intro-start').click()
  await page.getByTestId('quiz-live-region').waitFor()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
