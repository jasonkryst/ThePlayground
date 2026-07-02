import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('color match: full play-through reaches results and returns home', async ({ page }) => {
  await page.goto('/game/color-match')

  for (let i = 0; i < 10; i++) {
    if (await page.getByText(/you scored/i).isVisible()) break
    await page.locator('[data-color-id]').first().click()
    await page.waitForTimeout(1600)
  }

  await expect(page.getByText(/you scored/i)).toBeVisible()

  await page.getByRole('button', { name: 'Home' }).click()
  await expect(page).toHaveURL('/')
})

test('color match game screen has no accessibility violations', async ({ page }) => {
  await page.goto('/game/color-match')
  await page.locator('[data-color-id]').first().waitFor()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('color match: a wrong tap with retries enabled does not lock the question', async ({ page }) => {
  await page.goto('/admin')

  // "3" is ambiguous unscoped — both "Answer Choices" and "Retry Attempts" have a "3" radio.
  await page.getByRole('heading', { name: 'Answer Choices' })
    .locator('xpath=..')
    .getByRole('radio', { name: '3', exact: true })
    .check() // numChoices=3, ensures 2 wrong options exist

  // "2" is likewise ambiguous unscoped.
  await page.getByRole('heading', { name: 'Retry Attempts' })
    .locator('xpath=..')
    .getByRole('radio', { name: '2', exact: true })
    .check() // maxTries=2

  await page.goto('/game/color-match')

  const choices = page.locator('[data-color-id]')
  const correctId = await page.getByTestId('correct-color-id').textContent()
  const wrongChoice = choices.filter({ hasNot: page.locator(`[data-color-id="${correctId}"]`) }).first()
  await wrongChoice.click()

  await expect(wrongChoice).toBeDisabled()
  const correctChoice = page.locator(`[data-color-id="${correctId}"]`)
  await expect(correctChoice).toBeEnabled()
})
