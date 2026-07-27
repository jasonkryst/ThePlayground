import { test, expect } from '@playwright/test'

const PHONE_VIEWPORT = { width: 390, height: 844 }
const PRIMARY_TAP_TARGET = 64
const WCAG_MIN_TAP_TARGET = 24

// Issue #91 (restating audit finding AU-7): verifies live that
// `.dashboard__tab` already meets the app's 64x64px primary tap-target
// standard via the global `button` rule in src/index.css (padding-only
// arithmetic under-counts it, since a min-height floor wins over whatever
// height padding+content would otherwise produce) -- see the comment on
// `.dashboard__tab` in Dashboard.css and CHANGELOG.md's [0.32.0]/[0.32.3]
// entries. The negative tests below prove this assertion is scoped, not
// trivially true for every button in the app, and guard the documented
// parent-only/secondary-control exceptions from being "fixed" by mistake.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
})

test.describe('dashboard tab strip meets the primary 64px tap-target standard', () => {
  test('an unselected tag pill meets the 64px floor at desktop width', async ({ page }) => {
    await page.goto('/')
    const box = await page.getByRole('button', { name: 'Animals' }).boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
  })

  test('a selected (active) tag pill also meets the 64px floor at desktop width', async ({ page }) => {
    await page.goto('/')
    const pill = page.getByRole('button', { name: 'Sounds' })
    await pill.click()
    await expect(pill).toHaveAttribute('aria-pressed', 'true')
    const box = await pill.boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
  })

  test('a tag pill meets the 64px floor at phone width, the viewport a child is most likely to use', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto('/')
    const box = await page.getByRole('button', { name: 'Animals' }).boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
  })

  test('the parent date-range tab bar also meets the 64px floor (it has no min-height override, unlike .admin__tab)', async ({ page }) => {
    await page.goto('/parent')
    const box = await page.getByRole('tab', { name: 'All time' }).boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
  })
})

test.describe('negative: deliberate secondary/parent-only controls stay below 64px but clear the WCAG 24px minimum', () => {
  test('dashboard "Clear filters" button is a smaller secondary control, not held to the 64px standard', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Sounds' }).click()
    const box = await page.getByRole('button', { name: 'Clear filters' }).boundingBox()
    expect(box.height).toBeLessThan(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(WCAG_MIN_TAP_TARGET)
  })

  test('dashboard "+N more" tag-overflow toggle is a smaller secondary control at phone width', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto('/')
    const toggle = page.getByRole('button', { name: /\+\d+ more/ })
    await expect(toggle).toBeVisible()
    const box = await toggle.boundingBox()
    expect(box.height).toBeLessThan(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(WCAG_MIN_TAP_TARGET)
  })

  test('admin tab bar is a deliberately smaller parent-only surface, not held to the 64px standard', async ({ page }) => {
    await page.goto('/admin')
    const box = await page.getByRole('tab', { name: 'Settings' }).boundingBox()
    expect(box.height).toBeLessThan(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(WCAG_MIN_TAP_TARGET)
  })
})
