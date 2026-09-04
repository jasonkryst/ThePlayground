# Core Functionality & Features Audit — The Playground

**Date:** 2026-09-04
**Version audited:** 1.1.10
**Scope:** Read-only investigation of feature-vs-doc accuracy, game inventory, session/state edge cases, admin/parent/kids areas, badges, error handling, routing, browser compat, and versioning.

---

## Executive Summary

The Playground is a mature, carefully-engineered small app. Every documented feature in `README.md` was traced to real, working code — there is no meaningful "vaporware" in the docs. The storage adapter, session-resume, badge, and orientation-gate systems are unusually well thought through, with defensive comments explaining *why* each piece of state is structured the way it is (a strong signal of an intentional, not accidental, design). `docs/ENHANCEMENTS.md` is **not stale** — spot checks of several backlog items (AU-9's missing `useFocusOnMount` in `ResumePrompt`, the react-router CVE allowlist, the React 19 upgrade) all still reflect the current code exactly.

The single biggest gap found is architectural rather than a bug: **there is no React error boundary anywhere in the app**, and **there is no catch-all/404 route**. Both are one-line-scale fixes with outsized blast-radius reduction for a kids'-tablet app that will inevitably hit an unexpected input or a stray URL. Everything else found is minor — a couple of doc/code label mismatches, one accessibility backlog item confirmed still open, and small inconsistencies in double-tap guarding between the shared `GameChoiceGrid` path and Number Tap's bespoke input path.

No dead components, no orphaned hooks/utils, no TODO/FIXME/leftover `console.log` anywhere in `src/` (a `console.warn` in `buildDeck.js` is deliberate defensive logging, not debug residue).

---

## Feature-vs-Doc Drift

Went through `README.md`'s Features list and Settings Reference table against `src/storage/adapter.js`'s `DEFAULT_SETTINGS` and live usages.

| README claim | Verified in code | Notes |
|---|---|---|
| Auto-discovered games via `import.meta.glob` | ✅ `src/App.jsx:12-13` | Exactly as described |
| Two game types (quiz/memory) | ✅ | `gameType: 'memory'` read in `KidsProgressPage.jsx:48`, `GameResults.jsx` |
| 9 games listed | ✅ | All 9 present, manifests well-formed |
| Admin tabs: Settings · Games · Badges | ✅ `AdminPage.jsx:113-117` | |
| Parental Lock (math challenge / PIN) | ✅ `parentalLock: { enabled: true, pin: '' }` in `DEFAULT_SETTINGS`, `ParentalLockGate.jsx`, `AdminPage.jsx:25-45` | |
| My Progress page (`/my-progress`) | ✅ `KidsProgressPage.jsx`, routed in `App.jsx:129` | Memory-appropriate stat tiles confirmed (fewest flips / pairs matched vs. accuracy / questions) |
| How-to-play intro, dismissible | ✅ `introDismissed` in settings, `GameIntro.jsx`, replay button in Admin Games tab (`AdminPage.jsx:612-614`) | |
| Session resume (4-hour TTL) | ✅ `getSessionResume/saveSessionResume/clearSessionResume`, `isResumeValid` in `useGameSession.js`/`useMemorySession` | See Session/State section below |
| Kid-safe exit guard | ✅ `useShellGameStatus`, `AppShell.jsx` | |
| PWA / offline | ✅ `vite-plugin-pwa` config in `vite.config.js`, `registerSW({ immediate: true })` in `main.jsx` | |
| Version in dashboard footer + game route | ✅ `AppShell.jsx:11,233-237` | See Versioning section |
| Google Analytics, opt-in, GA4 | ✅ `GoogleAnalytics` component in `App.jsx:45-69`, `sanitizeGaId` strips non-alphanumerics | |
| Settings Reference table (17 rows) | ✅ all keys present in `DEFAULT_SETTINGS` | `numChoices`, `feedbackMode`, `questionsPerSession`, `timerMode`/`timeLimitSeconds`, `maxTries`, `hintsEnabled`/`hintAfterWrongTaps`, `retryCountsAsStreak`, `spacedRepetitionEnabled`, `adaptiveItemSelectionEnabled`, `difficultyAutoProgressionEnabled`, `memoryPairs`, `soundEffectsEnabled`, `theme`, `gaId`, `parentalLock` all confirmed wired to real UI controls in `AdminPage.jsx` |
| Theme: System/Light/Dark/High Contrast | ✅ `ThemeSync` in `App.jsx:86-99`, `VALID_THEMES` set | |
| Parent Dashboard 6 sections | ✅ `ParentDashboard.jsx` imports `computeScoreTrend`, `computeResponseTimes`, `computeStreakHistory`, `computeSessionHeatmap`, `computeMissedItems`, plus `ScoreHistory` for session history | |

**No documented-but-missing features found.** No built-but-undocumented settings found either — `DEFAULT_SETTINGS` has no keys absent from the README table.

**Minor drift:**
- README's Settings Reference doesn't mention `adaptiveItemSelectionEnabled`'s "Off" default is correct but the row label omits that it also depends on cross-session `itemStats` — a minor completeness nit, not an inaccuracy (the effect is documented in the adapter JSDoc, just not repeated in the README table). Low severity, no action needed beyond awareness.

---

## Game-by-Game Inventory

All 9 manifests are well-formed JSON with the required `tags` array present and non-empty; `gameType`/`orientation`/`color` conventions from CLAUDE.md are followed correctly everywhere they're used.

| Game | `tags` | `gameType` | `orientation` | `color` | `index.jsx` exports `onGameEnd`? | badges.js | TODO/console.log/dead code |
|---|---|---|---|---|---|---|---|
| animal-memory-match | `["memory","animals"]` | `memory` | `landscape` | `#4DB6AC` | ✅ | ✅ (6 badges) | none found |
| sound-memory-match | `["memory","sounds"]` | `memory` | `landscape` | `#80DEEA` | ✅ | ✅ (6 badges) | none found |
| animal-sounds | `["sounds","animals"]` | — (quiz) | — | `#B39DDB` | ✅ | — (global catalog) | none found |
| character-match | `["visual","characters"]` | — | — | `#FFB74D` | ✅ | — | none found |
| character-match-bluey | `["visual","characters","bluey"]` | — | — | `#FFB74D` | ✅ | — | none found |
| color-match | `["visual","colors"]` | — | — | `#CE93D8` | ✅ | — | none found |
| emotions-match | `["vocabulary","emotions"]` | — | — | `#FFD54F` | ✅ | — | none found |
| fruit-veggie-id | `["vocabulary","food"]` | — | — | `#AED581` | ✅ | — | none found |
| number-tap | `["math","counting"]` | — | — | `#90CAF9` | ✅ | — | none found (see Session/State note on double-tap guard style) |

Both memory games correctly set `gameType: "memory"` and `orientation: "landscape"`, matching CLAUDE.md's stated convention. All 7 quiz games correctly omit both (no game currently declares `orientation: "portrait"`, so that code path is only exercised by tests/Storybook, not any shipped game — worth knowing if it's ever removed as "unused").

