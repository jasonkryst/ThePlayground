# Cross-Session Adaptive Item Selection — Design

**Issue:** GitHub #121 ("ENGINE - Cross Session Item Selection")
**Date:** 2026-07-24

## Summary

Today's spaced repetition (`spacedRepetitionEnabled`, v0.6.0) only re-asks a missed item later *within the same session* (`reinsertMissed.js`) — a child who consistently struggles with one item gets no reinforcement once that session ends. This change adds a new, independently-toggleable setting, `adaptiveItemSelectionEnabled`, that weights future sessions' queues toward items with a history of being missed, with a decay so old struggles fade and a cap so one hard item can never dominate a session.

This is purely an engine/quiz-game change — no UI beyond one new Admin toggle. Memory games are out of scope (no equivalent per-item miss concept exists there today).

## 1. Data model

New adapter methods, following the same per-game-keyed-map convention as `getBadgeData`/`getPersonalBests`:

```
getItemStats()      → Promise<{ [gameId]: { [itemId]: ItemStat } }>
saveItemStats(data) → Promise<void>

ItemStat = { missCount: number, lastMissedAt: number }  // epoch ms
```

New localStorage key: `playground_item_stats`. Same defensive `try/catch` → safe-empty-default pattern as every other `localStorageAdapter` getter.

**Tracking is unconditional; consumption is gated.** Every `finishGame()` call records misses into `ItemStat` regardless of whether `adaptiveItemSelectionEnabled` is on — cheap, and it means turning the setting on later immediately benefits from history that was already quietly accumulating. Only the *queue-building* step checks the setting before applying any weighting.

## 2. Weighting model

Rather than storing individual timestamped miss events (unbounded growth), each item keeps a single running `missCount` and the timestamp of its *most recent* miss. Decay is computed lazily, at read time, from that recency — recent activity fully counts, and the whole accumulated count fades together the longer it's been since the item was last missed:

```
DECAY_HALF_LIFE_DAYS = 14
MAX_EFFECTIVE_MISSES = 4
BOOST_PER_MISS = 0.5

daysSince        = (now - lastMissedAt) / 86_400_000
effectiveMisses  = min(missCount * 0.5 ** (daysSince / DECAY_HALF_LIFE_DAYS), MAX_EFFECTIVE_MISSES)
weight           = 1 + effectiveMisses * BOOST_PER_MISS   // range: 1x (never missed / fully decayed) to 3x (capped)
```

