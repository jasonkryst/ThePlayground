import { test, expect } from '@playwright/test'

// Regression coverage for issue #55: the intro/results screens must fit
// within one device screen's height (no page scroll needed to reach the
// primary action button), while legitimately long content is still allowed
// to make the page scroll rather than being clipped.
const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  // The reporter confirmed this also reproduces on desktop/laptop, not just
  // small touch devices — a modestly-sized window is enough.
  desktop: { width: 1366, height: 768 },
}

async function fitsOneScreen(page) {
  return page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)
}

for (const [label, viewport] of Object.entries(VIEWPORTS)) {
  test(`intro screen fits within one ${label} screen`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/game/color-match')
    await expect(page.getByTestId('game-intro-start')).toBeVisible()
    await expect(page.getByTestId('game-intro-start')).toBeInViewport()
    expect(await fitsOneScreen(page)).toBe(true)
  })

  test(`results screen fits within one ${label} screen`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/game/color-match')
    await page.getByTestId('game-intro-start').click()

    // Always answer correctly so this represents a normal/short results
    // screen (no missed-items list) -- a legitimately long one (lots of
    // missed items) is expected to scroll, and is covered separately below.
    for (let i = 0; i < 10; i++) {
      if (await page.getByText(/you scored/i).isVisible()) break
      const correctId = await page.getByTestId('correct-color-id').textContent()
      await page.locator(`[data-color-id="${correctId}"]`).click()
      await page.waitForTimeout(1600)
    }
    await expect(page.getByText(/you scored/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeInViewport()
    expect(await fitsOneScreen(page)).toBe(true)
  })
}

test('a legitimately long results screen is still allowed to scroll, not clipped', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone)
  await page.goto('/admin')
  await page.getByRole('heading', { name: 'Questions Per Session' })
    .locator('xpath=..')
    .getByRole('radio', { name: '20', exact: true })
    .check()

  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-start').click()

  for (let i = 0; i < 20; i++) {
    if (await page.getByText(/you scored/i).isVisible()) break
    const correctId = await page.getByTestId('correct-color-id').textContent()
    const wrongChoice = page.locator(`[data-color-id]:not([data-color-id="${correctId}"])`).first()
    await wrongChoice.click()
    await page.waitForTimeout(1600)
  }
  await expect(page.getByText(/you scored/i)).toBeVisible()

  const scrollable = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight
  )
  expect(scrollable).toBe(true)
  // Not just scrollable in principle -- the content is actually reachable.
  await page.getByRole('button', { name: 'Play Again' }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible()
})
