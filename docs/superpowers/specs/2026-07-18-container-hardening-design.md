# Container hardening (issue #85)

**Source:** GitHub issue #85, extending audit finding SEC-4
(`docs/superpowers/specs/2026-07-12-security-audit-findings.md`). Tracked
backlog entry: `docs/ENHANCEMENTS.md` § Security, "Container hardening
(extended by SEC-4)".

## Problem

Two gaps in the Docker image, both Low-severity hardening (not exploitable
today, blast-radius/supply-chain reduction):

1. **Root nginx.** The stock `nginx:alpine` image's master process runs as
   root inside the container. A container-escape or nginx RCE chain starts
   with more privilege than a static file server needs.
2. **Floating base-image tags.** `FROM node:lts-alpine` and
   `FROM nginx:alpine` both float — every build silently takes whatever
   those tags point to that day. Not reproducible; inherits upstream
   regressions unreviewed.

A third item from the issue — automated image vulnerability scanning
(Trivy) — is explicitly conditioned in the issue text on CI existing. This
repo has no CI pipeline yet (no `.github/workflows`), and "CI pipeline" is
itself a separate tracked backlog item. **Out of scope here**; the
ENHANCEMENTS.md entry keeps Trivy scanning listed, gated on that
prerequisite.

## Approach

### Base images

Pin both Dockerfile stages to major.minor tags (not digest):

- `node:24-alpine` (the major currently resolved by `node:lts-alpine`)
- `nginxinc/nginx-unprivileged:1.27-alpine` (also solves the root-nginx
  problem — see below)

**Why major.minor over digest:** a major.minor tag still receives patch-level
security fixes automatically on the next build (the tag's digest moves
within that line); a full digest pin is more reproducible but requires
someone to manually re-pull and update the digest to receive any patch —
and this repo has no Dependabot/Renovate yet to automate that. Given no CI
exists to enforce periodic digest bumps, a floating-within-minor tag is the
better tradeoff today. Revisit if/when Dependabot is added.

### Non-root nginx

Switch the runtime stage to `nginxinc/nginx-unprivileged:1.27-alpine`, the
official unprivileged variant. It already sets a non-root `USER nginx`
(uid 101) and listens on 8080 by default (unprivileged processes can't bind
<1024) — no Dockerfile `USER` directive needed.

**Verified feasible by hand before writing this spec:** built a scratch
image using this repo's real `nginx.conf` (with `listen 8080;`) and
`nginx/security-headers.conf` on top of the pinned base image. Confirmed:

- `COPY` in a Dockerfile runs with root privileges during the build
  regardless of the base image's `USER` — so copying config/dist files in
  doesn't fail. Only `RUN` and the final container process respect `USER`.
- The running container's nginx process is confirmed non-root
  (`id` → `uid=101(nginx)`).
- All three security headers and both cache-control tiers (1y
  immutable / 7d) still fire correctly on every asset type, `nginx -t`
  passes, and the SPA/document response is unaffected.

### Files changed

**`Dockerfile`:**
```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

**`nginx.conf`:** `listen 80;` → `listen 8080;` (only the listen directive
changes; SPA fallback, cache tiers, and header includes are untouched).

**`docker-compose.yml`:** container-side port follows nginx; host-side
(what a user types in the browser) is unchanged:
```yaml
services:
  app:
    build: .
    ports:
      - "8080:8080"
    restart: unless-stopped
```

### Documentation

- **`docs/DEPLOYMENT.md`** — every `EXPOSE 80` / `listen 80` /
  `"8080:80"` reference and the annotated Dockerfile/nginx.conf code blocks
  resynced to the new files; the ASCII reverse-proxy diagram's container
  side updated; the troubleshooting table's port-collision example
  (`"8081:80"` → `"8081:8080"`); a short new note that nginx runs as a
  non-root user (uid 101) via `nginxinc/nginx-unprivileged`, and why the
  pin is major.minor rather than digest.
- **`SECURITY.md`** — "Docker posture" section: base-images line updated to
  the two pinned tags; hardening-backlog bullet trimmed to just Trivy
  scanning (non-root + pinning are now done); one line added noting nginx
  runs unprivileged as a concrete blast-radius reduction.
- **`docs/ENHANCEMENTS.md`** — the "Container hardening (extended by SEC-4)"
  bullet gets struck through for the non-root + pinning parts (same pattern
  used to close out SEC-1), leaving only the Trivy item, still gated on "once
  CI exists."
- **`CHANGELOG.md`** — new entry: container hardening fix, issue #85.

### Tests

Both a static guard and a live guard, mirroring how SEC-1 got a static
config-text test (`nginx/__tests__/securityHeaders.test.js`) plus a live
Docker e2e test (`e2e/nginx-headers.spec.js`).

**New static test** (extends `nginx/__tests__/securityHeaders.test.js`, a
`describe('Dockerfile', ...)` block):

- Parses `Dockerfile`'s `FROM` lines; asserts each image reference is
  pinned — a major.minor-shaped tag (`\d+(\.\d+)*-alpine` or similar) or a
  `@sha256:` digest — and rejects `latest` or a bare untagged/floating alias
  (`alpine`, `lts-alpine`).
  - **Positive case:** `nginx:1.27-alpine` passes.
  - **Negative cases:** `nginx:alpine` (no version) and `nginx:latest` both
    fail the assertion.
- Asserts the runtime stage's base image is
  `nginxinc/nginx-unprivileged` (or, if a future edit adds an explicit
  `USER` line instead, that it names a non-root UID/username) — this is
  the regression guard for the non-root fix specifically.
  - **Positive case:** `FROM nginxinc/nginx-unprivileged:1.27-alpine` passes.
  - **Negative case:** `FROM nginx:1.27-alpine` (stock, root) fails.

**Upgraded live e2e test** (`e2e/nginx-headers.spec.js`):

- Container image swapped from `nginx:alpine` to the pinned
  `nginxinc/nginx-unprivileged:1.27-alpine` (matches what actually ships).
- Container port mapping updated from 80 to 8080 (matches the new
  `listen` directive).
- All existing header/cache-control assertions unchanged — proven
  compatible during feasibility testing above.
- **New test:** `docker exec <container> whoami` is not `root` — direct
  regression guard for the non-root fix, at the same fidelity level (real
  Docker container) as the header assertions next to it.

## Out of scope

- Trivy image vulnerability scanning — gated on the separate CI-pipeline
  backlog item; `docs/ENHANCEMENTS.md` keeps this listed.
- Digest pinning — deferred until Dependabot/Renovate exists to keep
  digests current; major.minor tags chosen instead (see above).
- CSP, `Permissions-Policy`, HSTS (SEC-2, SEC-3) — separate backlog items,
  not part of this issue.
