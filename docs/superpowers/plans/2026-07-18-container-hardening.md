# Container Hardening (issue #85) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the Docker image's nginx as a non-root user and pin both base images to a specific version, closing the two non-CI-dependent items of issue #85 / audit finding SEC-4.

**Architecture:** Swap the runtime stage's base image from `nginx:alpine` to the official `nginxinc/nginx-unprivileged:1.27-alpine` (already non-root, listens on 8080), pin the build stage to `node:24-alpine`, and thread the resulting port change (80 → 8080) through `nginx.conf`, `docker-compose.yml`, and every doc/test that references it.

**Tech Stack:** Docker (multi-stage build), nginx, Vitest (static config tests), Playwright (live Docker e2e test).

## Global Constraints

- Base images pinned to **major.minor tags**, not digests (`node:24-alpine`, `nginxinc/nginx-unprivileged:1.27-alpine`) — chosen so patch-level security fixes keep flowing automatically; see spec's "Why major.minor over digest".
- Container-internal port is **8080**, not 80, everywhere (Dockerfile `EXPOSE`, `nginx.conf` `listen`, `docker-compose.yml` right-hand port, the live e2e test's container port). The host-facing port (`8080` on the left of the compose mapping, what a user types into their browser) is unchanged.
- Trivy image scanning is **out of scope** for this plan — stays a backlog item in `docs/ENHANCEMENTS.md`, gated on a future CI pipeline.
- Full spec: `docs/superpowers/specs/2026-07-18-container-hardening-design.md`.

---

### Task 1: Static Dockerfile pin/non-root guard tests (TDD red)

**Files:**
- Modify: `nginx/__tests__/securityHeaders.test.js`

**Interfaces:**
- Produces: `isPinnedImageTag(image: string): boolean` — a validator function added to this file, used by Task 1's own tests and asserted against the real `Dockerfile` in the same file. No other task consumes it.

This task only adds tests. They must **fail** against the current `Dockerfile` (still `node:lts-alpine` / `nginx:alpine`) before Task 2 changes it — that's the TDD proof the tests actually exercise the thing they claim to guard.

- [ ] **Step 1: Add the `isPinnedImageTag` validator and its unit tests**

Open `nginx/__tests__/securityHeaders.test.js`. After the existing `describe('nginx/security-headers.conf', ...)` block (the file's last block, ending around line 108), add:

```js
/**
 * Guards SEC-4 (docs/superpowers/specs/2026-07-12-security-audit-findings.md):
 * a floating base-image tag (`alpine`, `latest`, no tag at all) makes builds
 * non-reproducible and silently inherits upstream regressions. Accepts a
 * tag containing a version number (major, or major.minor, or major.minor.patch)
 * or a `@sha256:` digest pin.
 */
function isPinnedImageTag(image) {
  if (/@sha256:[0-9a-f]{64}$/i.test(image)) return true
  const tagMatch = image.match(/:([^:]+)$/)
  if (!tagMatch) return false
  const tag = tagMatch[1]
  if (tag === 'latest') return false
  return /\d/.test(tag)
}

describe('isPinnedImageTag (validator)', () => {
  it('accepts a major.minor pinned tag', () => {
    expect(isPinnedImageTag('nginx:1.27-alpine')).toBe(true)
  })

  it('accepts a digest-pinned image', () => {
    expect(isPinnedImageTag(`nginx@sha256:${'a'.repeat(64)}`)).toBe(true)
  })

  it('rejects a floating alias tag with no version (e.g. nginx:alpine)', () => {
    expect(isPinnedImageTag('nginx:alpine')).toBe(false)
  })

  it('rejects an explicit latest tag', () => {
    expect(isPinnedImageTag('node:latest')).toBe(false)
  })

  it('rejects an image with no tag at all', () => {
    expect(isPinnedImageTag('nginx')).toBe(false)
  })
})

describe('Dockerfile image pinning and non-root runtime (SEC-4)', () => {
  const dockerfileText = fs.readFileSync(DOCKERFILE_PATH, 'utf8')
  const fromImages = [...dockerfileText.matchAll(/^FROM\s+(\S+)/gm)].map(([, image]) => image)

  it('pins every FROM image to a specific version (no floating tags)', () => {
    expect(fromImages.length).toBeGreaterThan(0)
    for (const image of fromImages) {
      expect(isPinnedImageTag(image), `${image} is not pinned to a version`).toBe(true)
    }
  })

  it('runs the runtime (final) stage on the non-root nginx-unprivileged image', () => {
    const runtimeImage = fromImages[fromImages.length - 1]
    expect(runtimeImage.startsWith('nginxinc/nginx-unprivileged:')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the new tests and confirm the Dockerfile-targeting ones fail**

Run: `npx vitest run nginx/__tests__/securityHeaders.test.js`

Expected: the five `isPinnedImageTag (validator)` unit tests PASS (they test the pure function directly, not the Dockerfile). The two `Dockerfile image pinning and non-root runtime (SEC-4)` tests FAIL — `node:lts-alpine` and `nginx:alpine` both have no digit in their tag, so the pinning assertion fails, and `nginx:alpine` doesn't start with `nginxinc/nginx-unprivileged:` so the non-root assertion fails too.

- [ ] **Step 3: Commit**

```bash
git add nginx/__tests__/securityHeaders.test.js
git commit -m "$(cat <<'EOF'
test(85): add failing Dockerfile pin/non-root guard tests (SEC-4)

Proves the validator distinguishes pinned from floating tags before
Task 2 changes the Dockerfile to satisfy it.
EOF
)"
```

---

### Task 2: Pin base images, switch to non-root nginx, move the port (TDD green)

**Files:**
- Modify: `Dockerfile`
- Modify: `nginx.conf`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `isPinnedImageTag` and the two Dockerfile tests from Task 1 (no code interface — this task just needs to make those tests pass).
- Produces: the running container now listens on 8080 internally and its nginx process is uid 101 (`nginx`), not root. Task 3's e2e test and Task 4's docs depend on this port number and image name being exactly `nginxinc/nginx-unprivileged:1.27-alpine` / `8080`.

- [ ] **Step 1: Update the Dockerfile**

Replace the full contents of `Dockerfile`:

```dockerfile
# Stage 1: Build
FROM node:24-alpine AS build
WORKDIR /app

# Install dependencies first (layer-cached separately from source)
COPY package*.json ./
RUN npm ci

# Build production assets
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 2: Update `nginx.conf`'s listen directive**

In `nginx.conf`, change:

```nginx
server {
    listen 80;
```

to:

```nginx
server {
    listen 8080;
```

(Everything else in the file — the `include`, the `location` blocks, the cache tiers — is unchanged.)

- [ ] **Step 3: Update `docker-compose.yml`'s port mapping**

Replace the full contents of `docker-compose.yml`:

```yaml
services:
  app:
    build: .
    ports:
      - "8080:8080"
    restart: unless-stopped
```

- [ ] **Step 4: Run the Task 1 tests and confirm they now pass**

Run: `npx vitest run nginx/__tests__/securityHeaders.test.js`

Expected: all tests PASS, including the two `Dockerfile image pinning and non-root runtime (SEC-4)` tests from Task 1.

- [ ] **Step 5: Build the real image and manually verify non-root + working headers**

Run:
```bash
docker compose build
docker compose up -d
docker exec $(docker compose ps -q app) whoami
```
Expected: the build succeeds, and `whoami` prints `nginx` (not `root`).

Run:
```bash
curl -sI http://localhost:8080/ | grep -i "x-content-type-options\|x-frame-options\|referrer-policy"
```
Expected: all three headers present (`nosniff`, `SAMEORIGIN`, `strict-origin-when-cross-origin`).

Then stop the container:
```bash
docker compose down
```

- [ ] **Step 6: Run the full unit test suite to confirm nothing else broke**

Run: `npm test -- --run`

Expected: all tests PASS (no other test references the Dockerfile or nginx.conf's listen port).

- [ ] **Step 7: Commit**

```bash
git add Dockerfile nginx.conf docker-compose.yml
git commit -m "$(cat <<'EOF'
fix(85): run nginx as non-root and pin base images (SEC-4)

Runtime stage switches to nginxinc/nginx-unprivileged:1.27-alpine
(non-root nginx user, uid 101), which listens on 8080 instead of 80
since unprivileged processes can't bind ports <1024 — nginx.conf and
docker-compose.yml follow. Build stage pinned to node:24-alpine.
Both were previously floating tags (node:lts-alpine, nginx:alpine).
EOF
)"
```

---

### Task 3: Upgrade the live e2e test to the pinned, non-root image

**Files:**
- Modify: `e2e/nginx-headers.spec.js`

**Interfaces:**
- Consumes: the port (8080) and image (`nginxinc/nginx-unprivileged:1.27-alpine`) established in Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the file header comment**

In `e2e/nginx-headers.spec.js`, change the comment block at the top:

```js
// Verifies the real nginx.conf's runtime behavior against a live nginx
// server (SEC-1) — the static check in nginx/__tests__/securityHeaders.test.js
// catches the config-text pattern, but only a live request proves nginx
// actually sends the headers. Spins up nginx:alpine directly (not the full
// Dockerfile build, which requires `npm run build` first and is slow),
// mounting this repo's nginx.conf/security-headers.conf plus minimal
// fixture assets. Requires Docker; skips (not fails) when unavailable so
// `npm run e2e` still runs on machines without it.
```

to:

```js
// Verifies the real nginx.conf's runtime behavior against a live nginx
// server (SEC-1) — the static check in nginx/__tests__/securityHeaders.test.js
// catches the config-text pattern, but only a live request proves nginx
// actually sends the headers. Spins up the same pinned, non-root image the
// Dockerfile ships (nginxinc/nginx-unprivileged:1.27-alpine) directly (not
// the full Dockerfile build, which requires `npm run build` first and is
// slow), mounting this repo's nginx.conf/security-headers.conf plus
// minimal fixture assets. Also asserts the nginx process itself is
// non-root (SEC-4). Requires Docker; skips (not fails) when unavailable so
// `npm run e2e` still runs on machines without it.
```

- [ ] **Step 2: Switch the container image and port mapping**

Change:

```js
    const run = spawnSync(
      'docker',
      [
        'run', '-d', '--rm',
        '--name', CONTAINER_NAME,
        '-p', '127.0.0.1:0:80',
        '-v', `${fixtureDir}:/usr/share/nginx/html:ro`,
        '-v', `${path.join(REPO_ROOT, 'nginx.conf')}:/etc/nginx/conf.d/default.conf:ro`,
        '-v', `${path.join(REPO_ROOT, 'nginx', 'security-headers.conf')}:/etc/nginx/security-headers.conf:ro`,
        'nginx:alpine',
      ],
      { encoding: 'utf8' }
    )
    if (run.status !== 0) {
      throw new Error(`docker run failed: ${run.stderr}`)
    }

    const portOutput = execFileSync('docker', ['port', CONTAINER_NAME, '80'], { encoding: 'utf8' })
```

to:

```js
    const run = spawnSync(
      'docker',
      [
        'run', '-d', '--rm',
        '--name', CONTAINER_NAME,
        '-p', '127.0.0.1:0:8080',
        '-v', `${fixtureDir}:/usr/share/nginx/html:ro`,
        '-v', `${path.join(REPO_ROOT, 'nginx.conf')}:/etc/nginx/conf.d/default.conf:ro`,
        '-v', `${path.join(REPO_ROOT, 'nginx', 'security-headers.conf')}:/etc/nginx/security-headers.conf:ro`,
        'nginxinc/nginx-unprivileged:1.27-alpine',
      ],
      { encoding: 'utf8' }
    )
    if (run.status !== 0) {
      throw new Error(`docker run failed: ${run.stderr}`)
    }

    const portOutput = execFileSync('docker', ['port', CONTAINER_NAME, '8080'], { encoding: 'utf8' })
```

- [ ] **Step 3: Add the non-root regression test**

After the `test.describe('nginx security headers (live container)', ...)` block's `test.beforeAll`/`test.afterAll` setup and before the first `test('HTML document response ...')`, add:

```js
  test('nginx worker process runs as a non-root user (SEC-4)', () => {
    const whoami = execFileSync('docker', ['exec', CONTAINER_NAME, 'whoami'], { encoding: 'utf8' }).trim()
    expect(whoami).not.toBe('root')
  })
```

- [ ] **Step 4: Run the e2e nginx-headers spec**

Run: `npx playwright test e2e/nginx-headers.spec.js`

Expected: PASS (if Docker is unavailable in the execution environment, the whole suite `test.skip()`s instead — that's also acceptable, matching the existing skip behavior).

- [ ] **Step 5: Commit**

```bash
git add e2e/nginx-headers.spec.js
git commit -m "$(cat <<'EOF'
test(85): point the live nginx e2e test at the real pinned image (SEC-4)

Swaps nginx:alpine for nginxinc/nginx-unprivileged:1.27-alpine on port
8080 (matching what Task 2 ships) and adds a non-root process
assertion, so this test now guards SEC-4 at the same live-container
fidelity it already guards SEC-1's headers at.
EOF
)"
```

---

### Task 4: Documentation sync

**Files:**
- Modify: `docs/DEPLOYMENT.md`
- Modify: `SECURITY.md`
- Modify: `docs/ENHANCEMENTS.md`
- Modify: `README.md`
- Modify: `docs/TESTING.md`

**Interfaces:**
- Consumes: the final image names/ports from Task 2 and Task 3 (`node:24-alpine`, `nginxinc/nginx-unprivileged:1.27-alpine`, port 8080).
- Produces: nothing consumed by later tasks (Task 5 only needs this task's commit to exist first).

- [ ] **Step 1: `docs/DEPLOYMENT.md` — Docker stage code blocks and prose**

Find and replace:

```
**Stage 1 — build (`node:lts-alpine`):**

```dockerfile
FROM node:lts-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
```

`package*.json` is copied and `npm ci` run *before* the rest of the source is copied. Docker caches layers by input: as long as the lockfile hasn't changed, rebuilds skip dependency installation entirely and only re-run `vite build`. `npm ci` (rather than `npm install`) installs exactly what `package-lock.json` pins — reproducible builds, no surprise version drift.

**Stage 2 — serve (`nginx:alpine`):**

```dockerfile
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Only `dist/` and the nginx config cross into the final image. Node, npm, `node_modules`, and the source tree are all discarded with the build stage — the runtime image is ~25 MB and contains a static file server and static files, nothing else. (This is also a security property; see [`SECURITY.md`](../SECURITY.md#docker-posture).)
```

with:

```
**Stage 1 — build (`node:24-alpine`):**

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
```

`package*.json` is copied and `npm ci` run *before* the rest of the source is copied. Docker caches layers by input: as long as the lockfile hasn't changed, rebuilds skip dependency installation entirely and only re-run `vite build`. `npm ci` (rather than `npm install`) installs exactly what `package-lock.json` pins — reproducible builds, no surprise version drift.

**Stage 2 — serve (`nginxinc/nginx-unprivileged:1.27-alpine`):**

```dockerfile
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

Only `dist/` and the nginx config cross into the final image. Node, npm, `node_modules`, and the source tree are all discarded with the build stage — the runtime image is ~25 MB and contains a static file server and static files, nothing else. (This is also a security property; see [`SECURITY.md`](../SECURITY.md#docker-posture).) Both base images are pinned to a specific major.minor version rather than a floating tag, for reproducible builds, and nginx runs as its image's built-in non-root `nginx` user (uid 101) rather than root — that's also why it listens on 8080 instead of 80: unprivileged processes can't bind ports below 1024 (issue #85).
```

- [ ] **Step 2: `docs/DEPLOYMENT.md` — compose block and port bullet**

Find and replace:

```
```yaml
services:
  app:
    build: .
    ports:
      - "8080:80"
    restart: unless-stopped
```

- **`8080:80`** — nginx listens on 80 inside the container; change the left side if 8080 is taken on your host.
```

with:

```
```yaml
services:
  app:
    build: .
    ports:
      - "8080:8080"
    restart: unless-stopped
```

- **`8080:8080`** — nginx listens on 8080 inside the container (its non-root user can't bind the privileged port 80); change the left side if 8080 is taken on your host.
```

- [ ] **Step 3: `docs/DEPLOYMENT.md` — annotated nginx.conf code block**

In the "## nginx configuration, annotated" section, find:

```
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
```

and replace with:

```
```nginx
server {
    listen 8080;
    root /usr/share/nginx/html;
```

(This is inside the larger reproduced `nginx.conf` code block — only the `listen` line changes; the rest of that block is unchanged.)

- [ ] **Step 4: `docs/DEPLOYMENT.md` — reverse proxy section**

Find and replace:

```
The container serves plain HTTP on port 80. For anything beyond a trusted home LAN, put a TLS-terminating reverse proxy in front — Caddy, Traefik, or another nginx:

```
browser ──HTTPS──▶ reverse proxy ──HTTP──▶ playground container (:8080 → :80)
```
```

with:

```
The container serves plain HTTP on port 8080 (its non-root nginx process can't bind the privileged port 80). For anything beyond a trusted home LAN, put a TLS-terminating reverse proxy in front — Caddy, Traefik, or another nginx:

```
browser ──HTTPS──▶ reverse proxy ──HTTP──▶ playground container (:8080 → :8080)
```
```

- [ ] **Step 5: `docs/DEPLOYMENT.md` — troubleshooting table row**

Find:

```
| `docker compose up` fails: port already allocated | Host port 8080 in use | Change the left side of `ports:` in `docker-compose.yml` (e.g. `"8081:80"`) |
```

Replace with:

```
| `docker compose up` fails: port already allocated | Host port 8080 in use | Change the left side of `ports:` in `docker-compose.yml` (e.g. `"8081:8080"`) |
```

- [ ] **Step 6: `SECURITY.md` — Docker posture section**

Find:

```
## Docker posture

- **Official base images only:** `node:lts-alpine` (build), `nginx:alpine` (runtime).
- **Multi-stage build:** node, npm, `node_modules`, and the source tree never enter the runtime image — a compromise of the running container yields a static file server and public assets, not a toolchain.
- **Stateless runtime:** no volumes, no secrets, no env vars in the image; nothing sensitive to exfiltrate server-side.
- **Hardening backlog** (tracked in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md#security)): running nginx as a non-root user, and automated image vulnerability scanning.
```

Replace with:

```
## Docker posture

- **Official base images, pinned:** `node:24-alpine` (build), `nginxinc/nginx-unprivileged:1.27-alpine` (runtime) — both pinned to a major.minor version rather than a floating tag, for reproducible builds (issue #85).
- **Non-root runtime:** nginx runs as its image's built-in non-root `nginx` user (uid 101), not root — a container-escape or nginx RCE chain starts with less privilege (issue #85).
- **Multi-stage build:** node, npm, `node_modules`, and the source tree never enter the runtime image — a compromise of the running container yields a static file server and public assets, not a toolchain.
- **Stateless runtime:** no volumes, no secrets, no env vars in the image; nothing sensitive to exfiltrate server-side.
- **Hardening backlog** (tracked in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md#security)): automated image vulnerability scanning (Trivy), once a CI pipeline exists to run it.
```

- [ ] **Step 7: `docs/ENHANCEMENTS.md` — container hardening bullet**

Find:

```
- **Container hardening (extended by SEC-4)** — run nginx as a non-root user (e.g. the official `nginxinc/nginx-unprivileged` image, adjusting the compose port mapping); pin base images to at least major/minor (`nginx:1.27-alpine`) or by digest for reproducible builds; add automated image vulnerability scanning (e.g. Trivy) once CI exists.
```

Replace with:

```
- ~~**Container hardening — non-root nginx + pinned base images (SEC-4)**~~ — done (issue #85): the runtime image switched to `nginxinc/nginx-unprivileged:1.27-alpine` (non-root `nginx` user, uid 101; compose port mapping adjusted to `8080:8080` since unprivileged nginx can't bind port 80), and both base images (`node:24-alpine`, `nginxinc/nginx-unprivileged:1.27-alpine`) are pinned to a major.minor version instead of a floating tag. Guarded by a static Dockerfile pin/non-root test (`nginx/__tests__/securityHeaders.test.js`) and a live e2e check (`e2e/nginx-headers.spec.js`) that boots the real pinned image and asserts the nginx process is non-root.
- **Image vulnerability scanning (SEC-4 remainder)** — add automated scanning (e.g. Trivy) once a CI pipeline exists to run it.
```

- [ ] **Step 8: `README.md` — Docker one-liner**

Find:

```
- **Docker:** a two-stage build (Node compiles, `nginx:alpine` serves, ~25 MB image). `docker compose up --build`, then open [http://localhost:8080](http://localhost:8080).
```

Replace with:

```
- **Docker:** a two-stage build (Node compiles, `nginxinc/nginx-unprivileged:1.27-alpine` serves as a non-root user, ~25 MB image). `docker compose up --build`, then open [http://localhost:8080](http://localhost:8080).
```

- [ ] **Step 9: `docs/TESTING.md` — two `nginx:alpine` mentions**

Find (in the layer-3 spec table row):

```
| `nginx-headers.spec.js` | Live nginx security-header coverage (SEC-1): boots `nginx.conf` in a real `nginx:alpine` container (not the app's dev server) and asserts all three security headers on every asset tier plus a 404. Skips (doesn't fail) when Docker isn't available — see below |
```

Replace with:

```
| `nginx-headers.spec.js` | Live nginx security-header (SEC-1) and non-root-process (SEC-4) coverage: boots `nginx.conf` in the real `nginxinc/nginx-unprivileged:1.27-alpine` container (not the app's dev server) and asserts all three security headers on every asset tier plus a 404, and that the nginx process is non-root. Skips (doesn't fail) when Docker isn't available — see below |
```

Find (in the prose paragraph right below the table):

```
The spec boots `nginx:alpine` directly (mounting `nginx.conf`, `nginx/security-headers.conf`, and a handful of fixture asset files — not the full `Dockerfile` build, which needs `npm run build` first and is much slower) and drives it with Playwright's `request` fixture.
```

Replace with:

```
The spec boots the same pinned `nginxinc/nginx-unprivileged:1.27-alpine` image the Dockerfile ships (mounting `nginx.conf`, `nginx/security-headers.conf`, and a handful of fixture asset files — not the full `Dockerfile` build, which needs `npm run build` first and is much slower) and drives it with Playwright's `request` fixture.
```

- [ ] **Step 10: Commit**

```bash
git add docs/DEPLOYMENT.md SECURITY.md docs/ENHANCEMENTS.md README.md docs/TESTING.md
git commit -m "$(cat <<'EOF'
docs(85): sync docs to non-root nginx + pinned base images (SEC-4)

Updates every port-80/nginx:alpine/node:lts-alpine reference across
DEPLOYMENT.md, SECURITY.md, ENHANCEMENTS.md, README.md, and
TESTING.md to match the Task 2/3 changes.
EOF
)"
```

---

### Task 5: Changelog, version bump, full verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: nothing (terminal task).

- [ ] **Step 1: Bump the version in `package.json`**

Change:
```json
  "version": "0.28.1",
```
to:
```json
  "version": "0.28.2",
```

- [ ] **Step 2: Add the CHANGELOG entry**

At the top of `CHANGELOG.md`, immediately after the format-notice line and before the existing `## [0.28.1] - 2026-07-17` entry, insert:

```markdown
## [0.28.2] - 2026-07-18

### Fixed
- Container hardening (issue #85, audit finding SEC-4): the Docker image's runtime stage now runs nginx as a non-root user via the official `nginxinc/nginx-unprivileged:1.27-alpine` image (listening on 8080, since unprivileged processes can't bind port 80) instead of stock `nginx:alpine` running as root; both base images (`node:24-alpine`, `nginxinc/nginx-unprivileged:1.27-alpine`) are now pinned to a major.minor version instead of a floating tag. `docker-compose.yml`'s port mapping adjusted to `8080:8080`. Guarded by a static Dockerfile test (pinned-tag + non-root-image assertions) and an upgraded live e2e check that boots the real pinned image and confirms the nginx process is non-root. Automated image vulnerability scanning (Trivy) remains backlogged pending a CI pipeline.

```

- [ ] **Step 3: Run the full test suite**

Run: `npm test -- --run`

Expected: all tests PASS.

- [ ] **Step 4: Run lint**

Run: `npm run lint`

Expected: no errors. (If `storybook-static/` exists from a prior local build, remove it first — it produces bogus lint failures unrelated to this change.)

- [ ] **Step 5: Run the full e2e suite (or confirm graceful skip)**

Run: `npm run e2e`

Expected: PASS, or the Docker-dependent specs `test.skip()` with a clear reason if Docker isn't available in this environment — either is acceptable, but a real FAIL is not.

- [ ] **Step 6: Run a full Docker build + smoke test one more time end-to-end**

Run:
```bash
docker compose up --build -d
curl -s http://localhost:8080/ | head -5
docker exec $(docker compose ps -q app) whoami
docker compose down
```
Expected: the site responds, and `whoami` prints `nginx`.

- [ ] **Step 7: Commit**

```bash
git add CHANGELOG.md package.json
git commit -m "$(cat <<'EOF'
chore(85): changelog and version bump for container hardening

v0.28.2.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** non-root nginx (Task 2), pinned base images (Task 2), compose port mapping (Task 2), static regression guard (Task 1), live e2e regression guard (Task 3), doc sync across all five identified files (Task 4), changelog/version (Task 5), Trivy explicitly left out of scope (noted in Global Constraints). All spec sections covered.
- **Type/name consistency checked:** `isPinnedImageTag` is defined and consumed only within Task 1's file; no cross-task function signatures to drift. Image name `nginxinc/nginx-unprivileged:1.27-alpine` and port `8080` are used identically across Tasks 2, 3, and 4.
- **No placeholders:** every step has literal file content or exact commands with expected output.
