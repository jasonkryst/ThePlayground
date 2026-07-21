import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Desktop Chrome (fine pointer) exercises the viewport-aspect-ratio path of
// the hybrid detection; the screen.orientation path is unit-tested.
const PORTRAIT  = { width: 375, height: 667 }
const LANDSCAPE = { width: 667, height: 375 }

test('landscape game in portrait: overlay blocks play until rotated', async ({ page }) => {
  await page.setViewportSize(PORTRAIT)
  await page.goto('/game/animal-memory-match')
  await expect(page.getByTestId('orientation-overlay')).toBeVisible()
  await expect(page.locator('.orientation-gate__content')).toHaveAttribute('inert', '')

  await page.setViewportSize(LANDSCAPE)
  await expect(page.getByTestId('orientation-overlay')).toHaveCount(0)
  await page.getByTestId('game-intro-start').click()
  await expect(page.locator('[data-tile-id]')).toHaveCount(10)
})

test('rotating to portrait mid-game blocks the board; rotating back resumes play', async ({ page }) => {
  await page.setViewportSize(LANDSCAPE)
  await page.goto('/game/animal-memory-match')
  await page.getByTestId('game-intro-start').click()
  await page.locator('[data-tile-id]').first().waitFor()

  await page.setViewportSize(PORTRAIT)
  await expect(page.getByTestId('orientation-overlay')).toBeVisible()

  await page.setViewportSize(LANDSCAPE)
  await expect(page.getByTestId('orientation-overlay')).toHaveCount(0)
  await page.locator('[data-tile-id]').first().click()
  await expect(page.locator('.memory-board__tile--up, .memory-board__tile--matched')).not.toHaveCount(0)
})

test('shell home button stays reachable while the overlay is up', async ({ page }) => {
  await page.setViewportSize(PORTRAIT)
  await page.goto('/game/animal-memory-match')
  await expect(page.getByTestId('orientation-overlay')).toBeVisible()
  await page.getByRole('button', { name: 'Go to home' }).click()
  await expect(page).toHaveURL('/')
})

test('overlay state has no accessibility violations', async ({ page }) => {
  await page.setViewportSize(PORTRAIT)
  await page.goto('/game/animal-memory-match')
  await page.getByTestId('orientation-overlay').waitFor()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('overlay message is fully visible, not cut off, when the inert board underneath is taller than the viewport (issue #104)', async ({ page }) => {
  await page.setViewportSize(PORTRAIT)
  await page.goto('/game/animal-memory-match')
  await expect(page.getByTestId('orientation-overlay')).toBeVisible()
  await expect(page.getByRole('heading', { name: /turn it sideways/i })).toBeInViewport()
  await expect(page.getByText(/this game needs a wide screen/i)).toBeInViewport()
})

test('negative: inert content is visually collapsed, not just non-interactive, while blocked (issue #104)', async ({ page }) => {
  await page.setViewportSize(PORTRAIT)
  await page.goto('/game/animal-memory-match')
  await expect(page.getByTestId('orientation-overlay')).toBeVisible()
  await expect(page.locator('.orientation-gate__content')).toBeHidden()
})

test('negative: a game without the manifest flag never shows the overlay in portrait', async ({ page }) => {
  await page.setViewportSize(PORTRAIT)
  await page.goto('/game/animal-sounds')
  await expect(page.getByTestId('game-intro-start')).toBeVisible()
  await expect(page.getByTestId('orientation-overlay')).toHaveCount(0)
})
