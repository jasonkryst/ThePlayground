# CI Pipeline, npm audit Gate, and Lighthouse Budgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions CI workflow (issue #88) that runs the six local testing layers plus a Docker build check on every push to `main` and every PR; gate merges on an `npm audit` production-tree finding (issue #87, moderate+ fails, dev tree is report-only); and score four routes with Lighthouse CI (issue #88) at a hard `error` floor of 0.8 across all four categories.

**Architecture:** One new workflow file, `.github/workflows/ci.yml`, with 8 independent parallel jobs (no `needs:` between them). A new `lighthouserc.json` at the repo root configures `@lhci/cli`, which manages its own `vite preview` server via `startServerCommand` rather than the workflow YAML backgrounding a process manually. Two new static config tests (`.github/__tests__/ci.test.js`, `.github/__tests__/lighthouserc.test.js`) parse the YAML/JSON and assert their shape — mirroring this repo's existing `nginx/__tests__/securityHeaders.test.js` pattern, where a static test proves configuration shape and the config's real runtime behavior is proven live (here, by the workflow actually running in Actions on every push).

**Tech Stack:** GitHub Actions, `@lhci/cli` (new devDependency), `yaml` (new devDependency, for parsing `ci.yml` in tests), Vitest (existing, runs the two new static config tests), Docker (already used by `Dockerfile`/`docker-image.yml`/`e2e/nginx-headers.spec.js`).

**Design doc:** `docs/superpowers/specs/2026-07-22-ci-pipeline-design.md`

## Global Constraints

