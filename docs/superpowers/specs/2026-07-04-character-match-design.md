# Character Match — Design

## Summary

A new game, `character-match`, structurally identical to `color-match`/`animal-sounds` (same `useGameSession` hook, `GameChoiceGrid`, `GameIntro`, `GameResults`, `Timer`), except each answer choice is illustrated with a real PNG/GIF/JPEG image instead of an emoji glyph. The child is asked "Which one is {name}?" and taps the matching character's picture.

Content: cartoon/TV characters from Bluey, Pete the Cat, and Bubble Guppies (private/limited use).

Built on a distinct branch/worktree (`feature/character-match`, off `main`) so it doesn't interact with in-progress work on `25-badges-page`.

## Goals

- Reuse all existing game-engine infrastructure (settings, scoring, streaks, personal bests, badges, hints, difficulty bump, timer, intro) unchanged — this is a content/rendering variant, not a new mechanic.
- Establish a reusable "image instead of emoji" pattern other future games can follow, without disturbing how `color-match`/`animal-sounds` render their own emoji-based choices.
- Let real character artwork be dropped in later by overwriting placeholder files in place — no code, filename, or data changes needed at that point.
- Support mixed image formats (PNG/GIF/JPEG) per character.

## Non-goals

- No new gameplay mechanic, no new settings.
- No audio.
- Not a general "image games" framework — just enough shared plumbing (a `ManifestIcon` component) to let one manifest-level icon be an image without a big refactor.

## File layout

```
src/games/character-match/
├── manifest.json
├── index.jsx
├── CharacterMatchGame.css
├── CharacterMatchGame.stories.jsx
├── data/
│   └── characters.js
│   └── images.js
├── images/
│   ├── bluey.png
│   ├── bingo.png
│   ├── ... (one file per character, see roster below)
└── __tests__/
    ├── characters.test.js
    └── CharacterMatchGame.test.jsx

public/games/character-match/
└── icon.png            # dashboard tile / intro screen icon

e2e/
└── character-match.spec.js
```

## Data: `data/characters.js`

Flat array, one entry per character:

```js
{ id: 'bluey', nameKey: 'character.bluey.name', show: 'Bluey', image: 'bluey.png' }
```

- `nameKey` follows the existing convention (`character.<id>.name`, resolved via `t()`), matching `color.<id>.name` / `animal.<id>.name`.
- `show` is plain, untranslated metadata (like manifest `name`/`description`) — purely for human readability/grouping when reviewing or extending the roster; not rendered in-game.
- `image` is the filename (with extension) inside `data/../images/`. Storing the full filename (not deriving it from `id`) is what allows mixed extensions per character.

Roster (17 characters):

| Show | Characters |
|---|---|
| Bluey | Bluey, Bingo, Bandit, Chilli, Muffin, Socks |
| Pete the Cat | Pete, Callie, Grumpy Toad, Marty, Gus |
| Bubble Guppies | Molly, Gil, Deema, Goby, Oona, Nonny |

## Image resolution: `data/images.js`

Mirrors `animal-sounds/data/sounds.js`'s glob-based URL resolution, generalized to any file type:

```js
const images = import.meta.glob('../images/*', { eager: true, query: '?url', import: 'default' })

export function getImageUrl(filename) {
  return images[`../images/${filename}`] ?? null
}
```

Because the glob pattern matches `*` rather than a specific extension, `.png`, `.gif`, and `.jpg`/`.jpeg` files can be freely mixed in the same directory without any code change.

## Manifest: `manifest.json`

```json
{
  "id": "character-match",
  "name": "Character Match",
  "description": "Match the name to the character!",
  "icon": "/games/character-match/icon.png",
  "color": "#FFB74D",
  "version": "1.0.0",
  "tags": ["visual", "characters"]
}
```

The `icon` is a path into `public/`, not an emoji. `public/` assets are served at a stable, un-hashed URL in both dev and production builds, which is required here because `manifest.json` is a plain JSON import with no accompanying JS module to resolve a bundled asset reference — unlike the per-choice character images, which are resolved through `data/images.js` because that code has direct access to `import.meta.glob`.

## Shared component change: `ManifestIcon`

New file `src/components/ManifestIcon.jsx`:

```jsx
const IMAGE_ICON_RE = /\.(png|gif|jpe?g)$/i

export default function ManifestIcon({ icon, alt = '', className }) {
  if (IMAGE_ICON_RE.test(icon)) {
    return <img src={icon} alt={alt} className={className} />
  }
  return <span className={className} aria-hidden="true">{icon}</span>
}
```

