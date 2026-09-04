# Storage / Data Layer Audit — The Playground

**Date:** 2026-09-04
**Version audited:** 1.1.10
**Scope:** `src/storage/adapter.js`, `src/storage/localStorageAdapter.js`, `src/storage/index.js`, `src/storage/__tests__/*`, and every hook that reads/writes through the adapter (`useSettings`, `useScores`, `useBadges`, `useBestStreak`, `usePersonalBest`, `useItemStats`, session-resume call sites). Read-only investigation; no source files were modified.

---

## Executive Summary

The Playground's storage layer is a deliberately minimal `localStorage` wrapper behind a documented get/save interface (`src/storage/adapter.js`), with one concrete implementation (`localStorageAdapter.js`). For what it is — a client-only, single-device, single-writer key/value store for one family's data — it is well-built: every read path defensively parses and type-checks, corrupt data degrades to sane defaults instead of throwing, and the adapter boundary genuinely is swap-ready (`src/storage/index.js` is a one-line re-export). Direct test coverage of `localStorageAdapter.js` (including corrupt-JSON and shape-tampering cases) is good and spans all 15 methods across dedicated test files, not just the shared contract suite.

The two real risks are architectural, not implementation bugs:

1. **The shared, reusable contract suite (`adapterContract.js`) only enforces 5 of the 7 documented get/save pairs.** `getItemStats`/`saveItemStats` and the session-resume trio are tested today, but only in `localStorageAdapter`-specific test files that a future adapter (e.g. a Postgres-backed one) is not required to write or pass. A future adapter could satisfy the shared contract suite in CI while being silently broken for item-stats or session-resume — a real, quiet regression path.
2. **No cross-tab concurrency protection.** Three hooks (`useBadges`, `useBestStreak`, `useItemStats`) do read-modify-write against an in-memory ref that is only ever populated once on mount. Two tabs open at once (a very plausible pattern for a parent with the dashboard open on a phone and a tablet, or two browser tabs) will silently lose one tab's writes to badges/streaks/item-stats. The `useSettings` broadcast mechanism CLAUDE.md documents is same-tab-only (a module-level `Set`, not a `storage` event listener) and does not help here.

Neither is a functional bug today for the common case (one device, one tab) the app is designed for, and both are cheap to fix if the team decides they matter. Quota exhaustion is not a near-term practical risk at normal usage (see Quota & Growth). Privacy posture is strong and is a genuine asset, not just an absence of findings.

---

## 1. Schema/Contract Completeness

All 7 documented shapes/pairs, cross-checked against the JSDoc in `src/storage/adapter.js` (lines 32-109) and the implementation in `src/storage/localStorageAdapter.js`:

| Shape | JSDoc lines | Implemented | Faithful to contract? |
|---|---|---|---|
| Score / `getScores`+`addScore` | adapter.js:37-56 | `localStorageAdapter.js:12-25` | Yes — array default, append semantics, optional fields (`peakStreak`, `timings`, memory fields) pass through untouched since `addScore` never re-shapes the object, just pushes it verbatim. |
| Settings / `getSettings`+`saveSettings` | adapter.js:1-30, 57-78 | `localStorageAdapter.js:27-43` | Yes, plus one undocumented-in-JSDoc but real migration: `timerDisplayEnabled` → `timerMode` (lines 32-34). This migration logic is *not* mentioned in the adapter.js JSDoc at all — a minor doc/implementation drift (the JSDoc says `timerMode` "replaces the v0.6.0 boolean `timerDisplayEnabled`" but doesn't say the adapter itself performs the translation on read). Low severity, but worth a one-line JSDoc note since it's exactly the kind of migration a future adapter author needs to know to replicate. |
| Best streaks | adapter.js:79-81 | `localStorageAdapter.js:45-56` | Yes. |
| Personal bests | adapter.js:83-87 | `localStorageAdapter.js:58-69` | Yes — note the JSDoc's nested shape (`accuracy`, `speedMs`, `fewestFlips`, `fastestMs`) is entirely consumer-defined; the adapter itself is shape-agnostic (stores/returns whatever object it's given), which is correct per the documented contract but means the adapter provides zero validation of the inner shape. |
| Badge data | adapter.js:89-92 | `localStorageAdapter.js:71-87` | Yes, and slightly more defensive than the other getters — it validates each of the three top-level keys (`awards`, `lifetimeQuestions`, `lifetimeCounters`) independently rather than accepting-or-rejecting the whole object, so a corrupt `lifetimeCounters` doesn't blank out valid `awards`. This is the best-hardened getter in the file; the pattern isn't applied to the other multi-field-object getters (settings has the same opportunity but takes an all-or-nothing `stored`/`{}` approach — lower severity since `{...DEFAULT_SETTINGS, ...migrated}` already recovers per-key via spread, so settings is fine in practice). |
| Item stats | adapter.js:94-96 | `localStorageAdapter.js:89-100` | Yes, matches contract exactly. |
| Session resume | adapter.js:98-108 | `localStorageAdapter.js:102-117` | Yes, matches contract exactly, including `null` semantics for "nothing resumable." |

