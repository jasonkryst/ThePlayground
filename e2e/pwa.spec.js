import { test, expect } from '@playwright/test'
import { execFileSync, spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Issue #96: PWA support (manifest + service worker via vite-plugin-pwa).
// vite-plugin-pwa only injects the manifest link, icon links, and SW
// registration script into the *built* index.html -- the dev server
// (which the rest of this suite runs against) never gets them, since
// devOptions.enabled is intentionally left off (a dev-mode SW is a common
// source of confusing stale-cache bugs during development). So this spec
// builds the app and serves it with `vite preview`, matching how the
// feature actually ships, without requiring Docker/nginx -- CSP-specific
// behavior (this app sends no CSP header outside the real nginx config) is
// covered separately in e2e/pwa-csp.spec.js, mirroring the split between
// e2e/nginx-headers.spec.js and e2e/confetti-csp.spec.js for the same reason.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
// Offset by pid so a concurrent local run (e.g. another suite) is unlikely
// to collide on the same port; CI's single-worker mode never overlaps runs.
const PORT = 4300 + (process.pid % 200)

test.describe('PWA support (production preview build)', () => {
  // Serializes this file's tests onto one worker so they share the single
  // `vite preview` process started in beforeAll, the same reasoning
  // e2e/confetti-csp.spec.js documents for its own shared container.
  test.describe.configure({ mode: 'serial' })

  let previewProcess

  test.beforeAll(() => {
    execFileSync('npm', ['run', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    previewProcess = spawn(
      'npx',
      ['vite', 'preview', '--port', String(PORT), '--strictPort'],
      { cwd: REPO_ROOT, stdio: 'ignore', shell: process.platform === 'win32' }
    )
  })

  test.afterAll(() => {
    if (!previewProcess?.pid) return
    // previewProcess was spawned with shell:true on Windows (npx there is a
    // .cmd, which requires a shell) -- .kill() on a shell-spawned process
    // only kills the cmd.exe wrapper, leaking the actual vite preview
    // process (and its held port) behind it. taskkill /t kills that whole
    // process tree instead. POSIX's plain .kill() has no such wrapper.
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(previewProcess.pid), '/t', '/f'], { stdio: 'ignore' })
    } else {
      previewProcess.kill()
    }
  })

  async function waitUntilReady(request) {
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const res = await request.get(`http://localhost:${PORT}/`)
        if (res.ok()) return
      } catch {
        // not up yet
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error('vite preview server did not become ready in time')
  }

  test('manifest link resolves to a valid, installable web manifest (positive)', async ({ page, request }) => {
    await waitUntilReady(request)
    await page.goto(`http://localhost:${PORT}/`)

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(manifestHref).toBeTruthy()

    const res = await request.get(new URL(manifestHref, page.url()).toString())
    expect(res.ok()).toBe(true)
    const manifest = await res.json()

    expect(manifest.name).toBe('The Playground')
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBe('#006C7A')
    expect(Array.isArray(manifest.icons)).toBe(true)
    expect(manifest.icons.length).toBeGreaterThan(0)
    for (const icon of manifest.icons) {
      const iconRes = await request.get(new URL(icon.src, page.url()).toString())
      expect(iconRes.ok(), `icon ${icon.src} should be reachable`).toBe(true)
    }
  })

  test('theme-color meta and apple-touch-icon are present and reachable (positive)', async ({ page, request }) => {
    await waitUntilReady(request)
    await page.goto(`http://localhost:${PORT}/`)

    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#006C7A')

    const appleIconHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
    expect(appleIconHref).toBeTruthy()
    const res = await request.get(new URL(appleIconHref, page.url()).toString())
    expect(res.ok()).toBe(true)
  })

  test('favicon now resolves instead of 404ing, and the old dead vite.svg path is gone (positive + negative)', async ({ page, request }) => {
    // Previously index.html referenced /vite.svg, a file that never existed
    // in this repo -- every page load silently 404'd on the favicon request.
    await waitUntilReady(request)
    await page.goto(`http://localhost:${PORT}/`)

    const href = await page.locator('link[rel="icon"]').getAttribute('href')
    expect(href).toBe('/favicon.png')
    const res = await request.get(new URL(href, page.url()).toString())
    expect(res.ok()).toBe(true)

    await expect(page.locator('link[href="/vite.svg"]')).toHaveCount(0)
  })

  test('service worker registers, activates, and the app still works offline after that (positive)', async ({ page, request }) => {
    await waitUntilReady(request)
    await page.goto(`http://localhost:${PORT}/`)
    await expect(page.getByText('Animal Sounds').first()).toBeVisible()

    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.ready
      return Boolean(reg.active)
    }, null, { timeout: 15_000 })
    // clientsClaim (vite.config.js) means the active worker takes control of
    // this already-open tab without needing a reload first.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 })

    await page.context().setOffline(true)
    await page.reload()
    await expect(page.getByText('Animal Sounds').first()).toBeVisible()
  })

  test('without a service worker, going offline is NOT survivable (negative control)', async ({ browser, request }) => {
    // Sanity check that the offline test above is actually exercising the
    // service worker rather than some browser cache fluke: a *fresh*
    // context (no prior visit, so no SW installed for it) really does fail
    // to load once offline.
    await waitUntilReady(request)
    const context = await browser.newContext()
    const page = await context.newPage()
    await context.setOffline(true)
    let navigationFailed = false
    try {
      await page.goto(`http://localhost:${PORT}/`, { timeout: 5_000 })
    } catch {
      navigationFailed = true
    }
    expect(navigationFailed).toBe(true)
    await context.close()
  })
})
