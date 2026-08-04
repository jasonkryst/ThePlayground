# Emotions Match — Design

Issue: #76 ("GAME - EMOTIONS MATCH")

## Summary

A new quiz-type game: show an emotion word ("Happy"), the child taps the matching emoji face among several choices. Builds emotional vocabulary. Follows the existing auto-discovery game-plugin convention (`CLAUDE.md`) — no engine or shell changes required.

## Approach

This repo has one established way to add a game: drop `src/games/<id>/manifest.json` + `index.jsx` (plus i18n, data, tests, stories) and the dashboard/router pick it up automatically. There is no alternative architecture worth considering here — the two real design forks were resolved directly with the user:

1. **Face assets: emoji, not custom illustrations.** Matches the majority convention (`color-match`, `fruit-veggie-id`, `animal-sounds`) and needs no asset sourcing. Custom character art (`character-match-bluey`'s pattern) was rejected — no licensed character exists for this game, and sourcing a consistent illustrated face set is out of scope.
2. **The word is spoken aloud, not just displayed.** Unlike `fruit-veggie-id` (which *hides* the word so it doesn't spoil the picture answer), here the emotion word **is** the prompt itself — the issue text says "show an emotion word." There's no spoiler risk in also speaking it, and it helps pre-readers, which fits this app's toddler/infant audience. So: word always visible as text, and spoken via the existing `useSpeech`/`useQuestionAudio`/`ReplayButton` stack when speech is supported (silently skipped, no fallback-prompt branch needed, when unsupported — the text is never hidden either way).

The closest existing template is therefore `fruit-veggie-id`, minus its hide-the-word/`promptFallback` branch.

## Components

### `src/games/emotions-match/manifest.json`

```json
{
  "id": "emotions-match",
  "nameKey": "emotionsMatch.manifestName",
  "descriptionKey": "emotionsMatch.manifestDescription",
  "icon": "😊",
  "color": "#FFD54F",
  "version": "1.0.0",
  "tags": ["vocabulary", "emotions"]
}
```

`#FFD54F` (pastel amber) doesn't collide with any of the 7 existing per-game `color` values. No `gameType` (quiz, not memory) and no `orientation` lock (only the two memory games use one).

### `src/games/emotions-match/data/emotions.js`

Exactly 8 entries, `{ id, nameKey, emoji }`, matching the `food.<id>.name` key-convention pattern (`emotion.<id>.name`):

| id | emoji | English name |
|---|---|---|
| happy | 😊 | Happy |
| sad | 😢 | Sad |
| angry | 😠 | Angry |
| scared | 😨 | Scared |
| surprised | 😲 | Surprised |
| tired | 😴 | Tired |
| silly | 🤪 | Silly |
| calm | 😌 | Calm |

Chosen for visual distinctness at a glance (no near-duplicate faces a toddler would confuse) — the same bar `color-match` (11 items) and `fruit-veggie-id` (12 items) hold for their pools, just a smaller starting set since 8 clearly-distinct emotions is already a stretch at toddler level; more can be added later the same way the "expand the roster" backlog pattern works for other games.

### `src/games/emotions-match/index.jsx`

Same shape as `fruit-veggie-id/index.jsx`:

- `useGameSession({ gameId: 'emotions-match', items: emotions })`
- `useSpeech()` + a `useCallback` announcer that speaks `t(emotion.correct.nameKey)` when `supported`
- `useQuestionAudio(...)` owns the announce/stop lifecycle exactly as it does today (session-resume already guards against speaking while a resume prompt is showing or before intro is dismissed — no new logic needed, this is the same hook)
- `QuizGameShell` with:
  - `prompt={q => t('emotionsMatch.prompt', { emotion: t(q.correct.nameKey) })}` → e.g. *"Find the happy face!"* — **always** shown (no supported/fallback branch, since the word isn't a spoiler here)
  - `renderPromptExtra` renders the `ReplayButton` only when `supported` (mirrors fruit-veggie-id, just without the promptFallback swap)
  - `correctTestId="correct-emotion-id"`
  - `getChoiceProps`: `{ 'data-emotion-id': emotion.id, 'aria-label': t(emotion.nameKey) }` — choices are picture-only (just the emoji), so the name lives in `aria-label` for screen readers, same as `fruit-veggie-id`
  - `renderChoiceContent`: the emoji alone, `aria-hidden`
  - `renderMissedItem`: emoji + name, same as every other game

### i18n

`src/games/emotions-match/i18n/{en,es,pl}.json`, each with:
- `emotionsMatch.manifestName`, `.manifestDescription`, `.prompt` (`"Find the {{emotion}} face!"` / Spanish / Polish equivalents), `.replay`, `.howToPlay`
- `emotion.<id>.name` × 8, in all three locales

Full es/pl parity is required — every other game's locale files carry complete translations, and `FruitVeggieIdGame.test.jsx`'s Spanish/Polish `describe` blocks assert the replay button actually speaks the localized name, which only works if the translations exist.

### `EmotionsMatchGame.stories.jsx`

Storybook stories, one per existing game — mirrors `ColorMatchGame.stories.jsx`'s shape (default/intro/results states).

### Not needed

- No `badges.js` (only the two memory games override the global badge catalog).
- No `icon.<ext>` file (only the licensed-character games do; the manifest emoji is the icon here).
- No `orientation` field (quiz games don't lock orientation).
- No engine/`QuizGameShell`/`useGameSession` changes — this game needs nothing the shell doesn't already provide.

## Testing (positive + negative)

### `src/games/emotions-match/data/__tests__/emotions.test.js`
Mirrors `foods.test.js`:
- Positive: exactly 8 entries; every entry has `id`/`nameKey`/`emoji`; `nameKey` follows `emotion.<id>.name`; every `nameKey` resolves to a real (non-fallback) i18n translation.
- Negative: no duplicate `id`s; no duplicate `emoji`s.

### `src/games/emotions-match/__tests__/EmotionsMatchGame.test.jsx`
Mirrors `FruitVeggieIdGame.test.jsx` (same mock scaffolding: `useSpeech`, `useSettings`, `useScores`, `useBestStreak`, `usePersonalBest`, `useBadges`, `useItemStats`, storage):
- Positive: renders the visible word prompt with picture choices; speaks the name automatically; replay button re-speaks on click; each choice is `aria-label`-ed; correct pick adds the `correct` class; results show after all questions; Home calls `onGameEnd`; streak reporting to the shell; speech cancels on advance/session-end; missed emotions listed after a wrong run; timer hidden when `timerMode: 'off'`; no axe violations (including while the blocked-speech recovery hint shows); es/pl locale replay speaks the localized name; session-resume doesn't speak during the resume prompt but does after choosing resume/start-fresh; intro flow (shows before dismissal, starts session, persists `introDismissed`).
- Negative: does not speak while settings/intro haven't resolved yet (audio-leak guard); does not show the blocked-speech recovery hint when speech isn't blocked; does not show any replay affordance when speech is unsupported at all; when speech is unsupported, the word prompt still renders (since it was never hidden) and `speak` is never called.

## Documentation

- `docs/ENHANCEMENTS.md`: remove the "Emotions Match" bullet from **New Games** (shipped).
- `CHANGELOG.md`: new version entry describing the game.
- `README.md`: add a bullet to the `## Features` game list (after **Color Match**, before **Character Match**, keeping quiz games grouped before the two memory games — matches the file's existing ordering) — `**Emotions Match** (quiz) — an emotion word is shown (and spoken aloud); the child picks the matching face from picture buttons`. Also add `emotions-match` to the `games/` directory-tree comment example around line 153-154.
- `package.json`: version bump.
- `src/games/emotions-match/manifest.json`: own `"version": "1.0.0"` (new game, not a bump of an existing one).

## Out of scope

- Difficulty levels / per-game `numChoices` override (tracked separately in `docs/ENHANCEMENTS.md`'s Game Features section; this game uses the shared global setting like every other quiz game).
- Any engine change — this game is a pure consumer of the existing `QuizGameShell`/`useGameSession`/`useSpeech`/`useQuestionAudio` stack.
