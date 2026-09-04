# Performance Audit — The Playground

**Date:** 2026-09-04
**Version audited:** 1.1.10
**Scope:** Bundle/code-splitting, asset weight, PWA/service-worker caching, React runtime behavior, Lighthouse/CI rigor, fonts, third-party scripts, storage-layer perf.
**Method:** Static analysis of `vite.config.js`, `src/App.jsx`, hooks, storage adapter, and asset directories, plus one observational `npm run build` (succeeded in ~35s; used to get real `dist/` output and the Workbox precache manifest size) and `.github/workflows/ci.yml`. No source files were modified.

---

## Executive Summary

The app's core code-splitting is **already done correctly** — this is the most important finding, because the audit brief specifically flagged it as a likely real issue and it turned out not to be one. `src/App.jsx` uses `eager: true` only on the tiny `manifest.json` glob; the actual game-code glob (`./games/*/index.jsx`) has no `eager` option, so `import.meta.glob` returns lazy dynamic-import functions, which are then wrapped in `lazy()`. A production build confirms this: each game compiles to its own small chunk (roughly 1–9 KB gzipped each), and heavy routes (`ParentDashboard`, which pulls in `recharts`) are excluded from the initial bundle via explicit `lazy()` imports with a code comment citing a prior Lighthouse CI regression (LCP 5.7s / 0.16 score) that this same lazy-loading fix already resolved. The main entry chunk is 321.73 KB (102.42 KB gzip).

The real, currently-live performance risks are elsewhere:

1. **Service worker precache is ~9.0 MB** (122 entries, 9236.88 KiB per the build's own Workbox summary), downloaded shortly after first visit regardless of which games are ever played, because `vite.config.js` explicitly widens `globPatterns` to include all `mp3`/`wav`/`png`/`webp` game assets for offline support. Three animal-sound clips alone (`frog.mp3` 1.91 MB, `horse.mp3` 1.86 MB, `lion.mp3` 1.53 MB — all in `src/assets/sounds/`) account for ~58% of that. On a low-end tablet over cellular or slow Wi-Fi, this is a large, avoidable first-visit cost with no user benefit unless they play Animal Sounds / Sound Memory Match.
2. **One massively unoptimized image**: `src/games/character-match/icon.png` is a 1107×1619px, 455.34 KB PNG rendered at 52×52 CSS px (`GameCard.css:28`) — its sibling game (`character-match-bluey`) ships the equivalent icon as a 90 KB WebP. This single file is ~46% of the entire `src/games` asset tree's weight and is precached into the service worker on every install.
3. **`useScores.addScore` does 3 full read/write passes over the entire score-history array** (which has no cap or rotation) on every single game completion, inside the `finishGame()` awaited chain that gates the results screen from appearing.
4. Quiz gameplay ticks a `setInterval` at 100ms that updates state consumed by the top of `QuizGameShell`, and no component in the render tree (`GameChoiceGrid`, `MemoryBoard`, tiles) uses `React.memo` — so every tick re-renders the full question/choices tree, not just the timer. Low-to-moderate impact given small choice counts, but easy to fix and relevant to INP/battery on low-end devices during every timed session.

Everything else checked — Lighthouse CI wiring, font loading, Google Analytics loading, PWA update strategy, `useMemorySession`/`useGameSession` memoization discipline, and list rendering in results/badges/parent-dashboard screens — is solid to strong, detailed below.

---

## 1. Bundle & Code-Splitting Findings

**Finding 1.1 — Eager glob is confined to manifests; game code is properly lazy. (Resolved / Not an issue — confirmed)**
- Evidence: `src/App.jsx:12-13`
  ```js
  const manifestModules = import.meta.glob('./games/*/manifest.json', { eager: true })
  const gameModules     = import.meta.glob('./games/*/index.jsx')
  ```
  and `src/App.jsx:31-38`, where every entry in `gameModules` is wrapped in `lazy(loader)` before being placed in `gameComponents`, and `GameRoute` (`src/App.jsx:101-116`) renders the selected game inside `<Suspense>`.
- Impact: None — this is the correct pattern. `eager: true` on the manifest glob only eagerly bundles small JSON metadata (id, name key, tags, color, orientation), not game implementation code. Each `manifest.json` across the 9 games is trivial (well under 1 KB each); eagerly bundling ~9 of these has no measurable bundle-size or LCP effect.
- Build confirmation: `npm run build` output shows 9 separate small per-game entry chunks (e.g. `QuizGameShell-*.js` 8.97 KB / 3.54 KB gzip, `MemoryBoard-*.js` 6.44 KB / 2.69 KB gzip, various `index-*.js` chunks in the 1–5 KB range) rather than one monolithic bundle containing every game's logic.
- Also lazy, with the same pattern: `AdminPage`, `ParentDashboard`, `KidsProgressPage` (`src/App.jsx:23-25`), each wrapped in `<Suspense>` at their route (`src/App.jsx:127-129`). `ParentDashboard-*.js` is 392.86 KB / 115.15 KB gzip (dominated by `recharts`) but is excluded from the dashboard's critical path — confirmed by the inline comment at `src/App.jsx:15-22` citing a prior Lighthouse CI regression this same lazy-boundary fixed (LCP element was the dashboard `<h1>`, 0.16/1 score at 5.7s before the fix).
- Recommendation: None needed for this specific concern. Optionally verify periodically (e.g. via a bundle-size CI check) that no future PR accidentally imports a game module statically from `App.jsx`, which would silently undo this.

**Finding 1.2 — Main entry chunk (321.73 KB / 102.42 KB gzip) has no further split**
- Evidence: build output, `dist/assets/index-DAYoh9rc.js` — 321.73 kB / gzip 102.42 kB. This is the chunk loaded for every route, including the dashboard.
- Impact: Moderate. 102 KB gzip of JS parsed/executed before the dashboard is interactive is not extreme, but on a low-end Android tablet's CPU, JS parse/compile cost (not just download) matters more than the gzip number suggests. This chunk likely bundles react-router-dom, i18next/react-i18next, the Dashboard, all 9 manifests, icon resolution, and shared components (GameCard, AppShell, etc.).
- Recommendation: Not urgent, but worth a `rollup-plugin-visualizer` (or `vite build --mode analyze`) pass to confirm what's actually in it — react-i18next + i18next together are non-trivial, and if translation resources for all locales are eagerly bundled here (see i18n glob pattern), splitting non-default locales out would shrink this further. Low priority relative to items 2–4 below.

---

## 2. Asset Weight

**Finding 2.1 — Three animal-sound MP3s are 10–100x larger than their siblings (High impact)**
- Evidence (from `src/assets/sounds/`, confirmed again in `dist/assets/` post-build):

  | File | Size |
  |---|---|
  | `frog.mp3` | 1,914,253 B (1.91 MB) |
  | `horse.mp3` | 1,862,137 B (1.86 MB) |
  | `lion.mp3` | 1,527,769 B (1.53 MB) |
  | `elephant.mp3` | 140,800 B |
  | `owl.mp3` | 114,520 B |
  | `cow.mp3` | 74,396 B |
  | `rooster.mp3` | 66,925 B |
  | `cat.mp3` | 65,280 B |
  | `duck.mp3` | 43,776 B |
  | `dog.mp3` | 33,024 B |
  | `pig.mp3` | 25,077 B |
  | `sheep.mp3` | 20,898 B |

  These are short one-shot animal-sound clips for a toddler game (`src/games/animal-sounds/data/animals.js`, `src/games/animal-memory-match/data/animals.js`) — there is no legitimate content reason for frog/horse/lion to be ~20-90x the size of dog/pig/sheep. This is almost certainly an encoding artifact (e.g. exported at a much higher bitrate/sample rate, or with excess silence/padding) rather than intentionally longer audio.
- Impact: High for offline-precache weight (see §3) and for anyone playing Animal Sounds / Sound Memory Match over a metered/slow connection — these 3 files alone are 5.3 MB of the app's ~9.6 MB `dist/`.
- Recommendation: Re-encode these three at a bitrate consistent with the other clips in the set (the ~64-96kbps range implied by cat/cow/rooster) and trim any silence. This alone would likely cut total audio payload by ~5 MB with no perceptible quality loss for short sound-effect playback through a tablet speaker.

**Finding 2.2 — `character-match/icon.png` is an oversized, wrong-format image (High impact, easy fix)**
- Evidence: `src/games/character-match/icon.png` — PNG, 1107×1619px, 455,337 B (455.34 KB); confirmed unchanged in the production build as `dist/assets/icon-NSPYR1RX.png` (455.34 kB), the single largest non-audio asset in `dist/`. Consumed via `src/lib/gameIcons.js:26-30` (`import.meta.glob('../games/*/icon.{png,gif,jpg,jpeg,webp,svg}', { eager: true, query: '?url' })`) and rendered at **52×52 CSS px** (`src/components/GameCard.css:28`, `img.game-card__icon { width: 52px; height: 52px; object-fit: contain; }`).
- Contrast: the sibling game `character-match-bluey/icon.webp` is 90,122 B and uses the WebP format the rest of the codebase already standardizes on (all 54 in-game images across both `character-match*` directories are `.webp` except this one `.png`).
- Impact: This single file is ~13% of `src/games`' total 3.5 MB and ~5% of the entire 9.6 MB `dist/` build, to render a 52×52px icon. It's also part of the service-worker precache set.
- Recommendation: Re-export as WebP at a reasonable source resolution (e.g. 256×256, generously oversized for retina 52px display) the same way every sibling asset already is. Expect this to drop from 455 KB to roughly 5-15 KB, i.e. a >95% reduction on this one file.

**Finding 2.3 — Remaining `character-match`/`character-match-bluey` character portraits are reasonably sized**
- Evidence: full listing of `src/games/character-match*/images/*.webp` ranges from ~13 KB to 102 KB (`bg_deema.webp`, the largest, at 102,466 B), already WebP, already varied/appropriately sized per character. No action needed here — noted as a positive alongside Finding 2.2 to show the codebase's asset convention is otherwise sound.

**Finding 2.4 — `public/` and PWA icons are appropriately small**
- Evidence: `public/pwa-512.png` (4,480 B), `public/pwa-192.png` (939 B), `public/favicon.png` (211 B), `public/apple-touch-icon.png` (836 B). No issues.

---

## 3. PWA / Service-Worker Caching

**Finding 3.1 — Precache set is ~9.0 MB, all downloaded on first install regardless of which games are played (High impact)**
- Evidence: `vite.config.js:9-21`:
  ```js
  VitePWA({
    registerType: 'autoUpdate',
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,mp3,wav}'],
      skipWaiting: true,
      clientsClaim: true,
    },
    ...
  })
  ```
  A real production build's own summary confirms the resulting cost: `PWA v1.3.0 / mode generateSW / precache 122 entries (9236.88 KiB)`. The in-code comment (`vite.config.js:11-13`) explains the intent clearly ("every game's sound clips... and images... are precached too so a game already visited once keeps working fully offline, not just the app shell") — but the `globPatterns` list is *not* scoped to "already visited"; Workbox's `generateSW` precache installs the full manifest on service-worker install, i.e. essentially on first page load for every user, not lazily per-game.
- Impact: High for initial-visit data cost on the target audience (families, possibly on older/budget tablets, possibly on cellular or shared home Wi-Fi). Combined with Findings 2.1/2.2, roughly 5.8 MB of that ~9 MB (frog/horse/lion mp3 + character-match icon.png) is arguably avoidable waste rather than legitimate offline-support cost. This doesn't block first paint (precaching happens via the SW's `install` event, off the main render path, after `registerSW` runs — see `registerType: 'autoUpdate'`), so it's not a direct LCP/INP hit, but it is a real bandwidth/battery/storage cost on a family's metered or slow connection, and a real "why is this app downloading 9 MB" surprise.
- Recommendation:
  - Fix Findings 2.1 and 2.2 first — that alone cuts precache from ~9.0 MB to ~3.2 MB with no behavior change.
  - Consider narrowing `globPatterns` for audio specifically (e.g. exclude `mp3`/`wav` from the default precache and instead add a Workbox `runtimeCaching` rule with a `CacheFirst` strategy scoped to `src/assets/sounds/**`) so a game's sound files are cached the first time that specific game is *played*, not on the initial app-shell install. This directly delivers on the stated intent ("a game already visited once keeps working offline") more precisely than blanket precaching, at the cost of the first play of each game needing network access once.

