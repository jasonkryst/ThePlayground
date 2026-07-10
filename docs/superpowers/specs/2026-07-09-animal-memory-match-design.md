# Animal Memory Match — Design

**Date:** 2026-07-09
**Issue:** #37 — GAME - Animal Memory Match
**Status:** Approved

## Summary

A new game — Animal Memory Match — and, more importantly, a new *game type* in the engine.
Face-down tiles hide animal pairs; the child flips two at a time. A match keeps the tiles
revealed with a confetti burst; a mismatch highlights the tiles red then flips them back.
Finding every pair triggers a full fireworks animation.

The three existing games are all quiz-type (question + answer choices) driven by
`useGameSession`. A memory board shares none of that shape, so this feature adds a second
engine-level session hook and board component that future matching games (shape pairs,
color pairs, …) can reuse without engine edits — the same relationship `useGameSession` +
`GameChoiceGrid` have to quiz games today.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Scoring | `score = pairs`, `total = pairs` (always "perfect" on the kid-facing surface); the score record additionally stores `flipAttempts`, `mismatches`, `peakMatchStreak`, `durationMs` for badges/records |
| Difficulty | Parent-configurable `memoryPairs` setting, 3–6, default 5 |
| Badges | Game-specific catalog: Sharp Mind, Match Streak, Big Board, and 3 lifetime pair tiers |
| Extras | Animal sound on match, celebratory wiggle on matched pair, count-up timer display — each gated by a setting |
| Architecture | Engine hook (`useMemorySession`) **and** engine board UI (`MemoryBoard`); game folder stays thin |
| Settings page | Reorganize the flat Settings tab into headed groups: General / Quiz Games / Memory Games |
| Badge display | Full replacement: a game shipping `badges.js` shows/earns only its own catalog |
| A11y + i18n | First-class requirements (see sections below) |

## Engine additions

### `src/utils/buildDeck.js`

`buildDeck(items, pairs)` → array of tiles `{ tileId, itemId }` in shuffled order
(Fisher–Yates). Picks `pairs` distinct items from the pool and duplicates each.
Edge handling: if the pool has fewer than `pairs` items, clamp to pool size and
`console.warn`; `pairs < 1` throws.

### `src/hooks/useMemorySession.js`

The memory counterpart to `useGameSession`. Signature: `useMemorySession({ gameId, items })`.

Reads settings (`memoryPairs`, `animationsEnabled`, `soundEffectsEnabled`, `timerMode`,
`introDismissed`), and composes the shared services `useGameSession` does:
`useScores` and `useBadges`, plus the intro-screen plumbing
(`showIntro` / `introResolved` / `dismissIntro` / `dontShowAgain`), `restart`, and a
count-up elapsed timer. (`usePersonalBest` is accuracy/timing-based and does not fit a
game that always ends at 100% — see Out of scope.)

State machine per tile: `down → up → (matched | back to down)`.

Flip rules:
- Tap a face-down tile → flips up. First of the pair just waits; second resolves.
- **Match:** both tiles → `matched`; `flipAttempts++`; `matchStreak++` (tracked as
  `peakMatchStreak`); `onMatch(item)` callback fires (game plays the animal sound);
  `fireConfetti()` when `animationsEnabled`.
- **Mismatch:** both tiles → `mismatch` visual state for ~1.2 s, then back to `down`;
  `flipAttempts++`; `mismatches++`; `matchStreak` resets. The board is **locked** during
  the window (lockedRef mirrors state, per the `useGameSession` pattern, so `setTimeout`
  callbacks never read stale closures).
- No-ops: tapping while locked, tapping an already face-up tile, tapping a matched tile.
- Last pair matched → `fireFireworks()` when `animationsEnabled`, then finish.

Finish records:

```js
{ gameId, score: pairs, total: pairs, date, timestamp,
  flipAttempts, mismatches, peakMatchStreak, durationMs }
```

— additive fields only; `ScoreHistory`, kids progress, and existing consumers read
`score`/`total` and are unaffected. Badge awarding runs here, mirroring
`useGameSession.finishGame`. `GameResults` is rendered with `missed={[]}`,
`personalBestResult={null}`, and no difficulty-bump offer.

### `src/components/MemoryBoard.jsx` (+ `.css`)

Generic tile grid. Props: `deck` (tiles with state), `onFlip(tileId)`,
`renderFace(item)` render prop, `locked`. Owns the 3D flip CSS, matched/mismatch
styling, and tile accessibility (below). Uses design tokens from `src/index.css`.

