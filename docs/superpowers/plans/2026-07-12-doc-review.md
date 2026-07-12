# Documentation Overhaul (Issue #61) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the full documentation suite (README, DEPLOYMENT, SECURITY, TESTING, ENHANCEMENTS, CLAUDE.md, CHANGELOG) from the v0.24.4 codebase as the source of truth, per the approved spec `docs/superpowers/specs/2026-07-12-doc-review-design.md`.

**Architecture:** Single sequential pass, one document per task, in the spec's dependency order. Every factual claim comes from the Verified Facts appendix below (already checked against the code); the final task runs the mechanical cross-doc verification.

**Tech Stack:** Markdown only. The single code change is `package.json` `version: 0.24.4 → 0.24.5`.

## Global Constraints

- **No application code changes** except the `package.json` version field. The stale JSDoc in `src/storage/adapter.js` ("these four async methods") is recorded as an ENHANCEMENTS entry, NOT fixed here.
- **One canonical home per fact:** settings table → README only; testing-layer detail → TESTING.md only; deployment mechanics → DEPLOYMENT.md only; security posture → SECURITY.md only. Other docs link, never duplicate.
- **Shared vocabulary (use verbatim, everywhere):** "quiz games" / "memory games" (the two game types), "storage adapter", "auto-discovery", "AppShell", "the engine" (shared hooks/components/utils), "game manifest".
- **The canonical test-layer count is SIX layers plus static linting** (unit/component, accessibility, E2E, visual regression, HTML5 validation, CSS validation of dynamic inline styles; ESLint/Stylelint run at edit time before all of them). Every doc that mentions the count must say exactly this.
- **Tone:** match the existing docs — plain, specific, no marketing language. Explain *why* wherever the current docs do (they are unusually rationale-heavy; keep that).
- **Docs never edited:** anything under `docs/superpowers/` (historical record).
- Commit messages: `docs(61): <what>` plus the repo's Claude trailer lines.

## Verified Facts appendix (single source for every task)

All verified 2026-07-12 against the working tree at v0.24.4. Do not re-derive from memory; if a doc needs a fact not listed here, verify it against the code first.

**Games** (from `src/games/*/manifest.json`):

| id | name | version | gameType | tags | icon |
|---|---|---|---|---|---|
| animal-sounds | Animal Sounds | 1.6.1 | (default: quiz) | sounds, animals | 🐘 |
| color-match | Color Match | 1.6.1 | (default: quiz) | visual, colors | 🎨 |
| character-match | Character Match | 1.4.2 | (default: quiz) | visual, characters | `/games/character-match/icon.webp` (image path) |
| animal-memory-match | Animal Memory Match | 1.1.2 | `"memory"` | memory, animals | 🧠 |

**npm scripts** (from `package.json`, the complete set of 12): `dev`, `build`, `lint`, `lint:css`, `preview`, `test`, `coverage`, `e2e`, `validate:html`, `validate:css`, `storybook`, `build-storybook`. The current README scripts table lists only 5 of these — the rewrite must list all 12.

**Storage adapter** (`src/storage/adapter.js`) — ten methods in five get/save pairs:
`getScores`/`addScore`, `getSettings`/`saveSettings`, `getBestStreaks`/`saveBestStreaks`, `getPersonalBests`/`savePersonalBests`, `getBadgeData`/`saveBadgeData`. Active implementation `src/storage/localStorageAdapter.js`, re-exported by `src/storage/index.js`.

**Score shapes** (verified against `src/hooks/useGameSession.js` and `src/hooks/useMemorySession.js:141-152`):
- Base: `{ gameId, score, total, date, timestamp }`
- Quiz adds: `peakStreak`, `timings[]` where each timing is `{ questionIndex, itemId, correct, durationMs, attemptNumber, timedOut? }`
- Memory adds: `flipAttempts`, `mismatches`, `peakMatchStreak` (plus a `peakStreak` mirror of the same value), `durationMs`

