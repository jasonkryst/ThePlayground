# Memory Sound Lifecycle + Results Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop memory-game match sounds from playing over the next match / game end (issue #52), and make the memory game's results screen render the same themed layout as every other game (issue #53).

**Architecture:** A new shared `useSoundPlayer` hook owns the play/stop-previous/stop-on-unmount audio lifecycle; both Animal Memory Match and Animal Sounds consume it. The `.results` CSS moves from three duplicated per-game stylesheets into the shared component's own `src/components/GameResults.css`, so the styles load with the component in every lazy chunk.

**Tech Stack:** React 18 + Vite, Vitest + React Testing Library (jsdom), Playwright (e2e + Storybook visual regression).

**Spec:** `docs/superpowers/specs/2026-07-11-memory-sound-and-results-theme-design.md`

## Global Constraints

- Timed-feedback unit tests must use `vi.useFakeTimers()` with `fireEvent`, never `userEvent` (deadlocks with fake timers in this stack — see CLAUDE.md).
- Colors/radii in CSS must use the design tokens (`var(--color-lavender)` etc.), never hardcoded hex.
- Quiz-game visual behavior must not change: the moved `.results` rules are copied byte-for-byte.
- Version bumps land only in Task 6 (memory game 1.1.0→1.1.1, animal-sounds 1.6.0→1.6.1, color-match 1.6.0→1.6.1, character-match 1.4.0→1.4.1, app 0.24.0→0.24.1).
- Commit messages end with the Co-Authored-By / Claude-Session trailer used by this session.

---

### Task 1: `useSoundPlayer` hook

**Files:**
- Create: `src/hooks/useSoundPlayer.js`
- Test: `src/hooks/__tests__/useSoundPlayer.test.js`

**Interfaces:**
- Consumes: nothing (leaf hook).
- Produces: `useSoundPlayer()` → `{ play, stop }` where `play(url: string|null|undefined): void` stops any in-flight clip then plays `url` (no-op when `url` is falsy; `audio.play()` rejections are swallowed), and `stop(): void` pauses the current clip, resets `currentTime` to 0, and clears it (no-op when nothing is playing). The hook stops any in-flight clip on unmount. Both functions are referentially stable (safe in effect dependency arrays).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useSoundPlayer.test.js`:

```js
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import useSoundPlayer from '../useSoundPlayer'

// Instance-tracking Audio mock: each `new Audio(url)` records its instance so
// tests can assert which clip played, paused, or was reset — a prototype-level
// mock can't distinguish the first clip from the second.
let audioInstances = []
let playImpl = () => Promise.resolve()

function MockAudio(src) {
  this.src = src
  this.currentTime = 0
  this.play = vi.fn(() => playImpl())
  this.pause = vi.fn()
  audioInstances.push(this)
}
window.Audio = MockAudio

beforeEach(() => {
  audioInstances = []
  playImpl = () => Promise.resolve()
})

