# Character Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new auto-discovered game, `character-match`, structurally identical to `color-match` (same `useGameSession`/`GameChoiceGrid`/`GameIntro`/`GameResults`/`Timer` usage), where each answer choice is a real PNG/GIF/JPEG image of a cartoon character instead of an emoji glyph.

**Architecture:** New self-contained folder `src/games/character-match/` following the exact structural pattern of `src/games/color-match/`. Images are resolved via `import.meta.glob`, mirroring how `src/games/animal-sounds/data/sounds.js` already resolves audio file URLs. A new shared `ManifestIcon` component lets the dashboard tile/intro icon also be an image (rather than an emoji) without changing behavior for the two existing games. Real character artwork isn't available yet, so this plan also generates solid-color placeholder PNGs at the exact final file paths, to be overwritten in place later.

**Tech Stack:** React 18, Vite (auto-discovery via `import.meta.glob`), Vitest + React Testing Library + jsdom, Playwright (E2E + visual regression), Storybook.

**Execution note:** This plan should be executed inside an isolated workspace on branch `feature/character-match`, based off `main` (not off the current `25-badges-page` branch — this design/plan documentation was committed there, but the branch is otherwise unrelated to this feature). Whichever skill executes this plan (`subagent-driven-development` or `executing-plans`) should invoke `superpowers:using-git-worktrees` first and confirm/create that branch before Task 1.

## Global Constraints

