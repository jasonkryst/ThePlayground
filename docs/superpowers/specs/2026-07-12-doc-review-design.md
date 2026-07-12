# Documentation Review & Overhaul (Issue #61)

## Problem

Issue #61: "Review the game as it currently stands. Then update any md related
documentation. Ensure that the readme files are updated, ensure that the
changelog is updated. Ensure that Claude.md is updated. Ensure testing.md is
updated. Ensure enhancements.md is updated. Within enhancements.md, make
suggestions that will improve the app including UI, ux, accessibility, core
engine features, migration of duplicated code to the engine, new game based
features, new games, security improvements, additional testing layers and
anything else that would make things better."

The reporter additionally asked for two new documents — a deployment guide
and a security document — with everything "very detailed" and consistent
across the whole doc suite.

Staleness confirmed against the codebase at v0.24.4:

- **README.md** — architecture tree still lists three games ("animal-sounds,
  color-match, character-match today"; Animal Memory Match shipped in
  v0.23.0); the Storage Adapter section documents a "four-method interface"
  while `src/storage/adapter.js` defines ten methods across five get/save
  pairs; the "Adding a New Game" manifest example omits the required `tags`
  field (required since v0.5.0) and the `gameType` field (since v0.23.0);
  the quoted score shape omits the quiz `timings[]`/`peakStreak` and memory
  `flipAttempts`/`mismatches`/`peakMatchStreak`/`durationMs` fields; the
  testing summary says "six layers" while `docs/TESTING.md` says five.
- **docs/TESTING.md** — opens with "five layers"; doesn't cover the
  memory-game test patterns, `useSoundPlayer` mocking, or the e2e specs
  added since (`animal-memory-match.spec.js`, `intro-results-height.spec.js`).
- **docs/ENHANCEMENTS.md** — thin relative to the categories issue #61 asks
  for; no security or testing-layer suggestions sections.
- **No deployment doc** — Docker/nginx knowledge lives only in a short
  README section; `nginx.conf`'s cache tiers and security headers are
  undocumented beyond inline comments.
- **No SECURITY.md** — no threat model, data-privacy statement, or
  vulnerability-reporting policy anywhere; no `.github/` folder exists.

## Decisions (confirmed with the reporter)

1. **Locations:** `SECURITY.md` at repo root (GitHub auto-surfaces it in the
   Security tab); `docs/DEPLOYMENT.md` alongside the other reference docs.
2. **Rewrite depth:** full rewrite with fresh structure — each document is
   rebuilt from the current codebase as the source of truth; old files are
   fully replaced.
3. **SECURITY.md flavor:** combined posture document (threat model, data
   privacy, XSS surfaces, headers, Docker, dependency policy) plus a
   standard disclosure/reporting policy.
4. **Versioning:** patch bump `0.24.4 → 0.24.5` in `package.json` plus a
   CHANGELOG entry for the overhaul.
5. **Execution:** single sequential pass by one author, in dependency order,
   so every cross-reference is written by the same hand that wrote both ends
   — the strongest guarantee of cross-document consistency.

## Consistency rules (apply to every document)

- **The code is the source of truth.** Every claim — method names, settings
  keys and defaults, test-layer counts, file paths, versions, npm script
  names — is verified against the repo before being written down.
- **Shared vocabulary** used identically everywhere: "quiz games" vs
  "memory games" (the two game types), "storage adapter", "auto-discovery",
  "AppShell", "the engine" (shared hooks/components/utils), "game manifest".
- **Mutual linking:** README carries a documentation index pointing at every
  doc; DEPLOYMENT ↔ SECURITY cross-reference each other (nginx headers,
  Docker posture); TESTING ↔ SECURITY cross-reference (dependency audits,
  the CSS-filter contrast test); ENHANCEMENTS links to CHANGELOG for shipped
  items (existing convention, kept).
- **One canonical home per fact.** The settings table lives in README only;
  the testing-layer detail lives in TESTING.md only; deployment mechanics
  live in DEPLOYMENT.md only. Other docs link instead of duplicating —
  duplication is what made the current docs drift (the five-vs-six layer
  count discrepancy is a live example).

