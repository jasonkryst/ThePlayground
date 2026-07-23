# Visible Recovery When Audio Autoplay Is Blocked (AU-8 / Issue #123)

## Problem

Issue #123 restates finding **AU-8** from the 2026-07-12 audit
(`docs/accessibility_usability.md`): `useSoundPlayer.js:27` does
`audio.play().catch(() => {})` — a deliberate crash guard, correct as far
as it goes, but nothing observes the rejection. Animal Sounds auto-plays
each question's clip on mount; if the browser's autoplay policy blocks it,
the child sees four animal buttons with no prompt and no cue that anything
failed. The 🔊 replay button is the recovery path, but nothing points a
pre-literate child (or their supervising adult) at it.

Fruit & Veggie ID has an identical-looking 🔊 replay button and the same
failure shape, but its audio source is `useSpeech` (Web Speech API), which
has no promise to swallow — instead, a browser that blocks
`speechSynthesis.speak()` without a qualifying user gesture simply never
fires the utterance's `onstart`/`onend` events, or fires `onerror`. This
spec covers both games, per direction to extend beyond the audit's literal
Animal Sounds-only wording.

## Design

### 1. `blocked` state in the two audio hooks

Both `useSoundPlayer` and `useSpeech` gain a `blocked` boolean in their
return value, sourced from each API's real success/failure signal, with a
ref-equality guard against **stale settles from routine interruption** —
`stop()`/`cancel()` fire on every question transition as ordinary cleanup,
not just on real failures, and must never be mistaken for a new failure.

**`src/hooks/useSoundPlayer.js`:**
- Add `const [blocked, setBlocked] = useState(false)`.
- In `play(url)`, immediately after creating the new `Audio` and assigning
  `audioRef.current = audio` (before calling `.play()`), call
  `setBlocked(false)` — clears any stale hint from a previous attempt
  without waiting for this attempt's promise to settle.
- Attach `.then(() => { if (audioRef.current === audio) setBlocked(false) })`
  and `.catch(() => { if (audioRef.current === audio) setBlocked(true) })`
  to the `audio.play()` call, replacing the current bare
  `.catch(() => {})`.
- The existing `stop()` already sets `audioRef.current = null`
  synchronously before any pause-triggered `AbortError` rejection can fire
  asynchronously, so the ref-equality check on that stale rejection is
  always false — no explicit change to `stop()` needed.
- Return `{ play, stop, blocked }`.

**`src/hooks/useSpeech.js`:**
- Add `const utteranceRef = useRef(null)` and
  `const [blocked, setBlocked] = useState(false)`.
- In `speak(text)`, immediately after constructing `utterance`, attach
  `utterance.onstart = () => { if (utteranceRef.current === utterance) setBlocked(false) }`
  and `utterance.onerror = () => { if (utteranceRef.current === utterance) setBlocked(true) }`,
  then set `utteranceRef.current = utterance` and `setBlocked(false)`
  (clears stale hint) before calling `s.speak(utterance)`.
- In `cancel()`, set `utteranceRef.current = null` **before** calling
  `synthRef.current?.cancel()` — `cancel()` can synchronously or
  asynchronously fire the in-flight utterance's `onerror` with
  `error: 'interrupted'`/`'canceled'`; nulling the ref first makes that
  guard fail, so routine question-to-question cancellation is never
  reported as blocked.
- Return `{ speak, cancel, supported, blocked }`.

★ Insight: the race guard is the actual crux of this design, not the
happy-path wiring. Both `stop()`/`cancel()` run on every question change.
Without the ref-nulled-before-cancel ordering, a completely normal
"advance to next question" would flip `blocked` true and wrongly pulse the
button — training the child to distrust a hint that's supposed to mean
something.

### 2. Shared UI: `src/components/ReplayButton.jsx`

Both games currently inline `<button className="game__replay">🔊</button>`
in `renderPromptExtra`. Extract a shared component (new
`ReplayButton.jsx` + `ReplayButton.css` + `ReplayButton.stories.jsx`,
moving the existing `.game__replay*` rules out of `QuizGameShell.css` into
the new CSS file — same one-CSS-per-component pattern as `Timer`,
`MemoryBoard`, etc.):

```jsx
export default function ReplayButton({ label, hintLabel, blocked, onClick }) {
  return (
    <div className="replay-button">
      <button
        className={`game__replay${blocked ? ' game__replay--blocked' : ''}`}
        aria-label={blocked ? `${label} — ${hintLabel}` : label}
        onClick={onClick}
      >🔊</button>
      {blocked && <div className="replay-button__hint" role="status">{hintLabel}</div>}
    </div>
  )
}
```

**CSS (`ReplayButton.css`):**
- Move `.game__replay`, `.game__replay:hover`, `.game__replay:focus`,
  `.game__replay:focus-visible` from `QuizGameShell.css` verbatim.
- New `.game__replay--blocked`: a static amber/gold ring at rest (visible
  under reduced motion too — color/border is never motion-gated), e.g.
  `box-shadow: 0 0 0 4px rgb(255 193 7 / 70%)`.
- New `@keyframes pulse-replay` (ring expands and fades, same shape as the
  existing `pulse-green`), applied to `.game__replay--blocked` only inside
  `@media (prefers-reduced-motion: no-preference)` — mirrors the
  `pulse-green`/`shake-red` convention in `src/index.css`. Amber/gold is
  deliberately distinct from the app's correct-green/wrong-red vocabulary,
  since "blocked" isn't a right/wrong signal.
