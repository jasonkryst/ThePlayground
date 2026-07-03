# How-to-Play Intro Screens

Date: 2026-07-02
Status: Approved

## Context

GitHub issue #13 ("Game Template Change") asks for intro slides on each game with instructions or samples of how to play, added as a core engine mechanic rather than bolted onto individual games. This is the first of four features being implemented from this session's request (the other three — answer-within-N-seconds, per-session personal best, milestone badges — are separate, later specs).

Both existing games (`AnimalSoundsGame`, `ColorMatchGame`) share the entire game-loop pattern already (`useGameSession`, `GameChoiceGrid`, `GameResults`, `Timer`), so this feature follows the same shape: shared state/logic lives in `useGameSession`, and each game explicitly renders a new shared component, the same way `GameResults` is rendered today when `done` is true.

The app is unpublished, so no migration handling is needed for the new settings field.

## Behavior

- The intro appears on initial mount of a game (navigating from the dashboard into `/game/<id>`), before any question is shown.
- It does **not** reappear when the child taps "Play Again" on the results screen — only a fresh mount triggers it. This avoids interrupting repeat play in the same sitting.
- A "Don't show this again" checkbox lets a parent permanently dismiss the intro for that game; unchecked, the intro will show again on the next fresh mount (i.e., dismissal defaults to session-only unless the box is checked).
- Content is a single screen: the game's manifest icon, one line of instructional text, the checkbox, and a "Let's Play!" button. No multi-slide carousel — current games only need one sentence of instruction, and a carousel adds pagination infrastructure with no content to justify it yet.
- Admin's Games tab gets a "Replay Intro" button per game that clears the dismissed flag, so a parent doesn't have to hit the blanket "Reset to Defaults" (which would wipe every other setting) just to bring an intro back.

## New settings

Added to `DEFAULT_SETTINGS` in `src/storage/adapter.js`:

| Setting | Type / values | Default | Notes |
|---|---|---|---|
| `introDismissed` | `{ [gameId: string]: true }` | `{}` | same shape/pattern as existing `tagOverrides`; presence of a truthy entry for a gameId permanently suppresses that game's intro |

## Architecture

### `useGameSession` — intro gating

New returned state:
- `showIntro` (boolean) — computed on mount as `settingsLoaded && !settings.introDismissed?.[gameId]`. Stays `false` for the lifetime of the hook instance once resolved true→false via dismissal, i.e. it is **not** recomputed on `restart()`.
- `settingsLoaded` (boolean) — re-exported from `useSettings()`'s existing `loaded` flag. Needed because `settings` starts as `DEFAULT_SETTINGS` synchronously and only reflects real persisted data after the adapter promise resolves; without gating on this, a game with `introDismissed[gameId] === true` would flash the intro for one render before flipping it off. Games treat `!settingsLoaded` the same as they already treat `!current` — render `null`.
- `dismissIntro(dontShowAgain)` — sets `showIntro` to `false` in local hook state; if `dontShowAgain` is true, also calls `updateSetting('introDismissed', { ...settings.introDismissed, [gameId]: true })`.

`restart()` does not touch `showIntro` — it is only ever initialized once, at hook-mount time, consistent with the "no reappearance on Play Again" behavior above.

### `GameIntro` component

New `src/components/GameIntro.jsx` (+ `.css`), following the `GameResults` boundary pattern — a full-screen replacement panel, translated content passed in as already-resolved strings/props from the game component (never resolves i18n keys itself):

Props: `icon`, `name`, `instructions`, `dontShowAgain` (checkbox state), `onDontShowAgainChange`, `onStart`.

Renders: large icon, game name heading, instructional text, "Don't show this again" checkbox (`data-testid="game-intro-dont-show-again"`), and a "Let's Play!" button (`data-testid="game-intro-start"`) that calls `onStart()`.

### Game components