- Score shape unchanged: `{ gameId: 'character-match', score, total, date, timestamp }` (per `src/storage/adapter.js`).
- Manifest fields: `id`, `name`, `description`, `icon`, `color`, `version`, `tags` — `icon` is an **image path** here (`/games/character-match/icon.png`), not an emoji, unlike every other existing game's manifest.
- No new global settings — reuse `numChoices`, `feedbackMode`, `questionsPerSession`, `maxTries`, hints, timer, difficulty-bump, personal-best, and badge settings from `useSettings`/`useGameSession` exactly as `color-match` does.
- Timed-feedback tests must use `vi.useFakeTimers()` + `fireEvent`, never `userEvent` (this codebase's documented convention — `userEvent` deadlocks with fake timers).
- `data-testid="correct-character-id"` on a hidden span exposes the correct answer to tests without depending on choice display order (mirrors `data-testid="correct-color-id"`).
- Images may mix `.png`/`.gif`/`.jpg`/`.jpeg` per character — resolved via a glob that matches any file, not a fixed extension.
- The `ManifestIcon` change is strictly additive: `color-match` and `animal-sounds` (plain emoji strings) must render pixel-identical DOM after the change, and their existing tests/visual-regression baselines must pass unmodified.
- i18n convention: manifest `name`/`description` are NOT translated; all in-game strings and data item names ARE, via `t()` and a `nameKey` field (per `docs/TESTING.md`).

---

### Task 1: Character roster data module

**Files:**
- Create: `src/games/character-match/data/characters.js`
- Test: `src/games/character-match/__tests__/characters.test.js`

**Interfaces:**
- Produces: default export `characters` — an array of `{ id: string, nameKey: string, show: string, image: string }`. Task 2's placeholder generator and Task 7's `index.jsx` both import this as `import characters from './data/characters'` (or `'../data/characters'` from the generator script).

- [ ] **Step 1: Write the failing test**

Create `src/games/character-match/__tests__/characters.test.js`:

```js
import { describe, it, expect } from 'vitest'
import characters from '../data/characters'

describe('characters data', () => {
  it('exports an array of at least 8 characters', () => {
    expect(Array.isArray(characters)).toBe(true)
    expect(characters.length).toBeGreaterThanOrEqual(8)
  })

  it('every character has required fields', () => {
    for (const character of characters) {
      expect(character.id,      `${character.nameKey} missing id`).toBeTruthy()
      expect(character.nameKey, `${character.id} missing nameKey`).toBeTruthy()
      expect(character.show,    `${character.id} missing show`).toBeTruthy()
      expect(character.image,   `${character.id} missing image`).toMatch(/\.(png|gif|jpe?g)$/i)
    }
  })

  it('all ids are unique', () => {
    const ids = characters.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all nameKeys point at a real translation key prefix', () => {
    for (const character of characters) {
      expect(character.nameKey).toBe(`character.${character.id}.name`)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/games/character-match/__tests__/characters.test.js`
Expected: FAIL — cannot find module `../data/characters` (file doesn't exist yet).

- [ ] **Step 3: Write the data module**

Create `src/games/character-match/data/characters.js`:

```js
const characters = [
  { id: 'bluey',       nameKey: 'character.bluey.name',       show: 'Bluey',          image: 'bluey.png' },
  { id: 'bingo',       nameKey: 'character.bingo.name',       show: 'Bluey',          image: 'bingo.png' },
  { id: 'bandit',      nameKey: 'character.bandit.name',      show: 'Bluey',          image: 'bandit.png' },
  { id: 'chilli',      nameKey: 'character.chilli.name',      show: 'Bluey',          image: 'chilli.png' },
  { id: 'muffin',      nameKey: 'character.muffin.name',      show: 'Bluey',          image: 'muffin.png' },
  { id: 'socks',       nameKey: 'character.socks.name',       show: 'Bluey',          image: 'socks.png' },
  { id: 'pete',        nameKey: 'character.pete.name',        show: 'Pete the Cat',   image: 'pete.png' },
  { id: 'callie',      nameKey: 'character.callie.name',      show: 'Pete the Cat',   image: 'callie.png' },
  { id: 'grumpy-toad', nameKey: 'character.grumpy-toad.name', show: 'Pete the Cat',   image: 'grumpy-toad.png' },
  { id: 'marty',       nameKey: 'character.marty.name',       show: 'Pete the Cat',   image: 'marty.png' },
  { id: 'gus',         nameKey: 'character.gus.name',         show: 'Pete the Cat',   image: 'gus.png' },
  { id: 'molly',       nameKey: 'character.molly.name',       show: 'Bubble Guppies', image: 'molly.png' },
  { id: 'gil',         nameKey: 'character.gil.name',         show: 'Bubble Guppies', image: 'gil.png' },
  { id: 'deema',       nameKey: 'character.deema.name',       show: 'Bubble Guppies', image: 'deema.png' },
  { id: 'goby',        nameKey: 'character.goby.name',        show: 'Bubble Guppies', image: 'goby.png' },
  { id: 'oona',        nameKey: 'character.oona.name',        show: 'Bubble Guppies', image: 'oona.png' },
  { id: 'nonny',       nameKey: 'character.nonny.name',       show: 'Bubble Guppies', image: 'nonny.png' },
]

export default characters
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/games/character-match/__tests__/characters.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/games/character-match/data/characters.js src/games/character-match/__tests__/characters.test.js
git commit -m "feat: add Character Match roster data"
```

---

### Task 2: Placeholder image generator

**Files:**
- Create: `scripts/generate-character-match-placeholders.mjs`
- Create (generated, not hand-written): `src/games/character-match/images/*.png` (17 files, one per character), `public/games/character-match/icon.png`

**Interfaces:**
- Consumes: `characters` default export from `src/games/character-match/data/characters.js` (Task 1) — reads `.image` filenames to know exactly what to generate.
- Produces: on-disk PNG files at the paths Task 3 (`data/images.js`) and Task 4 (`manifest.json`) reference. No JS exports — this is a one-off dev script, not part of the app bundle.

- [ ] **Step 1: Write the placeholder generator**

Create `scripts/generate-character-match-placeholders.mjs`:

```js
// One-off generator for solid-color placeholder PNGs, standing in for real
// character artwork until it's provided. Each output file's path exactly
// matches the final filename characters.js/manifest.json expect, so real
// art can later overwrite these files in place with no code changes.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import characters from '../src/games/character-match/data/characters.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60)       { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ]
}

function solidColorPng(width, height, [r, g, b]) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 2  // color type: truecolor (RGB)
  ihdr[10] = 0 // compression method
  ihdr[11] = 0 // filter method
  ihdr[12] = 0 // interlace method

  const row = Buffer.alloc(1 + width * 3) // leading filter-type byte (0 = none)
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r
    row[1 + x * 3 + 1] = g
    row[1 + x * 3 + 2] = b
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  const idat = deflateSync(raw)

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const imagesDir = join(root, 'src/games/character-match/images')
const tileIconDir = join(root, 'public/games/character-match')
mkdirSync(imagesDir, { recursive: true })
mkdirSync(tileIconDir, { recursive: true })

characters.forEach((character, i) => {
  const hue = Math.round((360 / characters.length) * i)
  const png = solidColorPng(128, 128, hslToRgb(hue, 0.55, 0.6))
  writeFileSync(join(imagesDir, character.image), png)
  console.log(`wrote ${character.image}`)
})

const tileIcon = solidColorPng(128, 128, hslToRgb(30, 0.7, 0.55))
writeFileSync(join(tileIconDir, 'icon.png'), tileIcon)
console.log('wrote icon.png')
```

- [ ] **Step 2: Run the generator**

Run: `node scripts/generate-character-match-placeholders.mjs`
Expected: 18 `wrote ...` lines printed (17 character images + `icon.png`).

- [ ] **Step 3: Verify the files exist**

Run: `ls src/games/character-match/images` and `ls public/games/character-match`
Expected: the first lists 17 files matching every `image` value in `characters.js`; the second lists `icon.png`.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-character-match-placeholders.mjs src/games/character-match/images public/games/character-match
git commit -m "feat: generate Character Match placeholder images"
```

---

### Task 3: Image URL resolver

**Files:**
- Create: `src/games/character-match/data/images.js`

**Interfaces:**
- Consumes: the PNG files under `src/games/character-match/images/` (Task 2) via `import.meta.glob`.
- Produces: named export `getImageUrl(filename: string): string | null`. Task 7's `index.jsx` imports this as `import { getImageUrl } from './data/images'`.

- [ ] **Step 1: Write the resolver**

Create `src/games/character-match/data/images.js`, mirroring `src/games/animal-sounds/data/sounds.js`'s glob-based URL resolution:

```js
const images = import.meta.glob('../images/*', { eager: true, query: '?url', import: 'default' })

export function getImageUrl(filename) {
  const key = `../images/${filename}`
  return images[key] ?? null
}
```

No dedicated unit test for this file — `sounds.js` (its direct precedent) has none either, since `import.meta.glob` only works under Vite/Vitest, not plain Node. It's exercised indirectly by Task 7's component test, which asserts every rendered choice has an `<img>` with a real `src`.

- [ ] **Step 2: Commit**

```bash
git add src/games/character-match/data/images.js
git commit -m "feat: add Character Match image URL resolver"
```

---

### Task 4: Manifest, i18n strings, and dashboard tag icon

**Files:**
- Create: `src/games/character-match/manifest.json`
- Modify: `src/i18n/en.json:146` (insert after the `colorMatch` block, before `animal`)
- Modify: `src/i18n/en.json:173` (insert after the `color` block, before `badges`)
- Modify: `src/components/Dashboard.jsx:15-21` (`TAG_ICONS` map)

**Interfaces:**
- Produces: `manifest.json` with `icon: "/games/character-match/icon.png"` — consumed by Task 5's `ManifestIcon` (via `App.jsx`'s existing `import.meta.glob('./games/*/manifest.json', { eager: true })`, unchanged) and by Task 7's `index.jsx` (`import manifest from './manifest.json'`).
- Produces: `character.<id>.name` translation keys matching every `characters.js` (Task 1) `nameKey`, and `characterMatch.prompt`/`characterMatch.howToPlay` used by Task 7.

- [ ] **Step 1: Create the manifest**

Create `src/games/character-match/manifest.json`:

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

- [ ] **Step 2: Add i18n strings**

In `src/i18n/en.json`, insert this block immediately after the `"colorMatch"` object (after line 146, i.e. right before `"animal": {`):

```json
  "characterMatch": {
    "prompt": "Which one is {{name}}?",
    "howToPlay": "Hear the name, then tap the matching character!"
  },
```

Insert this block immediately after the `"color"` object (after line 173, i.e. right before `"badges": {`):

```json
  "character": {
    "bluey": { "name": "Bluey" },
    "bingo": { "name": "Bingo" },
    "bandit": { "name": "Bandit" },
    "chilli": { "name": "Chilli" },
    "muffin": { "name": "Muffin" },
    "socks": { "name": "Socks" },
    "pete": { "name": "Pete" },
    "callie": { "name": "Callie" },
    "grumpy-toad": { "name": "Grumpy Toad" },
    "marty": { "name": "Marty" },
    "gus": { "name": "Gus" },
    "molly": { "name": "Molly" },
    "gil": { "name": "Gil" },
    "deema": { "name": "Deema" },
    "goby": { "name": "Goby" },
    "oona": { "name": "Oona" },
    "nonny": { "name": "Nonny" }
  },
```

Re-validate the file is well-formed JSON after editing (e.g. `node -e "require('./src/i18n/en.json')"` or open it in an editor with JSON linting) — a missing/extra comma here breaks every game's translations, not just this one.

- [ ] **Step 3: Add the dashboard tag icon**

In `src/components/Dashboard.jsx`, the `TAG_ICONS` map currently reads:

```js
const TAG_ICONS = {
  sounds:  '🔊',
  visual:  '👁️',
  numbers: '🔢',
  animals: '🐾',
  colors:  '🎨',
}
```

Add one entry:

```js
const TAG_ICONS = {
  sounds:     '🔊',
  visual:     '👁️',
  numbers:    '🔢',
  animals:    '🐾',
  colors:     '🎨',
  characters: '🎭',
}
```

- [ ] **Step 4: Commit**

```bash
git add src/games/character-match/manifest.json src/i18n/en.json src/components/Dashboard.jsx
git commit -m "feat: add Character Match manifest, i18n strings, and tag icon"
```

---

### Task 5: Shared `ManifestIcon` component

**Files:**
- Create: `src/components/ManifestIcon.jsx`
- Test: `src/components/__tests__/ManifestIcon.test.jsx`
- Modify: `src/components/GameCard.jsx`, `src/components/GameCard.css`
- Modify: `src/components/FeaturedGameCard.jsx`, `src/components/FeaturedGameCard.css`
- Modify: `src/components/GameIntro.jsx`, `src/components/GameIntro.css`
- Modify: `src/kids/KidsProgressPage.jsx`, `src/kids/KidsProgressPage.css`

**Interfaces:**
- Produces: default export `ManifestIcon({ icon: string, as?: string, className?: string, ariaHidden?: boolean })` — renders `<img>` when `icon` looks like an image path (matches `/\.(png|gif|jpe?g)$/i`), otherwise renders `icon` as text inside the element named by `as` (default `'span'`).
- Consumes: nothing new — replaces the existing `{icon}` text render at each of the four call sites listed above, using the manifest's existing `icon` field.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/ManifestIcon.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ManifestIcon from '../ManifestIcon'

describe('ManifestIcon', () => {
  it('renders an emoji icon as text in a span by default', () => {
    render(<ManifestIcon icon="🐘" className="some-class" />)
    const el = screen.getByText('🐘')
    expect(el.tagName).toBe('SPAN')
    expect(el).toHaveClass('some-class')
  })

  it('renders the element named by "as" for non-image icons', () => {
    render(<ManifestIcon icon="🎨" as="div" className="some-class" />)
    expect(screen.getByText('🎨').tagName).toBe('DIV')
  })

  it('sets aria-hidden on the text element when ariaHidden is true', () => {
    render(<ManifestIcon icon="🐘" ariaHidden />)
    expect(screen.getByText('🐘')).toHaveAttribute('aria-hidden', 'true')
  })

  it('omits aria-hidden by default', () => {
    render(<ManifestIcon icon="🐘" />)
    expect(screen.getByText('🐘')).not.toHaveAttribute('aria-hidden')
  })

  it('renders a decorative image when icon looks like an image path', () => {
    const { container } = render(<ManifestIcon icon="/games/character-match/icon.png" className="tile-icon" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', '/games/character-match/icon.png')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveClass('tile-icon')
  })

  it('renders an image for .gif and .jpg paths too', () => {
    const { container: gifContainer } = render(<ManifestIcon icon="/a/b.gif" />)
    expect(gifContainer.querySelector('img')).not.toBeNull()
    const { container: jpgContainer } = render(<ManifestIcon icon="/a/b.jpg" />)
    expect(jpgContainer.querySelector('img')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/ManifestIcon.test.jsx`
Expected: FAIL — cannot find module `../ManifestIcon`.

- [ ] **Step 3: Write the component**

Create `src/components/ManifestIcon.jsx`:

```jsx
const IMAGE_ICON_RE = /\.(png|gif|jpe?g)$/i

export default function ManifestIcon({ icon, as: Tag = 'span', className, ariaHidden = false }) {
  if (IMAGE_ICON_RE.test(icon)) {
    return <img src={icon} alt="" className={className} />
  }
  return <Tag className={className} aria-hidden={ariaHidden || undefined}>{icon}</Tag>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/ManifestIcon.test.jsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire into GameCard**

In `src/components/GameCard.jsx`, add the import:

```js
import ManifestIcon from './ManifestIcon'
```

Replace:

```jsx
      <span className="game-card__icon">{icon}</span>
```

with:

```jsx
      <ManifestIcon icon={icon} className="game-card__icon" />
```

In `src/components/GameCard.css`, immediately after `.game-card__icon  { font-size: 52px; line-height: 1; }` add:

```css
img.game-card__icon { width: 52px; height: 52px; object-fit: contain; }
```

- [ ] **Step 6: Wire into FeaturedGameCard**

In `src/components/FeaturedGameCard.jsx`, add the import:

```js
import ManifestIcon from './ManifestIcon'
```

Replace:

```jsx
      <span className="featured-card__icon">{icon}</span>
```

with:

```jsx
      <ManifestIcon icon={icon} className="featured-card__icon" />
```

In `src/components/FeaturedGameCard.css`, immediately after `.featured-card__icon { font-size: 72px; line-height: 1; }` add:

```css
img.featured-card__icon { width: 72px; height: 72px; object-fit: contain; }
```

- [ ] **Step 7: Wire into GameIntro**

In `src/components/GameIntro.jsx`, add the import:

```js
import ManifestIcon from './ManifestIcon'
```

Replace:

```jsx
      <div className="game-intro__icon" aria-hidden="true">{icon}</div>
```

with:

```jsx
      <ManifestIcon icon={icon} as="div" className="game-intro__icon" ariaHidden />
```

In `src/components/GameIntro.css`, immediately after `.game-intro__icon { font-size: 96px; }` add:

```css
img.game-intro__icon { width: 96px; height: 96px; object-fit: contain; }
```

- [ ] **Step 8: Wire into KidsProgressPage**

In `src/kids/KidsProgressPage.jsx`, add the import:

```js
import ManifestIcon from '../components/ManifestIcon'
```

Replace:

```jsx
        <span aria-hidden="true">{manifest.icon}</span> {manifest.name}
```

with:

```jsx
        <ManifestIcon icon={manifest.icon} className="kid-progress__game-icon" ariaHidden /> {manifest.name}
```

In `src/kids/KidsProgressPage.css`, immediately after `.kid-progress__game-name { font-size: 22px; font-weight: 800; margin-bottom: 16px; }` add:

```css
img.kid-progress__game-icon { width: 22px; height: 22px; object-fit: contain; vertical-align: middle; }
```

- [ ] **Step 9: Run the full existing test suite for all four touched components to confirm no regressions**

Run:
```bash
npx vitest run src/components/__tests__/GameCard.test.jsx src/components/__tests__/FeaturedGameCard.test.jsx src/components/__tests__/GameIntro.test.jsx src/kids/__tests__/KidsProgressPage.test.jsx src/components/__tests__/Dashboard.test.jsx
```
Expected: PASS, unchanged — these tests use `screen.getByText('🐘')`/`screen.getByText('🎨')` style assertions, which still match since `ManifestIcon` renders emoji icons as identical text content.

- [ ] **Step 10: Commit**

```bash
git add src/components/ManifestIcon.jsx src/components/__tests__/ManifestIcon.test.jsx \
        src/components/GameCard.jsx src/components/GameCard.css \
        src/components/FeaturedGameCard.jsx src/components/FeaturedGameCard.css \
        src/components/GameIntro.jsx src/components/GameIntro.css \
        src/kids/KidsProgressPage.jsx src/kids/KidsProgressPage.css
git commit -m "feat: add ManifestIcon to support image-based game tile icons"
```

---

### Task 6: Game stylesheet

**Files:**
- Create: `src/games/character-match/CharacterMatchGame.css`

**Interfaces:**
- Produces: CSS classes `.game`, `.game__header`, `.game__name`, `.game__version`, `.game__question`, `.game__prompt`, `.game__progress`, `.game__choices`, `.game__choice`, `.game__choice-image`, `.game__choice-name`, `.game__next`, `.results*`, `.game__timeout` — consumed by Task 7's `index.jsx`.

- [ ] **Step 1: Create the stylesheet**

Create `src/games/character-match/CharacterMatchGame.css`, adapted from `ColorMatchGame.css` — dropping the swatch and near-white-color border rules (not needed: no swatch, and images carry their own visual identity so there's no near-background-color collision to guard against), and sizing the new choice image:

```css
.game { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 24px 16px; gap: 24px; }

.game__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: 480px;
}

.game__name    { font-size: 15px; font-weight: 700; color: var(--color-text-muted); }
.game__version { font-size: 12px; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }

.game__question {
  width: 100%;
  max-width: 480px;
  background: linear-gradient(135deg, var(--color-aqua), var(--color-lavender));
  border-radius: var(--radius-card);
  padding: 28px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
}

.game__prompt { color: white; font-size: 20px; font-weight: 700; text-align: center; }

.game__progress { font-size: 15px; color: rgba(255,255,255,0.85); font-weight: 600; }

.game__choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  width: 100%;
  max-width: 480px;
}

.game__choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px 12px;
  border-radius: var(--radius-card);
  border: none;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  background: var(--color-surface);
  cursor: pointer;
  min-height: 120px;
  transition: transform 0.1s ease;
}

.game__choice:hover:not(:disabled) { transform: scale(1.04); }
.game__choice:disabled { cursor: default; }

.game__choice-image { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; }
.game__choice-name  { font-size: 18px; font-weight: 700; color: var(--color-text); }

.game__next {
  padding: 16px 48px;
  background: var(--color-teal);
  color: white;
  font-size: 20px;
  font-weight: 700;
  border-radius: var(--radius-button);
  border: none;
  min-height: 64px;
}

.results { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; padding: 24px; text-align: center; }
.results__emoji  { font-size: 96px; }
.results__score  { font-size: 36px; font-weight: 800; color: var(--color-lavender); }
.results__label  { font-size: 20px; opacity: 0.7; }
.results__actions { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
.results__btn { padding: 16px 36px; font-size: 20px; font-weight: 700; border-radius: var(--radius-button); min-height: 64px; }
.results__btn--play  { background: var(--color-lavender); color: white; border: none; }
.results__btn--home  { background: transparent; border: 2px solid var(--color-aqua); color: var(--color-text); }

.game__timeout { text-align: center; font-size: 18px; font-weight: 700; color: var(--color-error); margin-top: 8px; }
```

- [ ] **Step 2: Commit**

```bash
git add src/games/character-match/CharacterMatchGame.css
git commit -m "feat: add Character Match stylesheet"
```

---

### Task 7: Game component and full test suite

**Files:**
- Create: `src/games/character-match/index.jsx`
- Test: `src/games/character-match/__tests__/CharacterMatchGame.test.jsx`

**Interfaces:**
- Consumes: `characters` (Task 1, `./data/characters`), `getImageUrl` (Task 3, `./data/images`), `manifest` (Task 4, `./manifest.json`), `CharacterMatchGame.css` (Task 6). Consumes `useGameSession({ gameId, items })` from `../../hooks/useGameSession`, returning the same shape `ColorMatchGame` destructures (`current, index, total, locked, disabledChoiceIds, hintActive, selected, score, streak, missed, done, feedbackMode, handleChoice, advance, restart, currentElapsedMs, timerMode, timeLimitMs, timedOut, offerDifficultyBump, numChoices, personalBestResult, newBadges, acceptDifficultyBump, dismissDifficultyBump, showIntro, introResolved, settingsLoaded, dontShowAgain, setDontShowAgain, dismissIntro`).
- Produces: default export `CharacterMatchGame({ onGameEnd })` — a React component. `App.jsx`'s auto-discovery glob (`./games/*/index.jsx`) picks this up automatically once the file exists; no registry edit needed.

- [ ] **Step 1: Write the failing component test**

Create `src/games/character-match/__tests__/CharacterMatchGame.test.jsx`:

```jsx
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import CharacterMatchGame from '../index'

vi.mock('../../../lib/confetti', () => ({ fireConfetti: vi.fn() }))

let mockSettings = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerMode: 'countUp',
  introDismissed: { 'character-match': true },
}
const mockUpdateSetting = vi.fn()

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings, loaded: true, updateSetting: mockUpdateSetting }),
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
  mockSettings = {
    numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, timerMode: 'countUp',
    introDismissed: { 'character-match': true },
  }
})

describe('CharacterMatchGame', () => {
  it('renders a question with a prompt and answer buttons', async () => {
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByText(/which one is/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(2)
  })

  it('renders a decorative image for each answer choice', async () => {
    let container
    await act(async () => { container = render(<CharacterMatchGame onGameEnd={onGameEnd} />).container })
    const buttons = screen.getAllByRole('button').filter(b => b.dataset.characterId)
    const images = container.querySelectorAll('.game__choice-image')
    expect(images.length).toBe(buttons.length)
    images.forEach(img => expect(img).toHaveAttribute('alt', ''))
  })

  it('clicking correct answer adds correct class', async () => {
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })
    const buttons = screen.getAllByRole('button').filter(b => b.dataset.characterId)
    const correctId = screen.getByTestId('correct-character-id').textContent
    const correctBtn = buttons.find(b => b.dataset.characterId === correctId)
    await act(async () => { await userEvent.click(correctBtn) })
    expect(correctBtn.classList.contains('correct')).toBe(true)
  })

  it('clicking wrong answer highlights the correct one', async () => {
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })
    const buttons = screen.getAllByRole('button').filter(b => b.dataset.characterId)
    const correctId = screen.getByTestId('correct-character-id').textContent
    const wrongBtn = buttons.find(b => b.dataset.characterId !== correctId)
    const correctBtn = buttons.find(b => b.dataset.characterId === correctId)
    await act(async () => { await userEvent.click(wrongBtn) })
    expect(wrongBtn.classList.contains('wrong')).toBe(true)
    expect(correctBtn.classList.contains('highlight-correct')).toBe(true)
  })

  it('shows results screen after all questions in immediate mode', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.characterId)
      const correctId = screen.getByTestId('correct-character-id').textContent
      const correctBtn = buttons.find(b => b.dataset.characterId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
  })

  it('Home button calls onGameEnd', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.characterId)
      const correctId = screen.getByTestId('correct-character-id').textContent
      const correctBtn = buttons.find(b => b.dataset.characterId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    await act(async () => { await userEvent.click(screen.getByRole('button', { name: /home/i })) })
    expect(onGameEnd).toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    let container
    await act(async () => { container = render(<CharacterMatchGame onGameEnd={onGameEnd} />).container })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows the streak badge after 2 correct answers in a row', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 2; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.characterId)
      const correctId = screen.getByTestId('correct-character-id').textContent
      const correctBtn = buttons.find(b => b.dataset.characterId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(screen.getByText(/2 in a row/i)).toBeInTheDocument()
  })

  it('shows missed characters in the results screen when an answer is wrong', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })

    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button').filter(b => b.dataset.characterId)
      const correctId = screen.getByTestId('correct-character-id').textContent
      const wrongBtn = buttons.find(b => b.dataset.characterId !== correctId)
      act(() => { fireEvent.click(wrongBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }

    vi.useRealTimers()
    expect(screen.getByText(/let's practice/i)).toBeInTheDocument()
  })

  it('shows the timer when timerMode is not "off"', async () => {
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByLabelText(/elapsed time/i)).toBeInTheDocument()
  })

  it('hides the timer when timerMode is "off"', async () => {
    mockSettings = { ...mockSettings, timerMode: 'off' }
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByLabelText(/elapsed time/i)).not.toBeInTheDocument()
  })

  it('allows a retry when maxTries permits it, without locking the question', async () => {
    mockSettings = { ...mockSettings, feedbackMode: 'parent-tap', maxTries: 2, numChoices: 3 }
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })

    const buttons = screen.getAllByRole('button').filter(b => b.dataset.characterId)
    const correctId = screen.getByTestId('correct-character-id').textContent
    const wrongBtn = buttons.find(b => b.dataset.characterId !== correctId)
    await act(async () => { await userEvent.click(wrongBtn) })

    expect(wrongBtn).toBeDisabled()
    const correctBtn = buttons.find(b => b.dataset.characterId === correctId)
    expect(correctBtn).not.toBeDisabled()
  })

  it('does not render a Next button while the countdown timeout message is showing in parent-tap mode (regression guard against double-advance)', async () => {
    vi.useFakeTimers()
    mockSettings = { ...mockSettings, feedbackMode: 'parent-tap', timerMode: 'countdown', timeLimitSeconds: 5 }
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })

    act(() => { vi.advanceTimersByTime(5001) })

    expect(screen.getByText(/time's up/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()

    vi.useRealTimers()
  })

  it('shows the difficulty-offer banner after a perfect session when enabled', async () => {
    mockSettings = { ...mockSettings, feedbackMode: 'parent-tap', difficultyAutoProgressionEnabled: true, questionsPerSession: 3, numChoices: 2 }
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })

    vi.useFakeTimers()
    try {
      for (let i = 0; i < 3; i++) {
        const buttons = screen.getAllByRole('button').filter(b => b.dataset.characterId)
        const correctId = screen.getByTestId('correct-character-id').textContent
        const correctBtn = buttons.find(b => b.dataset.characterId === correctId)
        act(() => { fireEvent.click(correctBtn) })
        act(() => { fireEvent.click(screen.getByRole('button', { name: /next/i })) })
        await act(async () => {})
      }

      // Flush remaining microtasks from finishGame()'s async chain
      await act(async () => {})
    } finally {
      vi.useRealTimers()
    }

    expect(screen.getByText(/perfect session/i)).toBeInTheDocument()
  })
})

describe('CharacterMatchGame — how-to-play intro', () => {
  it('shows the intro screen before the first question when not dismissed', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByTestId('game-intro-start')).toBeInTheDocument()
    expect(screen.queryByText(/which one is/i)).not.toBeInTheDocument()
  })

  it('starts the session after "Let\'s Play!" is clicked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(screen.getByText(/which one is/i)).toBeInTheDocument()
  })

  it('persists introDismissed for this game when "don\'t show again" is checked before starting', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-dont-show-again')) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(mockUpdateSetting).toHaveBeenCalledWith('introDismissed', { 'character-match': true })
  })

  it('does not persist a setting when "don\'t show again" is left unchecked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(mockUpdateSetting).not.toHaveBeenCalled()
  })

  it('does not show the intro when already dismissed for this game', async () => {
    await act(async () => { render(<CharacterMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByTestId('game-intro-start')).not.toBeInTheDocument()
    expect(screen.getByText(/which one is/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/games/character-match/__tests__/CharacterMatchGame.test.jsx`
Expected: FAIL — cannot find module `../index`.

- [ ] **Step 3: Write the game component**

Create `src/games/character-match/index.jsx`:

```jsx
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import StreakBadge from '../../components/StreakBadge'
import GameResults from '../../components/GameResults'
import GameChoiceGrid from '../../components/GameChoiceGrid'
import Timer from '../../components/Timer'
import GameIntro from '../../components/GameIntro'
import characters from './data/characters'
import { getImageUrl } from './data/images'
import manifest from './manifest.json'
import './CharacterMatchGame.css'

export default function CharacterMatchGame({ onGameEnd }) {
  const { t } = useTranslation()
  const {
    current, index, total, locked, disabledChoiceIds, hintActive, selected,
    score, streak, missed, done, feedbackMode, handleChoice, advance, restart,
    currentElapsedMs, timerMode, timeLimitMs, timedOut, offerDifficultyBump, numChoices,
    personalBestResult, newBadges,
    acceptDifficultyBump, dismissDifficultyBump,
    showIntro, introResolved, settingsLoaded, dontShowAgain, setDontShowAgain, dismissIntro,
  } = useGameSession({ gameId: 'character-match', items: characters })

  if (!settingsLoaded || !introResolved) return null

  if (showIntro) {
    return (
      <GameIntro
        icon={manifest.icon}
        name={manifest.name}
        instructions={t('characterMatch.howToPlay')}
        dontShowAgain={dontShowAgain}
        onDontShowAgainChange={setDontShowAgain}
        onStart={() => dismissIntro(dontShowAgain)}
      />
    )
  }

  if (done) {
    return (
      <GameResults
        score={score}
        total={total}
        missed={missed}
        onPlayAgain={restart}
        onHome={() => onGameEnd(score, total)}
        renderMissedItem={character => (
          <>
            <img
              src={getImageUrl(character.image)}
              alt=""
              style={{ display: 'inline-block', width: 20, height: 20, objectFit: 'contain', verticalAlign: 'middle' }}
            />{' '}
            {t(character.nameKey)}
          </>
        )}
        offerDifficultyBump={offerDifficultyBump}
        numChoices={numChoices}
        onAcceptDifficultyBump={acceptDifficultyBump}
        onDismissDifficultyBump={dismissDifficultyBump}
        personalBestResult={personalBestResult}
        newBadges={newBadges}
      />
    )
  }

  if (!current) return null

  return (
    <main className="game">
      {/* Hidden testid so tests can find the correct answer id */}
      <span data-testid="correct-character-id" style={{ display: 'none' }}>{current.correct.id}</span>

      <div className="game__header">
        <h1 className="game__name">{manifest.name}</h1>
        <StreakBadge streak={streak} />
        <span className="game__version">v{manifest.version}</span>
      </div>

      <div className="game__question">
        <div className="game__progress">{t('common.progress', { current: index + 1, total })}</div>
        <div className="game__prompt">{t('characterMatch.prompt', { name: t(current.correct.nameKey) })}</div>
        {timerMode !== 'off' && (
          <Timer elapsedMs={currentElapsedMs} mode={timerMode === 'countdown' ? 'countdown' : 'countUp'} limitMs={timeLimitMs} />
        )}
      </div>

      <GameChoiceGrid
        choices={current.choices}
        correctId={current.correct.id}
        selected={selected}
        locked={locked}
        disabledChoiceIds={disabledChoiceIds}
        hintActive={hintActive}
        onChoose={handleChoice}
        getChoiceProps={character => ({
          'data-character-id': character.id,
        })}
        renderChoiceContent={character => (
          <>
            <img src={getImageUrl(character.image)} alt="" className="game__choice-image" />
            <span className="game__choice-name">{t(character.nameKey)}</span>
          </>
        )}
      />

      {timedOut && <div className="game__timeout" role="status">{t('common.timeUp')}</div>}

      {locked && feedbackMode === 'parent-tap' && !timedOut && (
        <button className="game__next" onClick={advance}>{t('common.next')}</button>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/games/character-match/__tests__/CharacterMatchGame.test.jsx src/games/character-match/__tests__/characters.test.js`
Expected: PASS (19 + 4 = 23 tests total across both files).

- [ ] **Step 5: Commit**

```bash
git add src/games/character-match/index.jsx src/games/character-match/__tests__/CharacterMatchGame.test.jsx
git commit -m "feat: add Character Match game component"
```

---

### Task 8: Storybook story

**Files:**
- Create: `src/games/character-match/CharacterMatchGame.stories.jsx`

**Interfaces:**
- Consumes: `CharacterMatchGame` default export (Task 7).
- Produces: Storybook story `Games/CharacterMatchGame` → `Default`, referenced by Task 9's visual-regression list as `games-charactermatchgame--default`.

- [ ] **Step 1: Create the story**

Create `src/games/character-match/CharacterMatchGame.stories.jsx`, mirroring `ColorMatchGame.stories.jsx`:

```jsx
import { useEffect, useRef } from 'react'
import CharacterMatchGame from './index'

// The game's shuffle runs inside a useEffect gated on settings loaded from
// useSettings(), so it fires during React's commit phase — after a plain
// decorator function would already have returned. Override Math.random
// during this wrapper's render (renders run parent-before-child, so the
// override is active before the story's own render/effects) and restore it
// on unmount, so the pin covers the story for as long as it's displayed
// without leaking into whatever story is viewed next.
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
// wrapper's render (parent-before-child) so useGameSession() sees the intro
// as already dismissed on its very first settings read and renders gameplay,
// not the GameIntro screen. Merge with whatever's already in localStorage
// (e.g. from other stories sharing the same browser context) instead of
// clobbering it.
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
        introDismissed: { ...existing.introDismissed, 'character-match': true },
      }))
    }
    return Story()
  }
  return <SeededIntroDismissed />
}

