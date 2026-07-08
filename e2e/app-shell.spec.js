import { test, expect } from '@playwright/test'

test('shared header persists from home into a game', async ({ page }) => {
  await page.goto('/')
  const brand = page.getByRole('banner').getByRole('link', { name: /the playground/i })
  await expect(brand).toBeVisible()
  await page.getByRole('link', { name: /color match/i }).first().click()
  await expect(brand).toBeVisible()
  await expect(page.getByRole('banner').getByRole('heading', { name: /color match/i })).toBeVisible()
})

test('mid-game exit shows the confirm overlay and can resume or leave', async ({ page }) => {
  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-start').click()

  await page.getByRole('button', { name: 'Go to home' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: /keep playing/i }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/game\/color-match$/)

  await page.getByRole('button', { name: 'Go to home' }).click()
  await dialog.getByRole('button', { name: /leave game/i }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('intro screen exits immediately without a confirm overlay', async ({ page }) => {
  await page.goto('/game/color-match')
  await expect(page.getByTestId('game-intro-start')).toBeVisible()
  await page.getByRole('button', { name: 'Go to home' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('dialog')).toBeHidden()
})
