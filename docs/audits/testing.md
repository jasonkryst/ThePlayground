# Testing Audit — The Playground

**Date:** 2026-09-04
**Version audited:** 1.1.10
**Scope:** All six documented testing layers (`docs/TESTING.md`), plus CI wiring (`.github/workflows/*`), Stryker mutation config, and flaky/skipped-test hygiene. Read-only investigation — no source or test files modified.

---

## Executive Summary

The Playground has an unusually mature test setup for a project of its size: 1,458 tests across 111 files, six enforced layers (unit/component, two levels of a11y, e2e, visual regression, HTML/CSS validation), a real mutation-testing harness, and 9 CI jobs that mirror the documented testing story almost exactly. Static inspection and a live run both confirm this is not aspirational documentation — the numbers in `docs/TESTING.md` check out.

The gaps that exist are narrow but real:

1. **Confirmed still true:** the storage adapter contract suite (`adapterContract.js`) only exercises 5 of the 7 documented get/save pairs — `getItemStats`/`saveItemStats` and the session-resume trio have no adapter-agnostic contract coverage, only `localStorageAdapter`-specific tests. (This is examined in depth by `docs/audits/storage-database.md` § 6 — this audit confirms the gap from the testing-strategy side and treats it as one item in the recommendations below rather than re-deriving it.)
2. **New finding, most significant:** three of the nine games (`character-match-bluey`, `emotions-match`, `number-tap`) have **no e2e play-through spec and are absent from `visual.spec.js`'s hardcoded story list**, despite having `.stories.jsx` files. They get zero browser-level coverage of any kind — no golden-path test, no visual regression baseline, no page-level axe scan. This directly contradicts `docs/TESTING.md`'s claim that "every game" gets a visual regression baseline via its stories.
3. Two tests (`useGameSession.test.js`'s adaptive-weighting test and `__tests__/playwrightConfig.test.js`) **timed out** in a full-suite local run (both pass cleanly in isolation) — a real, reproduced flakiness signal under system load, not a hypothetical.
4. Coverage is genuinely excellent on real logic (near-100% on every hook, util, and game `index.jsx`); the low-looking per-folder percentages in the raw report are an artifact of `.stories.jsx` files (0% by design, exercised by Storybook/Playwright instead) being included in the coverage scope, not a real gap.

What's already strong is covered in its own section below — this project should not read this audit as "testing is weak."

---

## Coverage Gaps (by directory)

`npx vitest run` (full suite, no coverage instrumentation): **1,456 passed / 2 failed (timeout) / 1,458 total, across 111 files.** `npx vitest run --coverage --coverage.reportOnFailure`: **88.44% statements / 93.38% branches / 84.67% functions / 88.44% lines**, overall.

| Area | Tests present? | Coverage | Notes |
|---|---|---|---|
| `src/games/*` (all 9) | Yes — every game has `__tests__/` (2–3 files each, 284–393 lines) | `index.jsx` at 96–100% stmts in every game | Per-folder % in the raw report (46–76%) is dragged down entirely by `*.stories.jsx` (0%, by design — exercised via Storybook, not Vitest). No thin/shallow test files found — shortest is 284 lines with a full assertion suite (intro→play→results→home, wrong-answer handling, a11y). |
| `src/hooks/*` (21 files) | Yes — 21 test files, 1:1 with source files | 99.86% stmts / 97.56% branch / 100% funcs | Best-covered area in the codebase. Minor branch gaps: `useBadges.js` (84.21%, lines 29/32-35), `useSpeech.js` (88.23%, lines 22-23), `useQuestionAudio.js` (93.75%, line 26) — all small, plausibly defensive/unreachable-in-jsdom branches, not missing behavior tests. |
| `src/components/*` (34 files) | Yes — 25 test files | 80.63% stmts, but 100% on every component except `ScoreHistory.jsx` (88.23%, lines 14-15/18-19 — an edge-case branch) and the `.stories.jsx` files (0%, by design) | No component lacks a test file; `AppShell`, `QuizGameShell`, `ExitConfirmDialog`, `MemoryBoard`, `ParentalLockGate` etc. are all at 100%. |
| `src/lib/*` (7 files) | Yes — 6 test files (`choiceColors.js` has no dedicated file but is exercised indirectly — see below) | 100% stmts / 94.87% branch across the folder | `badges.js` (80% branch, line 16) and `parentalLock.js` (90.9% branch, line 21) have single uncovered branches, not gaps in scenario coverage. |
| `src/storage/*` | Yes — contract suite + 8 `localStorageAdapter.*.test.js` files | 98.7% stmts overall; `adapter.js` 100%, `localStorageAdapter.js` 100%, `index.js` 0% (trivial 1-line re-export, not worth a test) | **Contract-suite gap confirmed** (see Finding T-1 below) — the 100% number is real for the one concrete adapter, but doesn't protect a future second adapter for 2 of 7 method pairs. |
| `src/utils/*` | Yes, incl. the 7 files Stryker mutates | 100% stmts / 94.75% branch | Strongest area alongside hooks; this is also the mutation-tested set (see Mutation Testing section). |
| `src` (top-level: `App.jsx`, `main.jsx`) | `App.jsx` has coverage via integration through other tests, no dedicated `App.test.jsx` | `App.jsx` 85.57% stmts / **31.25% functions**; `main.jsx` 0% | `main.jsx` (ReactDOM bootstrap) is conventionally untested — fine. `App.jsx`'s low function coverage (31.25%) is the single most notable real gap in the codebase: it's exercised incidentally by whichever component tests happen to mount routes, not by a dedicated test asserting routing/discovery behavior (the `import.meta.glob` auto-discovery mechanism itself, orientation gating wiring, etc.) — see Recommendations. |
| `src/admin`, `src/parent`, `src/kids` | Yes | 98.21%, 98.26%, 88.57% stmts respectively | All solid; `ParentDashboard.jsx` functions at 80% (a few uncovered CSV/export helper branches), `KidsProgressPage.jsx` fine at 100% excluding its `.stories.jsx`. |

**Overall assessment:** there is no directory with genuinely thin or missing unit-test coverage. The only real, actionable coverage gap at the unit-test layer is `App.jsx`'s function coverage, and it's about depth of assertion (does anything actually test the auto-discovery glob wiring end-to-end?) rather than absence of any test.

---

## Test Quality Findings

**Spot-checked for real assertions vs. shallow tests:** no shallow "renders without crashing" tests found. `ScoreHistory.security.test.jsx:39` and `KidsProgressPage.test.jsx:106,128` are the only hits for that phrasing in the whole test tree, and both are legitimate defensive-edge-case tests with real assertions attached (`expect(screen.getByText(/eight/)).toBeInTheDocument()`, dash/zero-state assertions, section-heading-count assertions) — the "crashing" language describes the scenario being guarded against, not the depth of the check.

**Documented pitfalls, verified in practice:**
- **Fake timers + `fireEvent`, not `userEvent`, for timed feedback:** confirmed. Checked the files that use both `useFakeTimers()` and `userEvent` in the same file (`AnimalSoundsGame.test.jsx`, `NumberTapGame.test.jsx`, and 7 others) — in every one, `userEvent` calls never occur between a `useFakeTimers()`/`useRealTimers()` pair. The two APIs are used in different tests within the same file, never combined, exactly as documented.
- **`useSoundPlayer` mock seam:** mostly followed (4 files mock the hook directly), but with one real, undocumented exception: `AnimalMemoryMatchGame.test.jsx:7-18` and `SoundMemoryMatchGame.test.jsx` (equivalent) mock the raw `window.Audio` constructor instead, with an inline comment explaining why: "the stop-previous-clip behavior can't be observed through a shared prototype spy." This is a reasonable, deliberate choice (both games genuinely need per-instance play/pause/reset assertions the hook-level mock can't expose), but `docs/TESTING.md`'s mock-seam rule calls out exactly one exception (`useSpeech`'s own hook test) and doesn't mention this second one — a reader following the doc literally would flag these two files as violations. **Recommendation:** add a one-line callout to TESTING.md's mock-seam bullet, mirroring the `useSpeech` exception's treatment.
- **`aria-disabled` (not `disabled`) for matched memory tiles:** confirmed correct in `MemoryBoard.test.jsx:46-56` and the two memory-game test files — tests explicitly assert `toHaveAttribute('aria-disabled', 'true'/'false')`, never the native `disabled` attribute, and there's an explicit test naming the keyboard-focus-survives requirement.

**Skipped/only/TODO hygiene:** grepped `.skip(`, `.only(`, `xit(`, `xdescribe(`, and `TODO` across `src/**/*.test.{js,jsx}` and `e2e/**`. Zero hits in the unit suite. Three `test.skip()` calls in `e2e/` (`confetti-csp.spec.js:70`, `nginx-headers.spec.js:70`, `pwa-csp.spec.js:34`) are all the same legitimate, documented pattern — `test.skip(!dockerAvailable(), ...)` — skipping only when Docker isn't present, not masking a real failure. No `.only(` anywhere (would fail review/CI if present and forgotten). Clean.

**Reproduced flakiness (new finding, Medium severity):** two full-suite runs (`npx vitest run`, then `npx vitest run --coverage`) each failed the same 2 of 1,458 tests, both on **timeout**, not assertion failure:
- `src/hooks/__tests__/useGameSession.test.js:1190` ("actually weights a heavily-missed item higher...") — times out at its explicit 15000ms budget. This test runs 150 real `renderHook`/`unmount` cycles to get a statistically meaningful sample (the file's own comment at lines 1194-1206 documents the false-pass-rate math carefully — this is a well-reasoned test, not a lazy one) but that also makes it the single most CPU-sensitive test in the suite; under contention it can blow its budget without any actual bug.
- `__tests__/playwrightConfig.test.js:19` — times out at the vitest default 5000ms.
- Re-running `useGameSession.test.js` alone: all 99 tests pass, including this one, confirming it's a load/timeout issue, not a logic regression. This mirrors the exact class of problem `docs/TESTING.md` already documents for Playwright's CI worker-count decision (issues #141/#147/#165/#167) — the same "shared machine, CPU contention, whichever test is mid-render loses" dynamic, just not yet addressed on the Vitest side. **Recommendation:** raise both tests' timeouts further (or mark `useGameSession`'s statistical test with a generous fixed timeout like the existing 15000ms was already bumped once, per its own trailing comment) and consider whether CI's `unit-tests` job needs the same single-worker treatment `e2e` got, if this is ever seen failing a real PR.

---

## E2E / A11y / Visual Regression Assessment

**Golden-path e2e coverage by game** (9 games total, `e2e/*.spec.js`):

| Game | Added (first commit) | Dedicated e2e play-through spec | In `visual.spec.js`'s story list |
|---|---|---|---|
| `animal-sounds` | 2026-06-07 | Yes (`animal-sounds.spec.js`) | Yes |
| `color-match` | 2026-06-21 | Yes (`color-match.spec.js`) | Yes |
| `character-match` | 2026-07-04 | Yes (`character-match.spec.js`) | Yes |
| `fruit-veggie-id` | 2026-07-14 | **No** | Yes |
| `character-match-bluey` | 2026-07-17 | **No** | **No** |
| `animal-memory-match` | 2026-07-10 | Yes (`animal-memory-match.spec.js`) | Yes |
| `sound-memory-match` | 2026-07-28 | Yes (`sound-memory-match.spec.js`) | Yes |
| `emotions-match` | 2026-08-04 | **No** | **No** |
| `number-tap` | 2026-08-04 | **No** | **No** |

`e2e/visual.spec.js` is **not** an auto-discovery mechanism — it's a hardcoded 51-entry `stories` array (lines 3-56). Every game's `.stories.jsx` exists (confirmed all 9 present under `src/games/*/`.stories.jsx`), but only 6 of 9 game IDs appear in that array. `fruit-veggie-id` is in the array but has no golden-path spec; the other three (`character-match-bluey`, `emotions-match`, `number-tap`) are in neither place. This means those three games ship with **zero automated browser-level verification** — no play-through, no visual baseline, no page-level axe scan (page-level a11y is folded into the same specs that don't exist for these games).

This is consistent with a "forgot to wire up the new game" pattern rather than a deliberate exclusion: `visual.spec.js` and the 5 existing golden-path specs were all last touched 2026-07-26/07-28, and `emotions-match`/`number-tap` were added 2026-08-04 — after the last time anyone touched the e2e list. `character-match-bluey` (2026-07-17) predates that touch date and still got missed, so this isn't purely a "added after" story — the process for wiring a new game into e2e/visual regression isn't enforced anywhere (no lint rule, no test asserting "every game folder has a matching e2e spec" or "every `.stories.jsx` is in `visual.spec.js`'s array").

**Playwright browser/project matrix:** `playwright.config.js` defines exactly one project — `chromium` (Desktop Chrome). No Firefox, WebKit/Safari, or mobile-viewport project. For an app explicitly aimed at parents/kids on phones and tablets (per `README.md`/`CLAUDE.md`'s orientation-gate feature), the complete absence of a mobile emulation project in the E2E matrix is worth flagging — `zoom-large-text.spec.js` and `intro-results-height.spec.js` do assert against phone/tablet/desktop **viewport sizes** within the one Chromium project, which covers layout but not engine differences (WebKit is what real iOS Safari uses, not Chromium).

**A11y layers:** both levels described in TESTING.md are real and match what's in the code — every component/game test file calls `jest-axe`'s `axe(container)` (confirmed via the `.test.jsx` files read during this audit, e.g. `MemoryBoard.test.jsx`, `BadgeGallery.test.jsx`), and `@axe-core/playwright` scans appear across the e2e specs (`themes.spec.js`, `orientation-gate.spec.js`, `parental-lock.spec.js`, etc.). Because the 3 games above have no e2e spec, they also get no page-level axe scan — component-level `jest-axe` still covers them (their `.test.jsx` files exist and are substantial), so this is a page-layout/contrast blind spot specifically, not a total a11y blind spot.

**Visual regression:** the mechanism itself (Storybook + `toHaveScreenshot()` against committed baselines) is sound and the Dark/High-Contrast theme variants for the 4 called-out components (`Dashboard`, `AdminPage`, `GameChoiceGrid`, `GameResults`) are present in the snapshot directory as documented. The gap is purely the missing 3 games from the hardcoded list, as above.

---

## CI Integration

`.github/workflows/ci.yml` verified directly against `docs/TESTING.md`'s description — accurate in every detail checked:
- Triggers: `push`/`pull_request` to `main` only (both `ci.yml` and `security.yml`; the latter also runs on a weekly schedule for CodeQL).
- 9 jobs confirmed by name: `lint`, `lint-css`, `unit-tests`, `build`, `e2e`, `docker-build`, `npm-audit`, `trivy`, `lighthouse`.
- `unit-tests` runs `npm run coverage` and uploads `coverage/` as a build artifact — confirmed at `ci.yml:49-54`.
- All actions SHA-pinned with version comments (spot-checked `actions/checkout`, `actions/setup-node`, `github/codeql-action/*`).
- Workflow-level `permissions: contents: read`, with job-level overrides only where needed (`trivy`, `security.yml`'s `codeql`/`trivy-fs`) — confirmed.
- **`npm run mutation` (Stryker) is not run anywhere in CI** — matches TESTING.md's explicit statement that mutation testing is a manual developer diagnostic, not a CI gate. No inconsistency here.
- The two timeout-flaky tests found above (`useGameSession.test.js`, `playwrightConfig.test.js`) run inside the `unit-tests` job's `npm run coverage` step on `ubuntu-latest` — the same class of shared-runner CPU contention that TESTING.md documents already causing 3 separate e2e flakes (issues #141/#147/#165/#167) is a plausible, not-yet-triggered risk for this job too, since it isn't given the same single-worker treatment `e2e` got.

---

## Mutation Testing

`stryker.config.json` scope — **still accurate**: all 7 named files (`buildQueue.js`, `buildDeck.js`, `reinsertMissed.js`, `evaluatePersonalBest.js`, `evaluateMemoryPersonalBest.js`, `computeBadgeAwards.js`, `computeGameBadgeAwards.js`) exist under `src/utils/` and are exactly the pure, UI-less, high-test-count functions TESTING.md describes — confirmed each is a real file at 100% statement coverage in the coverage run. `computeItemWeight.js` and `weightedShuffle.js` (also pure utils with dedicated test files, `computeItemWeight.test.js`/`weightedShuffle.test.js`) exist alongside the mutated set but aren't included in `stryker.config.json`'s `mutate` array — worth a look at whether they were added after the scope was last reviewed and should be folded in, since they're the same shape of file (pure, high-value-per-test, used by the adaptive item selection feature this audit already flagged has a statistical unit test protecting it).

Mutation scores are **not tracked or enforced anywhere** — no CI job, no committed baseline/threshold file, nothing in `package.json` scripts beyond the raw `stryker run`. This matches TESTING.md's explicit framing of it as a diagnostic tool developers run locally, not a gate — consistent, not a gap, but worth noting for anyone assuming "we have mutation testing" implies it's continuously checked.

---

## What's Already Solid

- **The six-layer testing story is real, not aspirational.** Every layer named in `docs/TESTING.md` was independently verified to exist and do what's claimed — a level of documentation-to-reality fidelity that's rare.
- **Near-100% coverage on every hook, util, and game's actual logic**, with the "low" numbers in the raw report fully explained by intentionally-untested `.stories.jsx` files. This is easy to misread from the raw `vitest --coverage` table without checking file-by-file, and a less careful audit could have wrongly flagged 8 of 9 games as "50% covered."
- **Genuinely well-reasoned statistical tests**, not just coverage-chasing — `useGameSession.test.js`'s adaptive-weighting test computes and documents its own false-pass probability (<0.2%) rather than picking an arbitrary margin, which is a level of rigor most codebases don't bother with even when they do write probabilistic tests.
- **A real Docker-backed e2e layer** (`nginx-headers.spec.js`, `confetti-csp.spec.js`, `pwa-csp.spec.js`) that proves production nginx/CSP behavior no dev-server-based test could ever catch, with graceful `test.skip()` degradation when Docker isn't available — thoughtful design, not a shortcut.
- **CI configuration itself is under test** (`.github/__tests__/*.test.js`) — the workflow YAML's shape (permissions, SHA-pinning, gate flags, allowlist freshness) is asserted by unit tests, catching config drift a human reviewer could easily miss.
- **Zero `.only(`/skip-abuse anywhere in 111 unit test files and 24 e2e specs** — a real, positive signal about test-suite hygiene and review discipline over time.
- **Documented testing pitfalls are followed in practice**, not just written down — verified fake-timers/fireEvent, `aria-disabled`, and (mostly) mock-seam conventions hold up against the actual test code, not just the docs describing them.

---

## Recommendations (Prioritized)

1. **(High, low effort) Wire up e2e/visual coverage for `character-match-bluey`, `emotions-match`, and `number-tap`.** Each already has a `.stories.jsx` (add its story id to `visual.spec.js`'s array — near-zero effort) and each is structurally similar enough to `character-match`/`color-match` that a golden-path spec can likely be adapted from an existing one. `fruit-veggie-id` only needs the missing golden-path spec (it's already in the visual list).
2. **(Medium, low effort) Add a lightweight guard against this recurring.** A simple unit test (following the existing `fs.readFileSync`-based static-config-check pattern already used for `nginx.conf`/CI YAML) that asserts every `src/games/*/` folder with a `.stories.jsx` has a matching entry in `visual.spec.js`'s array would catch the next new game before it ships uncovered, rather than relying on someone remembering.
3. **(Medium, low effort) Close the storage-adapter contract gap** — port `getItemStats`/`saveItemStats` and the session-resume trio's adapter-agnostic round-trip/empty-state assertions into `runAdapterContractTests` (`src/storage/__tests__/adapterContract.js`), as already recommended in depth by `docs/audits/storage-database.md` § 6/8. Flagging again here because it's the one storage finding with direct testing-strategy relevance (an untested interface contract), not to duplicate that audit's analysis.
4. **(Medium, no code change) Investigate the two timeout-flaky tests** (`useGameSession.test.js:1190`, `__tests__/playwrightConfig.test.js:19`) before they ever fail a real PR — either raise their timeout budgets further or evaluate whether `unit-tests` needs CI-side isolation the way `e2e` already got for the identical underlying cause (shared-runner CPU contention).
5. **(Low, doc-only) Update `docs/TESTING.md`'s mock-seam bullet** to name the memory-match games' raw-`Audio`-mock exception alongside the existing `useSpeech` exception, so the documented rule matches actual, justified practice.
6. **(Low, low effort) Add a dedicated `App.jsx` test** targeting the auto-discovery glob wiring and orientation-gate route wrapping directly (currently only exercised incidentally, at 31.25% function coverage) rather than relying on other components' tests to cover it by accident.
7. **(Low, discussion) Consider whether a mobile/WebKit Playwright project is worth adding**, given the app's phone/tablet-first orientation-gate feature — the current matrix is Chromium-desktop only, with viewport-size (not engine) coverage for phone/tablet layouts.
8. **(Low, low effort) Fold `computeItemWeight.js`/`weightedShuffle.js` into Stryker's `mutate` scope** — same shape of pure, high-value util as the 7 files already there, currently outside the mutation-tested set.

---

## Other Areas Noticed (Not Testing, Cross-Cutting)

- `App.jsx`'s low function-coverage number (Coverage Gaps table) is really a test-design observation, but it also hints that the auto-discovery mechanism CLAUDE.md calls "the core mechanic" has no direct test proving `import.meta.glob('./games/*/manifest.json')` actually discovers a newly-added folder — everything currently proving that works is incidental (games render because their own tests mount them directly, not through `App`'s glob).
- `docs/audits/storage-database.md` (2026, same session context) already covers the storage adapter's write-error-handling, quota, and migration gaps in depth (Findings I-1, Q-1, M-1) — genuinely out of this audit's testing-strategy lens, but worth the user's attention alongside this report since the two audits' storage findings are complementary (that one covers "is the storage layer itself robust," this one covers "is the storage layer's *test* coverage robust").
- `docs/ENHANCEMENTS.md`'s AU-9 (`ResumePrompt` missing `useFocusOnMount()`) is an open, already-tracked a11y item, not a testing gap — noted only because it would be a natural one-line addition alongside whatever test file eventually gets the focus assertion the backlog entry proposes.
