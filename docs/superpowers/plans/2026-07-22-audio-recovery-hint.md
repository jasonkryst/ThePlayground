# Audio Recovery Hint Implementation Plan (AU-8 / Issue #123)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a browser blocks `useSoundPlayer`'s `audio.play()` or `useSpeech`'s speech synthesis, surface the failure instead of swallowing it, and pulse the 🔊 replay button with a localized "tap to hear" hint (Animal Sounds and Fruit & Veggie ID) until the next successful playback.

**Architecture:** Both audio hooks (`useSoundPlayer`, `useSpeech`) gain a `blocked` boolean, sourced from each API's real success/failure signal (`play()` promise vs. utterance `onstart`/`onerror` events), guarded against false positives from routine `stop()`/`cancel()` interruption via a ref-equality check. A new shared `ReplayButton` component (extracted from the duplicated inline button in both games) renders the pulsing/hint UI whenever `blocked` is true.

**Tech Stack:** React hooks, Vitest + React Testing Library + jsdom (unit/component), Playwright (e2e), react-i18next, plain CSS (no preprocessor).

## Global Constraints

- No semicolons, single quotes, 2-space indent — match existing style in every touched file exactly (see `src/hooks/useSoundPlayer.js`, `src/hooks/useSpeech.js` for the reference style).
- `blocked` resets to `false` synchronously at the **start** of every `play()`/`speak()` call, before the outcome of that attempt is known — prevents a stale hint from a previous clip/utterance flashing into the next question.
- Every `stop()`/`cancel()` implementation must null its ref (`audioRef.current` / `utteranceRef.current`) **before** the interruption can trigger the old clip/utterance's rejection/error callback — this is what makes routine question-to-question interruption not falsely report as blocked. `useSoundPlayer.stop()` already satisfies this (verified in Task 1); `useSpeech.cancel()` must be written to satisfy it (Task 2).
- New user-facing string `common.tapToHear` must be added to all three locale files: `src/i18n/en.json`, `es.json`, `pl.json` (never just `en.json` — this codebase ships es/pl for every string, verified in `docs/TESTING.md`'s i18n convention section).
- `ReplayButton` follows the `Timer.jsx` convention: it calls `useTranslation()` internally and takes an i18n **key** (`labelKey`), not a pre-translated string — do not deviate to a pre-translated `label` prop.
- CSS: `rgb(r g b / alpha%)` modern syntax for any new color-with-alpha (matches `pulse-green`'s existing `rgb(76 175 80 / 70%)`), not `rgba()`.
- Every hook/component/game test file that already exists must keep 100% of its current tests passing — this plan only adds tests, never removes existing coverage.
- Bump `package.json` (0.33.0 → 0.33.1) **and** both games' `manifest.json` versions (`animal-sounds` 1.6.3 → 1.6.4, `fruit-veggie-id` 1.0.1 → 1.0.2) per CLAUDE.md's versioning convention — both games' behavior changes.

---

### Task 1: `useSoundPlayer` — add `blocked` state

**Files:**
- Modify: `src/hooks/useSoundPlayer.js`
- Test: `src/hooks/__tests__/useSoundPlayer.test.js`

**Interfaces:**
- Produces: `useSoundPlayer()` now returns `{ play, stop, blocked }` — `blocked: boolean`, `false` initially and after every successful `play()`, `true` after a rejected `play()` whose Audio instance is still the current one.

- [ ] **Step 1: Write the failing tests**

Append to `src/hooks/__tests__/useSoundPlayer.test.js`, inside the existing `describe('useSoundPlayer', ...)` block, right after the existing `'swallows audio.play() rejections...'` test (before the closing `})`):

```js
  it('blocked is initially false', () => {
    const { result } = renderHook(() => useSoundPlayer())
    expect(result.current.blocked).toBe(false)
  })

  it('play() sets blocked to true when audio.play() rejects', async () => {
    playImpl = () => Promise.reject(new Error('NotAllowedError'))
    const { result } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    await act(async () => {})
    expect(result.current.blocked).toBe(true)
  })

  it('play() keeps blocked false when audio.play() resolves', async () => {
    const { result } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    await act(async () => {})
    expect(result.current.blocked).toBe(false)
  })

  it('a stop()-interrupted clip does not set blocked when its rejection arrives later (negative/race)', async () => {
    let rejectClip1
    playImpl = () => new Promise((_, reject) => { rejectClip1 = reject })
    const { result } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    act(() => result.current.stop())
    await act(async () => { rejectClip1(new Error('AbortError')) })
    expect(result.current.blocked).toBe(false)
  })

  it('a fresh play() clears a stale blocked=true before the new attempt settles (no flash)', async () => {
    playImpl = () => Promise.reject(new Error('NotAllowedError'))
    const { result } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    await act(async () => {})
    expect(result.current.blocked).toBe(true)

    let resolveClip2
    playImpl = () => new Promise(resolve => { resolveClip2 = resolve })
    act(() => result.current.play('blob:clip-2'))
    expect(result.current.blocked).toBe(false)
    await act(async () => { resolveClip2() })
    expect(result.current.blocked).toBe(false)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useSoundPlayer.test.js`
Expected: FAIL — `result.current.blocked` is `undefined`, not `false`/`true` (the hook doesn't return `blocked` yet).

- [ ] **Step 3: Implement `blocked` in the hook**

Replace the full contents of `src/hooks/useSoundPlayer.js` with:

```js
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Owns the lifecycle of a single sound-effect clip: playing a new clip stops
 * the previous one, and any in-flight clip is stopped on unmount. Callers that
 * end a "session" early (results screen, intro) should call stop() themselves.
 *
 * @returns {{ play: (url: ?string) => void, stop: () => void, blocked: boolean }}
 *   `play` is a no-op for falsy urls. `blocked` reflects whether the most
 *   recent play() attempt's audio.play() rejected (autoplay policy, missing
 *   file) — callers can use it to surface a recovery hint (AU-8). It resets
 *   to false at the start of every play() call, so a stale hint from a
 *   previous clip never lingers into the next attempt.
 */
export default function useSoundPlayer() {
  const audioRef = useRef(null)
  const [blocked, setBlocked] = useState(false)

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
    setBlocked(false)
    audio.play()
      .then(() => { if (audioRef.current === audio) setBlocked(false) })
      .catch(() => { if (audioRef.current === audio) setBlocked(true) })
  }, [stop])

  useEffect(() => () => stop(), [stop])

  return { play, stop, blocked }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useSoundPlayer.test.js`
Expected: PASS (all tests, old and new — 13 total).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSoundPlayer.js src/hooks/__tests__/useSoundPlayer.test.js
git commit -m "feat(123): surface blocked audio.play() rejections in useSoundPlayer"
```

---

### Task 2: `useSpeech` — add `blocked` state

**Files:**
- Modify: `src/hooks/useSpeech.js`
- Test: `src/hooks/__tests__/useSpeech.test.js`

**Interfaces:**
- Produces: `useSpeech()` now returns `{ speak, cancel, supported, blocked }` — `blocked: boolean`, `false` initially and after the current utterance's `onstart` fires, `true` after the current utterance's `onerror` fires.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `src/hooks/__tests__/useSpeech.test.js`, after the existing `describe('useSpeech (supported)', ...)` block and before `describe('useSpeech (unsupported)', ...)`:

```js
describe('useSpeech blocked state', () => {
  beforeEach(installSynth)

  it('blocked is initially false', () => {
    const { result } = renderHook(() => useSpeech())
    expect(result.current.blocked).toBe(false)
  })

  it('blocked stays false when the utterance starts successfully', () => {
    const { result } = renderHook(() => useSpeech())
    act(() => { result.current.speak('apple') })
    act(() => { speakSpy.mock.calls[0][0].onstart() })
    expect(result.current.blocked).toBe(false)
  })

  it('blocked becomes true when the utterance errors', () => {
    const { result } = renderHook(() => useSpeech())
    act(() => { result.current.speak('apple') })
    act(() => { speakSpy.mock.calls[0][0].onerror() })
    expect(result.current.blocked).toBe(true)
  })

  it('cancel() firing the interrupted utterance\'s error does NOT set blocked (negative/race)', () => {
    const { result } = renderHook(() => useSpeech())
    act(() => { result.current.speak('apple') })
    const utterance = speakSpy.mock.calls[0][0]
    act(() => { result.current.cancel() })
    // Simulate the browser firing the cancelled utterance's error event
    // after cancel() has already nulled the ref.
    act(() => { utterance.onerror() })
    expect(result.current.blocked).toBe(false)
  })

  it('a fresh speak() clears a stale blocked=true immediately', () => {
    const { result } = renderHook(() => useSpeech())
    act(() => { result.current.speak('apple') })
    act(() => { speakSpy.mock.calls[0][0].onerror() })
    expect(result.current.blocked).toBe(true)

    act(() => { result.current.speak('banana') })
    expect(result.current.blocked).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useSpeech.test.js`
Expected: FAIL — `result.current.blocked` is `undefined`; also `speakSpy.mock.calls[0][0].onstart`/`.onerror` are `undefined` (not yet assigned by the hook), so calling them throws.

- [ ] **Step 3: Implement `blocked` in the hook**

Replace the full contents of `src/hooks/useSpeech.js` with:

```js
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export const SPEECH_LANG_BY_LOCALE = { en: 'en-US', es: 'es-US', pl: 'pl-PL' }

/**
 * Speaks short text aloud via the Web Speech API (SpeechSynthesis), for games
 * whose prompt is a spoken word. Mirrors useSoundPlayer's shape: speaking a new
 * phrase cancels the previous one, and any in-flight speech is cancelled on
 * unmount. `supported` is false when the browser lacks speech synthesis (or in
 * jsdom), letting callers fall back to on-screen text.
 *
 * @returns {{ speak: (text: ?string) => void, cancel: () => void, supported: boolean, blocked: boolean }}
 *   Both functions are referentially stable and safe to call when unsupported.
 *   `blocked` reflects whether the most recent speak() attempt's utterance
 *   fired 'error' rather than 'start' — surfaces a browser blocking speech
 *   synthesis without a qualifying user gesture (AU-8). It resets to false at
 *   the start of every speak() call.
 */
export default function useSpeech() {
  const { i18n } = useTranslation()
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  const Utterance = typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : undefined
  const supported = !!(synth && Utterance)

  const synthRef = useRef(synth)
  synthRef.current = synth
  const utteranceRef = useRef(null)
  const [blocked, setBlocked] = useState(false)

  const cancel = useCallback(() => {
    utteranceRef.current = null
    synthRef.current?.cancel()
  }, [])

  const speak = useCallback(text => {
    const s = synthRef.current
    if (!s || !Utterance || !text) return
    s.cancel()
    const utterance = new Utterance(text)
    utterance.lang = SPEECH_LANG_BY_LOCALE[i18n.language] ?? 'en-US'
    utterance.rate = 0.9
    utterance.onstart = () => { if (utteranceRef.current === utterance) setBlocked(false) }
    utterance.onerror = () => { if (utteranceRef.current === utterance) setBlocked(true) }
    utteranceRef.current = utterance
    setBlocked(false)
    s.speak(utterance)
  }, [Utterance, i18n.language])

  useEffect(() => () => cancel(), [cancel])

  return { speak, cancel, supported, blocked }
}
```

Note: the mock `SpeechSynthesisUtterance` class in the test file's `installSynth()` only sets `text`/`lang`/`rate` in its constructor — assigning `.onstart`/`.onerror` afterward works fine since it's a plain object property, no changes to the mock class are needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useSpeech.test.js`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSpeech.js src/hooks/__tests__/useSpeech.test.js
git commit -m "feat(123): surface blocked speech synthesis in useSpeech"
```

---

### Task 3: `ReplayButton` shared component

**Files:**
- Create: `src/components/ReplayButton.jsx`
- Create: `src/components/ReplayButton.css`
- Create: `src/components/ReplayButton.stories.jsx`
- Create: `src/components/__tests__/ReplayButton.test.jsx`
- Modify: `src/components/QuizGameShell.css:35-38` (remove, moved to `ReplayButton.css`)

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone component); will be consumed by Task 5/6 via `blocked` from Task 1/2.
- Produces: `ReplayButton({ labelKey: string, blocked: boolean, onClick: () => void })` — default export. Internally calls `t(labelKey)` and `t('common.tapToHear')` (the latter added in Task 4 — until then it renders the raw key as fallback text, which is fine since Task 3's own tests pass explicit i18n and don't assert exact hint copy beyond presence of `role="status"`).

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/ReplayButton.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import ReplayButton from '../ReplayButton'

describe('ReplayButton', () => {
  it('renders the plain button when not blocked', () => {
    render(<ReplayButton labelKey="animalSounds.replay" blocked={false} onClick={() => {}} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAccessibleName('Replay sound')
    expect(button).not.toHaveClass('game__replay--blocked')
  })

  it('does not render the hint text when not blocked', () => {
    render(<ReplayButton labelKey="animalSounds.replay" blocked={false} onClick={() => {}} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders the pulse class, hint text, and augmented label when blocked', () => {
    render(<ReplayButton labelKey="animalSounds.replay" blocked={true} onClick={() => {}} />)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('game__replay--blocked')
    expect(button.getAttribute('aria-label')).toMatch(/replay sound/i)
    expect(button.getAttribute('aria-label')).toMatch(/tap.*to hear/i)
    expect(screen.getByRole('status')).toHaveTextContent(/tap.*to hear/i)
  })

  it('calls onClick when clicked, in both states', () => {
    const onClick = vi.fn()
    const { rerender } = render(<ReplayButton labelKey="animalSounds.replay" blocked={false} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(<ReplayButton labelKey="animalSounds.replay" blocked={true} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('has no accessibility violations when blocked', async () => {
    const { container } = render(<ReplayButton labelKey="animalSounds.replay" blocked={true} onClick={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations when not blocked', async () => {
    const { container } = render(<ReplayButton labelKey="animalSounds.replay" blocked={false} onClick={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/ReplayButton.test.jsx`
Expected: FAIL — `Cannot find module '../ReplayButton'`.

- [ ] **Step 3: Create the component**

Create `src/components/ReplayButton.jsx`:

```jsx
import { useTranslation } from 'react-i18next'
import './ReplayButton.css'

// Shared 🔊 replay affordance for question-audio games (Animal Sounds,
// Fruit & Veggie ID). `blocked` drives the AU-8 recovery hint: a pulsing
// ring plus a visible "tap to hear" caption, aimed at a supervising adult
// since a pre-literate child can't read the hint themselves.
export default function ReplayButton({ labelKey, blocked, onClick }) {
  const { t } = useTranslation()
  const label = t(labelKey)
  const hint = t('common.tapToHear')

  return (
    <div className="replay-button">
      <button
        className={`game__replay${blocked ? ' game__replay--blocked' : ''}`}
        aria-label={blocked ? `${label} — ${hint}` : label}
        onClick={onClick}
      >🔊</button>
      {blocked && <div className="replay-button__hint" role="status">{hint}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Move the CSS and add the blocked/hint styles**

Modify `src/components/QuizGameShell.css`: remove lines 35-38 (the `.game__replay` block):

```diff
-.game__replay    { font-size: 2.25rem; background: rgb(255 255 255 / 30%); border-radius: 50%; width: 72px; height: 72px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; transition: background 0.15s; }
-.game__replay:hover { background: rgb(255 255 255 / 50%); }
-.game__replay:focus         { outline: none; }
-.game__replay:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

Create `src/components/ReplayButton.css`:

```css
.replay-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.game__replay    { font-size: 2.25rem; background: rgb(255 255 255 / 30%); border-radius: 50%; width: 72px; height: 72px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; transition: background 0.15s; }
.game__replay:hover { background: rgb(255 255 255 / 50%); }
.game__replay:focus         { outline: none; }
.game__replay:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }

/* AU-8: blocked-autoplay recovery hint. Amber/gold is deliberately distinct
   from the app's correct-green/wrong-red feedback vocabulary — this isn't a
   right/wrong signal, it's a "look here" cue. The static ring (below) is
   visible under reduced motion too; only the looping pulse is motion-gated. */
.game__replay--blocked { box-shadow: 0 0 0 4px rgb(255 193 7 / 70%); }

@keyframes pulse-replay {
  0%   { box-shadow: 0 0 0 4px rgb(255 193 7 / 70%); }
  70%  { box-shadow: 0 0 0 20px rgb(255 193 7 / 0%); }
  100% { box-shadow: 0 0 0 4px rgb(255 193 7 / 70%); }
}

@media (prefers-reduced-motion: no-preference) {
  .game__replay--blocked { animation: pulse-replay 1.2s ease-in-out infinite; }
}

.replay-button__hint { color: white; font-size: 0.9375rem; font-weight: 700; text-align: center; }
```

- [ ] **Step 5: Create the Storybook stories**

Create `src/components/ReplayButton.stories.jsx`:

```jsx
import ReplayButton from './ReplayButton'

export default {
  title: 'Components/ReplayButton',
  component: ReplayButton,
}

const baseArgs = { labelKey: 'animalSounds.replay', onClick: () => {} }

export const Default = { args: { ...baseArgs, blocked: false } }
export const Blocked = { args: { ...baseArgs, blocked: true } }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/ReplayButton.test.jsx`
Expected: PASS (all 6 tests).

- [ ] **Step 7: Run the full unit suite to confirm the CSS move broke nothing**

Run: `npx vitest run`
Expected: PASS — no other test references `.game__replay` styling directly (only `aria-label` text via `getByLabelText`), so moving the CSS block has no effect on any existing test.

- [ ] **Step 8: Register the new stories with visual regression**

`e2e/visual.spec.js`'s `stories` array (Layer 4) is a **hardcoded list of story ids**, not auto-discovered from `*.stories.jsx` files — a new story that isn't added here simply never gets screenshot-tested. Add two new entries to the array in `e2e/visual.spec.js`, alphabetically among the existing `components-*` entries (after `components-orientationoverlay--portrait-required`, before `components-badgegallery--all-locked` — matching the file's existing rough grouping is fine; exact placement doesn't matter functionally):

```diff
   'components-orientationoverlay--default',
   'components-orientationoverlay--portrait-required',
+  'components-replaybutton--default',
+  'components-replaybutton--blocked',
   'components-badgegallery--all-locked',
```

- [ ] **Step 9: Generate baseline screenshots for the new stories**

Run: `npx playwright test e2e/visual.spec.js --update-snapshots`
Expected: PASS, and two new PNG files appear under `e2e/visual.spec.js-snapshots/`: `components-replaybutton--default-*.png` and `components-replaybutton--blocked-*.png` (exact filename suffix depends on the OS/browser project name Playwright appends — check `e2e/visual.spec.js-snapshots/` after running to confirm the two new files exist alongside the untouched existing ones). Re-run `npx playwright test e2e/visual.spec.js` (without `--update-snapshots`) once more to confirm all 38 stories now pass against their (36 existing + 2 new) baselines.

- [ ] **Step 10: Commit**

```bash
git add src/components/ReplayButton.jsx src/components/ReplayButton.css src/components/ReplayButton.stories.jsx src/components/__tests__/ReplayButton.test.jsx src/components/QuizGameShell.css e2e/visual.spec.js e2e/visual.spec.js-snapshots/
git commit -m "feat(123): add shared ReplayButton component with blocked-hint UI"
```

---

### Task 4: i18n — `common.tapToHear`

**Files:**
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/es.json`
- Modify: `src/i18n/pl.json`
- Test: `src/i18n/__tests__/` — check first whether a coverage test already asserts key parity across locales (see Step 1).

**Interfaces:**
- Produces: `common.tapToHear` translation key, consumed by `ReplayButton` (Task 3, already written to call `t('common.tapToHear')`).

- [ ] **Step 1: Check for an existing locale-parity test**

Run: `npx vitest run src/i18n 2>&1 | head -50` and separately `Grep` for `SUPPORTED_LOCALES` / key-parity assertions under `src/i18n/__tests__/` if that directory exists (it may not — confirm before assuming). If a test iterates all locale files and asserts every key present in `en.json` also exists in `es.json`/`pl.json`, it will already fail once you add `common.tapToHear` to only `en.json`, and pass once all three are updated in Step 2 — no separate new test is needed for this task. If no such test exists, no action needed beyond Step 2 (manual key-parity is enough; this codebase doesn't have per-string automated i18n coverage beyond that check per the `useSpeech.test.js` `SPEECH_LANG_BY_LOCALE coverage` pattern, which is locale-list coverage, not string-key coverage).

- [ ] **Step 2: Add the key to all three locale files**

In `src/i18n/en.json`, inside the `"common": { ... }` object, add (after `"answerWrongAnnounce": "Not quite!"`, before the closing `}`):

```diff
     "answerCorrectAnnounce": "Correct!",
-    "answerWrongAnnounce": "Not quite!"
+    "answerWrongAnnounce": "Not quite!",
+    "tapToHear": "Tap 🔊 to hear it!"
   },
```

In `src/i18n/es.json`, find the equivalent `"common"` block's last key and add:

```diff
-    "answerWrongAnnounce": "¡No es correcto!"
+    "answerWrongAnnounce": "¡No es correcto!",
+    "tapToHear": "¡Toca 🔊 para escucharlo!"
   },
```

(Read the actual last key/line in `src/i18n/es.json`'s `common` block before editing — copy its exact current closing punctuation/key rather than assuming `answerWrongAnnounce` is literally last; insert `tapToHear` as the new last key in that object either way.)

In `src/i18n/pl.json`, same pattern:

```diff
-    "answerWrongAnnounce": "Niezupełnie!"
+    "answerWrongAnnounce": "Niezupełnie!",
+    "tapToHear": "Dotknij 🔊, aby usłyszeć!"
   },
```

(Same caveat — verify the actual last key in `pl.json`'s `common` block first.)

- [ ] **Step 3: Verify the JSON is still valid and the app still builds translations**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/en.json'))" && node -e "JSON.parse(require('fs').readFileSync('src/i18n/es.json'))" && node -e "JSON.parse(require('fs').readFileSync('src/i18n/pl.json'))" && echo OK`
Expected: `OK` (no `SyntaxError`).

- [ ] **Step 4: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/en.json src/i18n/es.json src/i18n/pl.json
git commit -m "feat(123): add common.tapToHear i18n string (en/es/pl)"
```

---

### Task 5: Wire `AnimalSoundsGame` to `ReplayButton`

**Files:**
- Modify: `src/games/animal-sounds/index.jsx`
- Modify: `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`

**Interfaces:**
- Consumes: `useSoundPlayer()`'s `blocked` (Task 1), `ReplayButton` (Task 3), `common.tapToHear` (Task 4).

- [ ] **Step 1: Write the failing tests**

Add to `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`, inside the main `describe('AnimalSoundsGame', ...)` block (anywhere after the existing `'shows replay button'` test):

```jsx
  it('shows the tap-to-hear recovery hint when audio.play() is blocked', async () => {
    window.HTMLMediaElement.prototype.play.mockRejectedValueOnce(new Error('NotAllowedError'))
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    await act(async () => {})
    expect(screen.getByText(/tap.*to hear/i)).toBeInTheDocument()
  })

  it('does not show the tap-to-hear hint when audio plays normally', async () => {
    await act(async () => { render(<AnimalSoundsGame onGameEnd={onGameEnd} />) })
    await act(async () => {})
    expect(screen.queryByText(/tap.*to hear/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations while the recovery hint is showing', async () => {
    window.HTMLMediaElement.prototype.play.mockRejectedValueOnce(new Error('NotAllowedError'))
    let container
    await act(async () => { container = render(<AnimalSoundsGame onGameEnd={onGameEnd} />).container })
    await act(async () => {})
    expect(screen.getByText(/tap.*to hear/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })
```

Note for the implementer: the hint `div` uses `role="status"` for screen-reader announcement (see `ReplayButton.jsx` in Task 3), but it has no accessible *name* beyond its own text content, and `QuizGameShell` already renders an unrelated `data-testid="quiz-live-region"` status region — so these tests assert on visible text content (`getByText`/`queryByText`), not on `role="status"` queries, to stay unambiguous.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`
Expected: FAIL on the first and third new tests (no hint text renders yet — `AnimalSoundsGame` still renders the plain inline button, not `ReplayButton`). The second new test passes trivially already (nothing to fail), which is expected and fine — it's the negative case establishing a baseline before the change, not a test that's supposed to fail first.

- [ ] **Step 3: Wire the component**

Modify `src/games/animal-sounds/index.jsx`:

```diff
 import { useCallback } from 'react'
 import { useTranslation } from 'react-i18next'
 import useGameSession from '../../hooks/useGameSession'
 import useSoundPlayer from '../../hooks/useSoundPlayer'
 import useQuestionAudio from '../../hooks/useQuestionAudio'
 import QuizGameShell from '../../components/QuizGameShell'
+import ReplayButton from '../../components/ReplayButton'
 import animals from './data/animals'
 import { getSoundUrl } from './data/sounds'
 import manifest from './manifest.json'
```

```diff
   // Game-owned question audio: its own player instance, independent of the
   // shell's chime layer. The announce/stop lifecycle lives in useQuestionAudio.
-  const { play, stop } = useSoundPlayer()
+  const { play, stop, blocked } = useSoundPlayer()
   const announce = useCallback(animal => play(getSoundUrl(animal.correct.sound)), [play])
   const replay = useQuestionAudio({ index, current, showIntro, introResolved, done, announce, stop })
```

```diff
       renderPromptExtra={() => (
-        <button className="game__replay" aria-label={t('animalSounds.replay')} onClick={replay}>🔊</button>
+        <ReplayButton labelKey="animalSounds.replay" blocked={blocked} onClick={replay} />
       )}
```

The `t` import/usage elsewhere in the file (e.g. `t('animalSounds.howToPlay')`, `t('animalSounds.prompt')`) is untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/games/animal-sounds/index.jsx src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx
git commit -m "feat(123): wire AnimalSoundsGame's replay button to the blocked-audio hint"
```

---

### Task 6: Wire `FruitVeggieIdGame` to `ReplayButton`

**Files:**
- Modify: `src/games/fruit-veggie-id/index.jsx`
- Modify: `src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`

**Interfaces:**
- Consumes: `useSpeech()`'s `blocked` (Task 2), `ReplayButton` (Task 3), `common.tapToHear` (Task 4).

- [ ] **Step 1: Write the failing tests**

The existing test file mocks `useSpeech` wholesale (`vi.mock('../../../hooks/useSpeech', ...)`), so `blocked` must be added to that mock. Modify the mock near the top of `src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`:

```diff
 let mockSupported = true
+let mockBlocked = false
 const mockSpeak = vi.fn()
 const mockCancel = vi.fn()
 vi.mock('../../../hooks/useSpeech', () => ({
-  default: () => ({ speak: mockSpeak, cancel: mockCancel, supported: mockSupported }),
+  default: () => ({ speak: mockSpeak, cancel: mockCancel, supported: mockSupported, blocked: mockBlocked }),
 }))
```

And reset it in the existing `beforeEach`:

```diff
 beforeEach(() => {
   vi.clearAllMocks()
   mockLoaded = true
   mockSupported = true
+  mockBlocked = false
```

Then add new tests inside `describe('FruitVeggieIdGame', ...)`:

```jsx
  it('shows the tap-to-hear recovery hint when speech is blocked', async () => {
    mockBlocked = true
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    expect(screen.getByText(/tap.*to hear/i)).toBeInTheDocument()
  })

  it('does not show the tap-to-hear hint when speech is not blocked', async () => {
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByText(/tap.*to hear/i)).not.toBeInTheDocument()
  })

  it('does not show the recovery hint when speech is unsupported (no replay button at all)', async () => {
    mockSupported = false
    mockBlocked = true
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByText(/tap.*to hear/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations while the recovery hint is showing', async () => {
    mockBlocked = true
    let container
    await act(async () => { container = render(<FruitVeggieIdGame onGameEnd={onGameEnd} />).container })
    expect(screen.getByText(/tap.*to hear/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`
Expected: FAIL on the first and fourth new tests (hint never renders yet). The other two pass trivially as baseline negatives — expected.

- [ ] **Step 3: Wire the component**

Modify `src/games/fruit-veggie-id/index.jsx`:

```diff
 import { useCallback } from 'react'
 import { useTranslation } from 'react-i18next'
 import useGameSession from '../../hooks/useGameSession'
 import useSpeech from '../../hooks/useSpeech'
 import useQuestionAudio from '../../hooks/useQuestionAudio'
 import QuizGameShell from '../../components/QuizGameShell'
+import ReplayButton from '../../components/ReplayButton'
 import foods from './data/foods'
 import manifest from './manifest.json'
```

```diff
-  const { speak, cancel, supported } = useSpeech()
+  const { speak, cancel, supported, blocked } = useSpeech()
```

```diff
       renderPromptExtra={() => supported
-        ? <button className="game__replay" aria-label={t('fruitVeggie.replay')} onClick={replay}>🔊</button>
+        ? <ReplayButton labelKey="fruitVeggie.replay" blocked={blocked} onClick={replay} />
         : null}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/games/fruit-veggie-id/index.jsx src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx
git commit -m "feat(123): wire FruitVeggieIdGame's replay button to the blocked-speech hint"
```

---

### Task 7: e2e coverage

**Files:**
- Modify: `e2e/animal-sounds.spec.js`

**Interfaces:**
- Consumes: the shipped `ReplayButton` hint text (`common.tapToHear`, English: "Tap 🔊 to hear it!") — real-browser confirmation that `HTMLMediaElement.prototype.play` rejection actually reaches the DOM as visible text, which jsdom-based unit tests can assert but can't fully guarantee reflects real browser Promise/DOM timing.

- [ ] **Step 1: Add the new specs**

Append to `e2e/animal-sounds.spec.js` (after the last existing `test(...)` block):

```js
test('animal sounds: blocked audio autoplay shows the tap-to-hear recovery hint', async ({ page }) => {
  await page.addInitScript(() => {
    window.HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'))
  })
  await page.goto('/game/animal-sounds')
  await page.getByTestId('game-intro-start').click()
  await page.locator('[data-animal-id]').first().waitFor()

  await expect(page.getByText('Tap 🔊 to hear it!')).toBeVisible()
  await expect(page.getByRole('button', { name: /tap 🔊 to hear it/i })).toBeVisible()
})

test('animal sounds: no recovery hint appears when audio plays normally', async ({ page }) => {
  await page.goto('/game/animal-sounds')
  await page.getByTestId('game-intro-start').click()
  await page.locator('[data-animal-id]').first().waitFor()

  await expect(page.getByText('Tap 🔊 to hear it!')).not.toBeVisible()
})
```

- [ ] **Step 2: Run the new specs**

Run: `npx playwright test e2e/animal-sounds.spec.js`
Expected: PASS (all specs in the file, old and new — Playwright auto-starts the dev server per `playwright.config.js`).

- [ ] **Step 3: Commit**

```bash
git add e2e/animal-sounds.spec.js
git commit -m "test(123): e2e coverage for the blocked-audio recovery hint"
```

---

### Task 8: Docs and version bump

**Files:**
- Modify: `docs/ENHANCEMENTS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `src/games/animal-sounds/manifest.json`
- Modify: `src/games/fruit-veggie-id/manifest.json`

- [ ] **Step 1: Remove the resolved backlog entry**

In `docs/ENHANCEMENTS.md`, delete this line from the `## UX` section (it currently reads, in full):

```
- **Visible recovery when audio autoplay is blocked (AU-8)** — `useSoundPlayer.play()` deliberately swallows `audio.play()` rejections, so a blocked autoplay leaves an Animal Sounds question with no prompt and no cue; surface the rejection and pulse the 🔊 replay button with a localized "tap to hear" hint until first successful playback. (From `docs/accessibility_usability.md`.)
```

Leave the blank line structure around it intact (the section will still have a trailing blank line before `## Accessibility`, matching how AU-7's removal in `[0.32.0]` was handled — no dangling double-blank-line).

- [ ] **Step 2: Bump versions**

`package.json`: `"version": "0.33.0"` → `"version": "0.33.1"`.

`src/games/animal-sounds/manifest.json`: `"version": "1.6.3"` → `"version": "1.6.4"`.

`src/games/fruit-veggie-id/manifest.json`: `"version": "1.0.1"` → `"version": "1.0.2"`.

- [ ] **Step 3: Add the CHANGELOG entry**

In `CHANGELOG.md`, insert a new entry directly under the `## [0.33.0] - 2026-07-22` heading (i.e. as the new top entry, above it):

```markdown
## [0.33.1] - 2026-07-22

### Fixed

- Blocked audio autoplay and blocked speech synthesis no longer fail silently (issue #123, AU-8). Root cause: `useSoundPlayer.play()` deliberately swallowed `audio.play()` rejections as a crash guard, and `useSpeech.speak()` had no failure signal at all — so a browser blocking either without a qualifying user gesture left Animal Sounds or Fruit & Veggie ID showing answer choices with no prompt and no cue anything had failed. Both hooks now expose a `blocked` flag (from `audio.play()`'s rejection and the Web Speech API's utterance `onerror` event respectively, guarded against false positives from the routine `stop()`/`cancel()` calls that fire on every question change), and a new shared `ReplayButton` component (`src/components/ReplayButton.jsx`, replacing the duplicated inline button in both games) pulses the 🔊 button with a localized "tap to hear" hint until the next successful playback.
```

- [ ] **Step 4: Verify docs build/lint cleanly**

Run: `npm run lint:css` (confirms `ReplayButton.css` passes stylelint) and `npm run lint` (confirms no stray unused imports/vars across all modified `.jsx` files).
Expected: both PASS with zero errors. If `lint` fails due to a stale `storybook-static/` build directory tripping ESLint (a known false-positive in this repo — see project memory), remove it first: check for `storybook-static/` at the repo root and `rm -rf` it if present, then re-run.

- [ ] **Step 5: Run the full test suite one more time**

Run: `npm test -- run` (or `npx vitest run`) and `npx playwright test e2e/animal-sounds.spec.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/ENHANCEMENTS.md CHANGELOG.md package.json src/games/animal-sounds/manifest.json src/games/fruit-veggie-id/manifest.json
git commit -m "docs(123): changelog and version bump for the AU-8 audio recovery hint"
```

---

## Post-plan verification (do once, after Task 8)

- [ ] Run `npm run build` — confirms the production bundle compiles with the new component/CSS/i18n files.
- [ ] Run `npm run coverage` — confirms no coverage regression from the CSS move or new files.
- [ ] Run `npm run e2e` (full suite, not just `animal-sounds.spec.js`) — confirms the CSS move (`.game__replay` relocated from `QuizGameShell.css` to `ReplayButton.css`) didn't break `visual.spec.js`'s existing Animal Sounds / Fruit & Veggie ID story screenshots (same computed styles, different source file, should produce identical pixels — but this is the layer that would catch it if not).