**DEFAULT_SETTINGS** (all 21 keys, `src/storage/adapter.js:1-23`): `numChoices: 2`, `feedbackMode: 'immediate'`, `questionsPerSession: 10`, `gaId: ''`, `childName: ''`, `animationsEnabled: true`, `tagOverrides: {}`, `timerMode: 'countUp'`, `timeLimitSeconds: 10`, `maxTries: 'none'`, `hintsEnabled: false`, `hintAfterWrongTaps: 2`, `retryCountsAsStreak: true`, `spacedRepetitionEnabled: false`, `difficultyAutoProgressionEnabled: false`, `introDismissed: {}`, `speedRecordMinAccuracy: 70`, `locale: 'en'`, `parentDateRange: { preset: 'all', start: null, end: null }`, `memoryPairs: 5`, `soundEffectsEnabled: true`. (The README settings table also documents the admin-exposed subset — keep its existing per-setting explanations, verified against this list.)

**E2E spec inventory** (13 files in `e2e/`): `dashboard.spec.js`, `admin.spec.js`, `parent-dashboard.spec.js`, `kids-progress.spec.js`, `app-shell.spec.js`, `animal-sounds.spec.js`, `color-match.spec.js`, `character-match.spec.js`, `animal-memory-match.spec.js`, `intro-results-height.spec.js`, `visual.spec.js`, `html-validity.spec.js`, `css-validity.spec.js`.

**Engine inventory** (for README architecture tree + CLAUDE.md):
- Hooks (`src/hooks/`): `useGameSession`, `useMemorySession`, `useSettings`, `useScores`, `useBadges`, `useBestStreak`, `usePersonalBest`, `useSoundPlayer`, `useFocusOnMount`, `useFeaturedGame`, `useRecentlyPlayed`, `useGameTags`
- Components (`src/components/`): `AppShell`, `ExitConfirmDialog`, `ShellContext`, `Dashboard`, `GameCard`, `FeaturedGameCard`, `CategorySection`, `GameIntro`, `GameResults`, `GameChoiceGrid`, `MemoryBoard`, `Timer`, `StreakBadge`, `BadgeGallery`, `ScoreHistory`, `ManifestIcon`, `LocaleSelector`
- Lib (`src/lib/`): `badges.js`, `confetti.js`, `soundLibrary.js`
- Utils (`src/utils/`): `buildQueue`, `buildDeck`, `reinsertMissed`, `idealColumns`, `kidStats`, `dashboardUtils`, `dateRangeUtils`, `computeBadgeAwards`, `computeGameBadgeAwards`, `evaluatePersonalBest`, `evaluateMemoryPersonalBest`
- Per-game badge catalogs auto-discovered from `src/games/<id>/badges.js`; shared sounds in `src/assets/sounds/`

