# Trivy Image Vulnerability Scanning — Design

**Issue:** GitHub #132 ("SECURITY - Image vulnerability scanning (SEC-4 remainder)")
**Date:** 2026-07-24

## Summary

The 2026-07-12 security audit's Docker-hardening backlog (SEC-4) had two parts: container hardening itself (non-root nginx, pinned base images — done in issue #85) and automated image vulnerability scanning, which was blocked on a CI pipeline existing at all. That pipeline shipped in issue #88. This change implements the scanning remainder: a new `trivy` job in `.github/workflows/ci.yml` that scans the built Docker image with [Trivy](https://trivy.dev/), fails the build on fixable CRITICAL/HIGH findings, and publishes the full report (every severity, including unfixed) to the repo's Security tab via SARIF.

This is a CI/infrastructure change plus documentation updates — no production application code changes.

## 1. The `trivy` job

Added as a ninth independent parallel job in `.github/workflows/ci.yml` (no `needs:` — consistent with every other job in this workflow):

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

**Why a fourth independent job rather than extending `docker-build`:** `docker-build` is a build-sanity check today — its only failure mode is "the Dockerfile doesn't build." Folding a vulnerability gate into it would couple two different failure meanings into one job (chosen over the alternative of adding a scan step to the existing job, per discussion). The cost is a second `docker build -t playground:ci .` per run; acceptable since none of this workflow's jobs share build artifacts across jobs today either (see the `2026-07-22-ci-pipeline-design.md` rationale for why `build`/`e2e`/`lighthouse` each build independently).

**Gate step — fixable CRITICAL/HIGH only:**
- `severity: CRITICAL,HIGH` — mirrors `npm-audit`'s "moderate+" bar for the production tree: block on what's actually severe.
- `ignore-unfixed: true` — skips findings with no available patch. Alpine base images routinely carry CVEs the upstream Alpine maintainers haven't patched yet; without this, the gate would trip on things a version bump can't fix, exactly the kind of un-actionable noise `SECURITY.md`'s SEC-6 already calls out for the dev-dependency tree.
- `exit-code: 1` — the step (and therefore the job) fails when the gate's criteria match anything. No `continue-on-error`, matching how `npm-audit`'s gate step is deliberately left unsilenced.
- `format: table` — human-readable directly in the job's log output, same as looking at `npm audit`'s own console output.

**Report step — everything, always:**
- `if: always()` — runs even if the gate step failed, exactly like `npm-audit`'s dev-tree report step. A failed gate shouldn't prevent the full picture from reaching the Security tab.
- No `severity`/`ignore-unfixed` overrides — action defaults are `UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL` and `ignore-unfixed: false`, i.e. "everything, including things with no fix yet." That's deliberately broader than the gate: the Security tab is where low-severity/unfixed findings stay visible for tracking without ever blocking a merge, same purpose the dev-tree audit report serves today.
- `format: sarif` — the format GitHub's code-scanning upload action consumes.

**Upload step:**
- `if: always()` — must run even after a failed gate, same reasoning as the report step.
- `github/codeql-action/upload-sarif@v4` — a real, GitHub-maintained rolling major-version tag (verified live against the action's git tags this session), same pinning style as `actions/checkout@v4` already used throughout this workflow.

**Permissions:** this is the first job in the workflow to need anything beyond the default `contents: read` — `security-events: write` is required specifically for `upload-sarif`. Declared only on this job (not workflow-wide), keeping every other job at its existing default, least-privilege scope.

**Versions pinned:** `aquasecurity/trivy-action@v0.36.0` is exact-pinned (no floating major tag exists for this action — 0.x releases aren't guaranteed backward-compatible, confirmed against the action's actual git tags), matching this repo's existing Docker base-image pinning philosophy (`SECURITY.md`'s Docker posture section). `github/codeql-action/upload-sarif@v4` uses the floating major tag, matching `actions/checkout@v4`'s style, since GitHub does publish and maintain that tag with backward compatibility.

## 2. Testing plan

Following the same pattern as the CI pipeline's own static config test (`.github/__tests__/ci.test.js`, itself modeled on `nginx/__tests__/securityHeaders.test.js`): the workflow file's *shape* gets a static Vitest test; its *real* behavior — whether Trivy actually finds something — is proven by the job running for real on every push/PR against the actual built image.

