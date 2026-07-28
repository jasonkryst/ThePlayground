import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GAMES_DIR = path.join(__dirname, '..', 'src', 'games')
const DEV_SERVER = 'http://localhost:5173'

// CI runs this suite with only 2 workers (a 2-vCPU standard GitHub-hosted
// runner) against one shared `npm run dev` instance. Vite compiles each
// route's JS module graph lazily, on the first real browser request for it
// -- so when two workers' first-ever navigations to two different
// not-yet-compiled routes land at the same time, the loser can occasionally
// exceed even a 60s test timeout (issue #141: css-validity.spec.js's
// animal-sounds test hit exactly this, twice across three real CI runs,
// with no prior history and no relation to any of that PR's actual
// changes). retries: 0 in playwright.config.js is deliberate (this repo
// treats a flaky pass-on-retry as worse than a loud failure), so the fix
// has to remove the contention itself rather than paper over it with a
// retry. Sequentially visiting every route once here -- before the parallel
// workers start -- means every route's module graph is already compiled
// and cached by the time the real suite begins, so no worker is ever the
// one paying a cold-compile's full cost under contention.
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