**Finding S-1 (Info):** `saveScores`-style bulk overwrite doesn't exist — only `addScore` (append-only). This is consistent with the documented contract (there is no `saveScores` in the JSDoc), just noting it because it matters for the growth/quota section: there is no code path, even hypothetically, for a parent or the app itself to prune old scores through the adapter interface today.

**Overall:** no drift found between documented contract and implementation. The contract is honored faithfully by the one existing adapter.

---

## 2. Data Integrity & Error Handling

Every `getX` function follows the same pattern: `JSON.parse(localStorage.getItem(KEY) || '<fallback literal>')` wrapped in `try { } catch { return <safe default> }`, with a post-parse type/shape guard (`typeof === 'object' && !Array.isArray`, or `Array.isArray` for scores) before trusting the parsed value.

Verified per function (`localStorageAdapter.js`):

- `getScores` (12-19): catches parse errors → `[]`; also guards against a parsed non-array (e.g. tampered to an object or `null`) → `[]`. Confirmed by `localStorageAdapter.security.test.js:29-56` (invalid JSON, `null`, object-instead-of-array, bare primitive).
- `getSettings` (27-39): catches parse errors → `{...DEFAULT_SETTINGS}`; guards non-object/array → `{}` before merge. Confirmed by `localStorageAdapter.contract.test.js:102-136`, including a case with wrong-typed *values* inside an otherwise-valid object (`numChoices: 'not-a-number'`) — the adapter doesn't validate value types, it just merges over defaults, so a corrupted-but-object-shaped settings blob can still hand a game component a non-numeric `numChoices`. Downstream consumers are not guaranteed to guard against that (out of scope of this audit's file list, but worth flagging — see Other Areas Noticed).
- `getBestStreaks`, `getPersonalBests`, `getItemStats`: identical pattern, each with dedicated corrupt-JSON/wrong-shape tests (`localStorageAdapter.bestStreaks.test.js`, `.personalBests.test.js`, `.itemStats.test.js`).
- `getBadgeData` (71-83): most defensive of the group — validates the outer object *and* independently validates each of its three nested keys, so a corrupted `awards` doesn't wipe a valid `lifetimeCounters`. Confirmed by `localStorageAdapter.badges.test.js`.
- `getSessionResume` (102-109): same pattern, returns `null` (not `{}`) on any failure — correct, since the JSDoc's return type is `SessionResumeState | null` and `null` is the documented "nothing to resume" sentinel.

**Finding I-1 (Low, mostly theoretical):** none of the `saveX` functions catch anything — `localStorage.setItem` is called bare (e.g. `addScore` line 24, `saveSettings` line 42, all others identically). A `setItem` call can throw synchronously for two real-world reasons: quota exceeded (`QuotaExceededError`, see Quota & Growth below) and privacy-mode storage restrictions (e.g. Safari private browsing historically threw on `setItem`, and some browsers throw when third-party storage is blocked in an embedded context). Since every `saveX` is `async` but the throw is synchronous inside the async function body, it surfaces as a rejected promise — none of the calling hooks (`useSettings.updateSetting`, `useBadges.awardSession`, `useItemStats.recordMisses`, etc.) `.catch()` these calls; they're `await`ed directly in an event-handler-triggered async function. A rejected promise from an unhandled `await` in an async function called without try/catch becomes an unhandled promise rejection — it will not crash the render (React isn't in the call stack when the rejection happens), but the write silently fails and the in-memory React state has already been optimistically updated (every hook does `setState`/`ref.current = next` *before* `await adapter.saveX(next)`), so the UI shows the new value while storage silently still holds the old one until next successful write. This is a real, if narrow, "phantom save" risk — see Quota & Growth for when it's most likely to trigger (badge/score writes near quota exhaustion).
  - *Recommendation:* wrap `setItem` calls in try/catch in `localStorageAdapter.js`'s save methods (or centralize via a shared `safeSetItem` helper) and either surface a user-visible "couldn't save" signal or at minimum log it, so a full-quota household doesn't lose data with zero indication anything went wrong.