`useGameSession` also returns `dontShowAgain` (boolean, default `false`) and `setDontShowAgain` — hook-owned rather than component-local `useState`, consistent with the codebase's existing convention of centralizing all session state in the hook (e.g. `offerDifficultyBump` is hook-owned, not component-owned).

Both `AnimalSoundsGame` and `ColorMatchGame` gain, before the existing `if (done)` block:

```jsx
if (!settingsLoaded) return null
if (showIntro) {
  return (
    <GameIntro
      icon={manifest.icon}
      name={manifest.name}
      instructions={t('animalSounds.howToPlay')}
      dontShowAgain={dontShowAgain}
      onDontShowAgainChange={setDontShowAgain}
      onStart={() => dismissIntro(dontShowAgain)}
    />
  )
}
```

### Content

No `manifest.json` schema changes. Each game already has an i18n namespace; add:
- `animalSounds.howToPlay`
- `colorMatch.howToPlay`

New shared strings under `common.*`:
- `common.gameIntroStart` — "Let's Play!"
- `common.gameIntroDontShowAgain` — "Don't show this again"

New `admin.*` string:
- `admin.introReplayButton` — "Replay Intro"

### Admin — Games tab

In `AdminPage.jsx`'s `activeTab === 'games'` block, each game's tag row gets an additional "Replay Intro" button that calls `updateSetting('introDismissed', { ...settings.introDismissed, [m.id]: undefined })` — spreading and deleting the key (matching the existing `handleTagSave`/`handleTagReset` pattern of rebuilding the object via destructuring) rather than setting `false`, so the settings object stays minimal.

## Testing

Per `docs/TESTING.md`'s four layers:

- **Unit (Vitest):**
  - `GameIntro.test.jsx` — renders icon/name/instructions; checkbox toggling calls `onDontShowAgainChange`; "Let's Play!" calls `onStart`; axe a11y check. Negative case: checkbox unchecked by default, button present even with empty instructions text (no crash).
  - `useGameSession.test.js` — new cases: `showIntro` true on first mount with no `introDismissed` entry (positive); `showIntro` false when `introDismissed[gameId]` is true (negative/suppression); `dismissIntro(true)` persists via `updateSetting` and sets `showIntro` false; `dismissIntro(false)` sets `showIntro` false without calling `updateSetting`; `showIntro` stays false after `restart()` (does not reappear); `settingsLoaded` false before the mocked adapter resolves.
  - Both games' existing component tests updated to dismiss the intro (call the start button, or seed `introDismissed` via the mocked adapter) before their current interaction assertions, so existing coverage isn't broken by the new gating screen.
  - `AdminPage.test.jsx` — "Replay Intro" button clears the setting for the right gameId only (positive); leaves other games' `introDismissed` entries untouched (negative).
- **Accessibility (jest-axe):** added to `GameIntro.test.jsx`; checkbox has an associated `<label>`, button has accessible text (not icon-only).
- **E2E (Playwright):** extend both games' play-through specs to dismiss the intro as the first step; add a new case asserting the intro does NOT reappear after "Play Again"; add an admin case: dismiss with "don't show again" checked → reload → intro absent → "Replay Intro" → intro present again.
- **Visual regression (Storybook + Playwright screenshots):** new `GameIntro.stories.jsx` with a default story and a "checked" (don't-show-again ticked) story; committed baseline screenshots via `npx playwright test visual.spec.js --update-snapshots`.

## Documentation updates

- `README.md` — settings reference table gains `introDismissed`; brief mention of the how-to-play screen in feature docs if one exists there.
- `CHANGELOG.md` — new `## [0.7.0]` entry.
- `package.json` — version bump `0.6.0` → `0.7.0` (minor, per explicit request).
- Both games' `manifest.json` — minor version bump (`animal-sounds` and `color-match`) for the intro-screen addition.
- `docs/ENHANCEMENTS.md` — move issue #13 into a new "Recently Completed" entry (`### v0.7.0 — How-to-Play Intro Screens`); no new backlog item generated by this phase (unlike the previous phase, which spun off "answer within N seconds").
