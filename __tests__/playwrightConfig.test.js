import { describe, it, expect, afterEach } from 'vitest'

// Dynamic import with a cache-busting query string, since the module needs
// to be re-evaluated against a different process.env.CI each time -- a
// plain static import would only ever read process.env.CI once, at whatever
// value it happened to have the first time this suite imported it.
async function loadConfig() {
  return (await import(/* @vite-ignore */ `../playwright.config.js?t=${Date.now()}-${Math.random()}`)).default
}

describe('playwright.config.js', () => {
  const originalCI = process.env.CI

  afterEach(() => {
    if (originalCI === undefined) delete process.env.CI
    else process.env.CI = originalCI
  })

  it('pins e2e to a single worker on CI, removing the cross-worker CPU contention behind issues #141/#147/#165/#167', async () => {
    process.env.CI = 'true'
    const config = await loadConfig()
    expect(config.workers).toBe(1)
  })

  it('negative: leaves worker count at Playwright\'s own default outside CI, so local dev keeps its parallelism', async () => {
    delete process.env.CI
    const config = await loadConfig()
    expect(config.workers).toBeUndefined()
  })

  it('negative: does not mask CI contention behind retries -- retries stays 0 regardless of CI', async () => {
    process.env.CI = 'true'
    const ciConfig = await loadConfig()
    delete process.env.CI
    const localConfig = await loadConfig()
    expect(ciConfig.retries).toBe(0)
    expect(localConfig.retries).toBe(0)
  })

  it('fullyParallel stays true -- the single CI worker still runs tests within a file in parallel-eligible order, just not across workers', async () => {
    const config = await loadConfig()
    expect(config.fullyParallel).toBe(true)
  })
})
