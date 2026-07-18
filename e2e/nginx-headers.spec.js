import { test, expect } from '@playwright/test'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Verifies the real nginx.conf's runtime behavior against a live nginx
// server (SEC-1) — the static check in nginx/__tests__/securityHeaders.test.js
// catches the config-text pattern, but only a live request proves nginx
// actually sends the headers. Spins up the same pinned, non-root image the
// Dockerfile ships (nginxinc/nginx-unprivileged:1.27-alpine) directly (not
// the full Dockerfile build, which requires `npm run build` first and is
// slow), mounting this repo's nginx.conf/security-headers.conf plus
// minimal fixture assets. Also asserts the nginx process itself is
// non-root (SEC-4). Requires Docker; skips (not fails) when unavailable so
// `npm run e2e` still runs on machines without it.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const CONTAINER_NAME = `playground-nginx-headers-test-${process.pid}`

const EXPECTED_SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
}

function dockerAvailable() {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function assertSecurityHeaders(headers) {
  for (const [name, value] of Object.entries(EXPECTED_SECURITY_HEADERS)) {
    expect(headers[name], `missing/wrong ${name} header`).toBe(value)
  }
}

test.describe('nginx security headers (live container)', () => {
  test.skip(!dockerAvailable(), 'Docker is not available in this environment')

  let fixtureDir
  let containerPort

  test.beforeAll(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playground-nginx-fixture-'))
    fs.writeFileSync(path.join(fixtureDir, 'index.html'), '<!doctype html><title>fixture</title>')
    fs.mkdirSync(path.join(fixtureDir, 'assets'))
    fs.writeFileSync(path.join(fixtureDir, 'assets', 'app.js'), 'console.log(1)')
    fs.writeFileSync(path.join(fixtureDir, 'assets', 'app.css'), 'body{}')
    fs.writeFileSync(path.join(fixtureDir, 'assets', 'font.woff2'), 'fake-font')
    fs.writeFileSync(path.join(fixtureDir, 'assets', 'image.png'), 'fake-png')
    fs.mkdirSync(path.join(fixtureDir, 'sounds'))
    fs.writeFileSync(path.join(fixtureDir, 'sounds', 'test.mp3'), 'fake-mp3')

    const run = spawnSync(
      'docker',
      [
        'run', '-d', '--rm',
        '--name', CONTAINER_NAME,
        '-p', '127.0.0.1:0:8080',
        '-v', `${fixtureDir}:/usr/share/nginx/html:ro`,
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
    if (fixtureDir) fs.rmSync(fixtureDir, { recursive: true, force: true })
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

  test('nginx worker process runs as a non-root user (SEC-4)', () => {
    const whoami = execFileSync('docker', ['exec', CONTAINER_NAME, 'whoami'], { encoding: 'utf8' }).trim()
    expect(whoami).not.toBe('root')
  })

  test('HTML document response carries all three security headers', async ({ request }) => {
    await waitUntilReady(request)
    const res = await request.get(`http://localhost:${containerPort}/`)
    expect(res.status()).toBe(200)
    assertSecurityHeaders(res.headers())
  })

  for (const [label, urlPath] of [
    ['JS asset', '/assets/app.js'],
    ['CSS asset', '/assets/app.css'],
    ['font asset', '/assets/font.woff2'],
    ['image asset', '/assets/image.png'],
    ['mp3 asset', '/sounds/test.mp3'],
  ]) {
    test(`${label} response carries all three security headers`, async ({ request }) => {
      await waitUntilReady(request)
      const res = await request.get(`http://localhost:${containerPort}${urlPath}`)
      expect(res.status()).toBe(200)
      assertSecurityHeaders(res.headers())
    })
  }

  test('hashed/immutable asset tier still sends its Cache-Control (fix did not remove caching)', async ({ request }) => {
    await waitUntilReady(request)
    const res = await request.get(`http://localhost:${containerPort}/assets/app.js`)
    expect(res.headers()['cache-control']).toBe('max-age=31536000, public, immutable')
  })

  test('mp3 tier still sends its own shorter Cache-Control (fix did not remove caching)', async ({ request }) => {
    await waitUntilReady(request)
    const res = await request.get(`http://localhost:${containerPort}/sounds/test.mp3`)
    expect(res.headers()['cache-control']).toBe('max-age=604800, public')
  })

  test('a 404 for a missing asset still carries the security headers (add_header ... always)', async ({ request }) => {
    await waitUntilReady(request)
    const res = await request.get(`http://localhost:${containerPort}/assets/does-not-exist.js`)
    expect(res.status()).toBe(404)
    assertSecurityHeaders(res.headers())
  })
})
