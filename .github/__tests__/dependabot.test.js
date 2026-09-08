import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const DEPENDABOT_PATH = path.join(REPO_ROOT, '.github', 'dependabot.yml')

let config

beforeAll(() => {
  config = parse(fs.readFileSync(DEPENDABOT_PATH, 'utf8'))
})

// Guards issue #145's SHA-pinning finding: pinning actions to commit SHAs
// only stays useful if something keeps the pins current, or they silently
// go stale the same way the react-router allowlist did.
describe('.github/dependabot.yml', () => {
  it('declares config version 2', () => {
    expect(config.version).toBe(2)
  })

  it('tracks the github-actions ecosystem at the repo root', () => {
    const entry = config.updates.find(u => u['package-ecosystem'] === 'github-actions')
    expect(entry).toBeDefined()
    expect(entry.directory).toBe('/')
    expect(entry.schedule?.interval).toBeTruthy()
  })

  it('negative: does not also track npm here (production deps are already gated by audit-ci in ci.yml, a separate concern)', () => {
    expect(config.updates.some(u => u['package-ecosystem'] === 'npm')).toBe(false)
  })

  it('tracks the docker ecosystem at the repo root (keeps Dockerfile base-image tags current)', () => {
    const entry = config.updates.find(u => u['package-ecosystem'] === 'docker')
    expect(entry).toBeDefined()
    expect(entry.directory).toBe('/')
    expect(entry.schedule?.interval).toBeTruthy()
  })

  // Guards issue #193: node only ever promotes an even-numbered major to
  // Active LTS — a routine Dependabot major-bump PR previously landed the
  // Dockerfile on a non-LTS release (node:24-alpine -> node:26-alpine,
  // 1.1.9) without anyone deciding that was the right time. Major bumps now
  // require a deliberate manual PR instead of an auto-opened one.
  describe('node major-version bumps require manual review (issue #193)', () => {
    it('ignores semver-major updates for the node docker dependency', () => {
      const entry = config.updates.find(u => u['package-ecosystem'] === 'docker')
      const nodeIgnore = entry.ignore?.find(i => i['dependency-name'] === 'node')
      expect(nodeIgnore).toBeDefined()
      expect(nodeIgnore['update-types']).toEqual(['version-update:semver-major'])
    })

    it('negative: does not ignore major bumps for the nginx docker dependency (those stay automatic)', () => {
      const entry = config.updates.find(u => u['package-ecosystem'] === 'docker')
      const nginxIgnore = entry.ignore?.find(i => i['dependency-name'] === 'nginx' || i['dependency-name']?.includes('nginx'))
      expect(nginxIgnore).toBeUndefined()
    })
  })
})
