import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GAMES_DIR = path.join(__dirname, '..', 'src', 'games')
const DEV_SERVER = 'http://localhost:5173'

// Vite compiles each route's JS module graph lazily, on the first real
// browser request for it, which can be slow enough on its own to threaten
// a test's timeout (issue #141: css-validity.spec.js's animal-sounds test
// hit exactly this). Sequentially visiting every route once here -- before
// the real test workers start -- means every route's module graph is
// already compiled and cached by the time the suite begins, so no test is
// ever the one paying a cold-compile's full cost.
//
// This used to also be the fix for a second, unrelated hazard: CI ran 2
// workers against one shared `npm run dev` instance, and two workers'
// simultaneous first-ever navigations to two different not-yet-compiled
// routes could still occasionally exceed even a 60s timeout despite this
// warm-up, because the warm-up alone doesn't stop two *already-warm* routes
// from contending for CPU once the real parallel workers start. That
// resurfaced repeatedly in different tests each time (issues #147/#165,
// then #167) since patching whichever specific test lost the race never
// removed the actual contention -- so `playwright.config.js` now pins CI to
// a single worker (`workers: process.env.CI ? 1 : undefined`) instead,
// removing cross-worker contention at its source. retries: 0 stays
// deliberate either way (this repo treats a flaky pass-on-retry as worse
// than a loud failure) -- this warm-up remains as defense-in-depth against
// the plain cold-compile cost, not cross-worker contention.
export default async function globalSetup() {
  const gameIds = fs.readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)

  const routes = ['/', '/admin', '/parent', '/my-progress', ...gameIds.map(id => `/game/${id}`)]

  const browser = await chromium.launch()
  const page = await browser.newPage()
  for (const route of routes) {
    try {
      await page.goto(`${DEV_SERVER}${route}`, { waitUntil: 'networkidle', timeout: 30_000 })
    } catch {
      // Best-effort: a route that's unusually slow even alone just falls
      // back to compiling on the real suite's first request, same as
      // before this warm-up existed -- the real suite's own per-test
      // timeout is still the backstop.
    }
  }
  await browser.close()
}