- Workflow triggers: `push.branches: [main]` and `pull_request.branches: [main]` only — never all-branch pushes.
- 8 jobs, exact names: `lint`, `lint-css`, `unit-tests`, `build`, `e2e`, `docker-build`, `npm-audit`, `lighthouse`. All run on `ubuntu-latest`. No `needs:` between any of them.
- Every job that runs Node code uses `actions/setup-node@v4` with `node-version: 24` (matches the Dockerfile's `node:24-alpine` pin) and `cache: npm`. `docker-build` is the only job that doesn't need Node.
- `npm-audit` gate step: `npm audit --omit=dev --audit-level=moderate`, no `continue-on-error`, must actually fail the job on moderate+ findings.
- `npm-audit` report step: `npm audit --omit=prod`, output piped to `$GITHUB_STEP_SUMMARY`, its own exit code always masked so it never fails the job — needs `if: always()` so it still runs after the gate step fails.
- `docker-build` job: `docker build` only, never `docker push`, never a registry login step — that stays exclusive to `.github/workflows/docker-image.yml`'s release trigger.
- Lighthouse: routes are exactly `http://localhost:4173/`, `http://localhost:4173/game/animal-sounds`, `http://localhost:4173/parent`, `http://localhost:4173/my-progress`; all 4 Lighthouse categories (`performance`, `accessibility`, `best-practices`, `seo`) assert `["error", { "minScore": 0.8 }]`; server is `vite preview` (production build) via `startServerCommand`, not the dev server.
- No new GitHub Actions secrets and no elevated `permissions:` block — every job only needs default `contents: read`.
- Version bump: `0.32.4` → `0.33.0` (minor — new capability, matching this repo's convention of a minor bump for `### Added` CHANGELOG entries).

---

### Task 1: `.github/workflows/ci.yml` + static structure test

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/__tests__/ci.test.js`
- Modify: `package.json` (add `yaml` devDependency)

**Interfaces:**
- Produces: the workflow file itself — no other task in this plan reads it programmatically (Task 2's `lighthouserc.json` is referenced *by* `ci.yml`'s `lighthouse` job, but `lighthouserc.json`'s own existence isn't required for this task's test to pass, since the test only checks the job's `run:` string, not that the file exists).

- [ ] **Step 1: Add the `yaml` devDependency**

Run: `npm install --save-dev yaml`
Expected: `package.json`'s `devDependencies` gains a `"yaml": "^<version>"` entry; `package-lock.json` updates.

- [ ] **Step 2: Write the failing static test**

Create `.github/__tests__/ci.test.js`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run .github/__tests__/ci.test.js`
Expected: FAIL with an `ENOENT` error reading `.github/workflows/ci.yml` (the file doesn't exist yet).

- [ ] **Step 4: Create the workflow file**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint

  lint-css:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint:css

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run coverage
      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/

  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t playground:ci .

  npm-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Production dependency audit (gate)
        run: npm audit --omit=dev --audit-level=moderate
      - name: Dev dependency audit (report-only)
        if: always()
        run: |
          npm audit --omit=prod > audit-dev.txt || true
          {
            echo "### npm audit — dev dependencies (report-only, does not fail CI)"
            echo '```'
            cat audit-dev.txt
            echo '```'
          } >> "$GITHUB_STEP_SUMMARY"

  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npx lhci autorun
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run .github/__tests__/ci.test.js`
Expected: PASS (all assertions green).

- [ ] **Step 6: Lint the new test file**

Run: `npm run lint`
Expected: PASS — no ESLint errors in `.github/__tests__/ci.test.js` (it follows the same explicit-import pattern as `nginx/__tests__/securityHeaders.test.js`, so no `no-undef` issues with `describe`/`it`/`expect`).

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ci.yml .github/__tests__/ci.test.js package.json package-lock.json
git commit -m "feat(88): add CI workflow running lint, tests, build, e2e, and Docker build checks"
```

---

### Task 2: `lighthouserc.json` + static structure test

**Files:**
- Create: `lighthouserc.json`
- Create: `.github/__tests__/lighthouserc.test.js`
- Modify: `package.json` (add `@lhci/cli` devDependency)

**Interfaces:**
- Produces: `lighthouserc.json`, read by Task 1's `ci.yml` `lighthouse` job at `npx lhci autorun` time (already written; no change needed there since it just reads whatever `lighthouserc.json` says).

- [ ] **Step 1: Add the `@lhci/cli` devDependency**

Run: `npm install --save-dev @lhci/cli`
Expected: `package.json`'s `devDependencies` gains `"@lhci/cli": "^<version>"`; `package-lock.json` updates.

- [ ] **Step 2: Write the failing static test**

Create `.github/__tests__/lighthouserc.test.js`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run .github/__tests__/lighthouserc.test.js`
Expected: FAIL with an `ENOENT` error reading `lighthouserc.json` (the file doesn't exist yet).

- [ ] **Step 4: Create `lighthouserc.json`**

Create `lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "npm run preview -- --port 4173",
      "startServerReadyPattern": "Local:",
      "url": [
        "http://localhost:4173/",
        "http://localhost:4173/game/animal-sounds",
        "http://localhost:4173/parent",
        "http://localhost:4173/my-progress"
      ],
      "numberOfRuns": 1
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.8 }],
        "categories:accessibility": ["error", { "minScore": 0.8 }],
        "categories:best-practices": ["error", { "minScore": 0.8 }],
        "categories:seo": ["error", { "minScore": 0.8 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run .github/__tests__/lighthouserc.test.js`
Expected: PASS (all assertions green).

- [ ] **Step 6: Verify `lhci autorun` actually works against this repo, locally**

Run: `npm run build && npx lhci autorun`
Expected: lhci builds nothing itself (build already ran), starts `vite preview` on port 4173 per `startServerCommand`, waits for the "Local:" line, runs Lighthouse against all 4 routes, prints a pass/fail table, and exits 0 if every category clears 0.8 on this machine. If any route scores below 0.8, read the printed report link/JSON output to see which category and why before deciding whether to adjust the app or (only with real justification, not by default) the threshold — do not lower the threshold reflexively.

- [ ] **Step 7: Commit**

```bash
git add lighthouserc.json .github/__tests__/lighthouserc.test.js package.json package-lock.json
git commit -m "feat(88): add Lighthouse CI budgets for dashboard, game, parent, and progress routes"
```

---

### Task 3: `docs/TESTING.md` — document the CI pipeline

**Files:**
- Modify: `docs/TESTING.md` (insert after the "Mutation testing (Stryker)" section, before "i18n string convention" — i.e., after line 138 in the current file)

- [ ] **Step 1: Insert the new section**

In `docs/TESTING.md`, find this line (currently line 139, a blank line right before `## i18n string convention`):

```
## i18n string convention
```

Insert the following section directly above it:

```markdown
## Continuous Integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request targeting `main`, as 8 independent parallel jobs (no job waits on another):

- **`lint`** / **`lint-css`** — `npm run lint`, `npm run lint:css`.
- **`unit-tests`** — `npm run coverage`; uploads the `coverage/` report as a build artifact on every run.
- **`build`** — `npm run build`, proving the production Vite bundle still compiles.
- **`e2e`** — installs Playwright's Chromium browser, then `npm run e2e` (all six local layers that live under `e2e/`, including the live Docker-based nginx header checks, since GitHub-hosted runners ship Docker). Uploads `playwright-report/` and `test-results/` only when something fails.
- **`docker-build`** — `docker build` against the repo's `Dockerfile` (build-only, no push, no registry login — publishing an image on release is `.github/workflows/docker-image.yml`'s job, not CI's).
- **`npm-audit`** — two-tier `npm audit` gate, see below.
- **`lighthouse`** — Lighthouse CI budgets, see below.

**`npm audit` gate:** `npm audit --omit=dev --audit-level=moderate` fails the job (and therefore the PR check) on moderate/high/critical findings in the *production* dependency tree. A separate `npm audit --omit=prod` step always runs (even if the gate step failed) and never fails the job itself — its output is appended to the workflow run's own step summary, so *dev*-tree findings (like the 3 moderate Storybook-chain advisories noted in `SECURITY.md`) stay visible without blocking a merge.

**Lighthouse budgets:** `lighthouserc.json` (repo root) drives `@lhci/cli` against a real production build — `npm run build` then `vite preview` (not the dev server, so scores reflect the minified/bundled app that actually ships). Four routes are scored: the dashboard (`/`), a representative game (`/game/animal-sounds`), the parent analytics dashboard (`/parent`), and the kid-facing progress page (`/my-progress`). All four Lighthouse categories — performance, accessibility, best-practices, SEO — must score at least 0.8 or the job fails; each run's actual report is uploaded to Lighthouse's temporary public storage (link printed in the job log), so a score drifting down toward 0.8 is visible before it ever crosses the line.

Both new workflow-adjacent config files have their own static structure tests — `.github/__tests__/ci.test.js` parses `ci.yml` and asserts its trigger scope, job set, and the audit gate's exact flags; `.github/__tests__/lighthouserc.test.js` asserts the 4 routes and 4 category thresholds. Like the nginx security-header tests, these prove the *configuration's shape* — the configuration's real behavior is proven every time the workflow actually runs in Actions.

```

- [ ] **Step 2: Sanity-check the insertion**

Run: `grep -n "^## " docs/TESTING.md`
Expected: the heading list now reads `Static linting…`, `Layer 1…` through `Layer 6…`, `Mutation testing (Stryker)`, **`Continuous Integration`**, `i18n string convention`, in that order.

- [ ] **Step 3: Commit**

```bash
git add docs/TESTING.md
git commit -m "docs(87,88): document the CI pipeline, npm audit gate, and Lighthouse budgets"
```

---

### Task 4: `docs/ENHANCEMENTS.md` — close out the three backlog bullets

**Files:**
- Modify: `docs/ENHANCEMENTS.md` (lines 78, 80, 85-86 in the current file)

- [ ] **Step 1: Strike through the npm-audit-in-CI bullet (currently line 78)**

Find:

```
- **`npm audit` in CI** — dependency vulnerabilities are currently caught only when someone runs the audit manually; a CI gate makes it continuous. Gate on `--omit=dev` (fail on production-tree findings; report-only for the dev tree — the 2026-07-12 audit found the prod tree clean and 3 moderate dev-only advisories in the Storybook 8 chain, SEC-6, not worth a breaking downgrade). (Depends on the CI pipeline below.)
```

Replace with:

```
- ~~**`npm audit` in CI**~~ — done (issue #87): `npm audit --omit=dev --audit-level=moderate` gates the `npm-audit` job in `.github/workflows/ci.yml` on moderate+ production-tree findings; a separate `--omit=prod` step reports dev-tree findings (like the 3 moderate Storybook-chain advisories, SEC-6) to the run's step summary without ever failing the job. See `docs/TESTING.md` § Continuous Integration.
```

- [ ] **Step 2: Update the image-scanning bullet's blocking clause (currently line 80)**

Find:

```
- **Image vulnerability scanning (SEC-4 remainder)** — add automated scanning (e.g. Trivy) once a CI pipeline exists to run it.
```

Replace with:

```
- **Image vulnerability scanning (SEC-4 remainder)** — add automated scanning (e.g. Trivy); the CI pipeline this was blocked on now exists (`.github/workflows/ci.yml`, issue #88), so this is unblocked but still not implemented.
```

- [ ] **Step 3: Strike through both "Testing Layers" bullets (currently lines 85-86)**

Find:

```
- **CI pipeline** — GitHub Actions workflow running `npm run lint`, `npm run lint:css`, `npm test`, `npm run build`, `npm run e2e`, and the Docker build on every push; today the six local layers only protect a developer who remembers to run them.
- **Lighthouse budgets in CI** — automated performance/accessibility scoring per route with regression thresholds; complements axe (which checks violations, not degradation trends). (Depends on the CI pipeline.)
```

Replace with:

```
- ~~**CI pipeline**~~ — done (issue #88): `.github/workflows/ci.yml` runs lint, lint:css, unit tests (with coverage), the production build, the full e2e suite, and a Docker build check, on every push to `main` and every PR. See `docs/TESTING.md` § Continuous Integration.
- ~~**Lighthouse budgets in CI**~~ — done (issue #88): `lighthouserc.json` scores the dashboard, a representative game, `/parent`, and `/my-progress` against a real production build, failing the `lighthouse` job if any of performance/accessibility/best-practices/SEO drops below 0.8. See `docs/TESTING.md` § Continuous Integration.
```

- [ ] **Step 4: Sanity-check the edits**

Run: `grep -n "npm audit\|CI pipeline\|Lighthouse budgets\|Image vulnerability scanning" docs/ENHANCEMENTS.md`
Expected: the npm-audit, CI-pipeline, and Lighthouse-budgets lines all now start with `- ~~`; the image-scanning line still starts with `- **` (not struck — it's still open) and no longer says "once a CI pipeline exists."

- [ ] **Step 5: Commit**

```bash
git add docs/ENHANCEMENTS.md
git commit -m "docs(87,88): close out CI pipeline, npm audit, and Lighthouse backlog items"
```

---

### Task 5: `SECURITY.md` — update the dependency-policy section

**Files:**
- Modify: `SECURITY.md` (lines 80 and 85 in the current file)

- [ ] **Step 1: Update the hardening-backlog line (currently line 80)**

Find:

```
- **Hardening backlog** (tracked in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md#security)): automated image vulnerability scanning (Trivy), once a CI pipeline exists to run it.
```

Replace with:

```
- **Hardening backlog** (tracked in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md#security)): automated image vulnerability scanning (Trivy) — the CI pipeline this was blocked on now exists (issue #88), but the scan itself isn't implemented yet.
```

- [ ] **Step 2: Update the "npm audit is run manually" line (currently line 85)**

Find:

```
- `npm audit` is run manually today; wiring it (and the rest of the test suite) into CI is a tracked enhancement.
```

Replace with:

```
- **`npm audit` runs in CI on every push/PR (issue #87):** `.github/workflows/ci.yml`'s `npm-audit` job fails on moderate+ severity findings in the production dependency tree (`--omit=dev --audit-level=moderate`); findings in the dev-only tree (e.g. the Storybook 8 chain's 3 moderate advisories, SEC-6) are reported to the run's step summary but never block a merge.
```

- [ ] **Step 3: Sanity-check the edits**

Run: `grep -n "npm audit\|CI pipeline\|Trivy" SECURITY.md`
Expected: no remaining occurrence of the phrase "is run manually today" or "once a CI pipeline exists."

- [ ] **Step 4: Commit**

```bash
git add SECURITY.md
git commit -m "docs(87): describe the CI-gated npm audit in the dependency policy"
```

---

### Task 6: `README.md` — CI badge and testing-section mention

**Files:**
- Modify: `README.md` (line 1-3 area, and line 287)

- [ ] **Step 1: Add a CI status badge below the title**

Find (currently lines 1-3):

```
# The Playground

A browser-based game dashboard designed for infants and toddlers. Games are displayed as large, tappable cards. Each game is self-contained in its own folder — adding a new game requires no changes to the core application.
```

Replace with:

```
# The Playground

[![CI](https://github.com/jasonkryst/ThePlayground/actions/workflows/ci.yml/badge.svg)](https://github.com/jasonkryst/ThePlayground/actions/workflows/ci.yml)

A browser-based game dashboard designed for infants and toddlers. Games are displayed as large, tappable cards. Each game is self-contained in its own folder — adding a new game requires no changes to the core application.
```

- [ ] **Step 2: Note CI coverage in the Testing section**

Find (currently line 287):

```
The Playground has six layers of automated testing — unit/component (Vitest + RTL), accessibility audits (jest-axe + axe-core/playwright), end-to-end (Playwright), visual regression (Storybook + Playwright screenshots), HTML5 validation against the rendered DOM (html-validate), and CSS validation of dynamic inline styles (Stylelint against the live DOM) — all runnable locally with no external accounts. Static linting (ESLint with `eslint-plugin-jsx-a11y`, Stylelint against every `.css` source file) catches most CSS3/accessibility conformance issues at edit time, before any of the above run. See [`docs/TESTING.md`](docs/TESTING.md) for the full reference, including how to run each layer and update visual baselines.
```

Replace with:

```
The Playground has six layers of automated testing — unit/component (Vitest + RTL), accessibility audits (jest-axe + axe-core/playwright), end-to-end (Playwright), visual regression (Storybook + Playwright screenshots), HTML5 validation against the rendered DOM (html-validate), and CSS validation of dynamic inline styles (Stylelint against the live DOM) — all runnable locally with no external accounts. Static linting (ESLint with `eslint-plugin-jsx-a11y`, Stylelint against every `.css` source file) catches most CSS3/accessibility conformance issues at edit time, before any of the above run. All six layers, plus a Docker build check, a two-tier `npm audit` gate, and Lighthouse performance/accessibility budgets, also run in CI on every push and pull request (`.github/workflows/ci.yml`) — see [`docs/TESTING.md`](docs/TESTING.md) for the full reference, including how to run each layer and update visual baselines.
```

- [ ] **Step 3: Sanity-check the edits**

Run: `grep -n "workflows/ci.yml" README.md`
Expected: two matches — the badge line and the testing-section sentence.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(87,88): add CI status badge and note CI coverage in the testing section"
```

---

### Task 7: Version bump and changelog

**Files:**
- Modify: `package.json` (`version` field)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump the version**

In `package.json`, change:

```json
  "version": "0.32.4",
```

to:

```json
  "version": "0.33.0",
```

- [ ] **Step 2: Add the CHANGELOG entry**

In `CHANGELOG.md`, insert this new entry directly above the existing `## [0.32.4] - 2026-07-22` entry:

```markdown
## [0.33.0] - 2026-07-22

### Added

- A GitHub Actions CI workflow (`.github/workflows/ci.yml`, issue #88) that runs all six local testing layers (lint, lint:css, unit tests with coverage, the production build, and the full Playwright e2e suite) plus a Docker build check, on every push to `main` and every pull request — previously these only protected a developer who remembered to run them locally before pushing. Runs as 8 independent parallel jobs so one failing check (e.g. lint) doesn't block feedback from the others.
- An `npm audit` gate in CI (issue #87): `npm audit --omit=dev --audit-level=moderate` fails the build on moderate+ findings in the production dependency tree, while a separate `--omit=prod` step reports dev-tree findings (e.g. the Storybook 8 chain's 3 moderate advisories, SEC-6) to the run's step summary without ever blocking a merge — matching the audit posture already documented in `SECURITY.md`.
- Lighthouse CI budgets (issue #88): `lighthouserc.json` scores the dashboard, a representative game (`/game/animal-sounds`), the parent analytics dashboard, and the kid-facing progress page against a real production build (`vite preview`, not the dev server), failing the job if performance, accessibility, best-practices, or SEO drops below 0.8 on any route.

```

- [ ] **Step 3: Verify the CHANGELOG is well-formed**

Run: `grep -n "^## \[" CHANGELOG.md | head -3`
Expected: the first line is `## [0.33.0] - 2026-07-22`, the second is `## [0.32.4] - 2026-07-22`, confirming the new entry sits above the previous most-recent one.

- [ ] **Step 4: Run the full local verification suite before closing this out**

Run: `npm run lint && npm run lint:css && npx vitest run && npm run build`
Expected: all PASS. (Full `npm run e2e` and a real `docker build .` are optional to also run locally here since they're slower — the true validation for those, and for the workflow triggers themselves, is the first real GitHub Actions run once this branch is pushed and a PR is opened.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(87,88): bump version to 0.33.0 for the CI pipeline release"
```
