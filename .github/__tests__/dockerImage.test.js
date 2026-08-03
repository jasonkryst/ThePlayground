import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const DOCKER_IMAGE_YML_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'docker-image.yml')

let workflow
let dockerImageYmlText

beforeAll(() => {
  dockerImageYmlText = fs.readFileSync(DOCKER_IMAGE_YML_PATH, 'utf8')
  workflow = parse(dockerImageYmlText)
})

function jobSteps() {
  return workflow.jobs['docker-release'].steps
}

// Same validator as .github/__tests__/ci.test.js — kept local rather than
// shared, matching this repo's convention of small inline config validators.
function isShaPinned(usesValue) {
  const atIndex = usesValue.lastIndexOf('@')
  if (atIndex === -1) return false
  return /^[0-9a-f]{40}$/i.test(usesValue.slice(atIndex + 1))
}

describe('.github/workflows/docker-image.yml', () => {
  it('triggers only on a published release', () => {
    expect(workflow.on.release.types).toEqual(['published'])
  })

  it('declares least-privilege permissions (contents:read, packages:write for the registry pushes)', () => {
    expect(workflow.permissions).toEqual({ contents: 'read', packages: 'write' })
  })

  it('pins every third-party action to a commit SHA, not a floating tag', () => {
    const unpinned = jobSteps()
      .filter(s => s.uses)
      .filter(s => !isShaPinned(s.uses))
      .map(s => s.uses)
    expect(unpinned).toEqual([])
  })

  it('carries a human-readable version comment alongside every SHA pin', () => {
    const usesLines = dockerImageYmlText.split('\n').filter(line => /uses:\s*\S+@[0-9a-f]{40}/i.test(line))
    expect(usesLines.length).toBeGreaterThan(0)
    for (const line of usesLines) {
      expect(line, line).toMatch(/#\s*v[\w.]+/)
    }
  })

  // Guards issue #145's "release image never directly Trivy-scanned"
  // finding: the image that gets pushed must be built locally (not pushed
  // straight from docker/build-push-action) and scanned before any push
  // step runs.
  describe('release-image Trivy scan gate (issue #145)', () => {
    it('builds the release image locally without pushing it', () => {
      const buildStep = jobSteps().find(s => s.uses && s.uses.startsWith('docker/build-push-action'))
      expect(buildStep).toBeDefined()
      expect(buildStep.with.push).toBe(false)
      expect(buildStep.with.load).toBe(true)
      expect(buildStep.with.tags).toBe('playground:release')
    })

    it('negative: no build-push-action step pushes directly (that would skip the scan gate)', () => {
      const pushingSteps = jobSteps().filter(s => s.uses && s.uses.startsWith('docker/build-push-action') && s.with.push === true)
      expect(pushingSteps).toEqual([])
    })

    it('scans the exact locally-built release image before any push step', () => {
      const steps = jobSteps()
      const buildIndex = steps.findIndex(s => s.uses && s.uses.startsWith('docker/build-push-action'))
      const scanIndex = steps.findIndex(s => s.uses && s.uses.startsWith('aquasecurity/trivy-action'))
      const firstPushIndex = steps.findIndex(s => s.run && s.run.includes('docker push'))

      expect(buildIndex).toBeGreaterThanOrEqual(0)
      expect(scanIndex).toBeGreaterThan(buildIndex)
      expect(firstPushIndex).toBeGreaterThan(scanIndex)

      const scanStep = steps[scanIndex]
      expect(scanStep.with['image-ref']).toBe('playground:release')
    })

    it('scan gate fails on fixable CRITICAL/HIGH findings, unsilenced', () => {
      const scanStep = jobSteps().find(s => s.uses && s.uses.startsWith('aquasecurity/trivy-action'))
      expect(scanStep.with.severity).toBe('CRITICAL,HIGH')
      expect(scanStep.with['ignore-unfixed']).toBe(true)
      expect(String(scanStep.with['exit-code'])).toBe('1')
      expect(scanStep['continue-on-error']).toBeUndefined()
      expect(scanStep.if).toBeUndefined()
    })

    it('negative: the scan step does not accidentally narrow severity or ignore-unfixed away from the gate', () => {
      const scanStep = jobSteps().find(s => s.uses && s.uses.startsWith('aquasecurity/trivy-action'))
      expect(scanStep.with.severity).not.toMatch(/LOW|MEDIUM|UNKNOWN/)
    })
  })

  it('pushes both the version tag and the ghcr mirror from the scanned image', () => {
    const step = jobSteps().find(s => s.name === 'Tag and push version tags')
    expect(step).toBeDefined()
    expect(step.run).toContain('docker tag playground:release')
    expect(step.run).toMatch(/docker push .*DOCKERHUB_IMAGE/)
    expect(step.run).toMatch(/docker push .*ghcr_image/)
  })

  it('only pushes the latest tag when is_latest is true', () => {
    const step = jobSteps().find(s => s.name === 'Tag and push latest tag')
    expect(step).toBeDefined()
    expect(step.if).toBe("steps.vars.outputs.is_latest == 'true'")
  })

  it('negative: the latest-tag push step is unconditional nowhere else (only this one step is gated)', () => {
    const steps = jobSteps().filter(s => s.run && s.run.includes(':latest'))
    expect(steps.every(s => s.if === "steps.vars.outputs.is_latest == 'true'")).toBe(true)
  })
})
