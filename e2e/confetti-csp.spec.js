import { test, expect } from '@playwright/test'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Regression coverage for issue #109: confetti/fireworks rendered nothing in
// production even with the setting enabled. Root cause: canvas-confetti's
// bare default export lazily builds a *shared* cannon with `useWorker:
// true`, which loads its animation loop from a `blob:` Worker. This app's
// CSP has no `worker-src`, so it falls back to `script-src`, which doesn't
// allow `blob:` — the Worker is silently killed (Chrome fires an error
// event, not a thrown exception, so canvas-confetti's own try/catch never
// sees it), `transferControlToOffscreen()` had already handed the canvas's
// rendering context away, and nothing is ever drawn. This never reproduced
// in `npm run dev` (no CSP header sent at all), which is how it shipped
// unnoticed. src/lib/confetti.js now builds its own cannon via
// canvas-confetti's `create(null, { useWorker: false })`, forcing main-thread
// rendering — src/lib/__tests__/confetti.test.js guards that wiring at the
// unit level (mocked); this spec proves the actual pixels get drawn under
// the real, live production CSP, which only a real browser + real headers
// (not a mock) can prove.
//
// Boots the same pinned nginx image the Dockerfile ships
// (nginxinc/nginx-unprivileged:1.27-alpine), serving a real `npm run build`
// output with the real nginx.conf/security-headers.conf — same pattern as
// e2e/nginx-headers.spec.js, but driving actual page interactions instead of
// just asserting response headers. Requires Docker; skips (not fails) when
// unavailable so `npm run e2e` still runs on machines without it.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const CONTAINER_NAME = `playground-confetti-csp-test-${process.pid}`

function dockerAvailable() {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Samples the confetti canvas's own pixels rather than just checking for its
// presence: under the pre-fix worker path, a canvas element still got
// appended to the DOM (that happens before the worker handoff), so canvas
// *existence* alone wouldn't have caught the bug -- only its pixels would.
async function waitForConfettiPixels(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return false
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return true
    }
    return false
  }, null, { timeout: 3000 })
}

async function clickFirstPair(page) {
  const ids = await page.locator('[data-tile-id]').evaluateAll(els => els.map(e => e.dataset.itemId))
  const pairId = ids.find(id => ids.filter(x => x === id).length === 2)
  const pair = page.locator(`[data-item-id="${pairId}"]`)
  await pair.nth(0).click()
  await pair.nth(1).click()
}

test.describe('confetti renders under the real production CSP (issue #109)', () => {
  test.skip(!dockerAvailable(), 'Docker is not available in this environment')

  let containerPort

  test.beforeAll(() => {
    execFileSync('npm', ['run', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    const run = spawnSync(
      'docker',
      [
        'run', '-d', '--rm',
        '--name', CONTAINER_NAME,
        '-p', '127.0.0.1:0:8080',
        '-v', `${path.join(REPO_ROOT, 'dist')}:/usr/share/nginx/html:ro`,
        '-v', `${path.join(REPO_ROOT, 'nginx.conf')}:/etc/nginx/conf.d/default.conf:ro`,
        '-v', `${path.join(REPO_ROOT, 'nginx', 'security-headers.conf')}:/etc/nginx/security-headers.conf:ro`,
        'nginxinc/nginx-unprivileged:1.27-alpine',
      ],
      { encoding: 'utf8' }
    )
    if (run.status !== 0) {
      throw new Error(`docker run failed: ${run.stderr}`)
    }

    const portOutput = execFileSync('docker', ['port', CONTAINER_NAME, '8080'], { encoding: 'utf8' })
    containerPort = Number(portOutput.trim().split(':').pop())
  })

  test.afterAll(() => {
    spawnSync('docker', ['stop', CONTAINER_NAME])
  })

  async function waitUntilReady(request) {
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const res = await request.get(`http://localhost:${containerPort}/`)
        if (res.ok()) return
      } catch {
        // not up yet
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error('nginx container did not become ready in time')
  }

  async function startGame(page) {
    await page.goto(`http://localhost:${containerPort}/game/animal-memory-match`)
    await page.getByTestId('game-intro-start').click()
    await page.locator('[data-tile-id]').first().waitFor()
  }

  test('matching a pair actually draws confetti pixels (positive)', async ({ page, request }) => {
    await waitUntilReady(request)
    await startGame(page)
    await clickFirstPair(page)
    await waitForConfettiPixels(page)
  })

  test('completing the board draws the fireworks finale too (positive)', async ({ page, request }) => {
    await waitUntilReady(request)
    await startGame(page)
    const ids = await page.locator('[data-tile-id]').evaluateAll(els => els.map(e => e.dataset.itemId))
    for (const id of [...new Set(ids)]) {
      const pair = page.locator(`[data-item-id="${id}"]`)
      await pair.nth(0).click()
      await pair.nth(1).click()
      // Matches lock briefly on a mismatch; a short settle avoids racing the
      // board's own MISMATCH_DELAY_MS before the next flip.
      await page.waitForTimeout(50)
    }
    await waitForConfettiPixels(page)
  })

  test('disabling the animations setting still shows no confetti canvas under the same CSP (negative)', async ({ page, request }) => {
    await waitUntilReady(request)
    await page.addInitScript(() => {
      localStorage.setItem('playground_settings', JSON.stringify({ animationsEnabled: false }))
    })
    await startGame(page)
    await clickFirstPair(page)
    await page.waitForTimeout(500)
    expect(await page.locator('canvas').count()).toBe(0)
  })
})
