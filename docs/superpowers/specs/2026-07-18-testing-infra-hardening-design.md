# Testing Infrastructure Hardening — Design

**Issue:** GitHub #89 ("TESTING - Code")
**Date:** 2026-07-18

## Summary

Three independent testing-infrastructure improvements pulled from the `docs/ENHANCEMENTS.md` backlog:

1. Tighten the Playwright visual suite's `maxDiffPixelRatio` (currently `0.1`) so it can catch missing-stylesheet-class regressions, without reintroducing the flakiness that led to `0.1` in the first place.
2. Add a storage-adapter contract test — one shared, adapter-agnostic suite that proves any adapter implementation honors the ten-method interface documented in `src/storage/adapter.js`.
3. Wire up mutation testing (Stryker) against the engine's pure-function utils (`buildQueue`, `buildDeck`, `reinsertMissed`, and the four badge/personal-best evaluators) to verify the existing high test counts on those files actually pin behavior.

All three are testing-only changes — no production/runtime code changes are expected, though mutation testing may reveal test gaps that require *new tests* (not production code changes) to close.

## 1. Visual regression: tighten `maxDiffPixelRatio`

**Current state:** `e2e/visual.spec.js:90` — `await expect(page).toHaveScreenshot(`${id}.png`, { maxDiffPixelRatio: 0.1 })`. The comment on that line already documents why: during issue #53, a fully unstyled `GameResults` screen passed within this tolerance against a styled baseline. The tolerance's looseness predates the repo's move off the network share (a filesystem known to cause rendering-timing flakiness), so it was never revisited.

**Approach:**
- Run `npx playwright test visual.spec.js` five times locally (same machine/disk this session runs on), capturing the actual diff ratio Playwright reports on each passing run.
- The highest observed ratio across those runs is the empirical noise floor. Set `maxDiffPixelRatio` to a value comfortably above that floor (small safety margin) but well below `0.1`.
- Update the inline comment to state the new value and that it was empirically derived from N local runs on this date, dropping the now-stale "predates the move off the network share" framing.
- If any run surfaces an actual baseline mismatch unrelated to jitter, treat it as a real regression to investigate — not something to tune the ratio around.

**Out of scope:** No changes to which stories are captured, no snapshot re-baselining unless a genuine mismatch is found.

## 2. Storage-adapter contract test

**Current state:** `src/storage/adapter.js` documents a ten-method interface (`getScores`/`addScore`, `getSettings`/`saveSettings`, `getBestStreaks`/`saveBestStreaks`, `getPersonalBests`/`savePersonalBests`, `getBadgeData`/`saveBadgeData`) via JSDoc only — there's no test that would catch a future adapter (e.g. a Supabase/Firebase adapter per `docs/ENHANCEMENTS.md` § Backend/Sync) silently deviating from it. `localStorageAdapter.js` is the only implementation today; its existing tests (`badges`, `bestStreaks`, `personalBests`, `security`, `timerMigration` — 403 lines total) are localStorage-specific (corrupt-JSON recovery, quota, `timerDisplayEnabled`→`timerMode` migration) and stay as-is.

**New files:**

