import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
})

function seedTheme(page, theme) {
  // addInitScript re-runs on every navigation in this page (including
  // page.reload()), not just the first — guard on "not already seeded" so a
  // reload doesn't clobber a theme change made in-page after the initial
  // load (see the header-toggle-persists-across-reload test below).
  return page.addInitScript((t) => {
    if (!localStorage.getItem('playground_settings')) {
      localStorage.setItem('playground_settings', JSON.stringify({ theme: t }))
    }
  }, theme)
}

for (const theme of ['light', 'dark', 'high-contrast']) {
  test.describe(`${theme} theme`, () => {
    test(`dashboard has no axe violations (including color-contrast) in ${theme}`, async ({ page }) => {
      await seedTheme(page, theme)
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      // AppShell remounts route content on navigation and cross-fades it in
      // over 0.2s (shell-fade-in in AppShell.css) -- scanning mid-fade can
      // catch text at partial opacity, transiently under the real contrast
      // ratio. Same settle-before-scan pattern as the Badges-tab a11y test
      // in e2e/admin.spec.js.
      await page.waitForTimeout(200)
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
    })

    test(`admin has no axe violations (including color-contrast) in ${theme}`, async ({ page }) => {
      await seedTheme(page, theme)
      await page.goto('/admin')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      // See the dashboard test above -- let the route's fade-in settle first.
      await page.waitForTimeout(200)
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
    })

    test(`a game's results screen has no axe violations in ${theme}`, async ({ page }) => {
      await seedTheme(page, theme)
      await page.goto('/game/color-match')
      await page.getByTestId('game-intro-start').click()

      // Mirrors the full-playthrough loop in e2e/color-match.spec.js: tap the
      // first available choice each round (right or wrong both advance the
      // session) and wait out the 1600ms immediate-feedback delay, until the
      // results screen ("you scored...") appears.
      for (let i = 0; i < 10; i++) {
        if (await page.getByText(/you scored/i).isVisible()) break
        await page.locator('[data-color-id]').first().click()
        await page.waitForTimeout(1600)
      }
      await expect(page.getByText(/you scored/i)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible()

      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
    })
  })
}

test.describe('system theme resolution', () => {
  test('resolves to light tokens when the OS prefers light', async ({ page }) => {
    await seedTheme(page, 'system')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await expect(page.locator('html')).not.toHaveAttribute('data-theme')
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim())
    expect(bg).toBe('#F0FDFF')
  })

  test('resolves to dark tokens when the OS prefers dark, same persisted setting', async ({ page }) => {
    await seedTheme(page, 'system')
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(page.locator('html')).not.toHaveAttribute('data-theme')
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim())
    expect(bg).toBe('#0D2126')
  })
})

// Regression coverage for issue #152: the theme toggle's icon is
// aria-hidden (decorative, the button itself carries the accessible name),
// so axe's automated color-contrast checks above never look at it --
// nothing in the a11y-focused tests would have caught the icon rendering in
// the same color as its own background. These tests assert on the actual
// computed color instead of relying on axe.
test.describe('theme toggle icon visibility', () => {
  for (const theme of ['system', 'light', 'dark', 'high-contrast']) {
    test(`icon color is distinguishable from the header background in ${theme} (positive case)`, async ({ page }) => {
      await seedTheme(page, theme)
      await page.goto('/')
      const button = page.getByRole('button', { name: /theme/i })
      await expect(button).toBeVisible()

      const [iconColor, headerBg] = await page.evaluate(() => [
        getComputedStyle(document.querySelector('.shell__theme-toggle')).color,
        getComputedStyle(document.querySelector('.shell__header')).backgroundColor,
      ])
      expect(iconColor).not.toBe(headerBg)
    })
  }

  test('icon color still differs from the header background when the persisted theme value is invalid (negative case)', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('playground_settings', JSON.stringify({ theme: 'not-a-real-theme' }))
    })
    await page.goto('/')
    const button = page.getByRole('button', { name: /theme/i })
    await expect(button).toBeVisible()

    const [iconColor, headerBg] = await page.evaluate(() => [
      getComputedStyle(document.querySelector('.shell__theme-toggle')).color,
      getComputedStyle(document.querySelector('.shell__header')).backgroundColor,
    ])
    expect(iconColor).not.toBe(headerBg)
  })
})

test('header theme toggle cycles and persists across reload', async ({ page }) => {
  await seedTheme(page, 'system')
  await page.goto('/')
  const toggle = page.getByRole('button', { name: /theme/i })

  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
