# Fruit & Veggie ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Fruit & Veggie ID" quiz game where the browser speaks a fruit/vegetable's name aloud and the child taps the matching picture, extracting the reusable speech + question-audio lifecycle into shared engine hooks.

**Architecture:** Reuses the existing `QuizGameShell` + `useGameSession` engine (identical to Animal Sounds). Two new **core** hooks are added: `useSpeech` (Web Speech API wrapper) and `useQuestionAudio` (the "announce current question / stop on leave/done/intro / manual replay" lifecycle, extracted from Animal Sounds and shared by both games). Choice tiles are picture-only (emoji, no text label); a text fallback covers browsers without speech synthesis.

**Tech Stack:** React 18, Vite, react-i18next, Vitest + React Testing Library + jsdom, jest-axe, Playwright (E2E/visual), Storybook.

## Global Constraints

- **Design tokens only:** use `var(--color-*)` / `var(--radius-*)`, never hardcoded hex, in CSS. (Manifest `color` is JSON and stays hex, matching existing manifests.)
- **i18n:** every user-facing string comes from `src/games/fruit-veggie-id/i18n/en.json` under a game-unique top-level namespace (`fruitVeggie`, `food`). No hardcoded copy in JSX. i18n namespace collisions throw at load — keep keys unique.
- **Mock the hook, not the browser primitive:** tests mock `useSpeech` / `useSoundPlayer`, never the raw `SpeechSynthesis`/`Audio` globals (except inside `useSpeech`'s own hook test).
- **Timed-feedback tests:** use `vi.useFakeTimers()` + `fireEvent`, never `userEvent`, when advancing correct/wrong delays.
- **Shareable code lives in the engine:** generic hooks go in `src/hooks/`, generic CSS in `src/components/*.css` — never in a game folder.
- **Version bump + changelog** on release: `package.json` app version and `CHANGELOG.md`.
- **Auto-discovery:** no registry/import edits — a `manifest.json` (with required `tags`) + `index.jsx` default export accepting `onGameEnd` is all that registers a game.

## File Structure

**Created:**
- `src/hooks/useSpeech.js` — Web Speech API wrapper (core).
- `src/hooks/__tests__/useSpeech.test.js`
- `src/hooks/useQuestionAudio.js` — question-announcement lifecycle (core).
- `src/hooks/__tests__/useQuestionAudio.test.js`
- `src/games/fruit-veggie-id/manifest.json`
- `src/games/fruit-veggie-id/data/foods.js`
- `src/games/fruit-veggie-id/i18n/en.json`
- `src/games/fruit-veggie-id/index.jsx`
- `src/games/fruit-veggie-id/FruitVeggieIdGame.stories.jsx`
- `src/games/fruit-veggie-id/__tests__/foods.test.js`
- `src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`

**Modified:**
- `src/games/animal-sounds/index.jsx` — refactor onto `useQuestionAudio`; drop CSS import.
- `src/components/QuizGameShell.css` — add `.game__replay` (moved from Animal Sounds).
- `src/components/GameChoiceGrid.css` — add `.game__choice-emoji`.
- `src/games/animal-sounds/AnimalSoundsGame.css` — **deleted** (now empty).
- `README.md`, `CHANGELOG.md`, `package.json`, `docs/TESTING.md` — docs + version.

**Note on i18n in tests:** `src/test-setup.js` imports `./i18n`, so i18n is initialized globally and `t()` returns real English strings in every test — assert against the actual copy (as the Animal Sounds suite does).

---

### Task 1: `useSpeech` core hook

**Files:**
- Create: `src/hooks/useSpeech.js`
- Test: `src/hooks/__tests__/useSpeech.test.js`

**Interfaces:**
- Consumes: nothing (leaf hook).
- Produces: `export default function useSpeech(): { speak: (text: ?string) => void, cancel: () => void, supported: boolean }`. `speak` cancels any in-flight utterance then speaks `text` (no-op for falsy text or when unsupported); `cancel` stops speech; `supported` is `true` only when both `window.speechSynthesis` and `window.SpeechSynthesisUtterance` exist. Both functions are referentially stable; unmount cancels.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useSpeech.test.js`:

```js
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import useSpeech from '../useSpeech'

let speakSpy, cancelSpy

function installSynth() {
  speakSpy = vi.fn()
  cancelSpy = vi.fn()
  window.speechSynthesis = { speak: speakSpy, cancel: cancelSpy }
  window.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; this.lang = ''; this.rate = 1 }
  }
}

function removeSynth() {
  delete window.speechSynthesis
  delete window.SpeechSynthesisUtterance
}

afterEach(() => { removeSynth(); vi.restoreAllMocks() })