- `src/storage/__tests__/adapterContract.js` — not itself a `*.test.js` (so Vitest won't try to run it standalone as an empty suite). Exports `runAdapterContractTests(adapterFactory, { label })`, a function that calls Vitest's `describe`/`it`/`beforeEach` to define the shared suite. `adapterFactory` is a zero-arg function returning the adapter instance (a factory rather than the adapter directly, so a future adapter needing per-test setup — e.g. an in-memory reset — can do it inside the factory).

  Assertions, per method pair, covering both positive (round-trip) and negative (empty/default state) cases:
  - `getScores`/`addScore`: empty array before any score; `addScore` then `getScores` reflects exactly what was added, in append order; adding a second score doesn't drop the first; the stored object's fields pass through unmodified (no stripping/coercion of extra or documented-optional fields like `peakStreak`, `timings`).
  - `getSettings`/`saveSettings`: fresh adapter returns exactly `DEFAULT_SETTINGS`; saving a partial settings object and reading it back merges over defaults (documented `getSettings` merge behavior) rather than replacing wholesale — *this assertion is written against the documented interface contract, not `localStorageAdapter`'s specific migration logic*, so it only asserts the parts of the contract every adapter must uphold.
  - `getBestStreaks`/`saveBestStreaks`: empty object before any save; round-trip a `{ [gameId]: number }` map; saving doesn't affect unrelated storage keys (isolation from scores/settings).
  - `getPersonalBests`/`savePersonalBests`: empty object default; round-trip a per-game bests map; independent-key isolation (saving `gameA`'s bests doesn't touch `gameB`'s).
  - `getBadgeData`/`saveBadgeData`: default shape is exactly `{ awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} }` (all three keys present, not just an empty object); round-trip preserves all three top-level keys.

- `src/storage/__tests__/localStorageAdapter.contract.test.js` — thin file: imports `localStorageAdapter` and `runAdapterContractTests`, calls `runAdapterContractTests(() => localStorageAdapter, { label: 'localStorageAdapter' })`. A future adapter's own contract test file is a one-line call in the same shape.

**Test isolation note:** `localStorageAdapter` reads/writes real `localStorage` (via jsdom in tests). The contract suite's `beforeEach` clears `localStorage` so each `it` starts from the documented "nothing saved yet" state — matching the pattern already used in the existing `localStorageAdapter.*.test.js` files.

## 3. Mutation testing (Stryker)

**Target files** (the issue's "buildQueue, buildDeck, reinsertMissed, the badge/personal-best evaluators"):
- `src/utils/buildQueue.js`
- `src/utils/buildDeck.js`
- `src/utils/reinsertMissed.js`
- `src/utils/evaluatePersonalBest.js`
- `src/utils/evaluateMemoryPersonalBest.js`
- `src/utils/computeBadgeAwards.js`
- `src/utils/computeGameBadgeAwards.js`

**Setup:**
- Add `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` as devDependencies.
- `stryker.config.json` at repo root: `testRunner: "vitest"`, `mutate` scoped to exactly the 7 files above (not the whole `src/utils/` directory — other utils like `shuffle`-adjacent helpers or unrelated files aren't in scope per the issue), `reporters: ["html", "clear-text", "progress"]`.
- `package.json` script: `"mutation": "stryker run"`.
- No CI integration — the repo has no GitHub Actions workflow yet (confirmed: `.github/` doesn't exist), so this stays a local/manual developer command, matching how `npm run coverage` is manual today. Documented as a dev workflow step, not a gate.

**Execution:**
- Run `npm run mutation` to get a baseline mutation score per file.
- For every surviving mutant, either:
  - Add or strengthen a unit test in the corresponding `src/utils/__tests__/*.test.js` file so the mutant is killed, or
  - If a mutant is genuinely equivalent (behaviorally unobservable — e.g. some `Math.random()`-adjacent mutations in `shuffle`/`buildDeck`/`reinsertMissed` that don't change externally observable output distribution guarantees already covered by other tests), document why in a code comment near the relevant test and exclude it via Stryker's inline `// Stryker disable next-line` comment with a reason.
- Target: zero unexplained surviving mutants across the 7 files.

## 4. Documentation updates

- `docs/TESTING.md`: new **"Mutation testing"** section after Layer 6 (it's a diagnostic developer tool, not a pass/fail CI layer, so it doesn't get a 7th row in the six-layer table) — documents `npm run mutation`, what it covers, and how to interpret/handle a surviving mutant. Layer 1's bullet list gets a new bullet noting the adapter contract-test pattern (`adapterContract.js` + how a future adapter reuses it).
- `README.md` § Storage Adapter: one sentence noting the contract test as the enforced guarantee for a future backend swap, linking to `src/storage/__tests__/adapterContract.js`.
- `docs/ENHANCEMENTS.md`: remove the three completed bullets (visual tolerance, contract test, mutation testing) from the Testing section.
- `CHANGELOG.md` + `package.json`: version bump per repo convention (testing-only changes — patch bump).

## Testing plan for this work itself

- Visual: re-run `npm run e2e -- visual.spec.js` after the ratio change to confirm it's still green (no flakiness introduced).
- Contract test: run `npm test` — the new suite must pass against `localStorageAdapter`; also verify a deliberately broken fake adapter (e.g. one whose `getBadgeData` omits `lifetimeCounters`) fails the contract suite, to prove the suite actually asserts something (negative-case sanity check on the test infra itself, not shipped).
- Mutation testing: `npm run mutation` run to completion with the target score; re-run after test additions to confirm the score improved and survivors are gone/explained.
- Full regression: `npm run lint`, `npm test`, `npm run coverage`, `npm run e2e` all green before calling this done.

## Risks / open questions

- The empirical `maxDiffPixelRatio` value can't be predicted before running the suite locally — the spec commits to the *process*, not a specific number.
- Stryker mutation runs can be slow even scoped to 7 files (each mutant reruns the relevant test file); if a full run is impractically slow in this environment, fall back to Stryker's `--concurrency` tuning rather than reducing file scope.
