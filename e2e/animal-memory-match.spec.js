import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function startGame(page) {
  await page.goto('/game/animal-memory-match')
  await page.getByTestId('game-intro-start').click()
  await page.locator('[data-tile-id]').first().waitFor()
}

async function completeBoard(page) {
  const ids = await page.locator('[data-tile-id]').evaluateAll(els => els.map(e => e.dataset.itemId))
  for (const id of [...new Set(ids)]) {
    const pair = page.locator(`[data-item-id="${id}"]`)
    await pair.nth(0).click()
    await pair.nth(1).click()
  }
}

test('memory match: intro shows on first visit and starts the board', async ({ page }) => {
  await page.goto('/game/animal-memory-match')
  await expect(page.getByTestId('game-intro-start')).toBeVisible()
  expect(await page.locator('[data-tile-id]').count()).toBe(0)

  await page.getByTestId('game-intro-start').click()
  await expect(page.locator('[data-tile-id]')).toHaveCount(10) // default 5 pairs
})

test('memory match: matched pair stays revealed; mismatched pair flips back', async ({ page }) => {
  await startGame(page)
  const ids = await page.locator('[data-tile-id]').evaluateAll(els => els.map(e => e.dataset.itemId))
  const pairId = ids.find(id => ids.filter(x => x === id).length === 2)
  const otherId = ids.find(id => id !== pairId)

  // mismatch first: red highlight then flip back
  await page.locator(`[data-item-id="${pairId}"]`).first().click()
  await page.locator(`[data-item-id="${otherId}"]`).first().click()
  await expect(page.locator('.memory-board__tile--mismatch')).toHaveCount(2)
  await expect(page.locator('.memory-board__tile--mismatch')).toHaveCount(0, { timeout: 3000 })

  // now the real pair: stays matched
  const pair = page.locator(`[data-item-id="${pairId}"]`)
  await pair.nth(0).click()
  await pair.nth(1).click()
  await expect(page.locator('.memory-board__tile--matched')).toHaveCount(2)
})

test('memory match: full play-through reaches results and returns home', async ({ page }) => {
  await startGame(page)
  await completeBoard(page)
  await expect(page.getByText(/you scored/i)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page).toHaveURL('/')
})

test('memory match game screen has no accessibility violations', async ({ page }) => {
  await startGame(page)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('memory match: results screen receives the shared themed styling (#53)', async ({ page }) => {
  // Direct navigation matters: the bug only reproduced when no quiz game's
  // stylesheet (which used to carry the .results rules) had been loaded first.
  await startGame(page)
  await completeBoard(page)
  const results = page.locator('.results')
  await expect(results).toBeVisible({ timeout: 10_000 })
  await expect(results).toHaveCSS('display', 'flex')
  await expect(results).toHaveCSS('text-align', 'center')
  await expect(page.getByRole('button', { name: /play again/i })).toHaveCSS('border-radius', '16px')
})
