# Trivy Image Vulnerability Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `trivy` job to `.github/workflows/ci.yml` (issue #132 / SEC-4 remainder) that scans the built Docker image with Trivy, fails the build on fixable CRITICAL/HIGH findings, and publishes the full report (every severity, including unfixed) to the repo's Security tab via SARIF.

**Architecture:** One new independent job in the existing `.github/workflows/ci.yml` (no `needs:`, builds its own image via `docker build`), guarded by a static config test extending `.github/__tests__/ci.test.js` (parses the YAML, asserts job shape — the same pattern already used for the other 8 jobs in that file). No new files; the workflow's real scanning behavior is proven live once this branch's Actions run executes, not by any new local test.

**Tech Stack:** GitHub Actions, `aquasecurity/trivy-action@v0.36.0` (new, exact-pinned), `github/codeql-action/upload-sarif@v4` (new, floating major tag), Vitest + the existing `yaml` devDependency (already used by `ci.test.js`, no new dependency needed).

**Design doc:** `docs/superpowers/specs/2026-07-24-trivy-image-scanning-design.md`

## Global Constraints

- New job name: exactly `trivy`. Runs on `ubuntu-latest`. No `needs:` — independent, ninth parallel job.
- Job builds its own image: `docker build -t playground:ci .` (same tag as the existing `docker-build` job, no relation/dependency between the two jobs).
- Job declares `permissions: { contents: read, security-events: write }` — the only job in this workflow with a non-default `permissions:` block.
- Gate step: `aquasecurity/trivy-action@v0.36.0`, `image-ref: playground:ci`, `format: table`, `severity: CRITICAL,HIGH`, `ignore-unfixed: true`, `exit-code: 1`. No `continue-on-error`.
- Report step: same action/image-ref, `if: always()`, `format: sarif`, `output: trivy-results.sarif`. No `severity`/`ignore-unfixed` override (action defaults cover every severity including unfixed).
- Upload step: `github/codeql-action/upload-sarif@v4`, `if: always()`, `sarif_file: trivy-results.sarif` (must match the report step's `output` exactly).
- `trivy` is never added to `NODE_JOBS` in `ci.test.js` — it has no `actions/setup-node` step.
- No new secrets. No change to any other job's permissions.
- Version bump: `0.33.1` → `0.34.0` (minor — new capability, matching this repo's convention for `### Added` CHANGELOG entries).

---

### Task 1: `trivy` job in `ci.yml` + static structure test

**Files:**
- Modify: `.github/workflows/ci.yml` (add the `trivy` job after the existing `npm-audit` job, before `lighthouse`)
- Modify: `.github/__tests__/ci.test.js`

**Interfaces:**
- Produces: the `trivy` job in `ci.yml` — no other task in this plan reads it programmatically.

- [ ] **Step 1: Update `EXPECTED_JOBS` and add the new describe block (failing test first)**

In `.github/__tests__/ci.test.js`, change line 11:

```js
const EXPECTED_JOBS = ['lint', 'lint-css', 'unit-tests', 'build', 'e2e', 'docker-build', 'npm-audit', 'lighthouse']
```

to:

```js
const EXPECTED_JOBS = ['lint', 'lint-css', 'unit-tests', 'build', 'e2e', 'docker-build', 'npm-audit', 'lighthouse', 'trivy']
```

Leave `NODE_JOBS` (line 12) unchanged — `trivy` must not be added to it.

Then update line 43's job-count test and append a new `describe` block at the end of the file (after the existing `lighthouse` test, i.e. after line 136, before the file's closing):

Change:

```js
  it('defines exactly the 8 expected jobs', () => {
    expect(Object.keys(workflow.jobs).sort()).toEqual([...EXPECTED_JOBS].sort())
  })
```

to:

```js
  it('defines exactly the 9 expected jobs', () => {
    expect(Object.keys(workflow.jobs).sort()).toEqual([...EXPECTED_JOBS].sort())
  })
```

Append, directly after the existing `lighthouse job builds the app and runs lhci autorun` test (just before the file's final closing `})`):

```js

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run .github/__tests__/ci.test.js`
Expected: FAIL — `EXPECTED_JOBS` now lists 9 jobs but `workflow.jobs` only has 8 (`trivy` doesn't exist yet), and every new `trivy`-specific test fails with `workflow.jobs['trivy']` being `undefined`.

- [ ] **Step 3: Add the `trivy` job to `ci.yml`**

In `.github/workflows/ci.yml`, insert this new job between the existing `npm-audit` job (ends at line 107) and the `lighthouse` job (starts at line 109):

```yaml

  trivy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t playground:ci .
      - name: Vulnerability gate (fixable CRITICAL/HIGH findings)
        uses: aquasecurity/trivy-action@v0.36.0
        with:
          image-ref: playground:ci
          format: table
          severity: CRITICAL,HIGH
          ignore-unfixed: true
          exit-code: 1
      - name: Full vulnerability report (all severities, including unfixed)
        if: always()
        uses: aquasecurity/trivy-action@v0.36.0
        with:
          image-ref: playground:ci
          format: sarif
          output: trivy-results.sarif
      - name: Upload scan results to the Security tab
        if: always()
        uses: github/codeql-action/upload-sarif@v4
        with:
          sarif_file: trivy-results.sarif
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run .github/__tests__/ci.test.js`
Expected: PASS — all tests green, including every new `trivy`-specific test.

- [ ] **Step 5: Run the full existing unit/component suite to confirm no regression**

Run: `npx vitest run`
Expected: PASS — this change only touches `ci.yml` and `ci.test.js`, so every other suite (games, hooks, nginx config tests, etc.) is unaffected.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml .github/__tests__/ci.test.js
git commit -m "feat(132): add Trivy image vulnerability scanning to CI"
```

---

### Task 2: `docs/TESTING.md` — document the `trivy` job

**Files:**
- Modify: `docs/TESTING.md` (lines 142, 149-150, 156 in the current file)

- [ ] **Step 1: Update the job-count line (currently line 142)**

Find:

```
`.github/workflows/ci.yml` runs on every push to `main` and every pull request targeting `main`, as 8 independent parallel jobs (no job waits on another):
```

Replace with:

```
`.github/workflows/ci.yml` runs on every push to `main` and every pull request targeting `main`, as 9 independent parallel jobs (no job waits on another):
```

- [ ] **Step 2: Add a `trivy` bullet to the job list (currently lines 144-150)**

Find:

```
- **`npm-audit`** — two-tier `npm audit` gate, see below.
- **`lighthouse`** — Lighthouse CI budgets, see below.
```

Replace with:

```
- **`npm-audit`** — two-tier `npm audit` gate, see below.
- **`trivy`** — Trivy image vulnerability scan, see below.
- **`lighthouse`** — Lighthouse CI budgets, see below.
```

- [ ] **Step 3: Add a `Trivy` explanation paragraph (currently after line 152, before the Lighthouse paragraph)**

Find:

```
**`npm audit` gate:** `npm audit --omit=dev --audit-level=moderate` fails the job (and therefore the PR check) on moderate/high/critical findings in the *production* dependency tree. A separate `npm audit --omit=prod` step always runs (even if the gate step failed) and never fails the job itself — its output is appended to the workflow run's own step summary, so *dev*-tree findings (like the 3 moderate Storybook-chain advisories noted in `SECURITY.md`) stay visible without blocking a merge.

**Lighthouse budgets:**
```

Replace with:

```
**`npm audit` gate:** `npm audit --omit=dev --audit-level=moderate` fails the job (and therefore the PR check) on moderate/high/critical findings in the *production* dependency tree. A separate `npm audit --omit=prod` step always runs (even if the gate step failed) and never fails the job itself — its output is appended to the workflow run's own step summary, so *dev*-tree findings (like the 3 moderate Storybook-chain advisories noted in `SECURITY.md`) stay visible without blocking a merge.

**Trivy image scan:** the `trivy` job builds the Docker image (independently of the `docker-build` job) and scans it with [Trivy](https://trivy.dev/) (`aquasecurity/trivy-action`). A gate step fails the job on CRITICAL/HIGH findings that have an available fix (`ignore-unfixed: true` — skips upstream Alpine CVEs with no patch yet, so the gate only trips on things a version bump could actually fix). A second step, which runs even if the gate failed, scans again for every severity including unfixed findings and uploads the result as SARIF to the repository's Security tab (Code Scanning), so lower-severity or currently-unfixable findings stay visible for tracking without ever blocking a merge — the same report-without-blocking posture as the `npm-audit` job's dev-tree step.

**Lighthouse budgets:**
```

- [ ] **Step 4: Update the closing paragraph about static structure tests (currently line 156)**

Find:

```
Both new workflow-adjacent config files have their own static structure tests — `.github/__tests__/ci.test.js` parses `ci.yml` and asserts its trigger scope, job set, and the audit gate's exact flags; `.github/__tests__/lighthouserc.test.js` asserts the 4 routes and 4 category thresholds. Like the nginx security-header tests, these prove the *configuration's shape* — the configuration's real behavior is proven every time the workflow actually runs in Actions.
```

Replace with:

```
Both new workflow-adjacent config files have their own static structure tests — `.github/__tests__/ci.test.js` parses `ci.yml` and asserts its trigger scope, job set, the audit gate's exact flags, and the `trivy` job's gate/report/upload shape; `.github/__tests__/lighthouserc.test.js` asserts the 4 routes and 4 category thresholds. Like the nginx security-header tests, these prove the *configuration's shape* — the configuration's real behavior (including whether Trivy actually finds anything) is proven every time the workflow actually runs in Actions.
```

- [ ] **Step 5: Sanity-check the edits**

Run: `grep -n "9 independent\|trivy\|Trivy" docs/TESTING.md`
Expected: at least 5 matches — the "9 independent parallel jobs" line, the `trivy` bullet, the `Trivy image scan` paragraph heading, its body text mentioning the Security tab, and the updated closing paragraph.

- [ ] **Step 6: Commit**

```bash
git add docs/TESTING.md
git commit -m "docs(132): document the Trivy image scan job in the CI reference"
```

---

### Task 3: `docs/ENHANCEMENTS.md` — close out the SEC-4 remainder bullet

**Files:**
- Modify: `docs/ENHANCEMENTS.md` (line 79 in the current file)

- [ ] **Step 1: Strike through the image-scanning bullet (currently line 79)**

Find:

```
- **Image vulnerability scanning (SEC-4 remainder)** — add automated scanning (e.g. Trivy); the CI pipeline this was blocked on now exists (`.github/workflows/ci.yml`, issue #88), so this is unblocked but still not implemented.
```

Replace with:

```
- ~~**Image vulnerability scanning (SEC-4 remainder)**~~ — done (issue #132): a `trivy` job in `.github/workflows/ci.yml` scans the built image with Trivy, failing on CRITICAL/HIGH findings that have an available fix (`ignore-unfixed: true`, so unpatched upstream Alpine CVEs don't block merges); a second always-run step reports every severity, including unfixed findings, as a SARIF upload to the repo's Security tab. See `docs/TESTING.md` § Continuous Integration.
```

- [ ] **Step 2: Sanity-check the edit**

Run: `grep -n "Image vulnerability scanning" docs/ENHANCEMENTS.md`
Expected: one match, now starting with `- ~~**Image vulnerability scanning`.

- [ ] **Step 3: Commit**

```bash
git add docs/ENHANCEMENTS.md
git commit -m "docs(132): close out the image-vulnerability-scanning backlog item"
```

---

### Task 4: `SECURITY.md` — describe the shipped scan

**Files:**
- Modify: `SECURITY.md` (line 80 in the current file)

- [ ] **Step 1: Replace the Docker posture backlog bullet (currently line 80)**

Find:

```
- **Hardening backlog** (tracked in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md#security)): automated image vulnerability scanning (Trivy) — the CI pipeline this was blocked on now exists (issue #88), but the scan itself isn't implemented yet.
```

Replace with:

```
- **Automated image vulnerability scanning (SEC-4 remainder, issue #132):** the `trivy` job in `.github/workflows/ci.yml` scans the built image with Trivy on every push/PR. A gate step fails the job on CRITICAL/HIGH findings with an available fix (`ignore-unfixed: true` skips upstream OS-package CVEs with no patch yet, so the gate only trips on actionable findings). A second step, which runs even if the gate failed, scans every severity including unfixed findings and uploads the result as SARIF to this repository's Security tab, so lower-severity or currently-unfixable findings stay visible for tracking without ever blocking a merge — the same posture `npm audit`'s dev-tree report already uses below.
```

- [ ] **Step 2: Sanity-check the edit**

Run: `grep -n "Hardening backlog\|Trivy\|image vulnerability scanning" SECURITY.md`
Expected: no remaining occurrence of "Hardening backlog" or "isn't implemented yet"; the new paragraph appears in its place under "## Docker posture".

- [ ] **Step 3: Commit**

```bash
git add SECURITY.md
git commit -m "docs(132): describe the CI-gated Trivy image scan in the security posture doc"
```

---

### Task 5: Version bump and changelog

**Files:**
- Modify: `package.json` (`version` field)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump the version**

In `package.json`, change:

```json
  "version": "0.33.1",
```

to:

```json
  "version": "0.34.0",
```

- [ ] **Step 2: Add the CHANGELOG entry**

In `CHANGELOG.md`, insert this new entry directly above the existing `## [0.33.1] - 2026-07-22` entry:

```markdown
## [0.34.0] - 2026-07-24

### Added

- Automated Docker image vulnerability scanning in CI (issue #132, the SEC-4 remainder left open by issue #85's container hardening): a new `trivy` job in `.github/workflows/ci.yml` scans the built image with [Trivy](https://trivy.dev/), failing the build on CRITICAL/HIGH findings that have an available fix (`ignore-unfixed: true`, so unpatched upstream Alpine CVEs with no available patch don't block merges). A second step, which runs even if the gate failed, reports every severity — including unfixed findings — as a SARIF upload to the repository's Security tab, matching the report-without-blocking posture the `npm-audit` job's dev-tree step already established.

```

- [ ] **Step 3: Verify the CHANGELOG is well-formed**

Run: `grep -n "^## \[" CHANGELOG.md | head -3`
Expected: the first line is `## [0.34.0] - 2026-07-24`, the second is `## [0.33.1] - 2026-07-22`, confirming the new entry sits above the previous most-recent one.

- [ ] **Step 4: Run the full local verification suite**

Run: `npm run lint && npm run lint:css && npx vitest run && npm run build`
Expected: all PASS. (A real `docker build .` plus the actual Trivy scan is optional to also run locally here since it requires Docker and downloads Trivy's vulnerability database — the true validation is the first real GitHub Actions run once this branch is pushed and a PR is opened, per Task 1's design rationale.)

- [ ] **Step 5: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore(132): bump version to 0.34.0 for the Trivy image scan release"
```
