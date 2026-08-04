import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.js',
  fullyParallel: true,
  // CI's ubuntu-latest runner has ~2 vCPUs; 2 parallel workers each launching
  // a real Chromium instance against one shared `npm run dev` process can
  // starve each other's CPU time badly enough to blow past even a 60s test
  // timeout (issues #141, #147/#165, #167) -- and which specific test loses
  // that race is effectively random, so it keeps recurring in different
  // files instead of getting fixed once. Pinning CI to a single worker
  // removes the contention at its source; local dev keeps Playwright's own
  // default parallelism.
  workers: process.env.CI ? 1 : undefined,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    navigationTimeout: 30_000,
  },
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run storybook -- --ci',
      url: 'http://localhost:6006',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
