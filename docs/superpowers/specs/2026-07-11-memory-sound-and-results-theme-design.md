# Memory game: sound lifecycle + results-screen theme (Issues #52, #53)

## Problem

**Issue #52 — Memory Game sounds play for too long.** When a pair is matched in
Animal Memory Match, the animal's sound clip plays to completion no matter what
happens next: a second match's clip plays *over* the first, the clip keeps
playing across the fireworks/complete transition and onto the results screen,
and it even survives leaving the game entirely (unmount).

**Issue #53 — Memory Game results screen doesn't match other games.** The
reporter's screenshot shows the results screen rendered essentially unstyled —
small emoji, left-ish plain text, default-looking buttons — instead of the
centered, full-height, lavender-accented layout every quiz game shows.

## Root causes

**#52:** `src/games/animal-memory-match/index.jsx` plays match sounds
fire-and-forget:

```js
if (url) new Audio(url).play().catch(() => {})
```

No reference to the `Audio` element is kept, so nothing can pause it. The
animal-sounds quiz already solved this exact problem with an `audioRef` +
`stopSound()`/`playSound()` pattern (stop previous clip before playing, stop on
question change, on `done`, and on unmount) — the memory game never got it.

**#53:** The `.results` layout styles (`min-height: 100vh`, flex centering,
96px emoji, lavender score, button styling) are duplicated verbatim in the
three quiz games' stylesheets — `AnimalSoundsGame.css`, `ColorMatchGame.css`,
`CharacterMatchGame.css` — while the shared component's own
`src/components/GameResults.css` contains only four minor rules
(`__missed`, `__missed-heading`, `__record`, `__badge-award`).
`AnimalMemoryMatchGame.css` has no `.results` rules at all.

Games are lazy-loaded (`import.meta.glob('./games/*/index.jsx')` without
`eager`), so each game's CSS ships in its own chunk. Navigating directly to
`/game/animal-memory-match` loads *no* quiz-game stylesheet, and the results
screen renders with near-zero styling — exactly the screenshot. (In a dev
session where a quiz game was visited first, its leaked global `.results`
rules paper over the bug, which is why it looks fine sometimes.)

Storybook shows the same defect: `GameResults.stories.jsx` imports only the
component, so the current `components-gameresults--*` visual-regression
baselines were captured in the *unstyled* state.

## Fix

### #52 — shared `useSoundPlayer` hook

New hook `src/hooks/useSoundPlayer.js`:

```js
const { play, stop } = useSoundPlayer()
```

- `play(url)` — stops any in-flight clip, then creates and plays a new
  `Audio(url)`; a null/undefined `url` is a no-op; `play()` promise rejections
  (autoplay policy, missing file) are swallowed.
- `stop()` — pauses the current clip, resets `currentTime`, clears the ref;
  no-op when nothing is playing.
- On unmount, the hook stops any in-flight clip automatically.

**Animal Memory Match** (`src/games/animal-memory-match/index.jsx`) uses it:

- The existing match-sound effect calls `play(url)` instead of
  `new Audio(url).play()` — so each match clip cuts off the previous one.
- A new effect calls `stop()` when `done` becomes true — no clip plays over
  the results screen.
- Unmount cleanup (leaving mid-game) is covered by the hook itself.
- Mismatch flips do not stop a playing clip (unchanged behavior; the issue
  only concerns overlap with the next match and game end).

**Animal Sounds** (`src/games/animal-sounds/index.jsx`) is refactored onto the
same hook: its local `audioRef`/`stopSound`/`playSound` plumbing is replaced by
`useSoundPlayer`, keeping identical behavior (play on question change, replay
button, stop on question change/done/intro/unmount). Existing tests guard the
refactor.

### #53 — component-owned results CSS

Move the canonical `.results` block into `src/components/GameResults.css` so
the styles load with the component in every chunk that uses it:

```css
.results { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; padding: 24px; text-align: center; }
.results__emoji  { font-size: 96px; }
.results__score  { font-size: 36px; font-weight: 800; color: var(--color-lavender); }
.results__label  { font-size: 20px; opacity: 0.7; }
.results__actions { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
.results__btn { padding: 16px 36px; font-size: 20px; font-weight: 700; border-radius: var(--radius-button); min-height: 64px; }
.results__btn--play  { background: var(--color-lavender); color: white; border: none; }
.results__btn--home  { background: transparent; border: 2px solid var(--color-aqua); color: var(--color-text); }
.results__btn:focus         { outline: none; }
.results__btn:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

Delete the duplicated `.results*` blocks from `AnimalSoundsGame.css`,
`ColorMatchGame.css`, and `CharacterMatchGame.css`. Quiz games are visually
unchanged (same rules, now loaded from the component's stylesheet); the memory
game's results screen becomes correctly styled on any navigation path, and
Storybook renders GameResults fully styled.

The `components-gameresults--*` visual-regression baselines will change (they
currently capture the unstyled look) and must be regenerated with
`npx playwright test --update-snapshots` for the affected stories.

## Test plan

**`src/hooks/__tests__/useSoundPlayer.test.js`** (new; mock `window.Audio`):
- Positive: `play(url)` constructs an `Audio` with the url and calls `.play()`.
- Positive: a second `play()` pauses and resets the first clip before starting
  the new one.
- Positive: `stop()` pauses and resets the current clip.
- Positive: unmounting the hook stops an in-flight clip.
- Negative: `play(null)` / `play(undefined)` creates no `Audio` and does not
  throw.
- Negative: `stop()` with nothing playing does not throw.
- Negative: a rejected `audio.play()` promise is swallowed (no unhandled
  rejection).

**`src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`**
(extend; mock `window.Audio`):
- Positive: matching a pair plays that animal's sound.
- Positive: matching a second pair pauses the first clip before playing the
  second.
- Positive: the clip playing for the final match is stopped when the results
  screen appears (advance past `COMPLETE_DELAY_MS` with fake timers).
- Positive: unmounting mid-game (leaving the game) stops an in-flight clip.
- Negative: a mismatch plays no sound and stops nothing.
- Negative: with `soundEffectsEnabled: false`, a match plays no sound.

**`src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`** — existing
suite passes unchanged, guarding the refactor onto the hook.

**`e2e/animal-memory-match.spec.js`** (extend):
- Positive: complete a board via direct navigation, and assert the results
  screen actually received the shared styles (e.g. `.results` computed
  `display` is `flex`), so the CSS-ownership regression cannot silently
  return.

Unit tests use `vi.useFakeTimers()` + `fireEvent` per the project convention
for timed feedback.

## Docs / versioning

- `src/games/animal-memory-match/manifest.json`: `1.1.0` → `1.1.1`.
- `src/games/animal-sounds/manifest.json`: `1.6.0` → `1.6.1` (internal
  refactor onto the shared hook; CSS moved).
- `src/games/color-match/manifest.json`: `1.6.0` → `1.6.1` and
  `src/games/character-match/manifest.json`: `1.4.0` → `1.4.1` (CSS moved to
  the shared component; no behavior change).
- `package.json`: `0.24.0` → `0.24.1`.
- `CHANGELOG.md`: new `## [0.24.1]` `### Fixed` entry covering both issues.
- `CLAUDE.md`/`README.md`: no contract changes; no edits expected beyond the
  above. If a sweep shows a stale claim about per-game results styling, fix it.

## Out of scope

- No behavior change to quiz-game audio (same semantics, new home).
- No stopping of match clips on mismatch flips or tile flips.
- No redesign of the results screen — only restoring the intended shared look.
