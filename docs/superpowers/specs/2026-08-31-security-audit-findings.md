# Security Delta Re-Audit — 2026-08-31

Companion to `SECURITY.md` (the ongoing posture document). Follows the
precedent of `2026-07-12-security-audit-findings.md` (full audit) and
`2026-07-28-full-audit-findings.md` § Security (first delta audit). This is
the second delta pass: re-verify every standing claim against current
code/config, and specifically review everything shipped since 2026-07-28.
Actionable findings are tracked in `docs/ENHANCEMENTS.md` § Security; this
record is historical and is not edited retroactively.

App version at audit time: `1.1.5` (branch `docs/audit-and-refresh`, off
`main` @ `8e2044f` / PR #188).

## Scope

Static/manual review only — no code was built or run as part of this audit
(a concurrent sibling task was exercising the dev server, build, and e2e
suite in this same working tree, so this pass stayed read-only to avoid
collision). Re-verified every SEC-1–SEC-6 claim in `SECURITY.md` against the
live `nginx.conf`, `nginx/security-headers.conf`, `Dockerfile`,
`.github/workflows/*.yml`, and `.github/dependabot.yml`; grepped `src/` for
unsafe DOM sinks; read `src/App.jsx` (GA loader), `src/utils/dashboardUtils.js`
(CSV export), `src/lib/confetti.js`, `src/lib/parentalLock.js`,
`src/utils/sessionResume.js`, and the session-resume/item-stats methods in
`src/storage/localStorageAdapter.js`; reviewed `vite.config.js`'s PWA/Workbox
config; walked `git log --since=2026-07-28` for every commit touching a
security-relevant file.

**Result: no new findings. Everything re-verified as holding exactly as
documented — zero drift between `SECURITY.md`'s prose and the actual
shipped config/code.**

---

## Re-verified holding (no regressions)

- **No unsafe DOM sinks in `src/`** — a fresh grep for `dangerouslySetInnerHTML`,
  `new Function(`, `document.write`, `window.open`, `target="_blank"`, and
  `.innerHTML =` returns zero matches in application code (the one hit,
  `document.body.innerHTML = ''` in `useFitTileSize.test.js`, is test
  teardown, not app code). A bare `eval(` grep is also clean.
- **`sanitizeGaId`** (`src/App.jsx:41-43`) still strips everything outside
  `[A-Za-z0-9_-]` before the GA script URL is built; the script element is
  still only created when a non-empty sanitized ID exists (`src/App.jsx:50-61`).
- **Headers verbatim match.** `nginx/security-headers.conf` and `nginx.conf`
  contain byte-for-byte the same five headers, `server_tokens off;`, and
  `include` placement (all three `location` blocks plus the
  `manifest.webmanifest` block) that `SECURITY.md` documents. No new
  `location` block has been added since #145 that could reintroduce SEC-1.
- **Docker base images unchanged and still pinned**: `node:24-alpine` (build
  stage), `nginxinc/nginx-unprivileged:1.30-alpine` (runtime stage) — matches
  `SECURITY.md`'s Docker posture section and `docs/DEPLOYMENT.md` exactly.
- **CSV export**: `escapeCsvField` (`src/utils/dashboardUtils.js:139-143`)
  still RFC 4180-quotes every field and defuses `=`/`+`/`-`/`@` prefixes;
  `buildCsvContent` still routes every emitted field through it.
- **Confetti CSP workaround intact**: `src/lib/confetti.js:20` still calls
  `create(null, { resize: true, useWorker: false })`; no `worker-src` was
  added to the CSP (confirmed above — headers are byte-identical to what's
  documented).
- **Parental lock unchanged**: `src/lib/parentalLock.js` — PIN/math-challenge
  logic is exactly as documented (plaintext PIN alongside other settings,
  no rate-limiting by design, session-scoped unlock). No new mode added.
- **CI/CD posture matches `SECURITY.md` exactly**: workflow-level
  `permissions: { contents: read }` default in `ci.yml`; `trivy` job's own
  `security-events: write` override; every third-party action in `ci.yml`
  and `docker-image.yml` is still commit-SHA-pinned (spot-checked all of
  them, including the Dependabot-driven bumps below); `npm-audit` job's gate
  command (`audit-ci --moderate --skip-dev --allowlist GHSA-qwww-vcr4-c8h2`)
  and dev-tree report-only step unchanged; `trivy` job's gate
  (CRITICAL/HIGH, `ignore-unfixed: true`) + always-run full-severity SARIF
  upload unchanged; `docker-image.yml`'s build-once-locally →
  Trivy-scan-that-exact-image → tag/push ordering unchanged.
- **`audit-ci` re-run locally**: 2 high findings (`GHSA-qwww-vcr4-c8h2`,
  react-router), both allowlisted, gate passes — identical to the documented
  state, no new production-tree advisories.
- **Dependabot**: `.github/dependabot.yml` tracks exactly `github-actions`
  and `docker` ecosystems, weekly, matching `SECURITY.md` and
  `docs/TESTING.md`'s CI section; npm still deliberately absent.
- **`git log --since=2026-07-28`** on every security-relevant file (nginx
  configs, `Dockerfile`, `.github/workflows/`, `.github/dependabot.yml`,
  `src/App.jsx`, `dashboardUtils.js`, `confetti.js`, `vite.config.js`) shows
  only: routine Dependabot version-bump PRs (all SHA re-pinned correctly —
  `actions/checkout` → v7.0.1, `actions/setup-node` → v7.0.0,
  `docker/setup-buildx-action` → v4.2.0, `docker/login-action` → v4.6.0,
  `actions/upload-artifact` → v7.0.1, `github/codeql-action/upload-sarif` →
  v4.37.7, `browser-actions/setup-chrome` → v2.2.0), the docker-ecosystem
  Dependabot addition (issue #148, already reflected in `SECURITY.md`), the
  `manifest.webmanifest` content-type fix (issue #175), and PWA support
  (issue #96) — no unreviewed change to any security-relevant surface.

## New surfaces reviewed since 2026-07-28 (no new risk found)

- **PWA / service worker** (`vite.config.js`): `workbox.globPatterns` only
  covers static build assets (`js,css,html,ico,png,svg,webp,woff2,mp3,wav`)
  — plain build-time file precaching, categorically separate from
  `localStorage`. A service worker cannot read `localStorage` (different
  storage API, and Workbox's generated SW here does no `runtimeCaching` of
  API responses — there's no API). No PII enters the precache; the app has
  none in its static assets.
- **Session-resume** (`src/utils/sessionResume.js`, the `getSessionResume`/
  `saveSessionResume`/`clearSessionResume` trio in
  `src/storage/localStorageAdapter.js:102-117`): the same defensive
  JSON-parse-with-shape-check pattern as every other adapter method
  (try/catch, object-shape guard, safe fallback). Persisted state is
  app-generated session progress (queue position, timings, item IDs) — no
  new free-text or PII field introduced.
- **Item stats** (`getItemStats`/`saveItemStats`,
  `localStorageAdapter.js:89-100`): same defensive pattern; keyed by
  manifest-defined `itemId`s (developer-authored, not user input) plus a
  miss count and timestamp — no new attack surface.
- **New games since the last audit** (Character Match: Bluey, Emotions
  Match, Number Tap): all render images/icons resolved through the existing
  build-time `ManifestIcon`/`gameIcons.js` glob pattern already covered by
  the 2026-07-12 audit's "verified-safe" list — no per-game code introduces
  a new `src`/URL construction path from user input.
- **`docker-image.yml`'s `APP_VERSION` build-arg** (new since the last
  security pass, first noticed this audit): passed as a `docker/build-push-action`
  build-arg from `steps.vars.outputs.version`, itself derived from the
  release tag name via shell string-stripping (`${VERSION_TAG#v}`). Not a
  secret, not attacker-controlled independent of who can publish a GitHub
  Release (already a trusted-maintainer action), and not something the
  Dockerfile currently consumes to build a URL or command — informational
  only, no finding.

## CVE allowlist re-review status

The `GHSA-qwww-vcr4-c8h2` allowlist entry's dated marker is `2026-07-28`.
As of this audit (2026-08-31), that's **34 days old — 146 days remain**
before `.github/__tests__/ci.test.js`'s 180-day staleness check trips. No
action needed yet; next audit should re-check this arithmetic rather than
assume it's still fine.

## Findings

None. Zero new findings this pass — every standing claim in `SECURITY.md`
re-verified as accurate, and every new surface shipped since 2026-07-28
(PWA precache, session-resume, item-stats, three new games, the
`APP_VERSION` build-arg) reviewed with no new risk identified.

---

## Recommended `SECURITY.md` header update

Append a third audit line, mirroring the existing two-line format:

> **Second delta re-audit:** 2026-08-31 — re-verified every item above (full
> audit 2026-07-12, first delta 2026-07-28) with no regressions and no new
> findings; reviewed every surface shipped since (PWA/service worker,
> session-resume, item-stats, three new games) with no new risk identified.
> CVE allowlist marker (`GHSA-qwww-vcr4-c8h2`, dated 2026-07-28) has 146 days
> left before its 180-day re-review trigger.

## `docs/ENHANCEMENTS.md` § Security

No new entries warranted — no new findings. The existing "Upgrade to React
19 + react-router 8" entry (which removes the need for the CVE allowlist)
remains the only open Security backlog item; still accurate, no change
needed.