Every game's `index.jsx` was confirmed to have a `export default function <Name>({ onGameEnd })` and to call `onGameEnd(...)` from its results screen (`grep` across all 9 confirmed this). A repo-wide grep for `TODO|FIXME|console\.log|console\.debug` across `src/games/` returned zero matches — the codebase is clean of debug residue.

---

## Session/State Edge Cases

**Browser refresh mid-game (session resume):** Thoroughly implemented in `useGameSession.js:157-205` and mirrored in spirit by `useMemorySession` (which doesn't itself resume — only quiz sessions currently do; memory games' `useMemorySession.js` has no `getSessionResume` call at all). A saved snapshot is validated by `isResumeValid` (4-hour TTL, same-`gameId` check) before offering `ResumePrompt`. Declining a resume correctly resets every ref *and* state var back to zero (`declineResume`, lines 128-155) rather than leaving stale refs that could resurface later — this is a real, easy-to-miss bug class the code visibly guards against.

- **Finding (Low, doc-worthy):** `useMemorySession.js` has no resume support — a refresh mid-memory-game loses all board progress, while a refresh mid-quiz-game resumes. This asymmetry isn't called out anywhere in README's "Session resume" bullet (which says "a browser crash... leaves a resumable snapshot" without qualifying it to quiz games only). Recommend either implementing memory resume or adding one clause to the README bullet.