- New `.replay-button__hint`: small bold white text, matching
  `.game__timeout`'s visible-status-row styling.

The visible hint text is **not** gated behind reduced-motion — it's a
second, independent channel (the audit is explicit that color/motion alone
can't reach a pre-literate child; the realistic mitigation is that a
supervising adult reads it and taps for them), and `role="status"` gets it
announced to assistive tech the moment it appears, following the same
dual-purpose visible-text/screen-reader convention already used by
`QuizGameShell`'s timeout row and `LocaleSelector`'s confirmation message
(`CHANGELOG.md` `[0.32.4]`).

### 3. i18n: `common.tapToHear`

Add one new key to the `common` namespace (shared across both games,
since both need it) in `src/i18n/en.json`, `es.json`, `pl.json`:

- en: `"tapToHear": "Tap 🔊 to hear it!"`
- es: `"tapToHear": "¡Toca 🔊 para escucharlo!"`
- pl: `"tapToHear": "Dotknij 🔊, aby usłyszeć!"`

### 4. Wiring

**`src/games/animal-sounds/index.jsx`:** destructure `blocked` from
`useSoundPlayer()`; replace the inline `<button className="game__replay">`
with `<ReplayButton label={t('animalSounds.replay')} hintLabel={t('common.tapToHear')} blocked={blocked} onClick={replay} />`.

**`src/games/fruit-veggie-id/index.jsx`:** destructure `blocked` from
`useSpeech()`; same substitution inside the existing `supported ? ... :
null` branch (unsupported browsers still show no replay affordance at
all — nothing to recover into, unchanged).

## Testing plan (positive + negative, every applicable layer)

| Layer | Additions |
|---|---|
| `useSoundPlayer.test.js` | Positive: successful `play()` keeps `blocked` false; a rejected `play()` sets `blocked` true. Negative/race: a `stop()`-interrupted clip's later rejection does NOT set `blocked` (guards the interrupt race); a fresh `play()` call clears a stale `blocked=true` from a prior attempt before the new attempt's outcome is known. |
| `useSpeech.test.js` | Positive: `onstart` clears `blocked`; `onerror` sets `blocked` true. Negative/race: `cancel()` firing the *old* utterance's `onerror` does NOT set `blocked` (guards the interrupt race); a fresh `speak()` clears a stale `blocked=true` immediately. |
| `ReplayButton.test.jsx` (new) | Positive: `blocked=true` renders the `--blocked` class, the visible hint text in a `role="status"` element, and an augmented `aria-label`. Negative: `blocked=false` renders neither the class nor the hint text, and the plain `aria-label`. Both states: clicking the button calls `onClick`. |
| `AnimalSoundsGame.test.jsx` | Positive: forcing `window.HTMLMediaElement.prototype.play` to reject shows the hint text. Negative: normal (resolved) playback never shows it. axe scan in the blocked state specifically. |
| `FruitVeggieIdGame.test.jsx` | Positive: mocked `useSpeech` returning `blocked: true` shows the hint. Negative: `blocked: false` (default) never shows it. axe scan in the blocked state. |
| `e2e/animal-sounds.spec.js` | New spec: force `HTMLMediaElement.prototype.play` to reject in a real browser and assert the visible hint renders — closes the audit's explicit "worth an e2e assertion" recommendation. |
| `ReplayButton.stories.jsx` (new) | `Default` and `Blocked` stories, feeding Layer 4 visual regression automatically (existing Storybook-screenshot mechanism, no new config). |
| Not needed | `lint:css`/`validate:css` — new rules are static classes, not dynamic inline styles; no changes to `useQuestionAudio` (already source-agnostic, untouched by this design). |

## Docs

- `docs/ENHANCEMENTS.md`: remove the AU-8 bullet under UX (resolved).
- `CHANGELOG.md`: new version entry under `### Fixed`, referencing issue
  #123/AU-8, describing the `blocked` state + `ReplayButton` hint —
  pattern matches the AU-7 entry in `[0.32.3]`.
- `package.json`: version bump (patch — bugfix, no manifest/game-version
  change since this isn't gameplay content).
- `docs/TESTING.md`: no change needed — it describes the visual-regression
  mechanism generically ("every component has stories under
  `src/**/*.stories.jsx`... `e2e/visual.spec.js` navigates to each story's
  isolated URL"), not a per-file enumeration, so `ReplayButton.stories.jsx`
  is automatically covered by the existing description.

## Explicitly out of scope

- `docs/accessibility_usability.md` — a point-in-time audit record, not
  edited retroactively (confirmed via `git log`: no prior resolved
  finding, e.g. AU-4, AU-7, has ever touched this file after its original
  commit). Left as-is.
- `AnimalMemoryMatchGame`'s match-sound effect and `QuizGameShell`'s
  correct/wrong chime layer both call `useSoundPlayer` but are incidental
  feedback sounds, not question prompts — no replay affordance exists for
  either today, and this issue doesn't add one. They silently ignore the
  new `blocked` return value (harmless, no behavior change).
- No new setting/toggle — the hint is unconditional recovery UX, not a
  configurable feature.
- No visual-regression baseline changes to existing snapshots — only new
  `ReplayButton` stories are added, nothing existing changes pixels
  (moving CSS between files doesn't change rendered output).
