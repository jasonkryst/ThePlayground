# Potential Enhancements

Ideas for future development. Not committed to any timeline.

Completed work is recorded in `CHANGELOG.md` — entries here are removed once they ship. Each entry carries a one-line rationale so the "why" survives until someone picks it up.

Organized by the improvement categories from issue #61: UI, UX, accessibility, core engine, game features, new games, security, testing layers, and backend/sync.

---

## Standards & Accessibility (audit status)

Everything from the 2026-07-05 standards audit is resolved (shipped across v0.13.0–v0.16.0 — see `CHANGELOG.md`); `docs/superpowers/plans/2026-07-05-standards-audit-remediation.md` keeps the item-by-item record.

- **Informational, no action:** the app's opt-in Google Analytics integration has no COPPA exposure while self-hosted and GA-off-by-default; revisit only if this is ever distributed to other families with GA switched on. (This analysis is also recorded in `SECURITY.md`.)

---

## UI

- **Drag to reorder** — let parents arrange game cards by preference; the dashboard currently orders by category and discovery order, which stops being ideal once the catalog grows.
- **Collapse the duplicate header** (issue #49) — `Dashboard.jsx` renders its own "{Name}'s Playground" title directly below `AppShell`'s "The Playground" brand link, so the home route shows two near-identical titles stacked on top of each other; fold the child's name into the shell's header row instead.
- **Game enable/disable toggle in Admin** (issue #19) — let a parent hide a game from the dashboard without deleting its folder; useful once the catalog has 10+ games and not every one suits every child.

## UX

- **Sound replay on wrong answer** — auto-replay the sound when the child picks incorrectly (Animal Sounds); a child who mis-taps often never re-hears the prompt they were matching against.
- **Practice mode** — wrong answers repeat the question rather than moving on; removes session pressure for the youngest users who are still learning the mechanic itself.
- ~~**Parental lock on settings**~~ — done (issue #127): `/admin` and `/parent` are gated behind a generated math challenge by default, or an optional 4-digit PIN. (Cross-listed under Security.)

## Accessibility

Items marked **AU-n** come from the 2026-07-12 a11y/i18n/UX audit (`docs/accessibility_usability.md`), which found zero automated-scan violations — these are the judgment-level gaps automation can't see. (That audit also verified the memory board's reduced-motion coverage is already complete, so the previous "reduced-motion audit for the memory board" entry is resolved and removed.)

- **Full RTL support (`dir` attribute sync)** — the remaining half of RTL readiness (logical CSS properties already shipped in v0.16.0); requires an actual RTL locale to exist before it can be meaningfully verified. (Re-confirmed outstanding by the 2026-07-12 audit: `lang` syncs, `dir` doesn't.)
- **Switch-access exploration** — the target audience overlaps with early-intervention users; investigating single-switch scanning support (sequential focus + one activation input) would widen who can play.
- **Real assistive-technology pass** — one NVDA or VoiceOver session through a full game loop (AU-2 landed in v0.26.0; known gap for that pass: consecutive same-type events render identical live-region text, so screen readers may not re-announce the second of two correct answers in a row — the memory game's mismatch announcement shares this property); static audits and axe can't judge announcement verbosity or pronunciation.

## Core Engine

- **Shared `CHOICE_COLORS` constant** — `src/games/animal-sounds/index.jsx` and `src/games/fruit-veggie-id/index.jsx` each define an identical 4-entry array of the same CSS-variable colors for picture-choice buttons; extracting it to a shared `src/lib/choiceColors.js` (or a `QuizGameShell` default) removes the copy-paste for this and any future picture-choice quiz game.

## Game Features

- **Difficulty levels per game** — easy (2 choices, common items) vs hard (4 choices, similar-sounding/looking items); item pools tagged by difficulty. Originally proposed for Animal Sounds; the mechanism generalizes to every quiz game.
- **Show the item name after a correct answer** — reinforces early reading (originally an Animal Sounds idea; applies to all quiz games).
- **Expand the animal roster beyond 12** — zebra, bear, penguin, monkey, etc.; more variety per session at the cost of sourcing CC0 sounds.
- **Per-game settings overrides** — e.g. run Character Match at 4 choices while Animal Sounds stays at 2; today all quiz games share one `numChoices`, which forces the difficulty to the weakest game.

## New Games

Quiz-type (all get the engine's retries, hints, timers, badges, and personal bests for free):

- **Shape Sort** — present a shape name/picture, child picks the correct shape; foundational geometry vocabulary.
- **Alphabet Sounds** — play a letter sound (phonics), child picks the correct letter card; pre-reading phonemic awareness.
- **Big or Small** — show two objects side by side, child taps the bigger (or smaller) one; builds spatial reasoning.
- **Body Parts** — "Where's your nose?" with a cartoon figure; child taps the correct body part; receptive language staple.
- **Simple Patterns** — show a color/shape sequence with one item missing, child picks what comes next; early sequencing/logic.
- **First Words** — a picture is shown and its word is spoken; the child picks the matching picture from spoken-word prompts; receptive vocabulary for pre-verbal children.
- **Same or Different** — two pictures, one binary choice; the simplest possible mechanic, reachable by the youngest users before multi-choice games make sense.
- **Learning Spanish** (issue #106) / **Learning Polish** (issue #108) — a vocabulary quiz teaching Spanish/Polish words, reusing the existing `useSpeech` hook and quiz engine; the app already ships full es/pl locale infrastructure for UI translation, but nothing yet uses it as gameplay content.

## Security

Mirrors the "known gaps" in `SECURITY.md` — each of these is acknowledged there and tracked here. Items marked **SEC-n** come from the 2026-07-12 full security audit (`docs/superpowers/specs/2026-07-12-security-audit-findings.md`), which found no HIGH-severity issues:

- ~~**Fix nginx security-header inheritance (SEC-1, Medium)**~~ — done (issue #84): the three headers now live in a shared `nginx/security-headers.conf`, `include`d in the `server` block and both asset `location` blocks (each also gained `always`, so headers survive error responses too), guarded by a static config test plus a live e2e Docker header assertion.
- ~~**Content-Security-Policy rollout (SEC-2)**~~ — done (issue #86): the audit's starter policy shipped as-is in `nginx/security-headers.conf` (GA script/connect sources allowed, `style-src 'unsafe-inline'` for the app's legitimate per-item inline styles, `object-src 'none'`, `frame-ancestors 'self'`), guarded by a static directive-level test and a live e2e Docker assertion. Tightening `style-src` further (nonces/hashes, or a refactor to CSS custom properties) remains a follow-up, not done here.
- ~~**`Permissions-Policy` + `server_tokens off` (SEC-3)**~~ — done (issue #86): `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` added to `nginx/security-headers.conf` alongside the other headers (automatic `include`-everywhere coverage); `server_tokens off;` added to `nginx.conf`'s `server` block. Guarded by a static test (exact-value + presence assertions) and a live e2e check (asserts the header and a version-free `Server` response header on a real container).
- ~~**Harden the CSV builder (SEC-5)**~~ — done (issue #86): `buildCsvContent` (`src/utils/dashboardUtils.js`) now RFC 4180-quotes every field via a private `escapeCsvField` helper and prefixes a defusing apostrophe onto any value beginning with `=`/`+`/`-`/`@`. Covered by positive (safe values unaffected) and hostile-input (formula-prefix defusal, embedded quote/comma/newline) unit tests in `src/utils/__tests__/dashboardUtils.test.js`.
- ~~**PIN gate for `/admin` and `/parent`**~~ — done (issue #127): same fix as the UX parental-lock entry above. `ParentalLockGate` (`src/components/`) wraps both routes; `src/lib/parentalLock.js` owns the math/PIN verification logic. See `SECURITY.md` § Parental lock for what this does and doesn't protect against.
- ~~**`npm audit` in CI**~~ — done (issue #87, gate mechanism updated to `audit-ci` in issue #141): `audit-ci --moderate --skip-dev` gates the `npm-audit` job in `.github/workflows/ci.yml` on moderate+ production-tree findings; a separate `--omit=prod` plain `npm audit` step reports dev-tree findings (like the 3 moderate Storybook-chain advisories, SEC-6) to the run's step summary without ever failing the job. See `docs/TESTING.md` § Continuous Integration.
- **Upgrade to React 19 + react-router 8** — removes the need for the `npm-audit` gate's allowlist entry covering `GHSA-qwww-vcr4-c8h2` (react-router "RSC Mode CSRF Bypass"; not reachable via this app's `BrowserRouter`-only usage, but the installed version still sits in the flagged 7.12.0–8.2.0 range). Tracked as a real upgrade rather than folded into issue #141's pipeline fixes, since react-router 8 drops the `react-router-dom` package (imports move to `react-router`) and requires React ≥19.2.7 — a React 18→19 upgrade across the whole app, not a router-only change.
- ~~**Container hardening — non-root nginx + pinned base images (SEC-4)**~~ — done (issue #85): the runtime image switched to `nginxinc/nginx-unprivileged:1.27-alpine` (non-root `nginx` user, uid 101; compose port mapping adjusted to `8080:8080` since unprivileged nginx can't bind port 80), and both base images (`node:24-alpine`, `nginxinc/nginx-unprivileged:1.27-alpine`) are pinned to a major.minor version instead of a floating tag. Guarded by a static Dockerfile pin/non-root test (`nginx/__tests__/securityHeaders.test.js`) and a live e2e check (`e2e/nginx-headers.spec.js`) that boots the real pinned image and asserts the nginx process is non-root.
- ~~**Image vulnerability scanning (SEC-4 remainder)**~~ — done (issue #132): a `trivy` job in `.github/workflows/ci.yml` scans the built image with Trivy, failing on CRITICAL/HIGH findings that have an available fix (`ignore-unfixed: true`, so unpatched upstream Alpine CVEs don't block merges); a second always-run step reports every severity, including unfixed findings, as a SARIF upload to the repo's Security tab. See `docs/TESTING.md` § Continuous Integration.
- ~~**Subresource integrity for the GA loader**~~ — resolved (issue #86): SRI itself remains impractical for this loader (the gtag URL serves Google-rotated content, so a script-hash pin would break on rotation), but the CSP `script-src` allowlist shipped alongside SEC-2 is exactly the practical control the audit recommended in its place — nothing outside `'self'` and `https://www.googletagmanager.com` can execute as a script.
- ~~**CI job `permissions:` least-privilege blocks**~~ — done (issue #145): 8 of 9 `ci.yml` jobs inherited the default `GITHUB_TOKEN` scope instead of an explicit baseline. A workflow-level `permissions: { contents: read }` default now covers all of them (`trivy` keeps its own job-level override for the extra `security-events: write` it needs).
- ~~**GitHub Actions pinned to commit SHAs, not floating tags**~~ — done (issue #145): every third-party action in `ci.yml` and `docker-image.yml` is now pinned to a commit SHA (with a version comment alongside), so a tag can no longer be silently repointed. `.github/dependabot.yml` (github-actions ecosystem, weekly) opens update PRs when a pinned action ships a new release.
- ~~**react-router CVE allowlist re-review mechanism**~~ — done (issue #145): the `npm-audit` gate's `GHSA-qwww-vcr4-c8h2` allowlist entry now carries a dated `# Allowlist entry added: 2026-07-28` marker; `.github/__tests__/ci.test.js` fails once it's more than 180 days old, forcing a re-review or the React 19 upgrade below (still open — this only guards against the exception being silently forgotten, it isn't the upgrade itself).
- ~~**Release image never directly Trivy-scanned**~~ — done (issue #145): `docker-image.yml` previously built the image twice more and pushed straight from each `docker/build-push-action` call, so the artifact actually published to Docker Hub/GHCR was never itself scanned. It now builds once locally, Trivy-scans that exact image with the same CRITICAL/HIGH fixable-findings gate as `ci.yml`'s `trivy` job, and only then tags and pushes it — a scan failure blocks the release.

## Testing Layers

- ~~**CI pipeline**~~ — done (issue #88): `.github/workflows/ci.yml` runs lint, lint:css, unit tests (with coverage), the production build, the full e2e suite, and a Docker build check, on every push to `main` and every PR. See `docs/TESTING.md` § Continuous Integration.
- ~~**Lighthouse budgets in CI**~~ — done (issue #88): `lighthouserc.json` scores the dashboard, a representative game, `/parent`, and `/my-progress` against a real production build, failing the `lighthouse` job if any of performance/accessibility/best-practices/SEO drops below 0.8. See `docs/TESTING.md` § Continuous Integration.

## Backend / Sync

- **Cloud sync** — swap the localStorage adapter for a Supabase or Firebase adapter so scores follow the child across devices; the 15-method adapter interface was designed for exactly this swap (see `README.md` § Storage Adapter), and the contract test above would gate it (once extended to cover the item-stats/session-resume methods it doesn't yet exercise).
- **Per-child profiles** — support multiple child accounts with separate score histories; the storage shapes are keyed by game today, so profiles are a schema evolution best paired with the adapter/backend work.
- **Parent Dashboard enhancements** — game-name labels in charts (the interactive date-range filter and heatmap month labels shipped in v0.21.0; PIN protection for the `/parent` route shipped in issue #127).

## PWA / Installable

- **Offline-first PWA** — `vite-plugin-pwa` to generate a service worker and `manifest.webmanifest` so the app installs to the home screen and works without a network connection; a static SPA with localStorage persistence is the ideal PWA candidate, and car/travel use is a natural fit for this audience.