**Finding 3.2 — Update/versioning strategy is sound (no stale-content risk)**
- Evidence: `registerType: 'autoUpdate'` + `skipWaiting: true` + `clientsClaim: true` (`vite.config.js:10,19-20`), with a clear comment explaining the pairing: a new service worker activates and takes control of already-open tabs immediately, with no reload required. Workbox's `generateSW` output uses content-hashed filenames for all `dist/assets/*` (confirmed in the build output, e.g. `index-DAYoh9rc.js`), so cache invalidation on deploy is correct and automatic — the opposite of the "stale content after deploy" risk the audit asked about. This is one of the stronger parts of the setup.
- No action needed.

**Finding 3.3 — No runtime caching rules; only static precache**
- Evidence: `vite.config.js` workbox config has no `runtimeCaching` array — the app has no external API calls to cache at runtime (all state is `localStorage`-backed per CLAUDE.md), so this is appropriate as-is, not a gap.

**Finding 3.4 — No explicit `maximumFileSizeToCacheInBytes` override**
- Evidence: not set in `vite.config.js`; Workbox's default cap is 2 MiB per file. `frog.mp3` (1.91 MB), `horse.mp3` (1.86 MB), and `lion.mp3` (1.53 MB) all currently fit under that default cap, so nothing is silently excluded from precache today — but the margin is thin for `frog.mp3` (1.91 MB vs. a 2 MiB/2.097 MB cap). Worth noting as a latent risk: a future slightly-larger audio file could silently fail to precache (Workbox drops over-cap files without failing the build) with no visible error unless someone checks the build's precache-entry count.
- Recommendation: Fix Finding 2.1 (this removes the near-miss entirely) and optionally add an explicit `maximumFileSizeToCacheInBytes` so any future oversized asset fails the build loudly instead of silently falling out of the offline cache.