## The documents

### 1. README.md (rewrite)

Project front door. Sections: intro; features (all four games); dashboard
features (daily challenge, recently-played, categories, intro screens,
My Progress, Parent Dashboard); getting started; scripts table; architecture
(corrected tree including `animal-memory-match`, memory-engine pieces —
`useMemorySession`, `MemoryBoard`, `buildDeck`, `src/assets/sounds` — and
per-game `badges.js`); auto-discovery; AppShell; storage adapter (all five
get/save pairs); design tokens; adding a new game (manifest example with
required `tags`, plus `gameType` and per-game `badges.js`/`i18n` as the
optional extension points); settings reference (verified against
`DEFAULT_SETTINGS`); versioning; animal-sounds asset notes; documentation
index. The Docker section shrinks to a short pointer at
`docs/DEPLOYMENT.md`; the testing section stays a summary pointing at
`docs/TESTING.md` with a layer count that matches it.

### 2. docs/DEPLOYMENT.md (new)

Everything about running the app. Sections: overview (static SPA, no
backend, no env vars — all runtime config lives in the admin page /
localStorage); local development (`npm run dev`, Vite polling note);
production build (`npm run build` → `dist/`, `npm run preview`); Docker
walkthrough — multi-stage build explained stage by stage (node:lts-alpine
build → nginx:alpine serve, ~25 MB), compose usage (`docker compose up
--build`, `-d`, port 8080→80, `restart: unless-stopped`), rebuilding after
updates, image/file inventory (`Dockerfile`, `nginx.conf`,
`docker-compose.yml`, `.dockerignore`); nginx configuration annotated
block-by-block (SPA `try_files` fallback and why direct navigation to
`/admin` etc. needs it; the 1-year immutable cache tier for hashed assets vs
the 7-day mp3 tier and why they differ; the security headers, linking to
SECURITY.md for rationale); serving behind a reverse proxy / HTTPS guidance
for self-hosters (TLS termination, forwarded headers, HSTS note); data
persistence caveats (localStorage is per-browser/per-device, cleared by
"clear site data"; no server-side state; back-up via the parent dashboard's
CSV export); troubleshooting (blank page on refresh = missing SPA fallback,
stale assets = cache tiers, port conflicts).

### 3. SECURITY.md (new, repo root)

Combined posture + policy. Sections: scope and audience (self-hosted family
app); architecture from a security standpoint (static SPA, no backend, no
accounts, no server-side data — the attack surface is the browser and the
static file server); data inventory (exactly what localStorage holds:
scores, settings including child's first name, streaks, personal bests,
badge data; nothing leaves the device unless GA is enabled); analytics &
children's privacy (GA off by default, opt-in via admin, self-hosted COPPA
analysis consistent with the existing ENHANCEMENTS note); XSS surfaces and
mitigations (React auto-escaping; `sanitizeGaId` in `src/App.jsx`
allow-listing `[A-Za-z0-9_-]` before the GA script URL is built; no
`dangerouslySetInnerHTML` in the codebase); HTTP security headers as shipped
in `nginx.conf` (`X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`) with rationale, and known gaps stated honestly (no CSP,
no HSTS at the container — TLS/HSTS belong to the reverse proxy) linking to
ENHANCEMENTS for the hardening backlog; Docker posture (official base
images, multi-stage keeps toolchain out of the runtime image, static-only
nginx); dependency policy (`npm audit`, Vite/React LTS cadence); supported
versions table (latest minor only); reporting a vulnerability (GitHub
private vulnerability reporting / issues, what to include, response
expectation). Written so GitHub's Security tab renders it usefully.

### 4. docs/TESTING.md (rewrite)

