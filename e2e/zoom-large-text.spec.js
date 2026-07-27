import { test, expect } from '@playwright/test'

// "200% zoom" and "OS large-text settings" are two different mechanisms
// (see docs/superpowers/specs/2026-07-19-accessibility-wave-2-design.md).
// Full-page zoom scales everything uniformly regardless of CSS units, so
// per WCAG 1.4.10 it's tested as an equivalent-width viewport (200% zoom on
// a 1280px baseline == a 640 CSS-px viewport). Large-text settings scale
// only rem-relative font-size, simulated here by forcing the root font-size.

const DAY = 86_400_000
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

// Mirrors ParentDashboard.jsx's own date formatting so tick-label assertions
// below can compute an exact expected value instead of a fragile length check.
function formatDate(dateStr) {
  const [, m, d] = dateStr.split('-')
  return `${parseInt(m)}/${parseInt(d)}`
}

function seedParentScores(daysAgoList) {
  const now = Date.now()
  return daysAgoList.map((daysAgo, i) => ({
    gameId: i % 2 === 0 ? 'animal-sounds' : 'color-match',
    score: 8,
    total: 10,
    date: new Date(now - daysAgo * DAY).toISOString().split('T')[0],
    timestamp: now - daysAgo * DAY,
    peakStreak: 4,
    timings: [{ questionIndex: 0, itemId: `item-${i}`, correct: true, durationMs: 1000 + i * 100 }],
  }))
}

async function heatmapAlignmentDeltas(page) {
  return page.evaluate(() => {
    const dayLabels = [...document.querySelectorAll('.heatmap__day-label')]
    const grid = document.querySelector('.heatmap__grid')
    // grid-auto-flow: column -- the first N children (N = day-label count) are column 0's rows.
    const firstColumnCells = [...grid.children].slice(0, dayLabels.length)
    return dayLabels.map((label, i) => {
      const lr = label.getBoundingClientRect()
      const cr = firstColumnCells[i].getBoundingClientRect()
      return Math.round(((lr.top + lr.bottom) / 2) - ((cr.top + cr.bottom) / 2))
    })
  })
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

// Parent Dashboard chart-axis labels and heatmap row alignment (issue #130).
// The two residual gaps left by the wave-2 px->rem conversion (issue #83):
// Recharts' tick={{ fontSize: 12 }} is a JS prop, not CSS, so it didn't scale;
// and the heatmap's day-label boxes (already rem) desynced from its grid rows
// (still px). See ParentDashboard.jsx/.css for the fix.
test.describe('parent dashboard: chart-axis labels and heatmap alignment under large text (issue #130)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
    await page.addInitScript((scores) => {
      localStorage.setItem('playground_scores', JSON.stringify(scores))
    }, seedParentScores([1, 2, 3, 10, 45]))
  })

  test('chart axis tick text actually scales under a large-text setting (Fix 1 regression guard)', async ({ page }) => {
    await page.goto('/parent')
    const tick = page.locator('.recharts-cartesian-axis-tick-value').first()
    await tick.waitFor()
    const baseline = await tick.evaluate(el => parseFloat(getComputedStyle(el).fontSize))

    await simulateLargeText(page, 2)
    await page.waitForTimeout(100)
    const scaled = await tick.evaluate(el => parseFloat(getComputedStyle(el).fontSize))

    expect(scaled).toBeGreaterThan(baseline * 1.8)
  })

  test('the most-recent score-trend x-axis tick is not clipped under a large-text setting (negative)', async ({ page }) => {
    await page.goto('/parent')
    await page.getByRole('heading', { name: 'Score Trend' }).waitFor()
    await simulateLargeText(page, 2)
    await page.waitForTimeout(100)

    const expectedLastTick = formatDate(new Date(Date.now() - 1 * DAY).toISOString().split('T')[0])
    // Scope to the score-trend chart's own x-axis -- the page has two charts,
    // and .last() over an unscoped selector can land on the response-time
    // chart's y-axis tick ("1.4s") instead.
    const scoreTrendSection = page.locator('.parent__section:has(#score-trend-heading)')
    const lastTickText = await scoreTrendSection.locator('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value').last().textContent()
    expect(lastTickText).toBe(expectedLastTick)
  })

  test('heatmap day-label rows stay aligned with their grid rows under a large-text setting (Fix 2 regression guard)', async ({ page }) => {
    await page.goto('/parent')
    await page.locator('.heatmap__grid').waitFor()
    await simulateLargeText(page, 2)
    await page.waitForTimeout(100)

    for (const delta of await heatmapAlignmentDeltas(page)) {
      expect(Math.abs(delta)).toBeLessThanOrEqual(1)
    }
  })

  test('negative (baseline): heatmap day-label rows are already aligned with their grid rows without a large-text setting', async ({ page }) => {
    await page.goto('/parent')
    await page.locator('.heatmap__grid').waitFor()

    for (const delta of await heatmapAlignmentDeltas(page)) {
      expect(Math.abs(delta)).toBeLessThanOrEqual(1)
    }
  })

  test('the hidden chart data table does not push the page into horizontal overflow at phone width under a large-text setting (CAPMIN fix found while verifying issue #130)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/parent')
    await simulateLargeText(page, 2)
    await page.waitForTimeout(100)
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('negative: the fixed-layout hidden data table still exposes every game column to screen readers', async ({ page }) => {
    await page.goto('/parent')
    await page.getByRole('heading', { name: 'Score Trend' }).waitFor()
    const headers = await page.locator('.parent__chart-data-table').first().locator('th').allTextContents()
    // date column + one column per game (two games seeded: animal-sounds, color-match)
    expect(headers.length).toBe(3)
  })
})
