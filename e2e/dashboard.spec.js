import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('dashboard shows both game cards and the settings link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Animal Sounds').first()).toBeVisible()
  await expect(page.getByText('Color Match').first()).toBeVisible()
  await expect(page.locator('a[href="/admin"]')).toHaveAttribute('href', '/admin')
})

test('dashboard has no accessibility violations', async ({ page }) => {
  // Settle the shell's route-entry fade-in (opacity 0→1 over ~200ms) before
  // scanning: mid-fade, .game-card__desc's own resting opacity (0.75)
  // compounds with the animation's transient opacity, so an axe scan taken
  // immediately after goto() can catch a real-but-momentary sub-4.5:1 frame
  // that isn't present once the page settles. Disabling reduced motion here
  // uses the same prefers-reduced-motion gate the animation itself respects.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('featured hero card is visible on dashboard load', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText("Today's Game")).toBeVisible()
})

test('featured hero card navigates to the game on click', async ({ page }) => {
  await page.goto('/')
  const heroLink = page.locator('.featured-card')
  const href = await heroLink.getAttribute('href')
  await heroLink.click()
  await expect(page).toHaveURL(href)
})

test('tag pills appear and filter the grid', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sounds' })).toBeVisible()
  await page.getByRole('button', { name: 'Sounds' }).click()
  await expect(page.getByRole('button', { name: 'Sounds' })).toHaveAttribute('aria-pressed', 'true')
  // Scope to the grid (not the always-visible featured banner, which may show
  // either game regardless of the active filter) to check what the filter actually did.
  const grid = page.locator('.dashboard__grid')
  await expect(grid.getByText('Animal Sounds')).toBeVisible()
  await expect(grid.getByText('Color Match')).not.toBeVisible()
})

test('deselecting the only active tag pill restores the full sectioned view', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sounds' }).click()
  await page.getByRole('button', { name: 'Sounds' }).click()
  // Color Match carries two tags ("visual" and "colors"), so in the unfiltered view it
  // legitimately renders once per matching category section (see Dashboard.jsx's
  // buildSections). .first() just confirms the sectioned view is restored, not that
  // there's exactly one card.
  await expect(page.getByText('Color Match').first()).toBeVisible()
})

test('Clear filters resets search text and selected tags', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('searchbox').fill('animal')
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByRole('searchbox')).toHaveValue('')
  await expect(page.getByText('Color Match').first()).toBeVisible()
})

test('searching by name filters the grid to matching games', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('searchbox').fill('animal')
  const grid = page.locator('.dashboard__grid')
  await expect(grid.getByText('Animal Sounds')).toBeVisible()
  await expect(grid.getByText('Color Match')).not.toBeVisible()
})

test('recently-played badge appears for a game with seeded scores', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    // Seed scores for both games rather than a single hardcoded gameId: the
    // dashboard's "Today's Game" banner always shows the featured game (see
    // Dashboard.jsx), but that banner card itself never renders a
    // recently-played badge — only the matching GameCard in the grid/section
    // does. Seeding both games guarantees at least one badge-bearing grid
    // card is visible regardless of which game is featured today.
    const today = new Date().toISOString().split('T')[0]
    const scores = [
      { gameId: 'animal-sounds', score: 8, total: 10, date: today, timestamp: Date.now() },
      { gameId: 'color-match', score: 8, total: 10, date: today, timestamp: Date.now() },
    ]
    localStorage.setItem('playground_scores', JSON.stringify(scores))
  })
  await page.reload()
  await expect(page.getByTestId('recently-played-badge').first()).toBeVisible()
  await expect(page.getByTestId('recently-played-badge').first()).toHaveText(/today/i)
})

test('dashboard has no accessibility violations after enhancements', async ({ page }) => {
  // See the comment on the other a11y test above: settle the shell's
  // route-entry fade before scanning.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('an active tag pill keeps its solid background when hovered', async ({ page }) => {
  await page.goto('/')
  const soundsPill = page.getByRole('button', { name: 'Sounds' })
  await soundsPill.click()
  await soundsPill.hover()
  await page.waitForTimeout(200)
  await expect(soundsPill).toHaveCSS('background-color', 'rgb(106, 79, 163)')
  await expect(soundsPill).toHaveCSS('color', 'rgb(255, 255, 255)')
})

test('an inactive tag pill still shows the light hover tint, not the active color', async ({ page }) => {
  await page.goto('/')
  const animalsPill = page.getByRole('button', { name: 'Animals' })
  await animalsPill.hover()
  await page.waitForTimeout(200)
  await expect(animalsPill).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.05)')
})

test('active tag pill has no accessibility violations while hovered', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const soundsPill = page.getByRole('button', { name: 'Sounds' })
  await soundsPill.click()
  await soundsPill.hover()
  await page.waitForTimeout(200)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
