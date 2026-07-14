# Fruit & Veggie ID — Design

**Issue:** #68 — "Fruit & Veggie ID — picture of a fruit/vegetable plays its name, child matches it; everyday-object vocabulary."

**Date:** 2026-07-13

## Summary

A new quiz game where the game **speaks a fruit/vegetable's name aloud** and the child taps the
matching **picture** (emoji, no text label) from 2–4 choices. Built on the existing
`QuizGameShell` + `useGameSession` engine, exactly like Animal Sounds — the difference is the
prompt is a spoken *word* (via the browser's Web Speech API) rather than a recorded sound effect,
and choice tiles are picture-only so the on-screen text doesn't spoil the spoken answer.

Auto-discovery means dropping the folder under `src/games/fruit-veggie-id/` with a `manifest.json`
and `index.jsx` makes it appear on the dashboard and routable at `/game/fruit-veggie-id` — no
registry edits.

## Decisions (from brainstorming)

- **Audio source:** browser text-to-speech (Web Speech API / `SpeechSynthesis`). No binary assets
  to source; works offline. New shared hook `useSpeech`. Graceful fallback when unsupported.
- **Choice tiles:** picture-only (emoji, no text label). Pure listen→identify vocabulary practice.
- **Content set:** 12 mixed fruits + veggies — 🍎apple 🍌banana 🍊orange 🍓strawberry 🍇grapes
  🍉watermelon 🥕carrot 🍅tomato 🌽corn 🥦broccoli 🥔potato 🫑pepper.

## Shareable / core extractions

Per the project rule that shareable JS/CSS belongs in the engine, not the game folder:

### 1. `src/hooks/useSpeech.js` (new, core)

Small hook wrapping the Web Speech API, mirroring `useSoundPlayer`'s shape:

- `speak(text)` — cancels any pending utterance, creates a `SpeechSynthesisUtterance`
  (lang `en-US`, rate ~0.9 for toddlers), speaks it. No-op for falsy/empty text or when unsupported.
- `cancel()` — stops in-flight speech.
- `supported` — boolean, `'speechSynthesis' in window`, so callers can branch to a fallback.
- Cancels on unmount. `speak`/`cancel` are referentially stable.

### 2. `src/hooks/useQuestionAudio.js` (new, core)

Extracts the generic "question announcement" lifecycle currently living as three `useEffect`s in
Animal Sounds' `index.jsx`. Signature:

```js
useQuestionAudio({ index, current, showIntro, introResolved, done, announce, stop }) → replay
```

Behavior (behavior-preserving copy of the Animal Sounds effects):
- Auto-announces the current question when it becomes active — **gated by `!showIntro &&
  introResolved`** so no audio leaks during loading or the intro screen.
- Stops audio when leaving a question (cleanup on `current` change), and when `done` or `showIntro`.
- Returns a stable `replay` callback for the 🔊 button.

`announce(current)` and `stop()` are supplied by the game:
- Animal Sounds: `announce = c => play(getSoundUrl(c.correct.sound))`, `stop = soundPlayer.stop`.
- Fruit & Veggie ID: `announce = c => speak(nameOf(c.correct))`, `stop = cancel`.

**Animal Sounds is refactored onto this hook** so the lifecycle is not duplicated. Its existing
suite (stops-audio-on-advance, stops-on-session-end, no-audio-leak-before-intro) guards the refactor.

*Alternative considered:* push question-audio ownership into `QuizGameShell` itself. Rejected — it
would force the two non-audio quiz games (Color Match, Character Match) to care about an
announce/stop contract they don't use. A hook both games opt into keeps better isolation.

### 3. Shareable CSS → engine stylesheets

- `.game__replay` (the round 🔊 button) currently lives in `AnimalSoundsGame.css` but is generic
  prompt chrome → move to `QuizGameShell.css`. After the move `AnimalSoundsGame.css` is empty and
  is deleted (and its import removed from Animal Sounds' `index.jsx`).
- `.game__choice-emoji` (enlarged, label-less picture tile) → add to `GameChoiceGrid.css`, next to
  the existing `.game__choice-name`, since that's where shared choice-content styling lives.
- `FruitVeggieIdGame.css` is created only if the game needs genuinely game-specific cosmetics.
  Choice background colors are passed inline via `getChoiceProps` (as in Animal Sounds), so a
  near-empty file will not be created.

## Game files (`src/games/fruit-veggie-id/`)

- **`manifest.json`** — `id: "fruit-veggie-id"`, `name: "Fruit & Veggie ID"`, icon `🍎`,
  a `--color-*`-derived color, `version: "1.0.0"`, `tags: ["vocabulary", "food"]`.
- **`data/foods.js`** — array of `{ id, nameKey, emoji }` for the 12 items above.
- **`i18n/en.json`** — `fruitVeggie.*` UI strings (`prompt`, `promptFallback`, `replay`,
  `howToPlay`) + `food.<id>.name` labels.
- **`index.jsx`** — mirrors Animal Sounds:
  - `useGameSession({ gameId: 'fruit-veggie-id', items: foods })`, `useSpeech()`, `useQuestionAudio(...)`.
  - Renders through `QuizGameShell` with:
    - `prompt`: `supported ? t('fruitVeggie.prompt') : t('fruitVeggie.promptFallback', { name })`
      — the fallback names the target so a parent can guide play with no audio.
    - `renderPromptExtra`: the 🔊 replay button, **hidden when `!supported`**.
    - `renderChoiceContent`: the emoji only, wrapped in `.game__choice-emoji` with an
      `aria-label`/visually-hidden name so screen readers still identify each tile (no visible text).
    - `getChoiceProps`: inline choice background color + `data-food-id` (test hook, mirrors
      `data-animal-id`).
    - `renderMissedItem`: emoji + name (results screen may show the name — the round is over).
    - `correctTestId="correct-food-id"`.
- **`FruitVeggieIdGame.stories.jsx`** — Storybook story mirroring the Animal Sounds story.

## Audio & settings interaction

The spoken name is *question content* (you cannot play a listening game with the prompt muted), so
— like Animal Sounds' question sound — it plays regardless of the `soundEffectsEnabled` setting,
which gates only the shell's correct/wrong chime layer.

## Accessibility

- Picture-only tiles carry an accessible name (`aria-label` of the food name) so screen-reader users
  can identify each choice even without visible text.
- The 🔊 replay button has an `aria-label` (`fruitVeggie.replay`).
- Fallback path (no TTS) renders a readable prompt naming the target.
- `axe` clean (component test), and the E2E page-level a11y sweep covers the route automatically.

## Testing (positive + negative, all layers)

### `useSpeech` hook — `src/hooks/__tests__/useSpeech.test.js`
- **Positive:** `speak(text)` constructs an utterance and calls `speechSynthesis.speak`; calling
  `speak` again cancels the prior first; `cancel()` calls `speechSynthesis.cancel`; unmount cancels;
  `supported === true` when `window.speechSynthesis` present.
- **Negative:** `supported === false` and `speak()`/`cancel()` are safe no-ops when
  `window.speechSynthesis` is absent; `speak('')`/`speak(null)` is a no-op (no utterance created).

### `useQuestionAudio` hook — `src/hooks/__tests__/useQuestionAudio.test.js`
- **Positive:** announces `current` once when active; `replay()` re-announces; stops on `current`
  change, on `done`, and on `showIntro`.
- **Negative:** does **not** announce while `showIntro` is true or `introResolved` is false (leak
  guard); does not announce when `current` is null.

### `foods.js` data — `src/games/fruit-veggie-id/__tests__/foods.test.js`
- **Positive:** every item has `id`, `nameKey`, `emoji`; expected count (12).
- **Negative:** no duplicate `id`s; no duplicate `emoji`s; every `nameKey` resolves in `i18n/en.json`.

### Component — `src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`
Mocks `useSpeech` (per the "mock the hook, not the browser primitive" rule). Mirrors the Animal
Sounds suite:
- **Positive:** renders a question with choice buttons; replay button present and speaks on click;
  clicking correct adds `.correct`; results screen after all questions; Home calls `onGameEnd`;
  streak reported to shell after 2 correct; `axe` clean; intro shows/dismisses/persists; speaks on
  question load; cancels speech on advance and on session end.
- **Negative:** no speech while settings/intro unresolved (audio-leak guard); missed items shown on
  wrong answers; timer hidden when `timerMode: 'off'`; **fallback** — when `useSpeech` reports
  `supported: false`, the fallback prompt (naming the target) renders and the replay button is absent.

### E2E / visual
- Playwright visual baseline for the game route; the existing a11y + HTML/CSS validation sweep picks
  up the new route via auto-discovery.

## Docs & versioning

- `README.md` — add to the games list (line ~10, next to Animal Sounds) and any relevant feature
  notes.
- `CHANGELOG.md` — new entry.
- `package.json` — bump app version (0.26.0 → 0.27.0).
- `docs/TESTING.md` — note the `useSpeech` mock seam if it aids future game authors.

## Out of scope (YAGNI)

Recorded-audio names, locales beyond `en`, and difficulty tiers beyond the engine's existing
`numChoices` auto-progression.
