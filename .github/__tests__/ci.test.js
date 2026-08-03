import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const CI_YML_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml')

const EXPECTED_JOBS = ['lint', 'lint-css', 'unit-tests', 'build', 'e2e', 'docker-build', 'npm-audit', 'lighthouse', 'trivy']
const NODE_JOBS = ['lint', 'lint-css', 'unit-tests', 'build', 'e2e', 'npm-audit', 'lighthouse']

let workflow
let ciYmlText

beforeAll(() => {
  ciYmlText = fs.readFileSync(CI_YML_PATH, 'utf8')
  workflow = parse(ciYmlText)
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

  it('defines exactly the 9 expected jobs', () => {
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

  it('npm-audit gate step fails on moderate+ production-tree findings via audit-ci, unsilenced', () => {
    const steps = workflow.jobs['npm-audit'].steps
    const gate = steps.find(s => s.run && s.run.includes('audit-ci'))
    expect(gate).toBeDefined()
    expect(gate.run).toContain('--moderate')
    expect(gate.run).toContain('--skip-dev')
    expect(gate['continue-on-error']).toBeUndefined()
    expect(gate.run).not.toContain('|| true')
  })

  it('npm-audit gate step allowlists GHSA-qwww-vcr4-c8h2 (react-router RSC-mode advisory, not reachable by this SPA)', () => {
    const steps = workflow.jobs['npm-audit'].steps
    const gate = steps.find(s => s.run && s.run.includes('audit-ci'))
    expect(gate.run).toContain('--allowlist GHSA-qwww-vcr4-c8h2')
  })

  it('negative: npm-audit gate step allowlists exactly one advisory (guards against silently widening the exception)', () => {
    const steps = workflow.jobs['npm-audit'].steps
    const gate = steps.find(s => s.run && s.run.includes('audit-ci'))
    const ghsaMatches = gate.run.match(/GHSA-/g) || []
    expect(ghsaMatches.length).toBe(1)
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

  it('negative: npm-audit report step does not use audit-ci (plain npm audit is sufficient since this step never fails the job)', () => {
    const steps = workflow.jobs['npm-audit'].steps
    const report = steps.find(s => s.run && s.run.includes('--omit=prod'))
    expect(report.run).not.toContain('audit-ci')
  })

  it('lighthouse job builds the app and runs lhci autorun', () => {
    const runs = stepRuns('lighthouse')
    expect(runs.some(r => r.includes('npm run build'))).toBe(true)
    expect(runs.some(r => r.includes('lhci autorun'))).toBe(true)
  })

  it('lighthouse job installs Chrome before running lhci, and wires its path through CHROME_PATH', () => {
    const steps = workflow.jobs['lighthouse'].steps
    const chromeStepIndex = steps.findIndex(s => s.uses && s.uses.startsWith('browser-actions/setup-chrome'))
    const lhciStepIndex = steps.findIndex(s => s.run && s.run.includes('lhci autorun'))
    expect(chromeStepIndex).toBeGreaterThanOrEqual(0)
    expect(lhciStepIndex).toBeGreaterThan(chromeStepIndex)

    const chromeStep = steps[chromeStepIndex]
    expect(chromeStep.id).toBeTruthy()

    const lhciStep = steps[lhciStepIndex]
    expect(lhciStep.env?.CHROME_PATH).toContain(`steps.${chromeStep.id}.outputs.chrome-path`)
  })

  it('negative: no job other than lighthouse sets up Chrome (it is the only job that launches a browser via lhci)', () => {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (jobName === 'lighthouse') continue
      const steps = job.steps || []
      expect(steps.some(s => s.uses && s.uses.startsWith('browser-actions/setup-chrome')), `${jobName} should not set up Chrome`).toBe(false)
    }
  })

  it('negative: trivy job does not set up Node (it only needs Docker)', () => {
    expect(stepUses('trivy').some(u => u.startsWith('actions/setup-node'))).toBe(false)
  })

  it('trivy job builds the image without pushing', () => {
    const runs = stepRuns('trivy')
    expect(runs.some(r => r.includes('docker build'))).toBe(true)
    expect(runs.some(r => r.includes('docker push'))).toBe(false)
  })

  it('negative: trivy job never logs into a registry', () => {
    expect(stepUses('trivy').some(u => u.includes('login-action'))).toBe(false)
  })

  it('trivy job declares contents:read and security-events:write permissions', () => {
    expect(workflow.jobs['trivy'].permissions).toEqual({ contents: 'read', 'security-events': 'write' })
  })

  it('negative: no other job declares security-events:write', () => {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (jobName === 'trivy') continue
      expect(job.permissions?.['security-events'], `${jobName} should not have security-events permission`).toBeUndefined()
    }
  })

  it('trivy gate step fails on fixable CRITICAL/HIGH findings, unsilenced', () => {
    const steps = workflow.jobs['trivy'].steps
    const gate = steps.find(s => s.uses && s.uses.startsWith('aquasecurity/trivy-action') && s.with.format === 'table')
    expect(gate).toBeDefined()
    expect(gate.with['image-ref']).toBe('playground:ci')
    expect(gate.with.severity).toBe('CRITICAL,HIGH')
    expect(gate.with['ignore-unfixed']).toBe(true)
    expect(String(gate.with['exit-code'])).toBe('1')
    expect(gate['continue-on-error']).toBeUndefined()
    expect(gate.if).toBeUndefined()
  })

  it('negative: trivy gate step severity does not include non-actionable noise', () => {
    const steps = workflow.jobs['trivy'].steps
    const gate = steps.find(s => s.uses && s.uses.startsWith('aquasecurity/trivy-action') && s.with.format === 'table')
    expect(gate.with.severity).not.toMatch(/LOW|MEDIUM|UNKNOWN/)
  })

  it('trivy report step runs always, produces a SARIF file the upload step consumes', () => {
    const steps = workflow.jobs['trivy'].steps
    const report = steps.find(s => s.uses && s.uses.startsWith('aquasecurity/trivy-action') && s.with.format === 'sarif')
    expect(report).toBeDefined()
    expect(report.if).toBe('always()')
    expect(report.with['image-ref']).toBe('playground:ci')
    expect(typeof report.with.output).toBe('string')
    expect(report.with.output.length).toBeGreaterThan(0)

    const upload = steps.find(s => s.uses && s.uses.startsWith('github/codeql-action/upload-sarif'))
    expect(upload).toBeDefined()
    expect(upload.if).toBe('always()')
    expect(upload.with.sarif_file).toBe(report.with.output)
  })

  it('negative: trivy report step does not accidentally narrow severity or skip unfixed findings', () => {
    const steps = workflow.jobs['trivy'].steps
    const report = steps.find(s => s.uses && s.uses.startsWith('aquasecurity/trivy-action') && s.with.format === 'sarif')
    expect(report.with.severity).toBeUndefined()
    expect(report.with['ignore-unfixed']).toBeUndefined()
  })

  // Guards issue #145's `permissions:` finding: 8 of 9 jobs inherited the
  // default GITHUB_TOKEN scope instead of an explicit least-privilege
  // baseline. A workflow-level default plus trivy's own job-level override
  // (already covered above) closes the gap for every job.
  describe('workflow-level permissions (issue #145)', () => {
    it('declares a least-privilege contents:read default for every job', () => {
      expect(workflow.permissions).toEqual({ contents: 'read' })
    })

    it('negative: no job other than trivy declares its own permissions override', () => {
      for (const [jobName, job] of Object.entries(workflow.jobs)) {
        if (jobName === 'trivy') continue
        expect(job.permissions, `${jobName} should rely on the workflow-level default`).toBeUndefined()
      }
    })
  })
})

// Guards issue #145's SHA-pinning finding: a floating tag (`@v4`) can be
// repointed by the action's maintainer (or an attacker who compromises
// their account) without this repo's consent. A commit SHA can't be moved.
function isShaPinned(usesValue) {
  const atIndex = usesValue.lastIndexOf('@')
  if (atIndex === -1) return false
  return /^[0-9a-f]{40}$/i.test(usesValue.slice(atIndex + 1))
}

describe('isShaPinned (validator)', () => {
  it('accepts a 40-character commit SHA pin', () => {
    expect(isShaPinned('actions/checkout@11d5960a326750d5838078e36cf38b85af677262')).toBe(true)
  })

  it('rejects a floating major-version tag', () => {
    expect(isShaPinned('actions/checkout@v4')).toBe(false)
  })

  it('rejects a floating branch reference', () => {
    expect(isShaPinned('actions/checkout@main')).toBe(false)
  })

  it('rejects a value with no ref at all', () => {
    expect(isShaPinned('actions/checkout')).toBe(false)
  })
})

describe('.github/workflows/ci.yml — Action SHA-pinning (issue #145)', () => {
  it('pins every third-party action to a commit SHA, not a floating tag', () => {
    const unpinned = []
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      for (const step of job.steps || []) {
        if (step.uses && !isShaPinned(step.uses)) unpinned.push(`${jobName}: ${step.uses}`)
      }
    }
    expect(unpinned).toEqual([])
  })

  it('carries a human-readable version comment alongside every SHA pin', () => {
    const usesLines = ciYmlText.split('\n').filter(line => /uses:\s*\S+@[0-9a-f]{40}/i.test(line))
    expect(usesLines.length).toBeGreaterThan(0)
    for (const line of usesLines) {
      expect(line, line).toMatch(/#\s*v[\w.]+/)
    }
  })
})

// Guards issue #145's react-router CVE allowlist finding: the allowlist in
// the npm-audit job's gate step had no expiry/re-review mechanism, risking
// "allowlisted" silently being read as "resolved" forever. A dated marker
// plus this age check means the entry can't calcify unnoticed — either the
// tracked React 19 + react-router 8 upgrade (docs/ENHANCEMENTS.md) lands and
// removes the allowlist, or this test starts failing and forces a look.
const ALLOWLIST_MAX_AGE_DAYS = 180

function daysSince(dateStr, now) {
  const from = new Date(`${dateStr}T00:00:00Z`)
  return Math.floor((now.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

function isAllowlistEntryStale(dateStr, now, maxDays = ALLOWLIST_MAX_AGE_DAYS) {
  return daysSince(dateStr, now) > maxDays
}

describe('isAllowlistEntryStale (validator)', () => {
  it('is not stale a few days after being added', () => {
    expect(isAllowlistEntryStale('2026-01-01', new Date('2026-01-10T00:00:00Z'))).toBe(false)
  })

  it('is not stale exactly at the max-age boundary', () => {
    expect(isAllowlistEntryStale('2026-01-01', new Date('2026-06-30T00:00:00Z'), 180)).toBe(false)
  })

  it('is stale once past the max-age boundary', () => {
    expect(isAllowlistEntryStale('2026-01-01', new Date('2026-07-01T00:00:00Z'), 180)).toBe(true)
  })

  it('is stale a year after being added', () => {
    expect(isAllowlistEntryStale('2026-01-01', new Date('2027-01-02T00:00:00Z'))).toBe(true)
  })
})

describe('react-router CVE allowlist re-review (issue #145)', () => {
  it('records a dated marker for when the allowlist entry was added', () => {
    const match = ciYmlText.match(/Allowlist entry added:\s*(\d{4}-\d{2}-\d{2})/)
    expect(match).not.toBeNull()
  })

  it('has not gone stale — fails once the entry is more than 180 days old, forcing a re-review or the tracked React 19 upgrade', () => {
    const match = ciYmlText.match(/Allowlist entry added:\s*(\d{4}-\d{2}-\d{2})/)
    expect(isAllowlistEntryStale(match[1], new Date())).toBe(false)
  })
})