describe('useSoundPlayer', () => {
  it('play(url) creates an Audio for the url and plays it', () => {
    const { result } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    expect(audioInstances).toHaveLength(1)
    expect(audioInstances[0].src).toBe('blob:clip-1')
    expect(audioInstances[0].play).toHaveBeenCalledTimes(1)
  })

  it('play() stops the previous clip before starting the next', () => {
    const { result } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    audioInstances[0].currentTime = 5 // pretend the clip is mid-playback
    act(() => result.current.play('blob:clip-2'))
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
    expect(audioInstances[0].currentTime).toBe(0)
    expect(audioInstances[1].play).toHaveBeenCalledTimes(1)
  })

  it('stop() pauses and resets the current clip', () => {
    const { result } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    audioInstances[0].currentTime = 5
    act(() => result.current.stop())
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
    expect(audioInstances[0].currentTime).toBe(0)
  })

  it('unmounting stops an in-flight clip', () => {
    const { result, unmount } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    unmount()
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
  })

  it('play() with a falsy url is a no-op and does not interrupt the current clip', () => {
    const { result } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    act(() => result.current.play(null))
    act(() => result.current.play(undefined))
    expect(audioInstances).toHaveLength(1)
    expect(audioInstances[0].pause).not.toHaveBeenCalled()
  })

  it('stop() with nothing playing does not throw', () => {
    const { result } = renderHook(() => useSoundPlayer())
    expect(() => act(() => result.current.stop())).not.toThrow()
  })

  it('stop() after a previous stop() does not pause the same clip twice', () => {
    const { result } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    act(() => result.current.stop())
    act(() => result.current.stop())
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
  })

  it('swallows audio.play() rejections (autoplay policy, missing file)', async () => {
    playImpl = () => Promise.reject(new Error('NotAllowedError'))
    const { result } = renderHook(() => useSoundPlayer())
    expect(() => act(() => result.current.play('blob:clip-1'))).not.toThrow()
    // Flush the microtask queue; an unhandled rejection would fail the run.
    await act(async () => {})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useSoundPlayer.test.js`
Expected: FAIL — cannot resolve `../useSoundPlayer`.

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useSoundPlayer.js`:

```js
import { useCallback, useEffect, useRef } from 'react'

/**
 * Owns the lifecycle of a single sound-effect clip: playing a new clip stops
 * the previous one, and any in-flight clip is stopped on unmount. Callers that
 * end a "session" early (results screen, intro) should call stop() themselves.
 *
 * @returns {{ play: (url: ?string) => void, stop: () => void }}
 *   `play` is a no-op for falsy urls and swallows audio.play() rejections
 *   (autoplay policy, missing file). Both functions are referentially stable.
 */
export default function useSoundPlayer() {
  const audioRef = useRef(null)

  const stop = useCallback(() => {
    if (!audioRef.current) return
    audioRef.current.pause()
    audioRef.current.currentTime = 0
    audioRef.current = null
  }, [])

  const play = useCallback(url => {
    if (!url) return
    stop()
    const audio = new Audio(url)
    audioRef.current = audio
    audio.play().catch(() => {})
  }, [stop])

  useEffect(() => () => stop(), [stop])

  return { play, stop }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useSoundPlayer.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/hooks/useSoundPlayer.js src/hooks/__tests__/useSoundPlayer.test.js
git commit -m "feat: useSoundPlayer hook — stop-previous/stop-on-unmount audio lifecycle"
```

---

### Task 2: Refactor Animal Sounds onto `useSoundPlayer`

**Files:**
- Modify: `src/games/animal-sounds/index.jsx`
- Test (existing, unchanged): `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`

**Interfaces:**
- Consumes: `useSoundPlayer()` → `{ play(url), stop() }` from Task 1.
- Produces: no new interfaces; behavior must be identical (play on question change, replay button, stop on question change / done / intro / unmount).

- [ ] **Step 1: Replace the inline audio plumbing**

In `src/games/animal-sounds/index.jsx`, the current code is:

```js
import { useCallback, useEffect, useRef } from 'react'
// ...
  const audioRef = useRef(null)

  const stopSound = useCallback(() => {
    if (!audioRef.current) return
    audioRef.current.pause()
    audioRef.current.currentTime = 0
    audioRef.current = null
  }, [])

  const playSound = useCallback(() => {
    if (!current) return
    const url = getSoundUrl(current.correct.sound)
    if (!url) return
    stopSound()
    const audio = new Audio(url)
    audioRef.current = audio
    audio.play().catch(() => {})
  }, [current, stopSound])

  useEffect(() => {
    if (!current) return

    // Stop any in-flight audio when moving away from this question.
    return () => {
      stopSound()
    }
  }, [current, stopSound])

  useEffect(() => {
    return () => {
      stopSound()
    }
  }, [stopSound])
```

Replace it with (the hook now owns stop-previous and stop-on-unmount; `play` on a falsy url is a no-op, preserving the old `if (!url) return` behavior):

```js
import { useCallback, useEffect } from 'react'
// ...
  const { play, stop: stopSound } = useSoundPlayer()

  const playSound = useCallback(() => {
    if (!current) return
    play(getSoundUrl(current.correct.sound))
  }, [current, play])

  useEffect(() => {
    if (!current) return

    // Stop any in-flight audio when moving away from this question.
    return () => {
      stopSound()
    }
  }, [current, stopSound])
```

Concretely:
1. Change the react import from `{ useCallback, useEffect, useRef }` to `{ useCallback, useEffect }` (`useRef` becomes unused).
2. Add `import useSoundPlayer from '../../hooks/useSoundPlayer'` next to the other hook imports.
3. Delete the `audioRef` declaration and the `stopSound` useCallback; add `const { play, stop: stopSound } = useSoundPlayer()` where `audioRef` was declared.
4. Rewrite `playSound` as shown.
5. Delete the unmount-only effect (`useEffect(() => { return () => { stopSound() } }, [stopSound])`) — the hook handles unmount.
6. Keep the question-change cleanup effect and the existing `done/showIntro → stopSound()` effect exactly as they are.

- [ ] **Step 2: Run the existing suite to verify the refactor is behavior-neutral**

Run: `npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`
Expected: PASS, no test edits. (These tests mock `HTMLMediaElement.prototype.play/pause`; the hook still creates real jsdom `Audio` elements, so the prototype spies keep working.)

- [ ] **Step 3: Lint and commit**

```bash
npm run lint
git add src/games/animal-sounds/index.jsx
git commit -m "refactor: animal-sounds uses shared useSoundPlayer hook"
```

---

### Task 3: Memory game sound lifecycle (issue #52)

**Files:**
- Modify: `src/games/animal-memory-match/index.jsx`
- Modify: `src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`

**Interfaces:**
- Consumes: `useSoundPlayer()` → `{ play(url), stop() }` from Task 1.
- Produces: behavior only — a match clip is cut off by the next match's clip, by the results screen appearing (`done`), and by unmounting mid-game.

- [ ] **Step 1: Rework the test file's audio mocking and write the failing tests**

In `src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`, replace the prototype-level mock (lines 6–8):

```js
const mockPlay = vi.fn().mockResolvedValue(undefined)
window.HTMLMediaElement.prototype.play  = mockPlay
window.HTMLMediaElement.prototype.pause = vi.fn()
```

with an instance-tracking constructor mock:

```js
// Instance-tracking Audio mock: each `new Audio(url)` records its instance so
// tests can assert which clip played, paused, or was reset — the stop-previous-
// clip behavior can't be observed through a shared prototype spy.
let audioInstances = []
function MockAudio(src) {
  this.src = src
  this.currentTime = 0
  this.play = vi.fn().mockResolvedValue(undefined)
  this.pause = vi.fn()
  audioInstances.push(this)
}
window.Audio = MockAudio
```

Add `import { getSoundUrl } from '../../../lib/soundLibrary'` with the other imports (the module is already mocked with `vi.mock`), and reset the instances in the existing `beforeEach`:

```js
beforeEach(() => {
  vi.clearAllMocks()
  audioInstances = []
  getSoundUrl.mockImplementation(() => 'blob:mock-sound')
  // ... existing mockMemoryBestOutcome / mockSettings assignments unchanged
})
```

(The explicit `mockImplementation` re-arms the default after tests that override it below.)

Add a helper next to `findPairButtons()`:

```js
function findMismatchButtons() {
  const tiles = getTiles().filter(b => b.getAttribute('aria-disabled') !== 'true')
  const a = tiles[0]
  const b = tiles.find(o => o.dataset.itemId !== a.dataset.itemId)
  return [a, b]
}
```

Update the two existing sound tests to the instance mock:

```js
  it('plays the animal sound on a match', async () => {
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(1)
    expect(audioInstances[0].src).toBe('blob:mock-sound')
    expect(audioInstances[0].play).toHaveBeenCalledTimes(1)
  })

  it('does not play sound when soundEffectsEnabled is false', async () => {
    mockSettings.soundEffectsEnabled = false
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(0)
  })
```

Add the new tests (inside the main `describe`):

```js
  it('stops the previous match sound when a new match happens (issue #52)', async () => {
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    let pair = findPairButtons()
    act(() => { fireEvent.click(pair[0]) })
    act(() => { fireEvent.click(pair[1]) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(1)
    expect(audioInstances[0].pause).not.toHaveBeenCalled()

    audioInstances[0].currentTime = 5 // pretend the first clip is mid-playback
    pair = findPairButtons()
    act(() => { fireEvent.click(pair[0]) })
    act(() => { fireEvent.click(pair[1]) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(2)
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
    expect(audioInstances[0].currentTime).toBe(0)
    expect(audioInstances[1].play).toHaveBeenCalledTimes(1)
  })

  it('stops the final match sound when the results screen appears (issue #52)', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    await playFullBoard()
    const finalClip = audioInstances[audioInstances.length - 1]
    expect(finalClip.pause).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => {})
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
    expect(finalClip.pause).toHaveBeenCalledTimes(1)
  })

  it('stops an in-flight clip when the game is left mid-session (issue #52)', async () => {
    let view
    await act(async () => { view = render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    view.unmount()
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
  })

  it('does not play any sound on a mismatch', async () => {
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findMismatchButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(0)
  })

  it('does not create an Audio element when the item has no sound url', async () => {
    getSoundUrl.mockImplementation(() => null)
    await act(async () => { render(<AnimalMemoryMatchGame onGameEnd={onGameEnd} />) })
    const [a, b] = findPairButtons()
    act(() => { fireEvent.click(a) })
    act(() => { fireEvent.click(b) })
    await act(async () => {})
    expect(audioInstances).toHaveLength(0)
  })
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`
Expected: the two stop-behavior tests FAIL (`pause` never called — the component currently fire-and-forgets `new Audio(url).play()`); the mismatch / no-url / disabled-sound tests already pass (they document existing behavior as negative cases).

- [ ] **Step 3: Implement the fix in the component**

In `src/games/animal-memory-match/index.jsx`:

1. Add the import: `import useSoundPlayer from '../../hooks/useSoundPlayer'` (with the other hook imports).
2. After the `useShellGameStatus(...)` call, add: `const { play, stop } = useSoundPlayer()`.
3. Replace the match-sound effect:

```js
  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'match' || !soundEffectsEnabled) return
    const url = getSoundUrl(itemById(lastEvent.itemId).sound)
    if (url) new Audio(url).play().catch(() => {})
  }, [lastEvent, soundEffectsEnabled])
```

with:

```js
  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'match' || !soundEffectsEnabled) return
    play(getSoundUrl(itemById(lastEvent.itemId).sound))
  }, [lastEvent, soundEffectsEnabled, play])

  // A long clip must not keep playing over the results screen (issue #52).
  useEffect(() => {
    if (done) stop()
  }, [done, stop])
```

(`itemById` must stay declared above these effects, as it already is. Unmount is handled inside the hook.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Full unit suite, lint, commit**

```bash
npx vitest run
npm run lint
git add src/games/animal-memory-match/index.jsx src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx
git commit -m "fix: memory match sounds stop on next match, game end, and exit (#52)"
```

---

### Task 4: Move `.results` styles into `GameResults.css` (issue #53)

**Files:**
- Modify: `src/components/GameResults.css`
- Modify: `src/games/animal-sounds/AnimalSoundsGame.css` (delete lines 66–75 + the preceding blank line)
- Modify: `src/games/color-match/ColorMatchGame.css` (delete lines 64–73 + the preceding blank line)
- Modify: `src/games/character-match/CharacterMatchGame.css` (delete lines 63–72 + the preceding blank line)

**Interfaces:**
- Consumes: nothing.
- Produces: `.results*` classes fully styled wherever `GameResults` is imported (all games + Storybook), letting Task 5's e2e assertion hold.

- [ ] **Step 1: Replace `GameResults.css` with the canonical rules**

The current file is only:

```css
.results__missed { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.results__missed-heading { font-size: 16px; font-weight: 700; opacity: 0.8; }
.results__record { font-weight: 700; color: var(--color-teal-dark); }
.results__badge-award { font-weight: 700; }
```

Replace the whole file with (the ten moved rules are byte-identical to the blocks being deleted from the game stylesheets; the four existing rules are interleaved in DOM order):

```css
.results { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; padding: 24px; text-align: center; }
.results__emoji  { font-size: 96px; }
.results__score  { font-size: 36px; font-weight: 800; color: var(--color-lavender); }
.results__label  { font-size: 20px; opacity: 0.7; }
.results__record { font-weight: 700; color: var(--color-teal-dark); }
.results__badge-award { font-weight: 700; }
.results__missed { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.results__missed-heading { font-size: 16px; font-weight: 700; opacity: 0.8; }
.results__actions { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
.results__btn { padding: 16px 36px; font-size: 20px; font-weight: 700; border-radius: var(--radius-button); min-height: 64px; }
.results__btn--play  { background: var(--color-lavender); color: white; border: none; }
.results__btn--home  { background: transparent; border: 2px solid var(--color-aqua); color: var(--color-text); }
.results__btn:focus         { outline: none; }
.results__btn:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

- [ ] **Step 2: Delete the duplicated blocks from the three game stylesheets**

In each of `AnimalSoundsGame.css`, `ColorMatchGame.css`, and `CharacterMatchGame.css`, delete this exact block (it sits between the `.game__next:focus-visible` rule and the `.game__timeout` rule; also remove one of the two blank lines left behind):

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

Verify no `.results` rule remains outside the component:

Run: `grep -rn "^\.results" src/games/`
Expected: no output.

- [ ] **Step 3: Unit suite + lint + build still green**

```bash
npx vitest run
npm run lint
npm run build
```
Expected: all pass (CSS moves don't affect jsdom tests; build confirms the chunks assemble).

- [ ] **Step 4: Regenerate the GameResults visual baselines**

The five `components-gameresults--*` snapshots were captured *unstyled* (the stories never imported a game stylesheet), so they must change:

Run: `npx playwright test e2e/visual.spec.js -g gameresults --update-snapshots`
Expected: 5 tests pass, snapshot files under `e2e/visual.spec.js-snapshots/` rewritten.

Then verify the whole visual suite (game-screen stories must NOT have changed):

Run: `npx playwright test e2e/visual.spec.js`
Expected: PASS with no further snapshot diffs. If any `games-*` or non-gameresults story fails here, that is a regression in the CSS move — stop and fix rather than updating more snapshots.

- [ ] **Step 5: Commit**

```bash
git add src/components/GameResults.css src/games/animal-sounds/AnimalSoundsGame.css src/games/color-match/ColorMatchGame.css src/games/character-match/CharacterMatchGame.css e2e/visual.spec.js-snapshots
git commit -m "fix: results-screen styles live with GameResults component (#53)"
```

---

### Task 5: E2E guard — memory results screen is genuinely styled

**Files:**
- Modify: `e2e/animal-memory-match.spec.js`

**Interfaces:**
- Consumes: `.results` flex-centered layout from Task 4; existing `startGame(page)` helper in the same file.
- Produces: regression guard for the CSS-ownership bug.

- [ ] **Step 1: Add the test**

Append to `e2e/animal-memory-match.spec.js` (reuses the file's existing full-play-through pattern):

```js
test('memory match: results screen receives the shared themed styling (#53)', async ({ page }) => {
  // Direct navigation matters: the bug only reproduced when no quiz game's
  // stylesheet (which used to carry the .results rules) had been loaded first.
  await startGame(page)
  const ids = await page.locator('[data-tile-id]').evaluateAll(els => els.map(e => e.dataset.itemId))
  for (const id of [...new Set(ids)]) {
    const pair = page.locator(`[data-item-id="${id}"]`)
    await pair.nth(0).click()
    await pair.nth(1).click()
  }
  const results = page.locator('.results')
  await expect(results).toBeVisible({ timeout: 10_000 })
  await expect(results).toHaveCSS('display', 'flex')
  await expect(results).toHaveCSS('text-align', 'center')
  await expect(page.getByRole('button', { name: /play again/i })).toHaveCSS('border-radius', /px/)
})
```

Note: `toHaveCSS` accepts a string or RegExp; the border-radius assertion just proves the button rules resolved (`var(--radius-button)` computes to a px value). If the RegExp form errors on this Playwright version, read the computed value via `evaluate` and assert it is not `0px`.

- [ ] **Step 2: Run the spec**

Run: `npx playwright test e2e/animal-memory-match.spec.js`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 3: Commit**

```bash
git add e2e/animal-memory-match.spec.js
git commit -m "test: e2e guard that memory results screen loads shared styles (#53)"
```

---

### Task 6: Versions, changelog, docs sweep

**Files:**
- Modify: `package.json` (version `0.24.0` → `0.24.1`)
- Modify: `src/games/animal-memory-match/manifest.json` (`1.1.0` → `1.1.1`)
- Modify: `src/games/animal-sounds/manifest.json` (`1.6.0` → `1.6.1`)
- Modify: `src/games/color-match/manifest.json` (`1.6.0` → `1.6.1`)
- Modify: `src/games/character-match/manifest.json` (`1.4.0` → `1.4.1`)
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: nothing.
- Produces: release record.

- [ ] **Step 1: Bump the five version fields**

Edit each file's `"version"` to the value listed above.

- [ ] **Step 2: Add the changelog entry**

Insert directly under the `Format follows…` line in `CHANGELOG.md` (above `## [0.24.0]`):

```markdown
## [0.24.1] - 2026-07-11

### Fixed
- Memory match sounds no longer outlast their moment (issue #52): matching a new pair cuts off the previous animal's clip, and any playing clip stops when the results screen appears or the game is left mid-session. Game audio now goes through a shared `useSoundPlayer` hook; Animal Sounds was refactored onto it with no behavior change.
- The memory game's results screen now shows the same themed layout as every other game (issue #53). The shared `.results` styles were duplicated in each quiz game's stylesheet and missing from the `GameResults` component's own CSS, so navigating straight to the memory game rendered its results screen unstyled. The styles now live in `GameResults.css` and load with the component everywhere; the GameResults visual-regression baselines were regenerated (they had captured the unstyled look).
```

- [ ] **Step 3: Docs sweep**

Run: `grep -rn "results" README.md docs/TESTING.md CLAUDE.md --include="*.md" -i | grep -iv "test results"` and read any hit that describes results-screen styling or per-game CSS ownership; fix stale claims if found (none are expected).

- [ ] **Step 4: Final full check**

```bash
npx vitest run
npm run lint
npm run build
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add package.json src/games/animal-memory-match/manifest.json src/games/animal-sounds/manifest.json src/games/color-match/manifest.json src/games/character-match/manifest.json CHANGELOG.md
git commit -m "docs: changelog and version bumps for 0.24.1 (issues #52, #53)"
```
