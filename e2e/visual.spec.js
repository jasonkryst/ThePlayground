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
  'components-gamechoicegrid--hint-active-subtle',
  'components-gamechoicegrid--hint-active-bold',
  'components-gamechoicegrid--locked',
  'components-gamechoicegrid--locked-wrong',
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
  'games-fruitveggieidgame--default',
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
    // Freeze the clock before any story renders. useFeaturedGame hashes the
    // real calendar date to pick "Today's Game" (see src/hooks/useFeaturedGame.js),
    // so any story rendering the Dashboard/GameCard hero would otherwise
    // produce a different, legitimately-different screenshot every day —
    // indistinguishable from a real regression without this.
    await page.clock.install({ time: new Date('2026-01-02T12:00:00Z') })
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

    // maxDiffPixelRatio was 0.1 until issue #89 — loose enough that a fully
    // unstyled GameResults screen passed against a styled baseline during
    // the issue-#53 work (the computed-style e2e assertions, e.g.
    // e2e/animal-memory-match.spec.js, are the real guard against that class
    // of regression, not this screenshot diff). Re-measured empirically
    // (2026-07-18, this machine): with fresh baselines and the clock frozen
    // above, 35 of 36 stories render pixel-identical to their baseline
    // across repeated runs; only games-animalmemorymatchgame--default shows
    // small stable jitter (~0.01 ratio, likely tile-icon sub-pixel
    // rendering), consistent across three full-suite reruns. 0.02 clears
    // that noise floor with margin while catching anything shaped like the
    // issue-#53 regression (which differed by far more than 2%).
    await expect(page).toHaveScreenshot(`${id}.png`, { maxDiffPixelRatio: 0.02 })
  })
}