export default {
  title: 'Games/CharacterMatchGame',
  component: CharacterMatchGame,
  decorators: [pinRandom, seedIntroDismissed],
}

export const Default = { args: { onGameEnd: () => {} } }
```

- [ ] **Step 2: Verify the story renders**

Run: `npm run storybook` (leave it running), then visit `http://localhost:6006/?path=/story/games-charactermatchgame--default`.
Expected: the game renders with 2 answer choices, each showing a solid-color placeholder square and a character name. Stop the storybook process afterward.

- [ ] **Step 3: Commit**

```bash
git add src/games/character-match/CharacterMatchGame.stories.jsx
git commit -m "feat: add Character Match Storybook story"
```

---

### Task 9: E2E spec and visual regression registration

**Files:**
- Create: `e2e/character-match.spec.js`
- Modify: `e2e/visual.spec.js:29-30` (`stories` array)

**Interfaces:**
- Consumes: the running app's `/game/character-match` route (Task 7, auto-routed) and `data-character-id`/`correct-character-id` attributes it renders.
- Produces: nothing consumed by later tasks — this is the final functional-coverage task before docs/verification.

- [ ] **Step 1: Create the E2E spec**

Create `e2e/character-match.spec.js`, mirroring `e2e/color-match.spec.js`:

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('character match: how-to-play intro shows on first visit and starts the session', async ({ page }) => {
  await page.goto('/game/character-match')

  await expect(page.getByTestId('game-intro-start')).toBeVisible()
  expect(await page.locator('[data-character-id]').count()).toBe(0)

  await page.getByTestId('game-intro-start').click()

  await expect(page.locator('[data-character-id]').first()).toBeVisible()
})

