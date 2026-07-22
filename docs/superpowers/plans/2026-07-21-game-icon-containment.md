# Game Icon Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a game declare an image dashboard-tile icon by dropping an `icon.<ext>` file inside its own `src/games/<id>/` folder, instead of requiring the file to live in `public/games/<id>/` outside the game's folder (issue #39).

**Architecture:** A new pure-function module, `src/lib/gameIcons.js`, builds a `{ gameId: resolvedUrl }` map from an `import.meta.glob('../games/*/icon.{png,gif,jpg,jpeg,webp,svg}', { eager: true, query: '?url', import: 'default' })` call — the same asset-resolution pattern `src/games/character-match/data/images.js` already uses for content images, just applied one level up. `src/App.jsx` resolves each manifest's `icon` field through this map once, at the point `manifests` is built, so every consumer of `manifests` (`AppShell`, `Dashboard`, `AdminPage`, `ParentDashboard`, `KidsProgressPage`) gets the resolved icon automatically with zero changes to any of them. `ManifestIcon.jsx` needs one regex change (add `svg`) and nothing else.

**Tech Stack:** React 18 + Vite (`import.meta.glob`), Vitest + React Testing Library.

## Global Constraints

- Manifest schema is unchanged: `icon` stays a required emoji string on every game; an `icon.<ext>` file in the game's folder overrides it for rendering, auto-detected by presence — no new manifest field.
- Each game may have at most one `icon.<ext>` file; a second one is a build-time error (`buildIconMap` throws), not a silent pick.
- Supported icon image extensions: `png`, `gif`, `jpg`, `jpeg`, `webp`, `svg`.
- Positive and negative test cases at every layer touched (standing project preference).
- Versioning: patch bump on `package.json` (`0.32.1` → `0.32.2`), patch bump on `character-match`'s and `character-match-bluey`'s `manifest.json` (their icon source/fallback changed), new `CHANGELOG.md` entry closing issue #39.
- Update `CLAUDE.md` and `README.md` to document the new `icon.<ext>` convention.
- Continues on the existing branch `39` — do not create a new branch.
- Design reference: `docs/superpowers/specs/2026-07-21-game-icon-containment-design.md`.

---

### Task 1: `src/lib/gameIcons.js` — pure resolution functions

**Files:**
- Create: `src/lib/gameIcons.js`
- Create: `src/lib/__tests__/gameIcons.test.js`

**Interfaces:**
- Produces: `buildIconMap(entries: [string, string][]): Record<string, string>` and `resolveIcon(manifest: { id: string, icon: string }, iconMap: Record<string, string>): string` — Task 2 imports both.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/gameIcons.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { buildIconMap, resolveIcon } from '../gameIcons'

describe('buildIconMap', () => {
  it('maps a game id to its resolved icon url', () => {
    const map = buildIconMap([
      ['../games/character-match/icon.png', '/assets/icon-abc123.png'],
    ])
    expect(map).toEqual({ 'character-match': '/assets/icon-abc123.png' })
  })

  it('returns an empty map for no entries', () => {
    expect(buildIconMap([])).toEqual({})
  })

  it('ignores paths that are not icon.<ext> files', () => {
    const map = buildIconMap([
      ['../games/character-match/images/bg_1.webp', '/assets/bg-1.webp'],
    ])
    expect(map).toEqual({})
  })

  it('throws when a game has more than one icon file', () => {
    const entries = [
      ['../games/character-match/icon.png', '/assets/icon-a.png'],
      ['../games/character-match/icon.svg', '/assets/icon-b.svg'],
    ]
    expect(() => buildIconMap(entries)).toThrow(
      'Multiple icon files found for game "character-match": ' +
      '../games/character-match/icon.png and ../games/character-match/icon.svg. ' +
      'Each game may have at most one icon.<ext> file.'
    )
  })
})

