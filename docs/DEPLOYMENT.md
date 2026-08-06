# Deployment

The Playground is a fully static single-page application (SPA). There is no backend, no database server, no environment variables, and no build-time secrets. All runtime configuration — child's name, game settings, the optional Google Analytics ID — lives in the admin page (`/admin`) and persists to the browser's `localStorage`. That makes deployment unusually simple: build once, serve the files.

Three ways to run it:

| Mode | Command | When to use |
|---|---|---|
| Dev server | `npm run dev` | Local development with hot reload |
| Static build | `npm run build` → serve `dist/` | Any static host you already run |
| Docker | `docker compose up --build` | Self-hosted, repeatable, ~25 MB image |

Related: [`SECURITY.md`](../SECURITY.md) covers the security rationale behind the nginx headers and the data-privacy posture referenced below.

---

## Local development

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

The dev server runs at [http://localhost:5173](http://localhost:5173) with hot module reload.

One quirk worth knowing: the Vite file watcher is configured to poll (`usePolling: true, interval: 300` in `vite.config.js`). This was originally needed when the repo lived on a network share, where filesystem events don't propagate; it's harmless on local disk (slightly higher idle CPU), so it has been left in place.

---

## Production build

```bash
npm run build      # → dist/
npm run preview    # serve dist/ locally to smoke-test the real build
```

`dist/` contains:

- `index.html` — a small shell that loads the app (this is a client-rendered SPA; the HTML file itself is nearly empty)
- `assets/` — JS, CSS, and images with **content-hashed filenames** (e.g. `index-B3xk9Qe2.js`); a rebuild that changes the content changes the filename
- sound files (`.mp3`) and any game images, copied through **without** content hashes

Two properties of that output drive everything in the server configuration below:

1. **Every route must fall back to `index.html`.** React Router handles `/admin`, `/my-progress`, `/game/animal-sounds`, etc. on the client. A static server that 404s unknown paths breaks direct navigation and page refresh on every route except `/`.
2. **Hashed assets can be cached forever; unhashed ones can't.** A hashed filename is immutable by construction. The mp3s are not hashed, so they need a bounded cache lifetime or replaced sounds would never reach returning visitors.

If you deploy `dist/` to your own static host instead of using the Docker image, replicate both behaviors (SPA fallback + split cache policy) in that host's configuration.

---

## PWA

`npm run build` also generates `dist/sw.js`, `dist/workbox-*.js`, and `dist/manifest.webmanifest` via `vite-plugin-pwa` (issue #96) — no extra deployment step needed, they're just more files in `dist/` that the SPA fallback/cache rules above already cover. The service worker precaches the full app shell plus every game's images/audio, so a game already visited once keeps working fully offline; updates activate silently on the next load (`registerType: 'autoUpdate'` with `skipWaiting`/`clientsClaim` — no user-facing "update available" prompt).

**Requires a secure context.** Browsers only register a service worker over HTTPS or on `localhost` — plain HTTP to a non-localhost origin (e.g. visiting the Docker container's `:8080` directly over a LAN IP) silently gets no service worker at all, no install prompt, no offline support, with no error surfaced to the user. This is the same HTTPS requirement the [reverse-proxy section below](#https--running-behind-a-reverse-proxy) already covers for other reasons — a TLS-terminating proxy in front satisfies it.

`npm run dev` intentionally does not register a service worker (`devOptions.enabled` is left off) — a dev-mode SW is a common source of confusing stale-cache bugs while iterating. To see PWA behavior locally, use `npm run build && npm run preview` instead.

---

## Docker

**Prerequisites:** Docker with Compose.

```bash
docker compose up --build    # build image and start (foreground)
docker compose up -d         # run in background after first build
```

The app is served at [http://localhost:8080](http://localhost:8080).

### The image, stage by stage

`Dockerfile` is a two-stage build:

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

**Stage 2 — serve (`nginxinc/nginx-unprivileged:1.30-alpine`):**

```dockerfile
FROM nginxinc/nginx-unprivileged:1.30-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

Only `dist/` and the nginx config cross into the final image. Node, npm, `node_modules`, and the source tree are all discarded with the build stage — the runtime image is ~25 MB and contains a static file server and static files, nothing else. (This is also a security property; see [`SECURITY.md`](../SECURITY.md#docker-posture).) Both base images are pinned to a specific major.minor version rather than a floating tag, for reproducible builds, and nginx runs as its image's built-in non-root `nginx` user (uid 101) rather than root — that's also why it listens on 8080 instead of 80: unprivileged processes can't bind ports below 1024 (issue #85).

### Compose

`docker-compose.yml` is a single service:

```yaml
services:
  app:
    build: .
    ports:
      - "8080:8080"
    restart: unless-stopped
```

- **`8080:8080`** — nginx listens on 8080 inside the container (its non-root user can't bind the privileged port 80); change the left side if 8080 is taken on your host.
- **`restart: unless-stopped`** — the container survives daemon restarts and host reboots, but stays down if you explicitly `docker compose stop` it.
- **No volumes** — the container is stateless. All user data lives in the *browser*, not the container (see [Data persistence](#data-persistence--backup)). You can destroy and recreate the container freely.

### Updating a running deployment

```bash
git pull
docker compose up --build -d
```

Compose rebuilds the image (fast if only source changed, thanks to the layer split above) and replaces the running container. Because the container is stateless, there is nothing to migrate or back up first.

### File inventory

| File | Purpose |
|---|---|
| `Dockerfile` | Two-stage build definition |
| `nginx.conf` | SPA routing fallback, asset cache tiers, security headers |
| `nginx/security-headers.conf` | The three security headers, shared via `include` so every `location` block gets them (see below) |
| `docker-compose.yml` | Single-service compose for local/self-hosted use |
| `.dockerignore` | Excludes `node_modules`, `dist`, `coverage`, tool state from the build context |

---

## nginx configuration, annotated

The full `nginx.conf` shipped into the image:

```nginx
server {
    listen 8080;
    root /usr/share/nginx/html;
    index index.html;

    # Don't disclose the nginx version in the Server header / error pages
    # (SEC-3). Not an add_header, so it doesn't need the include below.
    server_tokens off;

    # Security headers. NOTE: nginx does not merge add_header directives
    # across nesting levels — any location block below that sets its own
    # add_header (e.g. for Cache-Control) must also `include` this same
    # file, or these three headers silently disappear from its responses.
    # See nginx/security-headers.conf and SEC-1 in SECURITY.md.
    include /etc/nginx/security-headers.conf;

    # SPA fallback: all unmatched paths serve index.html so React Router
    # handles client-side routing (/admin, /game/:id, etc.)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # vite-plugin-pwa's generated manifest isn't in nginx's bundled
    # mime.types, so it falls back to `default_type` (application/octet-stream)
    # -- the well-known IANA media type is application/manifest+json.
    location = /manifest.webmanifest {
        default_type application/manifest+json;
        include /etc/nginx/security-headers.conf;
    }

    # Long-cache hashed static assets (Vite appends content hash to filenames)
    location ~* \.(js|css|woff2?|ttf|svg|ico|png|jpg|jpeg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        include /etc/nginx/security-headers.conf;
    }

    # Audio files — shorter cache so sound updates propagate
    location ~* \.mp3$ {
        expires 7d;
        add_header Cache-Control "public";
        include /etc/nginx/security-headers.conf;
    }
}
```

`nginx/security-headers.conf`, included above wherever the headers need to land:

```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://www.googletagmanager.com; connect-src 'self' https://*.google-analytics.com https://*.googletagmanager.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; media-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
```

Block by block:

**SPA fallback (`try_files $uri $uri/ /index.html`)** — try the exact file, then a directory, then hand everything else to `index.html`. This is what makes a direct visit (or refresh) on `/admin` or `/game/animal-memory-match` work: nginx serves the shell, and React Router resolves the route in the browser. Without it, every deep link 404s.

**Web app manifest content type** — nginx's bundled `mime.types` predates the `.webmanifest` extension, so without this block the file falls back to the `default_type`, `application/octet-stream` — some browsers' PWA installability checks reject that. `location = /manifest.webmanifest` matches vite-plugin-pwa's fixed (non-hashed) output filename exactly and forces the correct `application/manifest+json`.

**1-year `immutable` tier (js/css/fonts/images)** — safe *only because* Vite content-hashes these filenames. A changed file gets a new name, so a stale cache can never serve wrong content — the HTML simply references a name the cache has never seen. `immutable` additionally tells the browser not to revalidate even on refresh.

**7-day tier (mp3)** — sound files are copied through with their human-meaningful names (`elephant.mp3`) and *no* content hash, so they can't be cached forever: a replaced sound keeps its old name, and a forever-cache would keep serving the old audio. Seven days balances repeat-visit performance against how quickly a sound swap propagates to returning visitors.

**HTML (implicit)** — `index.html` deliberately gets *no* long-cache header. nginx serves it with an ETag by default, so browsers revalidate it cheaply, always pick up a new deploy's hashed asset references, and the "stale UI after deploy" failure mode is avoided.

**Security headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy` (restricts scripts/styles/connections/images/media to first-party plus the opt-in GA hosts, blocks plugin content and framing), and `Permissions-Policy` (denies camera/microphone/geolocation/payment outright — the app uses none of them). What each protects against is documented in [`SECURITY.md`](../SECURITY.md#http-security-headers). **Why an `include` instead of repeating the five lines in each block:** nginx's `add_header` inheritance breaks the moment a `location` block declares its own `add_header` (here, for `Cache-Control`) — the block then gets *only* what it declares itself, nothing from the enclosing `server` block. A single shared file `include`d everywhere avoids the alternative (copy-pasting the lines into every block that sets `Cache-Control`), which is exactly how this dropped silently in the first place (SEC-1) — a future asset tier just needs `include /etc/nginx/security-headers.conf;` alongside its own `add_header`, and both the static config test (`nginx/__tests__/securityHeaders.test.js`) and the live e2e check (`e2e/nginx-headers.spec.js`) fail loudly if it's forgotten. **`server_tokens off;`** (hides the nginx version from the `Server` header and error pages) lives directly in the `server` block instead — it isn't an `add_header`, so the inheritance problem above doesn't apply to it, and one line covers every location.

---

## HTTPS / running behind a reverse proxy

The container serves plain HTTP on port 8080 (its non-root nginx process can't bind the privileged port 80). For anything beyond a trusted home LAN, put a TLS-terminating reverse proxy in front — Caddy, Traefik, or another nginx:

```
browser ──HTTPS──▶ reverse proxy ──HTTP──▶ playground container (:8080 → :8080)
```

Notes for that setup:

- **TLS and HSTS belong at the proxy**, not in this image. The container has no certificate handling on purpose — proxies like Caddy automate certificates (Let's Encrypt) far better than a static-site container should try to.
- **This is also what the [PWA service worker](#pwa) needs** — browsers refuse to register one over plain HTTP to a non-localhost origin, so skipping this step silently disables install/offline support with no error surfaced anywhere.
- **No forwarded headers are required.** The app has no server-side sessions, redirects, or absolute-URL generation, so it doesn't care about `X-Forwarded-For`/`X-Forwarded-Proto`. Pass them or don't.
- **Compression** (gzip/brotli) is also best handled at the proxy if you want it; the image ships nginx defaults.

Example Caddyfile for a home server:

```
playground.example.com {
    reverse_proxy localhost:8080
}
```

That's the entire proxy configuration — Caddy provisions and renews the certificate automatically.

---

## Data persistence & backup

**Everything is in the browser.** Scores, settings (including the child's name and the optional GA ID), best streaks, personal bests, and badge data are stored in `localStorage` of whichever browser played the games. The complete inventory of what's stored is in [`SECURITY.md`](../SECURITY.md#data-inventory).

Consequences worth understanding before you rely on the data:

- **Per browser, per device.** A tablet and a laptop each accumulate their own independent history. There is no sync (a cloud-sync storage adapter is on the backlog — see [`docs/ENHANCEMENTS.md`](ENHANCEMENTS.md)).
- **"Clear site data" wipes it.** Browser privacy cleanups, private-browsing windows, and some "free up space" flows delete `localStorage`. There is no recycle bin.
- **The container is stateless.** Rebuilding, upgrading, or moving the Docker container never touches user data — but by the same token, backing up the server does *not* back up scores.
- **Backup = CSV export.** The Parent Dashboard (`/parent`) has an Export CSV button that downloads the full score history for the currently selected date range (select "All time" first for a complete backup). This is currently the only export path.
- **Swapping in a real backend** is a designed-for path: implement the storage adapter's 15 methods against your backend and change one export in `src/storage/index.js`. See the Storage Adapter section of the [README](../README.md#storage-adapter).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Blank page or 404 when refreshing on `/admin`, `/game/...`, etc. | Serving `dist/` from a host without an SPA fallback | Configure the host to serve `index.html` for unmatched paths (the Docker image's nginx already does) |
| Old UI still showing after a deploy | Cached `index.html` (usually an over-aggressive CDN/proxy rule, not this image's nginx) | Ensure HTML is served with revalidation (ETag / short max-age); hashed assets may keep their 1-year tier |
| A replaced sound file still plays the old audio | mp3s cache for 7 days by design | Wait out the TTL, hard-refresh, or rename the file (a new name bypasses every cache) |
| `docker compose up` fails: port already allocated | Host port 8080 in use | Change the left side of `ports:` in `docker-compose.yml` (e.g. `"8081:8080"`) |
| Scores/settings vanished | Browser site data was cleared, or a different browser/device/profile is in use | Restore expectations, not data — see [Data persistence](#data-persistence--backup); export CSV periodically if the history matters |
| Dev server doesn't pick up file changes | Editor writing via a path the poller misses (rare) | The watcher already polls every 300 ms (`vite.config.js`); restart `npm run dev` |
