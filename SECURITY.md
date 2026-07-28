# Security

This document is both the security **posture** description for The Playground (what the app does and doesn't do with data, what its attack surface is, what protections are in place) and its vulnerability **reporting policy** (bottom of this document).

**Last full audit:** 2026-07-12 — findings and verified-safe observations recorded in [`docs/superpowers/specs/2026-07-12-security-audit-findings.md`](docs/superpowers/specs/2026-07-12-security-audit-findings.md) (no HIGH-severity findings; one MEDIUM nginx misconfiguration — SEC-1, fixed 2026-07-17, issue #84). Of the five hardening/preventive items: SEC-4 fixed 2026-07-18 (issue #85); SEC-2, SEC-3, and SEC-5 fixed 2026-07-18 (issue #86); SEC-6 is informational (dev-only dependency advisories, no action needed). All tracked in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md#security).

## Scope

The Playground is a self-hosted, browser-based game dashboard for infants and toddlers, typically run by one family on a home network or private server. It is not a hosted service and has no central operator. This document describes the app as shipped; anyone self-hosting it is responsible for the environment around it (TLS, network exposure — see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)).

## Architecture from a security standpoint

The Playground is a **fully static single-page application**:

- No backend, no API, no database server
- No user accounts, no authentication, no sessions, no cookies
- No server-side data of any kind — the Docker container is a static file server (nginx) and static files, nothing else
- No environment variables or secrets at build or run time

That reduces the attack surface to three areas, each addressed below: the **browser runtime** (XSS), the **static file server** (HTTP headers, hosting), and the **supply chain** (npm dependencies, Docker base images).

## Data inventory

Everything the app persists lives in the browser's `localStorage`, on the device that played the games:

| Data | Contents | Leaves the device? |
|---|---|---|
| Scores | Per-session results: game id, score, per-question timings, streaks; memory games add flip/mismatch counts and duration | No |
| Settings | All admin-page options, including the child's **first name** (optional, parent-entered) and the **GA4 Measurement ID** (optional) | No |
| Best streaks | Highest answer streak per game | No |
| Personal bests | Best accuracy/speed (quiz), fewest flips / fastest time per board size (memory) | No |
| Badge data | Earned badges and lifetime counters per game | No |
| Parental lock PIN | Optional 4-digit PIN a parent sets to gate `/admin`/`/parent`; stored in plaintext alongside other settings (see below) | No |

The only PII in the system is an optional first name, entered by the parent, displayed in the dashboard title, and stored locally. Nothing is transmitted anywhere — with one deliberate, opt-in exception: Google Analytics, below.

Practical corollaries: clearing browser site data erases everything (backup path: the Parent Dashboard's CSV export, which RFC 4180-quotes every field and defuses spreadsheet formula injection — see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#data-persistence--backup)), and physical access to the device/browser profile is access to the data. There is no server to breach.

## Analytics and children's privacy

Google Analytics 4 is **off by default** and stays off unless a parent deliberately enters a GA4 Measurement ID on the admin page. When enabled, the GA script loads at runtime and page-view events (route paths only — no names, scores, or settings) are sent on navigation. Clearing the field disables tracking entirely.

Children's-privacy assessment (also recorded in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md)): as a self-hosted app with analytics off by default and enabled only by the child's own parent for their own household, the app has no COPPA exposure in its intended use. That analysis should be revisited if the app is ever distributed to other families with GA enabled by default, or if any analytics beyond page views are added.

## Parental lock

`/admin` and `/parent` are gated behind an unlock challenge (issue #127), on by default: a generated math problem (e.g. "What's 7 + 8?"), or a parent-set 4-digit PIN if one has been configured in Settings. This is a **toddler deterrent, not an access-control boundary** — consistent with this app's overall threat model (no accounts, no server, physical access to the device is already access to the data):

- The PIN is stored in plaintext in the same `localStorage` settings object as everything else — hashing a client-side secret that's checked by client-side JavaScript against client-side storage provides no real protection, since the comparison code and the stored value are both fully visible to anyone with the access a hash would be defending against.
- There is no rate-limiting or lockout on wrong attempts — this app has no attacker model to defend against beyond a curious child, and a lockout would only risk locking out the parent.
- **There is no PIN recovery.** A forgotten PIN has no reset flow beyond the same "clear browser site data" wipe this document already describes for score/settings data loss (see Data inventory, above) — clearing site data also removes the PIN, reverting to the default math challenge.
- Unlocking is scoped to the browser session (`sessionStorage`), not persisted (`localStorage`): navigating between `/admin` and `/parent` within the same visit doesn't re-prompt, but closing the tab or browser re-locks it.

## XSS surfaces and mitigations

A no-backend SPA's main runtime risk is cross-site scripting. The surfaces and their mitigations:

- **Rendered strings** — every user-influenced string (the child's name, score history, any stored value) is rendered through React, which escapes by construction. The codebase contains **no** `dangerouslySetInnerHTML` (grep-verified as part of this document's last review).
- **The GA script loader** — the one place the app builds a script URL from stored data. `sanitizeGaId` (`src/App.jsx`) strips every character outside `[A-Za-z0-9_-]` from the stored ID before it is interpolated into `https://www.googletagmanager.com/gtag/js?id=…`, so a corrupted or maliciously seeded `localStorage` value cannot break out of the URL or inject markup. The script element is only created when a non-empty sanitized ID exists. The `Content-Security-Policy`'s `script-src` (below) is a second, independent backstop: even if a future bug widened what could be interpolated into a script tag, only `'self'` and `https://www.googletagmanager.com` can ever execute. Subresource integrity was considered and rejected for this loader — the gtag URL serves Google-rotated content, so a script-hash pin would break on rotation; the `script-src` allowlist is the practical control instead.
- **`localStorage` values generally** — treated strictly as data: parsed as JSON, rendered through React, never `eval`'d or written into HTML. Note that `localStorage` is *within* the browser's same-origin protection; seeding it maliciously already requires code running on the origin.

## HTTP security headers

Declared in the Docker image's [`nginx.conf`](nginx.conf) (mechanics annotated in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#nginx-configuration-annotated)):

| Header | Value | Protects against |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | MIME-type sniffing — browsers executing a mislabeled file as a script |
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking — third-party sites framing the app to hijack taps |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Leaking full URLs to external destinations (relevant only to the GA request and the freesound.org link) |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' https://www.googletagmanager.com; connect-src 'self' https://*.google-analytics.com https://*.googletagmanager.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; media-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'` | The strongest structural XSS defense — restricts script/style/connect/image/media sources to first-party plus the opt-in GA hosts; blocks plugin content and framing outright |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | A future third-party script (i.e. if GA's payload ever changed) trying to use device APIs the app has no legitimate use for |

**Fixed (audit finding SEC-1, issue #84):** the two asset `location` blocks declare their own `add_header Cache-Control`, which per nginx's documented inheritance rule cancels inheritance of any `add_header` from the enclosing `server` block. All three headers now come from a shared [`nginx/security-headers.conf`](nginx/security-headers.conf) snippet, `include`d in the `server` block *and* in both asset `location` blocks — so a location that declares its own `add_header` still gets them. Each header also carries `always`, so it's sent on error responses (e.g. a 404 for a missing asset) too, not just 2xx/3xx. Two guards keep this from regressing: a static check (`nginx/__tests__/securityHeaders.test.js`) that fails if a future `location` block sets `add_header` without including the snippet, and a live e2e check (`e2e/nginx-headers.spec.js`) that boots the real config in nginx and asserts the headers on every asset type plus a 404.

**Fixed (audit findings SEC-2/SEC-3, issue #86):** `Content-Security-Policy` and `Permissions-Policy` now live in the same shared `nginx/security-headers.conf` snippet as the original three headers, so they get identical `include`-everywhere coverage — no new inheritance risk to guard. `server_tokens off;` (nginx version disclosure) is set directly in `nginx.conf`'s `server` block; it isn't an `add_header`, so SEC-1's inheritance rule doesn't apply to it. `style-src` still needs `'unsafe-inline'` for the app's legitimate per-item inline `style` attributes — tightening that further (nonces or a refactor to CSS custom properties) is a deliberately separate follow-up, not part of this fix. Full design rationale: [`docs/superpowers/specs/2026-07-18-security-hardening-design.md`](docs/superpowers/specs/2026-07-18-security-hardening-design.md). Guarded the same way as SEC-1: a static test (directive-level assertions on the CSP, exact-value assertion on `Permissions-Policy`, and a `server_tokens off;` presence check) and a live e2e check (asserts both headers plus a `Server` header with no version on a real container).

### Known gaps

Stated plainly rather than papered over (each is tracked in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md#security)):

- **No HSTS / TLS in the container.** Deliberate: the image serves plain HTTP, and TLS termination (with HSTS) belongs at the reverse proxy in front of it — see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#https--running-behind-a-reverse-proxy). A home-LAN deployment without TLS is accepting that traffic is readable on the local network.

## Docker posture

- **Official base images, pinned:** `node:24-alpine` (build), `nginxinc/nginx-unprivileged:1.30-alpine` (runtime) — both pinned to a major.minor version rather than a floating tag, for reproducible builds (issue #85).
- **Non-root runtime:** nginx runs as its image's built-in non-root `nginx` user (uid 101), not root — a container-escape or nginx RCE chain starts with less privilege (issue #85).
- **Multi-stage build:** node, npm, `node_modules`, and the source tree never enter the runtime image — a compromise of the running container yields a static file server and public assets, not a toolchain.
- **Stateless runtime:** no volumes, no secrets, no env vars in the image; nothing sensitive to exfiltrate server-side.
- **Automated image vulnerability scanning (SEC-4 remainder, issue #132):** the `trivy` job in `.github/workflows/ci.yml` scans the built image with Trivy on every push/PR. A gate step fails the job on CRITICAL/HIGH findings with an available fix (`ignore-unfixed: true` skips upstream OS-package CVEs with no patch yet, so the gate only trips on actionable findings). A second step, which runs even if the gate failed, scans every severity including unfixed findings and uploads the result as SARIF to this repository's Security tab, so lower-severity or currently-unfixable findings stay visible for tracking without ever blocking a merge — the same posture `npm audit`'s dev-tree report already uses below.

## Dependency policy

- Installs are pinned by the committed `package-lock.json` and built with `npm ci`, so the artifact is reproducible and not subject to install-time version drift.
- **`npm audit` runs in CI on every push/PR (issue #87), gated via `audit-ci` (issue #141):** `.github/workflows/ci.yml`'s `npm-audit` job fails on moderate+ severity findings in the production dependency tree (`audit-ci --moderate --skip-dev`); findings in the dev-only tree (e.g. the Storybook 8 chain's 3 moderate advisories, SEC-6) are reported to the run's step summary but never block a merge. Plain `npm audit` has no per-advisory exception mechanism, so the gate moved to `audit-ci`, which adds one: `GHSA-qwww-vcr4-c8h2` (react-router "RSC Mode CSRF Bypass Allows Action Execution Before 400 Response") is allowlisted — this app is a client-only SPA using `BrowserRouter`, never react-router's RSC/framework mode, so the vulnerable path isn't reachable here — but every other moderate+ finding in the production tree, present or future, still fails the gate exactly as before. The allowlist is scoped to that one advisory ID only (guarded by a negative CI test); it's a stopgap, not a fix — `docs/ENHANCEMENTS.md` tracks the real fix (upgrade to React 19 + react-router 8, which requires React ≥19.2.7 and is a larger change than this gate) as a backlog item.
- Runtime dependency surface is deliberately small (React, React Router, i18next, Recharts, canvas-confetti); the larger dev-dependency tree never ships to users.
- **`canvas-confetti` is deliberately kept off its own default Worker path.** Its bare default export lazily builds a shared cannon with `useWorker: true`, which loads its animation loop from a `blob:` Web Worker — this app's CSP has no `worker-src`, so per spec that falls back to `script-src`, which doesn't allow `blob:`, silently killing the worker and the celebration animation with it (issue #109). `src/lib/confetti.js` builds its own cannon via `create(null, { useWorker: false })` instead, forcing main-thread rendering. Don't add `worker-src blob:` to the CSP to "fix" this a different way without removing that `useWorker: false` — the two are redundant, and loosening the CSP is the wider-attack-surface option of the two (see the issue #109 fix notes in `CHANGELOG.md`).

## Supported versions

| Version | Supported |
|---|---|
| Latest minor (0.40.x) | ✅ |
| Older | ❌ — it's a static site; the upgrade path is `git pull` and redeploy ([`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#updating-a-running-deployment)) |

## Reporting a vulnerability

If you find a security issue:

1. **Preferred:** use GitHub's private vulnerability reporting on this repository (**Security tab → Report a vulnerability**), so details stay private until a fix exists.
2. For clearly non-sensitive issues (e.g. a hardening suggestion), a regular GitHub issue is fine.

Please include reproduction steps, the affected area (browser runtime / server config / dependency), and your assessment of impact. This is a family-run open-source project, not a company with a security team — reports are genuinely appreciated and will be handled on a best-effort basis, typically within days.
