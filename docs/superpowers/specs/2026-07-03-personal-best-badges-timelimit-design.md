# Time Limit, Personal Best, and Milestone Badges

Date: 2026-07-03
Status: Approved

## Context

Three backlog items are implemented together as one release, following the v0.6.0 precedent of bundling several independent engine features into a single spec/phase:

- **Answer within N seconds** — `timeLimitMs`/`onTimeout` were wired as unused parameters in `useGameSession` during the v0.6.0 timer work (see `docs/superpowers/specs/2026-07-01-game-engine-core-design.md`) and never implemented. This phase implements them as a configurable per-question countdown, replacing the passive count-up timer as a mutually exclusive mode rather than an independent toggle.
- **Per-session personal best** — compares a session's accuracy and speed against stored records, using the `timings` data already saved with every score.
- **Milestone badges** — Xbox-Live-Achievements-style awards for streaks, perfect sessions, and lifetime questions answered, tracked per game and repeatable (the same badge can be earned again in a later session).

Both existing games (`AnimalSoundsGame`, `ColorMatchGame`) get all three features — there is no precedent in this repo for an engine feature living in only one game.

## Settings changes

`timerDisplayEnabled` (boolean) is **removed** and replaced by two new settings in `DEFAULT_SETTINGS`:

| Setting | Type / values | Default | Notes |
|---|---|---|---|
| `timerMode` | `'off' \| 'countUp' \| 'countdown'` | `'countUp'` | replaces `timerDisplayEnabled`; `'countUp'` preserves today's default-on stopwatch |
| `timeLimitSeconds` | `5 \| 10 \| 15 \| 20` | `10` | only enforced when `timerMode === 'countdown'` |
| `speedRecordMinAccuracy` | `70 \| 75 \| 80 \| 85 \| 90 \| 95 \| 100` | `70` | minimum session accuracy % required for a speed record to be eligible |

**Migration:** `localStorageAdapter.getSettings()` gets a one-time mapping so existing users don't silently change behavior: if a stored settings blob has no `timerMode` but does have `timerDisplayEnabled`, derive `timerMode` from it (`true` → `'countUp'`, `false` → `'off'`) before merging with defaults.

Admin "Timer" section becomes a single radio row with 6 options — **Off / Show timer / Answer within 5s / 10s / 15s / 20s** — each option writing both `timerMode` and (where applicable) `timeLimitSeconds` in one click. This is a UI-layer combination only; the two settings remain separate primitives in storage.

A new "Speed Record Threshold" admin section (radio row, 70/75/.../100) controls `speedRecordMinAccuracy`.

## Architecture

### Answer within N seconds

`useGameSession`'s external `timeLimitMs`/`onTimeout` parameters are **removed** (no caller ever passed them) in favor of deriving the limit internally from settings: `timeLimitMs = timerMode === 'countdown' ? timeLimitSeconds * 1000 : undefined`.

The existing per-question effect's timeout branch (`src/hooks/useGameSession.js:103-107`) is replaced with an internal handler that reuses the same "final miss" logic `handleChoice` already applies when `maxTries` is exhausted:
- Locks the question (`locked = true`)
- Appends `current.correct` to `missed`
- Resets `streak` to 0
- Records a timing entry: `{ questionIndex, itemId, correct: false, durationMs: timeLimitMs, attemptNumber: wrongAttempts + 1, timedOut: true }`
- Applies the same spaced-repetition reinsertion as any other final miss, if `spacedRepetitionEnabled`

This shared behavior is factored into one internal helper (e.g. `lockAsMissed()`) called from both the `maxTries`-exhausted branch in `handleChoice` and the new timeout handler, rather than duplicated.

Unlike a normal wrong-answer lock (which only auto-advances in `feedbackMode === 'immediate'`), a timeout **always** auto-advances after ~1.5s regardless of `feedbackMode` — waiting for a parent tap after time has already run out doesn't serve the feature's pacing purpose. A new `timedOut` boolean (reset each question) drives a "⏰ Time's up!" message shown for that 1.5s window before `advance()` fires.

