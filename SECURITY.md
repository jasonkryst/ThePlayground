# Security

This document is both the security **posture** description for The Playground (what the app does and doesn't do with data, what its attack surface is, what protections are in place) and its vulnerability **reporting policy** (bottom of this document).

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

The only PII in the system is an optional first name, entered by the parent, displayed in the dashboard title, and stored locally. Nothing is transmitted anywhere — with one deliberate, opt-in exception: Google Analytics, below.

Practical corollaries: clearing browser site data erases everything (backup path: the Parent Dashboard's CSV export — see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#data-persistence--backup)), and physical access to the device/browser profile is access to the data. There is no server to breach.

## Analytics and children's privacy

Google Analytics 4 is **off by default** and stays off unless a parent deliberately enters a GA4 Measurement ID on the admin page. When enabled, the GA script loads at runtime and page-view events (route paths only — no names, scores, or settings) are sent on navigation. Clearing the field disables tracking entirely.

Children's-privacy assessment (also recorded in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md)): as a self-hosted app with analytics off by default and enabled only by the child's own parent for their own household, the app has no COPPA exposure in its intended use. That analysis should be revisited if the app is ever distributed to other families with GA enabled by default, or if any analytics beyond page views are added.

## XSS surfaces and mitigations

A no-backend SPA's main runtime risk is cross-site scripting. The surfaces and their mitigations:

- **Rendered strings** — every user-influenced string (the child's name, score history, any stored value) is rendered through React, which escapes by construction. The codebase contains **no** `dangerouslySetInnerHTML` (grep-verified as part of this document's last review).
- **The GA script loader** — the one place the app builds a script URL from stored data. `sanitizeGaId` (`src/App.jsx`) strips every character outside `[A-Za-z0-9_-]` from the stored ID before it is interpolated into `https://www.googletagmanager.com/gtag/js?id=…`, so a corrupted or maliciously seeded `localStorage` value cannot break out of the URL or inject markup. The script element is only created when a non-empty sanitized ID exists.
- **`localStorage` values generally** — treated strictly as data: parsed as JSON, rendered through React, never `eval`'d or written into HTML. Note that `localStorage` is *within* the browser's same-origin protection; seeding it maliciously already requires code running on the origin.

## HTTP security headers

Shipped in the Docker image's [`nginx.conf`](nginx.conf) (mechanics annotated in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#nginx-configuration-annotated)):

| Header | Value | Protects against |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | MIME-type sniffing — browsers executing a mislabeled file as a script |
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking — third-party sites framing the app to hijack taps |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Leaking full URLs to external destinations (relevant only to the GA request and the freesound.org link) |

### Known gaps

Stated plainly rather than papered over (each is tracked in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md#security)):

- **No `Content-Security-Policy`.** A CSP is the strongest structural XSS defense and this app doesn't ship one yet. A workable policy needs the GA script/connect sources allowed when analytics is on, and must accommodate the app's legitimate per-item inline `style` attributes — it needs to be designed and tested, not bolted on.
- **No HSTS / TLS in the container.** Deliberate: the image serves plain HTTP, and TLS termination (with HSTS) belongs at the reverse proxy in front of it — see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#https--running-behind-a-reverse-proxy). A home-LAN deployment without TLS is accepting that traffic is readable on the local network.

## Docker posture

- **Official base images only:** `node:lts-alpine` (build), `nginx:alpine` (runtime).
- **Multi-stage build:** node, npm, `node_modules`, and the source tree never enter the runtime image — a compromise of the running container yields a static file server and public assets, not a toolchain.
- **Stateless runtime:** no volumes, no secrets, no env vars in the image; nothing sensitive to exfiltrate server-side.
- **Hardening backlog** (tracked in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md#security)): running nginx as a non-root user, and automated image vulnerability scanning.

## Dependency policy

- Installs are pinned by the committed `package-lock.json` and built with `npm ci`, so the artifact is reproducible and not subject to install-time version drift.
- `npm audit` is run manually today; wiring it (and the rest of the test suite) into CI is a tracked enhancement.
- Runtime dependency surface is deliberately small (React, React Router, i18next, Recharts, canvas-confetti); the larger dev-dependency tree never ships to users.

## Supported versions

| Version | Supported |
|---|---|
| Latest minor (0.24.x) | ✅ |
| Older | ❌ — it's a static site; the upgrade path is `git pull` and redeploy ([`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#updating-a-running-deployment)) |

## Reporting a vulnerability

If you find a security issue:

1. **Preferred:** use GitHub's private vulnerability reporting on this repository (**Security tab → Report a vulnerability**), so details stay private until a fix exists.
2. For clearly non-sensitive issues (e.g. a hardening suggestion), a regular GitHub issue is fine.

Please include reproduction steps, the affected area (browser runtime / server config / dependency), and your assessment of impact. This is a family-run open-source project, not a company with a security team — reports are genuinely appreciated and will be handled on a best-effort basis, typically within days.
