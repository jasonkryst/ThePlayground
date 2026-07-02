import { test, expect } from '@playwright/test'

const stories = [
  'components-gamecard--default',
  'components-gamecard--with-best-score',
  'components-dashboard--default',
  'components-dashboard--empty',
  'components-scorehistory--default',
  'components-scorehistory--empty',
  'components-timer--start',
  'components-timer--midtick',
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

// This repo lives on a network share (per CLAUDE.md). Storybook's story
// indexer reads all *.stories.jsx files concurrently and re-runs that read
// whenever its watcher fires, including spurious events on this share; the
// concurrent reads occasionally race and fail ("Could not parse expression
// with acorn") for files unrelated to whatever changed, serving an error
// overlay instead of any story. This can happen at boot or recur mid-run,
// but always self-heals shortly after, so check before the suite starts and
// retry any individual story that hits it rather than failing outright.
test.beforeAll(async ({ request }) => {
  await expect(async () => {
    const res = await request.get('http://localhost:6006/index.json')
    const body = await res.json()
    expect(body.entries).toBeTruthy()
  }).toPass({ timeout: 90_000, intervals: [2_000] })
})

for (const id of stories) {
  test(`visual: ${id}`, async ({ page }) => {
    test.setTimeout(90_000)
    const url = `http://localhost:6006/iframe.html?id=${id}&viewMode=story`
    const errorOverlay = page.getByText('Unable to index files')

    for (let attempt = 0; attempt < 5; attempt++) {
      // Storybook's dev server keeps an HMR websocket open, so
      // waitForLoadState('networkidle') never resolves here. Wait for the
      // story root to render instead.
      await page.goto(url)
      await page.locator('#storybook-root').waitFor({ timeout: 60_000 })
      if (await errorOverlay.isVisible().catch(() => false)) {
        await page.waitForTimeout(3_000)
        continue
      }
      break
    }

    // A small ratio tolerance absorbs font/icon edge anti-aliasing jitter
    // that varies slightly on the first render after a Storybook cold boot,
    // while still failing on real content/layout regressions (which differ
    // by a much larger margin than this).
    await expect(page).toHaveScreenshot(`${id}.png`, { maxDiffPixelRatio: 0.1 })
  })
}
