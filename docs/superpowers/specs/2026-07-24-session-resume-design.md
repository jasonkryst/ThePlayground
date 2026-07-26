# Session Resume After Interruption — Design

**Issue:** GitHub #128 ("CORE - Session Resume")
**Date:** 2026-07-24

## Summary

The exit guard (v0.18.0) stops *accidental* exits mid-session, but a browser crash, tab close, or reload still loses all progress — the child starts over from question 1. This change persists a minimal snapshot of an in-progress quiz session after every question, and offers to resume it (or start fresh) the next time that game is opened, as long as the snapshot is less than 4 hours old.

Scope is quiz sessions (`useGameSession`) only. Memory sessions (`useMemorySession`) are out of scope for this pass — their in-progress state (tile positions, flip state) is a materially different and larger serialization surface for comparatively less benefit today, with only one memory game shipped; can be revisited later using the same pattern if needed.

## 1. Data model

```
getSessionResume()       → Promise<SessionResumeState | null>
saveSessionResume(state) → Promise<void>
clearSessionResume()     → Promise<void>
```

```
SessionResumeState = {
  gameId:     string,
  queue:      QueueEntry[],   // exactly buildQueue's own output shape — { correct, choices }
  index:      number,
  score:      number,
  streak:     number,
  missed:     Item[],
  timings:    TimingEntry[],
  peakStreak: number,
  savedAt:    number,          // epoch ms
}
```

New localStorage key: `playground_session_resume`. **A single global slot**, not a per-game map — only one game can be actively played at a time (one route), so "the most recently interrupted session" is the only thing that ever needs remembering. Same defensive `try/catch` → `null` pattern as the rest of the adapter for malformed JSON.

**Why the queue embeds full item objects, not ids:** `buildQueue`'s existing output already carries complete item objects in `correct`/`choices`, not references. Persisting that verbatim means resuming never has to re-look-up items against the *current* live content catalog — sidestepping an entire class of "an item was renamed/removed since this snapshot was saved" bugs. Resuming replays exactly what was queued, regardless of what the content catalog looks like now.

## 2. Save trigger

A new effect in `useGameSession.js`, keyed on `[gameId, queue, index, done]`:

```js
useEffect(() => {
  if (done) { clearSessionResume(); return }
  if (!queue.length) return
  saveSessionResume({
    gameId, queue, index, score, streak, missed, timings,
    peakStreak: peakStreakRef.current, savedAt: Date.now(),
  })
}, [gameId, queue, index, done])
```

Keying on `index` (not on `score`/`streak`/`missed`/`timings` individually) is deliberate: those all finish updating, synchronously, *before* `index` ever advances (advance() runs after the scoring effects of the just-answered question have already committed). So the effect fires exactly once per question transition, always capturing a fully-settled state — never a half-answered one where `score` reflects the new answer but `index` still points at the old question (which would risk double-scoring that question on resume). This also means a crash mid-question (between a wrong tap and its retry) simply resumes that question from its start, with retries/hints reset — a deliberate simplification, not a gap: there's no dangling partial-question state to reconcile.

`restart()` naturally overwrites this via the same effect (index resets to 0, a fresh snapshot is saved for the new session) — no special-casing needed.

**This is not crash-only.** Nothing clears the snapshot except finishing, declining a resume offer, or 4-hour expiry — so intentionally leaving via the exit guard's "Leave Game" button is resumable too, which matches the issue's broader "pick up where you left off" framing, not just the literal crash case.

## 3. Load / resume flow

On mount, once `settings.loaded` is true, a one-time check:

| Saved state | Behavior |
|---|---|
| None | Proceed straight to today's intro/queue-build flow, unchanged. |
| Exists, different `gameId` | Left untouched — not offered, not cleared. Revisiting *that* game later still finds it, still counting down from its original `savedAt`. |
| Exists, matching `gameId`, older than 4 hours | Cleared; proceeds to fresh flow. |
| Exists, matching `gameId`, within 4 hours | Queue-building is **held**; hook exposes `resumeAvailable: true`, `acceptResume()`, `declineResume()`. |

**Accepting** restores every piece of session state (refs and their mirrored `useState`s) wholesale from the snapshot, marks the intro as resolved-and-skipped (the child already knows how to play), and clears the resume snapshot's "pending" status. **Declining** clears storage immediately and falls through to the existing intro-then-fresh-`buildQueue` path — identical to a brand-new session.