### `src/lib/confetti.js`

Add `fireFireworks()` — a timed multi-burst sequence (several `confetti()` calls over
~2–3 s from varied origins) beside the existing `fireConfetti()`. Callers gate on
`animationsEnabled`, same as today.

### Shared sounds

Move `src/games/animal-sounds/sounds/*.mp3` → `src/assets/sounds/`. Update
`animal-sounds/data/sounds.js` to resolve from the new location (its public
`getSoundUrl` API is unchanged). The memory game resolves its match sound the same way.

### Badge engine: per-game catalogs

`src/lib/badges.js`:
- Keep `BADGE_CATALOG` (global quiz catalog) as-is.
- Add auto-discovery: `import.meta.glob('../games/*/badges.js', { eager: true })` →
  map of gameId → catalog, following the i18n auto-discovery pattern.
- Add `getBadgesForGame(gameId)`: returns the game's own catalog if it ships
  `badges.js`, otherwise the global catalog (**full replacement**, no merging — avoids
  unearnable quiz badges showing locked forever under non-quiz games).

Game badge entry kinds:

```js
// session: predicate over this session's stats
{ id, icon, nameKey, descKey, kind: 'session', earned: (stats) => boolean }

// lifetime: engine detects tier crossing on a named per-game counter
{ id, icon, nameKey, descKey, kind: 'lifetime', counter: 'pairsMatched', tier: 25 }
```

`useBadges.awardSession(gameId, opts)` gains two optional fields:
- `sessionStats` — passed to each session badge's `earned` predicate.
- `counterIncrements` — e.g. `{ pairsMatched: 5 }`; lifetime badges award when
  `prev < tier <= next`, stored in a new additive `lifetimeCounters[gameId][counter]`
  beside the existing `lifetimeQuestions`. Existing quiz call sites are untouched.

`BadgeGallery.jsx` renders `getBadgesForGame(game.id)` instead of the global catalog.
Badge name/desc keys for game badges live in the game's own i18n file.

### Settings

Two new keys in `DEFAULT_SETTINGS` (`src/storage/adapter.js`) + admin settings controls:

| Key | Default | Meaning |
|---|---|---|
| `memoryPairs` | `5` | Pairs per board, 3–6 (6→12 tiles) |
| `soundEffectsEnabled` | `true` | Gates the on-match animal sound |

Existing settings reused: `animationsEnabled` gates flip/wiggle animation, confetti, and
fireworks; `timerMode !== 'off'` shows the count-up timer (memory has no per-question
countdown; `countdown` mode displays as count-up here); `introDismissed` for the intro.

### Settings page reorganization

The admin Settings tab is currently a flat scroll of ~14 ungrouped sections mixing
app-level and quiz-specific controls; the two new keys would make 16, with "answer
choices" and "pairs per board" sitting side by side with no context. Approved fix:
keep the four top-level tabs and organize the Settings panel into **headed groups**
(single scroll, no nested tabs):

| Group | Sections |
|---|---|
| General | Language, child name, animations, **sound effects (new)**, Google Analytics |
| Quiz Games | Answer choices, questions/session, feedback mode, timer, speed-record threshold, max tries, hints, retry streak, spaced repetition, difficulty auto-progression |
| Memory Games | **Pairs per board (new)** |

Implementation: group headings become `h2` (i18n keys `admin.groupGeneral`,
`admin.groupQuizGames`, `admin.groupMemoryGames`); existing section headings drop to
`h3` to keep the heading hierarchy valid for the axe scan. Purely structural — no
setting keys or behaviors change for existing controls. Each future game type adds one
group. (Collapsible groups are deliberately omitted for now — a single labeled scroll
is simpler and screen-reader-friendly.)

## The game folder: `src/games/animal-memory-match/`

- `manifest.json` — id `animal-memory-match`, icon 🧠, version `1.0.0`, tags
  `["memory", "animals"]`.
- `index.jsx` — thin wiring: `useMemorySession` + `GameIntro` + `MemoryBoard` +
  `Timer` + `GameResults`; plays the matched animal's sound in `onMatch` when
  `soundEffectsEnabled`. Calls `useShellGameStatus({ streak: matchStreak, sessionActive })`
  so the shell streak chip and exit-confirm behavior work as in other games. Exposes `data-item-id` on tiles (via MemoryBoard passthrough)
  so tests find pairs without depending on shuffle order — this game's analog of the
  `data-testid="correct-<thing>-id"` convention.
