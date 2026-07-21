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

test('memory match: cards keep breathing room from the screen edge and never overflow horizontally on phone (issue #58, floor revised by #104)', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 }) // landscape phone — the game now requires landscape (#62)
  await startGame(page)
  const boxes = await page.locator('[data-tile-id]').evaluateAll(els =>
    els.map(e => {
      const r = e.getBoundingClientRect()
      return { width: r.width, height: r.height, left: r.left }
    })
  )
  for (const box of boxes) {
    // 120px was issue #58's toddler tap-target floor. At this specific tight
    // viewport height, issue #104 revises it down to a 48px sanity floor so
    // the whole board can still fit -- see the design doc for the trade-off.
    expect(box.width).toBeGreaterThanOrEqual(48)
    expect(box.height).toBeGreaterThanOrEqual(48)
    expect(box.left).toBeGreaterThan(0)
  }
  const overflowsHorizontally = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflowsHorizontally).toBe(false)
})

test('memory match: board that used to require scrolling now fits one screen on a modest landscape window (issue #104)', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 490 })
  await startGame(page)
  const fitsOneScreen = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)
  expect(fitsOneScreen).toBe(true)
})

test('memory match: board still fits one screen after the intro click leaves the page scrolled (issue #104 regression guard)', async ({ page }) => {
  // Regression test for a real, previously-shipped bug: getBoundingClientRect().top
  // is viewport-relative, so a scrolled page made the fit calculation think there
  // was more available height than there really was. Simulated here by scrolling
  // down before starting the game, mirroring what a below-the-fold intro "Start"
  // button click does on a squeezed viewport.
  await page.setViewportSize({ width: 900, height: 490 })
  await page.goto('/game/animal-memory-match')
  await page.evaluate(() => window.scrollTo(0, 200))
  await page.getByTestId('game-intro-start').click()
  await page.locator('[data-tile-id]').first().waitFor()
  const fitsOneScreen = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)
  expect(fitsOneScreen).toBe(true)
})

test('memory match: tablet board still fits one screen without scrolling after the sizing change (issue #104 regression guard)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await startGame(page)
  const fitsOneScreen = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)
  expect(fitsOneScreen).toBe(true)
})

test('memory match: cards grow to fill more of a tablet screen instead of staying tiny (issue #58)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 }) // landscape tablet — the game now requires landscape (#62)
  await startGame(page)
  const width = await page.locator('[data-tile-id]').first().evaluate(el => el.getBoundingClientRect().width)
  // Default board is 10 tiles (5 pairs) → idealColumns=5, cap=748px. At
  // 1024x768 the cap (748px) is what limits width, giving exactly 140px
  // tiles. 125 leaves margin on both sides without being loose enough to
  // pass on a regression back to the old sizing.
  expect(width).toBeGreaterThanOrEqual(125)
})

test('memory match: board stays centered on a wide screen instead of sticking to one side (issue #58)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await startGame(page)
  const gridBox = await page.locator('.memory-board__grid').boundingBox()
  const leftGap = gridBox.x
  const rightGap = 1024 - (gridBox.x + gridBox.width)
  expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(2)
  // Centering alone doesn't catch a shrink-wrapped board: if `.memory-board`
  // ever loses its `width: 100%` rule, `align-items: center` on the parent
  // flex container would still keep a collapsed board centered. Default
  // board is 10 tiles (5 pairs) → idealColumns=5, cap=5*140+4*12=748px. 700
  // is comfortably below the cap (rounding/scrollbar margin) but far above
  // what a collapsed board would produce (well under 200px).
  expect(gridBox.width).toBeGreaterThan(700)
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