`Timer` gains a `mode` prop: `'countUp'` (today's behavior, counting from 0) or `'countdown'` (counting down from `timeLimitSeconds * 1000`, clamped to ≥ 0).

### Per-session personal best

New adapter methods, mirroring `getBestStreaks()`/`saveBestStreaks()`:
```
getPersonalBests()            → Promise<{ [gameId]: { accuracy?: {...}, speedMs?: {...} } }>
savePersonalBests(bests)      → Promise<void>
```
Stored shape per game:
```
accuracy: { ratio: number, score: number, total: number, timestamp: number }
speedMs:  { avgMs: number, timestamp: number }
```

New hook `usePersonalBest(gameId)` (same shape as `useBestStreak`): loads the map on mount, exposes `{ personalBest, recordSession(sessionSummary) }`.

A pure function `evaluatePersonalBest({ score, total, avgCorrectDurationMs, minAccuracyPct, previous })` in `src/utils/` does the actual comparison (no storage/React dependency, fully unit-testable):
- **Accuracy record:** new if `score/total` exceeds the stored ratio (or no stored record exists).
- **Speed record:** eligible only if this session's `score/total >= minAccuracyPct/100`. `avgCorrectDurationMs` is the mean `durationMs` across this session's `timings` entries where `correct === true` (sessions with zero correct answers are never speed-eligible). New if lower than the stored `avgMs` (or no stored record exists).

Returns `{ accuracy: { isRecord, value, previous }, speed: { isRecord, value, previous }, updatedBests }`.

`finishGame()` in `useGameSession` calls `recordSession(...)` and `useGameSession` exposes `newAccuracyRecord`, `newSpeedRecord`, `bestAccuracy`, `bestSpeedMs` in its return value.

`GameResults` renders a banner per record broken this session:
```
🏆 New accuracy record! 9/10 (was 8/10)
⚡ New speed record! 2.1s avg (was 2.6s avg)
```
Both can show simultaneously; neither shows if no record was broken (including a game's very first session, which sets both records without a banner since there's no "previous" to beat — first-session bests are silently persisted, not announced).

### Milestone badges

Static catalog, `src/lib/badges.js`:

| id | category | tier | icon | repeatable |
|---|---|---|---|---|
| `hotStreak` | streak | 5 | 🔥 | yes |
| `onFire` | streak | 10 | ⚡ | yes |
| `unstoppable` | streak | 25 | 🌟 | yes |
| `perfectSession` | perfect | — | 🎯 | yes |
| `gettingStarted` | totalQuestions | 50 | 🌱 | no |
| `centuryClub` | totalQuestions | 100 | 💯 | no |
| `dedicatedPlayer` | totalQuestions | 500 | 🏆 | no |
| `grandMaster` | totalQuestions | 1000 | 👑 | no |

Each entry also carries `nameKey`/`descKey` i18n string keys.

New adapter methods:
```
getBadgeData()  → Promise<{ awards: { [gameId]: { [badgeId]: count } }, lifetimeQuestions: { [gameId]: number } }>
saveBadgeData(data) → Promise<void>
```
`lifetimeQuestions` starts at 0 for every game — **no backfill** from existing score history; only questions answered after this ships count toward the total-questions tiers.

A pure function `computeBadgeAwards({ peakStreak, isPerfect, prevLifetimeTotal, newLifetimeTotal })` in `src/utils/` returns the list of badge ids newly earned this session:
- **Streak:** every tier (`5`, `10`, `25`) where `peakStreak >= tier` is awarded — a single session can earn multiple streak tiers at once (e.g. a peak streak of 12 earns both `hotStreak` and `onFire`).
- **Perfect:** `perfectSession` awarded whenever `isPerfect` is true. No tiers; can be earned every session.
- **Total questions:** each tier where `prevLifetimeTotal < tier <= newLifetimeTotal` is awarded (crossed during this session). Since `lifetimeQuestions` only ever increases, each tier can only cross once — not repeatable in practice, matching the "no backfill" decision above.

New hook `useBadges()` — **not** scoped to a single `gameId`, since the AdminPage gallery needs every game's data at once (same reasoning as `useScores().getAllScores()` vs. per-game accessors). Loads the full `getBadgeData()` blob and exposes:
```
{ badgeData, awardSession(gameId, { peakStreak, isPerfect, questionsAnswered }) }
```
`awardSession` increments `lifetimeQuestions[gameId]` by `questionsAnswered`, computes newly-earned badges via `computeBadgeAwards`, increments each earned badge's count in `awards[gameId]`, persists via `saveBadgeData`, and returns the resolved catalog entries for the ones newly earned this call.

`useGameSession` calls `useBadges()` internally and calls `awardSession(gameId, { peakStreak: peakStreakRef.current, isPerfect: score === total, questionsAnswered: total })` in `finishGame()`, exposing `newBadges` (resolved catalog entries, possibly empty) in its return value.

`GameResults` renders one line per newly-earned badge: `🎉 New Badge! {icon} {name}`.

`AdminPage` gains a 4th tab, **Badges**, reading `useBadges()` directly (not through `useGameSession`) plus the existing `manifests` prop for game names. For each game, every catalog badge renders with its current count (`{icon} {name} ×{count}`) if `count > 0`, or a greyed/locked treatment if `count === 0`.

## Testing

Per `docs/TESTING.md`'s four layers, with positive and negative cases throughout:

- **Unit (Vitest):**
  - `evaluatePersonalBest`: first-ever session (no previous — sets both, announces neither), tied accuracy (not a record), speed record blocked by the accuracy gate, speed record exactly at the gate boundary, zero correct answers (no speed evaluation, no divide-by-zero).
  - `computeBadgeAwards`: single streak tier, multiple streak tiers in one session, perfect session combined with streak tiers, exact tier-boundary crossing for total-questions, crossing zero tiers, a session that doesn't cross any threshold.
  - `useGameSession.test.js` extended: timeout locks the question, records a `timedOut` timing entry, resets streak, respects spaced repetition, and **always** advances after the delay even when `feedbackMode === 'parent-tap'`; personal-best and badge wiring in `finishGame()` (mocked adapter).
  - `AdminPage.test.jsx` extended: new timer radio row (6 options, writes both settings), speed-threshold radio row, Badges tab rendering (locked vs. earned states, counts).
  - New `Timer.test.jsx` cases for countdown mode.
  - New `GameResults.test.jsx` cases for the personal-best banners and new-badge lines (present/absent, multiple-at-once).
- **Accessibility (jest-axe):** added to all new/changed component states — countdown timer, "Time's up!" message, record banners, badge tab (locked badges must not rely on color alone — pair greyscale with reduced opacity/a "locked" label).
- **E2E (Playwright):** a countdown-timeout auto-advance flow; an admin Badges-tab render/navigation check; extend the existing score-seeding e2e pattern if a badge-earned scenario needs deterministic setup.
- **Visual regression:** new Storybook stories for `Timer` (countdown), `GameResults` (with record banners and badge lines), and the AdminPage Badges tab, each with a committed baseline.

## Documentation updates

- `README.md` — Settings Reference table: remove "Timer display" row, add one "Timer" row listing all 6 options (Off, Show timer, Answer within 5/10/15/20s) matching the admin UI's single combined control, add "Speed record threshold" row; update the prose paragraph currently claiming "there is no time limit today."
- `CHANGELOG.md` — new `## [0.8.0]` entry documenting all three features and the new/removed settings.
- `docs/ENHANCEMENTS.md` — move these three items into a new `### v0.8.0` entry under "Recently Completed"; remove them from "Core Game Engine" and "Scoring & Progress".
- `package.json` — version bump `0.7.0` → `0.8.0`.
- Both game `manifest.json` files — version bump `1.3.0` → `1.4.0`.