**Orientation flip mid-game actually pauses timing, not just visually blocks:** Verified directly, not just by the doc's claim. In `useGameSession.js:284-315`, the countdown-timer effect captures `blocked` as a dependency; when `blocked` is true it returns early without arming `setInterval`/`setTimeout`, and `pausedAtRef` records the block instant so `questionStartRef` is shifted forward by the paused span on resume (durationMs stays honest). `handleChoice` (line 438) also short-circuits on `blockedRef.current`, so taps landing on a game hidden behind the rotate overlay are silently ignored — not race-prone since `OrientationGate.jsx:29-33` also marks the content `inert` + `aria-hidden`, which makes it doubly unclickable at the DOM level. `useMemorySession.js:80-94` does the same thing (`startRef.current += Date.now() - pausedAtRef.current`) and `flipTile` (line 107) checks `blockedRef.current` too. **This is a genuinely solid implementation** — the orientation pause is real, not cosmetic.

**Rapid double-taps / double-submits:** `useGameSession.handleChoice` (line 437-450) guards with `lockedRef.current` (a ref, not React state, so it's immune to any batching race between two rapid discrete click events) and also checks `disabledChoiceIdsRef`. `GameChoiceGrid.jsx` additionally disables the button visually/functionally (`isChoiceDisabled` gate on `onClick`, line 38) — a second, presentation-layer guard.
- **Finding (Low):** Number Tap (`src/games/number-tap/index.jsx:58-64`) implements its own `handleDone()` guard using the *reactive* `locked` state value (from the hook's return), not a ref, unlike the ref-based guard the rest of the engine relies on for the same purpose. In practice this is unlikely to double-submit in real browsers (each discrete click/touch event gets its own render pass in React 18), but it's an inconsistency with the pattern used everywhere else, and if `handleDone` were ever called twice synchronously (e.g., from a future keyboard-repeat or programmatic double-invoke) it would double-count. Low risk, but worth aligning with the ref-based pattern for consistency's sake.

**Running out of unique items before `questionsPerSession` is reached:** `buildQueue.js` (`buildCorrectSequence`) repeats items to fill the session, "distributed evenly" as README claims — confirmed: it reshuffles the full item pool each pass and only avoids repeating the *same* item twice in a row (lines 35-38), matching the documented behavior exactly. Edge case: if a game's item pool has only 1 item, `wrongPool` (buildQueue.js:53) is empty, so `numChoices - 1` wrong choices become 0 — the question renders with just 1 (correct) choice button. No shipped game has a 1-item pool today, so this is theoretical, but there's no guard/warning for it the way `buildDeck.js` has one (`console.warn` when `items.length < pairs`, line 16-17). **Recommend**: mirror `buildDeck`'s defensive warn in `buildQueue` for parity, in case a future game ships a very small item pool.

**`timerMode` edge cases (0 or arbitrary values):** Not reachable via the UI — `timeLimitSeconds` is only ever set via `AdminPage.jsx`'s fixed radio buttons (`[5, 10, 15, 20]`, lines 376-393), and `timerMode` is one of three enum values set the same way. There is no free-text timer input anywhere, so "0 or very high values" can't be entered through the app itself. (A manually-edited `localStorage` value could still set an arbitrary number, but that's outside the UI's control surface and not really an "edge case a parent could hit.")

---

## Admin / Parent / Kids Areas

All three routes (`/admin`, `/parent`, `/my-progress`) render real, complete pages — confirmed by reading `AdminPage.jsx`, `ParentDashboard.jsx`, `KidsProgressPage.jsx` in full/near-full.

**Settings validation:** Every numeric/enumerated setting in `AdminPage.jsx` (`numChoices`, `questionsPerSession`, `memoryPairs`, `timeLimitSeconds`, `speedRecordMinAccuracy`, `maxTries`, `hintAfterWrongTaps`) is exposed only via `<input type="radio">` bound to a fixed array of valid values — there is **no free-text numeric input anywhere in Admin**, so a parent cannot enter a negative `questionsPerSession` or an out-of-range `memoryPairs` through the UI. The only free-text inputs are `childName` (any string, safe), `gaId` (sanitized via `sanitizeGaId` in `App.jsx:41-43`, strips to `[A-Za-z0-9_-]` before use), and the PIN fields (validated with `/^\d{4}$/` in `handleSetPin`, `AdminPage.jsx:25-28`, with a mismatch/invalid error state). This is a strong, low-surface-area design choice — the enum-only settings model structurally prevents most "invalid input breaks the board layout" bugs by construction.

**Dead/orphaned components:** Checked every file in `src/components/` and `src/hooks/` for at least one non-test, non-Storybook import elsewhere in `src/`. **Zero orphans found** — every component and every hook has at least one real consumer. (`.stories.jsx` files correctly show 0 importers since Storybook loads them by its own convention, not via `import`.)

**Admin PIN UX note (Low):** `handleSetPin`'s error state (`pinError`) is not cleared when the user *successfully* sets a PIN and then reopens the panel — minor, doesn't affect correctness, just a residual state nit if the component were kept mounted across an unrelated re-render. Not something users would notice in practice since the component fully resets on navigation away/back.

---

## Badge System

`src/lib/badges.js`'s `buildGameBadgeCatalogs` auto-discovers every `src/games/*/badges.js` via `import.meta.glob`, and `getBadgesForGame(gameId)` falls back to the global `BADGE_CATALOG` only when no per-game catalog exists (`?? BADGE_CATALOG`, line 28) — this is exactly the "fully replaces" behavior CLAUDE.md describes, confirmed in both `src/lib/badges.js` and its consumer `useBadges.js` (`awardSession`, lines 21-59: branches entirely on `gameCatalog ? ... : ...`, no merging of the two catalogs happens anywhere).

Only the two memory games (`animal-memory-match`, `sound-memory-match`) ship a `badges.js`; all 7 quiz games correctly fall through to the shared `BADGE_CATALOG` (streak tiers, perfect session, lifetime-question tiers).

**Field-reference check:** Memory-game badge criteria reference `s.flipAttempts`, `s.peakMatchStreak`, `s.pairs` (session-kind) and `counter: 'pairsMatched'` (lifetime-kind) — all of these are fields `useMemorySession.finishGame()` actually produces and passes into `awardSession`'s `sessionStats`/`counterIncrements` (`useMemorySession.js:177-185`). No dangling field references found. The global quiz catalog's criteria (`peakStreak`, `isPerfect`, lifetime question totals) similarly match exactly what `useGameSession.finishGame()` passes (`useGameSession.js:496-499`). **No mismatch between badge catalogs and the session data shape they consume for either game type.**

---

## Error Handling

**No React error boundary exists anywhere in the codebase.** A repo-wide grep for `ErrorBoundary|componentDidCatch` across `src/` returned zero matches, and `src/main.jsx` renders `<App />` directly inside `<StrictMode>` with nothing else wrapping it.

**Impact:** Any uncaught exception thrown during render by *any* game component (a malformed manifest field, a bad array index, a null item lookup, a third-party lib throwing) unmounts the entire React tree — the dashboard header, footer, and every other route go blank/white along with the failing game, since there is nothing above `<App />` to catch and contain the failure. For a kids'-tablet app that's meant to survive in the hands of a toddler (and where games are user-extensible per CLAUDE.md's "drop a folder in" model), this is the single highest-leverage fix in this audit: a top-level error boundary around `<Routes>` (or at minimum around `<GameRoute>`'s `<Suspense>` boundary) would contain a single bad game's crash to that route instead of the whole app, and could offer a "return to dashboardâ€ affordance instead of a blank screen.

- **Severity:** High (low likelihood per individual game, given the mature codebase and its extensive test suite, but unbounded blast radius when it does happen — and the architecture explicitly invites third-party-style game additions with no registry gatekeeping).
- **Recommendation:** Add a class-component `ErrorBoundary` wrapping `<Routes>` in `App.jsx` (or at least each `<Route element=...>` for game/admin/parent routes individually, so one game's crash doesn't also take down in-flight admin/parent panels — though those are separate routes already, so route-level isolation is naturally decent even with one boundary at the top, since React Router unmounts/remounts per route).

---

## Routing

`src/App.jsx`'s `<Routes>` (lines 124-131) defines exactly 5 paths: `/`, `/admin`, `/parent`, `/my-progress`, `/game/:gameId`, all nested under a single layout `<Route element={<AppShell manifests={manifests} />}>`.

- **`/game/<nonexistent-id>` is handled gracefully:** `GameRoute` (lines 101-116) looks up `gameComponents[gameId]`; if not found, it renders `<div style={{ padding: 24 }}>Game not found.</div>` in place of the game — inside `AppShell`'s chrome, so header/footer/nav remain present. This is correct, tested-feeling behavior.
- **Finding (Medium): no catch-all/404 route exists.** There is no `<Route path="*" ...>` anywhere in `App.jsx`. Because the single layout `<Route element={<AppShell/>}>` has no `path` of its own, its match is entirely determined by whether one of its children matches — if a URL doesn't match `/`, `/admin`, `/parent`, `/my-progress`, or `/game/:gameId` (e.g., a typo'd URL, an old bookmark, or a stray deep link), **`<Routes>` renders nothing at all** — not even the `AppShell` header/footer — resulting in a fully blank white page with no indication of what went wrong or how to get back. Given the Docker/nginx deployment guide's static-SPA fallback (`index.html` served for unmatched paths), any malformed URL a user types or a stale bookmark hits will land here. This is a low-effort, meaningful UX fix: add `<Route path="*" element={<Navigate to="/" replace />} />` (or a dedicated "page not found, go home" component consistent with the app's kid-safe tone).