describe('resolveIcon', () => {
  it('returns the mapped image url when the game has an icon file', () => {
    const iconMap = { 'character-match': '/assets/icon-abc123.png' }
    expect(resolveIcon({ id: 'character-match', icon: '🎭' }, iconMap)).toBe('/assets/icon-abc123.png')
  })

  it('falls back to the manifest emoji when the game has no icon file', () => {
    expect(resolveIcon({ id: 'animal-sounds', icon: '🐘' }, {})).toBe('🐘')
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/lib/__tests__/gameIcons.test.js`
Expected: FAIL with `Cannot find module '../gameIcons'` (the file doesn't exist yet).

- [ ] **Step 3: Implement `src/lib/gameIcons.js`**

Create `src/lib/gameIcons.js`:
```js
const ICON_PATH_RE = /\/games\/([^/]+)\/icon\.[^./]+$/

export function buildIconMap(entries) {
  const sourcePaths = {}
  const map = {}
  for (const [path, url] of entries) {
    const match = path.match(ICON_PATH_RE)
    if (!match) continue
    const id = match[1]
    if (id in sourcePaths) {
      throw new Error(
        `Multiple icon files found for game "${id}": ${sourcePaths[id]} and ${path}. ` +
        'Each game may have at most one icon.<ext> file.'
      )
    }
    sourcePaths[id] = path
    map[id] = url
  }
  return map
}

export function resolveIcon(manifest, iconMap) {
  return iconMap[manifest.id] ?? manifest.icon
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/__tests__/gameIcons.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gameIcons.js src/lib/__tests__/gameIcons.test.js
git commit -m "feat(39): add pure icon-map resolution functions"
```

---

### Task 2: Wire the live glob into `gameIcons.js` and `src/App.jsx`

**Files:**
- Modify: `src/lib/gameIcons.js`
- Modify: `src/lib/__tests__/gameIcons.test.js`
- Modify: `src/App.jsx:1-16`

**Interfaces:**
- Consumes: `buildIconMap`, `resolveIcon` from Task 1.
- Produces: `gameIconMap: Record<string, string>` (named export of `src/lib/gameIcons.js`), built from the real filesystem — Task 3/4's live-integration tests read this directly; `src/App.jsx`'s `manifests` array now has each `icon` field pre-resolved, consumed unchanged by every existing reader of `manifests`.

- [ ] **Step 1: Write the failing live-filesystem test**

Add to `src/lib/__tests__/gameIcons.test.js` (new `describe` block, alongside the existing ones — add the import at the top too):
```js
import { buildIconMap, resolveIcon, gameIconMap } from '../gameIcons'
```
```js
describe('gameIconMap (live filesystem)', () => {
  it('has no icon for a game with no icon file', () => {
    expect(gameIconMap['animal-sounds']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/lib/__tests__/gameIcons.test.js`
Expected: FAIL with `does not provide an export named 'gameIconMap'` (not implemented yet).

- [ ] **Step 3: Add the live glob wiring to `src/lib/gameIcons.js`**

Append to the bottom of `src/lib/gameIcons.js`:
```js
const iconModules = import.meta.glob('../games/*/icon.{png,gif,jpg,jpeg,webp,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

export const gameIconMap = buildIconMap(Object.entries(iconModules))
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/lib/__tests__/gameIcons.test.js`
Expected: PASS — 7 tests. (No game currently has an `icon.<ext>` file yet, so `gameIconMap` is `{}` at this point — that's expected and still exercises the real glob wiring.)

- [ ] **Step 5: Wire resolution into `src/App.jsx`**

Edit `src/App.jsx` — add the import alongside the existing top-level imports (after the `useSettings` import, before `i18n`):
```js
import useSettings from './hooks/useSettings'
import { gameIconMap, resolveIcon } from './lib/gameIcons'
import i18n from './i18n'
```

Then change the manifest-building line:
```js
const manifests = Object.values(manifestModules).map(m => m.default ?? m)
```
to:
```js
const manifests = Object.values(manifestModules)
  .map(m => m.default ?? m)
  .map(manifest => ({ ...manifest, icon: resolveIcon(manifest, gameIconMap) }))
```

- [ ] **Step 6: Run the full unit test suite and confirm no regressions**

Run: `npx vitest run`
Expected: PASS — all existing suites (including `src/App.test.jsx`, `src/components/__tests__/ManifestIcon.test.jsx`, `src/components/__tests__/GameCard.test.jsx`) still pass unchanged, since every game's `icon` value is unaffected until Task 3/4 add real `icon.<ext>` files.

- [ ] **Step 7: Commit**

```bash
git add src/lib/gameIcons.js src/lib/__tests__/gameIcons.test.js src/App.jsx
git commit -m "feat(39): resolve manifest icons through gameIconMap in App.jsx"
```

---

### Task 3: Migrate `character-match`'s icon into its own folder

**Files:**
- Move: `public/games/character-match/character-match.png` → `src/games/character-match/icon.png`
- Modify: `src/games/character-match/manifest.json`
- Modify: `scripts/generate-character-match-placeholders.mjs:86-100`
- Modify: `src/lib/__tests__/gameIcons.test.js`

**Interfaces:**
- Consumes: `gameIconMap` (Task 2) — this task's new test reads it directly.
- Produces: no new interface; `character-match`'s manifest `icon` field is now `"🎭"` (the emoji fallback), with the real image auto-resolved by `gameIconMap['character-match']`.

- [ ] **Step 1: Write the failing live-integration test**

Add to `src/lib/__tests__/gameIcons.test.js`, inside the existing `describe('gameIconMap (live filesystem)', ...)` block:
```js
  it('resolves an image url for a game with an icon file', () => {
    expect(gameIconMap['character-match']).toMatch(/\.png$/)
  })
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/lib/__tests__/gameIcons.test.js`
Expected: FAIL — `gameIconMap['character-match']` is `undefined` (no `icon.png` file exists yet at the new location).

- [ ] **Step 3: Move the icon file**

```bash
mkdir -p "src/games/character-match"
git mv "public/games/character-match/character-match.png" "src/games/character-match/icon.png"
```

If the `public/games/character-match/` directory is now empty, remove it:
```bash
rmdir "public/games/character-match" 2>/dev/null || true
```

- [ ] **Step 4: Update the manifest**

Edit `src/games/character-match/manifest.json`:
```json
{
  "id": "character-match",
  "nameKey": "characterMatch.manifestName",
  "descriptionKey": "characterMatch.manifestDescription",
  "icon": "🎭",
  "color": "#FFB74D",
  "version": "1.4.5",
  "tags": ["visual", "characters"]
}
```

- [ ] **Step 5: Update the placeholder-generator script**

Edit `scripts/generate-character-match-placeholders.mjs` — change the `tileIconDir` line and the two directory/file lines that follow it:
```js
const imagesDir = join(root, 'src/games/character-match/images')
const tileIconDir = join(root, 'src/games/character-match')
mkdirSync(imagesDir, { recursive: true })
mkdirSync(tileIconDir, { recursive: true })
```
and the write call near the bottom:
```js
const tileIcon = solidColorPng(128, 128, hslToRgb(30, 0.7, 0.55))
writeFileSync(join(tileIconDir, 'icon.png'), tileIcon)
console.log('wrote icon.png')
```
(Only `tileIconDir`'s value changes, from `'public/games/character-match'` to `'src/games/character-match'`; the rest of the script, including the `icon.png` filename it already wrote, is unchanged.)

- [ ] **Step 6: Run the test and confirm it passes**

Run: `npx vitest run src/lib/__tests__/gameIcons.test.js`
Expected: PASS — 8 tests.

- [ ] **Step 7: Run the full unit test suite**

Run: `npx vitest run`
Expected: PASS — in particular `src/components/__tests__/GameCard.test.jsx`, `src/components/__tests__/ManifestIcon.test.jsx`, and any Character Match game tests still pass. The rendered `<img src>` value changes from `/games/character-match/character-match.png` to a Vite-bundled asset URL, but no test asserts that literal string (confirmed during design research), so nothing should break.

- [ ] **Step 8: Commit**

`git mv` already staged the file's removal from `public/` and its addition under `src/games/character-match/`, so only the remaining edited files need adding:
```bash
git add src/games/character-match/manifest.json \
  scripts/generate-character-match-placeholders.mjs src/lib/__tests__/gameIcons.test.js
git commit -m "feat(39): contain character-match's icon inside its own game folder"
```

---

### Task 4: Migrate `character-match-bluey`'s icon into its own folder

**Files:**
- Move: `public/games/character-match-bluey/bluey.webp` → `src/games/character-match-bluey/icon.webp`
- Modify: `src/games/character-match-bluey/manifest.json`
- Modify: `src/lib/__tests__/gameIcons.test.js`

**Interfaces:**
- Consumes: `gameIconMap` (Task 2).
- Produces: no new interface; `character-match-bluey`'s manifest `icon` field is now `"🐶"`.

- [ ] **Step 1: Write the failing live-integration test**

Add to `src/lib/__tests__/gameIcons.test.js`, inside `describe('gameIconMap (live filesystem)', ...)`:
```js
  it('resolves an image url for a second game with an icon file', () => {
    expect(gameIconMap['character-match-bluey']).toMatch(/\.webp$/)
  })
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/lib/__tests__/gameIcons.test.js`
Expected: FAIL — `gameIconMap['character-match-bluey']` is `undefined`.

- [ ] **Step 3: Move the icon file**

```bash
git mv "public/games/character-match-bluey/bluey.webp" "src/games/character-match-bluey/icon.webp"
rmdir "public/games/character-match-bluey" 2>/dev/null || true
rmdir "public/games" 2>/dev/null || true
```

- [ ] **Step 4: Update the manifest**

Edit `src/games/character-match-bluey/manifest.json`:
```json
{
  "id": "character-match-bluey",
  "nameKey": "characterMatchGameBluey.manifestName",
  "descriptionKey": "characterMatchGameBluey.manifestDescription",
  "icon": "🐶",
  "color": "#FFB74D",
  "version": "1.0.2",
  "tags": ["visual", "characters", "bluey"]
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run src/lib/__tests__/gameIcons.test.js`
Expected: PASS — 9 tests.

- [ ] **Step 6: Run the full unit test suite**

Run: `npx vitest run`
Expected: PASS, same reasoning as Task 3 Step 7.

- [ ] **Step 7: Commit**

`git mv` already staged the file's removal from `public/` and its addition under `src/games/character-match-bluey/`, so only the remaining edited files need adding:
```bash
git add src/games/character-match-bluey/manifest.json src/lib/__tests__/gameIcons.test.js
git commit -m "feat(39): contain character-match-bluey's icon inside its own game folder"
```

---

### Task 5: Add `svg` support to `ManifestIcon`

**Files:**
- Modify: `src/components/ManifestIcon.jsx:1`
- Modify: `src/components/__tests__/ManifestIcon.test.jsx`

**Interfaces:**
- No interface change — `ManifestIcon`'s props (`icon`, `as`, `className`, `ariaHidden`) are unchanged; only which strings it treats as images changes.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/__tests__/ManifestIcon.test.jsx`, after the existing `'renders an image for .gif, .jpg, and .webp paths too'` test:
```js
  it('renders an image for .svg paths too', () => {
    const { container } = render(<ManifestIcon icon="/a/b.svg" />)
    expect(container.querySelector('img')).not.toBeNull()
  })

  it('renders an unsupported-extension path as text, not an image', () => {
    render(<ManifestIcon icon="/a/b.bmp" />)
    const el = screen.getByText('/a/b.bmp')
    expect(el.tagName).toBe('SPAN')
  })
```

- [ ] **Step 2: Run the tests and confirm the new svg case fails**

Run: `npx vitest run src/components/__tests__/ManifestIcon.test.jsx`
Expected: FAIL on `'renders an image for .svg paths too'` — `IMAGE_ICON_RE` doesn't match `.svg` yet, so `container.querySelector('img')` is `null`. The unsupported-extension test passes already (current behavior is already correct for it) — that's fine, it's a regression guard being added now rather than a new behavior.

- [ ] **Step 3: Update the regex**

Edit `src/components/ManifestIcon.jsx`:
```js
const IMAGE_ICON_RE = /\.(png|gif|jpe?g|webp|svg)$/i
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/components/__tests__/ManifestIcon.test.jsx`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ManifestIcon.jsx src/components/__tests__/ManifestIcon.test.jsx
git commit -m "feat(39): support svg game icons in ManifestIcon"
```

---

### Task 6: Docs, versioning, and full verification

**Files:**
- Modify: `CLAUDE.md:32`
- Modify: `README.md` (icon paragraph in "Adding a New Game", around line 240)
- Modify: `CHANGELOG.md`
- Modify: `package.json:4`

- [ ] **Step 1: Update `CLAUDE.md`'s Auto-discovery paragraph**

In `CLAUDE.md`, the Auto-discovery paragraph currently ends:
```
The same principle covers per-game i18n (`src/games/<id>/i18n/en.json`, picked up by `src/i18n/index.js`) and per-game badge catalogs (`src/games/<id>/badges.js`, which fully replace the global quiz catalog for that game).
```
Change it to:
```
The same principle covers per-game i18n (`src/games/<id>/i18n/en.json`, picked up by `src/i18n/index.js`), per-game badge catalogs (`src/games/<id>/badges.js`, which fully replace the global quiz catalog for that game), and per-game dashboard icons (`src/games/<id>/icon.<ext>` — `png`/`gif`/`jpg`/`jpeg`/`webp`/`svg` — resolved by `src/lib/gameIcons.js` and rendered in place of the manifest's `icon` emoji when present).
```

- [ ] **Step 2: Update `README.md`'s "Adding a New Game" icon paragraph**

In `README.md`, this line (just below the manifest JSON example in the "Adding a New Game" section):
```
   The `icon` can also be an image path (see Character Match). Memory-type games add `"gameType": "memory"`, which switches the My Progress page to memory-appropriate stat tiles.
```
becomes:
```
   The `icon` value is normally an emoji, rendered as text — it's always required, even for games using an image icon (it's the fallback if the image is ever removed). To use an image instead, drop an `icon.png`/`icon.gif`/`icon.jpg`/`icon.jpeg`/`icon.webp`/`icon.svg` file directly in the game's own folder (see Character Match) — it's auto-discovered and rendered in place of the emoji, no manifest field needed. Each game may have at most one `icon.<ext>` file. Memory-type games add `"gameType": "memory"`, which switches the My Progress page to memory-appropriate stat tiles.
```

- [ ] **Step 3: Bump versions**

Edit `package.json` line 4:
```json
  "version": "0.32.2",
```

(`character-match` and `character-match-bluey` manifests were already bumped in Tasks 3 and 4.)

- [ ] **Step 4: Add a `CHANGELOG.md` entry**

Insert a new entry at the top of `CHANGELOG.md`, immediately after the `Format follows...` line and before the existing `## [0.32.1]` entry:
```markdown
## [0.32.2] - 2026-07-21

### Fixed

- Game dashboard icons no longer have to live in `public/`, outside a game's own folder (issue #39). Root cause: `manifest.json` is loaded as plain JSON via `import.meta.glob('./games/*/manifest.json', { eager: true })`, and plain JSON imports have no way to resolve a bundled asset URL — the only previous option for an image icon was a root-absolute path (`/games/<id>/<file>`) pointing at a real file physically placed in `public/games/<id>/`. A game can now drop an `icon.png`/`icon.gif`/`icon.jpg`/`icon.jpeg`/`icon.webp`/`icon.svg` file directly inside its own `src/games/<id>/` folder instead; a new `src/lib/gameIcons.js` resolves it via `import.meta.glob` (the same asset-resolution pattern `character-match`'s content images already used) and `src/App.jsx` substitutes it for the manifest's emoji `icon` automatically, with no manifest schema change and no changes needed in any of the five components that render an icon. `character-match` and `character-match-bluey` — the only two games using image icons — were migrated to the new convention; `public/games/` no longer exists.
```

- [ ] **Step 5: Run full verification**

Run in order:
```bash
npm run lint
npx vitest run
npm run e2e
```
Expected: all three pass. In particular, watch for:
- `npx vitest run` — no failures anywhere in the suite (this is the full run, not just the icon-related files touched above).
- `npm run e2e` — `dashboard.spec.js` and `visual.spec.js` (Character Match's story screenshot) pass with no visual diff, since the underlying image bytes for both migrated icons are byte-for-byte unchanged, only their serving URL changed.

If `visual.spec.js` reports an unexpected diff, stop and investigate before updating any snapshot — an icon-path change should not alter rendered pixels.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md CHANGELOG.md package.json
git commit -m "docs(39): document per-game icon.<ext> convention, bump version"
```

---

## Post-plan verification checklist

- [ ] `public/games/` no longer exists anywhere in the repo.
- [ ] `grep -r "games/character-match/character-match.png\|games/character-match-bluey/bluey.webp" src/ scripts/` returns no matches.
- [ ] Both migrated games still show their correct image icon when running `npm run dev` and visiting the dashboard (manual visual check, since this changes a build-time asset resolution path that automated tests can't fully substitute for).
- [ ] A third game's icon (e.g. `animal-sounds`, emoji-only) is unaffected.