**Security facts:**
- GA: `sanitizeGaId` (`src/App.jsx:27-29`) strips everything outside `[A-Za-z0-9_-]` from the stored GA ID before it is interpolated into the `googletagmanager.com/gtag/js?id=` script URL; script injected only when a non-empty sanitized ID exists; `gaId` default `''` (off).
- No `dangerouslySetInnerHTML` anywhere in `src/` (grep-verified).
- `nginx.conf`: SPA fallback `try_files $uri $uri/ /index.html`; cache tiers — 1y `public, immutable` for `js|css|woff2?|ttf|svg|ico|png|jpg|jpeg`, 7d `public` for `mp3`; headers — `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`. **No CSP, no HSTS** (known gaps; HSTS/TLS belong to a fronting reverse proxy).
- Docker: `node:lts-alpine` build stage (`npm ci`, `npm run build`) → `nginx:alpine` runtime (~25 MB); compose maps `8080:80`, `restart: unless-stopped`. No secrets, no env vars, no volumes.
- All persisted data is localStorage: scores, settings (including the child's first name and optional GA ID), best streaks, personal bests, badge data. Nothing leaves the device unless GA is enabled.

**Dev facts:** Vite dev server uses `usePolling: true, interval: 300` (`vite.config.js`); Playwright starts dev (5173) + Storybook (6006) via its `webServer` array; prerequisites Node 18+.

**Duplication audit findings** (for the ENHANCEMENTS "Core engine" section — these are the named findings, verified by reading all three quiz-game `index.jsx` files):
1. **Quiz-game scaffold** — `src/games/animal-sounds/index.jsx`, `src/games/color-match/index.jsx`, `src/games/character-match/index.jsx` each repeat a near-identical ~70-line structure: 21-field `useGameSession` destructure → `useShellGameStatus` call → `settingsLoaded/introResolved` guard → `GameIntro` wiring (6 identical props) → `GameResults` wiring (11 props, 8 identical) → hidden `data-testid` span → progress/prompt block → identical `timerMode !== 'off' && <Timer …/>` line → timeout status row → parent-tap Next button. Only the prompt area, choice rendering, and missed-item rendering differ. Candidate: a `QuizGameShell` engine component with slots (`renderPrompt`, `getChoiceProps`, `renderChoiceContent`, `renderMissedItem`).
2. **`.game__*` CSS blocks** — 41 occurrences of shared-class rules (`.game__choice`, `.game__question`, `.game__prompt`, `.game__progress`, `.game__next`, `.game__timeout`) spread across the three quiz-game stylesheets (13–14 each). Same drift risk that caused the v0.24.1 unstyled-results bug. Candidate: move into `GameChoiceGrid`'s own CSS / `GameLayout.css`.
3. **Quiz correct/wrong chime layer** — `soundEffectsEnabled` + `src/assets/sounds` exist (v0.23.0) but only memory games use them (existing ENHANCEMENTS item, keep).
4. **Stale JSDoc in `src/storage/adapter.js`** — header says "these four async methods" above a ten-method contract (code-comment fix, out of scope here).

**Current cross-doc discrepancies being fixed** (from the spec's Problem section): README architecture tree lists 3 games; README says storage adapter is a "four-method interface"; README "Adding a New Game" manifest example lacks `tags` (required) and doesn't mention `gameType`/`badges.js`/`i18n`; README score shape omits quiz/memory extensions; README says six test layers while TESTING.md says five (six is correct); README scripts table lists 5 of 12 scripts.

---

### Task 1: Rewrite README.md

**Files:**
- Modify: `README.md` (full rewrite)

**Interfaces:**
- Consumes: Verified Facts appendix (games table, scripts, adapter, score shapes, settings, engine inventory, dev facts).
- Produces: section anchors and doc links the other docs point back to — keep top-level headings: `## Features`, `## Dashboard Features`, `## Getting Started`, `## Scripts`, `## Architecture`, `## Adding a New Game`, `## Deployment`, `## Testing`, `## Settings Reference`, `## Versioning`, `## Documentation`. New docs are linked as `docs/DEPLOYMENT.md` and `SECURITY.md`.

- [ ] **Step 1: Rewrite the file**

Keep the current README's accurate content (features list, dashboard features, AppShell explanation, design tokens, settings explanations) and fix every discrepancy. Required changes, section by section:

- **Features:** all four games; Animal Memory Match described with its real behavior (3–6 pairs via `memoryPairs`, sound on match, fireworks on completion).
- **Scripts table:** all 12 scripts from the appendix, one row each, with the one-line description matching what the script actually runs.
- **Architecture tree:** update the `src/` tree from the engine inventory — include `assets/sounds/`, per-game `badges.js`, and name all four game folders (replace "character-match today" wording). Show `useMemorySession`/`MemoryBoard` among the engine pieces.
- **Storage Adapter section:** present the five get/save pairs (ten methods) with the same code-block style as today; state that quiz and memory games extend the base score shape (exact shapes from the appendix) and point at `src/storage/adapter.js` JSDoc as the contract.
- **Adding a New Game:** manifest example must include `"tags": ["…"]` (required) and note `gameType: "memory"` for memory games plus the optional extension points (`badges.js`, `i18n/en.json` auto-merge). Score-shape line updated as above.
- **Deployment section:** shrink Docker detail to ~3 lines + link to `docs/DEPLOYMENT.md`.
- **Testing section:** keep the summary paragraph, count = six layers + static linting, link to `docs/TESTING.md`.
- **Settings Reference:** keep the table + explanations; verify every default/option against DEFAULT_SETTINGS in the appendix (they currently match — the table just needs re-verification, not correction).
- **New `## Documentation` index** (near the end): links to `docs/DEPLOYMENT.md`, `SECURITY.md`, `docs/TESTING.md`, `docs/ENHANCEMENTS.md`, `CHANGELOG.md`.

- [ ] **Step 2: Verify quoted facts mechanically**

Run (PowerShell):
```powershell
# every npm script named in README exists in package.json
$scripts = (Get-Content package.json | ConvertFrom-Json).scripts.PSObject.Properties.Name
Select-String -Path README.md -Pattern 'npm run ([a-z:-]+)' -AllMatches |
  ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value } |
  Sort-Object -Unique | Where-Object { $_ -notin $scripts }
```
Expected: no output (every referenced script exists).

```powershell
# every repo-relative path in the architecture tree / links exists
@('docs/DEPLOYMENT.md','SECURITY.md','docs/TESTING.md','docs/ENHANCEMENTS.md','CHANGELOG.md') |
  Where-Object { -not (Test-Path $_) }
```
Expected at this point: `docs/DEPLOYMENT.md` and `SECURITY.md` listed (they don't exist yet — created in Tasks 2–3; the final task re-runs this expecting empty).

- [ ] **Step 3: Commit**

```powershell
git add README.md
git commit -m "docs(61): rewrite README against v0.24.4 codebase"
```

---

### Task 2: Create docs/DEPLOYMENT.md

**Files:**
- Create: `docs/DEPLOYMENT.md`

**Interfaces:**
- Consumes: Verified Facts appendix (Docker, nginx, dev facts, localStorage inventory); README's `## Documentation` index links here.
- Produces: sections SECURITY.md links to (`Security headers` discussion defers rationale to SECURITY.md; SECURITY.md defers mechanics here).

- [ ] **Step 1: Write the document**

Required sections, in order, with the facts each must contain:

1. **Overview** — static SPA, no backend, no env vars, no build-time secrets; all runtime configuration lives in the admin page and persists to localStorage. Table of the three ways to run it (dev server / static build / Docker) with when to use each.
2. **Local development** — `npm install`, `npm run dev`, port 5173; note the file watcher uses polling (`usePolling: true, interval: 300` in `vite.config.js`) and why that setting exists (originally for a network-share checkout; harmless on local disk).
3. **Production build** — `npm run build` → `dist/`; `npm run preview` to smoke-test the build; what's in `dist/` (hashed assets, `index.html` shell) and why any static file server needs an SPA fallback.
4. **Docker** — stage-by-stage walkthrough of the `Dockerfile` (dependency layer caching via `COPY package*.json` + `npm ci` before `COPY . .`; `node:lts-alpine` build → `nginx:alpine` runtime ≈25 MB); `docker compose up --build`, `docker compose up -d`, port mapping 8080→80, `restart: unless-stopped`; how to update (git pull → `docker compose up --build -d`); file inventory table (`Dockerfile`, `nginx.conf`, `docker-compose.yml`, `.dockerignore`).
5. **nginx configuration, annotated** — reproduce `nginx.conf` in a code block and explain each block: SPA `try_files` fallback (why `/admin` or a page refresh 404s without it); the 1-year `immutable` cache tier (safe because Vite content-hashes filenames) vs the 7-day mp3 tier (sound files are NOT content-hashed, so a shorter TTL lets replaced sounds propagate); security headers (one line each, link to SECURITY.md for full rationale and known gaps).
6. **HTTPS / reverse proxy** — the container serves plain HTTP on :80; recommended: terminate TLS at a reverse proxy (Caddy/Traefik/nginx) in front; note that HSTS belongs at that proxy, not in this image; forwarded-header note (app needs none — no server-side auth or redirects).
7. **Data persistence & backup** — everything is per-browser localStorage (scores, settings incl. child's name, streaks, bests, badges); implications: clearing site data wipes it, different browsers/devices don't share it, the Docker container itself is stateless (no volumes needed); backup = Parent Dashboard CSV export; the storage-adapter swap path for a future backend (link to README architecture section).
8. **Troubleshooting** — blank page on deep-link/refresh → SPA fallback missing; stale UI after deploy → hashed assets vs cached `index.html` (nginx default `etag`/no-cache on HTML is what prevents this; state it); port 8080 already in use → change the compose mapping; sounds not updating → 7-day mp3 cache tier.

- [ ] **Step 2: Verify quoted facts mechanically**

The nginx code block in the doc must be a verbatim copy of `nginx.conf` — copy-paste it, don't retype. Verify:

```powershell
# every line of the doc's nginx block exists verbatim in nginx.conf
$real = Get-Content nginx.conf
Select-String -Path docs/DEPLOYMENT.md -Pattern 'try_files \$uri \$uri/ /index\.html' -SimpleMatch:$false
@('Dockerfile','nginx.conf','docker-compose.yml','.dockerignore','docs/TESTING.md') | Where-Object { -not (Test-Path $_) }
```
Expected: the `try_files` line matches in both files; the path check prints no output.

- [ ] **Step 3: Commit**

```powershell
git add docs/DEPLOYMENT.md
git commit -m "docs(61): add deployment guide (dev, build, Docker, nginx, HTTPS, data)"
```

---

### Task 3: Create SECURITY.md (repo root)

**Files:**
- Create: `SECURITY.md`

**Interfaces:**
- Consumes: Verified Facts appendix (security facts, localStorage inventory, Docker); DEPLOYMENT.md links here for header rationale.
- Produces: the "Known gaps / planned hardening" list that ENHANCEMENTS.md's Security section must mirror item-for-item (CSP, PIN lock, `npm audit` in CI, image scanning).

- [ ] **Step 1: Write the document**

Required sections, in order:

1. **Scope** — self-hosted family app; this document is both the security posture description and the vulnerability reporting policy.
2. **Architecture from a security standpoint** — static SPA; no backend, no accounts, no sessions, no cookies, no server-side data; attack surface = the browser runtime + the static file server + the supply chain.
3. **Data inventory** — table: what is stored (scores, settings incl. child's first name + optional GA ID, best streaks, personal bests, badge data), where (localStorage, this browser only), leaves the device? (No — except page-view events to Google when GA is deliberately enabled). State plainly: no PII beyond an optional first name, entered by the parent, stored locally.
4. **Analytics and children's privacy** — GA4 is off by default (`gaId` default `''`), opt-in via the admin page, and self-hosted scope; consistent with the existing assessment (kept in ENHANCEMENTS): no COPPA exposure while self-hosted with GA off; revisit if distributed to other families with GA on.
5. **XSS surfaces and mitigations** — React auto-escaping for all rendered strings (incl. `childName`); the one dynamic script injection is the GA loader, guarded by `sanitizeGaId` (`src/App.jsx`) which strips all characters outside `[A-Za-z0-9_-]` before the ID reaches the script URL; no `dangerouslySetInnerHTML` in the codebase; localStorage values are data, never executed.
6. **HTTP security headers** (as shipped in `nginx.conf`) — table: header / value / what it prevents (`X-Content-Type-Options: nosniff` → MIME sniffing; `X-Frame-Options: SAMEORIGIN` → clickjacking; `Referrer-Policy: strict-origin-when-cross-origin` → referrer leakage). Then **Known gaps**, stated honestly: no Content-Security-Policy (planned hardening — needs a worked-out policy because of GA's script/connect sources and inline style attributes); no HSTS in the container (TLS termination and HSTS belong to the fronting reverse proxy — link to DEPLOYMENT.md §HTTPS).
7. **Docker posture** — official base images (`node:lts-alpine`, `nginx:alpine`); multi-stage build keeps node/npm and source out of the runtime image; runtime serves static files only; no secrets or env vars in the image; note image-scan and non-root-user hardening as backlog items (mirrored in ENHANCEMENTS).
8. **Dependency policy** — `npm ci` from a committed lockfile; `npm audit` run manually today (CI automation is a planned enhancement); React/Vite kept on current majors.
9. **Supported versions** — table: latest minor (0.24.x) ✅, anything older ❌ (upgrade path: it's a static site, redeploy).
10. **Reporting a vulnerability** — use GitHub private vulnerability reporting on this repo (Security tab → Report a vulnerability), or an issue for non-sensitive reports; include repro steps and impact; response expectation stated modestly (family-run project, best effort).

- [ ] **Step 2: Verify quoted facts mechanically**

```powershell
Select-String -Path src/App.jsx -Pattern 'sanitizeGaId'   # the named function exists
Select-String -Path src -Pattern 'dangerouslySetInnerHTML' -Recurse  # expect: no matches
@('docs/DEPLOYMENT.md','docs/ENHANCEMENTS.md') | Where-Object { -not (Test-Path $_) }
```
Expected: first command matches, second none, third no output.

- [ ] **Step 3: Commit**

```powershell
git add SECURITY.md
git commit -m "docs(61): add SECURITY.md (posture, data privacy, headers, disclosure policy)"
```

---

### Task 4: Rewrite docs/TESTING.md

**Files:**
- Modify: `docs/TESTING.md` (full rewrite)

**Interfaces:**
- Consumes: Verified Facts appendix (E2E spec inventory, scripts); README's Testing section links here and both must say "six layers plus static linting".
- Produces: the layer names README summarizes; SECURITY.md's dependency section does not link here (no cross-link needed beyond README).

- [ ] **Step 1: Rewrite the file**

Structure: opening paragraph (six layers + static linting, all local, no external accounts), then a **summary table** (layer → command → what it uniquely catches), then one section per layer **preserving every existing rationale paragraph** — the current file's explanations (Stylelint-as-CSS3-conformance, inline-style CSSOM serialization, jsdom filter-contrast blind spot, html-validate vs W3C Nu) are the most valuable content in the repo's docs; carry them over intact, lightly edited only where facts changed. Additions the current file is missing:

- Unit/component gotchas: add `useSoundPlayer` as the audio mock seam (games play audio through it — mock the hook, not `Audio`), and memory-game session testing (drive `useMemorySession` via tile clicks; `MemoryBoard` tiles use `aria-disabled`, not `disabled`, so query accordingly).
- E2E section: the updated 13-spec inventory (from the appendix) with a one-line purpose each, including `animal-memory-match.spec.js` (flip-to-completion flow + computed-style guard) and `intro-results-height.spec.js` (one-screen fit at phone/tablet/desktop).
- Keep: fake timers + `fireEvent`, `vi.mock`/`vi.hoisted`, `data-testid="correct-<thing>-id"`, confetti mock seam, GameChoiceGrid render-prop pattern, native date inputs, visual-baseline update workflow, i18n conventions incl. pluralization.

- [ ] **Step 2: Verify layer-count consistency**

```powershell
Select-String -Path README.md,docs/TESTING.md -Pattern 'five layers|six layers|seven layers'
```
Expected: only "six layers", in both files.

```powershell
# every spec file named in TESTING.md exists
Select-String -Path docs/TESTING.md -Pattern '([a-z-]+\.spec\.js)' -AllMatches |
  ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value } |
  Sort-Object -Unique | Where-Object { -not (Test-Path "e2e/$_") }
```
Expected: no output.

- [ ] **Step 3: Commit**

```powershell
git add docs/TESTING.md
git commit -m "docs(61): rewrite TESTING.md — six layers, memory-game patterns, current spec inventory"
```

---

### Task 5: Rewrite docs/ENHANCEMENTS.md

**Files:**
- Modify: `docs/ENHANCEMENTS.md` (full rewrite, expanded)

**Interfaces:**
- Consumes: Verified Facts appendix (duplication audit findings 1–4); SECURITY.md's Known gaps list (mirror item-for-item in the Security section).
- Produces: nothing downstream; CHANGELOG entry mentions the expansion.

- [ ] **Step 1: Rewrite the file**

Keep the existing preamble convention ("Completed work is recorded in `CHANGELOG.md` — entries here are removed once they ship"). Every entry gets a one-line rationale. **All existing entries are preserved** (RTL dir sync, COPPA informational note, the 8 new-game ideas, animal-sounds improvements, quiz chime layer, sound replay on wrong answer, parental PIN, drag-to-reorder, per-child profiles, parent-dashboard chart labels + PIN, cloud sync, PWA ×2, CI pipeline, visual-tolerance tightening) — reorganized under the new category headings. New sections/entries required by issue #61:

- **UI** — dark mode via the existing CSS-token system (tokens already centralize color, so a `prefers-color-scheme` layer is cheap); per-game-type results theming; drag-to-reorder (moved here).
- **UX** — sound replay on wrong answer (kept); practice mode (kept, from animal-sounds list); parental PIN lock (kept); session-resume after accidental exit (the exit guard prevents accidents, but a resumable session would recover from crashes/reloads too).
- **Accessibility** — RTL `dir` sync (kept); reduced-motion audit for the memory flip/mismatch animations (quiz feedback already respects `prefers-reduced-motion`; the memory board's flip predates that pass); larger-text/zoom audit at 200%; switch-access / single-switch scanning exploration (this audience overlaps with early-intervention users).
- **Core engine (duplication → engine migrations)** — the four named findings from the appendix, each with file paths and the candidate abstraction: (1) `QuizGameShell` slot component for the ~70-line quiz scaffold ×3; (2) consolidate the 41 duplicated `.game__*` CSS rules into the shared component CSS; (3) quiz correct/wrong chime layer completing the v0.23.0 sound work (kept); (4) fix `src/storage/adapter.js` JSDoc header ("four async methods" → the real ten-method contract).
- **Game features** — difficulty curves per game (item pools tagged easy/hard, kept from animal-sounds list); per-game settings overrides (e.g. one game at 4 choices while others stay at 2); adaptive item selection weighting recently-missed items across sessions (today's spaced repetition is within-session only).
- **New games** — the existing eight kept verbatim; add (with pedagogical rationale): Sound Memory Match (memory board where matching is by sound, exercising the existing memory engine + sound library together), First Words (picture → spoken word, receptive vocabulary), Same or Different (two pictures, binary choice — the simplest possible mechanic for the youngest users).
- **Security** — mirror SECURITY.md's Known gaps: CSP rollout (needs GA source allowances worked out); PIN gate for `/admin` and `/parent` (kept, cross-listed); `npm audit` in CI; container hardening (non-root nginx, image scanning); subresource-integrity note for the GA loader (limited value — the URL is Google-controlled — state that honestly).
- **Testing layers** — CI pipeline via GitHub Actions (lint, lint:css, test, build, e2e, Docker build; kept + expanded); tighten `maxDiffPixelRatio` (kept verbatim — it has load-bearing history); mutation testing (Stryker) on the engine utils; Lighthouse a11y/perf budgets in CI; a storage-adapter contract test (one suite run against any adapter implementation, so a future cloud adapter can't drift from localStorage behavior).
- **Backend / Sync & PWA** — cloud-sync adapter (kept); offline-first PWA (merge the two existing PWA entries into one).
- Keep the **Standards & Accessibility** resolved-audit note at top for continuity.

- [ ] **Step 2: Verify all prior entries survived**

Manually diff old vs new (`git diff docs/ENHANCEMENTS.md`) and confirm every pre-existing idea appears in the rewrite (reworded/moved is fine; dropped is not).

- [ ] **Step 3: Commit**

```powershell
git add docs/ENHANCEMENTS.md
git commit -m "docs(61): expand ENHANCEMENTS backlog across issue #61's categories"
```

---

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (update-leaning rewrite; stays lean)

**Interfaces:**
- Consumes: Verified Facts appendix (engine inventory, scripts, score shapes).
- Produces: nothing downstream.

- [ ] **Step 1: Update the file**

Keep the existing structure (Project / Commands / Architecture / Testing notes) and its terse instruction-file tone. Required edits only:

- Project line: add "…see `docs/DEPLOYMENT.md` for running it in production and `SECURITY.md` for the security posture."
- Commands block: verify against the 12 scripts; add `npm run validate:html` / `validate:css` / `preview` if absent (they are).
- Architecture: extend the auto-discovery paragraph with per-game `badges.js` auto-discovery; extend the hooks paragraph to name `useMemorySession`/`useSoundPlayer` alongside `useSettings`/`useScores`; score-shape sentence already correct (verified) — leave as is.
- Testing notes: add the `useSoundPlayer` mock-seam line and the `aria-disabled` memory-tile query note (mirrors TESTING.md).

- [ ] **Step 2: Commit**

```powershell
git add CLAUDE.md
git commit -m "docs(61): update CLAUDE.md for memory engine, full command list, new doc pointers"
```

---

### Task 7: CHANGELOG entry, version bump, full-suite verification

**Files:**
- Modify: `CHANGELOG.md` (prepend entry), `package.json` (version only)

**Interfaces:**
- Consumes: everything above.
- Produces: the release record.

- [ ] **Step 1: Bump version**

`package.json`: `"version": "0.24.4"` → `"0.24.5"`.

- [ ] **Step 2: Prepend CHANGELOG entry**

```markdown
## [0.24.5] - 2026-07-12

### Added
- `docs/DEPLOYMENT.md` — full deployment guide: local dev, production build, Docker walkthrough, annotated nginx configuration, HTTPS/reverse-proxy guidance, data persistence and backup, troubleshooting (issue #61).
- `SECURITY.md` — security posture and disclosure policy: threat model, localStorage data inventory, children's-privacy analysis of the opt-in GA integration, XSS mitigations, HTTP security headers with known gaps, Docker posture, dependency policy, vulnerability reporting (issue #61).

### Changed
- Full documentation review against the v0.24.4 codebase (issue #61). README corrected: all four games in the architecture tree, the real ten-method storage adapter, `tags`/`gameType` in the add-a-game guide, complete score shapes, all 12 npm scripts, and a documentation index. `docs/TESTING.md` corrected to six layers plus static linting and extended with memory-game test patterns and the current e2e spec inventory. `docs/ENHANCEMENTS.md` reorganized and expanded with UI/UX/accessibility/engine-migration/security/testing suggestions, including a named audit of quiz-game code duplicated across the three games. `CLAUDE.md` updated to match.
```

- [ ] **Step 3: Full mechanical verification**

```powershell
# 1. All doc-referenced npm scripts exist
$scripts = (Get-Content package.json | ConvertFrom-Json).scripts.PSObject.Properties.Name
Get-ChildItem README.md,SECURITY.md,CLAUDE.md,docs/*.md | ForEach-Object {
  Select-String -Path $_ -Pattern 'npm run ([a-z:-]+)' -AllMatches
} | ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value } |
  Sort-Object -Unique | Where-Object { $_ -notin $scripts }
# Expected: no output

# 2. All relative doc links resolve
# For each of README.md, SECURITY.md, docs/DEPLOYMENT.md, docs/TESTING.md, docs/ENHANCEMENTS.md:
# extract [text](path) targets that don't start with http and Test-Path each
# (relative to the containing file's folder). Expected: all exist.

# 3. Layer count consistent
Select-String -Path README.md,docs/TESTING.md,CLAUDE.md -Pattern 'five layers|seven layers'
# Expected: no output

# 4. Build + lint still pass
npm run build    # Expected: vite build succeeds
npm run lint     # Expected: exit 0
```

- [ ] **Step 4: Commit**

```powershell
git add CHANGELOG.md package.json
git commit -m "docs(61): changelog entry and version bump to 0.24.5"
```
