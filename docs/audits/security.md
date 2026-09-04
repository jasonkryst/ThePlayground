# Security Audit — The Playground

**Date:** 2026-09-04 | **App version:** 1.1.10 | **Auditor:** Claude Sonnet 5 (agent-performed, evidence-based)

This audit independently re-verifies the posture already documented in [`SECURITY.md`](../../SECURITY.md) (last full audit 2026-07-12, delta re-audits 2026-07-28 and 2026-08-31) by reading the actual source, config, CI, and Docker artifacts as of this commit — not by trusting the document's prose. Every claim in `SECURITY.md` checked below was found to match the code. No modifications were made to any source file; this report is the only file written.

---

## Executive Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 2 |
| Info | 5 |

No Critical, High, or Medium severity findings. This remains a well-hardened static SPA for its threat model (self-hosted, single-family, no accounts/backend). The two Low findings are minor robustness/hygiene gaps, not exploitable vulnerabilities. The single previously-known dependency advisory (react-router `GHSA-qwww-vcr4-c8h2`) is confirmed still present, still correctly allowlisted with a dated re-review gate, and not reachable in this app's usage pattern.

---

## Findings

| # | Severity | Area | Summary |
|---|---|---|---|
| F1 | Low | Client storage robustness | `localStorage.setItem` calls in `localStorageAdapter.js` have no try/catch — a full quota (`QuotaExceededError`) or private-browsing storage rejection throws uncaught, likely crashing the write path silently from the user's perspective |
| F2 | Low | Repo/working-tree hygiene | `.playwright-mcp/` is untracked but **not** `.gitignore`d, and currently contains browser console logs and a stray 112 MB unrelated installer (`dotnet-hosting-8-0-29-win.exe`); a careless `git add -A` would stage it |
| F3 | Info | Dependency advisory (known, tracked) | `npm audit --production` confirms `react-router`/`react-router-dom` 7.12.0–7.18.1 carry `GHSA-qwww-vcr4-c8h2` (High per npm's own severity label) — already allowlisted in CI with a scoped, dated exception |
| F4 | Info | Docker build-arg dead code | `docker-image.yml` passes `--build-arg APP_VERSION=...` to the release build, but `Dockerfile` declares no matching `ARG APP_VERSION` — the value is silently discarded by Docker (BuildKit emits a non-fatal "unconsumed build arg" warning, no failure) |
| F5 | Info | HSTS/TLS deliberately out of container | Confirmed: `nginx.conf` serves plain HTTP only; no HSTS header, no TLS. This is documented as an intentional deployment-boundary decision (reverse proxy owns TLS), not an oversight |
| F6 | Info | `style-src 'unsafe-inline'` in CSP | Confirmed present, required for legitimate per-item inline `style` attributes (documented rationale in `SECURITY.md`/security-headers.conf); slightly widens CSP's protection against style-based injection but does not permit script execution |
| F7 | Info | Dependabot scope excludes npm ecosystem | `.github/dependabot.yml` only tracks `github-actions` and `docker` ecosystems, not `npm` — deliberate (comment cites `audit-ci` as the npm gating mechanism instead), but means npm deps get no automated version-bump PRs, only the audit-ci vulnerability gate |

### F1 — `localStorage` writes have no error handling (Low)

**Evidence:** `src/storage/localStorageAdapter.js:24,42,55,68,86,99,112` — every `save*`/`addScore` method calls `localStorage.setItem(...)` directly with no surrounding `try/catch`, in contrast to every corresponding `get*` method, which wraps its `JSON.parse` in `try/catch` and falls back to a safe default (lines 12-18, 27-39, 45-52, 58-65, 71-83, 89-96, 102-109).

**Description:** If `localStorage` is full (quota exceeded — realistic on long-lived devices given scores/timings/session-resume state accumulate indefinitely with no pruning visible in this adapter) or unavailable (e.g. some private-browsing modes throw on write), `setItem` throws a `DOMException`. None of the call sites catch it, and none of the calling hooks (`useScores`, `useSettings`, etc., not modified/inspected line-by-line here but consistent with the adapter contract in `src/storage/adapter.js`) appear to expect a rejected promise from these methods per the documented `Promise<void>` contracts. Net effect: a full-quota device silently fails to save a completed game session or a settings change, likely surfaced to the child/parent as "nothing happened" rather than a clear error, or an uncaught promise rejection in the console.

This is **not a security vulnerability** (no data exposure, no injection) — it's a reliability/UX gap with a security-adjacent flavor (silent data loss). Flagging because the audit brief asked explicitly about "quota/error handling."

**Recommendation:** Wrap each `setItem` call in try/catch; on failure, either surface a toast/notification via existing UI patterns or at minimum log/report so a parent isn't left thinking progress was saved when it wasn't. Low priority — no urgency.

### F2 — Untracked `.playwright-mcp/` directory not gitignored (Low)

**Evidence:** `git status --porcelain` shows `?? .playwright-mcp/` (untracked, unignored). Directory contents (`C:\_s\ThePlayground\.playwright-mcp\`) include multiple `console-*.log` files (browser console captures, up to ~18 KB) and one 111,917,280-byte file, `dotnet-hosting-8-0-29-win.exe` — a .NET Hosting Bundle installer entirely unrelated to this Node/React project. `.gitignore` has no entry for `.playwright-mcp/`.

**Description:** Not itself a vulnerability — the directory isn't committed. But it's a latent risk: a future `git add -A` / `git add .` in this working tree would stage a 112 MB unrelated binary and console logs (which could contain page URLs, timing data, or other captured browser output) into the repository. The `.gitignore` already deliberately excludes comparable tool-output directories (`playwright-report/`, `test-results/`, `.stryker-tmp/`, `storybook-static/`) — this one was simply missed, likely because the `claude-in-chrome`/Playwright-MCP tooling that generates it predates or sits outside the existing ignore list.

**Recommendation:** Add `.playwright-mcp/` to `.gitignore` alongside the other tool-output entries. Separately (repo hygiene, not security): delete the stray installer `.exe`, which has no relationship to this project.

### F3 — `react-router`/`react-router-dom` `GHSA-qwww-vcr4-c8h2` (Info — known, tracked, allowlisted)

**Evidence:** `npm audit --production` output:
```
react-router  7.12.0 - 7.18.1
Severity: high
React Router: RSC Mode CSRF Bypass Allows Action Execution Before 400 Response
node_modules/react-router
  react-router-dom  7.12.0-pre.0 - 7.18.1
2 high severity vulnerabilities
```
`package.json:28` pins `"react-router-dom": "^7.18.1"`, within the affected range. `.github/workflows/ci.yml:118` runs `npx audit-ci --moderate --skip-dev --allowlist GHSA-qwww-vcr4-c8h2`, and the surrounding comment (lines 104-116) documents the reasoning (this app is a client-only SPA using `BrowserRouter`, never react-router's RSC/framework mode, so the CSRF-bypass code path is unreachable) plus a dated re-review marker (`Allowlist entry added: 2026-07-28`) enforced by `.github/__tests__/ci.test.js` failing once >180 days old.

**Description:** This is exactly the state `SECURITY.md` describes — a real advisory against a pinned dependency version, correctly triaged as not applicable to this app's usage pattern, allowlisted narrowly (single advisory ID, not a blanket exception), and time-boxed for re-review rather than allowed to calcify. No new action needed beyond what's already tracked (`docs/ENHANCEMENTS.md` backlog item: upgrade to React 19 + react-router 8 to remove the need for the allowlist entirely). As of this audit the re-review window has ~38 days elapsed since 2026-07-28 (of 180), well within budget.

**Recommendation:** No action required now; the existing re-review gate will force reconsideration before the marker goes stale. Confirmed the gate mechanism actually works as designed (the audit-ci command line, the allowlist scope, and the dated-marker test all line up).

### F4 — `docker-image.yml`'s `APP_VERSION` build-arg is not consumed by the Dockerfile (Info)

**Evidence:** `.github/workflows/docker-image.yml:58-60`:
```yaml
build-args: |
  APP_VERSION=${{ steps.vars.outputs.version }}
```
`Dockerfile` (full contents read) contains no `ARG APP_VERSION` declaration in either build stage — grepping the whole repo (excluding `node_modules`) for `APP_VERSION` finds it only in `docker-image.yml`, the historical audit spec `docs/superpowers/specs/2026-08-31-security-audit-findings.md`, `SECURITY.md`, and `CHANGELOG.md`; never in `Dockerfile` itself.

**Description:** Not a security issue — Docker/BuildKit silently ignores (with a non-fatal warning) a `--build-arg` that no `ARG` in the Dockerfile consumes; it cannot leak or break the build. Included here because it's adjacent to the Docker/CI review this audit covers and looks like dead/vestigial configuration — possibly a remnant of a build-time-version-injection approach that was superseded by the current "version read from `package.json`" approach (per `CLAUDE.md`) but never cleaned up in the workflow file. Flagged per the audit's request to note surprises found while auditing, even outside strict "security."

**Recommendation:** Either remove the unused `build-args` line from `docker-image.yml`, or add a corresponding `ARG APP_VERSION` (and use it, e.g. as an `org.opencontainers.image.version` OCI label) if version-stamping the image was the original intent.

### F5 — No HSTS / TLS inside the container (Info — confirmed intentional)

**Evidence:** `nginx.conf:1-2` — `listen 8080;` (plain HTTP), no `ssl_*` directives anywhere in `nginx.conf` or `nginx/security-headers.conf`. Confirmed no `Strict-Transport-Security` header in either file. `docker-compose.yml:1-5` maps host `32800 → 8080` (confirmed the current port, matching the recent commit `3e4bfd4 Change port mapping from 8080 to 32800` and the docs-sync commit `6de83fe`), plain HTTP, no TLS termination in compose.

**Description:** This matches `SECURITY.md`'s "Known gaps" section exactly, which frames it as a deliberate architectural boundary: the container is a static file server, and TLS/HSTS belong at a reverse proxy in front of it (documented in `docs/DEPLOYMENT.md`'s HTTPS section). Confirmed this reverse-proxy guidance exists in `docs/DEPLOYMENT.md`. Reasonable for a self-hosted single-family app; worth restating because it's the one HTTP-layer control genuinely absent, and a deployer who skips the reverse-proxy step gets an app served in cleartext with no HSTS to fall back on if they later add TLS elsewhere without redirecting.

**Recommendation:** No code change needed. Consider making the "you must put this behind TLS" guidance even more prominent (e.g. a startup log line or a comment in `docker-compose.yml`) for deployers who skip reading `docs/DEPLOYMENT.md`. Already Low-effort/Low-value given the documented scope.

### F6 — `style-src 'unsafe-inline'` in CSP (Info — confirmed necessary, narrow)

**Evidence:** `nginx/security-headers.conf:18` — `style-src 'self' 'unsafe-inline'`. Confirmed via `Grep` for `style=` usage that the app uses per-item inline `style` attributes (e.g. per-game accent colors, per CLAUDE.md's description of the `color` manifest field feeding `KidsProgressPage`/`GameResults` inline styles) rather than a nonce-based or CSS-custom-property-based approach.

**Description:** `unsafe-inline` for `style-src` cannot execute JavaScript directly, so its practical XSS risk is far lower than `script-src 'unsafe-inline'` (which this app correctly does NOT have). The residual risk is CSS-based data exfiltration/UI-redress techniques (e.g. attribute-selector CSS exfiltration), which require an existing injection point to exploit — and none was found in this audit (no `dangerouslySetInnerHTML`, no `innerHTML`, all rendering goes through React's escaping). This matches `SECURITY.md`'s documented rationale precisely and is called out there as a "deliberately separate follow-up" (nonces or CSS custom properties) rather than an oversight.

**Recommendation:** No urgent action. If the CSP is ever tightened further, migrating the per-item inline styles to CSS custom properties (`--accent-color` set inline, consumed by a static stylesheet rule) would let `style-src` drop `'unsafe-inline'` entirely — tracked already as a known follow-up.

### F7 — Dependabot does not track the npm ecosystem (Info — deliberate, verified consistent)

**Evidence:** `.github/dependabot.yml:1-18` — only `github-actions` and `docker` ecosystems configured; comment at lines 11-14 explicitly states npm is "deliberately NOT tracked here — production deps are already gated by audit-ci in ci.yml, a separate concern" and cites a guarding test `.github/__tests__/dependabot.test.js`.

**Description:** This means npm dependencies get no automatic Dependabot version-bump PRs (routine minor/patch updates), only the `audit-ci`-gated vulnerability check in `ci.yml` on every push/PR, plus GitHub's platform-level Dependabot security alerts (which operate independently of this repo's `dependabot.yml` and are unaffected by this scoping). This is a defensible design choice — it avoids Dependabot PR noise for a small, deliberately curated runtime dependency list (`CLAUDE.md`/`SECURITY.md` both note the runtime surface is intentionally small: React, React Router, i18next, Recharts, canvas-confetti) — but it does mean routine dependency staleness (not just known-CVE staleness) isn't proactively surfaced the way it is for the Docker base images and GitHub Actions.

**Recommendation:** No change required; this is consistent with the project's stated policy. If dependency staleness (as opposed to only vulnerability exposure) becomes a concern, adding a low-frequency (e.g. monthly) npm Dependabot config scoped to minor/patch-only updates would close the gap without the PR-volume downside of full tracking.

---

## What's Already Solid

Confirmed by direct source/config inspection (not just trusting `SECURITY.md`'s prose):

- **No XSS injection surface found.** Repo-wide grep across `src/` for `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `document.write`, `eval(`, `new Function(` returns zero matches in application code (the one `innerHTML` hit is in a test file resetting `document.body.innerHTML` between test cases — not app code). All user/child/parent-entered data (`childName`, scores, settings) is rendered exclusively through React, which escapes by construction.
- **The one place stored data is interpolated into executable context is deliberately sanitized.** `sanitizeGaId()` in `src/App.jsx:41-43` strips everything outside `[A-Za-z0-9_-]` from the stored GA Measurement ID before building the `gtag/js?id=...` script URL, and the script element is only created when a non-empty sanitized ID exists (`src/App.jsx:45-61`). CSP `script-src` is a genuine second, independent backstop restricting execution to `'self'` and `googletagmanager.com`.
- **`localStorage` reads are defensively parsed.** Every `get*` method in `src/storage/localStorageAdapter.js` wraps `JSON.parse` in try/catch and validates the parsed shape (object-not-array checks, nested-field validation for badge data) before returning, falling back to safe defaults on any malformed/tampered data — good defense-in-depth even though the stated threat model (same-origin `localStorage`) already limits who could seed a malicious value.
- **Parental lock is honestly scoped and doesn't overclaim.** `src/lib/parentalLock.js` and `src/components/ParentalLockGate.jsx` implement a plaintext-PIN/math-challenge gate explicitly documented (in code comments, not just `SECURITY.md`) as a toddler deterrent, not an access-control boundary — an accurate characterization given the PIN is stored in the same client-visible `localStorage` settings blob it's meant to gate. Gated children (`<AdminPage>`/`<ParentDashboard>`) are never mounted while locked (confirmed via `ParentalLockGate.jsx:38-40` returning early before rendering `children`), so no settings/score data reaches the DOM pre-unlock — a real (if modest) protection against casual snooping, distinct from the PIN's toddler-deterrent purpose.
- **CSV export is defused against formula injection.** `src/utils/dashboardUtils.js:139-142` (`escapeCsvField`) prefixes any field starting with `=`, `+`, `-`, or `@` with a leading apostrophe before quoting — the standard mitigation for Excel/Sheets formula-injection via CSV export, correctly applied to a genuine untrusted-adjacent field (parent/child-entered names, game data) that leaves the app as a downloadable file.
- **HTTP security headers are comprehensive and correctly architected against nginx's `add_header` inheritance-cancellation footgun.** `nginx/security-headers.conf` is `include`d in the top-level `server` block and in every `location` block that sets its own `add_header` (the asset-caching and manifest blocks in `nginx.conf`) — the exact pattern needed to avoid nginx silently dropping inherited headers on those routes. Both a static test (`nginx/__tests__/securityHeaders.test.js`) and a live e2e test (referenced in `SECURITY.md`, not independently re-run in this audit) guard the pattern. Headers present: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, a real `Content-Security-Policy` (default-deny with narrow allowlists), and `Permissions-Policy` denying camera/microphone/geolocation/payment. `server_tokens off;` suppresses nginx version disclosure.
- **Docker image is genuinely hardened.** Verified in `Dockerfile`: multi-stage build (build toolchain never reaches the runtime image), `nginxinc/nginx-unprivileged:1.31-alpine` base pinned to major.minor, runtime `USER 101` (non-root; the `apk update && apk upgrade` step correctly runs as root before dropping back to uid 101), no secrets/env vars baked in, `EXPOSE 8080` with host-side remapping to `32800` in `docker-compose.yml` (matches the recent port-change commits) rather than any privileged low port.
- **CI/CD supply chain hardening is real, not aspirational.** Verified directly in the workflow YAML: every third-party GitHub Action in `ci.yml`, `security.yml`, and `docker-image.yml` is pinned to a full commit SHA (with a version comment), workflow-level `permissions: contents: read` defaults with narrow per-job overrides only where SARIF upload requires `security-events: write`, and `.github/dependabot.yml` keeping both the SHA pins and Docker base-image tags current. Three independent scanning layers confirmed present and distinct: `audit-ci`-gated `npm audit` (production tree, moderate+, one narrowly-scoped dated allowlist entry) in `ci.yml`; Trivy image scanning of the actual pushed release artifact (not just a proxy build) in `docker-image.yml`, gated on fixable CRITICAL/HIGH; and CodeQL SAST + Trivy filesystem scan in `security.yml`, both also running on a weekly schedule to catch newly-disclosed CVEs between commits.
- **`npm audit --production` was run as part of this audit** and confirms the dependency tree contains exactly the one previously-known, already-triaged, already-allowlisted advisory (F3) — no new production-tree findings.
- **Analytics is opt-in, minimal, and honestly scoped for a children's product.** GA4 is off unless a parent enters a Measurement ID; only route-path page-views are sent (confirmed no name/score/settings data appears in the `gtag('event', 'page_view', { page_path: location.pathname })` call at `src/App.jsx:63-65`); the COPPA-adjacent reasoning in `SECURITY.md` (self-hosted, single-family, parent-enabled analytics has no COPPA exposure in this deployment model) is a reasonable and clearly-stated position, with an explicit trigger for revisiting it (multi-family distribution or expanded analytics scope) rather than treating it as settled forever.
- **Documentation is unusually rigorous and self-critical.** `SECURITY.md` states known gaps plainly (no HSTS in-container) rather than omitting them, and its audit history shows a genuine pattern of finding real (if low-severity) issues and fixing them (SEC-1 through SEC-6, the CI/CD hardening batch) rather than rubber-stamping. This audit corroborates that every specific, checkable claim in the document matches the current source.

---

## Recommendations (Prioritized)

1. **(Low effort, Low priority)** Add `.playwright-mcp/` to `.gitignore` and delete the stray `dotnet-hosting-8-0-29-win.exe` from the working tree (F2).
2. **(Low effort, Low priority)** Wrap `localStorage.setItem` calls in `src/storage/localStorageAdapter.js` in try/catch, surfacing a failure state instead of an uncaught throw on quota exhaustion (F1).
3. **(Low effort, cleanup)** Remove or wire up the unused `APP_VERSION` build-arg in `docker-image.yml`/`Dockerfile` (F4).
4. **(No urgency, already tracked)** Continue the existing plan to upgrade to React 19 + react-router 8 before the `GHSA-qwww-vcr4-c8h2` allowlist's 180-day re-review marker expires, to remove the exception entirely rather than re-date it indefinitely (F3).
5. **(No urgency, already tracked)** If the CSP is ever tightened, migrate per-item inline `style` attributes to CSS custom properties so `style-src 'unsafe-inline'` can be dropped (F6).
6. **(Optional, policy choice)** Consider a low-frequency npm Dependabot config (minor/patch only) if routine dependency staleness — distinct from known-vulnerability staleness — becomes a concern (F7).

None of the above are urgent; nothing found in this audit rises to Medium or higher.

---

## Other Areas Noticed (Not Deep-Dived — Cross-Cutting List)

Flagged per the audit brief for a separate cross-cutting pass, not analyzed further here:

- **`.playwright-mcp/` contains a 112 MB `.exe` installer unrelated to this project** sitting in the repo working directory — looks like accidental tool output from an unrelated session, not just a security/gitignore issue but general workspace hygiene.
- **`docker-image.yml`'s `APP_VERSION` build-arg is dead configuration** (F4) — worth a cleanup pass independent of security, since `CLAUDE.md` states app version comes from `package.json` at build time, making this build-arg's original purpose unclear from current code alone.
- **`test-results/.last-run.json` exists in the working tree** (gitignored, so not a repo hygiene issue, but confirms Playwright was run locally outside this audit's scope) — no content concern, just noting it was observed.
- **Dependabot's npm-ecosystem exclusion (F7)** is a policy choice worth the team explicitly re-affirming periodically, since it's easy for "audit-ci covers it" to quietly stop being true if `ci.yml`'s npm-audit job configuration ever drifts.
