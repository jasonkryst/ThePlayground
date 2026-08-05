import { test, expect } from '@playwright/test'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Issue #96: proves the service worker/manifest actually work under this
// app's real, locked-down CSP (`default-src 'self'; script-src 'self'
// https://www.googletagmanager.com; ...` in nginx/security-headers.conf).
// e2e/pwa.spec.js already proves the feature works via `vite preview`, but
// that sends no CSP header at all, so it can't catch a CSP-caused break --
// same reasoning e2e/confetti-csp.spec.js gives for testing confetti's
// Worker usage against the real headers instead of just the dev server.
//
// Boots the same pinned nginx image the Dockerfile ships
// (nginxinc/nginx-unprivileged:1.30-alpine), serving a real `npm run build`
// output with the real nginx.conf/security-headers.conf. Requires Docker;
// skips (not fails) when unavailable so `npm run e2e` still runs on
// machines without it.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const CONTAINER_NAME = `playground-pwa-csp-test-${process.pid}`

function dockerAvailable() {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

test.describe('PWA service worker under the real production CSP (issue #96)', () => {
  test.skip(!dockerAvailable(), 'Docker is not available in this environment')

  // Serial, matching e2e/confetti-csp.spec.js/e2e/nginx-headers.spec.js:
  // all 3 tests share one beforeAll build + container, and running them
  // across separate parallel workers would race on that shared setup.
  test.describe.configure({ mode: 'serial' })

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
        'nginxinc/nginx-unprivileged:1.30-alpine',
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

  test('service worker registers and activates under the real CSP, and the app survives offline (positive)', async ({ page, request }) => {
    await waitUntilReady(request)
    await page.goto(`http://localhost:${containerPort}/`)
    await expect(page.getByText('Animal Sounds').first()).toBeVisible()

    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.ready
      return Boolean(reg.active)
    }, null, { timeout: 15_000 })
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 })

    await page.context().setOffline(true)
    await page.reload()
    await expect(page.getByText('Animal Sounds').first()).toBeVisible()
  })

  test('no Content-Security-Policy violations are reported while the service worker registers (negative)', async ({ page, request }) => {
    await waitUntilReady(request)
    const cspViolations = []
    page.on('console', msg => {
      if (msg.type() === 'error' && /content security policy/i.test(msg.text())) {
        cspViolations.push(msg.text())
      }
    })

    await page.goto(`http://localhost:${containerPort}/`)
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.ready
      return Boolean(reg.active)
    }, null, { timeout: 15_000 })

    expect(cspViolations).toEqual([])
  })

  test('the manifest is served with an installable, non-blocked response under the real CSP (positive)', async ({ page, request }) => {
    await waitUntilReady(request)
    await page.goto(`http://localhost:${containerPort}/`)
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
    const res = await request.get(new URL(manifestHref, page.url()).toString())
    expect(res.ok()).toBe(true)
    expect(res.headers()['content-type']).toContain('manifest')
  })
})
