import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const LIGHTHOUSERC_PATH = path.join(REPO_ROOT, 'lighthouserc.json')

const EXPECTED_URLS = [
  'http://localhost:4173/',
  'http://localhost:4173/game/animal-sounds',
  'http://localhost:4173/parent',
  'http://localhost:4173/my-progress',
]

const EXPECTED_CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']

let config

beforeAll(() => {
  config = JSON.parse(fs.readFileSync(LIGHTHOUSERC_PATH, 'utf8'))
})

describe('lighthouserc.json', () => {
  it('collects exactly the 4 expected routes', () => {
    expect([...config.ci.collect.url].sort()).toEqual([...EXPECTED_URLS].sort())
  })

  it('starts the production preview server, not the dev server', () => {
    expect(config.ci.collect.startServerCommand).toContain('preview')
    expect(config.ci.collect.startServerCommand).not.toContain('vite dev')
  })

  it('launches Chrome with --no-sandbox (setup-chrome-installed Chrome has no zygote sandbox helper registered in the GitHub Actions container)', () => {
    expect(config.ci.collect.settings?.chromeFlags).toContain('--no-sandbox')
  })

  it.each(EXPECTED_CATEGORIES)('%s category has an error-level assertion at minScore 0.8', (category) => {
    const assertion = config.ci.assert.assertions[`categories:${category}`]
    expect(assertion).toBeDefined()
    expect(assertion[0]).toBe('error')
    expect(assertion[1].minScore).toBe(0.8)
  })

  it('negative: no expected category assertion is missing', () => {
    for (const category of EXPECTED_CATEGORIES) {
      expect(config.ci.assert.assertions[`categories:${category}`]).toBeDefined()
    }
  })

  it('negative: no category is set to warn-only or off (would silently stop gating that category)', () => {
    for (const category of EXPECTED_CATEGORIES) {
      const level = config.ci.assert.assertions[`categories:${category}`][0]
      expect(level).not.toBe('warn')
      expect(level).not.toBe('off')
    }
  })

  it('negative: no threshold is 0 or missing (which would always pass)', () => {
    for (const category of EXPECTED_CATEGORIES) {
      const minScore = config.ci.assert.assertions[`categories:${category}`][1].minScore
      expect(minScore).toBeGreaterThan(0)
    }
  })
})