test('character match: "don\'t show again" suppresses the intro on the next visit', async ({ page }) => {
  await page.goto('/game/character-match')
  await page.getByTestId('game-intro-dont-show-again').click()
  await page.getByTestId('game-intro-start').click()

  await page.goto('/game/character-match')
  await expect(page.getByTestId('game-intro-start')).not.toBeVisible()
  await expect(page.locator('[data-character-id]').first()).toBeVisible()
})

test('character match: intro does not reappear after Play Again in the same visit', async ({ page }) => {
  await page.goto('/game/character-match')
  await page.getByTestId('game-intro-start').click()

  for (let i = 0; i < 10; i++) {
    if (await page.getByText(/you scored/i).isVisible()) break
    await page.locator('[data-character-id]').first().click()
    await page.waitForTimeout(1600)
  }
  await expect(page.getByText(/you scored/i)).toBeVisible()

  await page.getByRole('button', { name: 'Play Again' }).click()
  await expect(page.getByTestId('game-intro-start')).not.toBeVisible()
  await expect(page.locator('[data-character-id]').first()).toBeVisible()
})

test('character match: full play-through reaches results and returns home', async ({ page }) => {
  await page.goto('/game/character-match')
  await page.getByTestId('game-intro-start').click()

  for (let i = 0; i < 10; i++) {
    if (await page.getByText(/you scored/i).isVisible()) break
    await page.locator('[data-character-id]').first().click()
    await page.waitForTimeout(1600)
  }

  await expect(page.getByText(/you scored/i)).toBeVisible()

  await page.getByRole('button', { name: 'Home' }).click()
  await expect(page).toHaveURL('/')
})