---

## 4. Runtime / React Findings

**Finding 4.1 — 100ms timer tick re-renders the entire question/choice tree; no `React.memo` anywhere in the game render path (Low–Moderate impact)**
- Evidence: `src/hooks/useGameSession.js:284-315` — `currentElapsedMs` is updated via `setInterval(..., 100)` "tracked unconditionally (not gated on timerMode)... so the Timer component's currentElapsedMs prop ticks smoothly," per the hook's own comment (`useGameSession.js:277-283`). This state is destructured and consumed at the top of `QuizGameShell` (`src/components/QuizGameShell.jsx:28`) and the whole component re-renders on every tick, including its child `<GameChoiceGrid>` (`QuizGameShell.jsx:110-121`), which itself has no memoization (`src/components/GameChoiceGrid.jsx` — plain function component, `choices.map(...)` rebuilding button elements and inline `onClick={() => ...}` closures every render, `GameChoiceGrid.jsx:38`). `src/components/MemoryBoard.jsx` is likewise unmemoized. A grep across `src/components` and `src/games` for `React.memo`/`memo(` returned zero matches.
- Impact: Low-to-moderate in absolute terms — choice counts are small (`numChoices` typically 2–4 per CLAUDE.md's settings reference) and the DOM tree per question is simple, so this is unlikely to visibly jank on most devices. But it means every timed quiz question triggers ~10 full-subtree re-renders per second for the entire duration the timer is visible, which is unnecessary CPU/battery work on exactly the low-end tablets this audit is concerned about, and it compounds with any future increase in choice grid complexity (larger `numChoices`, richer `renderChoiceContent`).
- Recommendation: Either (a) wrap `GameChoiceGrid` (and `MemoryBoard`) in `React.memo` so a `currentElapsedMs` change alone doesn't re-render them (their props — `choices`, `selected`, `locked`, etc. — are stable across ticks), or (b) isolate the ticking display into its own component so state updates don't propagate above `<Timer>`. (b) is more invasive given the current prop-drilling shape of `QuizGameShell`; (a) is a same-file, low-risk change.

**Finding 4.2 — `getChoiceProps` default prop is a fresh function every render (Cosmetic, currently harmless)**
- Evidence: `src/components/QuizGameShell.jsx:21` — `getChoiceProps = () => ({})`. This creates a new function identity on every `QuizGameShell` render.
- Impact: None today, since nothing downstream is memoized (see 4.1) — there's no broken memoization to speak of, because there's no memoization. Flagged only because fixing 4.1 with `React.memo` on `GameChoiceGrid` would need this default hoisted to a stable module-level constant (or the prop passed via `useCallback` by callers) to actually get the benefit; otherwise a fresh identity every render would still bust the memo comparison for any per-choice extra-prop logic. Bundle it into the same change as 4.1.

**Finding 4.3 — `useMemorySession`/`useGameSession` are otherwise disciplined about memoization and stale closures (Strong — no action needed)**
- Evidence: Both hooks use the ref-mirrors-state pattern extensively (`scoreRef`, `streakRef`, `indexRef`, `queueRef`, etc., see `useGameSession.js:69-89`) specifically to avoid stale closures in `setTimeout`/`setInterval` callbacks, with inline comments explaining *why* at each nontrivial spot (e.g. `useGameSession.js:213-227` on why `persistFreshSessionResume` reads from refs rather than waiting for state to commit). `useMemorySession.js:14-16` explicitly documents a contract requirement for callers ("`items` must be referentially stable... a fresh array identity on every render silently rebuilds the board mid-game") — this is exactly the kind of memoization discipline the audit was checking for, already in place and documented at the point of risk rather than left implicit.
- No action needed; noted under "What's Already Solid" too.

**Finding 4.4 — List rendering (missed items, badges, parent-dashboard breakdowns) has no virtualization, but none is needed**
- Evidence: `src/components/GameResults.jsx:67` (`newBadges.map`) and `:79` (`missed.map`) render lists bounded by a single session's size — `missed` can be at most `questionsPerSession` (a user-configurable setting, realistically single-digit-to-low-double-digit per CLAUDE.md), and `newBadges` is bounded by the badge catalog size for one session. `src/parent/ParentDashboard.jsx` renders several `.map()`-based tables/heatmaps (lines 63-335) but they're driven by `filteredScores` (a `useMemo`'d, date-range-filtered slice, `ParentDashboard.jsx:309`) rather than the raw unbounded score history, and per-game/per-day aggregates rather than one row per raw score record.
- Impact: None currently. Flagged only because §8 below (unbounded `getScores()` array) means the *underlying* data source has no cap — if a future UI surfaced raw score history unfiltered (e.g. "show me every session ever played"), that list would need windowing. Not an issue in any code that exists today.

---

## 5. Lighthouse / CI Status

**Configuration** (`lighthouserc.json`):
- Collects 4 routes: `/`, `/game/animal-sounds`, `/parent`, `/my-progress`, each run 3 times (`numberOfRuns: 3`, so lhci uses the median run — reasonably rigorous, not a single noisy sample).
- Uses a `puppeteerScript` (`lighthouse-puppeteer.cjs`) to pre-seed `localStorage` with `parentalLock.enabled: false` before each collected page load — a well-reasoned workaround, documented inline, so Lighthouse audits real page content instead of the parental-lock challenge screen on gated routes (`/parent`, `/my-progress`... actually `/admin` isn't in the collected URL list, but the same lock gates `/parent`).
- Assertions: `categories:performance`, `accessibility`, `best-practices`, `seo` all require `minScore: 0.8` at `"error"` severity (`lighthouserc.json:19-24`) — a failing score fails the CI job, not just a warning. This is a genuinely enforced gate, not decorative config.
- Upload target is `temporary-public-storage` (`lighthouserc.json:27-28`) — reports are ephemeral (lhci's public storage, time-limited), so there's no persistent historical trend/regression-over-time view; each CI run only compares against the fixed 0.8 threshold, not against the previous run's score.

**CI wiring** (`.github/workflows/ci.yml`):
- A dedicated `lighthouse` job (`ci.yml:159-181`) runs on every push to `main` and every PR targeting `main` (workflow-level trigger, `ci.yml:3-7`). It does a real `npm run build` (not `npm run dev`) then `npx lhci autorun` against the built output — auditing production behavior, not the dev server. This is correct practice.
- A comment at `ci.yml:169-172` documents a recent (2026-07-26/27) CI environment break (`ubuntu-latest` stopped guaranteeing a Chrome install lhci could auto-detect) and its fix (explicit `browser-actions/setup-chrome`) — evidence the Lighthouse gate is actively maintained, not a bit-rotted checkbox.
- No committed historical report artifacts were found in the repo (expected, given `temporary-public-storage` upload) — so this audit's "what did it last report" is answered by config rigor + the fact the gate blocks merge, not by a stored score. Given the `lazy()`-boundary fix already referenced in `src/App.jsx`'s comments (LCP 5.7s / 0.16 score caught and fixed), this CI gate has demonstrably caught at least one real regression in the past.

**Recommendation:** Consider persisting `lhci` reports as a workflow artifact (`actions/upload-artifact`) in addition to (or instead of relying solely on) `temporary-public-storage`, to get a durable trend line across releases rather than only a pass/fail per PR. Low priority — the current setup already gates merges effectively.

---

## 6. Fonts

**Finding 6.1 — Self-hosted, weight-scoped, `font-display: swap`, unicode-range subsetted (Strong — no action needed)**
- Evidence: `src/index.css:1-4`:
  ```css
  @import url('@fontsource/nunito/400.css');
  @import url('@fontsource/nunito/600.css');
  @import url('@fontsource/nunito/700.css');
  @import url('@fontsource/nunito/800.css');
  ```
  Only 4 of Nunito's available weights are imported (not the full variable-weight family), and `@fontsource/nunito`'s generated CSS (`node_modules/@fontsource/nunito/400.css`) sets `font-display: swap` on every `@font-face` rule and splits each weight into multiple `unicode-range`-scoped `@font-face` blocks (cyrillic-ext, cyrillic, latin-ext, etc.) — a browser serving English-language content only ever downloads the `latin`/`latin-ext` subset's `.woff2` files for each of the 4 imported weights, not the full glyph set. This is self-hosted (no third-party font-CDN round trip, no `fonts.googleapis.com` dependency) and `font-display: swap` avoids invisible-text-on-load (FOIT), trading a brief flash-of-unstyled-text for faster perceived text paint — a reasonable choice for LCP.
- CLS risk: `swap` can cause layout shift when the fallback font's metrics differ from Nunito's, if text reflows on font-swap. Not verified visually in this audit (would require a rendered-page check), but worth a brief manual check — no CSS `size-adjust`/fallback-metric-matching was found for the Nunito fallback stack.
- No action needed beyond the CLS spot-check noted above; this is a solid setup overall.

---

## 7. Third-Party Scripts

**Finding 7.1 — Google Analytics is opt-in, conditionally loaded, async, and does not block initial render (Strong — no action needed)**
- Evidence: `src/App.jsx:45-69`. `GoogleAnalytics` is a permanently-mounted component (per CLAUDE.md's architecture notes) but:
  - It reads `gaId` from settings (`useSettings()`) and does nothing (`return null` implicitly, no script injection) unless a GA ID is actually configured (`if (!gaId || document.getElementById('ga-script')) return`, `App.jsx:51`).
  - The GA ID is sanitized against a strict allowlist regex before use (`sanitizeGaId`, `App.jsx:41-43`) — an injection-safety measure, not a perf one, but worth noting since it's in the same code path.
  - The script tag itself is created and appended with `script.async = true` (`App.jsx:56-60`) — non-blocking, standard `gtag.js` async pattern.
  - Both effects (`App.jsx:50-61` for script injection, `App.jsx:63-66` for page-view tracking) run inside `useEffect`, i.e. after commit/paint, not synchronously during render.
- Impact: None on LCP/CLS/INP for the default (no GA ID configured) case, and minimal/standard-async impact for households that do configure one. This is implemented correctly.

---

## 8. State/Storage Perf

**Finding 8.1 — `useScores.addScore` performs 3 full array read/write passes per game completion, with no history cap (Moderate impact)**
- Evidence:
  - `src/storage/localStorageAdapter.js:21-25`:
    ```js
    async addScore(score) {
      const scores = await localStorageAdapter.getScores()   // full JSON.parse of entire history
      scores.push(score)
      localStorage.setItem(SCORES_KEY, JSON.stringify(scores)) // full JSON.stringify of entire history
    },
    ```
  - `src/hooks/useScores.js:11-15`:
    ```js
    async function addScore(result) {
      await adapter.addScore(result)          // internally: 1 read + 1 write (above)
      const updated = await adapter.getScores() // a 2nd full read, just to refresh hook state
      setScores(updated)
    }
    ```
  So a single call to the hook's `addScore` does **2 full `JSON.parse` passes and 1 full `JSON.stringify` pass** over the entire lifetime score-history array. This runs inside `finishGame()` in both `useGameSession.js:476-506` and `useMemorySession.js:152-192`, awaited before the results screen is shown (`setDone(true)` / `setDone(true)` respectively come after `addScore`, plus several more read-modify-write calls: `recordMisses`, `recordPersonalBestSession`/`recordMemorySession`, `awardSession`).
  - No trimming, rotation, or cap exists anywhere in `localStorageAdapter.js` or `useScores.js` — `getScores()`/`addScore()` never drop old entries. Score objects carry a `timings[]` array per question (`useGameSession.js:479-487`), so each quiz-game score record's size scales with `questionsPerSession`, not just O(1) per session.
- Impact: Moderate, and grows over the household's lifetime use of the app. In absolute terms, thousands of small JSON records still parse in low-single-digit milliseconds even on modest hardware, so this is unlikely to be perceptible today for a new install. But it is: (a) 3x more `localStorage` I/O than necessary per session (should be achievable in 1 read + 1 write, with the hook updating its own state from the data it already has rather than re-fetching), (b) unbounded, so the cost trends upward over months/years of daily play with no ceiling, and (c) sits directly in the critical path between "last question answered" and "results screen appears," alongside several other similarly-shaped read-modify-write calls (badges, personal bests, item stats) that compound the same-tick localStorage cost at exactly the moment a young child is waiting for on-screen feedback.
- Recommendation:
  - Have `useScores.addScore` update its own local `scores` state by appending `result` to the existing state array (which it already has in memory) instead of re-fetching via a second `adapter.getScores()` call — removes 1 of the 2 reads for free, no adapter change needed.
  - Consider having `localStorageAdapter.addScore` accept the already-known current array from a caller that maintains it in memory (or otherwise avoid the adapter's own internal `getScores()` call) if a future adapter (e.g. IndexedDB, or a real backend per CLAUDE.md's pluggable-adapter design) makes the read meaningfully more expensive than `localStorage`'s is today.
  - Add a retention policy (e.g. cap to the most recent N sessions or M days, matching whatever window `ParentDashboard`'s date-range filters actually surface) so `getScores()`'s cost has a ceiling. This also bounds `localStorage`'s ~5-10MB-per-origin quota exposure over a multi-year household lifetime.

**Finding 8.2 — Per-question `saveSessionResume` write is synchronous `localStorage.setItem` during active gameplay (Low impact, deliberate tradeoff)**
- Evidence: `src/hooks/useGameSession.js:247-254` — an effect fires `adapter.saveSessionResume(...)` (→ `localStorage.setItem`, `localStorageAdapter.js:111-113`) on every `[gameId, queue, index, done]` change, i.e. once per question transition (not per-tap, per the effect's own comment). This is a synchronous main-thread `localStorage` write happening during active gameplay, though gated to question boundaries rather than continuous ticks.
- Impact: Low. `localStorage.setItem` of one session-sized object (queue + a handful of scalars) is a small, fast synchronous write, and it's deliberately scoped to fire once per question rather than per-tap or per-render — the hook's own comments show this was a considered design point (`useGameSession.js:238-246`), not an oversight. Flagged for completeness per the audit brief's explicit ask about synchronous `localStorage` calls mid-gameplay, but this one is reasonably scoped already.
- No action recommended beyond awareness; revisit only if Finding 8.1's history-array growth ever makes `localStorage` writes noticeably slower in general (unlikely, since session-resume writes only touch the small resume object, not the score-history array).

**Finding 8.3 — `useItemStats`/`useBadges` are efficient (Strong — no action needed)**
- Evidence: both hooks (`src/hooks/useItemStats.js`, `src/hooks/useBadges.js`) keep an in-memory `useRef` mirror of the full stored object, mutate that ref directly, call `setState` from it, and persist with exactly one `adapter.save*` call per update — no extra reads. This is the same pattern Finding 8.1 recommends applying to `useScores`.

**Finding 8.4 — All adapter reads/writes wrap synchronous `localStorage` calls in `async` functions with no actual asynchrony**
- Evidence: every method in `src/storage/localStorageAdapter.js` is declared `async` but its body is a synchronous `localStorage.getItem`/`setItem` call — the `async` only wraps the return value in a resolved Promise; it doesn't defer the work off the main thread (there's no such mechanism for synchronous Web Storage). This matches CLAUDE.md's documented adapter-interface design (a swappable async contract for a future non-synchronous backend) and is expected/intentional, not a bug — flagged here only to make explicit, for the audit's benefit, that "async" in this codebase does not currently mean "off main thread," should that assumption matter for a future contributor reasoning about jank.

---

## What's Already Solid

- **Code-splitting/lazy-loading is correctly implemented** for both game code (`import.meta.glob` without `eager`) and heavy admin/parent/kids routes (explicit `lazy()` + `Suspense`), with a documented history of catching and fixing a real LCP regression via this exact mechanism (`src/App.jsx:15-22`).
- **Service worker update strategy** (`autoUpdate` + `skipWaiting` + `clientsClaim` + content-hashed filenames) eliminates the "stale content after deploy" failure mode the audit asked about — new deploys take effect immediately in already-open tabs, no manual reload needed.
- **Font loading**: self-hosted, `font-display: swap`, unicode-range subsetted, only 4 weights imported (not a full variable family) — a genuinely well-configured setup for LCP/perceived text paint.
- **Google Analytics**: fully opt-in (no-op with no configured ID), async script injection, effects run post-paint — zero cost for the common case, standard-practice async loading when configured.
- **`useItemStats`/`useBadges` storage hooks**: single-read-in-memory-mirror, single-write pattern — the right shape, and a good template for fixing Finding 8.1.
- **`useMemorySession`/`useGameSession` stale-closure discipline**: extensive, well-commented ref-mirrors-state usage specifically to keep `setTimeout`/`setInterval` callbacks correct without over-triggering effects; `useMemorySession`'s `items`-must-be-referentially-stable contract is documented at the point of risk.
- **Result/badge/missed-item lists**: correctly un-virtualized because they're genuinely small and session-scoped (not a missed virtualization need, a correct judgment call).
- **Lighthouse CI**: a real, enforced (`error`-severity, `minScore: 0.8`) gate across 4 representative routes with 3-run medians, running against a real production build in CI on every push/PR to `main`, actively maintained (see the Chrome-install fix comment), with a documented track record of catching at least one real LCP regression.
- **Character-match/-bluey portrait images**: appropriately sized and already in WebP format (Finding 2.2's `icon.png` is the one exception, not the rule).
- **Vitest coverage of the effects most likely to cause re-render bugs**: not directly audited here (out of scope), but the hooks' own extensive inline reasoning about render/effect ordering (e.g. `useGameSession.js:91-115`, `:157-166`) suggests this was written with test coverage of exactly those edge cases in mind, per CLAUDE.md's testing conventions.

---

## Recommendations (Prioritized)

1. **[High, easy] Re-encode `frog.mp3`, `horse.mp3`, `lion.mp3`** (`src/assets/sounds/`) at a bitrate consistent with the other 9 animal-sound clips. Expected savings: ~5 MB off both `dist/` and the service-worker precache set, with no user-visible quality change for short sound-effect playback.
2. **[High, easy] Convert `src/games/character-match/icon.png` to WebP** at a sane source resolution (it's rendered at 52×52 CSS px; the sibling game's equivalent icon is already a 90 KB WebP). Expected savings: ~440 KB, i.e. this one file drops by >95%.
3. **[Moderate, moderate effort] Scope service-worker precache more precisely for game audio** — either accept items 1-2's savings as sufficient, or move `mp3`/`wav` out of the blanket `globPatterns` precache and into a `runtimeCaching` `CacheFirst` rule scoped per-game, so audio is cached on first *play* of a game rather than on first *visit* to the app. Delivers the stated "offline after one visit" UX more precisely.
4. **[Moderate, low effort] Reduce `useScores.addScore` from 3 array passes to 1** by updating local hook state by appending the known new record instead of re-fetching the whole array a second time (`src/hooks/useScores.js:11-15`). Add a retention cap/rotation to `localStorageAdapter`'s score history so this cost has a ceiling over a multi-year household lifetime.
5. **[Low, low effort] `React.memo` the quiz choice grid and memory board** (`src/components/GameChoiceGrid.jsx`, `src/components/MemoryBoard.jsx`) so the 100ms `currentElapsedMs` timer tick (`useGameSession.js:297-299`) doesn't re-render the full question/choice tree every 100ms during every timed session. Hoist `QuizGameShell`'s `getChoiceProps = () => ({})` default to a stable module-level constant as part of the same change so the memo isn't defeated by a fresh default-function identity.
6. **[Low, optional] Persist Lighthouse CI reports as a workflow artifact** in addition to `temporary-public-storage`, for a durable score trend across releases rather than only a per-PR pass/fail against the fixed 0.8 threshold.
7. **[Low, optional] Bundle-analyze the main `index-*.js` chunk** (321.73 KB / 102.42 KB gzip) to confirm what's in it (react-router-dom, i18next, all manifests, shared UI) and whether non-default-locale i18n resources can be split out of it.

---

## Other Areas Noticed (Not Purely Performance)

- **`sanitizeGaId`** (`src/App.jsx:40-43`) strips anything outside `[A-Za-z0-9_-]` from a user-supplied GA measurement ID before injecting it into a `<script src>` URL — a defensive, correctly-scoped input-sanitization measure worth knowing about if reviewing the GA integration for security later (out of scope for this audit but adjacent to the third-party-script code path reviewed in §7).
- **`useFitTileSize`** (`src/hooks/useFitTileSize.js`) has unusually extensive inline reasoning (lines 1-56 are almost entirely comments) documenting *why* the memory board's tile-sizing math reads `window.innerHeight`/`getBoundingClientRect()`/`window.scrollY` the way it does, including a documented 1px-edge-case test note. This is a strong example of the "explain the non-obvious decision at the point of risk" pattern seen elsewhere in the hooks — flagged only as a positive maintainability observation, not a performance finding.
- **Score-history retention (Finding 8.1) has a privacy/storage-quota dimension beyond perf**: an unbounded, never-pruned lifetime history of a child's quiz answers and timing data sitting in `localStorage` indefinitely is worth a product/privacy conversation independent of the perf angle raised here — e.g. whether `SECURITY.md` or a settings-page "clear history older than N" control should exist. Not evaluated further as it's outside this audit's scope.
- **CI Lighthouse job doesn't audit `/admin`**, only `/parent` and `/my-progress` among the parental-lock-gated routes (`lighthouserc.json:6-11`) — likely intentional scoping, but worth confirming `/admin` doesn't have its own LCP-sensitive heavy dependency (it's already lazy-loaded per Finding 1.1, so risk is low, but it's the one gated route with zero Lighthouse coverage).
