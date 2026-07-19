import { test, expect } from '@playwright/test'

// "200% zoom" and "OS large-text settings" are two different mechanisms
// (see docs/superpowers/specs/2026-07-19-accessibility-wave-2-design.md).
// Full-page zoom scales everything uniformly regardless of CSS units, so
// per WCAG 1.4.10 it's tested as an equivalent-width viewport (200% zoom on
// a 1280px baseline == a 640 CSS-px viewport). Large-text settings scale
// only rem-relative font-size, simulated here by forcing the root font-size.

const ZOOM_DESKTOP = { width: 683, height: 384 }   // 200% zoom on the 1366x768 desktop reference
const ZOOM_TABLET_LANDSCAPE = { width: 512, height: 384 } // 200% zoom on 1024x768 tablet landscape (memory game requires landscape)
const REFERENCE_VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1366, height: 768 },
]

async function simulateLargeText(page, scale = 2) {
  await page.addStyleTag({ content: `html { font-size: ${16 * scale}px !important; }` })
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement
    return de.scrollWidth <= de.clientWidth + 1
  })
}

async function startMemoryBoard(page) {
  await page.goto('/game/animal-memory-match')
  await page.getByTestId('game-intro-start').click()
  await page.locator('[data-tile-id]').first().waitFor()
}

test.describe('200%-zoom-equivalent viewports', () => {
  for (const [routeName, path] of [['dashboard', '/'], ['quiz intro', '/game/color-match'], ['memory intro', '/game/animal-memory-match']]) {
    test(`${routeName}: no horizontal overflow at desktop zoom-equivalent width`, async ({ page }) => {
      await page.setViewportSize(ZOOM_DESKTOP)
      await page.goto(path)
      expect(await noHorizontalOverflow(page)).toBe(true)
    })
  }

  test('memory board: no horizontal overflow at tablet-landscape zoom-equivalent width', async ({ page }) => {
    await page.setViewportSize(ZOOM_TABLET_LANDSCAPE)
    await startMemoryBoard(page)
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('memory board: no keyboard-focused tile is ever covered by the sticky header (issue #83 regression)', async ({ page }) => {
    await page.setViewportSize(ZOOM_TABLET_LANDSCAPE)
    await startMemoryBoard(page)

    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Tab')
      const obscured = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return false
        const header = document.querySelector('.shell__header')
        if (!header || header.contains(el)) return false
        const hb = header.getBoundingClientRect()
        const r = el.getBoundingClientRect()
        return r.top < hb.bottom && r.bottom > 0
      })
      expect(obscured).toBe(false)
    }
  })

  test('dashboard: scroll-padding does not over-reserve space beyond the actual one-row header height (negative)', async ({ page }) => {
    await page.setViewportSize(ZOOM_DESKTOP)
    await page.goto('/')
    const { published, actual } = await page.evaluate(() => {
      const header = document.querySelector('.shell__header')
      return {
        published: getComputedStyle(document.documentElement).getPropertyValue('--shell-header-height').trim(),
        actual: `${header.getBoundingClientRect().height}px`,
      }
    })
    expect(published).toBe(actual)
  })
})

test.describe('OS/browser large-text settings', () => {
  test('quiz choice text actually scales under a large-text setting (Fix 1 regression guard)', async ({ page }) => {
    await page.goto('/game/color-match')
    await page.getByTestId('game-intro-start').click()
    const choice = page.locator('[data-color-id]').first()
    await choice.waitFor()
    const baseline = await choice.evaluate(el => parseFloat(getComputedStyle(el).fontSize))

    await simulateLargeText(page, 2)
    await page.waitForTimeout(100)
    const scaled = await choice.evaluate(el => parseFloat(getComputedStyle(el).fontSize))

    expect(scaled).toBeGreaterThan(baseline * 1.8)
  })

  test('memory tile text actually scales under a large-text setting (Fix 1 regression guard)', async ({ page }) => {
    await startMemoryBoard(page)
    const tile = page.locator('[data-tile-id]').first()
    const baseline = await tile.evaluate(el => parseFloat(getComputedStyle(el).fontSize))

    await simulateLargeText(page, 2)
    await page.waitForTimeout(100)
    const scaled = await tile.evaluate(el => parseFloat(getComputedStyle(el).fontSize))

    expect(scaled).toBeGreaterThan(baseline * 1.8)
  })

  test('base body text actually scales under a large-text setting (Fix 1 regression guard — base/inherited size, not just component-level)', async ({ page }) => {
    await page.goto('/')
    const bodyEl = page.locator('body')
    const baseline = await bodyEl.evaluate(el => parseFloat(getComputedStyle(el).fontSize))

    await simulateLargeText(page, 2)
    await page.waitForTimeout(100)
    const scaled = await bodyEl.evaluate(el => parseFloat(getComputedStyle(el).fontSize))

    expect(scaled).toBeGreaterThan(baseline * 1.8)
  })

  for (const vp of REFERENCE_VIEWPORTS) {
    test(`dashboard at ${vp.name} viewport: large text introduces no new horizontal overflow (negative)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/')
      await simulateLargeText(page, 2)
      await page.waitForTimeout(100)
      expect(await noHorizontalOverflow(page)).toBe(true)
    })
  }
})
