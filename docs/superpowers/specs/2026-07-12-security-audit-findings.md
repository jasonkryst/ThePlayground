# Security Audit Findings — 2026-07-12

Full-application security audit of The Playground at v0.24.5 (branch `61`).
Companion to `SECURITY.md` (the ongoing posture document); this file is the
point-in-time audit record, following the precedent of
`2026-07-05-standards-audit-findings.md`. Actionable findings are tracked in
`docs/ENHANCEMENTS.md` § Security and are removed from that backlog as they
ship; this record is historical and is not edited retroactively.

## Scope & methodology

Audited surfaces (the full app, not a diff):

- **Browser runtime:** every rendering path for user-influenced data
  (child's name, admin tag overrides, GA ID, localStorage contents),
  dynamic script/URL construction, i18n interpolation, CSV export.
- **Static file server:** `nginx.conf` directive semantics, header
  coverage, cache behavior.
- **Container:** `Dockerfile`, `docker-compose.yml`, `.dockerignore`,
  base-image and runtime-user posture.
- **Supply chain:** `npm audit` (production and full trees), lockfile
  install discipline.

Method: manual code review of every identified sink (greps for
`dangerouslySetInnerHTML`, `eval`, `new Function`, `innerHTML`,
`document.write`, `window.open`, `target="_blank"`; full reads of
`localStorageAdapter.js`, `i18n/index.js`, `dashboardUtils.js`,
`ManifestIcon.jsx`, `App.jsx` GA loader), `npm audit` execution, and
directive-level analysis of `nginx.conf` against documented nginx
semantics. Live container verification of SEC-1 was not possible in this
session (Docker daemon not running); its confidence rating reflects that
it rests on unambiguous documented nginx behavior rather than an observed
response. Severity/confidence discipline: only concrete, actionable
findings are listed; theoretical or purely best-practice items were
either excluded or explicitly labeled as hardening.

**Result summary: no HIGH findings. One MEDIUM misconfiguration, four
LOW/hardening items, one informational. Production dependency tree: zero
known vulnerabilities.**

---

## Findings

| ID | Severity | Category | Summary |
|---|---|---|---|
| SEC-1 | Medium | security_misconfiguration | nginx security headers silently dropped on all static-asset responses (`add_header` inheritance) |
| SEC-2 | Low (hardening) | missing_csp | No Content-Security-Policy (known gap, now with a concrete starter policy) |
| SEC-3 | Low (hardening) | security_misconfiguration | No `Permissions-Policy`; nginx version disclosed via `Server` header |
| SEC-4 | Low (hardening) | supply_chain / container | Floating base-image tags; nginx master process runs as root |
| SEC-5 | Low (preventive) | csv_injection | CSV builder does no quoting/escaping — safe with today's fields, a footgun for future free-text fields |
| SEC-6 | Informational | vulnerable_dependency | 3 moderate advisories in the dev-only Storybook chain; production tree clean |

---

### SEC-1: Security headers dropped on static-asset responses — `nginx.conf:13-27`

- **Severity:** Medium · **Confidence:** 9/10
- **Description:** nginx's `add_header` is inherited from the enclosing
  level *if and only if* the current level defines no `add_header` of its
  own (documented behavior of `ngx_http_headers_module`). The three
  security headers are declared at `server` level, but both asset
  location blocks — `location ~* \.(js|css|woff2?|ttf|svg|ico|png|jpg|jpeg)$`
  and `location ~* \.mp3$` — declare their own `add_header Cache-Control`,
  which **cancels inheritance of all server-level headers for every
  response they serve**. Net effect: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: SAMEORIGIN`, and `Referrer-Policy` are present on
  HTML/document responses (served by `location /`, which has no
  `add_header`) but absent on every JS, CSS, font, image, and audio
  response. `nosniff` is the headline loss — script and style responses
  are exactly where MIME-sniffing protection is most relevant.
- **Exploit scenario:** No direct exploit on its own (correct
  `Content-Type` values are still sent); this is defense-in-depth that
  the config *intends* to provide but doesn't. It also makes
  `SECURITY.md`'s header table overstate actual coverage — a
  documentation-accuracy problem this audit corrects.
- **Recommendation:** Repeat the three security headers inside both asset
  `location` blocks (or factor all four `add_header` lines into a shared
  `include` file). Add an automated header assertion to the e2e suite (a
  Playwright request check against the preview/Docker server) so a future
  `location` addition can't silently reintroduce the drop. Tracked in
  `docs/ENHANCEMENTS.md` § Security.

### SEC-2: No Content-Security-Policy — `nginx.conf`

- **Severity:** Low (hardening) · **Confidence:** 10/10 (absence is a fact)
- **Description:** Already acknowledged as a known gap in `SECURITY.md`.
  The app is a strong CSP candidate: no inline `<script>`, no `eval`, all
  first-party assets. The complications are the opt-in GA loader
  (`https://www.googletagmanager.com` script + `https://*.google-analytics.com`
  connect) and the app's legitimate per-item inline `style` attributes.
