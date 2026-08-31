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
})
