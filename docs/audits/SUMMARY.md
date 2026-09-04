# Audit Summary — The Playground

**Date:** 2026-09-04
**Version:** 1.1.10
**Scope:** Seven parallel, independent audits — Security, Testing, Accessibility, Internationalization, Performance, Storage/Data Layer, and Core Functionality & Features — each performed as a read-only, evidence-based investigation against the current codebase. Each has its own full report in this directory; this file synthesizes them and does not repeat their detail.

| Report | File |
|---|---|
| Security | [security.md](security.md) |
| Testing | [testing.md](testing.md) |
| Accessibility | [accessibility.md](accessibility.md) |
| Internationalization | [i18n.md](i18n.md) |
| Performance | [performance.md](performance.md) |
| Storage / Data Layer ("Database") | [storage-database.md](storage-database.md) |
| Core Functionality & Features | [core-functionality.md](core-functionality.md) |

---

## Headline verdict

The Playground is a mature, well-architected small app. None of the seven audits found a Critical or High severity defect. The strongest theme across all seven reports: **the app's documentation (CLAUDE.md, TESTING.md, SECURITY.md, ENHANCEMENTS.md, accessibility_usability.md) checks out against actual code** — this is not a project where docs have drifted from reality. Where prior audits (accessibility, security) had already logged findings, most were confirmed fixed; the few that weren't are explicitly tracked in `docs/ENHANCEMENTS.md`, not silently dropped.

The two genuine architectural risks worth the team's attention are:

1. **No React error boundary anywhere** (Core Functionality, High) — a throw in any one game blanks the *entire app*, including the header/footer shell. Given the "drop a folder in `src/games/`" extensibility model this repo is built around, one bad third-party-feeling game component can take down everything else.
2. **The storage adapter contract suite only enforces 5 of 7 documented method pairs** (Storage/Database + Testing, Medium/architectural) — `getItemStats`/`saveItemStats` and the session-resume trio (`getSessionResume`/`saveSessionResume`/`clearSessionResume`) are tested today, but only against the concrete `localStorageAdapter`, not through the shared, adapter-agnostic contract suite. A future second adapter (e.g. a networked/Postgres-backed one) could pass CI while being silently broken for those two areas. This matters more than it would in most apps because a networked storage adapter is a live idea for this project.

Everything else found is Low/Medium severity, narrow, and cheap to fix.

---

## Per-domain summary

### Security — Low risk (0 Critical/High/Medium, 2 Low, 5 Info)
No `dangerouslySetInnerHTML`/`innerHTML`/`eval`; all rendering goes through React's escaping. The one place stored data reaches an executable context (the Google Analytics measurement-ID URL) is sanitized (`sanitizeGaId` in `src/App.jsx`). The single known dependency advisory (react-router `GHSA-qwww-vcr4-c8h2`) is correctly allowlisted with a dated re-review gate and is architecturally unreachable in this app's usage. Two Low findings: no try/catch around `localStorage.setItem` (silent save failures possible), and an untracked `.playwright-mcp/` directory (stray browser logs + an unrelated 112MB installer) that isn't gitignored.

### Testing — Strong, with three concrete coverage gaps
1,458 tests across 111 files, six enforced test layers, mutation testing, and 9 CI jobs that mirror `docs/TESTING.md` almost exactly — confirmed by a live run, not just static review. Real gaps: **three of nine games (`character-match-bluey`, `emotions-match`, `number-tap`) have zero browser-level test coverage** — no e2e golden-path spec, no visual-regression baseline — despite having Storybook stories, which contradicts TESTING.md's "every game gets a visual baseline" claim. `visual.spec.js` uses a hardcoded story-ID list rather than auto-discovery, so nothing forces new games to be added. Two tests showed reproducible flakiness under full-suite load (pass in isolation). The storage contract-suite gap (see above) is confirmed from the testing-strategy angle as well.

### Accessibility — Strong, with real automated regression coverage
Full `eslint-plugin-jsx-a11y` recommended ruleset enabled with no relaxed rules; `npx eslint .` is clean. Real hand-written WCAG 1.4.3 contrast-ratio math tests, live-browser tap-target and 200%-zoom reflow tests — unusually rigorous for a project this size. Six of eight findings from the prior 2026-07-12 audit are confirmed fixed. Open items: `ResumePrompt.jsx` still doesn't move focus to its heading on mount (tracked, unfixed across a full audit cycle); confetti/celebration animations are gated only by an admin toggle, not `prefers-reduced-motion` (CSS animations do respect it correctly — only the JS-driven confetti path doesn't); 4 of 9 games have no live-browser axe e2e coverage (jsdom-level `jest-axe` only).