**Why no additional live/e2e-layer test:** the nginx header checks needed both a static text test *and* a live Docker e2e test because the static test alone couldn't prove nginx actually served the headers at runtime. Here, the "live" proof already happens on every real CI run against a real built image — the job itself *is* the live check. Adding a redundant local e2e test that re-runs Trivy against a locally-built image would just be a slower, network-dependent (vulnerability DB download) duplicate of what CI already does on every run, with no new signal — so this change adds only the static config test.

**Extend `.github/__tests__/ci.test.js`:**

*Positive:*
- `EXPECTED_JOBS` grows from 8 to 9, including `trivy`.
- `trivy` job runs on `ubuntu-latest` (covered by the existing `it.each(EXPECTED_JOBS)` test).
- `trivy` job builds the image via `docker build` (same assertion shape as `docker-build`'s existing test).
- Gate step: `severity` contains `CRITICAL` and `HIGH`; `ignore-unfixed` is `true`; `exit-code` is `1`; no `continue-on-error` key.
- Report step: `if` is `always()`; `format` is `sarif`; has an `output` file path.
- Upload step: `uses` starts with `github/codeql-action/upload-sarif`; `if` is `always()`; `sarif_file` exactly matches the report step's `output` value.
- Job declares `permissions.contents: read` and `permissions.security-events: write`.

*Negative:*
- `trivy` is **not** added to `NODE_JOBS` — asserts no `actions/setup-node` step exists in the job (it only needs Docker, no `npm ci`).
- `docker build` command never includes `docker push` / a registry login step (mirrors `docker-build`'s existing negative test — this job must never publish an image).
- Gate step's `severity` does **not** include `LOW`, `MEDIUM`, or `UNKNOWN` (would make the gate fail on non-actionable low-severity noise, defeating the point of a tight gate).
- Gate step's `ignore-unfixed` is not `false`/missing (would make the gate fail on unfixable findings).
- Gate step has no `continue-on-error: true` (would silently defeat the gate, same check style as the `npm-audit` gate's existing negative test).
- No job *other than* `trivy` declares `security-events: write` (keeps the new permission scoped to the one job that needs it, not leaked workflow-wide).

**Real-world validation:** once pushed and a PR is opened, the Actions run is the live proof — the `trivy` job is expected green against this repo's current image (no reason to expect new CRITICAL/HIGH fixable findings in the pinned `node:24-alpine` / `nginxinc/nginx-unprivileged:1.27-alpine` images beyond what's already implicitly accepted by shipping them), and the Security tab should show the full SARIF report after the first run.

## 3. Documentation updates

- **`SECURITY.md`** — Docker posture section: replace the "Hardening backlog" bullet (which said scanning "isn't implemented yet") with a "Fixed" paragraph in the same style as SEC-1/2/3/5, describing the gate threshold, `ignore-unfixed` behavior, and SARIF upload to the Security tab, referencing issue #132.
- **`docs/ENHANCEMENTS.md`** — strike through the "Image vulnerability scanning (SEC-4 remainder)" bullet as done (issue #132), matching the existing `~~...~~` convention.
- **`docs/TESTING.md`** — Continuous Integration section: "8 independent parallel jobs" → 9; add a `trivy` bullet to the job list; add a short paragraph (parallel to the existing `npm audit` gate / Lighthouse budgets paragraphs) explaining the gate/report/upload split.
- **`CHANGELOG.md`** + **`package.json`** — version bump `0.33.1` → `0.34.0` (new capability, minor bump — same reasoning as `0.33.0`'s CI-pipeline addition), dated 2026-07-24.

## Risks / open questions

- **First real run may surface genuine findings.** Unlike the CI-pipeline change (where a clean `npm audit` was confirmed in advance), nobody has run Trivy against this exact image before. If the gate fails on the first real PR run, that needs actual investigation (upgrade a base image / wait for a patch) rather than silently loosening the severity list or flipping `ignore-unfixed` — this spec's thresholds are the intended posture, not a placeholder.
- **Duplicate `docker build`.** This job builds the image independently of `docker-build`, per the chosen "independent job" design — a small, deliberate cost, not an oversight.
