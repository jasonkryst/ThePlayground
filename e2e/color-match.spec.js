import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('color match: how-to-play intro shows on first visit and starts the session', async ({ page }) => {
  await page.goto('/game/color-match')

  await expect(page.getByTestId('game-intro-start')).toBeVisible()
  expect(await page.locator('[data-color-id]').count()).toBe(0)

  await page.getByTestId('game-intro-start').click()

  await expect(page.locator('[data-color-id]').first()).toBeVisible()
})

test('color match: "don\'t show again" suppresses the intro on the next visit', async ({ page }) => {
  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-dont-show-again').click()
  await page.getByTestId('game-intro-start').click()

  await page.goto('/game/color-match')
  await expect(page.getByTestId('game-intro-start')).not.toBeVisible()
  await expect(page.locator('[data-color-id]').first()).toBeVisible()
})

test('color match: intro does not reappear after Play Again in the same visit', async ({ page }) => {
  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-start').click()

  for (let i = 0; i < 10; i++) {
    if (await page.getByText(/you scored/i).isVisible()) break
    await page.locator('[data-color-id]').first().click()
    await page.waitForTimeout(1600)
  }
  await expect(page.getByText(/you scored/i)).toBeVisible()

  await page.getByRole('button', { name: 'Play Again' }).click()
  await expect(page.getByTestId('game-intro-start')).not.toBeVisible()
  await expect(page.locator('[data-color-id]').first()).toBeVisible()
})

test('color match: full play-through reaches results and returns home', async ({ page }) => {
  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-start').click()

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
  await page.getByTestId('game-intro-start').click()
  await page.locator('[data-color-id]').first().waitFor()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('color match: how-to-play intro screen has no accessibility violations', async ({ page }) => {
  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-start').waitFor()
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
  await page.getByTestId('game-intro-start').click()

  const correctId = await page.getByTestId('correct-color-id').textContent()
  // NB: `choices.filter({ hasNot: ... })` is a no-op here — Playwright's
  // hasNot only matches descendants, and these choice buttons have no
  // descendant carrying data-color-id (only the button itself does), so the
  // filter matches every choice and `.first()` can land on the correct answer
  // by DOM-order coincidence. Exclude the correct id directly in the selector
  // instead so this test deterministically clicks a wrong choice.
  const wrongChoice = page.locator(`[data-color-id]:not([data-color-id="${correctId}"])`).first()
  await wrongChoice.click()

  await expect(wrongChoice).toBeDisabled()
  const correctChoice = page.locator(`[data-color-id="${correctId}"]`)
  await expect(correctChoice).toBeEnabled()
})