Corrected layer count with a summary table up top (layer → command → what it
catches), then one section per layer: static linting (ESLint + jsx-a11y,
Stylelint CSS3 conformance — keeping the existing detailed rationale);
unit/component (Vitest + RTL) with the full gotcha list preserved (fake
timers + `fireEvent`, `vi.mock`/`vi.hoisted` adapter mocking,
`data-testid="correct-<thing>-id"`, confetti mock seam, GameChoiceGrid
render-prop pattern, native date inputs) plus new patterns since the last
revision (`useSoundPlayer` mocking, memory-game session tests);
accessibility (jest-axe + axe-core/playwright, CSS-filter contrast test
pattern); E2E (Playwright, updated spec inventory including
`animal-memory-match.spec.js` and `intro-results-height.spec.js`); visual
regression (Storybook + screenshots, baseline update workflow); HTML5
validation; CSS validation of dynamic inline styles; i18n string convention
(kept, including pluralization guidance).

### 5. docs/ENHANCEMENTS.md (rewrite, expanded)

The issue's largest ask. Existing ideas preserved; every entry gets a short
rationale. Organized by issue #61's own categories:

- **UI** — e.g. dark mode via the existing token system, dashboard reorder,
  richer results-screen theming per game type.
- **UX** — e.g. sound replay on wrong answer, practice mode, parental PIN
  lock, session-resume after accidental exit.
- **Accessibility** — RTL `dir` sync (kept), reduced-motion audit for the
  memory flip animation, larger-text mode, switch-access exploration.
- **Core engine** — the concrete **duplicated-code-to-engine migration
  list** produced by auditing the four games' source for near-identical
  code (e.g. quiz-game correct/wrong sound layer completion, shared results
  stat-tile composition, any per-game CSS still duplicating shared
  patterns); items are named findings, not vague intentions.
- **Game features** — difficulty curves, per-game settings overrides,
  adaptive item pools.
- **New games** — the existing eight ideas kept, plus new ones with a
  one-line pedagogical rationale each.
- **Security** — CSP rollout plan, PIN gate, `npm audit` in CI, SRI note,
  container image scanning; consistent with SECURITY.md's "known gaps".
- **Testing layers** — CI pipeline (GitHub Actions), tightening the visual
  suite's `maxDiffPixelRatio` (kept), mutation testing, Lighthouse
  performance/a11y budgets in CI, contract test for the storage adapter
  interface.
- **Backend/sync & PWA** — cloud-sync adapter, offline-first PWA (kept).

### 6. CLAUDE.md (update-leaning rewrite)

Stays lean — it's an instruction file for Claude Code, not user docs.
Updates: architecture summary gains the memory-game engine pieces and
per-game badge catalogs; the storage/score-shape notes stay aligned with
`adapter.js`; commands verified against `package.json` scripts; a pointer to
`docs/DEPLOYMENT.md` and `SECURITY.md` added to the project overview line;
testing notes kept and extended only where a new stable pattern exists
(e.g. `useSoundPlayer` mock seam). No process/tooling instructions change.

### 7. CHANGELOG.md (append) + package.json

New `[0.24.5] - 2026-07-12` entry under `### Changed`/`### Added`
describing: full documentation review (issue #61), new `docs/DEPLOYMENT.md`
and `SECURITY.md`, corrected README/TESTING staleness, expanded
ENHANCEMENTS backlog. `package.json` version `0.24.4 → 0.24.5`. No game
manifest bumps — no game behavior changes.

## Verification

Markdown has no test suite, so verification is mechanical cross-checking:

- Every `npm run <script>` quoted in any doc exists in `package.json`.
- Every file path referenced in any doc exists (glob check).
- Every relative link between docs resolves to a real file.
- Settings table entries match `DEFAULT_SETTINGS` in
  `src/storage/adapter.js` (names, defaults, option ranges).
- The testing-layer count is identical everywhere it appears.
- `npm run build` passes once after the version bump (confirms the JSON
  import of `package.json` still works and nothing else broke).
- `npm run lint` still passes (no JS changed, cheap sanity check).

## Out of scope

- No application code changes (the one exception: the `version` field in
  `package.json`).
- No CI pipeline, CSP, PIN lock, or other improvements *implementation* —
  those are recorded as ENHANCEMENTS entries, not built here.
- No `.github/` scaffolding (issue templates, CODEOWNERS, workflows) — the
  root `SECURITY.md` works without it.
- No screenshots/images added to docs (nothing to keep in sync later).
- `docs/superpowers/` specs and plans are historical records — never edited
  retroactively.
