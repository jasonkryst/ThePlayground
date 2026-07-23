# CI Pipeline, npm audit Gate, and Lighthouse Budgets — Design

**Issues:** GitHub #88 ("TESTING - CI") and #87 ("SECURITY - CI", depends on #88)
**Date:** 2026-07-22

## Summary

Three related additions, all living in one new workflow file:

1. **CI pipeline** (#88) — a GitHub Actions workflow that runs the six local testing layers plus a Docker build check on every push to `main` and every pull request targeting `main`. Today all of this only protects a developer who remembers to run `npm run lint && npm run lint:css && npm test && npm run build && npm run e2e` (and manually try `docker build .`) before pushing.
2. **npm audit gate** (#87, depends on #88) — a CI job that fails on moderate+ severity findings in the production dependency tree (`--omit=dev`), and separately reports (never fails) findings in the dev tree, since the 2026-07-12 audit already found the dev tree's 3 moderate advisories (Storybook 8 chain, SEC-6) not worth a breaking downgrade.
3. **Lighthouse budgets** (#88) — per-route performance/accessibility/best-practices/SEO scoring via Lighthouse CI, with regression thresholds. Complements axe (which checks accessibility violations, not score trends over time).

All three are CI/infrastructure changes — no production application code changes are expected.

## 1. Workflow: `.github/workflows/ci.yml`

**Triggers:**
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```
Deliberately narrower than "every push to every branch" — this repo has ~30 open feature branches at any time (per `git branch -a`), and each one opens a PR against `main` anyway, so branch-push triggers would just double the Actions minutes spent per change with no new signal. Re-running on the `main` push (not just the PR) matters because a squash-merge produces a commit that was never itself pushed as a branch, so it's the only point where that exact commit gets verified.

**Jobs** — eight independent parallel jobs, no `needs:` between them (each does its own `actions/checkout@v4` → `actions/setup-node@v4` with `node-version: 24` (matching the Dockerfile's `node:24-alpine` pin) and `cache: npm` → `npm ci` as needed). Independence means a lint failure doesn't block e2e/build feedback, and total wall-clock time is the slowest single job, not the sum of all of them.

| Job | Steps | Notes |
|---|---|---|
| `lint` | `npm run lint` | |
| `lint-css` | `npm run lint:css` | |
| `unit-tests` | `npm run coverage` | uploads `coverage/` via `actions/upload-artifact@v4` (always, not just on failure — coverage trends matter on green runs too) |
| `build` | `npm run build` | proves the production Vite bundle still compiles; no artifact upload (dist/ isn't needed by any other job, since none of them use cross-job artifacts — see below) |
| `e2e` | `npx playwright install --with-deps chromium` then `npm run e2e` | `playwright.config.js` already starts its own `npm run dev` + `npm run storybook -- --ci` webServers; `ubuntu-latest` ships Docker preinstalled, so `nginx-headers.spec.js` runs for real instead of self-skipping. Uploads `playwright-report/` and `test-results/` via `actions/upload-artifact@v4` with `if: failure()` only (large, only useful when something broke) |
| `docker-build` | `docker build -t playground:ci .` | build-only — no `docker push`, no registry login, no secrets needed. Verifies the multi-stage Dockerfile (`npm ci` + `npm run build` inside the build stage, then the nginx runtime stage) still succeeds |
| `npm-audit` | two steps, detailed in §2 | |
| `lighthouse` | `npm run build`, `npm run preview -- --port 4173 &`, wait for it, `npx lhci autorun` | detailed in §3 |

**Why no cross-job artifact passing for `dist/`:** `build`, `e2e`, and `lighthouse` each run their own build/dev-server independently rather than one job producing `dist/` and others downloading it. This trades a small amount of redundant CPU (three `npm ci`/build cycles instead of one) for zero job-ordering — every job stays a true parallel leaf, matching the "parallel independent jobs" structure chosen for fast feedback. If CI minutes become a real constraint later, that's a candidate follow-up, not part of this change.

**Permissions:** default `contents: read` is sufficient for every job — none of them push, comment, or need write access, so no elevated `permissions:` block and no new repo secrets.

## 2. npm audit gate (`npm-audit` job)

```yaml
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
```

- **Gate step** (`--omit=dev --audit-level=moderate`): fails the job — and therefore the required check — on moderate/high/critical findings in the production dependency tree. The 2026-07-12 audit found the prod tree clean at this level; if that regresses, CI now catches it instead of waiting for the next manual `npm audit`.
- **Report step** (`--omit=prod`, no `--audit-level` since nothing here should ever fail): the command's own non-zero exit on findings is masked with `|| true` so the step always succeeds; its output is appended to the GitHub Actions run's step summary (visible directly on the run page, not buried in raw logs) so dev-tree findings — like the existing 3 moderate Storybook-chain advisories (SEC-6) — stay visible without ever blocking a merge.

## 3. Lighthouse budgets (`lighthouse` job)

**Tool:** `@lhci/cli` (new devDependency), config committed at `lighthouserc.json`.

**Target:** `vite preview` (production build), confirmed empirically this session — `npm run build && npm run preview` serves `/parent` (and other client-routed paths) with a real `200` via `index.html`, i.e. `vite preview`'s SPA fallback already works with zero config changes needed.

**Routes:**
- `/` — dashboard
- `/game/animal-sounds` — representative game screen
- `/parent` — parent analytics dashboard (chart-heavy, recharts)
- `/my-progress` — kid-facing progress page

**`lighthouserc.json`:**
```json
{
  "ci": {
    "collect": {
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
**Corrected from the brainstorming discussion:** lhci's assertion schema maps one audit/category key to exactly one `[level, options]` pair — it has no built-in way to attach both a `warn` threshold and a separate `error` threshold to the same category simultaneously (a second entry for the same JSON key would just overwrite the first). So the actual hard gate is `error` at `minScore: 0.8` per category, per the earlier decision. The "0.9 is worth noticing" tier isn't a second programmatic assertion — it's realized the same way the audit job's dev-tier report is realized (§2): every run's actual category scores are visible in the job's own console output and in the `lhci autorun` temporary-public-storage report link, so a score drifting into the 0.8–0.9 band is observable before it ever crosses 0.8 and fails, without any custom summary-parsing code.

`numberOfRuns: 1` (not lhci's default of 3): a single run per route keeps CI time down; single-page-app score variance is a real risk this design accepts rather than triples runtime, revisit if flakiness shows up in practice.

`upload.target: temporary-public-storage` gives each run a shareable report link in the job logs with no account/token setup, auto-expiring — no new secrets.

## 4. Testing plan for this work itself

Following this repo's established pattern (see `nginx/__tests__/securityHeaders.test.js` + `e2e/nginx-headers.spec.js`): a static config test proves the *shape* of the configuration is right; the config's *real* behavior gets validated by the CI jobs actually running on every push. There's no practical local unit-test runtime for a GitHub Actions workflow itself (running `act` to execute it locally would be a new, heavy dependency out of proportion to this change), so the static test is the primary guard against regressions to the workflow file itself.

**New: `.github/__tests__/ci.test.js`** (Vitest, parses `ci.yml` with the `yaml` package — new devDependency, needed since nothing in this repo currently parses YAML at test time):
- *Positive:* triggers are exactly `push.branches: [main]` and `pull_request.branches: [main]`; all 8 jobs exist by name; each job's step commands match the expected npm script; `node-version` is `24` in every job that uses `setup-node`; the audit gate step's `run` contains `--omit=dev` and `--audit-level=moderate` with no `continue-on-error` key present; the audit report step's `run` contains `--omit=prod` and does mask its own exit code.
- *Negative:* fails if `on.push.branches` is missing/empty (which would mean "all branches" — the opposite of the intended scope); fails if the audit gate step has `continue-on-error: true` added to it (would silently defeat the gate); fails if `docker-build`'s command includes `push: true`/`docker push` (this job must never publish an image — that's `docker-image.yml`'s job on release, not CI's).

**New: `.github/__tests__/lighthouserc.test.js`** (Vitest, loads `lighthouserc.json` as JSON):
- *Positive:* exactly the 4 expected URLs are present; all 4 categories (`performance`, `accessibility`, `best-practices`, `seo`) have an `error`-level assertion at `minScore: 0.8`.
- *Negative:* fails if any category is missing from `assertions` (would silently stop scoring a whole category); fails if any threshold is `0`/absent, or if a category's level is `"off"`/`"warn"` instead of `"error"` (either would mean a regression below 0.8 no longer fails CI).

**Real-world validation:** once `ci.yml` is pushed on this branch and a PR is opened, the Actions run itself is the live proof — all 8 jobs are expected green against this repo's current `main` state (confirmed clean audit + confirmed `vite preview` SPA fallback this session; lint/test/build/e2e are already green locally per repo convention).

## 5. Documentation updates

- **`docs/TESTING.md`** — new "Continuous Integration" section: the 8 jobs, what triggers them, the two-tier audit gate, the Lighthouse routes/thresholds, and where to find artifacts (coverage report, Playwright report on failure, lhci temporary report link).
- **`docs/ENHANCEMENTS.md`** — strike through the three now-complete backlog bullets (CI pipeline, npm audit in CI, Lighthouse budgets in CI) referencing #87/#88, matching the existing `~~...~~` convention used for #86's items. The "Image vulnerability scanning (SEC-4 remainder)" bullet, which was blocked on "once a CI pipeline exists," stays as an open bullet but gets its blocking clause updated to note the pipeline now exists and it's unblocked — implementing the actual Trivy scan is explicitly **out of scope** for this change (not part of #87 or #88's text).
- **`SECURITY.md`** — update the line "`npm audit` is run manually today; wiring it ... into CI is a tracked enhancement" to describe the shipped CI gate (thresholds, dev-tier report-only behavior), referencing issue #87.
- **`README.md`** — add a CI status badge near the top (small, standard addition); one sentence added to the testing section noting the six-layer suite plus Docker build now also run in CI on every push/PR.
- **`CHANGELOG.md`** + **`package.json`** — version bump per the repo's release convention (infrastructure-only addition — minor bump, e.g. `0.32.4` → `0.33.0`, since it's new capability rather than a fix).

## Risks / open questions

- **Lighthouse score variance on first run:** the exact scores for `/parent` (recharts) and any game route aren't known until the workflow runs for real in Actions (a fresh CI runner is a different environment than this local machine). If a score comes in below the `error` floor (0.8) on the very first real run, that needs investigation before merging this change (either the threshold is too strict for a real route, or there's a genuine issue worth fixing) — it is explicitly not something to silently loosen without looking at the actual Lighthouse report first.
- **`e2e` job runtime:** installing Playwright browsers (`--with-deps`) plus starting two web servers (dev + Storybook) inside one job may be the slowest of the 8; acceptable per the "parallel jobs" design since it doesn't block the others, but worth watching after the first few real runs.
- **Trivy/image scanning** remains explicitly out of scope (see §5) — tracked separately in `docs/ENHANCEMENTS.md`, now unblocked but not part of this change.
