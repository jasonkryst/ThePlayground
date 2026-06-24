import { test, expect } from '@playwright/test'

const stories = [
  'components-gamecard--default',
  'components-gamecard--with-best-score',
  'components-dashboard--default',
  'components-dashboard--empty',
  'components-scorehistory--default',
  'components-scorehistory--empty',
  'pages-adminpage--default',
  'games-animalsoundsgame--default',
  'games-colormatchgame--default',
]

// Run these tests one at a time rather than in parallel workers. Storybook's
// dev server cold-compiles each story with Vite on first request, and this
// repo lives on a network share (per CLAUDE.md) where that compile is slow;
// 9 workers all cold-compiling at once causes contention that makes some
// requests exceed even a generous per-test timeout. Serializing avoids that.
test.describe.configure({ mode: 'serial' })

for (const id of stories) {
  test(`visual: ${id}`, async ({ page }) => {
    test.setTimeout(90_000)
    // Storybook's dev server keeps an HMR websocket open, so
    // waitForLoadState('networkidle') never resolves here. Wait for the
    // story root to render instead.
    await page.goto(`http://localhost:6006/iframe.html?id=${id}&viewMode=story`)
    await page.locator('#storybook-root').waitFor({ timeout: 60_000 })
    await expect(page).toHaveScreenshot(`${id}.png`)
  })
}