describe('useSpeech (supported)', () => {
  beforeEach(installSynth)

  it('reports supported when the API is present', () => {
    const { result } = renderHook(() => useSpeech())
    expect(result.current.supported).toBe(true)
  })

  it('speak() cancels prior speech then speaks an utterance with the text', () => {
    const { result } = renderHook(() => useSpeech())
    result.current.speak('apple')
    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(speakSpy).toHaveBeenCalledTimes(1)
    expect(speakSpy.mock.calls[0][0].text).toBe('apple')
    expect(speakSpy.mock.calls[0][0].lang).toBe('en-US')
  })

  it('cancel() stops in-flight speech', () => {
    const { result } = renderHook(() => useSpeech())
    result.current.cancel()
    expect(cancelSpy).toHaveBeenCalled()
  })

  it('cancels speech on unmount', () => {
    const { unmount } = renderHook(() => useSpeech())
    cancelSpy.mockClear()
    unmount()
    expect(cancelSpy).toHaveBeenCalledTimes(1)
  })

  it('speak() is a no-op for empty or nullish text (no utterance)', () => {
    const { result } = renderHook(() => useSpeech())
    result.current.speak('')
    result.current.speak(null)
    expect(speakSpy).not.toHaveBeenCalled()
  })
})

describe('useSpeech (unsupported)', () => {
  beforeEach(removeSynth)

  it('reports not supported and speak/cancel are safe no-ops', () => {
    const { result } = renderHook(() => useSpeech())
    expect(result.current.supported).toBe(false)
    expect(() => { result.current.speak('apple'); result.current.cancel() }).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useSpeech.test.js`
Expected: FAIL — cannot resolve `../useSpeech`.

- [ ] **Step 3: Write minimal implementation**

Create `src/hooks/useSpeech.js`:

```js
import { useCallback, useEffect, useRef } from 'react'

/**
 * Speaks short text aloud via the Web Speech API (SpeechSynthesis), for games
 * whose prompt is a spoken word. Mirrors useSoundPlayer's shape: speaking a new
 * phrase cancels the previous one, and any in-flight speech is cancelled on
 * unmount. `supported` is false when the browser lacks speech synthesis (or in
 * jsdom), letting callers fall back to on-screen text.
 *
 * @returns {{ speak: (text: ?string) => void, cancel: () => void, supported: boolean }}
 *   Both functions are referentially stable and safe to call when unsupported.
 */
export default function useSpeech() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  const Utterance = typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : undefined
  const supported = !!(synth && Utterance)

  const synthRef = useRef(synth)
  synthRef.current = synth

  const cancel = useCallback(() => {
    synthRef.current?.cancel()
  }, [])

  const speak = useCallback(text => {
    const s = synthRef.current
    if (!s || !Utterance || !text) return
    s.cancel()
    const utterance = new Utterance(text)
    utterance.lang = 'en-US'
    utterance.rate = 0.9
    s.speak(utterance)
  }, [Utterance])

  useEffect(() => () => cancel(), [cancel])

  return { speak, cancel, supported }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useSpeech.test.js`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSpeech.js src/hooks/__tests__/useSpeech.test.js
git commit -m "feat(68): useSpeech hook — Web Speech API wrapper with fallback"
```

---

### Task 2: `useQuestionAudio` core hook + refactor Animal Sounds onto it

**Files:**
- Create: `src/hooks/useQuestionAudio.js`
- Test: `src/hooks/__tests__/useQuestionAudio.test.js`
- Modify: `src/games/animal-sounds/index.jsx`
- Modify: `src/components/QuizGameShell.css` (add `.game__replay`)
- Delete: `src/games/animal-sounds/AnimalSoundsGame.css`

**Interfaces:**
- Consumes: session fields from `useGameSession` (`index`, `current`, `showIntro`, `introResolved`, `done`).
- Produces: `export default function useQuestionAudio({ index, current, showIntro, introResolved, done, announce, stop }): () => void`. Auto-calls `announce(current)` when a question becomes active (only when `!showIntro && introResolved`); calls `stop()` when leaving a question (cleanup on `current` change) and when `done || showIntro`; returns a stable `replay()` that re-calls `announce(current)`. `announce: (current) => void` and `stop: () => void` are game-supplied.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useQuestionAudio.test.js`:

```js
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import useQuestionAudio from '../useQuestionAudio'

const q1 = { correct: { id: 'a' } }
const q2 = { correct: { id: 'b' } }

let announce, stop
beforeEach(() => { announce = vi.fn(); stop = vi.fn() })

const base = {
  index: 0, current: q1, showIntro: false, introResolved: true, done: false,
}

describe('useQuestionAudio', () => {
  it('announces the active question once on mount', () => {
    renderHook(() => useQuestionAudio({ ...base, announce, stop }))
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith(q1)
  })

  it('re-announces via the returned replay callback', () => {
    const { result } = renderHook(() => useQuestionAudio({ ...base, announce, stop }))
    announce.mockClear()
    result.current()
    expect(announce).toHaveBeenCalledWith(q1)
  })

  it('re-announces when the question index changes', () => {
    const { rerender } = renderHook(
      props => useQuestionAudio({ ...props, announce, stop }),
      { initialProps: base }
    )
    announce.mockClear()
    rerender({ ...base, index: 1, current: q2 })
    expect(announce).toHaveBeenCalledWith(q2)
  })

  it('stops audio when leaving a question (current changes)', () => {
    const { rerender } = renderHook(
      props => useQuestionAudio({ ...props, announce, stop }),
      { initialProps: base }
    )
    rerender({ ...base, index: 1, current: q2 })
    expect(stop).toHaveBeenCalled()
  })

  it('stops audio when the session is done', () => {
    const { rerender } = renderHook(
      props => useQuestionAudio({ ...props, announce, stop }),
      { initialProps: base }
    )
    stop.mockClear()
    rerender({ ...base, done: true })
    expect(stop).toHaveBeenCalled()
  })

  // Negative: leak guards
  it('does NOT announce while the intro is showing', () => {
    renderHook(() => useQuestionAudio({ ...base, showIntro: true, announce, stop }))
    expect(announce).not.toHaveBeenCalled()
  })

  it('does NOT announce until the intro decision has resolved', () => {
    renderHook(() => useQuestionAudio({ ...base, introResolved: false, announce, stop }))
    expect(announce).not.toHaveBeenCalled()
  })

  it('does NOT announce when there is no current question', () => {
    renderHook(() => useQuestionAudio({ ...base, current: null, announce, stop }))
    expect(announce).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useQuestionAudio.test.js`
Expected: FAIL — cannot resolve `../useQuestionAudio`.

- [ ] **Step 3: Write the hook**

Create `src/hooks/useQuestionAudio.js`:

```js
import { useCallback, useEffect } from 'react'

/**
 * Shared question-announcement lifecycle for quiz games whose prompt is played
 * aloud (Animal Sounds' sound clip, Fruit & Veggie ID's spoken name). It
 * auto-announces the active question, stops audio when leaving a question / on
 * the results screen / on the intro, and returns a stable replay callback for a
 * manual "play again" button. `announce`/`stop` are supplied by the game so the
 * engine stays audio-source-agnostic.
 *
 * @param {object}   p
 * @param {number}   p.index          session.index — drives re-announce per question
 * @param {?object}  p.current        session.current — the active question, or null
 * @param {boolean}  p.showIntro      session.showIntro
 * @param {boolean}  p.introResolved  session.introResolved
 * @param {boolean}  p.done           session.done
 * @param {(current: object) => void} p.announce  plays the prompt for `current`
 * @param {() => void} p.stop         stops any in-flight prompt audio
 * @returns {() => void} replay — re-announces the current question
 */
export default function useQuestionAudio({ index, current, showIntro, introResolved, done, announce, stop }) {
  const replay = useCallback(() => {
    if (!current) return
    announce(current)
  }, [current, announce])

  // Stop any in-flight audio when moving away from this question.
  useEffect(() => {
    if (!current) return
    return () => { stop() }
  }, [current, stop])

  // Auto-announce the active question — but never during loading or the intro.
  useEffect(() => {
    if (!current || showIntro || !introResolved) return
    replay()
  }, [index, replay, current, showIntro, introResolved])

  // Stop when the session ends or returns to the intro screen.
  useEffect(() => {
    if (done || showIntro) stop()
  }, [done, showIntro, stop])

  return replay
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useQuestionAudio.test.js`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Move `.game__replay` into shared shell CSS**

In `src/components/QuizGameShell.css`, append these rules (moved verbatim from `AnimalSoundsGame.css`) after the `.game__timeout` rule:

```css
.game__replay    { font-size: 36px; background: rgb(255 255 255 / 30%); border-radius: 50%; width: 72px; height: 72px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; transition: background 0.15s; }
.game__replay:hover { background: rgb(255 255 255 / 50%); }
.game__replay:focus         { outline: none; }
.game__replay:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

Also update the top-of-file comment: change `(swatch, replay button, per-game overrides)` to `(swatch, per-game overrides)` since the replay button is now shared here.

- [ ] **Step 6: Refactor Animal Sounds onto the hook and delete its now-empty CSS**

Replace `src/games/animal-sounds/index.jsx` with:

```jsx
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import useSoundPlayer from '../../hooks/useSoundPlayer'
import useQuestionAudio from '../../hooks/useQuestionAudio'
import QuizGameShell from '../../components/QuizGameShell'
import animals from './data/animals'
import { getSoundUrl } from './data/sounds'
import manifest from './manifest.json'

const CHOICE_COLORS = [
  'var(--color-lavender-dark)',
  'var(--color-teal-dark)',
  'var(--color-aqua-dark)',
  'var(--color-lilac-dark)',
]

export default function AnimalSoundsGame({ onGameEnd }) {
  const { t } = useTranslation()
  const session = useGameSession({ gameId: 'animal-sounds', items: animals })
  const { current, index, done, showIntro, introResolved } = session

  // Game-owned question audio: its own player instance, independent of the
  // shell's chime layer. The announce/stop lifecycle lives in useQuestionAudio.
  const { play, stop } = useSoundPlayer()
  const announce = useCallback(animal => play(getSoundUrl(animal.correct.sound)), [play])
  const replay = useQuestionAudio({ index, current, showIntro, introResolved, done, announce, stop })

  return (
    <QuizGameShell
      session={session}
      manifest={manifest}
      onGameEnd={onGameEnd}
      instructions={t('animalSounds.howToPlay')}
      correctTestId="correct-animal-id"
      prompt={t('animalSounds.prompt')}
      renderPromptExtra={() => (
        <button className="game__replay" aria-label={t('animalSounds.replay')} onClick={replay}>🔊</button>
      )}
      getChoiceProps={(animal, i) => ({
        style: { background: CHOICE_COLORS[i % CHOICE_COLORS.length] },
        'data-animal-id': animal.id,
      })}
      renderChoiceContent={animal => (
        <>
          {animal.emoji}
          <span className="game__choice-name">{t(animal.nameKey)}</span>
        </>
      )}
      renderMissedItem={animal => (
        <>
          <span aria-hidden="true">{animal.emoji}</span> {t(animal.nameKey)}
        </>
      )}
    />
  )
}
```

Then delete the empty stylesheet:

```bash
git rm src/games/animal-sounds/AnimalSoundsGame.css
```

(The `import './AnimalSoundsGame.css'` line is already absent from the rewritten file above.)

- [ ] **Step 7: Run Animal Sounds + hook tests to verify the refactor is behavior-preserving**

Run: `npx vitest run src/games/animal-sounds src/hooks/__tests__/useQuestionAudio.test.js`
Expected: PASS — all existing Animal Sounds tests (including "stops in-flight audio before advancing", "stops in-flight audio when the session ends", and the "no audio leak before intro" guard) still pass, proving the extraction preserved behavior.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useQuestionAudio.js src/hooks/__tests__/useQuestionAudio.test.js src/games/animal-sounds/index.jsx src/components/QuizGameShell.css
git rm src/games/animal-sounds/AnimalSoundsGame.css
git commit -m "refactor(68): extract useQuestionAudio; Animal Sounds onto it; share .game__replay CSS"
```

---

### Task 3: Fruit & Veggie data + i18n + manifest

**Files:**
- Create: `src/games/fruit-veggie-id/manifest.json`
- Create: `src/games/fruit-veggie-id/data/foods.js`
- Create: `src/games/fruit-veggie-id/i18n/en.json`
- Test: `src/games/fruit-veggie-id/__tests__/foods.test.js`

**Interfaces:**
- Produces: `foods` — default export, array of `{ id: string, nameKey: string, emoji: string }` (12 items). `nameKey` is always `food.<id>.name`. i18n adds top-level `fruitVeggie` (keys `prompt`, `promptFallback`, `replay`, `howToPlay`) and `food` (per-id `{ name }`). Manifest `id` is `fruit-veggie-id`.

- [ ] **Step 1: Write the failing test**

Create `src/games/fruit-veggie-id/__tests__/foods.test.js`:

```js
import { describe, it, expect } from 'vitest'
import i18n from '../../../i18n'
import foods from '../data/foods'

describe('foods data', () => {
  it('exports an array of exactly 12 foods', () => {
    expect(Array.isArray(foods)).toBe(true)
    expect(foods.length).toBe(12)
  })

  it('every food has id, nameKey and emoji', () => {
    for (const food of foods) {
      expect(food.id,      `${food.nameKey} missing id`).toBeTruthy()
      expect(food.nameKey, `${food.id} missing nameKey`).toBeTruthy()
      expect(food.emoji,   `${food.id} missing emoji`).toBeTruthy()
    }
  })

  it('nameKey always follows the food.<id>.name convention', () => {
    for (const food of foods) {
      expect(food.nameKey).toBe(`food.${food.id}.name`)
    }
  })

  // Negative: no collisions
  it('all ids are unique', () => {
    const ids = foods.map(f => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all emojis are unique', () => {
    const emojis = foods.map(f => f.emoji)
    expect(new Set(emojis).size).toBe(emojis.length)
  })

  // Negative: no missing translations
  it('every nameKey resolves to a real, non-fallback translation', () => {
    for (const food of foods) {
      expect(i18n.exists(food.nameKey), `${food.nameKey} not in i18n`).toBe(true)
      expect(i18n.t(food.nameKey)).not.toBe(food.nameKey)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/games/fruit-veggie-id/__tests__/foods.test.js`
Expected: FAIL — cannot resolve `../data/foods`.

- [ ] **Step 3: Create the data file**

Create `src/games/fruit-veggie-id/data/foods.js`:

```js
const foods = [
  { id: 'apple',      nameKey: 'food.apple.name',      emoji: '🍎' },
  { id: 'banana',     nameKey: 'food.banana.name',     emoji: '🍌' },
  { id: 'orange',     nameKey: 'food.orange.name',     emoji: '🍊' },
  { id: 'strawberry', nameKey: 'food.strawberry.name', emoji: '🍓' },
  { id: 'grapes',     nameKey: 'food.grapes.name',     emoji: '🍇' },
  { id: 'watermelon', nameKey: 'food.watermelon.name', emoji: '🍉' },
  { id: 'carrot',     nameKey: 'food.carrot.name',     emoji: '🥕' },
  { id: 'tomato',     nameKey: 'food.tomato.name',     emoji: '🍅' },
  { id: 'corn',       nameKey: 'food.corn.name',       emoji: '🌽' },
  { id: 'broccoli',   nameKey: 'food.broccoli.name',   emoji: '🥦' },
  { id: 'potato',     nameKey: 'food.potato.name',     emoji: '🥔' },
  { id: 'pepper',     nameKey: 'food.pepper.name',     emoji: '🫑' },
]

export default foods
```

- [ ] **Step 4: Create the i18n file**

Create `src/games/fruit-veggie-id/i18n/en.json`:

```json
{
  "fruitVeggie": {
    "prompt": "Which one did you hear?",
    "promptFallback": "Find the {{name}}!",
    "replay": "Say it again",
    "howToPlay": "Listen to the name, then tap the matching picture!"
  },
  "food": {
    "apple": { "name": "Apple" },
    "banana": { "name": "Banana" },
    "orange": { "name": "Orange" },
    "strawberry": { "name": "Strawberry" },
    "grapes": { "name": "Grapes" },
    "watermelon": { "name": "Watermelon" },
    "carrot": { "name": "Carrot" },
    "tomato": { "name": "Tomato" },
    "corn": { "name": "Corn" },
    "broccoli": { "name": "Broccoli" },
    "potato": { "name": "Potato" },
    "pepper": { "name": "Pepper" }
  }
}
```

- [ ] **Step 5: Create the manifest**

Create `src/games/fruit-veggie-id/manifest.json`:

```json
{
  "id": "fruit-veggie-id",
  "name": "Fruit & Veggie ID",
  "description": "Hear the name, tap the matching fruit or veggie!",
  "icon": "🍎",
  "color": "#AED581",
  "version": "1.0.0",
  "tags": ["vocabulary", "food"]
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/games/fruit-veggie-id/__tests__/foods.test.js`
Expected: PASS (6 tests) — the i18n `exists`/`t` checks confirm data and translations line up.

- [ ] **Step 7: Commit**

```bash
git add src/games/fruit-veggie-id/manifest.json src/games/fruit-veggie-id/data/foods.js src/games/fruit-veggie-id/i18n/en.json src/games/fruit-veggie-id/__tests__/foods.test.js
git commit -m "feat(68): Fruit & Veggie ID data, i18n and manifest"
```

---

### Task 4: Fruit & Veggie game component + shared emoji-tile CSS + stories

**Files:**
- Create: `src/games/fruit-veggie-id/index.jsx`
- Create: `src/games/fruit-veggie-id/FruitVeggieIdGame.stories.jsx`
- Modify: `src/components/GameChoiceGrid.css` (add `.game__choice-emoji`)
- Test: `src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`

**Interfaces:**
- Consumes: `useGameSession`, `useSpeech` (Task 1), `useQuestionAudio` (Task 2), `QuizGameShell`, `foods` (Task 3).
- Produces: `export default function FruitVeggieIdGame({ onGameEnd })`. Choice buttons carry `data-food-id` and an `aria-label` of the food name; correct-answer testid is `correct-food-id`.

- [ ] **Step 1: Write the failing test**

Create `src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`:

```jsx
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import FruitVeggieIdGame from '../index'
import { ShellContext } from '../../../components/ShellContext'

vi.mock('../../../lib/confetti', () => ({ fireConfetti: vi.fn() }))

// Mock the speech hook (per the "mock the hook, not the browser primitive" rule).
let mockSupported = true
const mockSpeak = vi.fn()
const mockCancel = vi.fn()
vi.mock('../../../hooks/useSpeech', () => ({
  default: () => ({ speak: mockSpeak, cancel: mockCancel, supported: mockSupported }),
}))

let mockSettings = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerMode: 'countUp',
  introDismissed: { 'fruit-veggie-id': true },
}
const mockUpdateSetting = vi.fn()
let mockLoaded = true

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings, loaded: mockLoaded, updateSetting: mockUpdateSetting }),
}))
vi.mock('../../../hooks/useScores', () => ({
  default: () => ({ addScore: vi.fn().mockResolvedValue(undefined), scores: [], getBestScore: () => 0, getScoresByGame: () => [], getAllScores: () => [] }),
}))
vi.mock('../../../hooks/useBestStreak', () => ({
  default: () => ({ bestStreak: 0, recordStreak: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('../../../hooks/usePersonalBest', () => ({
  default: () => ({
    personalBest: null,
    recordSession: vi.fn().mockResolvedValue({
      accuracy: { isNewRecord: false, value: 0, previous: null },
      speed: { isNewRecord: false, value: null, previous: null },
    }),
  }),
}))
vi.mock('../../../hooks/useBadges', () => ({
  default: () => ({ badgeData: { awards: {}, lifetimeQuestions: {} }, awardSession: vi.fn().mockResolvedValue([]) }),
}))

const onGameEnd = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockLoaded = true
  mockSupported = true
  mockSettings = {
    numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerMode: 'countUp',
    introDismissed: { 'fruit-veggie-id': true },
  }
})

const foodButtons = () => screen.getAllByRole('button').filter(b => b.dataset.foodId)

describe('FruitVeggieIdGame', () => {
  it('renders the spoken-name prompt with picture choices', async () => {
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    expect(screen.getByText(/which one did you hear/i)).toBeInTheDocument()
    expect(foodButtons().length).toBeGreaterThanOrEqual(2)
  })

  it('speaks the name automatically when a question is shown', async () => {
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    expect(mockSpeak).toHaveBeenCalled()
  })

  it('shows a replay button that re-speaks the name on click', async () => {
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    const replay = screen.getByLabelText(/say it again/i)
    mockSpeak.mockClear()
    await act(async () => { await userEvent.click(replay) })
    expect(mockSpeak).toHaveBeenCalledTimes(1)
  })

  it('labels each picture choice with its name for screen readers', async () => {
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    for (const btn of foodButtons()) {
      expect(btn.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it('clicking the correct picture adds the correct class', async () => {
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    const correctId = screen.getByTestId('correct-food-id').textContent
    const correctBtn = foodButtons().find(b => b.dataset.foodId === correctId)
    await act(async () => { await userEvent.click(correctBtn) })
    expect(correctBtn.classList.contains('correct')).toBe(true)
  })

  it('shows results after all questions in immediate mode', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const correctId = screen.getByTestId('correct-food-id').textContent
      const correctBtn = foodButtons().find(b => b.dataset.foodId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
  })

  it('Home button calls onGameEnd', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const correctId = screen.getByTestId('correct-food-id').textContent
      const correctBtn = foodButtons().find(b => b.dataset.foodId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    await act(async () => { await userEvent.click(screen.getByRole('button', { name: /home/i })) })
    expect(onGameEnd).toHaveBeenCalled()
  })

  it('reports the streak to the shell after 2 correct answers', async () => {
    vi.useFakeTimers()
    const setGameStatus = vi.fn()
    await act(async () => {
      render(
        <ShellContext.Provider value={{ setGameStatus }}>
          <FruitVeggieIdGame onGameEnd={onGameEnd} />
        </ShellContext.Provider>
      )
    })
    for (let i = 0; i < 2; i++) {
      const correctId = screen.getByTestId('correct-food-id').textContent
      const correctBtn = foodButtons().find(b => b.dataset.foodId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(setGameStatus).toHaveBeenLastCalledWith({ streak: 2, sessionActive: true })
  })

  it('cancels speech when advancing to the next question', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    const correctId = screen.getByTestId('correct-food-id').textContent
    const correctBtn = foodButtons().find(b => b.dataset.foodId === correctId)
    act(() => { fireEvent.click(correctBtn) })
    act(() => { vi.advanceTimersByTime(1600) })
    await act(async () => {})
    vi.useRealTimers()
    expect(mockCancel).toHaveBeenCalled()
  })

  it('cancels speech when the session ends', async () => {
    mockSettings = { ...mockSettings, questionsPerSession: 1 }
    vi.useFakeTimers()
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    const correctId = screen.getByTestId('correct-food-id').textContent
    const correctBtn = foodButtons().find(b => b.dataset.foodId === correctId)
    act(() => { fireEvent.click(correctBtn) })
    act(() => { vi.advanceTimersByTime(1600) })
    await act(async () => {})
    vi.useRealTimers()
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
    expect(mockCancel).toHaveBeenCalled()
  })

  it('shows missed foods in the results when an answer is wrong', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const correctId = screen.getByTestId('correct-food-id').textContent
      const wrongBtn = foodButtons().find(b => b.dataset.foodId !== correctId)
      act(() => { fireEvent.click(wrongBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(screen.getByText(/let's practice/i)).toBeInTheDocument()
  })

  it('hides the timer when timerMode is "off"', async () => {
    mockSettings = { ...mockSettings, timerMode: 'off' }
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByLabelText(/elapsed time/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    let container
    await act(async () => { container = render(<FruitVeggieIdGame onGameEnd={onGameEnd} />).container })
    expect(await axe(container)).toHaveNoViolations()
  })

  // Negative: audio-leak guard
  it('does not speak while settings/intro have not resolved', async () => {
    mockLoaded = false
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    expect(mockSpeak).not.toHaveBeenCalled()
  })

  // Negative: no-TTS fallback
  describe('when speech synthesis is unavailable', () => {
    beforeEach(() => { mockSupported = false })

    it('shows a fallback prompt naming the target and hides the replay button', async () => {
      await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
      expect(screen.getByText(/find the/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/say it again/i)).not.toBeInTheDocument()
      expect(mockSpeak).not.toHaveBeenCalled()
    })
  })
})

describe('FruitVeggieIdGame — how-to-play intro', () => {
  it('shows the intro before the first question when not dismissed', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    expect(screen.getByTestId('game-intro-start')).toBeInTheDocument()
    expect(screen.queryByText(/which one did you hear/i)).not.toBeInTheDocument()
  })

  it('starts the session after "Let\'s Play!" is clicked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(screen.getByText(/which one did you hear/i)).toBeInTheDocument()
  })

  it('persists introDismissed for this game when "don\'t show again" is checked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<FruitVeggieIdGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-dont-show-again')) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(mockUpdateSetting).toHaveBeenCalledWith('introDismissed', { 'fruit-veggie-id': true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`
Expected: FAIL — cannot resolve `../index`.

- [ ] **Step 3: Add the shared emoji-tile CSS**

In `src/components/GameChoiceGrid.css`, append after the `.game__choice-name` rule:

```css
.game__choice-emoji { font-size: 56px; line-height: 1; }
```

- [ ] **Step 4: Write the game component**

Create `src/games/fruit-veggie-id/index.jsx`:

```jsx
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import useSpeech from '../../hooks/useSpeech'
import useQuestionAudio from '../../hooks/useQuestionAudio'
import QuizGameShell from '../../components/QuizGameShell'
import foods from './data/foods'
import manifest from './manifest.json'

const CHOICE_COLORS = [
  'var(--color-lavender-dark)',
  'var(--color-teal-dark)',
  'var(--color-aqua-dark)',
  'var(--color-lilac-dark)',
]

export default function FruitVeggieIdGame({ onGameEnd }) {
  const { t } = useTranslation()
  const session = useGameSession({ gameId: 'fruit-veggie-id', items: foods })
  const { current, index, done, showIntro, introResolved } = session

  // The spoken name is the question itself, so it plays regardless of the
  // shell's soundEffectsEnabled chime setting. useQuestionAudio owns the
  // announce/stop lifecycle; useSpeech is the audio source.
  const { speak, cancel, supported } = useSpeech()
  const announce = useCallback(food => speak(t(food.correct.nameKey)), [speak, t])
  const replay = useQuestionAudio({ index, current, showIntro, introResolved, done, announce, stop: cancel })

  return (
    <QuizGameShell
      session={session}
      manifest={manifest}
      onGameEnd={onGameEnd}
      instructions={t('fruitVeggie.howToPlay')}
      correctTestId="correct-food-id"
      // Picture-only choices, so a spoken prompt is not spoiled by on-screen
      // text. When speech is unavailable, name the target so a parent can guide.
      prompt={q => supported ? t('fruitVeggie.prompt') : t('fruitVeggie.promptFallback', { name: t(q.correct.nameKey) })}
      renderPromptExtra={() => supported
        ? <button className="game__replay" aria-label={t('fruitVeggie.replay')} onClick={replay}>🔊</button>
        : null}
      getChoiceProps={(food, i) => ({
        style: { background: CHOICE_COLORS[i % CHOICE_COLORS.length] },
        'data-food-id': food.id,
        'aria-label': t(food.nameKey),
      })}
      renderChoiceContent={food => (
        <span className="game__choice-emoji" aria-hidden="true">{food.emoji}</span>
      )}
      renderMissedItem={food => (
        <>
          <span aria-hidden="true">{food.emoji}</span> {t(food.nameKey)}
        </>
      )}
    />
  )
}
```

- [ ] **Step 5: Run the component tests to verify they pass**

Run: `npx vitest run src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`
Expected: PASS (all tests, including the fallback and leak-guard negatives).

- [ ] **Step 6: Create the Storybook story**

Create `src/games/fruit-veggie-id/FruitVeggieIdGame.stories.jsx`:

```jsx
import { useEffect, useRef } from 'react'
import FruitVeggieIdGame from './index'

// The game's shuffle runs inside a useEffect gated on settings loaded from
// useSettings(), so it fires during React's commit phase — after a plain
// decorator function would already have returned. Override Math.random during
// this wrapper's render (renders run parent-before-child, so the override is
// active before the story's own render/effects) and restore it on unmount, so
// the pin covers the story for as long as it's displayed without leaking into
// whatever story is viewed next.
const pinRandom = (Story) => {
  function PinnedRandom() {
    const original = useRef(null)
    if (original.current === null) {
      original.current = Math.random
      Math.random = () => 0.5
    }
    useEffect(() => () => {
      Math.random = original.current
    }, [])
    return Story()
  }
  return <PinnedRandom />
}

// useSettings() loads settings from localStorage inside an async effect that
// resolves during the commit phase, same timing hazard as pinRandom above.
// Seed 'playground_settings' with introDismissed for this game during the
// wrapper's render (parent-before-child) so useGameSession() sees the intro as
// already dismissed on its very first settings read and renders gameplay, not
// the GameIntro screen. Merge with whatever's already in localStorage instead
// of clobbering it.
const seedIntroDismissed = (Story) => {
  function SeededIntroDismissed() {
    const seeded = useRef(false)
    if (!seeded.current) {
      seeded.current = true
      let existing = {}
      try {
        const parsed = JSON.parse(localStorage.getItem('playground_settings') || '{}')
        existing = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch {
        existing = {}
      }
      localStorage.setItem('playground_settings', JSON.stringify({
        ...existing,
        introDismissed: { ...existing.introDismissed, 'fruit-veggie-id': true },
      }))
    }
    return Story()
  }
  return <SeededIntroDismissed />
}

export default {
  title: 'Games/FruitVeggieIdGame',
  component: FruitVeggieIdGame,
  decorators: [pinRandom, seedIntroDismissed],
}

export const Default = { args: { onGameEnd: () => {} } }
```

- [ ] **Step 7: Verify Storybook build compiles the story**

Run: `npm run build-storybook`
Expected: build completes without errors (the new story is picked up).

- [ ] **Step 8: Commit**

```bash
git add src/games/fruit-veggie-id/index.jsx src/games/fruit-veggie-id/FruitVeggieIdGame.stories.jsx src/components/GameChoiceGrid.css src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx
git commit -m "feat(68): Fruit & Veggie ID game component, emoji-tile CSS and story"
```

---

### Task 5: Docs, version bump, and full verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `docs/TESTING.md`

**Interfaces:** none (docs + metadata).

- [ ] **Step 1: Add the game to the README games list**

In `README.md`, directly after the Animal Sounds bullet (around line 10), add:

```markdown
- **Fruit & Veggie ID** (quiz) — the name of a fruit or vegetable is spoken aloud; the child taps the matching picture (falls back to on-screen text where the browser has no speech synthesis)
```

- [ ] **Step 2: Bump the app version**

In `package.json`, change `"version": "0.26.0"` to `"version": "0.27.0"`.

- [ ] **Step 3: Add a CHANGELOG entry**

In `CHANGELOG.md`, add a new top entry (match the existing format in the file):

```markdown
## [0.27.0]

### Added
- **Fruit & Veggie ID** game (#68) — hear a fruit/vegetable's name spoken (Web Speech API) and tap the matching picture; picture-only choices for pure listen→identify vocabulary; on-screen text fallback when speech synthesis is unavailable.

### Changed
- Extracted the question-audio lifecycle into a shared `useQuestionAudio` hook and moved Animal Sounds onto it; the `.game__replay` button style now lives in the shared shell stylesheet.
```

- [ ] **Step 4: Note the speech mock seam in the testing guide**

In `docs/TESTING.md`, find the section listing game mock seams (the note about `useSoundPlayer` / confetti) and add a sentence:

```markdown
- Games whose prompt is a spoken word (Fruit & Veggie ID) get their audio from the `useSpeech` hook — mock that hook (not `window.speechSynthesis`) in component tests, and toggle its `supported` flag to exercise the no-TTS text fallback. `useSpeech`'s own hook test is the one place that stubs the raw `SpeechSynthesis` globals.
```

- [ ] **Step 5: Run the full unit suite + lint**

First remove any stale Storybook build output that would break lint (known repo gotcha), then run:

```bash
rm -rf storybook-static
npm run lint
npm run lint:css
npm test -- --run
```

Expected: lint clean, stylelint clean, all Vitest tests pass (new hooks, data, component, and the untouched Animal Sounds suite).

- [ ] **Step 6: Run E2E (page a11y + visual + HTML/CSS validation) and refresh the visual baseline**

Run: `npm run e2e`
Expected: PASS. If the run reports a missing visual baseline for the new `/game/fruit-veggie-id` route, generate it with `npx playwright test --update-snapshots`, review the produced PNG under the Playwright snapshots folder to confirm it renders the game correctly (question card + four picture tiles), then re-run `npm run e2e` to confirm green.

- [ ] **Step 7: Commit**

```bash
git add README.md CHANGELOG.md package.json docs/TESTING.md
# include any generated visual baseline pngs:
git add -A
git commit -m "docs(68): README/CHANGELOG/TESTING for Fruit & Veggie ID; v0.27.0; visual baseline"
```

---

## Self-Review

**Spec coverage:**
- TTS via Web Speech API + `useSpeech` hook → Task 1. ✓
- `useQuestionAudio` extraction + Animal Sounds refactor → Task 2. ✓
- `.game__replay` → shared CSS; `.game__choice-emoji` → shared CSS → Tasks 2 & 4. ✓
- Picture-only choices with accessible names → Task 4 (`renderChoiceContent` + `aria-label`). ✓
- 12 mixed fruits/veggies, i18n, manifest → Task 3. ✓
- No-TTS fallback (prompt names target, replay hidden) → Task 4 component + test. ✓
- Audio independent of `soundEffectsEnabled` → Task 4 (spoken name never checks the setting; comment documents it). ✓
- Positive + negative tests at every layer (hook units, data, component, e2e/visual) → Tasks 1–5. ✓
- Docs + version bump → Task 5. ✓

**Placeholder scan:** none — every code/step is concrete.

**Type consistency:** `useSpeech()` → `{ speak, cancel, supported }` used identically in Task 4. `useQuestionAudio({ index, current, showIntro, introResolved, done, announce, stop })` → `replay` used identically in Tasks 2 and 4. `announce` receives the question object and reads `.correct.sound` (Animal Sounds) / `.correct.nameKey` (Fruit & Veggie). Choice testid `correct-food-id` and `data-food-id` consistent across component and tests. ✓
