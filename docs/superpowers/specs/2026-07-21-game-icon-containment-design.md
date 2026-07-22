# Game Icon Containment (Issue #39)

## Problem

Game icons that use an image (rather than an emoji) must physically live in `public/games/<id>/`, outside the game's own `src/games/<id>/` folder. This breaks the "drop a folder in, it just works" portability the rest of the engine guarantees for i18n (`src/games/<id>/i18n/en.json`) and badge catalogs (`src/games/<id>/badges.js`) — a game can't be copied, zipped, or removed as a single self-contained directory.

**Root cause:** `manifest.json` is loaded as plain JSON via `import.meta.glob('./games/*/manifest.json', { eager: true })` (`src/App.jsx:13`). Plain JSON imports have no mechanism to resolve a bundled asset URL, so the only way to reference an image icon today is a root-absolute string path (`/games/<id>/<file>`) that must correspond to a real file physically placed in `public/`. Per-game *content* images (e.g. Character Match's character portraits) don't have this problem — they're resolved inside each game's own JS via `import.meta.glob('../images/*', { eager: true, query: '?url', import: 'default' })` (`src/games/character-match/data/images.js`), which JSON imports can't do.

Today only 2 of 6 games use image icons (`character-match`, `character-match-bluey`); the rest use emoji strings and are unaffected.

## Design

### Architecture

New module `src/lib/gameIcons.js` (alongside `confetti.js`, `soundLibrary.js`, `badges.js`), with two pure, independently-testable exports:

```js
export function buildIconMap(entries)           // [path, url][] -> { [gameId]: url }; throws on duplicate icon files for one game
export function resolveIcon(manifest, iconMap)   // returns iconMap[manifest.id] ?? manifest.icon
```

Module-scope wiring (the only part touching the real filesystem, mirroring `data/images.js`'s existing pattern):

```js
const ICON_GLOB = '../games/*/icon.{png,gif,jpg,jpeg,webp,svg}'
const iconModules = import.meta.glob(ICON_GLOB, { eager: true, query: '?url', import: 'default' })
export const gameIconMap = buildIconMap(Object.entries(iconModules))
```

`src/App.jsx:16` changes from:
```js
const manifests = Object.values(manifestModules).map(m => m.default ?? m)
```
to:
```js
const manifests = Object.values(manifestModules)
  .map(m => m.default ?? m)
  .map(manifest => ({ ...manifest, icon: resolveIcon(manifest, gameIconMap) }))
```

`manifests` is built once here and passed as a prop to every consumer (`AppShell`, `Dashboard`, `AdminPage`, `ParentDashboard`, `KidsProgressPage` — `src/App.jsx:94-98`), so this is the only place resolution needs to happen. `ManifestIcon.jsx` and its 5 render call sites (`GameCard.jsx`, `FeaturedGameCard.jsx`, `GameIntro.jsx`, `AppShell.jsx`, `KidsProgressPage.jsx`) need no changes beyond the regex tweak below — they already just test whether the resolved string looks like an image path and render `<img>` accordingly, and a Vite-hashed bundled URL still ends in the right extension.

### Manifest schema — unchanged, auto-detected

`manifest.json`'s `icon` field keeps its current meaning: an emoji string, still required for every game. Dropping an `icon.<ext>` file into the game's own `src/games/<id>/` folder automatically takes precedence over the emoji for rendering; removing the file reverts to the emoji. No manifest field changes either way — this matches the existing auto-discovery philosophy (i18n files, badge catalogs) of "drop a file in, it's picked up."

### Supported formats

`png`, `gif`, `jpg`/`jpeg`, `webp`, `svg`. `ManifestIcon.jsx`'s `IMAGE_ICON_RE` gains `svg`: `/\.(png|gif|jpe?g|webp|svg)$/i` (the only change to that file).

### Duplicate-icon guard

If a game folder has two icon files (e.g. `icon.png` and `icon.svg`), `buildIconMap` throws at module-init time, naming the game id and both conflicting paths — the same "fail loud on ambiguity" precedent as `mergeLocaleResources()` throwing on duplicate i18n keys (`src/i18n/index.js`). This is unit-testable with synthetic input; no real duplicate files needed on disk.

### Migration of existing games

| Game | Today | After |
|---|---|---|
| `character-match` | `public/games/character-match/character-match.png`; manifest `icon` = that path | `src/games/character-match/icon.png`; manifest `icon` = `"🎭"` |
| `character-match-bluey` | `public/games/character-match-bluey/bluey.webp`; manifest `icon` = that path | `src/games/character-match-bluey/icon.webp`; manifest `icon` = `"🐶"` |

`public/games/` is deleted entirely afterward (it contains nothing else). `scripts/generate-character-match-placeholders.mjs` is updated to write its placeholder tile icon into `src/games/character-match/icon.png` instead of `public/games/character-match/icon.png`.

### Docs

- **CLAUDE.md** — one clause added to the Auto-discovery paragraph describing `icon.<ext>` alongside the existing per-game i18n/badge-catalog auto-discovery mentions.
- **README.md** (`Adding a New Game`, icon paragraph) — replace "The `icon` can also be an image path (see Character Match)" with the drop-a-file convention, supported formats, and the one-icon-per-game rule.
- **CHANGELOG.md** — new entry describing the containment fix, closing issue #39.
- **package.json** — patch version bump.
- `character-match`/`character-match-bluey` `manifest.json` — patch version bump each (icon source and fallback value changed).

`docs/superpowers/specs/2026-07-04-character-match-design.md` (which documents the old `public/`-path rationale) is left as-is — specs in this repo are dated point-in-time snapshots, not living docs.

## Testing

**Unit — `src/lib/__tests__/gameIcons.test.js` (new):**
- `buildIconMap`: positive — single entry maps id→url; negative — empty input → `{}`; negative — two icon files for the same id → throws, message names both paths.
- `resolveIcon`: positive — id present in map → returns mapped url (ignoring the manifest's emoji); negative — id absent → returns the manifest's original emoji unchanged.
- Live-disk integration check: `gameIconMap['character-match']` and `gameIconMap['character-match-bluey']` are defined and end in an image extension (proves the real migration wired up correctly); `gameIconMap['animal-sounds']` is `undefined` (a game with no icon file — negative case).

**Component — `src/components/__tests__/ManifestIcon.test.jsx` (extend):**
- Positive (new) — a `.svg` path renders an `<img>`.
- Negative (new) — an unsupported-extension string (e.g. `/a/b.bmp`) renders as text, not an `<img>`.

**E2E / visual regression:** no hardcoded icon paths exist in `e2e/` (confirmed via search), so no spec changes needed. `npm run e2e` will be run after migration to confirm `dashboard.spec.js` and `visual.spec.js` (Character Match card screenshot) still pass — the underlying image bytes are unchanged, only the serving URL changes, so no visual baseline update is expected, but this will be verified rather than assumed.

**Lint:** `npm run lint` covers the new/changed files as usual; no new rules needed.

## Out of scope

- The broken `/vite.svg` favicon reference in `index.html` (found during research; `public/vite.svg` doesn't exist) — unrelated global favicon issue, not per-game icon containment.
- Adding icons to the 4 emoji-only games — not requested; the mechanism just needs to exist and work when a game opts in.
