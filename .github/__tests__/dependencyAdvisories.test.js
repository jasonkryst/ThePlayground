// @vitest-environment node
//
// Guards the 2026-11-11 Dependabot alert triage (see SECURITY.md → Dependency
// policy → "Dev-tree advisories"). Reads the committed package-lock.json, so
// it checks what `npm ci` actually installs, not just the declared ranges.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
const lock = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf8'))
const securityMd = fs.readFileSync(path.join(REPO_ROOT, 'SECURITY.md'), 'utf8')

/** Every installed copy of `name` in the lockfile: [{ at, version, dev }]. */
function installed(name) {
  return Object.entries(lock.packages)
    .filter(([key]) => key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`))
    .map(([at, meta]) => ({ at, version: meta.version, dev: meta.dev === true }))
}

/** Numeric x.y.z comparison (no prerelease handling needed for these packages). */
function cmp(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}
const inRange = (v, min, maxExclusive) => cmp(v, min) >= 0 && cmp(v, maxExclusive) < 0

describe('cmp (validator)', () => {
  it('orders by major, then minor, then patch', () => {
    expect(cmp('6.16.1', '6.15.9')).toBeGreaterThan(0)
    expect(cmp('11.1.1', '9.0.1')).toBeGreaterThan(0)
    expect(cmp('1.2.3', '1.2.3')).toBe(0)
  })
  it('negative: does not compare lexically ("10" > "9")', () => {
    expect(cmp('9.0.1', '10.0.0')).toBeLessThan(0)
  })
})

describe('fixed advisories stay fixed (package-lock.json)', () => {
  it('qs is installed somewhere (the check below is not vacuous)', () => {
    expect(installed('qs').length).toBeGreaterThan(0)
  })

  it('negative: no qs copy is in GHSA-q8mj-m7cp-5q26 / GHSA-6pq8-jhm2-2vcw ranges (6.7.0 – 6.16.0)', () => {
    for (const { at, version } of installed('qs')) {
      expect(inRange(version, '6.7.0', '6.16.1'), `${at}@${version}`).toBe(false)
    }
  })

  it('uuid is installed somewhere (the check below is not vacuous)', () => {
    expect(installed('uuid').length).toBeGreaterThan(0)
  })

  it('negative: no uuid copy is in a GHSA-w5hq-g745-h8pq range (<11.1.1, 12.0.0, 13.0.0)', () => {
    for (const { at, version } of installed('uuid')) {
      const vulnerable =
        cmp(version, '11.1.1') < 0 || inRange(version, '12.0.0', '12.0.1') || inRange(version, '13.0.0', '13.0.1')
      expect(vulnerable, `${at}@${version}`).toBe(false)
    }
  })

  it('package.json overrides force patched qs and uuid', () => {
    expect(pkg.overrides?.qs).toBe('^6.16.2')
    expect(pkg.overrides?.['@storybook/addon-actions']?.uuid).toBe('^11.1.1')
  })

  it('negative: the uuid override is scoped to @storybook/addon-actions, not global (other consumers already use a newer major)', () => {
    expect(pkg.overrides?.uuid).toBeUndefined()
  })

  it('negative: no glob copy is in the GHSA-3g3m-2fjr-6pw4 range (9.0.0 – 14.0.1)', () => {
    const copies = installed('glob')
    expect(copies.length).toBeGreaterThan(0)
    for (const { at, version } of copies) {
      expect(inRange(version, '9.0.0', '14.0.2'), `${at}@${version}`).toBe(false)
    }
  })

  it('glob is overridden to ^14.0.2 for exactly its two affected consumers (workbox-build, docgen-typescript)', () => {
    expect(pkg.overrides?.['workbox-build']?.glob).toBe('^14.0.2')
    expect(pkg.overrides?.['@joshwooding/vite-plugin-react-docgen-typescript']?.glob).toBe('^14.0.2')
  })

  it('negative: glob is not overridden globally (glob 7 consumers predate the advisory and use a different API)', () => {
    expect(pkg.overrides?.glob).toBeUndefined()
  })

  it('negative: no basic-ftp copy is in the GHSA-c475-qrg2-pj4r range (<= 6.2.0)', () => {
    const copies = installed('basic-ftp')
    expect(copies.length).toBeGreaterThan(0)
    for (const { at, version } of copies) {
      expect(cmp(version, '6.2.1') < 0, `${at}@${version}`).toBe(false)
    }
  })

  it('negative: no colord copy is in the GHSA-2wm5-q62r-hmrv range (< 2.9.4)', () => {
    const copies = installed('colord')
    expect(copies.length).toBeGreaterThan(0)
    for (const { at, version } of copies) {
      expect(cmp(version, '2.9.4') < 0, `${at}@${version}`).toBe(false)
    }
  })
})

describe('dismissed advisories: rationale still holds', () => {
  // GHSA-g3hv-75wg-m249 (minimatch) and GHSA-gcqx-w48m-w2h4 (deepmerge) were
  // dismissed as tolerable risk because both are dev/build-only and only see
  // patterns/options from this repo's own config. If either ever ships in the
  // production tree, that reasoning is void — fail and force a re-review.
  it.each(['minimatch', 'deepmerge'])('negative: %s is never a production dependency', name => {
    const copies = installed(name)
    expect(copies.length).toBeGreaterThan(0)
    for (const { at, version, dev } of copies) {
      expect(dev, `${at}@${version} is in the production tree`).toBe(true)
    }
  })

  it('negative: the only minimatch copy still in the GHSA-g3hv-75wg-m249 range (7.0.0 – 11.0.0) is Stryker’s own', () => {
    // glob 14 moved workbox's and docgen's paths to minimatch 11; Stryker pins
    // ~10.2.4 directly. A new vulnerable copy anywhere else means a new
    // consumer to fix, not one already covered by the dismissal.
    const vulnerable = installed('minimatch').filter(({ version }) => inRange(version, '7.0.0', '11.0.1'))
    expect(vulnerable.map(c => c.at)).toEqual(['node_modules/@stryker-mutator/core/node_modules/minimatch'])
  })

  it.each(['GHSA-g3hv-75wg-m249', 'GHSA-gcqx-w48m-w2h4'])('SECURITY.md documents the %s dismissal', ghsa => {
    expect(securityMd).toContain(ghsa)
  })
})
