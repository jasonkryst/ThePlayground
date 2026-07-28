import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function startGame(page) {
  await page.goto('/game/sound-memory-match')
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

test('sound memory match: intro shows on first visit and starts the board', async ({ page }) => {
  await page.goto('/game/sound-memory-match')
  await expect(page.getByTestId('game-intro-start')).toBeVisible()
  expect(await page.locator('[data-tile-id]').count()).toBe(0)

  await page.getByTestId('game-intro-start').click()
  await expect(page.locator('[data-tile-id]')).toHaveCount(10) // default 5 pairs
})

test('sound memory match: an unresolved flip renders the generic speaker icon, never a picture', async ({ page }) => {
  await startGame(page)
  const [first] = await page.locator('[data-tile-id]').all()
  await first.click()
  await expect(first.locator('.memory-board__tile-face')).toHaveText('🔊')
})

test('sound memory match: matched pair stays revealed and swaps to the real picture; mismatched pair flips back and never reveals a picture', async ({ page }) => {
  await startGame(page)
  const ids = await page.locator('[data-tile-id]').evaluateAll(els => els.map(e => e.dataset.itemId))
  const pairId = ids.find(id => ids.filter(x => x === id).length === 2)
  const otherId = ids.find(id => id !== pairId)

  // mismatch first: red highlight, generic icon on both tiles, then flip back
  await page.locator(`[data-item-id="${pairId}"]`).first().click()
  await page.locator(`[data-item-id="${otherId}"]`).first().click()
  await expect(page.locator('.memory-board__tile--mismatch')).toHaveCount(2)
  for (const face of await page.locator('.memory-board__tile--mismatch .memory-board__tile-face').all()) {
    await expect(face).toHaveText('🔊')
  }
  await expect(page.locator('.memory-board__tile--mismatch')).toHaveCount(0, { timeout: 3000 })

  // now the real pair: stays matched and reveals the real picture as a reward
  const pair = page.locator(`[data-item-id="${pairId}"]`)
  await pair.nth(0).click()
  await pair.nth(1).click()
  await expect(page.locator('.memory-board__tile--matched')).toHaveCount(2)
  const matchedFaces = page.locator('.memory-board__tile--matched .memory-board__tile-face')
  await expect(matchedFaces.nth(0)).not.toHaveText('🔊')
  await expect(matchedFaces.nth(0)).toHaveText(await matchedFaces.nth(1).textContent())
})

test('sound memory match: full play-through reaches results and returns home', async ({ page }) => {
  await startGame(page)
  await completeBoard(page)
  await expect(page.getByText(/you found/i)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page).toHaveURL('/')
})

test('sound memory match game screen has no accessibility violations', async ({ page }) => {
  await startGame(page)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('sound memory match: results screen receives the manifest accent color', async ({ page }) => {
  await startGame(page)
  await completeBoard(page)
  const results = page.locator('.results')
  await expect(results).toBeVisible({ timeout: 10_000 })
  await expect(results).toHaveCSS('box-shadow', 'rgb(128, 222, 234) 0px 6px 0px 0px inset') // manifest.color #80DEEA
})