**Guarding against a double queue-build:** the existing settings-driven queue-rebuild effect (today keyed on `[numChoices, questionsPerSession, items]`) must not immediately overwrite a just-restored queue on the same mount. It gets a one-shot suppression flag, set only by `acceptResume()`, consumed (and cleared) the first time the effect would otherwise run — so a *later*, genuine mid-session settings change (e.g., Admin adjusts `numChoices` while a fresh, non-resumed session is active — already today's existing, unrelated behavior) still rebuilds exactly as it does now.

## 4. UI

New component `src/components/ResumePrompt.jsx` — structurally like `GameIntro` (a plain screen, not a modal/dialog; nothing needs to be protected "behind" it). Shows a "Continue where you left off?" message with the saved progress (`Question {index+1} of {queue.length}, Score {score}`) and two actions: Resume, Start Fresh.

`QuizGameShell.jsx` gets one new gate, checked **before** the existing `!introResolved` null-guard (since `introResolved` deliberately stays `false` while a resume decision is pending):

```js
if (!settingsLoaded) return null
if (resumeAvailable) return <ResumePrompt ... onResume={acceptResume} onStartFresh={declineResume} />
if (!introResolved) return null
if (showIntro) { ... }          // unchanged
if (done) { ... }               // unchanged
```

`useShellGameStatus`'s `sessionActive` (`introResolved && !showIntro && !done`) is already `false` whenever `introResolved` is `false` — so the exit guard stays inactive while the resume prompt is showing, same as it already is during the intro screen. No change needed there.

## 5. Interactions confirmed unaffected

- **Personal bests / badges / difficulty-bump offer:** all evaluated only in `finishGame()`, which doesn't know or care whether the session that reached it was resumed or fresh. `timings[]` — which speed-record calculations are based on — is preserved verbatim through a resume, so per-question timing data stays honest (no wall-clock gap from the interruption leaks into it).
- **Orientation gate:** orthogonal; resume-checking happens independent of orientation blocking.
- **Multi-tab:** last-write-wins on the single localStorage slot, same pre-existing property every other adapter method already has (scores, settings, badges) — not a new regression introduced by this feature.

## 6. Testing plan

*Positive + negative per file, per this repo's testing convention:*

- **`src/storage/__tests__/localStorageAdapter.sessionResume.test.js`** (new) — round-trips a saved state (positive); corrupted JSON → `null`, no throw (negative).
- **`src/hooks/__tests__/useGameSession.resume.test.jsx`** (new) —
  - valid same-`gameId` snapshot within 4 hours → `resumeAvailable` is `true` (positive)
  - snapshot older than 4 hours → cleared, `resumeAvailable` stays `false`, fresh queue builds (negative)
  - snapshot for a different `gameId` → left in storage, `resumeAvailable` stays `false` for *this* mount (negative)
  - `acceptResume()` restores exact `score`/`streak`/`index`/`queue`/`missed`/`timings` and skips the intro (positive)
  - `declineResume()` clears storage and proceeds through the normal intro → fresh-queue path (positive/negative pair)
  - malformed stored JSON → treated as no snapshot (negative)
- **`src/components/__tests__/ResumePrompt.test.jsx`** (new) — renders the progress summary and both actions, calls the right callback on each (positive); renders sensibly at 0-progress / question-1 (negative/edge).
- **`src/components/__tests__/QuizGameShell.test.jsx`** (extend) — resume gate pre-empts the intro gate when `resumeAvailable` is true (positive); with `resumeAvailable` absent/false, rendering is byte-for-byte identical to today's existing tests (negative/regression guard).
- **`e2e/session-resume.spec.js`** (new) — pre-seed `localStorage` with a valid snapshot, load the game route, confirm the prompt renders; Resume path lands on the correct question with the correct score; Start Fresh path clears storage and starts question 1 with score 0.

## 7. Docs to update

- `CHANGELOG.md` — new `### Added` entry under the next version.
- `docs/ENHANCEMENTS.md` — remove the "Session resume after interruption" bullet from UX.
- `README.md` — feature docs gain a short section describing resume behavior and the 4-hour window.
- `src/storage/adapter.js` — JSDoc for the three new adapter methods and the `SessionResumeState` shape.
- `package.json` — version bump.
