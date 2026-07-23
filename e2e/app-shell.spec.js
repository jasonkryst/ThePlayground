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

test('the browser back button shows the confirm overlay instead of leaving mid-game, and re-arms after Keep Playing', async ({ page }) => {
  await page.goto('/game/color-match')
  const historyLengthBeforeStart = await page.evaluate(() => window.history.length)
  await page.getByTestId('game-intro-start').click()

  // AppShell's sentinel-history-push effect (which arms the back-button
  // guard) runs asynchronously, two effect-hops after the intro click:
  // QuizGameShell's own effect calls useShellGameStatus, which itself
  // updates gameStatus in a further effect, which AppShell's pushState
  // effect then reacts to. A bare .click() only waits for the click itself,
  // not for that chain to land -- under real CPU contention (this raced
  // reliably under a 2-CPU constraint locally) goBack() can fire before the
  // sentinel is pushed, so the browser navigates for real instead of being
  // intercepted, and no dialog ever appears. Wait for the sentinel's
  // pushState (history.length increasing) before calling goBack().
  await expect.poll(() => page.evaluate(() => window.history.length)).toBeGreaterThan(historyLengthBeforeStart)

  await page.goBack()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/game\/color-match$/)

  await dialog.getByRole('button', { name: /keep playing/i }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/game\/color-match$/)

  // A second back-press must be caught too — the guard has to re-arm itself,
  // not just fire once.
  await page.goBack()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /leave game/i }).click()
  await expect(page).toHaveURL(/\/$/)
})
