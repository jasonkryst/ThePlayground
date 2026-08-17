# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.3] - 2026-08-17

### Changed

- Extracted the `CHOICE_COLORS` array (issue #148) — duplicated verbatim between `src/games/animal-sounds/index.jsx` and `src/games/fruit-veggie-id/index.jsx` for cycling picture-choice button backgrounds — into a shared `src/lib/choiceColors.js`. No behavior change; removes the copy-paste for this and any future picture-choice quiz game.

## [1.1.2] - 2026-08-05

### Fixed

- `e2e/pwa-csp.spec.js`'s CSP-violation check (issue #96) was failing in CI, and the same violation was live in the already-shipped `v1.1.1` production image: `src/index.css` loaded Nunito via a `@import url('https://fonts.googleapis.com/...')`, which `style-src 'self' 'unsafe-inline'` (`nginx/security-headers.conf`) blocks outright, since that directive predates the font import and was never widened for it — every real page load logged a blocked-stylesheet CSP violation and silently fell back to the default sans-serif. The Docker Release workflow builds and publishes images independently of the `CI` workflow's e2e job, so the broken font shipped to `v1.1.1` without the failing check stopping it. Fixed by self-hosting the font via `@fontsource/nunito` instead of widening the CSP to trust a third-party host — same-origin also means the font now benefits from `vite-plugin-pwa`'s asset precache (it wasn't covered by the service worker at all before), so it now loads offline too, consistent with issue #96's actual goal.
- Fixing the above unblocked a second, previously-hidden failure in the same serial test file: `manifest.webmanifest` was served with `Content-Type: application/octet-stream` (nginx's bundled `mime.types` predates the `.webmanifest` extension) instead of the IANA-registered `application/manifest+json`, which some browsers' PWA installability checks reject. The two tests share a `test.describe.configure({ mode: 'serial' })` block, so once the CSP test started failing on `v1.1.0`'s release, Playwright skipped every test after it in the file — this manifest bug has silently never actually run since PWA support (issue #96) first shipped. Added a `location = /manifest.webmanifest { default_type application/manifest+json; ... }` block to `nginx.conf`.

## [1.1.1] - 2026-08-05

### Changed

- Consolidated all parent-facing score data under `/parent` (issue #173): the raw session list used to live in Admin's "History" tab, sitting inside the Settings/Games/Badges tab group even though it wasn't a setting. It now renders as a new "Session History" section on the Parent Dashboard, reusing that page's existing date-range filter — `/admin` is purely configuration now (Settings/Games/Badges), and `/parent` is the one encompassing place for every score-related view (trends, streaks, heatmap, missed items, and the raw log).
- Fixed a pre-existing color-contrast failure in `ScoreHistory`'s date text (`opacity: 0.6` over the default text color rendered at 3.22:1 against a white background, below WCAG AA's 4.5:1 for normal-size text) — never caught before because the Admin page's own accessibility test only scanned the default Settings tab, not History. Switched to the same `--color-text-muted` token `ScoreHistory`'s own empty-state text already used, restoring ~5.2:1 contrast.
- Added `AdminPage` regression coverage confirming the History tab is really gone (3 tabs, not 4); extended `ParentDashboard` tests for the new section (all six headings, respects the date-range filter, matches the other sections' empty-state behavior) and a live e2e check (`e2e/parent-dashboard.spec.js`) that the raw list actually narrows with the date filter in a real browser. Retired an `e2e/admin.spec.js` test whose premise (4 tabs forcing a two-row wrap in Spanish at phone width) no longer holds with 3 tabs — the label-splitting invariant it guarded is still covered by the file's other "stays on one line" checks, which don't depend on row count.

## [1.1.0] - 2026-08-05

### Added

- PWA support (issue #96): the app is now installable to a home screen and works fully offline once a game has been visited, via `vite-plugin-pwa` (`generateSW` mode, `registerType: 'autoUpdate'` with `skipWaiting`/`clientsClaim` so a new deploy activates silently on the next load — no interrupting "update available" prompt). Precache covers the full app shell plus every game's images and audio (extending Workbox's default `globPatterns`), not just the JS/CSS shell, since the audience's car/travel use case needs actual gameplay to keep working, not just a blank screen. `scripts/generate-pwa-icons.mjs` hand-rolls the app icons (192/512/maskable, apple-touch-icon, favicon) as flat-color PNGs using the `--color-aqua`/`--color-aqua-dark` design tokens — the same zlib-based PNG-encoding approach `generate-character-match-placeholders.mjs` already used, avoiding a new image-library dependency. Also fixed `index.html`'s favicon link, which pointed at `/vite.svg` — a file that never existed in this repo, so every page load was silently 404ing on it.
- Added `e2e/pwa.spec.js` (positive: manifest is valid and installable with reachable icons, theme-color meta and apple-touch-icon present, the new favicon resolves; positive: the service worker registers, activates, and a previously-visited page survives going fully offline; negative control: a fresh browser context with no service worker installed does *not* survive offline, proving the positive case is really exercising the cache) — runs its own `npm run build` + `vite preview` rather than the dev server, since `vite-plugin-pwa` only injects the manifest/SW registration into the built `index.html`. Added `e2e/pwa-csp.spec.js`, mirroring `nginx-headers.spec.js`/`confetti-csp.spec.js`'s live-nginx-container pattern, proving the service worker registers and the app survives offline under the app's real, locked-down CSP too (negative: no CSP violations logged during registration) — skips without Docker, like its siblings.

## [1.0.9] - 2026-08-04

### Added

- Number Tap (issue #73): a new game teaching early counting. A target number (1–5) is shown, and the child taps that many objects from a larger pool (the pool always has 1-3 more objects than the target, so a wrong count is always reachable) then presses a "Done ✓" button to confirm — a wrong count (too few or too many) clears the selection for a retry, same `maxTries`/hint/streak/timer rules as every other game. This mechanic doesn't fit the existing discrete-choice quiz shell, so it's the first game to call `useGameSession` directly (composing `GameIntro`/`GameResults`/`ResumePrompt`/`Timer` itself, following the `animal-memory-match` precedent) instead of going through `QuizGameShell`.
- `useGameSession`'s `handleChoice` was split into a new `handleAttempt(isCorrect)` (the scoring/streak/timer/hint/retry/lock state machine) plus a thin `handleChoice(item)` wrapper that determines correctness from a discrete choice-click — a pure, behavior-preserving refactor (every existing game's tests pass unmodified) that lets Number Tap, and any future non-discrete-choice mechanic, drive the same engine by just reporting a boolean.
- Added `src/games/number-tap/__tests__/numbers.test.js`, `buildQuestionPool.test.js` (positive: pool always exceeds the target by 1-3 objects, for every target 1-5; negative: an equal-or-smaller pool would make every question trivially correct), and `NumberTapGame.test.jsx` (full session flow, retry-then-correct, wrong-count-on-final-try miss, countdown timeout, intro, session-resume, a11y, and a check that the results screen never offers the discrete-choice "harder difficulty" bump, which would otherwise silently change the shared `numChoices` setting for other games). Extended `useGameSession.test.js` with direct `handleAttempt` coverage plus a regression test proving `handleChoice`'s behavior is unchanged.

## [1.0.8] - 2026-08-04

### Added

- Emotions Match (issue #76): a new quiz-type game teaching emotional vocabulary. An emotion word is shown on screen as the prompt itself (unlike Fruit & Veggie ID, which hides its word to avoid spoiling the picture answer — here the word *is* the answer key, so there's no spoiler risk) and spoken aloud via the existing `useSpeech`/`useQuestionAudio`/`ReplayButton` stack for pre-readers; the child taps the matching face among plain-emoji picture-only choices. Ships 8 emotions (happy, sad, angry, scared, surprised, tired, silly, calm) chosen for being visually distinct at a glance, full en/es/pl i18n, and no engine changes — it's a pure consumer of `QuizGameShell`/`useGameSession`, closely modeled on `src/games/fruit-veggie-id/`. Uses the `vocabulary`/`emotions` dashboard tags, the latter falling back to the existing auto-capitalize tag-label behavior other untranslated tags (e.g. `food`) already rely on.
- Added `src/games/emotions-match/__tests__/emotions.test.js` (positive: exactly 8 emotions, each with id/nameKey/emoji, nameKey follows the `emotion.<id>.name` convention, every key resolves in i18n; negative: no duplicate ids or emoji) and `EmotionsMatchGame.test.jsx` (full session flow, intro, session-resume, es/pl locale speech, a11y, and the speech-unsupported case — the word prompt still renders since it was never hidden, and the replay button is absent).

## [1.0.7] - 2026-08-04

### Fixed

- Recurring CI-only e2e flakes surfacing in a different test each time, rather than the same one (issue #167). Two CI reruns of the exact commit that fixed #147/#165 each failed on a *different*, previously-passing test (`dashboard.spec.js`'s dashboard-cards test, then `css-validity.spec.js`'s animal-sounds intro — the latter being the same test/signature #165's own body already cited as a pre-existing occurrence on `main`, predating that fix entirely). Root cause: CI ran Playwright with 2 parallel workers, each launching a real Chromium instance against one shared `npm run dev` process, on `ubuntu-latest`'s ~2 vCPUs — occasional CPU contention could stall whichever test happened to be rendering at that moment well past its timeout, and which specific test lost that race was effectively random. This is the third time this exact contention class has surfaced in a different test (issue #141's `confetti-csp.spec.js`, issues #147/#165's `admin.spec.js`, now this), and each prior fix correctly patched its specific test but left the underlying contention in place for the next one. Pinned CI to a single Playwright worker (`workers: process.env.CI ? 1 : undefined` in `playwright.config.js`), removing the contention at its source instead of continuing to patch individual tests; local dev keeps Playwright's own default parallelism. `retries: 0` stays unchanged (deliberate — see `e2e/global-setup.js`).
- Added `__tests__/playwrightConfig.test.js`: positive (CI env pins `workers` to exactly `1`) and negative (`workers` is `undefined` outside CI, so local parallelism is untouched; `retries` and `fullyParallel` are unaffected by either).

## [1.0.6] - 2026-08-03

### Fixed

- Flaky e2e test on CI: `admin.spec.js`'s "replay intro brings back a dismissed game intro" (issues #147/#165). Timed out only on CI's constrained 2-worker Linux runner, never locally: clicking the resume prompt's "Start Fresh" starts a brand-new session whose resumable snapshot needs two React effect passes (queue-build, then snapshot-save) before it lands in `localStorage`, and the test's next `page.goto('/admin')` — a real navigation, unlike an in-app client-side route change — could fire before both passes finished under CI load, so the next visit found no snapshot and fell through to the intro instead of the resume prompt it asserts on. Added an `expect.poll()` guard before that navigation (matching the file's two other pre-existing guards for this exact hazard), and hardened `useGameSession.js` to persist a freshly built queue's resumable snapshot from refs in the same effect that builds it — including `restart()`'s rebuild — rather than waiting on a second render pass.
- Recurring React `act()` warnings across `KidsProgressPage`, `FruitVeggieIdGame`, `CharacterMatchGameBluey`, `CharacterMatchGame`, `useGameSession`'s own tests, and (confirmed by a full-suite run) any other game sharing these hooks (issue #147). Two distinct causes: (1) `KidsProgressPage`'s "no games" test and a `useGameSession` regression test each triggered an async effect (`adapter.getBestStreaks()`/the resume-check effect) without awaiting its flush — fixed by wrapping both in `act(async () => {...})`. (2) `useGameSession`'s and `useMemorySession`'s shared display-only `currentElapsedMs` polling `setInterval(...,100)` is a genuine wall-clock timer that can land in the real-time gap between two sequential `act()` calls in any `userEvent`-driven component test — traced via the warning's own stack trace straight to each interval's callback. Since this stack's `userEvent` deadlocks when combined with fake timers, and per-test real-timer waits don't reliably win the race either, added a narrowly-scoped, stack-verified `console.error` filter (`src/lib/suppressKnownActWarnings.js`, wired in `src/test-setup.js`) that only drops a warning whose update genuinely traces back to one of those two hooks' intervals — any other act() warning, including these same message strings from a different source, still prints.
- Added regression coverage for both fixes: `useGameSession.test.js` gets a positive test (a fresh queue build persists its snapshot with the just-reset values) and a negative test (accepting an existing resume snapshot never persists a freshly rebuilt queue over it); `src/lib/__tests__/suppressKnownActWarnings.test.js` covers both message variants from the known hooks (suppressed) and the same message text from an unrelated source or an unrelated message entirely (not suppressed), plus edge cases (missing stack, non-string message).

## [1.0.5] - 2026-08-03

### Fixed

- Admin page pill labels breaking across two lines instead of wrapping as whole pills (issue #156): `.admin__tab` (Settings/Games/Badges/History) and the 4-way Theme picker (`.admin__toggle-btn` within a new `.admin__toggle--auto` group) both used `flex: 1` to split a fixed-width row evenly, which — combined with the global `button { overflow-wrap: anywhere }` rule added for issue #115 — let an individual label's own text wrap onto a second (or third) line once its equal share of the row got too narrow. This reproduced even in English at ordinary phone widths (390px), not just for longer translations. Switched both to natural width plus `white-space: nowrap`, so a label that doesn't fit its row now sends the *whole pill* down to a new line via the existing `flex-wrap: wrap` container, never splitting a word — the same graceful-degradation pattern `.date-range-filter__tab` already used. Plain two-way On/Off toggles are unaffected and keep the equal-width 50/50 split, since no supported locale's short "On"/"Off" text is at risk there.
- Added `e2e/admin.spec.js`'s "pill label single-line regression (issue #156)" suite: positive checks that every tab and Theme-option label renders on exactly one CSS line box (via `Range.getClientRects()`) at phone width in English and, for the longest labels, Spanish; negative checks that the Spanish tab row genuinely spans two rows (proving whole-pill wrap, not merely fitting) and that a plain On/Off pair's equal-width split is untouched by the fix.

## [1.0.4] - 2026-08-03

### Fixed

- CI hardening & supply-chain findings from the issue #133 full-audit re-run (issue #145):
  - **react-router CVE allowlist had no expiry/re-review mechanism.** `ci.yml`'s `npm-audit` gate allowlists `GHSA-qwww-vcr4-c8h2` with sound reasoning (this SPA never reaches react-router's RSC/framework mode), but nothing stopped that exception from silently calcifying. Added a dated `# Allowlist entry added: 2026-07-28` marker and a `.github/__tests__/ci.test.js` assertion that fails once the entry is more than 180 days old, forcing a fresh re-review or the already-tracked React 19 + react-router 8 upgrade (`docs/ENHANCEMENTS.md`).
  - **8 of 9 `ci.yml` jobs inherited the default `GITHUB_TOKEN` scope instead of an explicit least-privilege baseline.** Added a workflow-level `permissions: { contents: read }` default; the `trivy` job keeps its own job-level override for the extra `security-events: write` it needs (job-level permissions replace, not merge with, the workflow-level default).
  - **GitHub Actions were pinned to floating tags, not commit SHAs.** Every third-party action in `ci.yml` and `docker-image.yml` is now pinned to a commit SHA (e.g. `actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0`), so a tag can no longer be silently repointed. Added `.github/dependabot.yml` (github-actions ecosystem, weekly) so pins get automated update PRs.
  - **The pushed release image was never directly Trivy-scanned** — `docker-image.yml` built the image twice more and pushed straight from each `docker/build-push-action` call, so only a same-commit proxy build in `ci.yml` was ever scanned. Reworked the release job to build once locally (`push: false`, `load: true`), run the same CRITICAL/HIGH fixable-findings Trivy gate against that exact image, and only then tag and push it — a scan failure now blocks the release.
  - Added regression tests for all four fixes: extended `.github/__tests__/ci.test.js` (permissions default, SHA-pinning validator + real-file assertion, allowlist-age validator + real-file assertion) and added `.github/__tests__/dockerImage.test.js` (permissions, SHA-pinning, build→scan→tag/push ordering) and `.github/__tests__/dependabot.test.js`, following the same `fs.readFileSync` + `yaml.parse` static-config-test pattern as `nginx/__tests__/securityHeaders.test.js` and the existing `ci.test.js`.

## [1.0.3] - 2026-08-03

### Fixed

- Accessibility findings from the issue #133 full-audit re-run (issue #146):
  - **Incomplete ARIA tabs pattern in `DateRangeFilter.jsx`.** Its preset pills already used `role="tablist"`/`role="tab"`/`aria-selected`, but nothing linked a tab to a panel (no `aria-controls`) and the custom-date section below wasn't marked `role="tabpanel"` — the same defect class already fixed in `AdminPage.jsx`, just never applied here. Unlike `AdminPage`'s tabs (one exclusive panel per tab), every preset here shares a single custom-range panel — picking `7d`/`30d`/`90d`/`all` doesn't hide it, and typing dates directly switches the range to `custom` without any tab click — so the fix gives each tab a stable `id`, points every tab's `aria-controls` at that one shared panel, marks the panel `role="tabpanel"`, and sets its `aria-labelledby` to all four tab ids jointly (WCAG 4.1.2 / WAI-ARIA APG Tabs pattern).
  - **Hardcoded hex colors bypassing the design-token convention (CLAUDE.md).** `GameChoiceGrid.css`'s `.highlight-correct::after` overlay and `index.css`'s `.correct` rule both hardcoded the same `#a5d6a7` green literal with no shared token — added a `--color-success` custom property to `index.css` and pointed both at it. Separately, `AnimalMemoryMatchGame.css` and `SoundMemoryMatchGame.css` both used `var(--color-text-muted, #666)` — a stale fallback that doesn't match either theme's real `--color-text-muted` value and was never needed since that token is always defined — removed the dead fallback in both files.
  - Added regression tests at every layer touched: `DateRangeFilter.test.jsx` (tabpanel role, aria-controls/aria-labelledby wiring, holds across preset changes), a new `src/__tests__/designTokenColors.test.js` (source-text assertions that the token is referenced and the old literals are gone, following the same `fs.readFileSync`-based pattern as `nginx/__tests__/securityHeaders.test.js`), and confirmed the existing `parent-dashboard.spec.js` e2e a11y/visual suite still passes unchanged.

## [1.0.2] - 2026-08-03

### Fixed

- Question audio autoplaying during the resume prompt, before Resume/Start Fresh is pressed (issue #153): Animal Sounds and Fruit & Veggie ID are the two games whose prompt is itself spoken aloud, via the shared `useQuestionAudio` hook's auto-announce effect. That effect fires whenever `current` is truthy and `showIntro`/`introResolved` say the intro isn't blocking play — but it never checked `resumeAvailable`. `useGameSession`'s resume-check effect populates `current`/`index` from the saved snapshot and force-closes `showIntro` for the entire awaiting-resume-choice window (so `ResumePrompt` can preview real progress), which already satisfied every other guard condition before the player had chosen anything on that screen — so the clip/speech played under the resume prompt itself. Added a `resumeAvailable` param to `useQuestionAudio`'s guard, threaded through from both games' `session.resumeAvailable`. Added regression tests: hook-level (`useQuestionAudio.test.js`) covering both the suppressed and now-resumed-permitted cases, game-level unit tests for both affected games (resume prompt showing → no audio; Resume or Start Fresh chosen → audio plays), and a real-browser Playwright regression in `session-resume.spec.js` that counts actual `HTMLMediaElement.play()` calls rather than mocking audio.

## [1.0.1] - 2026-08-03

### Fixed

- Theme toggle icon invisible in High Contrast (issue #152): `.shell__theme-toggle` (the header's theme-cycling button) never set a `color`, unlike its sibling icon buttons (`.shell__back`, `.shell__nav-link`). That was harmless for three of the four theme glyphs (🌓/☀️/🌙), which are color emoji and ignore CSS `color` entirely, but the High Contrast glyph (◐, U+25D0) has no default emoji presentation and renders as plain text taking the button's inherited foreground color — which fell back to the browser's default black button text, invisible against High Contrast's black header background. Existing axe-based contrast tests never caught this because the icon `<span>` is `aria-hidden` (decorative; the button's `aria-label` carries the accessible name), which axe excludes from its contrast scan. Added `color: var(--color-text)` to `.shell__theme-toggle`, plus a real-browser regression test (`e2e/themes.spec.js`) that compares the icon's computed color against the header background for every theme instead of relying on axe, and unit tests (`AppShell.test.jsx`) asserting the correct glyph renders for every valid theme and that an unrecognized persisted theme value still falls back to a visible icon.

## [1.0.0] - 2026-07-28

### Changed

- First 1.0.0 release. No functional changes from 0.40.1 — this marks the app as stable after seven games, three locales (en/es/pl), the full quiz/memory engine, parental lock, session resume, adaptive item selection, badges, and a nine-job CI pipeline (lint, unit tests, e2e, accessibility, visual regression, HTML/CSS validation, Docker build, dependency audit, Lighthouse budgets, Trivy image scanning) all in place and green.

## [0.40.1] - 2026-07-28

### Fixed

- Fix all broken CI pipelines (issue #141), which had been red on `main` since PR #135 (2026-07-24) — six unrelated problems in total, the sixth only surfacing once this fix's own PR started generating real CI runs to audit:
  - `npm-audit`: was failing on every run since a high-severity `react-router` advisory (`GHSA-qwww-vcr4-c8h2`, RSC-mode CSRF, published after the gate shipped) matched the installed `7.18.1`. The gate mechanism moved from plain `npm audit` to `audit-ci` (new devDependency), which adds the missing per-advisory allowlist primitive: `GHSA-qwww-vcr4-c8h2` is now allowlisted (this app is a client-only SPA using `BrowserRouter`, never react-router's RSC/framework mode — the vulnerable path isn't reachable here), while every other moderate+ production-tree finding, present or future, still fails the gate exactly as before. The real fix — upgrading to React 19 + react-router 8, which removes the need for this allowlist — is tracked as a backlog item in `docs/ENHANCEMENTS.md` rather than rushed through here, since react-router 8 drops the `react-router-dom` package and requires React ≥19.2.7.
  - `lighthouse`: was failing since PR #139 (2026-07-27) with "Chrome installation not found" — `ubuntu-latest` stopped guaranteeing a pre-installed Chrome for `lhci`'s browser launcher to auto-detect, unrelated to any app change. Added an explicit `browser-actions/setup-chrome@v2` step, wiring its `chrome-path` output to `CHROME_PATH`. That fix's own first real CI run surfaced a second issue only visible in Actions: Chrome was now found but crashed on launch (`No usable sandbox!`) since a `setup-chrome`-installed binary has no setuid-sandbox helper registered in the runner's container. `collect.settings.chromeFlags: ["--no-sandbox"]` turned out to be silently ignored (lhci only honors it on the non-`puppeteerScript` launch path, and this config already uses `puppeteerScript`); the actual fix is `collect.puppeteerLaunchOptions.args: ["--no-sandbox"]`, confirmed against a real Actions run.
  - `e2e` visual regression: 5 stories added by issues #92 and #131 (`components-gameresults--with-accent`/`-dark`/`-high-contrast`, `components-gameresults--memory-perfect-run`, `games-soundmemorymatchgame--default`) had their Playwright baseline screenshots generated and committed from a Windows dev machine (`*-chromium-win32.png`) but never got the `*-chromium-linux.png` sibling CI actually needs. Generated and committed the 5 missing Linux baselines.
  - `e2e` zoom-large-text: Core Themes (issue #11) added a 4th header icon (the theme quick-toggle) to `AppShell`'s row-1 icon nav without re-verifying its already-documented fixed-width budget under a large-text setting. Root cause: the icon buttons paired a hard `min-width/min-height: 48px` touch-target floor with a *relative* glyph `font-size: 1.5rem`, which grows past that fixed box once the root font-size gets large enough (2× large text makes `1.5rem` == 48px, matching the whole box) — the 4th icon was just what tipped an already-marginal row over a phone-width viewport. Froze the icon glyph `font-size` to a fixed `24px` on `.shell__back`/`.shell__nav-link`/`.shell__home`/`.shell__theme-toggle` (decorative, aria-labelled glyphs, not resizable text WCAG 1.4.4 applies to).
  - `e2e` confetti-csp flake: its 3 tests shared a worker-scoped `beforeAll` that runs `npm run build` into the repo's single `dist/` directory before bind-mounting it into a Docker container; with `fullyParallel` scheduling across CI's 2 workers, two tests could land on different workers and run concurrent, colliding builds against that one shared directory. Added `test.describe.configure({ mode: 'serial' })` (the same pattern `e2e/visual.spec.js` already uses, there for Storybook cold-compile contention) so the file's tests always run on one worker.
  - `e2e` css-validity flake: CI's `e2e` job runs with only 2 workers (2-vCPU standard runner) sharing one `npm run dev` instance; Vite compiles each route's module graph lazily on first request, so two workers' simultaneous first-touch navigations to different routes could occasionally exceed even a 60s timeout — hit twice across this PR's own first 3 real CI runs (`css-validity.spec.js`'s animal-sounds test). Since `retries: 0` is a deliberate choice in this repo, added `e2e/global-setup.js` (wired via `playwright.config.js`'s new `globalSetup` option) to sequentially visit every route once, single-threaded, before the parallel workers start.
  - See `docs/superpowers/specs/2026-07-28-fix-ci-pipelines-design.md` for full root-cause analysis of all six.

## [0.40.0] - 2026-07-28

### Added

- Sound Memory Match (issue #131): a new memory-type game reusing the v0.23.0 memory engine (`useMemorySession`, `MemoryBoard`, `buildDeck`) with a twist — flipping a tile plays a sound clip instead of revealing a picture, so pairs are found by ear rather than by sight. `MemoryBoard`'s generic `renderFace` render prop already made this a game-level change, not an engine change: the new game's `index.jsx` wraps `flipTile` in its own `handleFlip`, mirroring the engine's own down/locked guards so a click that would be a no-op internally (already face-up, or during the post-mismatch lock window) never fires a clip either. While a pair is still being found, every face-up tile (including a mismatch) renders the same generic 🔊 glyph, so there's never a visual shortcut around listening; only once a pair is actually matched does the tile swap to the real item picture, as a reward rather than a hint. That reveal needed one small additive change to the shared engine: `MemoryBoard`'s `renderFace(itemId)` now also receives the tile's state as a second argument (`renderFace(itemId, tileState)`), which existing callers (Animal Memory Match) simply ignore. Ships its own 6-clip item pool (elephant/horse/owl/pig/rooster/sheep, all already in the shared sound library) distinct from Animal Memory Match's animals, its own 6-badge catalog (`goodEar`, `listeningStreak`, `fullChorus` session badges; `soundSpotter`/`soundPro`/`soundMaestro` lifetime tiers on a per-game `pairsMatched` counter), and full en/es/pl i18n. Uses the `manifest.color`/`gameType` results theming from issue #92 (`#80DEEA`) and picks up personal bests, badges, orientation-lock, and every other memory-engine feature for free.

## [0.39.0] - 2026-07-28

### Added

- Per-game result theming (issue #92): the shared `GameResults` screen now takes two optional props, `accentColor` and `gameType`, wired from every game's own `manifest.json` (`manifest.color`, `manifest.gameType`) at the two existing call sites (`QuizGameShell`, Animal Memory Match's `index.jsx`). `accentColor` draws a thin colored top border and a matching ring around the results emoji — purely decorative inline styles, the same technique `KidsProgressPage`'s existing `manifest.color` border already used, so it carries no WCAG text-contrast obligation across Light/Dark/High-Contrast. `gameType === 'memory'` switches the results headline from "You scored X out of Y!" to "You found X out of Y pairs!" (new `common.scoreLabelMemory` i18n key, added to all three locales), matching the wording already used in-game. Omitting both props renders `GameResults` identically to before this change.

## [0.38.0] - 2026-07-27

### Added

- Core themes (issue #11): a new `theme` setting (`system` / `light` / `dark` / `high-contrast`, default `system`) reflows every chrome color — page/card backgrounds, text, borders, focus rings, solid-fill buttons, and the Parent Dashboard activity heatmap — through theme-aware CSS custom properties in `src/index.css`. `system` follows the OS's `prefers-color-scheme` via a `@media` block; the three explicit themes are set via a `data-theme` attribute on `<html>`, synced by a new `ThemeSync` component. Selectable in Admin (a new Theme control) or via a quick-toggle button in the header, reachable on every route, that cycles through all four options. All three rendered themes are verified WCAG AA (4.5:1 text, 3:1 borders/non-text) by a new `themeTokenContrast.test.js` unit test and `e2e/themes.spec.js`'s axe-core scans. Per-game content colors (Color Match's teaching swatches, character/animal art) and the correct/wrong feedback signal colors are unaffected by theme — they stay constant by design.

### Fixed

- `.results__btn--play` (the primary "Play Again" button on every game's results screen) had white text on the light `--color-lavender` pastel — 2.40:1 contrast, below the WCAG AA minimum. Now uses `--color-lavender-dark` (6.44:1), the token every other primary button in the app already used correctly.
- `.results__score`, `.results__label`, and `.results__missed-heading` in `src/components/GameResults.css` were using raw color tokens with opacity dimming instead of theme-aware `-text` and `-muted` tokens, causing insufficient contrast in Dark and High-Contrast modes. Now use the proper theme-aligned tokens for correct rendering under all themes.
- Confetti and fireworks canvas elements in `src/lib/confetti.js` were rendering without the `aria-hidden` attribute, tripping WCAG region-semantic violations in accessibility audits. Now properly marked to exclude decorative canvas from assistive-technology examination.

## [0.37.0] - 2026-07-26

### Added

- Parental lock on `/admin` and `/parent` (issue #127): both routes now sit behind a shared unlock challenge, on by default — a generated math problem (e.g. "What's 7 + 8?") requiring no setup, or a 4-digit PIN a parent can set from a new "Parental Lock" section in Settings. `ParentalLockGate` (`src/components/`) wraps both routes outside their lazy `<Suspense>` boundary, so the admin/parent bundle isn't even fetched until the challenge is passed, and the gated content is never mounted (not just hidden) while locked. Verification logic (`getChallenge`/`verifyUnlock`, `src/lib/parentalLock.js`) and the per-session unlock state (`useParentalLockSession`, backed by `sessionStorage` — closing the tab/browser re-locks it) are deliberately isolated from the gate component itself, so a future login system has clean seams to extend rather than a rewrite. This is a toddler deterrent, not a real access-control boundary — see `SECURITY.md` § Parental lock for the full threat-model rationale (plaintext PIN storage, no rate-limiting, no recovery beyond clearing site data).

## [0.36.0] - 2026-07-26

### Added

- Session resume after interruption (issue #128): a browser crash, tab close, reload, or a deliberate exit via the exit guard's "Leave Game" button no longer loses an in-progress quiz session. `useGameSession` now persists a minimal snapshot (`gameId`, `queue`, `index`, `score`, `streak`, `missed`, `timings`, `peakStreak`) after every question transition via three new adapter methods (`getSessionResume`/`saveSessionResume`/`clearSessionResume`, a single global localStorage slot since only one game is ever active at a time). Reopening that same game within 4 hours shows a new `ResumePrompt` screen ("Welcome back!") offering to continue exactly where the child left off or start fresh; the saved queue embeds full item data, so resuming never depends on the current state of the game's content catalog. Scoped to quiz games; memory games are unaffected.

## [0.35.0] - 2026-07-25

### Added

- Cross-session adaptive item selection (issue #121): a new `adaptiveItemSelectionEnabled` setting (default off, independent of `spacedRepetitionEnabled`) weights future sessions' queues toward items a child has missed in *previous* sessions. Per-item miss history (`missCount`, `lastMissedAt`) is tracked unconditionally after every session via a new `useItemStats` hook and adapter methods (`getItemStats`/`saveItemStats`); when the setting is on, `buildQueue` uses a new weighted-random ordering (`weightedShuffle`, Efraimidis-Spirakis sampling) instead of a plain shuffle, with weight decaying by recency (14-day half-life) and capped at 3x a fresh item's baseline so no single hard item can dominate a session. Omitting the new `buildQueue` parameter — every existing call site, and the setting-off path — is byte-for-byte identical to prior behavior.

## [0.34.1] - 2026-07-24

### Fixed

- Parent Dashboard chart-axis labels and heatmap row alignment now scale under OS/browser large-text settings (issue #130), closing the last two residual gaps from the wave-2 px→rem conversion (issue #83). Recharts' `tick={{ fontSize: 12 }}` on `ScoreTrendChart`/`ResponseTimeChart`'s `XAxis`/`YAxis` was a raw JS number forwarded straight to an SVG `<text>` attribute, not a CSS rule, so it never scaled; it's now `'0.75rem'`, and the DOM-based text measurement Recharts uses to size its own axis gutter (`src/parent/ParentDashboard.jsx`) resolves that unit correctly. The heatmap's `.heatmap__day-label` boxes were already `rem`-sized (from issue #83's clipping fix) but `.heatmap__grid`'s row track, `.heatmap__cell`, and the month-label row were still fixed `px`, so the two desynced under large text; `src/parent/ParentDashboard.css` converts every heatmap dimension that has to track the day-label column to the same `rem` scale so both grow in lockstep. Verifying the fix at a simulated 2x text scale surfaced two more issues from the same font-size-now-actually-scales change, fixed alongside it: the chart's fixed-`px` `YAxis` gutter width and 8px right margin were tuned for a 12px-frozen label and started clipping the rightmost x-axis tick once the label could grow, so `YAxis` now sizes its gutter as `width="auto"` and the chart's right margin widened to accommodate a scaled label; and the visually-hidden per-chart data table (an `.sr-only`, `width: 1px` `<table>` for screen readers) hit the same CSS2.1 CAPMIN `auto`-table-layout bug already fixed for the streak table under issue #115, pushing the page into horizontal overflow at large text on narrow viewports — fixed with the same `table-layout: fixed` treatment via a new `.parent__chart-data-table` class.

## [0.34.0] - 2026-07-24

### Added

- Automated Docker image vulnerability scanning in CI (issue #132, the SEC-4 remainder left open by issue #85's container hardening): a new `trivy` job in `.github/workflows/ci.yml` scans the built image with [Trivy](https://trivy.dev/), failing the build on CRITICAL/HIGH findings that have an available fix (`ignore-unfixed: true`, so unpatched upstream Alpine CVEs with no available patch don't block merges). A second step, which runs even if the gate failed, reports every severity — including unfixed findings — as a SARIF upload to the repository's Security tab, matching the report-without-blocking posture the `npm-audit` job's dev-tree step already established. The first real CI run against this scan also caught a stale `nginx-unprivileged:1.27-alpine` base image (2 CRITICAL + 33 HIGH fixable vulnerabilities, unrebuilt since 2025-06-23); bumped to `1.30-alpine` (rebuilt 2026-07-20) to resolve them.

## [0.33.2] - 2026-07-24

### Fixed

- `react-router`/`react-router-dom` bumped `7.17.0` → `7.18.1` (non-breaking, same major) to clear two moderate-severity advisories (`GHSA-wrjc-x8rr-h8h6` open redirect via backslash in `<Link>`/`useNavigate`, `GHSA-h8fp-f39c-q6mh` XSS via missing protocol validation, `GHSA-337j-9hxr-rhxg` arbitrary constructor injection via SSR hydration error deserialization) flagged by CI's `npm-audit` gate (`npm audit --omit=dev --audit-level=moderate`), which was failing on `main`. No API changes needed — the app doesn't use any of the affected code paths directly, but the gate correctly blocks on the dependency regardless.

## [0.33.1] - 2026-07-22

### Fixed

- Blocked audio autoplay and blocked speech synthesis no longer fail silently (issue #123, AU-8). Root cause: `useSoundPlayer.play()` deliberately swallowed `audio.play()` rejections as a crash guard, and `useSpeech.speak()` had no failure signal at all — so a browser blocking either without a qualifying user gesture left Animal Sounds or Fruit & Veggie ID showing answer choices with no prompt and no cue anything had failed. Both hooks now expose a `blocked` flag (from `audio.play()`'s rejection and the Web Speech API's utterance `onerror` event respectively, guarded against false positives from the routine `stop()`/`cancel()` calls that fire on every question change), and a new shared `ReplayButton` component (`src/components/ReplayButton.jsx`, replacing the duplicated inline button in both games) pulses the 🔊 button with a localized "tap to hear" hint until the next successful playback.

## [0.33.0] - 2026-07-22

### Added

- A GitHub Actions CI workflow (`.github/workflows/ci.yml`, issue #88) that runs the full local test suite — static linting (`lint`, `lint:css`), the production build, and all six layers of automated testing (unit/component, accessibility audits, end-to-end, visual regression, HTML5 validation, and CSS validation — the latter five bundled into the full Playwright `e2e` suite) — plus a Docker build check, on every push to `main` and every pull request — previously these only protected a developer who remembered to run them locally before pushing. Runs as 8 independent parallel jobs so one failing check (e.g. lint) doesn't block feedback from the others.
- An `npm audit` gate in CI (issue #87): `npm audit --omit=dev --audit-level=moderate` fails the build on moderate+ findings in the production dependency tree, while a separate `--omit=prod` step reports dev-tree findings (e.g. the Storybook 8 chain's 3 moderate advisories, SEC-6) to the run's step summary without ever blocking a merge — matching the audit posture already documented in `SECURITY.md`.
- Lighthouse CI budgets (issue #88): `lighthouserc.json` scores the dashboard, a representative game (`/game/animal-sounds`), the parent analytics dashboard, and the kid-facing progress page against a real production build (`vite preview`, not the dev server), failing the job if performance, accessibility, best-practices, or SEO drops below 0.8 on any route.

## [0.32.4] - 2026-07-22

### Fixed

- A language change in Admin's `LocaleSelector` no longer requires a page refresh to take effect app-wide (issue #117). Root cause: `src/hooks/useSettings.js` gave every call site its own independent `useState` copy of settings, populated by a single `adapter.getSettings()` call on mount, with no shared state or event bus between instances. Invisible for most consumers, which live inside `<Routes>` and remount (and therefore refetch) on every navigation — it broke specifically for the two consumers mounted as permanent siblings of `<Routes>` that never remount for the life of the tab: `LocaleSync` (which actually calls `i18n.changeLanguage()`) and `GoogleAnalytics`. Fixed with a module-scoped pub/sub: `updateSetting`/`resetSettings` now broadcast the new settings object to every mounted `useSettings()` instance's listener, so `LocaleSync`'s existing `useEffect` re-runs immediately instead of waiting for a remount. Generic to all settings, not locale-specific, so `GoogleAnalytics` gets the same live-update fix for free. `LocaleSelector` also gained a brief, self-contained `role="status"` confirmation message ("Language updated") shown after a change, reusing the same dual-purpose visible-text/screen-reader-announcement convention `QuizGameShell`'s timeout message already uses.

## [0.32.3] - 2026-07-22

### Changed

- Issue #91 ("UX - TAP SIZE") investigated and reconfirmed already-compliant: `.dashboard__tab` still meets the app's 64×64px primary tap-target standard via the global `button` rule in `src/index.css` (the padding-only arithmetic issue #91 used, like the original AU-7 finding it restates, undercounts the rendered size because `min-height` wins over content-driven height). No CSS sizing change was needed. While implementing, also found AU-7 itself was wrong about `.date-range-filter__tab` (the parent-dashboard date-range tabs): it has no `min-height` override and meets the same 64px floor, unlike `.admin__tab`, which is a genuine smaller-by-design exception (`min-height: 56px`). Locked in with `e2e/tap-target-standard.spec.js` (positive checks on the dashboard pills and the parent date-range tabs; negative checks proving the dashboard's own secondary controls and the admin tab bar correctly stay below 64px) and a clarifying comment on `.dashboard__tab` in `Dashboard.css`. README's tap-target claim reworded to scope "throughout" to primary/child-facing controls, since the admin tab bar exception already meant it overclaimed independently of this issue.

## [0.32.2] - 2026-07-21

### Fixed

- Game dashboard icons no longer have to live in `public/`, outside a game's own folder (issue #39). Root cause: `manifest.json` is loaded as plain JSON via `import.meta.glob('./games/*/manifest.json', { eager: true })`, and plain JSON imports have no way to resolve a bundled asset URL — the only previous option for an image icon was a root-absolute path (`/games/<id>/<file>`) pointing at a real file physically placed in `public/games/<id>/`. A game can now drop an `icon.png`/`icon.gif`/`icon.jpg`/`icon.jpeg`/`icon.webp`/`icon.svg` file directly inside its own `src/games/<id>/` folder instead; a new `src/lib/gameIcons.js` resolves it via `import.meta.glob` (the same asset-resolution pattern `character-match`'s content images already used) and `src/App.jsx` substitutes it for the manifest's emoji `icon` automatically, with no manifest schema change and no changes needed in any of the five components that render an icon. `character-match` and `character-match-bluey` — the only two games using image icons — were migrated to the new convention; `public/games/` no longer exists.

## [0.32.1] - 2026-07-21

### Fixed

- Confetti and fireworks celebration animations, which had never actually rendered in any production deployment despite `animationsEnabled` being on (issue #109). Root cause: `canvas-confetti`'s bare default export lazily builds a *shared* cannon with `useWorker: true`, which loads its animation loop from a `blob:` Web Worker. This app's CSP has no `worker-src` directive, so per spec it falls back to `script-src`, which doesn't allow `blob:` — the Worker is silently killed by the browser (an error event, not a thrown exception, so `canvas-confetti`'s own try/catch around `new Worker(...)` never sees it), and since `transferControlToOffscreen()` had already handed the canvas's rendering context to that dead worker, nothing was ever drawn. It never reproduced in `npm run dev`, which sends no CSP header at all, so the regression shipped unnoticed. `src/lib/confetti.js` now builds its own cannon via `canvas-confetti`'s `create(null, { useWorker: false })`, forcing main-thread rendering so it never depends on a `blob:` Worker — no CSP change needed, keeping the CSP hardening from SEC-2/SEC-3 (issue #86) exactly as-is. Verified against the real, live production CSP: `e2e/confetti-csp.spec.js` boots the same pinned nginx image the Dockerfile ships, serving a real `npm run build` output, and samples the confetti canvas's own pixels (not just its presence — the canvas still got appended to the DOM before the worker handoff, so existence alone wouldn't have caught this) to prove particles actually render.

## [0.32.0] - 2026-07-21

### Added

- Dashboard game search (issue #103): a search box above the tag strip filters games by name as you type. Tag pills switched from single-select tabs to multi-select toggles (AND logic — a game must carry every selected tag), always sorting selected tags to the front of the row so an active filter is never hidden. Once there are more tags than fit on one line, the rest collapse behind a "+N more" toggle, driven by a new `useTagRowOverflow` hook that measures real rendered pill positions (`offsetTop`) rather than a hardcoded pixel count — same "measure real DOM, don't guess" approach as issue #104's `useFitTileSize`. A "Clear filters" action replaces the old standalone "All" tab. Tag pills also switched from `role="tab"`/`"tablist"` (which requires single selection) to `role="group"` + `aria-pressed` toggle buttons, the correct ARIA pattern for independent multi-select.

### Changed

- `docs/ENHANCEMENTS.md`'s AU-7 entry ("dashboard tab strip tap targets") removed — verified against a live render that `.dashboard__tab` is already 64×64px via the global `button` rule (present since project scaffold), not the ~33px the 2026-07-12 audit's padding-only arithmetic estimated. No CSS change was needed.

## [0.31.2] - 2026-07-21

### Fixed

- Long translated text no longer overflows past the edge of its container on narrow (phone-width) viewports (issue #115). Two distinct root causes, same class of bug:
  - Every button in the app is pill-shaped and 64px-minimum-tap-target-sized (`button` rule in `src/index.css`). Equal-width button rows (`.admin__tab` — the Settings/Games/Badges/History tabs — and every `.admin__toggle-btn` On/Off control) use `flex: 1`; a single unbreakable word that doesn't fit (Spanish "Configuración", Polish "Odznaki") has no space to wrap at, so with `overflow-wrap` unset, the browser let it overflow visibly instead of shrinking the row — pushing the whole Settings page up to 105px past the viewport edge rather than wrapping inside its own pill. Fixed globally on the base `button` rule with `overflow-wrap: anywhere` (not `break-word`, which is ignored by the min-content-size calculation that was the actual culprit) plus `hyphens: auto` for a cleaner break where the browser supports it. This also covers the `.date-range-filter__tab` pills on the parent dashboard, which share the same base rule.
  - The Streak History table (`.parent__streak-table`) used the default `table-layout: auto`, which is still allowed to grow a table past its own `width: 100%` to fit a column's content-based minimum width — a long translated header ("Mejor de todos los tiempos", "Najlepszy wynik w historii") pushed the table, and every block-level ancestor up to the page, past the viewport at phone width. Fixed with `table-layout: fixed` (columns split the 100% evenly up front and never grow for content) plus the same `overflow-wrap`/`hyphens` treatment on `th`/`td`.

## [0.31.1] - 2026-07-20

### Fixed

- Memory Match tiles now size themselves from both available width *and* height (issue #104), not width alone — on short/landscape viewports where the old fixed-width sizing produced a board taller than the screen, tiles shrink (down to a 48px sanity floor, revised down from issue #58's 120px tap-target floor specifically to prioritize showing the whole board over tile size when the two conflict) so more of the board fits without scrolling; tablet/desktop are unaffected, where the existing 140px cap still applies.
- The rotation-required overlay ("Turn it sideways!") no longer gets cut off on portrait phones. The still-mounted (but `inert`) game content underneath was contributing to the overlay container's layout height, due to flexbox's default `min-height: auto` — this could push the overlay's centered message below the visible viewport when the hidden content's own layout didn't fit the current orientation. The inert content is now fully collapsed (`display: none`) instead.

## [0.31.0] - 2026-07-19

### Added

- Polish (`pl`) locale support (issue #107): a third locale alongside `en`/`es`, built on the same auto-discovered `src/i18n/index.js` infrastructure — no plumbing changes needed. Ships a complete `pl.json` core file plus per-game `pl.json` files for all 6 games, including translated `manifestName`/`manifestDescription` (per the `nameKey`/`descriptionKey` convention from #105's follow-up). `character-match`/`character-match-bluey`'s licensed-show character names stay untranslated, matching the existing convention. `useSpeech`'s `SPEECH_LANG_BY_LOCALE` map and `LocaleSelector`'s `LOCALE_NAMES` map both gain a `pl` entry (`pl-PL`, "Polski").
- Polish grammar needs four CLDR cardinal plural categories (`one`/`few`/`many`/`other`) where English and Spanish only need two (`one`/`other`) — e.g. "1 opcję" / "2 opcje" / "5 opcji" all take different endings. Both pluralized keys (`common.difficultyOfferHeading`, `gameCard.playCount`) now carry all four Polish forms; i18next's `Intl.PluralRules`-backed resolver (already the default, no config change) picks the right one automatically.

### Changed

- The cross-locale key-parity test (`src/i18n/__tests__/i18n.test.js`) now compares *base* keys (stripping any plural suffix) across `en`/`es`/`pl`, plus a separate assertion that each locale defines the plural-suffix set its own grammar requires — the previous version's exact-key-set comparison couldn't express a locale needing more plural categories than another.
- `src/__tests__/manifestI18nKeys.test.js` now iterates `SUPPORTED_LOCALES` instead of hardcoding `en`/`es`, so it automatically covers whichever locales actually exist rather than needing a manual update every time one is added.

## [0.30.0] - 2026-07-19

### Changed

- Manifest `name`/`description` i18n (issue #105 follow-up): these two fields render in 6 and 2 user-facing places respectively (dashboard tile, featured card, in-game intro screen and page title, kids progress page) and were explicitly out of scope in the initial Spanish i18n work as "game-author metadata" — in practice they're clearly user-facing UI text. Every `manifest.json` now carries `nameKey`/`descriptionKey` instead of literal `name`/`description`, pointing into that game's own i18n namespace exactly like the existing item-`nameKey` pattern (e.g. `food.apple.nameKey`); the 6 consuming components resolve them via `t()`. A new test (`src/__tests__/manifestI18nKeys.test.js`) asserts every manifest's keys resolve in both locales, and the existing cross-locale parity test covers the 12 new translation keys automatically.

## [0.29.0] - 2026-07-19

### Added

- Spanish (`es`) locale support (issue #105): activates the existing (previously dormant) locale-switching infrastructure — `src/i18n/index.js` already auto-discovered per-locale JSON and derived `SUPPORTED_LOCALES` from what it found, and `AdminPage` already rendered a `LocaleSelector` once 2+ locales existed, but `en` was the only one that ever shipped. Ships a complete `es.json` (Latin American/US Spanish) alongside every existing `en.json`, core and all 6 games — `character-match`/`character-match-bluey`'s licensed-show character names stay untranslated, matching the pre-existing convention that manifest fields and proper names aren't localized. The locale picker (`LocaleSelector`) now shows friendly language names ("English"/"Español") instead of raw locale codes now that it's actually visible. A new cross-locale key-parity test (`src/i18n/__tests__/i18n.test.js`) walks the merged `en`/`es` resource trees and fails if either locale is missing a key the other has.

### Fixed

- `useSpeech` (`fruit-veggie-id`'s spoken-name prompt) hardcoded `utterance.lang = 'en-US'` regardless of the active locale — under Spanish this spoke translated Spanish text with a forced English voice. `speak()` now derives the utterance language from the active i18next locale via a small `SPEECH_LANG_BY_LOCALE` map, falling back to `en-US` for any locale without a mapped speech voice.

## [0.28.5] - 2026-07-18

### Fixed

- Accessibility wave 1 (issue #82, audit findings AU-1/AU-3/AU-6): quiz answer feedback (`.correct`/`.wrong`/`.highlight-correct` in `GameChoiceGrid`) now carries an `aria-hidden` ✓/✗ glyph plus a border ring alongside its existing color change, so color-vision-deficient and reduced-motion users get the same signal sighted color-motion users always had — mirrors the memory board's ✗-glyph-plus-outline mismatch state. Quiz choices switched from a native `disabled` attribute to `aria-disabled` plus a click-handler guard, so keyboard focus no longer drops to `<body>` when a locked/already-tried choice would previously have removed itself from the tab order (mirrors the v0.23.0 memory-tile fix). `ScoreHistory` now renders its stored `YYYY-MM-DD` date through `Intl.DateTimeFormat(i18n.language, …)` instead of the raw ISO string, parsed as a local date to avoid a UTC day-shift in negative-offset timezones, falling back to the raw string for any malformed/unparseable date instead of throwing (guards the pre-existing malformed-data regression suite).

## [0.28.4] - 2026-07-18

### Fixed

- Security hardening (issue #86, audit findings SEC-2, SEC-3, SEC-5): shipped a `Content-Security-Policy` (`default-src 'self'`, GA script/connect hosts allowed, `style-src 'unsafe-inline'` for the app's per-item inline styles, `object-src 'none'`, `frame-ancestors 'self'`) and a `Permissions-Policy` (`camera=(), microphone=(), geolocation=(), payment=()`) via `nginx/security-headers.conf`, and `server_tokens off;` in `nginx.conf` to stop disclosing the nginx version. `buildCsvContent` (`src/utils/dashboardUtils.js`) now RFC 4180-quotes every field and defuses spreadsheet formula injection (a leading apostrophe on any value starting with `=`/`+`/`-`/`@`) — preventive hardening ahead of the CSV export's first free-text column. The previously-noted Subresource Integrity gap for the GA loader is resolved by the new CSP `script-src` allowlist instead, per the audit's own recommendation. Guarded by static config/unit tests plus a live e2e Docker check, matching the pattern used for SEC-1 and SEC-4.

## [0.28.3] - 2026-07-18

### Fixed

- Visual regression suite (issue #89): `e2e/visual.spec.js` froze the browser clock (`page.clock.install`) before every story renders, since `useFeaturedGame`'s date-seeded "Today's Game" hash made any Dashboard/GameCard-rendering story legitimately non-deterministic day to day — indistinguishable from a real regression. All 39 baselines were regenerated under the frozen clock, which also picked up several real, previously-uncaught layout drifts (baselines that predated later intentional CSS/markup changes, silently absorbed by the old loose tolerance). `maxDiffPixelRatio` tightened from `0.1` to `0.02`, empirically re-measured against the fresh baselines (three full-suite reruns showed only one story with small stable jitter, ~0.01 ratio).

### Added

- Storage-adapter contract test (issue #89): `src/storage/__tests__/adapterContract.js` exports `runAdapterContractTests()`, an adapter-agnostic suite asserting the ten-method interface documented in `src/storage/adapter.js`; `localStorageAdapter.contract.test.js` runs it against the current adapter. A future backend adapter (see README § Storage Adapter) proves conformance with a one-line call to the same suite instead of by convention.
- Mutation testing (issue #89): Stryker (`npm run mutation`) scoped to `buildQueue.js`, `buildDeck.js`, `reinsertMissed.js`, and the four badge/personal-best evaluators. Raised mutation score across those files from ~90% to 99%+ by strengthening existing unit tests against every killable survivor (boundary conditions, tied-value cases, an inverted-condition case); the four remaining mutants are behaviorally equivalent and documented inline with `// Stryker disable next-line`.

## [0.28.2] - 2026-07-18

### Fixed

- Container hardening (issue #85, audit finding SEC-4): the Docker image's runtime stage now runs nginx as a non-root user via the official `nginxinc/nginx-unprivileged:1.27-alpine` image (listening on 8080, since unprivileged processes can't bind port 80) instead of stock `nginx:alpine` running as root; both base images (`node:24-alpine`, `nginxinc/nginx-unprivileged:1.27-alpine`) are now pinned to a major.minor version instead of a floating tag. `docker-compose.yml`'s port mapping adjusted to `8080:8080`. Guarded by a static Dockerfile test (pinned-tag + non-root-image assertions) and an upgraded live e2e check that boots the real pinned image and confirms the nginx process is non-root. Automated image vulnerability scanning (Trivy) remains backlogged pending a CI pipeline.

## [0.28.1] - 2026-07-17

### Fixed

- nginx security headers were silently dropped from every JS/CSS/font/image/audio response (issue #84, audit finding SEC-1): the two asset `location` blocks in `nginx.conf` declare their own `add_header Cache-Control`, which per nginx's documented inheritance rule cancels inheritance of the three server-level security headers — `nosniff` was missing exactly where MIME-sniffing protection matters most. The three headers now live in a shared `nginx/security-headers.conf`, `include`d in the `server` block and both asset `location` blocks (each also gained `always`, so the headers now survive error responses like a 404 too). Guarded against regression by a static config test (`nginx/__tests__/securityHeaders.test.js`, no Docker required) and a live e2e check (`e2e/nginx-headers.spec.js`) that boots the real config in `nginx:alpine` and asserts the headers on every asset tier plus a 404.

## [0.28.0] - 2026-07-17

### Changed

- Hints (issue #20): the correct-answer highlight now ramps in intensity with wrong taps instead of a flat highlight — subtle on the first hint-eligible attempt, reaching full strength on the last try before the question locks as missed (a fixed 3-attempt ramp when Retry attempts is Unlimited). `useGameSession` exposes this as `hintStrength`; `GameChoiceGrid` renders it via a `--hint-strength`-driven overlay instead of swapping the choice's background outright, which also means the highlight no longer needs an `!important` override to beat a game's inline swatch color.

## [0.27.0] - 2026-07-14

### Added

- **Fruit & Veggie ID** game (issue #68) — a fruit or vegetable's name is spoken aloud via the browser's Web Speech API (`useSpeech`) and the child taps the matching picture. Choices are picture-only (emoji, no text label) for pure listen→identify vocabulary practice; each tile carries an `aria-label` name for screen readers. When the browser has no speech synthesis, the prompt falls back to naming the target on screen and the replay button is hidden.
- `useSpeech` hook (`src/hooks/useSpeech.js`) — shared engine wrapper over `SpeechSynthesis` (speak/cancel/`supported`), mirroring `useSoundPlayer`'s lifecycle shape.

### Changed

- Extracted the question-audio lifecycle into a shared `useQuestionAudio` hook (`src/hooks/useQuestionAudio.js`) — auto-announce the active question, stop on leave/results/intro, and a manual replay callback — and moved Animal Sounds onto it (behaviour-preserving). The generic `.game__replay` button style now lives in the shared `QuizGameShell.css`, and the label-less `.game__choice-emoji` tile style in the shared `GameChoiceGrid.css`.

## [0.26.0] - 2026-07-13

### Added

- Quiz games now play shared audio feedback (issue #65): a bright chime on a correct answer and a soft low tone on a wrong tap or timeout, generated as tiny committed WAV assets (`scripts/generate-chimes.mjs`) and gated by the existing Sound Effects setting. `useGameSession` emits semantic `lastEvent`s (mirroring `useMemorySession`) that also drive a new persistent screen-reader live region announcing correct and wrong answers (AU-2, WCAG 4.1.3) — timeouts keep their existing visible role="status" row as the announcement path.
- `"orientation": "portrait"` manifest support (issue #65): the same engine gate as landscape with flipped condition, upright-rotation overlay copy/glyph, intro-slide notice, and a ↕️ dashboard badge — ready for a future vertical-first game.
- `QuizGameShell` engine component (issue #65): the shared quiz scaffold (intro/results wiring, question chrome, timer, timeout row, parent-tap Next, chime layer, live region) in one place. All three quiz games now pass their `useGameSession` session plus content slots to it — each game's `index.jsx` shrank to its actual content, and the next quiz game costs ~35 lines.

### Changed

- Quiz orientation pause (issue #65): if a quiz game sets a manifest `orientation`, `useGameSession` now suspends the per-question countdown (preserving remaining time), freezes the visible timer, ignores taps, and excludes overlay time from recorded per-question durations while the rotate overlay is up — matching the fairness guarantees memory games already had.
- Consolidated the `.game__*` CSS duplicated across the three quiz-game stylesheets into `QuizGameShell.css`/`GameChoiceGrid.css` (issue #65) — removing the drift pattern behind the v0.24.1 unstyled-results bug. Per-game stylesheets now hold only genuinely game-specific rules.

### Fixed

- `src/storage/adapter.js` JSDoc now documents the real ten-method adapter contract and the memory-session Score fields (`flipAttempts`, `mismatches`, `peakMatchStreak`, `durationMs`) (issue #65).

## [0.25.0] - 2026-07-12

### Added

- Games can require a horizontal layout via a new optional manifest field, `"orientation": "landscape"` (issue #62). The engine enforces it for the game's whole route: an accessible full-content rotate prompt ("Turn it sideways!") blocks play whenever the layout is portrait — physical device orientation on touch devices, viewport aspect ratio on desktop — while the shell's home button stays reachable. The game stays mounted (state survives rotation), the memory-session clock pauses so personal-best times stay fair, the intro slide announces the requirement, and dashboard cards show a ↔️ "Landscape only" badge. First adopter: Animal Memory Match (v1.2.0). New engine pieces: `useOrientation` hook, `OrientationGate`/`OrientationOverlay` components, `OrientationGateContext`.

## [0.24.5] - 2026-07-12

### Added

- `docs/DEPLOYMENT.md` — full deployment guide: local dev, production build, Docker walkthrough, annotated nginx configuration, HTTPS/reverse-proxy guidance, data persistence and backup, troubleshooting (issue #61).
- `SECURITY.md` — security posture and disclosure policy: threat model, localStorage data inventory, children's-privacy analysis of the opt-in GA integration, XSS mitigations, HTTP security headers with known gaps, Docker posture, dependency policy, vulnerability reporting (issue #61).
- Full security audit (`docs/superpowers/specs/2026-07-12-security-audit-findings.md`) — no HIGH findings; one MEDIUM nginx header-inheritance misconfiguration (SEC-1) and four hardening items, all added to `docs/ENHANCEMENTS.md` § Security; production `npm audit` clean; verified-safe observations recorded for future audits.
- Accessibility/i18n/UX audit (`docs/accessibility_usability.md`) — automated scans clean (119/119 e2e incl. per-route axe, 727/727 unit incl. jest-axe); six judgment-level findings added to `docs/ENHANCEMENTS.md` (color-only quiz feedback, missing correct/wrong screen-reader announcements, focus-dropping `disabled` quiz choices, raw ISO dates in score history, undersized dashboard filter tabs, silent audio-autoplay failure); one stale backlog entry (memory-board reduced-motion audit) verified already resolved and removed.

### Changed

- Full documentation review against the v0.24.4 codebase (issue #61). README corrected: all four games in the architecture tree, the real ten-method storage adapter, `tags`/`gameType` in the add-a-game guide, complete score shapes, all 12 npm scripts, and a documentation index. `docs/TESTING.md` corrected to six layers plus static linting and extended with memory-game test patterns and the current e2e spec inventory. `docs/ENHANCEMENTS.md` reorganized and expanded with UI/UX/accessibility/engine-migration/security/testing suggestions, including a named audit of quiz-game code duplicated across the three games. `CLAUDE.md` updated to match.

## [0.24.4] - 2026-07-12

### Changed

- Animal Memory Match cards are bigger and the board now uses the available screen space instead of leaving large empty margins (issue #58). The shared `MemoryBoard` grid's tile floor grew from 90px to 120px (matching the tap-target size used by every quiz game's answer cards), and its previous fixed 560px width cap was replaced with a tile-count-aware cap, so boards grow toward a comfortable ~140px card size on tablet/desktop instead of staying pinned at ~112px. The game's page also now uses the same padding every other game gets, so cards no longer sit flush against the screen edge on phones. Trade-off: phones in the ~360–414px range now show 2 columns instead of 3, favoring larger tap targets over column count.

## [0.24.3] - 2026-07-12

### Fixed

- The intro and results screens could render taller than one device screen (issue #55), pushing the Start/Play Again buttons below the fold on tablet, phone, and even modestly-sized desktop windows. `GameIntro`/`GameResults` still carried a `min-height: 100vh` left over from before the `AppShell` wrapper existed; nested inside the shell (which already reserves `min-height: 100vh` for its own header/content/footer), that stacked a redundant extra full-viewport height on top. Both now use `flex: 1` to fill the shell's actual available space, matching the pattern every game's own `.game` layout already used. Legitimately long content (e.g. a long missed-items list) still scrolls the page rather than being clipped.

## [0.24.2] - 2026-07-12

### Fixed

- Character Match game updates which resolves issue #54, incorrect file names within code. Updates game manifest version and core engine version for consistency.

## [0.24.1] - 2026-07-11

### Fixed

- Memory match sounds no longer outlast their moment (issue #52): matching a new pair cuts off the previous animal's clip, and any playing clip stops when the results screen appears or the game is left mid-session. Game audio now goes through a shared `useSoundPlayer` hook; Animal Sounds was refactored onto it with no behavior change.
- The memory game's results screen now shows the same themed layout as every other game (issue #53). The shared `.results` styles were duplicated in each quiz game's stylesheet and missing from the `GameResults` component's own CSS, so navigating straight to the memory game rendered its results screen unstyled. The styles now live in `GameResults.css` and load with the component everywhere; the GameResults visual-regression baselines were regenerated (they had captured the unstyled look).

## [0.24.0] - 2026-07-11

### Added

- Fastest-board personal best for memory games (issue #51, final item): the quickest completion time is tracked per board size alongside the fewest-flips record and announced with a "⏱️ New record!" banner on the results screen. Additive `fastestMs` storage key — no migration.

## [0.23.0] - 2026-07-10

### Added

- **Animal Memory Match** (issue #37) — new game and new *memory* game type: 10 face-down tiles (5 animal pairs, parent-configurable 3–6 via the new "Pairs Per Board" setting); flip two at a time, confetti + the animal's sound on a match, red highlight + flip-back on a mismatch, full fireworks on completing the board. Fully keyboard-playable with screen-reader announcements.
- Engine additions reusable by future matching games: `useMemorySession` hook, `MemoryBoard` component, `buildDeck` util, `fireFireworks()` in the confetti lib, and a shared sound library (`src/assets/sounds`).
- Per-game badge catalogs, auto-discovered from `src/games/<id>/badges.js` (full replacement of the global quiz catalog for that game). Memory match ships six badges: Sharp Mind, Match Streak, Big Board, and Pair Spotter/Pro/Champion lifetime tiers.
- New settings: `memoryPairs` (3–6, default 5) and `soundEffectsEnabled` (default on).
- Fewest-flips personal best for memory games, tracked separately per board size, announced with a "🃏 New record!" banner on the results screen.
- Memory-appropriate stat tiles on the My Progress page (via a new `gameType: "memory"` manifest field): Fewest Flips and lifetime Pairs Matched replace Best Score / Total Played, and Best Streak now reflects the real peak match streak.

### Changed

- Matched memory tiles use `aria-disabled` instead of `disabled`, so keyboard focus is no longer dropped mid-game when a pair is found.
- Admin Settings tab reorganized into headed groups — General, Quiz Games, Memory Games — instead of one flat list.
- Animal-sounds mp3 files moved to the shared `src/assets/sounds/` (no behavior change).

## [0.22.2] - 2026-07-09

### Fixed

- The active category filter tab on the home dashboard became unreadable (white text on a near-white background) whenever it was hovered on desktop or tapped on mobile (where a tap leaves a tab in a sticky hovered state) — `.dashboard__tab:hover`'s higher CSS specificity was silently overriding the active tab's solid background while leaving its white text untouched. Added the same `--active:hover` cascade fix already used in the Admin and Parent Dashboard tab bars. Also added the equivalent hover-contrast regression test to those two, which had the fix but no test guarding it.

## [0.22.1] - 2026-07-09

### Fixed

- The "Today's Game" featured banner disappeared whenever a category tab other than "All" was selected, instead of staying visible while browsing a filtered category. The banner now always renders regardless of the active tab, and the featured game is no longer excluded from its own category section/grid underneath it.

## [0.22.0] - 2026-07-09

### Fixed

- Games whose item pool is smaller than the selected "Questions per session" setting (e.g. Animal Sounds' 12 items, Color Match's 11) previously truncated the session to the pool size instead of honoring the configured count. `buildQueue` now cycles through evenly-shuffled full passes of the pool to fill the session exactly, with no item repeated on two consecutive questions.

## [0.21.0] - 2026-07-08

### Added

- Parent Dashboard: interactive date-range filter (7/30/90-day presets plus a custom from–to range) applying to every section — Score Trend, Response Time, Streak History, Play Calendar, and Missed Items — as well as CSV export. The selection persists across visits.
- Parent Dashboard: the Play Calendar heatmap now shows month labels above the week columns and resizes to span exactly the selected date range instead of always showing a fixed trailing 13 weeks.

### Fixed

- Streak History's "Last 7 days"/"Last 30 days" columns now re-anchor to the end of the selected date range instead of always being relative to the current moment, so a past custom range shows meaningful streak data instead of zeros.

## [0.20.0] - 2026-07-08

### Added

- Footer now shows a copyright line (`© {year} The Playground`) and, on game routes, the current game's own version alongside the engine version — previously the game version wasn't displayed anywhere after the per-game mini headers were removed.
- `src/hooks/useFocusOnMount.js` — a shared hook for the route/mount-entry focus pattern (`ref` + `tabIndex={-1}` + focus-on-change `useEffect`) that had been independently duplicated in `AppShell`, `Dashboard`, `GameResults`, and `ExitConfirmDialog`.

### Fixed

- The kid-safe exit guard didn't cover the browser/OS back button (or a swipe-back gesture) — only brand-link/home-button clicks were intercepted, so a `popstate` navigation left mid-game without ever showing the confirm dialog. Added a standard SPA "history sentinel" trap: a guarded session pushes an extra history entry, and any back-press while still guarded re-arms the trap and shows the same confirm dialog, rather than actually navigating away.
- The exit-confirm dialog trapped Tab-key focus between its two buttons, but never marked the header/game content behind it as unreachable — a screen reader's swipe/virtual-cursor navigation (which walks DOM order, not Tab order) could still reach and activate the shell's home button or brand link right through the backdrop. The shell now marks everything behind the dialog `inert` (plus `aria-hidden` as a fallback for engines with incomplete `inert` support) while it's open.
- `AppShell`'s title-row visibility check mixed two differently-shaped lookups (a manifest search for games, a hardcoded pathname map for pages); resolved to one `title` value up front instead.
- Documented the 480px brand-label breakpoint's actual justification (row 1's own fixed-content width, not the title row, which no longer shares space with it) instead of leaving it as an unexplained number.
- A stale comment and loose assertion in `App.test.jsx` left over from the (now-finished) transitional period when duplicate footers were expected.

## [0.19.0] - 2026-07-08

### Fixed

- `AppShell`'s header: `.shell__nav` was missing `display: flex`, so the three nav icons (each individually a `display: flex` block box) stacked vertically instead of sitting in a row — visible at any viewport width, not just narrow ones. Also fixed the brand wordmark wrapping onto two lines under a squeezed page title by collapsing it to icon-only below 480px and giving the page title (not the fixed nav/back/brand icons) all the flexible space, so long titles truncate gracefully on one line instead of forcing everything to wrap.
- The header now consistently splits into two rows wherever there's a page title: row 1 is always app-level chrome (brand, back link, nav icons or the in-game home button); row 2 (separated by a hairline border) is the route's own content — the page title on `/admin`/`/parent`/`/my-progress`, or the game title plus streak badge on `/game/:id` — which now gets the full header width instead of splitting it with row 1's icons. This also fixes the streak badge wrapping its own text ("2" / "in a row!") on narrow phones, since it no longer shares a row with anything else that was squeezing it.

## [0.18.0] - 2026-07-08

### Added

- `AppShell`, a React Router layout route providing one persistent header/footer shared by every page (home, settings, parent dashboard, my-progress, games), replacing per-page chrome (nav links, back links, page titles, footers, per-game mini headers).
- Kid-safe exit guard: leaving a game mid-session (home button or brand link) opens an `ExitConfirmDialog` requiring a deliberate second tap, so a stray toddler tap can't kill a session. Fail-open — a game that never reports status can always be exited immediately. Full jest-axe coverage, plus `e2e/app-shell.spec.js`.
- `ShellContext` / `useShellGameStatus({ streak, sessionActive })` — the interface games use to publish live status to the shell.
- Shared `GameLayout.css` for the game content region, replacing each game's own header/layout CSS.
- Color Match, Animal Sounds, Character Match (1.5.0/1.5.0/1.3.0 → 1.6.0/1.6.0/1.4.0): dropped their own mini headers (name, streak badge, version) in favor of reporting status to the shared shell via `useShellGameStatus`.

## [0.17.0] - 2026-07-06

### Added

- `e2e/css-validity.spec.js` — validates dynamic inline `style={{...}}` values (per-item colors in Color Match/Animal Sounds, tag accents on GameCard) against Stylelint's CSS3 conformance rules. This is the one CSS surface `npm run lint:css` can't reach, since it only scans `.css` files, not JS-generated style objects. Runs under `npm run e2e` or standalone via `npm run validate:css`.
- Documented explicitly (README, `docs/TESTING.md`) that Stylelint's existing `stylelint-config-standard`/`-recommended` rules already provide real CSS3 conformance checking — unknown properties/values/at-rules/selectors, the same class of check a W3C CSS validator performs — not just style preferences.

## [0.16.0] - 2026-07-06

### Added

- Pluralized `common.difficultyOfferHeading` via i18next's `_one`/`_other` CLDR suffix pair, so "Try 1 choice next time?" reads correctly instead of "1 choices" once a count of 1 is ever possible (today `numChoices` is always 2-4, so this was previously invisible in English).

### Fixed

- `ParentDashboard.css`'s two remaining physical-direction CSS properties (`text-align: left`/`right`) now use logical `start`/`end`, so the streak table and missed-items panel will correctly mirror once an RTL locale is added. A repo-wide grep confirmed these were the only two physical-direction declarations left in the app.

## [0.15.0] - 2026-07-06

### Added

- `eslint-plugin-jsx-a11y`, wired into `eslint.config.js` — a11y issues are now caught at edit time in code paths no test currently exercises, not only at test time via `jest-axe`/`@axe-core/playwright`. Lint came back clean, 0 new findings.
- Stylelint (`stylelint-config-standard`) + `.editorconfig`, via `npm run lint:css`.
- `e2e/html-validity.spec.js` — an offline HTML5 validator (`html-validate`) checking the rendered DOM (not the near-empty `index.html` shell) on every major route, running automatically under `npm run e2e`. The live W3C Nu Checker wasn't reachable from the audit's sandbox; this doesn't depend on network access.

### Fixed

- `vite.config.js`'s coverage now scopes to `src/**`, so the "All files" rollup reports a real aggregate (88.78%) instead of `0 | 0 | 0 | 0`.
- `eslint.config.js` no longer lints the generated `coverage/` folder.
- Six real `no-descending-specificity` CSS cases found by Stylelint (badge-lock icon dimming, and all three games' `.game__choice` disabled/focus/focus-visible states) — reordered so specificity reads ascending top-to-bottom; no visual change, since the higher-specificity rule already won regardless of position.
- `.sr-only`'s deprecated `clip: rect(...)` — added `clip-path: inset(50%)` as the modern rule, kept `clip` as an explicit, commented legacy fallback.
- `Timer.jsx`'s `aria-label` had no supporting ARIA role, found by the new HTML5 validator — added `role="timer"` (doesn't change its deliberate no-`aria-live` behavior).

## [0.14.0] - 2026-07-06

### Added

- ARIA Tabs pattern completed on Dashboard's category tabs and Admin's page tabs: each tab now has `aria-controls` linking to a matching `role="tabpanel"`/`aria-labelledby` content region, so screen readers announce what a tab governs, not just that it's selected.
- A confirmation step before Admin's "Reset to Defaults" takes effect — first tap prompts "Are you sure?", a second tap within 4 seconds confirms; letting the window elapse cancels.

### Fixed

- `Dashboard.css`'s hardcoded `color: #fff` now routes through `var(--color-surface)`.
- Found and fixed two real bugs while investigating the `!important` overrides on `.correct`/`.wrong`/`.highlight-correct`: `.wrong` was missing the same `!important` its siblings had, so wrong-answer feedback silently showed no red at all for Color Match/Animal Sounds under `prefers-reduced-motion: reduce`; and the `shake-red` keyframe's `background: inherit` at rest resolved to the *parent's* background rather than the button's own, leaving every wrong-answer choice fully transparent after its shake animation, in all three games. Verified via a real browser (Playwright), not assumed, with a new e2e regression test.
- Cleaned up React `act()` warnings in `ParentDashboard`, `KidsProgressPage`, `ColorMatchGame`, and `CharacterMatchGame` tests — the underlying async state updates (best-streak fetch, intro-dismissal transition) were real, just not fully awaited by the tests.
- Verified (no code change needed): every interactive control already meets WCAG 2.2 SC 2.5.8's 24×24px minimum target size, and the app has no modal/dialog pattern to trap keyboard focus.

## [0.13.0] - 2026-07-06

### Added

- `docs/superpowers/specs/2026-07-05-standards-audit-findings.md` — a combined audit of W3C HTML5/CSS3 validity, WCAG 2.2 AA accessibility, internationalization, usability, and code-quality tooling, plus a companion prioritized remediation plan (`docs/superpowers/plans/2026-07-05-standards-audit-remediation.md`).
- `src/__tests__/disabledWrongChoiceContrast.test.js` — a regression test that recomputes WCAG 1.4.3 contrast for every choice color/text pairing across all three games after the `.game__choice--disabled-wrong` CSS filter is applied, so a future palette change can't silently drop back below AA.

### Fixed

- Corrected the 0.12.0 disabled-wrong-choice contrast fix: `grayscale(85%) brightness(0.88)` looked fine on its own but actually failed WCAG 1.4.3 (< 4.5:1) for two Color Match swatches (red, blue) once their black/white choice text was filtered along with the background. Retuned to `grayscale(40%) brightness(1.2)`, verified >= 4.5:1 across every choice color used by any of the three games.

## [0.12.0] - 2026-07-05

### Added

- Per-game i18n locale files (`src/games/<id>/i18n/en.json`), auto-merged at startup — adding a game's translations no longer requires editing a shared file.
- `settings.locale` and a hidden-until-needed `LocaleSelector` in Admin Settings, so a second language can be added later without further plumbing.
- Dynamic `<html lang>` sync to the active i18next language.

### Fixed

- Added `:focus-visible` styling (matching the existing nav/card/tab pattern) to game answer choices, results buttons, the intro start button, the sound-replay button, and all Admin action/toggle buttons — previously only nav chrome had visible keyboard focus.
- Game phase transitions (intro → play → results) and top-level page loads now move focus to the new view's heading, so keyboard and screen-reader users are told when a new view appears.
- Correct/wrong answer feedback now respects `prefers-reduced-motion`.
- The disabled "already tried, wrong" choice state no longer risks dropping below AA text contrast (replaced an opacity-based fade with a fixed filter).
- `StreakBadge` announces streak changes via `aria-live="polite"`.
- Parent Dashboard's missed-items panel, streak table, and chart legends show each game's real name instead of its raw id; both trend charts gained a visually-hidden data-table alternative for screen readers.
- Admin's "No games found" message and Dashboard's category tag labels now go through `t()` instead of being hardcoded.

## [0.10.0] - 2026-07-04

### Added

- **Character Match** — a new game where a character's name is shown and the child picks the matching character from picture buttons; uses real images (PNG/GIF/JPEG) instead of emoji for each choice.
- `ManifestIcon` shared component — lets a game's dashboard tile/intro icon be an image instead of an emoji, without changing rendering for existing emoji-icon games.

## [0.9.0] - 2026-07-04

### Added

- **Kids' "My Progress" page** (`/my-progress`) — a kid-facing page, linked via a new 🌟 dashboard button, showing per-game best accuracy %, best streak, lifetime questions answered, and every milestone badge earned so far. Locked badges show a dimmed/grayscale icon with no text label (unlike the admin Badge Gallery's "Locked" text), since the target audience can't read; locked/earned state is still exposed to assistive tech via each badge's `aria-label`.
- `computeBestAccuracy` pure utility function (`src/utils/kidStats.js`).
- `KidsProgressPage` component (`src/kids/`).

## [0.8.0] - 2026-07-03

### Added

- **Answer within N seconds** — an admin-configurable countdown mode replaces the passive stopwatch; when a question's timer runs out, it locks in as missed (breaking the streak, added to the results-screen missed list) and always auto-advances after showing "Time's up!", regardless of feedback mode.
- **Per-session personal best** — a session's accuracy and average correct-answer speed are compared against that game's stored bests. Breaking either shows a banner on the results screen ("New accuracy record!" / "New speed record!"); a speed record only counts if the session's accuracy meets a configurable minimum (default 70%, adjustable in 5% increments up to 100%).
- **Milestone badges** — 8 repeatable, per-game achievements across three categories (streak tiers, perfect sessions, lifetime questions answered), each with an emoji icon shown on the results screen when newly earned and browsable in a new AdminPage "Badges" tab.
- `timerMode` (`'off' | 'countUp' | 'countdown'`), `timeLimitSeconds`, `speedRecordMinAccuracy` settings.
- `getPersonalBests`/`savePersonalBests` and `getBadgeData`/`saveBadgeData` storage adapter methods.
- `usePersonalBest`, `useBadges` hooks; `evaluatePersonalBest`, `computeBadgeAwards` pure utility functions; `BADGE_CATALOG` in `src/lib/badges.js`.
- `BadgeGallery` component.
- `timedOut` field on timing entries recorded when a countdown expires.

### Changed

- `timerDisplayEnabled` (boolean) is replaced by `timerMode`/`timeLimitSeconds`; existing stored settings are migrated automatically on load.
- `useGameSession` no longer accepts external `timeLimitMs`/`onTimeout` parameters — countdown behavior is now derived entirely from settings.
- `Timer` gains a `mode`/`limitMs` prop pair to support counting down.
- `GameResults` gains `personalBestResult`/`newBadges` props.

## [0.7.0] - 2026-07-02

### Added

- **How-to-play intro screens** — each game now shows an intro screen (icon, name, one-line instructions) before its first question on initial visit. A "Don't show this again" checkbox lets a parent permanently dismiss it per game; the admin Games tab gains a "Replay Intro" button to bring a dismissed intro back. The intro does not reappear after "Play Again" within the same visit.
- `introDismissed` setting: `{ [gameId]: true }`, default `{}`.
- `GameIntro` shared component.
- `useGameSession` gains `showIntro`, `settingsLoaded`, `dontShowAgain`, `setDontShowAgain`, `dismissIntro`.

## [0.6.0] - 2026-07-01

### Added

- **Timer display** — a running stopwatch shown next to each question, togglable in admin settings.
- **Retry attempts** — a configurable number of wrong taps (None / 1-5 / Unlimited) allowed before a question locks in as missed; wrong choices become disabled but stay visible so the child can try again.
- **Hints** — after a configurable number of wrong taps, the correct answer is highlighted without locking the question.
- **Retry counts toward streak** — configurable whether a correct-after-retry keeps the answer streak alive.
- **Spaced repetition queue** — missed items reappear a few questions later in the same session, replacing a not-yet-asked item so session length stays fixed.
- **Difficulty auto-progression** — after a perfect session (with the setting enabled), the results screen offers to raise the number of answer choices by 1.
- 7 new settings: `timerDisplayEnabled`, `maxTries`, `hintsEnabled`, `hintAfterWrongTaps`, `retryCountsAsStreak`, `spacedRepetitionEnabled`, `difficultyAutoProgressionEnabled`.
- `Timer`, `GameChoiceGrid` shared components.
- `attemptNumber` field on each timing entry.

### Changed

- `useGameSession`'s `answered` field is renamed to `locked`, and gains `disabledChoiceIds`/`hintActive`. Both games updated to match.

## [0.5.0] - 2026-06-30

### Added

- **Daily Challenge** — one game highlighted as "Today's Game" each day via a hero banner above the game grid. Selection is deterministic (date-seeded hash) so all users see the same featured game.
- **Recently Played badges** — game cards show a glow border and "Today · N plays" / "Yesterday · N plays" / "N days ago · N plays" badge when the game has been played before. Derived from existing score data with no schema changes.
- **Game Categories / Tags** — games are grouped under labeled section headings on the dashboard ("Sounds 🔊", "Visual 👁️", etc.). A filter tab strip lets parents view only one category at a time. Tags come from each game's `manifest.json` (now a required field) and can be overridden per-game in the admin panel.
- `useFeaturedGame`, `useRecentlyPlayed`, `useGameTags` hooks
- `FeaturedGameCard`, `CategorySection` components
- Tag override editor in AdminPage

## [0.4.0] - 2026-06-28

### Added

- **Parent Progress Dashboard** at `/parent` — accessible via the 📊 button on the main dashboard.
  - Score trend chart (accuracy % per game over time, powered by Recharts).
  - Response-time chart (average ms per answer per game over time).
  - Streak history table (last 7 days / last 30 days / all-time best per game).
  - Play calendar heatmap (13-week GitHub-style grid showing daily question counts).
  - Missed-items breakdown (horizontal bar chart of most-missed animals/colors per game).
  - Export to CSV button (downloads full score history for spreadsheets or clinician sharing).

- `peakStreak` field saved with each score record — highest consecutive-correct run in that session.
- `itemId` field added to each timing entry — required for the missed-items breakdown; older records are unaffected.

### Changed

- Dashboard header now shows two icon links (📊 Progress, ⚙️ Settings) in a `dashboard__nav` group.
- `recharts` added as a runtime dependency.

## [0.3.0] - 2026-06-24

### Added

- Celebration animation (confetti) on correct answers, with an `animationsEnabled` setting to disable it.
- Streak tracking: current streak shown in the game header (Animal Sounds, Color Match), all-time best streak persisted per game.
- Richer end-of-game session summary listing any missed items, or a "perfect run" message when none were missed.
- Per-question timing: each answer's response time (`durationMs`) is recorded and saved with the score for future analytics and personal-best displays.

### Changed

- Extracted the shared game-loop logic (queue building, answer/score state, results screen) out of `AnimalSoundsGame` and `ColorMatchGame` into a shared `useGameSession` hook and `GameResults` component.

## [0.2.0] - 2026-06-24

### Added

- Technical test harness: Vitest + React Testing Library unit tests, jest-axe accessibility assertions, Playwright E2E and visual regression tests, and Storybook component stories.

## [0.1.0] - 2026-06-07

### Added

- Initial platform: auto-discovery plugin system for games (`src/games/<id>/` folders), Ocean & Dream design theme, Animal Sounds and Color Match games, admin settings page, swappable localStorage storage adapter, score history, and i18n scaffolding.