**Finding I-2 (Info):** `addScore` (localStorageAdapter.js:21-25) does its own internal read (`getScores()`) before appending and writing. Since `getScores` already degrades corrupt data to `[]`, a corrupt scores blob is silently *replaced* by a fresh one-element array on the next `addScore` call — confirmed intentional by `localStorageAdapter.security.test.js:84-91` ("recovers from corrupt existing scores without throwing"). This is a reasonable and tested self-healing behavior, but it is a silent, unannounced data loss path: all prior score history under a corrupted key is discarded, not just the corrupted parts. Worth being aware of as a design tradeoff (favors availability over any chance of partial recovery), not a bug.

---

## 3. Quota & Growth

No code anywhere calls `navigator.storage.estimate()`, checks `localStorage` size, or prunes old records. Confirmed via search — no `quota`, `QuotaExceededError`, or size-check logic exists in `src/`.

**Growth estimate:**

- A quiz score record (`Score` shape, adapter.js:42-50) with the max `questionsPerSession` of 20 (`AdminPage.jsx:335`, options are `[5, 10, 15, 20]`) and a `timings` entry per question (`{questionIndex, itemId, correct, durationMs, attemptNumber, timedOut?}`, roughly 90-110 bytes each as JSON) comes to roughly **1.8-2.2 KB per session** at max settings; the default `questionsPerSession: 10` (adapter.js:9) gives roughly **1-1.2 KB per session**. Memory-game sessions are smaller (no `timings[]`, just `flipAttempts`/`mismatches`/`peakMatchStreak`/`durationMs`) — under 300 bytes each.
- `itemStats` and `badgeData`/`personalBests`/`bestStreaks` are bounded by *distinct items × games*, not by session count — they don't grow per-play, only their values change. These stay small (low KBs) indefinitely regardless of usage volume.
- `scores`, by contrast, is strictly append-only with no cap (Finding S-1) and is the only unboundedly-growing key.

At a plausible heavy-use pattern — one child, 5 quiz sessions/day at the default 10 questions — that's roughly **5-6 KB/day**, **35-40 KB/week**, **~150-170 KB/month**. Reaching even the conservative end of the typical per-origin quota (5 MB) at that rate takes **roughly 2.5-3 years of daily use**. Multiple siblings sharing one browser profile, or a family that cranks `questionsPerSession` to 20 and plays across many games per day, could plausibly cut that to something like 1-1.5 years — still not a near-term concern for the app's intended lifecycle, but not "never happens" either, especially since:
- There's no in-app visibility into current storage usage for a parent to notice a slow approach to the limit.
- The failure mode when it does happen is Finding I-1 above: a silent, uncaught `QuotaExceededError` on `addScore`/`saveBadgeData`/etc., not a graceful "history is full" message.

**Finding Q-1 (Medium, long-horizon):** unbounded `scores` growth with no pruning, no quota check, and no error handling on write means the eventual failure mode (however distant) is silent data loss on whichever write happens to land after the quota is exhausted — which, because `getScores`/`addScore` re-read-then-rewrite the *entire* array on every single score (localStorageAdapter.js:22-24), means a near-quota scores key makes **every future write of any key** (not just scores) more likely to fail, since `setItem` failure is about total per-origin usage, not the specific key being written. A large `playground_scores` blob squeezes the budget available for badges/settings/session-resume too.
  - *Recommendation:* not urgent given the multi-year horizon, but cheap groundwork: (a) handle `QuotaExceededError` on save (ties into I-1), (b) consider a soft cap or periodic-archival strategy for `scores` (e.g. keep last N per game, or prompt for CSV export — which already exists per `docs/DEPLOYMENT.md:259` — when approaching a size threshold), (c) surface `navigator.storage.estimate()` in the Parent Dashboard as an informational "storage used" indicator, which also doubles as an early warning before any future networked adapter needs a migration cutover.