- **Exploit scenario:** None today (no injection vector was found — see
  Verified-safe observations); a CSP is the structural backstop for the
  next code change that introduces one.
- **Recommendation:** Starter policy to iterate from, verified against
  the e2e suite before shipping:
  `default-src 'self'; script-src 'self' https://www.googletagmanager.com; connect-src 'self' https://*.google-analytics.com https://*.googletagmanager.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; media-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'`.
  `style-src 'unsafe-inline'` is required by the current per-item inline
  styles; tightening that further (nonces/refactor to CSS custom
  properties) is a second iteration. Supersedes `frame-ancestors` vs
  `X-Frame-Options` duplication concerns — ship both. Tracked in
  `docs/ENHANCEMENTS.md` § Security.

### SEC-3: Missing `Permissions-Policy`; version disclosure — `nginx.conf`

- **Severity:** Low (hardening) · **Confidence:** 10/10
- **Description:** (a) No `Permissions-Policy` header — the app uses no
  camera/microphone/geolocation/payment APIs, so denying them outright is
  free hardening against any future third-party script (i.e. GA, if
  enabled). (b) Default `server_tokens on` discloses the nginx version in
  the `Server` header and error pages; version disclosure eases
  fingerprinting of unpatched deployments.
- **Exploit scenario:** Neither is directly exploitable; both reduce the
  value of other bugs.
- **Recommendation:** Add
  `add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()";`
  (subject to the SEC-1 inheritance rule — put it wherever the other
  headers land) and `server_tokens off;` in the `server` block. Tracked
  in `docs/ENHANCEMENTS.md` § Security.

### SEC-4: Floating base images; root nginx — `Dockerfile:2,14`

- **Severity:** Low (hardening) · **Confidence:** 10/10
- **Description:** (a) `FROM node:lts-alpine` and `FROM nginx:alpine`
  float: every build silently takes whatever those tags point to that
  day, so a build is not reproducible and inherits upstream regressions
  unreviewed. (b) The stock nginx image's master process runs as root
  inside the container (workers drop to `nginx`); a container-escape or
  nginx RCE chain starts with more privilege than a static file server
  needs.
- **Exploit scenario:** Supply-chain and blast-radius reduction, not a
  direct vulnerability.
- **Recommendation:** Pin at least to major/minor (`nginx:1.27-alpine`)
  or by digest for reproducibility; consider the official
  `nginxinc/nginx-unprivileged` image (listens on 8080 as non-root —
  adjust the compose port mapping accordingly). Extends the existing
  container-hardening backlog entry; image scanning (Trivy) folds in once
  CI exists. Tracked in `docs/ENHANCEMENTS.md` § Security.

### SEC-5: CSV builder has no quoting/escaping — `src/utils/dashboardUtils.js:136-155`

- **Severity:** Low (preventive) · **Confidence:** 9/10 that it is *not*
  currently exploitable; the finding is the latent pattern
- **Description:** `buildCsvContent()` joins raw values with commas and
  newlines — no RFC 4180 quoting, no escaping of `= + - @` formula
  prefixes. It is safe **today** because every emitted field is
  app-generated (ISO dates, numeric scores/timings, manifest-defined
  `gameId`s); no free-text user input reaches the CSV. But the app
  stores parent-entered free text (`childName`, tag overrides), and the
  natural evolution of the export (adding a child-name column, or
  itemIds sourced from user-created content in a future game) would turn
  this into spreadsheet formula injection (`=HYPERLINK(...)`,
  `=cmd|...` in Excel) the day someone adds the column.
