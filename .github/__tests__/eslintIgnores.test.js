// @vitest-environment node
//
// Generated/tool-output directories must be ignored by ESLint, or `npm run
// lint` fails locally on minified bundles after e.g. `npm run build-storybook`
// (58 rules-of-hooks errors from storybook-static/ on 2026-11-11). Uses
// ESLint's own resolver, so this tests real behaviour, not the config's shape.
import { describe, it, expect, beforeAll } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')

const GENERATED_DIRS = [
  'dist',
  'dist-ssr',
  'coverage',
  'storybook-static',
  'playwright-report',
  'test-results',
  'reports',
  '.stryker-tmp',
  '.lighthouseci',
  '.worktrees',
]

let eslint
beforeAll(() => {
  eslint = new ESLint({ cwd: REPO_ROOT })
})

const ignored = rel => eslint.isPathIgnored(path.join(REPO_ROOT, rel))

describe('eslint.config.js ignores', () => {
  it.each(GENERATED_DIRS)('ignores JS generated under %s/', async dir => {
    expect(await ignored(`${dir}/assets/bundle.js`)).toBe(true)
  })

  it('ignores nested generated JS (e.g. Stryker’s sandbox copy of src/)', async () => {
    expect(await ignored('.stryker-tmp/sandbox-abc123/src/App.jsx')).toBe(true)
  })

  it.each([
    'src/App.jsx',
    'src/hooks/useSettings.js',
    'e2e/dashboard.spec.js',
    'scripts/generate-chimes.mjs',
    '.github/__tests__/ci.test.js',
    'eslint.config.js',
  ])('negative: still lints source file %s', async file => {
    expect(await ignored(file)).toBe(false)
  })

  it('negative: a source folder merely named like an output dir is still linted (patterns are root-anchored)', async () => {
    expect(await ignored('src/reports/ReportCard.jsx')).toBe(false)
  })
})