---

## 4. Migration/Versioning

**Finding M-1 (Medium):** there is no schema-version field anywhere in the stored data (confirmed by search — no `schemaVersion`/`STORAGE_VERSION`/similar key in any stored object) and no generic migration mechanism. The only precedent for a shape change across versions is a single hand-rolled, field-presence-based migration inline in `getSettings` (`localStorageAdapter.js:31-34`):

```js
const migrated = { ...stored }
if (migrated.timerMode === undefined && migrated.timerDisplayEnabled !== undefined) {
  migrated.timerMode = migrated.timerDisplayEnabled ? 'countUp' : 'off'
}
```

This works for the one case it was written for (boolean → enum rename), but it establishes no reusable pattern: each future settings shape change would need its own bespoke `if (fieldX === undefined && oldFieldY !== undefined)` block, and there is nothing analogous for `scores`, `badgeData`, `personalBests`, `itemStats`, or `sessionResume` — those five shapes have **zero migration provision** today. If a future release adds a required field to the `Score` shape (the JSDoc explicitly anticipates this pattern — most Score fields are already marked "added vN.M.0" with "older records omit it" language, e.g. adapter.js:48-50), old records are read as-is with the new field simply `undefined`; every consumer of `timings[].itemId`/`attemptNumber`/`timedOut` has to already tolerate `undefined` per the JSDoc's own callouts, which is a workable *ad hoc* convention (optional-field-shaped forward compatibility) but relies on every future consumer remembering to code defensively rather than any adapter-level guarantee.

**Rollback case (old code reading new-shape data):** equally unaddressed. If a user rolls back the app (or, in this SPA's deployment model, if a stale service-worker/cache serves old JS against already-upgraded `localStorage` data — see `docs/DEPLOYMENT.md`'s PWA/service-worker mention in SECURITY.md's audit history), old `getSettings`/`getBadgeData`/etc. code will happily merge unknown newer fields through (object spread preserves unknown keys) and simply ignore them — not a crash, but silent feature/data invisibility, and if the old code's *save* path writes the merged object back, any newer field it doesn't understand semantically could be corrupted-through-passthrough (e.g. if a new field's valid values are constrained and old code lets a stale UI write an invalid value that satisfies "field exists" but not the new validation the newer code expects).

  - *Recommendation:* this is genuinely low-urgency for a solo/family-run static SPA with no forced-upgrade pressure, but if a networked adapter is ever added (see Section 9), a real `schemaVersion` field per stored shape (or one global version key) becomes close to mandatory — retrofitting it now, even as a no-op field that every current shape carries but nothing yet branches on, would make that future migration additive rather than a rewrite. Cheap to add today at near-zero cost; expensive to retrofit once real user data exists at scale across many households.

---

## 5. Concurrency

**Finding C-1 (Medium-High for the specific multi-tab scenario; Low overall likelihood):** `localStorage` is synchronous and shared across all same-origin tabs/windows, but nothing in this codebase listens for the native `storage` event (confirmed — no `addEventListener('storage', ...)` anywhere in `src/`). The cross-instance sync CLAUDE.md documents (`updateSetting`/`resetSettings` broadcasting to a module-level listener `Set` in `src/hooks/useSettings.js:5-9,25-30,37,45`) is an **in-memory, same-JS-realm mechanism only** — it keeps every `useSettings()` instance *within one tab* synchronized (e.g. Admin and a permanently-mounted `LocaleSync`), but a second tab has its own separate JS realm with its own separate module-level `listeners` Set and its own separate `settingsRef`. It does not, and cannot, know about writes from another tab. This scoping is correctly described by CLAUDE.md ("Every mounted `useSettings()` instance stays synchronized with every other **during a session**") — the sync is real but its blast radius is smaller than "cross-instance" might suggest to a casual reader; it's cross-*component*, not cross-*tab*.

Three hooks do read-modify-write against a ref that is populated **once**, on mount, and never refreshed from storage again except by that hook's own writes:

- `useBadges.js:13-19` (initial load) + `21-59` (`awardSession`): reads `dataRef.current` (last known in-memory state), computes `nextData`, writes it. If tab A and tab B both mount `useBadges()` around the same time, both `dataRef.current` start from the same on-disk snapshot; if both tabs then award a badge in the same session window, the second tab's `saveBadgeData` (line 55) overwrites the first tab's write in full — the first tab's badge award is lost from storage (though that tab's own UI still shows it "earned," a lie by omission until that tab is reloaded and re-reads a badge history that no longer contains its award).
- `useBestStreak.js:8-13` (load) + `15-22` (`recordStreak`): same pattern — `streaksRef.current` is stale after the initial mount; two tabs recording streaks for different games in the same window can clobber each other's `bestStreaks` map (whichever tab's write lands second wins, and the map is a full-object overwrite, not a per-key merge, at the `setItem` level — the in-memory merge in JS is per-key-safe but that safety doesn't survive being raced against another tab's independently-computed full-object write).
- `useItemStats.js:8-13` (load) + `15-30` (`recordMisses`): identical pattern and identical risk for `itemStats`.

`useScores.js`'s `addScore` path is comparatively safer against the *append-uniqueness* concern (each score is its own record, so no "two tabs increment the same counter" collision), but `addScore` (localStorageAdapter.js:21-25) is itself a non-atomic read-then-write against the *entire* array: two tabs finishing a game at nearly the same moment can both `getScores()` before either `setItem`s, and the second `setItem` overwrites the first — **one of the two sessions' score records is silently lost**, not merged. This is the closest thing to a real, practically-reachable race in the app (unlike badges/streaks/item-stats, which require deliberately having the *same* game open in two tabs at once, finishing two *different* games in two tabs around the same time is a far more mundane multi-tab pattern — e.g. a parent letting two kids play simultaneously on the same device in two browser tabs, or a curious toddler on a tablet with picture-in-picture/split-screen).

  - *Recommendation:* Given the app's stated design intent (single-child, single-tab-at-a-time use is the primary use case; SECURITY.md frames this as "typically run by one family," device-level trust boundary), this is a real but low-priority gap. If it's worth closing: (a) the cheap fix is a native `storage` event listener that re-syncs each hook's ref/state on any cross-tab write to its key, closing the "stale-ref clobber" pattern for badges/streaks/item-stats; (b) `addScore`'s array-append race is architecturally harder to fully close with `localStorage` alone (no atomic read-modify-write primitive), though a `storage`-event-triggered re-read-before-write narrows the window significantly. Document this as a known limitation either way if not fixed, since CLAUDE.md's current phrasing about the broadcast mechanism could be read by a future contributor as stronger than it is.

---

## 6. Contract Test Gap Analysis

`src/storage/__tests__/adapterContract.js` exports `runAdapterContractTests(adapterFactory, { label })`, meant to be reused by any adapter's own test file (its header comment says exactly this: "Call this from a thin per-adapter test file"). Function-by-function coverage **inside that shared, reusable suite**:

| Method pair | Covered by `adapterContract.js`? | Line range |
|---|---|---|
| `getScores` / `addScore` | Yes | 18-45 |
| `getSettings` / `saveSettings` | Yes | 47-59 |
| `getBestStreaks` / `saveBestStreaks` | Yes | 61-75 |
| `getPersonalBests` / `savePersonalBests` | Yes | 77-93 |
| `getBadgeData` / `saveBadgeData` | Yes | 95-109 |
| `getItemStats` / `saveItemStats` | **No** | — not present |
| `getSessionResume` / `saveSessionResume` / `clearSessionResume` | **No** | — not present |

This exactly matches what CLAUDE.md states. **However**, `localStorageAdapter` itself is *not* untested for these two pairs — `src/storage/__tests__/localStorageAdapter.itemStats.test.js` and `localStorageAdapter.sessionResume.test.js` each independently cover round-trip behavior and corrupt-JSON/wrong-shape recovery, directly against the concrete adapter (not through the shared suite). So today, for the *one adapter that exists*, there is no coverage gap in practice — every method is tested somewhere.