- **Exploit scenario (future-conditional):** A stored value beginning
  with `=` lands in an exported CSV; a parent opens it in Excel, which
  executes the formula — classic CSV injection, but it requires a column
  that doesn't exist yet.
- **Recommendation:** Harden `buildCsvContent` now while it's small:
  RFC 4180-quote every field (wrap in `"`, double embedded `"`) and
  prefix `'` to values starting with `=`, `+`, `-`, or `@`. Add unit
  tests with hostile inputs. Tracked in `docs/ENHANCEMENTS.md` § Security.

### SEC-6: Dev-only dependency advisories — `package-lock.json`

- **Severity:** Informational · **Confidence:** 10/10 (tool output)
- **Description:** `npm audit --omit=dev`: **0 vulnerabilities** — the
  tree that actually ships is clean. Full tree: 3 moderate advisories,
  all one root cause — `uuid` (missing buffer bounds check,
  GHSA-w5hq-g745-h8pq) reached only through
  `@storybook/addon-actions` → `@storybook/addon-essentials` (Storybook
  8.x, dev-only). The proposed `npm audit fix --force` downgrades
  Storybook to 7.0.6 — a breaking change that is worse than the risk it
  removes.
- **Exploit scenario:** None in production; Storybook code never enters
  `dist/` or the Docker image.
- **Recommendation:** No immediate action. Revisit when Storybook 9 is
  adopted; the existing "`npm audit` in CI" backlog entry should gate on
  `--omit=dev` (fail on prod-tree findings, report-only for dev-tree).

---

## Verified-safe observations (evidence, not vibes)

Recorded so the next audit doesn't re-derive them — and so regressions
against them are recognizable as regressions:

- **GA loader injection surface:** `sanitizeGaId` (`src/App.jsx:27-29`)
  strips all characters outside `[A-Za-z0-9_-]` before the stored GA ID
  is interpolated into the `googletagmanager.com` script URL; the script
  element is created only when a non-empty sanitized ID exists. The raw
  (unsanitized) value is stored, but every consumer sanitizes on use.
- **No unsafe DOM sinks:** zero matches across `src/` for
  `dangerouslySetInnerHTML`, `eval`, `new Function`, `innerHTML`,
  `document.write`, `window.open`, and `target="_blank"`. All rendering
  of user-influenced strings (child name, tags, score history) goes
  through React's escaping.
- **i18next `escapeValue: false`** (`src/i18n/index.js:55`) is safe
  *only because* every `t()` result renders through React. This is a
  standing constraint, now documented: never pass `t()` output to a
  non-React sink (`innerHTML`, `document.title` is fine — it's a text
  sink — but any future HTML string assembly is not).
- **localStorage parsing is defensive** (`src/storage/localStorageAdapter.js`):
  every getter wraps `JSON.parse` in try/catch, validates the parsed
  shape (array/object checks, per-field checks in `getBadgeData`), and
  falls back to safe defaults. Object spread merging
  (`{ ...DEFAULT_SETTINGS, ...migrated }`) does not traverse prototypes.
- **CSV export fields are all app-generated** (see SEC-5): dates,
  numerics, and manifest `gameId`s only; no free-text today.
- **Manifest-driven `img src`** (`ManifestIcon.jsx`) accepts only
  build-time, developer-authored manifest values — not a user input.
- **Build context hygiene:** `.dockerignore` excludes `.git`, tool state
  (`.claude`, `.superpowers`, `.remember`), `node_modules`, `dist`,
  `coverage` — no repo history or tooling secrets can leak into the
  image (and only `dist/` crosses into the runtime stage regardless).
- **No secrets anywhere:** no env vars, no API keys, no tokens in code,
  config, or image (the GA Measurement ID is not a secret — it is
  published to every visitor by design).

## Cross-document actions taken with this audit

- `docs/ENHANCEMENTS.md` § Security: SEC-1 through SEC-5 added as
  backlog entries (SEC-4 merged into the existing container-hardening
  entry; SEC-2 replaces the previous CSP line with the starter policy).
- `SECURITY.md`: header-coverage claim corrected per SEC-1 (headers
  currently apply to document responses only); known-gaps list extended;
  pointer to this audit added.
- `CHANGELOG.md` `[0.24.5]`: audit noted.