---

## Compat

- No use of bleeding-edge CSS selectors in `src/index.css` itself (`:has()`, `@container`, `color-mix()`, `:is()`/`:where()` all absent there).
- `:has()` **is** used in exactly two places: `src/admin/AdminPage.css:94` (a focus-visible outline enhancement on radio labels) and searched-but-not-found in `ReplayButton.css` (false positive from the earlier grep pass — only `AdminPage.css` actually uses it). Both usages are pure visual enhancement (focus ring), not functional gating — a browser without `:has()` support simply loses that one outline style, no functional breakage. Low risk given Admin is a parent-facing, not toddler-facing, page.
- `inert` attribute (`OrientationGate.jsx:31`, `AppShell.jsx` exit-dialog pattern) is a relatively modern HTML attribute (broad support since ~2023 in evergreen browsers, but **not** supported at all in older Safari/iOS versions that may still be in circulation on hand-me-down family tablets). No fallback/polyfill is used. Given the stated target audience ("family households," "car/travel use," PWA offline-first for exactly this kind of device), this is worth a conscious risk acceptance rather than an oversight — flagging for awareness, not as a bug, since a missing `inert` attribute degrades to "content behind the overlay remains technically focusable" rather than any hard failure.
- `useOrientation.js` (lines 10-27) is a good example of defensive compat coding: it checks for `window.matchMedia`, `window.screen?.orientation?.type` via optional chaining, and explicitly falls back to `'landscape'` when neither API exists, "so a broken environment can never strand the player behind the rotate overlay" (per its own comment). This is exactly the right posture for the stated device diversity.
- No explicit `build.target` in `vite.config.js` — Vite's default esbuild target applies (roughly ES2020+ baseline). No polyfills are bundled for older engines. This is a reasonable, standard choice for a Vite app and not something to flag as broken, just worth knowing if "older tablets" in practice means anything pre-2020-era Chrome/Safari.