test('character match game screen has no accessibility violations', async ({ page }) => {
  await page.goto('/game/character-match')
  await page.getByTestId('game-intro-start').click()
  await page.locator('[data-character-id]').first().waitFor()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('character match: how-to-play intro screen has no accessibility violations', async ({ page }) => {
  await page.goto('/game/character-match')
  await page.getByTestId('game-intro-start').waitFor()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('character match: a wrong tap with retries enabled does not lock the question', async ({ page }) => {
  await page.goto('/admin')

  // "3" is ambiguous unscoped — both "Answer Choices" and "Retry Attempts" have a "3" radio.
  await page.getByRole('heading', { name: 'Answer Choices' })
    .locator('xpath=..')
    .getByRole('radio', { name: '3', exact: true })
    .check() // numChoices=3, ensures 2 wrong options exist

  // "2" is likewise ambiguous unscoped.
  await page.getByRole('heading', { name: 'Retry Attempts' })
    .locator('xpath=..')
    .getByRole('radio', { name: '2', exact: true })
    .check() // maxTries=2

  await page.goto('/game/character-match')
  await page.getByTestId('game-intro-start').click()

  const choices = page.locator('[data-character-id]')
  const correctId = await page.getByTestId('correct-character-id').textContent()
  const wrongChoice = choices.filter({ hasNot: page.locator(`[data-character-id="${correctId}"]`) }).first()
  await wrongChoice.click()

  await expect(wrongChoice).toBeDisabled()
  const correctChoice = page.locator(`[data-character-id="${correctId}"]`)
  await expect(correctChoice).toBeEnabled()
})
```

- [ ] **Step 2: Register the new story for visual regression**

In `e2e/visual.spec.js`, the `stories` array currently has:

```js
  'games-animalsoundsgame--default',
  'games-colormatchgame--default',
```

Change to:

```js
  'games-animalsoundsgame--default',
  'games-charactermatchgame--default',
  'games-colormatchgame--default',
```

- [ ] **Step 3: Run the new E2E spec**

Run: `npx playwright test character-match.spec.js`
Expected: PASS (7 tests). Playwright auto-starts the dev server per `playwright.config.js`.

- [ ] **Step 4: Generate the new visual-regression baseline**

Run: `npx playwright test visual.spec.js --update-snapshots`
Expected: PASS for all stories, including a newly-created baseline PNG for `games-charactermatchgame--default` under `e2e/visual.spec.js-snapshots/`. Review the new PNG — it should show 2 solid-color placeholder squares with character names, matching the Storybook preview from Task 8, Step 2.

- [ ] **Step 5: Commit**

```bash
git add e2e/character-match.spec.js e2e/visual.spec.js e2e/visual.spec.js-snapshots
git commit -m "test: add Character Match E2E coverage and visual regression baseline"
```

---

### Task 10: Docs, changelog, and full verification

**Files:**
- Modify: `README.md:10` (Features list)
- Modify: `CHANGELOG.md` (new entry)
- Modify: `package.json:4` (version bump)

**Interfaces:**
- None — this task only touches docs/version metadata and runs full-suite verification; no new code interfaces.

- [ ] **Step 1: Add Character Match to the README feature list**

In `README.md`, directly after the `Color Match` bullet (line 10):

```markdown
- **Character Match** — a character's name is shown; the child picks the matching character from picture buttons
```

- [ ] **Step 2: Bump the app version and add a changelog entry**

In `package.json`, change:

```json
  "version": "0.9.0",
```

to:

```json
  "version": "0.10.0",
```

In `CHANGELOG.md`, insert a new entry directly after the `# Changelog` header/format line and before the existing `## [0.9.0]` entry:

```markdown
## [0.10.0] - 2026-07-04

### Added
- **Character Match** — a new game where a character's name is shown and the child picks the matching character from picture buttons; uses real images (PNG/GIF/JPEG) instead of emoji for each choice.
- `ManifestIcon` shared component — lets a game's dashboard tile/intro icon be an image instead of an emoji, without changing rendering for existing emoji-icon games.
```

- [ ] **Step 3: Run the full unit/component test suite**

Run: `npm test -- run`
Expected: all tests pass, including every existing test file plus the new `characters.test.js`, `CharacterMatchGame.test.jsx`, and `ManifestIcon.test.jsx`.

- [ ] **Step 4: Run lint and production build**

Run: `npm run lint && npm run build`
Expected: both succeed with no errors (catches unused imports, JSX issues, or `import.meta.glob` path problems).

- [ ] **Step 5: Run the full E2E suite**

Run: `npm run e2e`
Expected: all E2E specs pass, including `character-match.spec.js` (Task 9) and the full `visual.spec.js` list (baseline already generated in Task 9, Step 4).

- [ ] **Step 6: Commit**

```bash
git add README.md CHANGELOG.md package.json
git commit -m "docs: document Character Match game and bump version to 0.10.0"
```

## Follow-up (outside this plan, once real art is available)

Overwrite each file under `src/games/character-match/images/` and `public/games/character-match/icon.png` in place with real artwork (same filenames, any of PNG/GIF/JPEG), then run:

```bash
npx playwright test visual.spec.js --update-snapshots
```

and commit the updated baseline PNG alongside the new art.