**The actual risk (Finding T-1, Medium):** those two test files import `localStorageAdapter` directly (`localStorageAdapter.itemStats.test.js:2`, `localStorageAdapter.sessionResume.test.js:2`) rather than being written against an injected `adapterFactory` the way `runAdapterContractTests` is. A future second adapter (per `docs/DEPLOYMENT.md:260`, "implement the storage adapter's 15 methods against your backend and change one export") would:
1. Be required by nothing to write equivalent tests for `getItemStats`/`saveItemStats`/session-resume — `runAdapterContractTests` would pass with those five pairs implemented correctly and the other two pairs entirely absent, throwing, or silently wrong (e.g. returning `undefined` instead of `{}`, or not honoring `clearSessionResume`'s "remove, don't just null out" semantics).
2. Have genuinely no template to follow — the existing itemStats/sessionResume tests are adapter-specific fixtures (hand-rolled `makeLocalStorage()` stand-ins), not portable assertions against the interface contract the way the shared suite's assertions are (`adapter.getX()`/`adapter.saveX()` calls with no `localStorage`-specific assumptions baked in).

So: **yes, an adapter could satisfy the full shared contract-test suite today while being subtly or completely broken for item-stats and session-resume, and this would regress silently** — CI would stay green, and the break would only surface at runtime, for adaptive item selection (a background feature with no immediate user-visible failure — it just silently stops weighting toward previously-missed items) and session-resume (which would surface as "resume this session?" prompts that silently never appear, or worse, resume prompts built from `undefined`/malformed state if the new adapter's `getSessionResume` doesn't validate shape the way `localStorageAdapter.js:105` does).

  - *Recommendation:* port `localStorageAdapter.itemStats.test.js`'s and `.sessionResume.test.js`'s round-trip assertions (the adapter-agnostic ones — corrupt-JSON recovery is inherently `localStorage`-specific and correctly stays out of the shared suite per that file's own header comment) into `runAdapterContractTests`, matching the existing five pairs' style. This is a small, mechanical addition (the round-trip and empty-state assertions in both files map almost 1:1 onto the existing suite's patterns) and would close the gap CLAUDE.md already flags as known.

---

## 7. Privacy Assessment

This is a genuine strength, not merely an absence of findings, and is worth stating plainly: **all of this data — a young child's game scores, per-question response times, per-item miss patterns, and an optional first name — never leaves the device it's played on, by design and by construction.**

Verified against `SECURITY.md`'s Data Inventory (lines 26-41) and cross-checked against the actual storage code:
- Every stored key (`playground_scores`, `_settings`, `_best_streaks`, `_personal_bests`, `_badges`, `_item_stats`, `_session_resume`) lives only in browser `localStorage` on the playing device — there is no network call anywhere in the storage layer (`localStorageAdapter.js` imports nothing but `./adapter`; no `fetch`/`XMLHttpRequest` in the file).
- The one opt-in exception, Google Analytics (`gaId` setting), is off by default, sends only route paths on navigation (no names, scores, or settings — SECURITY.md:45), and is sanitized against injection (`sanitizeGaId`, `src/App.jsx:42`, strips to `[A-Za-z0-9_-]`) before being used in a script URL.
- The only PII is a parent-entered, optional first name (`childName` setting), used purely for on-device display personalization — never transmitted, never required.
- Compared to any plausible cloud-backed alternative (an account system, a hosted database, a sync service), this architecture has categorically less exposure: no account-takeover surface, no server-side breach surface, no third-party data processor, no cross-household data mixing, no retention policy to get wrong. The tradeoff (no backup except manual CSV export, no multi-device sync, data tied to one browser profile) is the explicit, documented cost of that posture (`docs/DEPLOYMENT.md:259`) — a reasonable one for the app's stated audience and threat model.
- This "no findings" security posture was itself independently re-verified as recently as 2026-08-31 (SECURITY.md:9) with the storage-adjacent surfaces (session-resume, item-stats) explicitly named as reviewed and clean.

No privacy findings. This section is included per the audit brief specifically to record that local-only storage is a deliberate asset here, not an accident of scope.

---

## 8. Future-Networked-Adapter Considerations

Per the audit brief, this section flags adapter-contract properties relevant to a *possible future* networked/Postgres-backed adapter, without designing that system.

- **No IDs on any record.** `Score` objects (adapter.js:42) have no primary key — `addScore` just pushes onto an array (localStorageAdapter.js:21-25) and identity is implicitly positional/by-`timestamp`. A networked store needs a stable, client-generated ID (e.g. UUID) per score/badge-award/etc. to support idempotent writes, conflict detection, and delete/update — retrofitting IDs onto years of already-written local records (no ID today) would need a one-time backfill migration.
- **No `updatedAt`/version/vector-clock on the mutable aggregate shapes** (`settings`, `bestStreaks`, `personalBests`, `badgeData`, `itemStats`) — each is a single JSON blob overwritten wholesale on every save (e.g. `saveBadgeData`, localStorageAdapter.js:85-87). A networked adapter doing last-write-wins sync against these shapes has no way to detect "this device's copy is stale relative to the server" short of comparing entire blobs; a per-field or per-record timestamp (already informally present inside some nested shapes, e.g. `personalBests`' `{ ..., timestamp }` entries per adapter.js:84-86, and `itemStats`' `lastMissedAt` per adapter.js:95) is inconsistently applied across shapes, not a general convention.
- **No soft-delete / tombstone concept anywhere.** `clearSessionResume` (localStorageAdapter.js:115-117) is a hard `removeItem` — fine for a single-writer local store (there's nothing to reconcile against), but a networked multi-device model needs deletes to propagate as a tombstone, not a silent absence, or a device that was offline during the delete will resurrect the deleted record on next sync.
- **`addScore`'s whole-array-rewrite pattern won't scale to a networked adapter's natural per-record model.** The *contract* (`addScore(score) → Promise<void>`, appending semantics) is actually fine and maps cleanly to a networked "insert one row" call — it's specifically the *local* implementation's "read entire array, push, write entire array" approach that's local-storage-specific and wouldn't be replicated in a networked adapter (which is as intended — nothing to fix in the contract itself here, just confirming the interface, unlike the implementation, already generalizes).
- **The aggregate shapes (`badgeData`, `bestStreaks`, `personalBests`, `itemStats`) all assume a single writer merging in-memory before a full-object save** (see Concurrency, Section 5) — this is the property most directly in tension with a future networked/multi-device adapter, since multi-device sync is exactly the scenario where two independent writers computing two independent "next full state" objects and last-write-wins-overwriting each other stops being a rare same-device multi-tab edge case and becomes the *normal*, expected case (a parent's phone and the family tablet both recording play). These shapes would need either a genuinely mergeable representation (e.g. per-counter increments sent as deltas rather than pre-merged blobs) or per-record storage (e.g. `badgeAwards` as a list of `{gameId, badgeId, timestamp, deviceId}` events rather than a `{ [gameId]: { [badgeId]: count } }` aggregate) before multi-device sync could be correct rather than "usually fine, occasionally clobbers a badge."
- **`sessionResume`'s "single global slot, not per-game" design** (adapter.js:108) is explicitly single-device/single-active-session shaped; a networked model where the same child could resume a session from a different device would need this scoped by device or made resumable-from-any-device, which is a product decision as much as a storage one — flagging only because the current contract's "only one game is ever actively played at a time" assumption is baked into the shape, not incidental.

None of the above is a defect in the current contract for its current purpose — they're exactly the kind of "this shape assumed single local writer" properties the audit brief asked to have surfaced ahead of any future networked-adapter design work.

---

## What's Already Solid

- **Every `getX` function is defensively coded**: try/catch around `JSON.parse`, post-parse shape/type validation, and a sane documented default on any failure — no bad read anywhere crashes the app. This is well above what a minimal implementation would bother with, and it's backed by real corrupt-data test coverage (`localStorageAdapter.security.test.js`, plus per-shape corrupt-JSON tests in `badges`/`bestStreaks`/`personalBests`/`itemStats`/`sessionResume` test files).
- **The adapter boundary is real, not aspirational.** `src/storage/index.js` is a genuine one-line swap point, and every consumer in the codebase goes through `src/hooks/*` → `adapter` rather than touching `localStorage` directly (confirmed by search — the only files calling `localStorage.*` directly are `localStorageAdapter.js` itself and test fixtures).
- **`getBadgeData`'s per-key validation** (independently checking `awards`/`lifetimeQuestions`/`lifetimeCounters`) is a genuinely better pattern than "valid whole object or nothing," and could be a model for hardening the other multi-field getters if that's ever deemed worth the small added complexity.
- **Documentation quality is high**: `adapter.js`'s JSDoc is unusually thorough for a project this size — it tracks *when* each field was added (down to the app version), calls out which older records omit which fields, and documents nested shapes in full. This materially reduces the risk profile of the "no formal schema-version" gap (Finding M-1), since the convention of documenting field provenance in prose is already half of what a version field would buy.
- **Privacy-by-architecture** (Section 7) is a real, verifiable asset — not merely untested absence of a network call, but confirmed by code inspection (no `fetch`/`XHR` in the storage layer) and independently corroborated by SECURITY.md's own recent audits.
- **Corrupt-data self-healing is tested, not just hoped-for** — `localStorageAdapter.security.test.js:84-91` explicitly verifies that a corrupted `scores` key recovers cleanly on the next write rather than getting stuck failing forever.

---

## Recommendations (Prioritized)

1. **(Medium, low effort) Close the contract-test gap** — add `getItemStats`/`saveItemStats` and the session-resume trio to `runAdapterContractTests` in `src/storage/__tests__/adapterContract.js`, mirroring the existing five pairs' style. This is the single highest-leverage fix: it converts a documented-but-silent gap into an enforced one before any second adapter is ever written. *(Section 6)*
2. **(Medium, low effort) Handle write failures.** Wrap `localStorage.setItem` calls in `localStorageAdapter.js`'s save methods in try/catch, and give calling hooks a way to know a save failed (return value, thrown+caught-by-caller, or a lightweight event) rather than optimistically updating UI state with no way to detect the persisted copy didn't take. *(Section 2, Finding I-1)*
3. **(Medium, low effort, only if multi-tab/multi-device use is a real pattern for this app's users) Add a `storage`-event listener** to at least `useBadges`, `useBestStreak`, and `useItemStats` (and ideally `useScores`) so a second tab's writes aren't silently clobbered by a stale in-memory ref. Document the current same-tab-only scope of the existing broadcast mechanism in CLAUDE.md if this isn't fixed, since the current phrasing could be read as broader than it is. *(Section 5)*
4. **(Low, low effort, cheap-now/expensive-later) Add a `schemaVersion` field** (per-shape or global) even before any concrete migration need exists — near-zero cost today, meaningfully reduces the cost of the first real cross-version migration or of a future networked adapter's sync design. *(Section 4)*
5. **(Low, long horizon) Add storage-usage visibility and/or a pruning strategy for `scores`** — e.g. a `navigator.storage.estimate()`-based indicator in the Parent Dashboard, and/or a soft cap with an export-then-trim prompt. Not urgent at current growth rates (multi-year horizon), but the failure mode when it does happen is currently silent (ties into #2). *(Section 3)*
6. **(Info) One-line JSDoc note** in `adapter.js` documenting that `getSettings`'s `timerDisplayEnabled` → `timerMode` translation happens *inside the adapter*, not just that the setting was renamed — useful for whoever writes the second adapter. *(Section 1)*

---

## Other Areas Noticed (Cross-Cutting, Outside Pure Storage)

- **Downstream type-safety of settings values**: `getSettings` merges stored values over defaults without validating value *types* (confirmed by `localStorageAdapter.contract.test.js:128-136`, which explicitly tests and accepts `numChoices: 'not-a-number'`). Whether every consumer of `settings.numChoices` etc. tolerates a non-numeric value gracefully wasn't verified as part of this storage-scoped audit — worth a targeted check if a corrupted/tampered settings blob is a realistic concern (e.g. a curious child directly editing devtools storage).
- **No in-app storage-usage indicator** anywhere in the Parent Dashboard today — noted in Section 3/Recommendation 5, but flagging again since it's a UX gap as much as a storage one (a parent has no way to know backup-via-CSV is getting more urgent as history grows).
- **PWA/service-worker caching** was mentioned in `SECURITY.md`'s audit history (2026-08-31 entry, line 9) as a reviewed surface alongside session-resume and item-stats — this audit didn't re-examine the service-worker's interaction with `localStorage` versioning (e.g. whether a stale cached JS bundle could run against newer-shape stored data after a deploy), since that's a build/deployment concern rather than a storage-adapter one, but it's adjacent enough to the Migration/Versioning findings (Section 4) to flag for whoever owns that surface.
