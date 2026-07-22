import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const CI_YML_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml')

const EXPECTED_JOBS = ['lint', 'lint-css', 'unit-tests', 'build', 'e2e', 'docker-build', 'npm-audit', 'lighthouse']
const NODE_JOBS = ['lint', 'lint-css', 'unit-tests', 'build', 'e2e', 'npm-audit', 'lighthouse']

let workflow

beforeAll(() => {
  const raw = fs.readFileSync(CI_YML_PATH, 'utf8')
  workflow = parse(raw)
})

function stepRuns(jobName) {
  return (workflow.jobs[jobName].steps || []).map(s => s.run).filter(Boolean)
}

function stepUses(jobName) {
  return (workflow.jobs[jobName].steps || []).map(s => s.uses).filter(Boolean)
}

describe('.github/workflows/ci.yml', () => {
  it('triggers on push to main only', () => {
    expect(workflow.on.push.branches).toEqual(['main'])
  })

  it('triggers on pull_request to main only', () => {
    expect(workflow.on.pull_request.branches).toEqual(['main'])
  })

  it('negative: push trigger is not branch-unscoped (which would mean every branch)', () => {
    expect(Array.isArray(workflow.on.push.branches)).toBe(true)
    expect(workflow.on.push.branches.length).toBeGreaterThan(0)
  })

  it('defines exactly the 8 expected jobs', () => {
    expect(Object.keys(workflow.jobs).sort()).toEqual([...EXPECTED_JOBS].sort())
  })

  it.each(EXPECTED_JOBS)('%s job runs on ubuntu-latest', (jobName) => {
    expect(workflow.jobs[jobName]['runs-on']).toBe('ubuntu-latest')
  })

  it.each(NODE_JOBS)('%s job pins Node to version 24 with npm caching', (jobName) => {
    const setupNodeStep = (workflow.jobs[jobName].steps || []).find(
      s => s.uses && s.uses.startsWith('actions/setup-node')
    )
    expect(setupNodeStep).toBeDefined()
    expect(String(setupNodeStep.with['node-version'])).toBe('24')
    expect(setupNodeStep.with.cache).toBe('npm')
  })

  it('lint job runs npm run lint', () => {
    expect(stepRuns('lint').some(r => r.includes('npm run lint'))).toBe(true)
  })

  it('lint-css job runs npm run lint:css', () => {
    expect(stepRuns('lint-css').some(r => r.includes('npm run lint:css'))).toBe(true)
  })

  it('unit-tests job runs npm run coverage', () => {
    expect(stepRuns('unit-tests').some(r => r.includes('npm run coverage'))).toBe(true)
  })

  it('unit-tests job uploads the coverage report as an artifact', () => {
    const uploadStep = (workflow.jobs['unit-tests'].steps || []).find(
      s => s.uses && s.uses.startsWith('actions/upload-artifact')
    )
    expect(uploadStep).toBeDefined()
    expect(uploadStep.with.path).toBe('coverage/')
  })

  it('build job runs npm run build', () => {
    expect(stepRuns('build').some(r => r.includes('npm run build'))).toBe(true)
  })

  it('e2e job installs Playwright browsers and runs npm run e2e', () => {
    const runs = stepRuns('e2e')
    expect(runs.some(r => r.includes('playwright install'))).toBe(true)
    expect(runs.some(r => r.includes('npm run e2e'))).toBe(true)
  })

  it('e2e job uploads the Playwright report only on failure', () => {
    const uploadStep = (workflow.jobs['e2e'].steps || []).find(
      s => s.uses && s.uses.startsWith('actions/upload-artifact')
    )
    expect(uploadStep).toBeDefined()
    expect(uploadStep.if).toBe('failure()')
  })

  it('docker-build job builds the Dockerfile without pushing', () => {
    const runs = stepRuns('docker-build')
    expect(runs.some(r => r.includes('docker build'))).toBe(true)
    expect(runs.some(r => r.includes('docker push'))).toBe(false)
  })

  it('negative: docker-build job never logs into a registry', () => {
    expect(stepUses('docker-build').some(u => u.includes('login-action'))).toBe(false)
  })

  it('npm-audit gate step fails on moderate+ production-tree findings, unsilenced', () => {
    const steps = workflow.jobs['npm-audit'].steps
    const gate = steps.find(s => s.run && s.run.includes('--omit=dev'))
    expect(gate).toBeDefined()
    expect(gate.run).toContain('--audit-level=moderate')
    expect(gate['continue-on-error']).toBeUndefined()
    expect(gate.run).not.toContain('|| true')
  })

  it('npm-audit report step covers the dev tree, always runs, and never fails the job', () => {
    const steps = workflow.jobs['npm-audit'].steps
    const report = steps.find(s => s.run && s.run.includes('--omit=prod'))
    expect(report).toBeDefined()
    expect(report.if).toBe('always()')
    expect(report.run).toContain('|| true')
    expect(report.run).toContain('GITHUB_STEP_SUMMARY')
  })

  it('negative: npm-audit report step has no audit-level flag that could fail it', () => {
    const steps = workflow.jobs['npm-audit'].steps
    const report = steps.find(s => s.run && s.run.includes('--omit=prod'))
    expect(report.run).not.toContain('--audit-level')
  })

  it('lighthouse job builds the app and runs lhci autorun', () => {
    const runs = stepRuns('lighthouse')
    expect(runs.some(r => r.includes('npm run build'))).toBe(true)
    expect(runs.some(r => r.includes('lhci autorun'))).toBe(true)
  })
})