An item with no recorded stat gets `weight = 1` (identical to today's uniform behavior). The 3x cap directly answers the "don't let one hard item dominate every session" requirement.

**Trade-off, stated explicitly:** decaying the whole aggregate count by time-since-*last*-miss (rather than decaying each historical miss event independently) means a single fresh miss on an item with a large historical count will spike its effective weight back toward the cap, even if that history was sparse and spread over years. This reads as "this item has been a long-term recurring struggle" — a reasonable signal for a toddler app — and avoids storing or iterating an unbounded event log. If real usage shows this over-boosts long-dormant items, the fix is additive (event-level decay), not a rewrite.

## 3. Queue integration

`buildQueue(items, numChoices, questionsPerSession, itemWeights)` gains a 4th, optional parameter — a function `(item) => weight`. `buildCorrectSequence` (the internal helper) uses it like this:

- **`itemWeights` omitted or falsy** (every existing call site, and any session with the setting off): behavior is byte-for-byte identical to today — `shuffle(items)` per pass, unchanged. **Zero regression risk** to the current algorithm, including the Stryker-mutant-guarding comments already in `buildQueue.js`.
- **`itemWeights` provided:** each pass calls a new `weightedShuffle(items, itemWeights)` instead of `shuffle(items)`. Everything downstream (the anti-immediate-repeat swap at pass boundaries, the fill-until-quota loop) is unchanged — it doesn't care how a pass was ordered, only what order it's in.

**`weightedShuffle` (new util, `src/utils/weightedShuffle.js`):** Efraimidis–Spirakis weighted sampling —
```js
key(item) = Math.random() ** (1 / weightOf(item))
```
sorted descending. With all weights equal to 1, this reduces to a uniform random permutation (mathematically equivalent to Fisher–Yates, though it consumes `Math.random()` differently — which is exactly why the plain `shuffle` stays untouched and is only bypassed when real weight data is supplied).

**Why this respects the cap without extra bookkeeping:** the existing multi-pass structure already bounds how many times any item can appear in one session — at most `ceil(questionsPerSession / items.length)` (unchanged by this feature). Weighting only affects *which* items win a spot when a pass gets truncated (the common case: item pools bigger than a session), or which pass-boundary an item preferentially lands in for small pools. It can never manufacture extra repeats within a session — so "one hard item dominating a session" is already structurally impossible, independent of the weight cap.

## 4. Hook and wiring

New hook `src/hooks/useItemStats.js`, matching `usePersonalBest`'s shape:

```js
const { itemStats, recordMisses } = useItemStats(gameId)
// itemStats: { [itemId]: ItemStat } for this game
// recordMisses(missedItemIds): increments missCount + sets lastMissedAt = now, persists
```

In `useGameSession.js`:
- `finishGame()` calls `recordMisses(missedRef.current.map(m => m.id))` alongside its existing `addScore`/`recordPersonalBestSession`/`awardSession` calls.
- The queue-build effect (and `restart()`) construct a weight function only when `adaptiveItemSelectionEnabled` is true: `item => computeItemWeight(itemStatsRef.current, item.id)` (a `itemStatsRef` mirrors the hook's `itemStats` state so the queue-build effect's dependency array — `[numChoices, questionsPerSession, items]` — doesn't need to change and doesn't risk rebuilding an in-progress queue when stats update after a session ends).
- **Known edge case:** on a session's very first mount in a fresh browser tab, `itemStats` may not have finished loading from storage yet when the initial queue builds. That one session degrades gracefully to uniform weighting (identical to the setting being off) rather than blocking game start on a storage read — consistent with the app never gating session start on anything but `settings.loaded` today.

## 5. Settings & Admin

New setting in `DEFAULT_SETTINGS` (`src/storage/adapter.js`): `adaptiveItemSelectionEnabled: false`, documented in the adapter's JSDoc alongside `spacedRepetitionEnabled`, explicitly noting the two are independent (same-session reinsertion vs. cross-session weighting) and either can be on without the other.

New toggle in `AdminPage.jsx`, placed next to the existing `spacedRepetitionEnabled` control, with new i18n strings (`en.json`) describing the cross-session behavior in parent-facing language (e.g., "Give extra practice on items your child has struggled with in past sessions").

## 6. Testing plan

*Positive + negative per file, per this repo's testing convention:*

- **`src/utils/__tests__/weightedShuffle.test.js`** (new) — equal weights → distribution statistically close to uniform over many trials (positive); one dominant weight still produces some variety across trials, never 100% one item (negative, confirms no runaway bias).
- **`src/utils/__tests__/computeItemWeight.test.js`** (new, wherever the pure weight function lives) — no stat for an item → weight is exactly 1 (negative/baseline); recent miss → weight > 1 (positive); a miss far past the half-life → weight has decayed back near 1 (negative); many misses → weight never exceeds the 3x cap (negative/bound check).
- **`src/utils/__tests__/buildQueue.test.js`** (extend existing) — no `itemWeights` arg → output identical to current behavior, existing tests unmodified and passing (negative/regression guard); with weights supplied → higher-weighted items appear more often across many simulated sessions, but never exceed the existing per-session occurrence ceiling (positive).
- **`src/hooks/__tests__/useItemStats.test.js`** (new, storage mocked per repo convention) — records a miss and persists it (positive); called with an empty missed list is a no-op, no write (negative); corrupted/missing storage → empty stats, no throw (negative).
- **`src/hooks/__tests__/useGameSession.adaptiveSelection.test.js`** (new) — setting on → `buildQueue` is invoked with a weight function derived from stats (positive); setting off → invoked with no weight function, independent of `spacedRepetitionEnabled`'s own state (negative, proves independence in both directions).
- **`src/admin/__tests__/AdminPage.test.jsx`** (extend) — toggle renders and defaults off (positive); toggling it persists only `adaptiveItemSelectionEnabled` and leaves other settings untouched (negative).
- **`src/storage/__tests__/localStorageAdapter.itemStats.test.js`** (new) — round-trips stats (positive); corrupted JSON → empty object, no throw (negative).

## 7. Docs to update

- `CHANGELOG.md` — new `### Added` entry under the next version.
- `docs/ENHANCEMENTS.md` — remove the "Cross-session adaptive item selection" bullet from Game Features.
- `README.md` — settings reference gains `adaptiveItemSelectionEnabled`.
- `src/storage/adapter.js` — JSDoc for the new setting and the new adapter methods.
- `package.json` — version bump.