- `data/animals.js` — 6 animals (so 6-pair boards work): emoji, i18n name key, sound
  file name. Self-contained; no coupling to animal-sounds' data or i18n keys.
- `badges.js` — the six badges below.
- `i18n/en.json` — prompt, how-to-play, match/no-match/complete announcements, badge
  names + descriptions, animal names.
- `AnimalMemoryMatchGame.css`, `AnimalMemoryMatchGame.stories.jsx`, `__tests__/`.

### Badges

| Badge | Kind | Rule |
|---|---|---|
| Sharp Mind 🧠 | session | `flipAttempts <= pairs + 2` |
| Match Streak ⚡ | session | `peakMatchStreak >= 3` |
| Big Board 🏁 | session | `pairs >= 6` |
| Pair Spotter 🐾 | lifetime | 25 pairs matched |
| Pair Pro 🐾 | lifetime | 100 pairs matched |
| Pair Champion 🐾 | lifetime | 500 pairs matched |

## Accessibility

All in the shared `MemoryBoard`, inherited by future matching games:

- Tiles are `<button>`s. Labels by state: face-down *"Hidden tile 3 of 10"*; face-up the
  item name; matched the name + *"matched"*, with `disabled`. Natural tab order;
  keyboard-playable end to end.
- Polite `aria-live` region announces match, mismatch, and completion.
- Mismatch feedback is not color-only: red highlight **plus** a brief ✗ marker.
- `prefers-reduced-motion` and `animationsEnabled: false` both swap the 3D flip for an
  instant face change and suppress the wiggle.
- Page-level axe scan for `/game/animal-memory-match` joins the existing Playwright
  a11y spec; a visual-regression story is added.

## i18n

All user-visible strings from `src/games/animal-memory-match/i18n/en.json`,
auto-discovered by `src/i18n/index.js` — no shared-file edits. Live-region
announcements are translated strings.

## Test plan

Stack per repo convention: Vitest + RTL + jsdom; fake timers with `fireEvent` (never
`userEvent` with fake timers); storage mocked via `vi.mock` + `vi.hoisted`. Every layer
gets positive **and** negative cases.

| Layer | Positive | Negative |
|---|---|---|
| `buildDeck` | N pairs, every item exactly twice, shuffled | pool < pairs clamps + warns; `pairs < 1` throws |
| `fireFireworks` | multi-burst calls into canvas-confetti | caller does not fire when animations disabled |
| Badge engine | game catalog discovered; session predicate awards; lifetime crossing (24→29 awards 25-tier) | game without `badges.js` → global catalog; stats below threshold award nothing; already-crossed tier not re-awarded; unknown counter ignored |
| `useMemorySession` | match stays revealed + confetti; mismatch flips back after delay; completion saves full score record, fires fireworks, awards badges; restart resets | tap during mismatch lock ignored; same tile tapped twice ignored; matched tile tap ignored; Sharp Mind not awarded on inefficient session |
| `MemoryBoard` | grid renders, flip states, a11y labels, live region text | matched/disabled tiles not clickable; reduced-motion path applied |
| Game `index.jsx` | intro shows first run; match plays sound; timer visible; results show badges | no sound when `soundEffectsEnabled: false`; no timer when `timerMode: 'off'`; intro skipped when previously dismissed |
| Admin settings | group headings render; pairs control updates `memoryPairs`; sound toggle updates `soundEffectsEnabled`; heading hierarchy valid (h2 groups → h3 sections) | out-of-range pair value not selectable; existing controls still update their keys after regrouping |
| E2E / a11y / visual | full play-through using `data-item-id`; axe scan; screenshot story | — |

## Versioning & docs

- Game manifest `1.0.0`; app version bump; `CHANGELOG.md` entry.
- README settings reference gains `memoryPairs` and `soundEffectsEnabled`.
- `docs/ENHANCEMENTS.md`: mark Animal Memory Match as done/in progress.

## Out of scope

- Difficulty auto-progression offering a pair-count bump (noted as a natural follow-up).
- Personal bests: `usePersonalBest`/`evaluatePersonalBest` are accuracy + per-question
  timing based; a memory session is always 100% with no per-question timings. The score
  record stores `flipAttempts`/`durationMs`, so a "fewest flips / fastest board" PB is a
  clean follow-up without engine rework now.
- Non-animal memory games (the engine pieces make them cheap later).
- Best-streak (`useBestStreak`) integration — match streaks live in the score record
  and badges instead; the shell streak indicator is quiz-specific.