`GameCard.jsx`, `FeaturedGameCard.jsx`, `GameIntro.jsx`, and `KidsProgressPage.jsx` swap their current `{icon}` text render for `<ManifestIcon icon={icon} className="..." />`, passing the same class name each already uses so no CSS changes are required. For `color-match`/`animal-sounds` (plain emoji strings), `ManifestIcon` renders exactly as before — this is purely additive.

`Dashboard.jsx`'s `TAG_ICONS` map gets one new entry: `characters: '🎭'`, so the new "Characters" tag section/tab gets an icon (this map is unrelated to the `ManifestIcon` change — it's the existing tag-badge system, untouched otherwise).

## Component: `index.jsx`

Structural copy of `ColorMatchGame.jsx`:

- `useGameSession({ gameId: 'character-match', items: characters })` — identical usage.
- No `game__swatch`. The prompt area shows only progress + prompt text (`t('characterMatch.prompt', { name: t(current.correct.nameKey) })`, e.g. "Which one is Bluey?") + timer, same layout slot ColorMatch uses for its swatch.
- `renderChoiceContent` renders `<img src={getImageUrl(character.image)} alt="" className="game__choice-image" />` followed by the name label span (same structure as ColorMatch/AnimalSounds). `alt=""` because the adjacent name label already conveys the identity — avoids redundant screen-reader announcement.
- `getChoiceProps` sets `data-character-id` (no background-color styling needed — images carry their own visual identity, unlike ColorMatch's swatch-colored buttons).
- `data-testid="correct-character-id"` replaces `data-testid="correct-color-id"`.
- Results screen `renderMissedItem` shows a small `<img>` + translated name, mirroring ColorMatch's swatch dot + name.

Everything else (settings/scores hooks, feedback-mode branching, hints, difficulty bump, personal bests, badges, restart, results) is unchanged from ColorMatch.

## CSS: `CharacterMatchGame.css`

Copy of `ColorMatchGame.css`, dropping `.game__swatch` and `.game__choice--bordered`/`BORDERED_IDS` (not needed — no near-white/near-background color collisions with real images), adding:

```css
.game__choice-image { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; }
```

## Placeholder images

Since real artwork isn't available yet, one solid-color placeholder image is generated per character and per-game tile icon, at the exact final filename/path (e.g. `src/games/character-match/images/bluey.png`, `public/games/character-match/icon.png`). Later, each file is overwritten in place with real art — no code, filename, or data changes needed.

After real art replaces the placeholders, the Storybook visual-regression baseline (`games-charactermatchgame--default`) will need a one-time re-capture via `npx playwright test visual.spec.js --update-snapshots`. This is a follow-up step for whoever swaps the images, not part of this build.

## i18n: `src/i18n/en.json`

New namespaces, following the existing convention (manifest `name`/`description` are NOT translated; everything else is):

```json
"characterMatch": {
  "prompt": "Which one is {{name}}?",
  "howToPlay": "Hear the name, then tap the matching character!"
},
"character": {
  "bluey": { "name": "Bluey" },
  "bingo": { "name": "Bingo" },
  ...
}
```

## Testing

`data/__tests__/characters.test.js` — mirrors `colors.test.js`: pool has ≥ 8 entries, every entry has `id`, `nameKey` (matching `character.<id>.name`), `show`, and `image`; all ids unique.

`__tests__/CharacterMatchGame.test.jsx` — mirrors `ColorMatchGame.test.jsx` test-for-test, swapping `data-color-id`/`correct-color-id` for `data-character-id`/`correct-character-id`:
renders question + choice buttons; correct answer gets `correct` class; wrong answer gets `wrong` + highlights correct; results screen after immediate mode; Home button calls `onGameEnd`; no a11y violations (`jest-axe`); streak badge after 2 correct; missed items shown in results; timer shown/hidden per `timerMode`; retry behavior with `maxTries`; no premature Next button during countdown timeout; difficulty-bump offer after a perfect session; full how-to-play intro suite (shows on first visit, "don't show again" persistence, doesn't reappear after Play Again).

`CharacterMatchGame.stories.jsx` — same `pinRandom` + `seedIntroDismissed` decorator pattern as `ColorMatchGame.stories.jsx`.

`e2e/character-match.spec.js` — mirrors `e2e/color-match.spec.js`'s 6 scenarios (intro shows/suppresses, Play Again doesn't re-show intro, full play-through reaches results, two a11y scans, retry-without-locking with admin settings).

`e2e/visual.spec.js` — add `'games-charactermatchgame--default'` to the `stories` array.

No test needed for `ManifestIcon`'s existing-game (emoji) path beyond what's implicit in `Dashboard`/`GameCard`/`GameIntro`'s existing tests continuing to pass unchanged; a small new `ManifestIcon.test.jsx` covers both branches (emoji string → text span, image path → `<img>`) directly.