---

## Versioning

CLAUDE.md's and README's claim — "app version read from `package.json` at build time... shown in the dashboard footer; each game's version comes from its own `manifest.json`... shown on that game's route" — is **confirmed exactly in code**, not just by doc assertion:

- `src/components/AppShell.jsx:11`: `import { version } from '../../package.json'`
- `src/components/AppShell.jsx:237`: `<span className="shell__version">v{version}</span>` — rendered in the footer on every route.
- `src/components/AppShell.jsx:235`: `<span className="shell__game-version">{t(gameManifest.nameKey)} v{gameManifest.version}</span>` — rendered additionally when `isGameRoute` is true (i.e., only on `/game/:gameId` routes), using the per-game manifest's own `version` field.

`package.json`'s `"version": "1.1.10"` matches the version this audit was commissioned against.

---

## What's Already Solid

- **Storage adapter discipline** is exemplary: every persisted shape is documented in one JSDoc block (`src/storage/adapter.js`) with version-annotated field additions (e.g., "added v0.8.0", "added v0.23.0") — a genuinely rare level of self-documentation for a small app, and it makes auditing trivial rather than archaeological.
- **Session-resume correctness**: the intro-init vs. resume-check effect split in `useGameSession.js` (lines 91-115 vs. 157-205) is explained with unusually careful inline comments about *why* they're separate effects (avoiding a one-render-behind staleness bug) — this reads as code written by someone who hit the bug once and left a permanent guardrail comment, not speculative design.
- **Orientation-gate timing pause is real**, verified by reading the actual effect dependency arrays and ref bookkeeping, not just trusting the doc claim — both quiz and memory sessions correctly freeze and un-freeze their wall-clock baselines.
- **Badge catalog auto-discovery + full-replacement semantics** are implemented exactly as documented, with no partial-merge foot-gun.
- **Enum-only settings surface**: Admin's total absence of free-text numeric inputs for anything that could break layout (`questionsPerSession`, `memoryPairs`, `numChoices`, `timeLimitSeconds`, etc.) structurally eliminates an entire class of "parent enters garbage, board breaks" bugs.
- **Zero dead code**: no orphaned components, no orphaned hooks/utils, no debug leftovers (`TODO`/`FIXME`/stray `console.log`) anywhere in `src/`.
- **`docs/ENHANCEMENTS.md` is accurate, not stale** — every backlog item spot-checked against current code (AU-9's missing `useFocusOnMount` in `ResumePrompt`, the react-router CVE version-range claim, the React 18→19 upgrade being still-open) matched the real code exactly.
- **`useOrientation`'s defensive API-availability fallbacks** are a good model for the rest of the app's browser-compat posture.
- **Double-tap/double-submit protection** via ref-based locking (not React state) in the shared quiz engine (`useGameSession.handleChoice`) is a subtly correct pattern that avoids state-batching races — most of the codebase follows it consistently.

---

## Recommendations (Prioritized)

1. **[High] Add a top-level React error boundary** around the routed content in `App.jsx` (at minimum wrapping `<Routes>`, ideally with a "Return to dashboard" recovery affordance). Currently any component throw blanks the entire app, including chrome. Given the app's "drop in a new game folder" extensibility model, this is the single highest-value fix in this audit.
2. **[Medium] Add a catch-all `<Route path="*">`** redirecting to `/` (or rendering a friendly not-found page within `AppShell`). Currently any unmatched URL renders a fully blank page with no chrome at all.
3. **[Low] Address `docs/ENHANCEMENTS.md`'s AU-9 item** (`ResumePrompt` doesn't call `useFocusOnMount()`) — confirmed still open by this audit; it's already accurately tracked, just noting it's real and cheap to fix (the backlog entry already describes the exact one-line fix).
4. **[Low] Align Number Tap's `handleDone`/`toggleObject` double-submit guard** with the ref-based `lockedRef` pattern used by `useGameSession.handleChoice`/`GameChoiceGrid`, for consistency (current reactive-state guard is very unlikely to actually double-fire in practice, but it's the one place in the engine that doesn't follow the established defensive pattern).
5. **[Low] Add a `buildQueue` pool-size warning** mirroring `buildDeck.js`'s existing `console.warn` when a game's item pool can't fill the requested choice count — currently silent, `buildDeck` already sets the precedent.
6. **[Low/Doc] Clarify in README** that session-resume currently applies to quiz games only (`useMemorySession` has no resume path) — the current "a browser crash... leaves a resumable snapshot" bullet doesn't scope this to quiz games, and a reader would reasonably assume memory games behave the same way.

---

## Other Areas Noticed (Cross-Cutting, Outside Core Functionality Scope)

- **CI/security posture** (from skimming `docs/ENHANCEMENTS.md`'s Security section while assessing backlog freshness) looks unusually mature for a project this size — pinned GitHub Actions to commit SHAs, Trivy scanning of the actually-released image, `audit-ci` gating, dated allowlist-expiry enforcement via a CI test. Not this audit's focus, but worth noting as a strength if a broader audit ever covers CI/deployment.
- **i18n completeness** wasn't exhaustively audited here (out of this audit's assigned scope), but the merge mechanism (`src/i18n/index.js` combining core + per-game `en.json`/`es.json`/`pl.json`) is architecturally sound and consistent with the auto-discovery philosophy used everywhere else in the app.
- **`docs/accessibility_usability.md`** and its "AU-n" items in `ENHANCEMENTS.md` are a separate, apparently well-maintained audit track already covering accessibility in more depth than this core-functionality pass attempted — no need to duplicate that work here.
- **Recharts (v3.9.0) is lazy-loaded** only on `/parent` (confirmed via the comment block in `App.jsx:15-22` citing a specific Lighthouse LCP regression this fixed) — a nice, evidence-driven performance decision rather than a guess.
