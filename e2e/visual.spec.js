import { test, expect } from '@playwright/test'

const stories = [
  'components-gamecard--default',
  'components-gamecard--with-best-score',
  'components-dashboard--default',
  'components-dashboard--empty',
  'components-scorehistory--default',
  'components-scorehistory--empty',
  'components-timer--start',
  'components-timer--mid-tick',
  'components-timer--countdown-midway',
  'components-timer--countdown-time-up',
  'components-gamechoicegrid--default',
  'components-gamechoicegrid--retry-in-progress',
  'components-gamechoicegrid--hint-active',
  'components-gamechoicegrid--locked',
  'components-memoryboard--default',
  'components-gameresults--perfect-run',
  'components-gameresults--with-missed-items',
  'components-gameresults--perfect-with-difficulty-offer',
  'components-gameresults--with-personal-best-records',
  'components-gameresults--with-new-badges',
  'components-gameintro--default',
  'components-gameintro--dont-show-again-checked',
  'components-gameintro--landscape-required',
  'components-gameintro--portrait-required',
  'components-orientationoverlay--default',
  'components-orientationoverlay--portrait-required',
  'components-badgegallery--all-locked',
  'components-badgegallery--mixed-progress',
  'pages-adminpage--default',
  'pages-kidsprogresspage--default',
  'games-animalmemorymatchgame--default',
  'games-animalsoundsgame--default',
  'games-charactermatchgame--default',
  'games-colormatchgame--default',
]

// Run these tests one at a time rather than in parallel workers. Storybook's
// dev server cold-compiles each story with Vite on first request, and 9
// workers all cold-compiling at once causes contention that makes some
// requests exceed even a generous per-test timeout. Serializing avoids that.
test.describe.configure({ mode: 'serial' })

// Storybook's story indexer reads all *.stories.jsx files concurrently and
// re-runs that read whenever its watcher fires; the concurrent reads
// occasionally race and fail ("Could not parse expression with acorn") for
// files unrelated to whatever changed, serving an error overlay instead of
// any story. This can happen at boot or recur mid-run, but always self-heals
// shortly after, so check before the suite starts and retry any individual
// story that hits it rather than failing outright.
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
    // that varies slightly on the first render after a Storybook cold boot.
    // This tolerance is loose enough that it can miss real styling
    // regressions — during the issue-#53 work, a fully unstyled GameResults
    // screen still passed within 0.1 against a styled baseline. The
    // computed-style e2e assertions (e.g. e2e/animal-memory-match.spec.js)
    // are the guard against that class of regression, not this screenshot
    // diff.
    await expect(page).toHaveScreenshot(`${id}.png`, { maxDiffPixelRatio: 0.1 })
  })
}
