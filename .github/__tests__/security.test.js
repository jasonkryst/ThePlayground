import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const SECURITY_YML_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'security.yml')

const EXPECTED_JOBS = ['codeql', 'trivy-fs']

let workflow
let securityYmlText

beforeAll(() => {
  securityYmlText = fs.readFileSync(SECURITY_YML_PATH, 'utf8')
  workflow = parse(securityYmlText)
})

function stepUses(jobName) {
  return (workflow.jobs[jobName].steps || []).map(s => s.uses).filter(Boolean)
}

describe('.github/workflows/security.yml', () => {
  it('triggers on push to main', () => {
    expect(workflow.on.push.branches).toEqual(['main'])
  })

  it('triggers on pull_request to main', () => {
    expect(workflow.on.pull_request.branches).toEqual(['main'])
  })

  it('triggers on a weekly schedule', () => {
    expect(Array.isArray(workflow.on.schedule)).toBe(true)
    expect(workflow.on.schedule.length).toBeGreaterThan(0)
    expect(workflow.on.schedule[0].cron).toMatch(/^\d[\d*/ ,]+$/)
  })

  it('defines exactly the 2 expected jobs', () => {
    expect(Object.keys(workflow.jobs).sort()).toEqual([...EXPECTED_JOBS].sort())
  })

  it.each(EXPECTED_JOBS)('%s job runs on ubuntu-latest', (jobName) => {
    expect(workflow.jobs[jobName]['runs-on']).toBe('ubuntu-latest')
  })

  it('declares a least-privilege contents:read workflow-level default', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' })
  })

  it.each(EXPECTED_JOBS)('%s job declares contents:read and security-events:write', (jobName) => {
    expect(workflow.jobs[jobName].permissions).toEqual({
      contents: 'read',
      'security-events': 'write',
    })
  })

  describe('codeql job', () => {
    it('checks out the repository', () => {
      expect(stepUses('codeql').some(u => u.startsWith('actions/checkout'))).toBe(true)
    })

    it('initializes CodeQL for JavaScript', () => {
      const steps = workflow.jobs['codeql'].steps
      const initStep = steps.find(s => s.uses && s.uses.startsWith('github/codeql-action/init'))
      expect(initStep).toBeDefined()
      expect(initStep.with.languages).toBe('javascript')
    })

    it('runs autobuild after init and before analyze', () => {
      const steps = workflow.jobs['codeql'].steps
      const initIdx = steps.findIndex(s => s.uses && s.uses.startsWith('github/codeql-action/init'))
      const buildIdx = steps.findIndex(s => s.uses && s.uses.startsWith('github/codeql-action/autobuild'))
      const analyzeIdx = steps.findIndex(s => s.uses && s.uses.startsWith('github/codeql-action/analyze'))
      expect(initIdx).toBeGreaterThanOrEqual(0)
      expect(buildIdx).toBeGreaterThan(initIdx)
      expect(analyzeIdx).toBeGreaterThan(buildIdx)
    })

    it('analyze step sets a language category', () => {
      const steps = workflow.jobs['codeql'].steps
      const analyzeStep = steps.find(s => s.uses && s.uses.startsWith('github/codeql-action/analyze'))
      expect(analyzeStep).toBeDefined()
      expect(analyzeStep.with.category).toMatch(/javascript/)
    })

    it('negative: codeql job does not set up Node (CodeQL operates on source, not a build artifact)', () => {
      expect(stepUses('codeql').some(u => u.startsWith('actions/setup-node'))).toBe(false)
    })

    it('negative: codeql job does not use Trivy', () => {
      expect(stepUses('codeql').some(u => u.startsWith('aquasecurity/trivy-action'))).toBe(false)
    })
  })

  describe('trivy-fs job', () => {
    it('gate step scans the filesystem, not a Docker image', () => {
      const steps = workflow.jobs['trivy-fs'].steps
      const gate = steps.find(s => s.uses && s.uses.startsWith('aquasecurity/trivy-action') && s.with.format === 'table')
      expect(gate).toBeDefined()
      expect(gate.with['scan-type']).toBe('fs')
      expect(gate.with['scan-ref']).toBe('.')
    })

    it('gate step fails on fixable CRITICAL/HIGH findings, unsilenced', () => {
      const steps = workflow.jobs['trivy-fs'].steps
      const gate = steps.find(s => s.uses && s.uses.startsWith('aquasecurity/trivy-action') && s.with.format === 'table')
      expect(gate.with.severity).toBe('CRITICAL,HIGH')
      expect(gate.with['ignore-unfixed']).toBe(true)
      expect(String(gate.with['exit-code'])).toBe('1')
      expect(gate['continue-on-error']).toBeUndefined()
      expect(gate.if).toBeUndefined()
    })

    it('negative: gate step severity does not include non-actionable noise', () => {
      const steps = workflow.jobs['trivy-fs'].steps
      const gate = steps.find(s => s.uses && s.uses.startsWith('aquasecurity/trivy-action') && s.with.format === 'table')
      expect(gate.with.severity).not.toMatch(/LOW|MEDIUM|UNKNOWN/)
    })

    it('report step always runs, scans the filesystem, and produces a SARIF file', () => {
      const steps = workflow.jobs['trivy-fs'].steps
      const report = steps.find(s => s.uses && s.uses.startsWith('aquasecurity/trivy-action') && s.with.format === 'sarif')
      expect(report).toBeDefined()
      expect(report.if).toBe('always()')
      expect(report.with['scan-type']).toBe('fs')
      expect(report.with['scan-ref']).toBe('.')
      expect(typeof report.with.output).toBe('string')
      expect(report.with.output.length).toBeGreaterThan(0)
    })

    it('negative: report step does not narrow severity or skip unfixed findings', () => {
      const steps = workflow.jobs['trivy-fs'].steps
      const report = steps.find(s => s.uses && s.uses.startsWith('aquasecurity/trivy-action') && s.with.format === 'sarif')
      expect(report.with.severity).toBeUndefined()
      expect(report.with['ignore-unfixed']).toBeUndefined()
    })

    it('upload step always runs and consumes the SARIF file the report step produces', () => {
      const steps = workflow.jobs['trivy-fs'].steps
      const report = steps.find(s => s.uses && s.uses.startsWith('aquasecurity/trivy-action') && s.with.format === 'sarif')
      const upload = steps.find(s => s.uses && s.uses.startsWith('github/codeql-action/upload-sarif'))
      expect(upload).toBeDefined()
      expect(upload.if).toBe('always()')
      expect(upload.with.sarif_file).toBe(report.with.output)
    })

    it('upload step sets a category to distinguish this scan from the container scan in ci.yml', () => {
      const steps = workflow.jobs['trivy-fs'].steps
      const upload = steps.find(s => s.uses && s.uses.startsWith('github/codeql-action/upload-sarif'))
      expect(typeof upload.with.category).toBe('string')
      expect(upload.with.category.length).toBeGreaterThan(0)
    })

    it('negative: trivy-fs job does not build Docker', () => {
      const runs = (workflow.jobs['trivy-fs'].steps || []).map(s => s.run).filter(Boolean)
      expect(runs.some(r => r.includes('docker build'))).toBe(false)
    })
  })
})

// Same SHA-pinning guard as ci.test.js — every action reference must use a
// 40-character commit SHA and carry a human-readable version comment.
function isShaPinned(usesValue) {
  const atIndex = usesValue.lastIndexOf('@')
  if (atIndex === -1) return false
  return /^[0-9a-f]{40}$/i.test(usesValue.slice(atIndex + 1))
}

describe('.github/workflows/security.yml — Action SHA-pinning', () => {
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
    const usesLines = securityYmlText.split('\n').filter(line => /uses:\s*\S+@[0-9a-f]{40}/i.test(line))
    expect(usesLines.length).toBeGreaterThan(0)
    for (const line of usesLines) {
      expect(line, line).toMatch(/#\s*v[\w.]+/)
    }
  })
})
