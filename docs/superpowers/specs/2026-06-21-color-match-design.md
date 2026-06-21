# Color Match — Design

## Summary

A new game, `color-match`, following the existing `animal-sounds` game pattern. A color swatch is shown; the child picks the matching colored object from picture buttons. Purely visual — no audio assets.

## Goals

- Reuse the existing auto-discovery, storage, and settings infrastructure unchanged.
- Mirror `AnimalSoundsGame.jsx`'s structure closely enough that the two games are easy to compare and maintain.
- Make matching unambiguous for a toddler: the swatch color and the correct button's background are the *same* hex value, so the child is matching colors directly, not interpreting color names.

## Non-goals

- No new global settings. Reuses `numChoices`, `feedbackMode`, `questionsPerSession` from `useSettings`.
- No audio, no Web Speech API, no spoken color names.
- No new design tokens in `src/index.css` — the color roster's hex values are game-local data, not part of the app's UI design system.

## File layout

```
src/games/color-match/
├── manifest.json
├── index.jsx
├── ColorMatchGame.css
├── data/
│   └── colors.js
└── __tests__/
    ├── colors.test.js
    └── ColorMatchGame.test.jsx
```

## Data: `data/colors.js`

Exports a flat array of 16 entries:

```js
{ id: 'red', name: 'Red', color: '#E53935', emoji: '🍎', object: 'Apple' }
```

Roster (id / object / emoji / hex):
red/Apple/🍎/#E53935, orange/Orange/🍊/#FB8C00, yellow/Banana/🍌/#FDD835, green/Leaf/🍃/#43A047, blue/Blueberry/🫐/#1E88E5, purple/Grapes/🍇/#8E24AA, pink/Flower/🌸/#F06292, brown/Chestnut/🌰/#6D4C41, black/Top Hat/🎩/#212121, white/Cloud/☁️/#FAFAFA, gray/Rock/🪨/#9E9E9E, teal/Wave/🌊/#00897B, lime/Tennis Ball/🎾/#C0CA33, turquoise/Gem/💎/#00BCD4, gold/Star/⭐/#FFC107, silver/Moon/🌙/#B0BEC5.

`white` and `silver`/`gray` are near-white/near-gray — buttons need a visible border (e.g. `1px solid var(--color-border)` or a subtle box-shadow) so they're distinguishable from the card background regardless of which hex they carry.

Each entry's `name` is the color name (shown as the button label, same role as the animal name in Animal Sounds); `object` is unused at runtime — kept in data only as a human-readable comment of what the emoji depicts, not displayed in the UI (avoids redundant text; the swatch-to-background color match is the whole mechanic).

## Manifest: `manifest.json`

```json
{
  "id": "color-match",
  "name": "Color Match",
  "description": "Match the color to its object!",
  "icon": "🎨",
  "color": "#CE93D8",
  "version": "1.0.0"
}
```

## Component: `index.jsx`

Structural copy of `AnimalSoundsGame.jsx` with these differences:

- `buildQueue(numChoices, questionsPerSession)` is unchanged in shape, operating over the color roster instead of animals: each round is `{ correct, choices }`.
- No `audioRef`, no `playSound()`, no replay button. In their place, the question header renders a static swatch: a rounded square (`game__swatch`) whose `background` is `current.correct.color`. It stays visible for the whole question (no timed/triggered behavior, since there's nothing to "replay").
- Choice buttons (`game__choice`) get `style={{ background: choice.color }}` instead of the rotating `CHOICE_COLORS` array Animal Sounds uses — each button's color is intrinsic to its data, not a positional rotation.
- `white`/`silver`/`gray` buttons get a `border` via CSS (not inline style) so they read clearly against the card background.
- Correct/wrong/highlight feedback classes (`correct`, `wrong`, `highlight-correct`) behave identically to Animal Sounds — these classes add an outline/checkmark treatment in CSS, layered on top of the button's own background color, so feedback stays visible regardless of the button's intrinsic color.
- `data-testid="correct-color-id"` replaces `data-testid="correct-animal-id"`, same purpose: let tests assert the correct answer without depending on choice order.
- `finishGame()` produces `{ gameId: 'color-match', score, total, date, timestamp }` — same shape, different `gameId`.

Everything else — `useSettings`/`useScores` usage, `feedbackMode` branching (immediate auto-advance vs. parent-tap), `restart()`, the results screen — is copied as-is from Animal Sounds.

## CSS: `ColorMatchGame.css`

Copy of `AnimalSoundsGame.css`'s layout rules (`.game`, `.game__header`, `.game__choices`, `.results*`), renaming the sound-specific rule (`.game__replay`) to the swatch rule (`.game__swatch`: fixed size e.g. 96×96px, `border-radius`, centered under the prompt text) and adding the white/silver/gray border rule described above.

## Testing

`__tests__/colors.test.js` — mirrors `animals.test.js`: asserts the roster has 16 unique ids, each entry has `name`, `color` (valid hex), and `emoji`.

`__tests__/ColorMatchGame.test.jsx` — mirrors `AnimalSoundsGame.test.jsx` minus anything audio-related:

- Renders a swatch and the expected number of choice buttons (per `numChoices` setting).
- Selecting the correct button (found via `data-testid="correct-color-id"`) increments score and applies the `correct` class.
- Selecting a wrong button applies `wrong` to it and `highlight-correct` to the correct one.
- `feedbackMode: 'immediate'` auto-advances after the fake-timer delay (`vi.useFakeTimers()` + `fireEvent`, per the existing project convention — not `userEvent`).
- `feedbackMode: 'parent-tap'` requires the "Next →" button.
- Finishing the session calls `addScore` with `{ gameId: 'color-match', score, total, ... }`.
- "Play Again" resets state; "Home" calls `onGameEnd`.

No test needed for audio (none exists), so the test file is shorter than Animal Sounds' equivalent.