### Internationalization — Genuinely multi-locale, not just scaffolded
Three locales ship in production (`en`, `es`, `pl`) across the core bundle and all nine per-game i18n folders, with zero missing keys and CLDR-complete pluralization (Polish's four plural categories are fully populated and tested). Locale switching is live across all mounted components via the same broadcast mechanism CLAUDE.md documents for settings sync. Gaps: four hardcoded English strings in `src/App.jsx`'s top-level loading/error fallbacks (the most-frequently-rendered untranslated text in the app, since it fires on every route transition), a locale-unaware date formatter in the parent dashboard, no RTL support (untested need — no RTL locale ships), and no lint rule to catch a future hardcoded string the way `App.jsx`'s were missed.

### Performance — Core architecture is sound; two concrete asset problems
The suspected "eager-loading" bundling problem does **not** exist — only the tiny `manifest.json` glob is eager; actual game code lazy-loads per-game, confirmed via a real `npm run build` (each game is its own ~1–9KB chunk; the 392KB Recharts-based parent dashboard is excluded from the initial bundle, a deliberate fix for a previously measured LCP regression documented in a code comment). Real issues: **the PWA service-worker precache is ~9MB**, driven substantially by three wildly oversized animal-sound MP3s (1.5–1.9MB each vs. 20–140KB siblings — a bad encode, not intentional); one game icon is a 455KB PNG rendered at 52×52px (a sibling ships the equivalent as a 90KB WebP); `useScores.addScore` does three full read/write passes over an uncapped, ever-growing score-history array on every game completion; no component uses `React.memo`, so a 100ms timer tick re-renders the full choice grid (low impact at current scale, easy fix).

### Storage / Data Layer ("Database") — Solid engineering, two architectural risks
Every getter defensively handles corrupted JSON/wrong shapes with dedicated tests; the single-export adapter swap point is real and clean; the local-only privacy posture is a genuine asset (no network calls in the storage layer at all), independently corroborated by the security audit. The two real risks are the contract-suite gap (above) and: **no cross-tab concurrency protection** — `useBadges`/`useBestStreak`/`useItemStats` do read-modify-write against in-memory state refreshed only on mount, with no `storage` event listener, so two tabs open simultaneously will silently clobber each other's writes. Quota exhaustion is a 2–3 year horizon at realistic usage and not urgent, but no code anywhere checks quota or handles `QuotaExceededError` — the failure mode when it eventually happens is a silent, uncaught rejection with no user-visible signal.

### Core Functionality & Features — Mature, zero dead code, two real gaps
All nine game manifests are well-formed; zero dead components/hooks/utils found anywhere in `src/`; zero TODO/FIXME/leftover `console.log`. Orientation-gate timing-pause is genuinely implemented, not just doc-claimed. Versioning, badge-catalog auto-discovery, and settings validation (Admin's enum-only inputs structurally prevent invalid values) all verified correct in code. Two real gaps: **no React error boundary anywhere** (see Headline verdict), and **no catch-all/404 route** — an unmatched URL renders nothing at all, not even the app shell, unlike a bad `/game/<id>` which is handled gracefully.

---

## Cross-cutting "other areas" noticed

Each audit was asked to flag anything outside its own lane. Recurring and notable items, deduplicated:

- **No `ErrorBoundary` anywhere in `src/`** — independently flagged by the i18n, core-functionality, and (implicitly) storage audits. This is the single most cross-cutting finding in the whole exercise and reinforces it as the top priority.
- **Score-history retention has both a performance and a privacy dimension** — an unbounded, never-pruned lifetime history of a child's quiz answers and timing data, sitting indefinitely in `localStorage`. Flagged by both the performance and storage audits from different angles; worth a product conversation (e.g. a "clear history older than N" control) independent of either audit's original scope.
- **Documentation-currency risk**: there are now three point-in-time accessibility audit documents (`docs/accessibility_usability.md`, a `docs/superpowers/specs/` one, and this session's `accessibility.md`), each a valid historical snapshot but with nothing pointing a future reader at "which one is current." Same shape of risk (mildly) applies across this whole `docs/audits/` folder going forward — consider a one-line pointer from `README.md`'s doc index.
- **CI/deployment security posture is unusually mature for a project this size** (noted independently while auditing core functionality) — SHA-pinned GitHub Actions, Trivy image scanning, `audit-ci` gating with a dated allowlist-expiry check enforced in CI. Worth naming as a strength, not just an absence of findings.
- **Workspace hygiene**: an untracked `.playwright-mcp/` directory containing a 112MB unrelated installer and stray browser logs is sitting in the working tree (not a security issue since it's outside version control, but worth cleaning up).
- **A dead `APP_VERSION` Docker build-arg** in `docker-image.yml` that nothing in the Dockerfile consumes, given `CLAUDE.md` states app version comes from `package.json` at build time — likely leftover from a prior versioning approach.
- **No in-app storage-usage indicator** for a parent — as score history grows, there's no visibility into approaching the localStorage quota, which compounds the quota/growth finding above into a UX gap, not just a technical one.

None of these individually warranted a full eighth audit; they're listed here so they aren't lost, and each is attributed above to the report that surfaced it if you want the full evidence trail.

---

## Suggested priority order

If tackling this list, the highest-leverage fixes given effort-vs-impact are:

1. Add a top-level React error boundary (Core Functionality — High impact, small effort).
2. Add a catch-all `*` route with the app shell rendered (Core Functionality — small effort).
3. Extend the storage adapter contract suite to cover `getItemStats`/`saveItemStats` and the session-resume trio (Storage/Testing — protects against a real future regression given the networked-adapter direction under discussion).
4. Re-encode the three oversized animal-sound MP3s and the one oversized game icon (Performance — cuts ~5MB+ off the PWA install size for near-zero product risk).
5. Fix the four hardcoded strings in `App.jsx`'s loading/error fallbacks (i18n — small effort, highest-frequency-rendered untranslated text in the app).
6. Add e2e/visual-regression coverage for the three untested games (Testing — closes a real, contradicts-the-docs gap).
7. Gate confetti/celebration animation on `prefers-reduced-motion` in addition to the existing admin toggle (Accessibility — small effort).
8. Wrap `localStorage.setItem` calls in try/catch with at least a logged failure signal (Security/Storage — cheap robustness win).

Items not in this list (RTL support, cross-tab concurrency, score-history pruning/retention policy, storage-usage UI) are real but lower-urgency or require a product decision first, per each full report's own recommendation ordering.
