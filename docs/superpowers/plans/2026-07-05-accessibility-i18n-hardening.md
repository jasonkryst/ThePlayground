# Accessibility & i18n Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `docs/superpowers/specs/2026-07-05-accessibility-i18n-hardening-design.md` — restructure i18n so each game owns its own locale file (auto-merged, mirroring the existing manifest/component auto-discovery pattern), add the scaffolding needed to add a language later, and fix the concrete WCAG 2.2 AA gaps found in a full manual read-through of the app (missing focus-visible styles, no focus management on view transitions, no reduced-motion guard, a contrast-risking disabled state, and inaccessible charts).

**Architecture:** `src/i18n/index.js` gains a pure, unit-tested `mergeLocaleResources()` function that combines the core `src/i18n/en.json` with every `src/games/*/i18n/en.json` found via `import.meta.glob`, throwing on key collisions. Each game's namespace (prompt/how-to-play/item-name catalog) moves into its own file; `ParentDashboard` needs no changes to *how* it resolves item names since merging happens before `i18next.init()`. A new `LocaleSelector` component and `settings.locale` wire up language switching end-to-end but stay invisible until a second locale exists. The a11y fixes extend patterns the codebase already has (the `:focus-visible` treatment already used on nav/cards/tabs) rather than inventing new ones, and replace the need for `aria-live` almost everywhere by moving focus to each view's heading on mount instead.

**Tech Stack:** React 18, Vitest + React Testing Library + jest-axe, Playwright (E2E + visual regression + `@axe-core/playwright`), react-i18next + i18next, Vite `import.meta.glob`.

## Global Constraints

- Every user-facing string goes through `t()` and `src/i18n/en.json` (or, after this plan, a per-game `i18n/en.json`) — never hardcode English in JSX.
- Every component/game test file asserts `expect(await axe(container)).toHaveNoViolations()`.
- Tests covering timed feedback use `vi.useFakeTimers()` with `fireEvent`, never `userEvent`.
- Hook/component tests that touch storage mock `src/storage/index.js` via `vi.mock()` + `vi.hoisted()`.
- Follow the existing `:focus { outline: none }` / `:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px }` pattern for any new focus styling — don't invent a different treatment.
- The three game CSS files (`CharacterMatchGame.css`, `AnimalSoundsGame.css`, `ColorMatchGame.css`) intentionally duplicate shared class rules (`.game`, `.game__choice`, `.game__next`, `.results`, `.results__btn`, etc.) rather than importing a shared stylesheet — this is the existing per-game-portability convention. Any shared-class CSS fix in this plan must be applied identically to all three files, not centralized.
- Bump `package.json` and all three game `manifest.json` versions, and add a `CHANGELOG.md` entry, as the final task.

---

## Task 1: i18n merge mechanism + migrate Character Match's namespace

**Files:**
- Create: `src/games/character-match/i18n/en.json`
- Modify: `src/i18n/index.js`
- Modify: `src/i18n/en.json` (remove `characterMatch` and `character` keys)
- Test: `src/i18n/__tests__/i18n.test.js`

**Interfaces:**
- Produces: `mergeLocaleResources(core, gameLocaleModules)` — pure function, exported from `src/i18n/index.js`. `core` is a plain object (parsed `en.json`); `gameLocaleModules` is the object returned by `import.meta.glob(..., { eager: true })` (keys are file paths, values are modules with a `.default` or are the parsed JSON directly). Returns the merged resource object. Throws `Error` on any top-level key collision.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing test for `mergeLocaleResources`**

```js
// src/i18n/__tests__/i18n.test.js
import { describe, it, expect } from 'vitest'
import i18n, { mergeLocaleResources } from '../index'

describe('i18n', () => {
  it('initializes synchronously with English resources', () => {
    expect(i18n.isInitialized).toBe(true)
    expect(i18n.t('common.home')).toBe('Home')
  })

  it('falls back to the key when a translation is missing', () => {
    expect(i18n.t('does.not.exist')).toBe('does.not.exist')
  })
})

describe('mergeLocaleResources', () => {
  it('merges core resources with every game locale file', () => {
    const core = { common: { home: 'Home' } }
    const gameModules = {
      '../games/foo/i18n/en.json': { default: { foo: { prompt: 'Pick foo' } } },
      '../games/bar/i18n/en.json': { bar: { prompt: 'Pick bar' } }, // no .default — plain object shape
    }
    const merged = mergeLocaleResources(core, gameModules)
    expect(merged).toEqual({
      common: { home: 'Home' },
      foo: { prompt: 'Pick foo' },
      bar: { prompt: 'Pick bar' },
    })
  })

  it('throws when a game namespace collides with a core key', () => {
    const core = { common: { home: 'Home' } }
    const gameModules = { '../games/foo/i18n/en.json': { default: { common: { home: 'Oops' } } } }
    expect(() => mergeLocaleResources(core, gameModules)).toThrow(/collision/i)
  })

  it('throws when two game namespaces collide with each other', () => {
    const core = {}
    const gameModules = {
      '../games/foo/i18n/en.json': { default: { shared: {} } },
      '../games/bar/i18n/en.json': { default: { shared: {} } },
    }
    expect(() => mergeLocaleResources(core, gameModules)).toThrow(/collision/i)
  })

  it('does not mutate the core object it was given', () => {
    const core = { common: { home: 'Home' } }
    mergeLocaleResources(core, { '../games/foo/i18n/en.json': { default: { foo: {} } } })
    expect(core).toEqual({ common: { home: 'Home' } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/i18n/__tests__/i18n.test.js`
Expected: FAIL — `mergeLocaleResources` is not exported from `../index`.

- [ ] **Step 3: Implement `mergeLocaleResources` and glob wiring in `src/i18n/index.js`**

Replace the whole file's content with:

```js
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'

export function mergeLocaleResources(core, gameLocaleModules) {
  const merged = { ...core }
  const owner = new Map(Object.keys(core).map(key => ['src/i18n/en.json', key]).map(([o, k]) => [k, o]))

  for (const [path, mod] of Object.entries(gameLocaleModules)) {
    const locale = mod.default ?? mod
    for (const key of Object.keys(locale)) {
      if (owner.has(key)) {
        throw new Error(`i18n namespace collision: "${key}" is defined in both ${owner.get(key)} and ${path}`)
      }
      owner.set(key, path)
      merged[key] = locale[key]
    }
  }

  return merged
}

const gameLocaleModules = import.meta.glob('../games/*/i18n/en.json', { eager: true })
const resources = mergeLocaleResources(en, gameLocaleModules)

i18next.use(initReactI18next).init({
  resources: { en: { translation: resources } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export const SUPPORTED_LOCALES = ['en']

export default i18next
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/i18n/__tests__/i18n.test.js`
Expected: PASS (4 new tests + 2 existing).

- [ ] **Step 5: Create `src/games/character-match/i18n/en.json`**

```json
{
  "characterMatch": {
    "prompt": "Which one is {{name}}?",
    "howToPlay": "See the name, then tap the matching character!"
  },
  "character": {
    "bluey": { "name": "Bluey" },
    "bingo": { "name": "Bingo" },
    "bandit": { "name": "Bandit" },
    "chilli": { "name": "Chilli" },
    "muffin": { "name": "Muffin" },
    "socks": { "name": "Socks" },
    "mackenzie": { "name": "Mackenzie" },
    "pete": { "name": "Pete" },
    "callie": { "name": "Callie" },
    "grumpy-toad": { "name": "Grumpy Toad" },
    "marty": { "name": "Marty" },
    "gus": { "name": "Gus" },
    "neville": { "name": "Neville" },
    "sally": { "name": "Sally" },
    "molly": { "name": "Molly" },
    "gil": { "name": "Gil" },
    "deema": { "name": "Deema" },
    "goby": { "name": "Goby" },
    "oona": { "name": "Oona" },
    "nonny": { "name": "Nonny" },
    "zooli": { "name": "Zooli" },
    "bubble-puppy": { "name": "Bubble Puppy" },
    "mr-grouper": { "name": "Mr. Grouper" }
  }
}
```

- [ ] **Step 6: Remove `characterMatch` and `character` from `src/i18n/en.json`**

Delete those two top-level keys (and their contents) from `src/i18n/en.json`, leaving every other key untouched.

- [ ] **Step 7: Run the full test suite to verify nothing broke**

Run: `npx vitest run`
Expected: PASS — in particular `src/games/character-match/__tests__/CharacterMatchGame.test.jsx` and `src/i18n/__tests__/i18n.test.js` still pass, since `t('characterMatch.prompt', ...)` and `t('character.bluey.name')` now resolve via the merged file instead of the core file.

- [ ] **Step 8: Commit**

```bash
git add src/i18n/index.js src/i18n/en.json src/i18n/__tests__/i18n.test.js src/games/character-match/i18n/en.json
git commit -m "feat(i18n): add per-game locale merge mechanism, migrate Character Match"
```

---

## Task 2: Migrate Animal Sounds' namespace

**Files:**
- Create: `src/games/animal-sounds/i18n/en.json`
- Modify: `src/i18n/en.json` (remove `animalSounds` and `animal` keys)

**Interfaces:**
- Consumes: `mergeLocaleResources` from Task 1 (unchanged — this task only adds a new file for the glob to pick up).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Create `src/games/animal-sounds/i18n/en.json`**

```json
{
  "animalSounds": {
    "prompt": "What animal makes this sound?",
    "replay": "Replay sound",
    "howToPlay": "Listen to the sound, then tap the matching animal!"
  },
  "animal": {
    "elephant": { "name": "Elephant" },
    "lion": { "name": "Lion" },
    "cow": { "name": "Cow" },
    "dog": { "name": "Dog" },
    "cat": { "name": "Cat" },
    "frog": { "name": "Frog" },
    "duck": { "name": "Duck" },
    "horse": { "name": "Horse" },
    "pig": { "name": "Pig" },
    "sheep": { "name": "Sheep" },
    "rooster": { "name": "Rooster" },
    "owl": { "name": "Owl" }
  }
}
```

- [ ] **Step 2: Remove `animalSounds` and `animal` from `src/i18n/en.json`**

- [ ] **Step 3: Run the full test suite to verify nothing broke**

Run: `npx vitest run`
Expected: PASS — `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx` and `src/parent/__tests__/ParentDashboard.test.jsx` (which resolves `animal.*.name` for missed-items) still pass.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/en.json src/games/animal-sounds/i18n/en.json
git commit -m "feat(i18n): migrate Animal Sounds to its own locale file"
```

---

## Task 3: Migrate Color Match's namespace

**Files:**
- Create: `src/games/color-match/i18n/en.json`
- Modify: `src/i18n/en.json` (remove `colorMatch` and `color` keys)

**Interfaces:**
- Consumes: `mergeLocaleResources` from Task 1 (unchanged).
- Produces: the core `src/i18n/en.json` now contains only `common`, `dashboard`, `parent`, `gameCard`, `admin`, `scoreHistory`, `kids`, `badges` — used by Task 8/9's key additions.

- [ ] **Step 1: Create `src/games/color-match/i18n/en.json`**

```json
{
  "colorMatch": {
    "prompt": "Which one is this color?",
    "howToPlay": "A color swatch shows — tap the matching colored object!"
  },
  "color": {
    "red": { "name": "Red" },
    "orange": { "name": "Orange" },
    "yellow": { "name": "Yellow" },
    "green": { "name": "Green" },
    "blue": { "name": "Blue" },
    "purple": { "name": "Purple" },
    "pink": { "name": "Pink" },
    "brown": { "name": "Brown" },
    "black": { "name": "Black" },
    "white": { "name": "White" },
    "gray": { "name": "Gray" }
  }
}
```

- [ ] **Step 2: Remove `colorMatch` and `color` from `src/i18n/en.json`**

- [ ] **Step 3: Run the full test suite to verify nothing broke**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/en.json src/games/color-match/i18n/en.json
git commit -m "feat(i18n): migrate Color Match to its own locale file"
```

---

## Task 4: Dynamic `<html lang>` sync

**Files:**
- Modify: `src/i18n/index.js`
- Test: `src/i18n/__tests__/i18n.test.js`

**Interfaces:**
- Consumes: `i18next` instance from Task 1.
- Produces: `document.documentElement.lang` always reflects `i18n.language`.

- [ ] **Step 1: Write the failing test**

Add to `src/i18n/__tests__/i18n.test.js`:

```js
describe('html lang sync', () => {
  it('sets document.documentElement.lang to the active language on init', () => {
    expect(document.documentElement.lang).toBe(i18n.language)
  })

  it('updates document.documentElement.lang when the language changes', async () => {
    await i18n.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/i18n/__tests__/i18n.test.js`
Expected: FAIL — `document.documentElement.lang` is still `''` or the static HTML value, since nothing sets it yet.

- [ ] **Step 3: Add the sync in `src/i18n/index.js`**

Add after the `i18next.use(initReactI18next).init({...})` call (before `export const SUPPORTED_LOCALES`):

```js
function syncHtmlLang(lng) {
  if (typeof document !== 'undefined') document.documentElement.lang = lng
}
i18next.on('languageChanged', syncHtmlLang)
syncHtmlLang(i18next.language)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/i18n/__tests__/i18n.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/index.js src/i18n/__tests__/i18n.test.js
git commit -m "feat(i18n): sync document.documentElement.lang to the active language"
```

---

## Task 5: `settings.locale` + `LocaleSync` wiring

**Files:**
- Modify: `src/storage/adapter.js` (`DEFAULT_SETTINGS`, doc comment)
- Modify: `src/App.jsx`
- Test: `src/App.test.jsx` (new — there is no existing `App` test file; check `src/components/__tests__/` conventions apply the same way)

**Interfaces:**
- Consumes: `i18next` default export and nothing else new.
- Produces: `DEFAULT_SETTINGS.locale = 'en'`. A `LocaleSync` component (not exported — internal to `App.jsx`) that calls `i18n.changeLanguage(settings.locale)` once settings load.

- [ ] **Step 1: Add `locale` to `DEFAULT_SETTINGS` in `src/storage/adapter.js`**

Add `locale: 'en',` as the last entry of `DEFAULT_SETTINGS`, and add a line to the doc comment's Settings shape list: `` locale: 'en' — active i18next language code (added for i18n locale-switching, v0.12.0) ``.

- [ ] **Step 2: Write the failing test**

```jsx
// src/App.test.jsx
import { render, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import i18n from './i18n'
import App from './App'

vi.mock('./storage/index', () => ({
  default: {
    getSettings: vi.fn().mockResolvedValue({ locale: 'en' }),
    saveSettings: vi.fn().mockResolvedValue(undefined),
  },
  DEFAULT_SETTINGS: { locale: 'en' },
}))

describe('App — locale sync', () => {
  beforeEach(async () => { await i18n.changeLanguage('en') })

  it('calls i18n.changeLanguage with the loaded settings locale', async () => {
    const spy = vi.spyOn(i18n, 'changeLanguage')
    render(<App />)
    await waitFor(() => expect(spy).toHaveBeenCalledWith('en'))
  })
})
```

- [ ] **Step 2b: Run test to verify it fails**

Run: `npx vitest run src/App.test.jsx`
Expected: FAIL — `i18n.changeLanguage` is never called by `App` yet.

- [ ] **Step 3: Add `LocaleSync` to `src/App.jsx`**

Add the import at the top (alongside the existing `useSettings` import):

```js
import i18n from './i18n'
```

Add this component next to `GoogleAnalytics` (same file, same style):

```jsx
function LocaleSync() {
  const { settings, loaded } = useSettings()

  useEffect(() => {
    if (!loaded || !settings.locale) return
    if (settings.locale !== i18n.language) {
      i18n.changeLanguage(settings.locale)
    }
  }, [loaded, settings.locale])

  return null
}
```

Add `<LocaleSync />` inside `<BrowserRouter>`, next to `<GoogleAnalytics />`:

```jsx
    <BrowserRouter>
      <GoogleAnalytics />
      <LocaleSync />
      <Routes>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/App.test.jsx`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/storage/adapter.js src/App.jsx src/App.test.jsx
git commit -m "feat(i18n): add settings.locale and sync it to i18next on load"
```

---

## Task 6: `LocaleSelector` component, wired into Admin Settings

**Files:**
- Create: `src/components/LocaleSelector.jsx`
- Create: `src/components/__tests__/LocaleSelector.test.jsx`
- Modify: `src/admin/AdminPage.jsx`
- Modify: `src/i18n/en.json` (add `admin.localeHeading`)

**Interfaces:**
- Consumes: `SUPPORTED_LOCALES` from `src/i18n/index.js` (Task 1), `settings.locale` from Task 5.
- Produces: `LocaleSelector({ locales, value, onChange })` — renders `null` when `locales.length < 2`, otherwise a labeled `<select>`.

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/__tests__/LocaleSelector.test.jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import LocaleSelector from '../LocaleSelector'

describe('LocaleSelector', () => {
  it('renders nothing when only one locale is available', () => {
    const { container } = render(<LocaleSelector locales={['en']} value="en" onChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a labeled select with one option per locale when 2+ are available', () => {
    render(<LocaleSelector locales={['en', 'es']} value="en" onChange={vi.fn()} />)
    expect(screen.getByLabelText(/language/i)).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('calls onChange with the newly selected locale', async () => {
    const onChange = vi.fn()
    render(<LocaleSelector locales={['en', 'es']} value="en" onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText(/language/i), 'es')
    expect(onChange).toHaveBeenCalledWith('es')
  })

  it('has no accessibility violations when visible', async () => {
    const { container } = render(<LocaleSelector locales={['en', 'es']} value="en" onChange={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/LocaleSelector.test.jsx`
Expected: FAIL — `src/components/LocaleSelector.jsx` does not exist.

- [ ] **Step 3: Add `admin.localeHeading` to `src/i18n/en.json`**

Add to the `admin` object: `"localeHeading": "Language",`

- [ ] **Step 4: Implement `src/components/LocaleSelector.jsx`**

```jsx
import { useTranslation } from 'react-i18next'

export default function LocaleSelector({ locales, value, onChange }) {
  const { t } = useTranslation()
  if (locales.length < 2) return null

  return (
    <div className="admin__section">
      <h2>{t('admin.localeHeading')}</h2>
      <select
        className="admin__text-input"
        aria-label={t('admin.localeHeading')}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {locales.map(loc => (
          <option key={loc} value={loc}>{loc}</option>
        ))}
      </select>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/LocaleSelector.test.jsx`
Expected: PASS.

- [ ] **Step 6: Wire `LocaleSelector` into `AdminPage.jsx`**

Add the import near the other component imports:

```js
import LocaleSelector from '../components/LocaleSelector'
import { SUPPORTED_LOCALES } from '../i18n'
```

Insert as the first `admin__section` inside the `activeTab === 'settings'` block, immediately after the opening `<>`  and before the "Child's Name" section:

```jsx
            <LocaleSelector
              locales={SUPPORTED_LOCALES}
              value={settings.locale}
              onChange={val => updateSetting('locale', val)}
            />

            <div className="admin__section">
              <h2>{t('admin.childNameHeading')}</h2>
```

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS — `AdminPage.test.jsx` is unaffected since `SUPPORTED_LOCALES` has length 1, so `LocaleSelector` renders nothing today.

- [ ] **Step 8: Commit**

```bash
git add src/components/LocaleSelector.jsx src/components/__tests__/LocaleSelector.test.jsx src/admin/AdminPage.jsx src/i18n/en.json
git commit -m "feat(i18n): add LocaleSelector, hidden until a second locale exists"
```

---

## Task 7: Extract the hardcoded "No games found." string

**Files:**
- Modify: `src/admin/AdminPage.jsx:401-403`
- Modify: `src/i18n/en.json`
- Modify: `src/admin/__tests__/AdminPage.test.jsx`

**Interfaces:** none — self-contained string fix.

- [ ] **Step 1: Find/confirm the existing test coverage**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx -t "games"` to see what currently covers the Games tab (there may be no assertion on this exact string yet — if so, step 2 adds one).

- [ ] **Step 2: Write the failing test**

Add to `src/admin/__tests__/AdminPage.test.jsx` (inside whatever `describe` block covers the Games tab; render with `manifests={[]}` and switch to the Games tab):

```jsx
it('shows a translated empty-state message on the Games tab when there are no games', async () => {
  render(<MemoryRouter><AdminPage manifests={[]} /></MemoryRouter>)
  await userEvent.click(screen.getByRole('tab', { name: /games/i }))
  expect(screen.getByText('No games found.')).toBeInTheDocument()
})
```

(Match the file's existing import style for `userEvent`/`MemoryRouter`/`screen` — see the top of the file.)

- [ ] **Step 3: Run test to verify it currently passes by coincidence, then flip it to prove the fix matters**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx`
Expected: PASS (the literal string is already there) — this test doesn't fail today, so it isn't proving the fix. Skip straight to Step 4 and rely on Step 5's `t()` call actually resolving through i18n; the meaningful regression protection is that this string now lives in `en.json` and would show as a raw key if the translation call were ever removed by accident.

- [ ] **Step 4: Add the key to `src/i18n/en.json`**

Add to the `admin` object: `"noGamesFound": "No games found.",`

- [ ] **Step 5: Replace the hardcoded string in `src/admin/AdminPage.jsx`**

Change:

```jsx
{manifests.length === 0 && (
  <p className="admin__hint">No games found.</p>
)}
```

to:

```jsx
{manifests.length === 0 && (
  <p className="admin__hint">{t('admin.noGamesFound')}</p>
)}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/admin/AdminPage.jsx src/i18n/en.json src/admin/__tests__/AdminPage.test.jsx
git commit -m "fix(i18n): route Admin's \"No games found\" string through t()"
```

---

## Task 8: ParentDashboard — real game names instead of raw `gameId`

**Files:**
- Modify: `src/App.jsx:75` (pass `manifests` to `ParentDashboard`)
- Modify: `src/parent/ParentDashboard.jsx`
- Modify: `src/i18n/en.json` (add `parent.missedItemsAriaLabel`)
- Modify: `src/parent/__tests__/ParentDashboard.test.jsx`

**Interfaces:**
- Produces: `ParentDashboard` accepts a `manifests` prop (default `[]`), matching the pattern already used by `Dashboard`/`AdminPage`/`KidsProgressPage`. Internally builds `gameNames = { [gameId]: manifestName }` and passes it to `MissedItemsPanel`/`StreakHistoryPanel`/`ScoreTrendChart`/`ResponseTimeChart` as a `gameNames` prop.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing test**

Add to `src/parent/__tests__/ParentDashboard.test.jsx` (needs `manifests` passed through `renderDashboard` — update the helper and add a new test):

```jsx
function renderDashboard(manifests = []) {
  return render(<MemoryRouter><ParentDashboard manifests={manifests} /></MemoryRouter>)
}
```

```jsx
describe('ParentDashboard — game display names', () => {
  const manifests = [{ id: 'animal-sounds', name: 'Animal Sounds' }]

  it('shows the manifest name instead of the raw gameId in the missed-items heading', () => {
    mockGetAllScores.mockReturnValue([makeScore()])
    renderDashboard(manifests)
    expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
    expect(screen.queryByText('animal-sounds')).not.toBeInTheDocument()
  })

  it('falls back to the raw gameId when no manifest is found', () => {
    mockGetAllScores.mockReturnValue([makeScore()])
    renderDashboard([]) // no manifests passed
    expect(screen.getByText('animal-sounds')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parent/__tests__/ParentDashboard.test.jsx`
Expected: FAIL — `ParentDashboard` currently ignores any `manifests` prop and always renders the raw `gameId`.

- [ ] **Step 3: Add `parent.missedItemsAriaLabel` to `src/i18n/en.json`**

Add to the `parent` object: `"missedItemsAriaLabel": "{{name}} missed items",`

- [ ] **Step 4: Update `src/parent/ParentDashboard.jsx`**

Change `MissedItemsPanel`'s signature and body:

```jsx
function MissedItemsPanel({ missedItems, gameNames }) {
  const { t }  = useTranslation()
  const games  = Object.keys(missedItems)

  if (games.length === 0) {
    return <p className="parent__empty-chart">{t('parent.missedNoData')}</p>
  }

  return (
    <div className="parent__missed">
      {games.map(gameId => {
        const ns    = GAME_ITEM_NS[gameId]
        const items = missedItems[gameId]
        const max   = items[0]?.count ?? 1
        const name  = gameNames[gameId] ?? gameId
        return (
          <div key={gameId} className="parent__missed-game">
            <h3 className="parent__missed-title">{name}</h3>
            <ul className="parent__missed-list" aria-label={t('parent.missedItemsAriaLabel', { name })}>
              {items.map(({ itemId, count }) => {
                const label = ns ? t(`${ns}.${itemId}.name`, { defaultValue: itemId }) : itemId
                return (
                  <li key={itemId} className="parent__missed-item">
                    <span className="parent__missed-label">{label}</span>
                    <div className="parent__missed-bar-wrap">
                      <div
                        className="parent__missed-bar"
                        style={{ width: `${Math.round((count / max) * 100)}%` }}
                      />
                    </div>
                    <span className="parent__missed-count">{count}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
```

Change `StreakHistoryPanel`'s signature and body:

```jsx
function StreakHistoryPanel({ streakHistory, gameNames }) {
  const { t }  = useTranslation()
  const games  = Object.keys(streakHistory)
  if (games.length === 0) return <p className="parent__empty-chart">{t('parent.notEnoughData')}</p>
  return (
    <table className="parent__streak-table" aria-label={t('parent.streakHistoryHeading')}>
      <thead>
        <tr>
          <th>{t('parent.streakGame')}</th>
          <th>{t('parent.streakLast7')}</th>
          <th>{t('parent.streakLast30')}</th>
          <th>{t('parent.streakAllTime')}</th>
        </tr>
      </thead>
      <tbody>
        {games.map(gameId => {
          const { last7, last30, allTime } = streakHistory[gameId]
          return (
            <tr key={gameId}>
              <td>{gameNames[gameId] ?? gameId}</td>
              <td>{last7}</td>
              <td>{last30}</td>
              <td>{allTime}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

Change the main `export default function ParentDashboard(...)` signature and the panels' call sites:

```jsx
export default function ParentDashboard({ manifests = [] }) {
  const { t }          = useTranslation()
  const { getAllScores } = useScores()
  const [bestStreaks, setBestStreaks] = useState({})
  const scores  = getAllScores()
  const gameIds = useMemo(() => [...new Set(scores.map(s => s.gameId))], [scores])
  const gameNames = useMemo(
    () => Object.fromEntries(manifests.map(m => [m.id, m.name])),
    [manifests]
  )
```

(leave everything else in the function body as-is until the JSX). Update the two call sites:

```jsx
              <StreakHistoryPanel streakHistory={streakHistory} gameNames={gameNames} />
```

```jsx
              <MissedItemsPanel missedItems={missedItems} gameNames={gameNames} />
```

Also pass `gameNames` to the two chart components and use it for the legend/line name instead of the raw id — change both `ScoreTrendChart` and `ResponseTimeChart` signatures from `({ data, gameIds })` to `({ data, gameIds, gameNames })`, and change their `<Line ... name={id} .../>` to `name={gameNames[id] ?? id}`. Update their call sites:

```jsx
              <ScoreTrendChart data={scoreTrend} gameIds={gameIds} gameNames={gameNames} />
```

```jsx
              <ResponseTimeChart data={responseTimes} gameIds={gameIds} gameNames={gameNames} />
```

- [ ] **Step 5: Pass `manifests` from `src/App.jsx`**

Change:

```jsx
<Route path="/parent"       element={<ParentDashboard />} />
```

to:

```jsx
<Route path="/parent"       element={<ParentDashboard manifests={manifests} />} />
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/parent/__tests__/ParentDashboard.test.jsx`
Expected: PASS.

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/parent/ParentDashboard.jsx src/i18n/en.json src/parent/__tests__/ParentDashboard.test.jsx
git commit -m "fix(a11y,i18n): show real game names instead of raw gameId in Parent Dashboard"
```

---

## Task 9: Dashboard — translated category tag labels

**Files:**
- Modify: `src/components/Dashboard.jsx`
- Modify: `src/i18n/en.json` (add `dashboard.tag.*`)
- Modify: `src/components/__tests__/Dashboard.test.jsx`

**Interfaces:** none — self-contained.

- [ ] **Step 1: Write the failing test**

Add to `src/components/__tests__/Dashboard.test.jsx` (the file already mocks `useGameTags` to derive `allTags` from manifest `tags` — add a manifest with a known tag and assert the translated label, not the raw capitalized slug):

```jsx
it('renders a translated label for a known tag instead of just capitalizing the slug', () => {
  const manifests = [{ id: 'a', name: 'A', description: '', icon: '🎈', color: '#fff', tags: ['sounds'] }]
  render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
  expect(screen.getByRole('tab', { name: /sounds/i })).toBeInTheDocument()
})
```

(This passes even before the fix since "Sounds" already renders via capitalization — the real regression protection comes from Step 4's `defaultValue` fallback test below.)

```jsx
it('falls back to a capitalized slug for a tag with no translation entry', () => {
  const manifests = [{ id: 'a', name: 'A', description: '', icon: '🎈', color: '#fff', tags: ['xyz-custom'] }]
  render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
  expect(screen.getByRole('tab', { name: /xyz-custom/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify the fallback test fails**

Run: `npx vitest run src/components/__tests__/Dashboard.test.jsx`
Expected: the first new test PASSES already (capitalization coincidentally matches); the second FAILS if the current capitalization logic doesn't produce `Xyz-custom` matching `/xyz-custom/i` — actually current logic does capitalize correctly today, so re-run and confirm both currently pass; this step exists to prove no regression once `t()` is introduced with `defaultValue`, not to prove a new failure. Proceed to implementation and re-run after.

- [ ] **Step 3: Add known tag keys to `src/i18n/en.json`**

Add a new `tag` object nested under `dashboard`:

```json
"tag": {
  "sounds": "Sounds",
  "visual": "Visual",
  "numbers": "Numbers",
  "animals": "Animals",
  "colors": "Colors",
  "characters": "Characters"
}
```

- [ ] **Step 4: Add a `tagLabel` helper and use it in `src/components/Dashboard.jsx`**

Add near the top of the file, after `TAG_ICONS`:

```js
function tagLabel(tag, t) {
  return t(`dashboard.tag.${tag}`, { defaultValue: tag.charAt(0).toUpperCase() + tag.slice(1) })
}
```

In `buildSections`, change:

```js
const icon = TAG_ICONS[tag] ?? ''
const label = `${icon} ${tag.charAt(0).toUpperCase() + tag.slice(1)}`.trim()
```

to:

```js
const icon = TAG_ICONS[tag] ?? ''
const label = `${icon} ${tagLabel(tag, t)}`.trim()
```

In the tablist rendering, change:

```jsx
{allTags.map(tag => (
  <button
    key={tag}
    role="tab"
    aria-selected={activeTag === tag}
    className={`dashboard__tab${activeTag === tag ? ' dashboard__tab--active' : ''}`}
    onClick={() => setActiveTag(tag)}
  >
    {tag.charAt(0).toUpperCase() + tag.slice(1)}
  </button>
))}
```

to:

```jsx
{allTags.map(tag => (
  <button
    key={tag}
    role="tab"
    aria-selected={activeTag === tag}
    className={`dashboard__tab${activeTag === tag ? ' dashboard__tab--active' : ''}`}
    onClick={() => setActiveTag(tag)}
  >
    {tagLabel(tag, t)}
  </button>
))}
```

- [ ] **Step 5: Run test to verify both pass**

Run: `npx vitest run src/components/__tests__/Dashboard.test.jsx`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/Dashboard.jsx src/i18n/en.json src/components/__tests__/Dashboard.test.jsx
git commit -m "fix(i18n): translate dashboard category tag labels with slug fallback"
```

---

## Task 10: Focus-visible on `.game__choice` and `.game__next`

**Files:**
- Modify: `src/games/character-match/CharacterMatchGame.css:39-56, 61-70`
- Modify: `src/games/animal-sounds/AnimalSoundsGame.css:41-58, 62-71`
- Modify: `src/games/color-match/ColorMatchGame.css:40-58, 62-71`

**Interfaces:** none — CSS only, no test-visible behavior change beyond a DOM/CSSOM assertion.

Apply the same two edits to all three files below (the `.game__choice`/`.game__choice:hover`/`.game__choice:disabled` block differs slightly per file — only add the new focus rules, don't touch the existing declarations).

- [ ] **Step 1: Add focus-visible rules after `.game__choice:disabled` in `CharacterMatchGame.css`**

After the line `.game__choice:disabled { cursor: default; }`, add:

```css
.game__choice:focus         { outline: none; }
.game__choice:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

After `.game__next { ... }`'s closing brace, add:

```css
.game__next:focus         { outline: none; }
.game__next:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

- [ ] **Step 2: Repeat identically in `AnimalSoundsGame.css`**

Same two additions, at the same relative positions (after `.game__choice:disabled { cursor: default; }` and after the `.game__next { ... }` block).

- [ ] **Step 3: Repeat identically in `ColorMatchGame.css`**

Same two additions, after `.game__choice--bordered { border: 2px solid rgba(0,0,0,0.15); }` (this file has that extra line between `:disabled` and `-name`) and after the `.game__next { ... }` block.

- [ ] **Step 4: Manually verify in a browser**

Run: `npm run dev`, open any game, tab to an answer choice with the keyboard.
Expected: a visible 3px lavender ring with 3px offset appears around the focused choice button; clicking with a mouse shows no ring (that's what `:focus-visible` gives you over plain `:focus`).

- [ ] **Step 5: Run the existing test suite (no expected changes, just a safety check)**

Run: `npx vitest run`
Expected: PASS — jest-axe doesn't check focus-ring contrast in jsdom, so no test assertions change here; this is confirmed visually and via `@axe-core/playwright` in Task 19-adjacent E2E runs.

- [ ] **Step 6: Commit**

```bash
git add src/games/character-match/CharacterMatchGame.css src/games/animal-sounds/AnimalSoundsGame.css src/games/color-match/ColorMatchGame.css
git commit -m "fix(a11y): add focus-visible styling to game choice and next buttons"
```

---

## Task 11: Focus-visible on results/intro/replay buttons

**Files:**
- Modify: `src/games/character-match/CharacterMatchGame.css:77-79`
- Modify: `src/games/animal-sounds/AnimalSoundsGame.css:78-80, 28-29`
- Modify: `src/games/color-match/ColorMatchGame.css:78-80`
- Modify: `src/components/GameIntro.css`

**Interfaces:** none — CSS only.

- [ ] **Step 1: Add `.results__btn` focus rules to all three game CSS files**

After the line `.results__btn--home  { background: transparent; border: 2px solid var(--color-aqua); color: var(--color-text); }` in **each** of `CharacterMatchGame.css`, `AnimalSoundsGame.css`, and `ColorMatchGame.css`, add:

```css
.results__btn:focus         { outline: none; }
.results__btn:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

- [ ] **Step 2: Add `.game__replay` focus rules to `AnimalSoundsGame.css`**

After `.game__replay:hover { background: rgba(255,255,255,0.5); }`, add:

```css
.game__replay:focus         { outline: none; }
.game__replay:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

- [ ] **Step 3: Add `.game-intro__start` focus rules to `src/components/GameIntro.css`**

After the `.game-intro__start { ... }` block, add:

```css
.game-intro__start:focus         { outline: none; }
.game-intro__start:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

- [ ] **Step 4: Manually verify in a browser**

Run: `npm run dev`, finish a game and tab to "Play Again"/"Home"; open a game's intro screen and tab to "Let's Play!"; on Animal Sounds, tab to the 🔊 replay button.
Expected: visible lavender focus ring on each, keyboard-only.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/games/character-match/CharacterMatchGame.css src/games/animal-sounds/AnimalSoundsGame.css src/games/color-match/ColorMatchGame.css src/components/GameIntro.css
git commit -m "fix(a11y): add focus-visible styling to results, replay, and intro-start buttons"
```

---

## Task 12: Focus-visible on Admin controls

**Files:**
- Modify: `src/admin/AdminPage.css`

**Interfaces:** none — CSS only.

- [ ] **Step 1: Add focus-visible rules for `.admin__toggle-btn`**

After the `.admin__toggle-btn.active { ... }` block, add:

```css
.admin__toggle-btn:focus         { outline: none; }
.admin__toggle-btn:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

- [ ] **Step 2: Add focus-visible rules for `.admin__reset`**

After `.admin__reset:hover { background: color-mix(in srgb, var(--color-error) 10%, transparent); }`, add:

```css
.admin__reset:focus         { outline: none; }
.admin__reset:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

- [ ] **Step 3: Add focus-visible rules for `.admin__tag-save`, `.admin__tag-reset`, `.admin__intro-replay`**

After `.admin__tag-save:hover { opacity: 0.9; }`, add:

```css
.admin__tag-save:focus         { outline: none; }
.admin__tag-save:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

After `.admin__tag-reset:hover { ... }`'s closing brace, add:

```css
.admin__tag-reset:focus         { outline: none; }
.admin__tag-reset:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

After `.admin__intro-replay:hover { background: color-mix(in srgb, var(--color-aqua) 15%, transparent); }`, add:

```css
.admin__intro-replay:focus         { outline: none; }
.admin__intro-replay:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }
```

- [ ] **Step 4: Add focus-visible rules for `.admin__radio-label`**

`.admin__radio-label` is a `<label>` wrapping a visually-hidden `<input type="radio">` (`position: absolute; opacity: 0; width: 1px; height: 1px`) followed by visible text — the browser puts keyboard focus on the hidden `<input>`, not the label, so a plain `:focus-visible` rule on the input alone would be invisible. Target the label via `:has()` instead. After `.admin__radio-label.selected { background: var(--color-aqua-dark); color: white; }`, add:

```css
.admin__radio-label:has(input:focus-visible) {
  outline: 3px solid var(--color-lavender);
  outline-offset: 3px;
}
```

- [ ] **Step 5: Manually verify in a browser**

Run: `npm run dev`, open `/admin`, tab through the Settings toggle buttons, the radio-style option rows (Answer Choices, Timer, etc.), the Reset button, and the Games tab's Save/Reset/Replay Intro buttons.
Expected: visible lavender focus ring on each, keyboard-only — including a full ring around the label text for radio options, not just the invisible 1px input.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/admin/AdminPage.css
git commit -m "fix(a11y): add focus-visible styling to Admin toggle and action buttons"
```

---

## Task 13: Focus management — `GameIntro` and `GameResults`

**Files:**
- Modify: `src/components/GameIntro.jsx`
- Modify: `src/components/GameResults.jsx`
- Modify: `src/index.css` (add a shared `.sr-only` utility)
- Modify: `src/i18n/en.json` (add `common.resultsHeading`)
- Modify: `src/components/__tests__/GameIntro.test.jsx`
- Modify: `src/components/__tests__/GameResults.test.jsx`

**Interfaces:**
- Produces: `.sr-only` CSS utility class (visually hidden but present to assistive tech) — reused by Task 18.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/__tests__/GameIntro.test.jsx`:

```jsx
it('moves focus to the game name heading on mount', () => {
  render(
    <GameIntro
      icon="🐘" name="Animal Sounds" instructions="x"
      dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()}
    />
  )
  expect(screen.getByRole('heading', { name: 'Animal Sounds' })).toHaveFocus()
})
```

Add to `src/components/__tests__/GameResults.test.jsx`:

```jsx
it('moves focus to the results heading on mount', () => {
  render(<GameResults score={3} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
  expect(screen.getByRole('heading', { name: /results/i })).toHaveFocus()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/__tests__/GameIntro.test.jsx src/components/__tests__/GameResults.test.jsx`
Expected: FAIL — `GameIntro`'s `<h1>` has no `tabIndex`/focus effect; `GameResults` has no heading element at all yet.

- [ ] **Step 3: Add `.sr-only` utility to `src/index.css`**

Add near the top of the file, after the `*, *::before, *::after` rule:

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 4: Add `common.resultsHeading` to `src/i18n/en.json`**

Add to the `common` object: `"resultsHeading": "Results",`

- [ ] **Step 5: Update `src/components/GameIntro.jsx`**

```jsx
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import ManifestIcon from './ManifestIcon'
import './GameIntro.css'

export default function GameIntro({ icon, name, instructions, dontShowAgain, onDontShowAgainChange, onStart }) {
  const { t } = useTranslation()
  const headingRef = useRef(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <main className="game-intro">
      <ManifestIcon icon={icon} as="div" className="game-intro__icon" ariaHidden />
      <h1 className="game-intro__name" tabIndex={-1} ref={headingRef}>{name}</h1>
      <p className="game-intro__instructions">{instructions}</p>

      <label className="game-intro__checkbox-label">
        <input
          type="checkbox"
          data-testid="game-intro-dont-show-again"
          checked={dontShowAgain}
          onChange={e => onDontShowAgainChange(e.target.checked)}
        />
        {t('common.gameIntroDontShowAgain')}
      </label>

      <button className="game-intro__start" data-testid="game-intro-start" onClick={onStart}>
        {t('common.gameIntroStart')}
      </button>
    </main>
  )
}
```

- [ ] **Step 6: Update `src/components/GameResults.jsx`**

Add the `useEffect`/`useRef` import and a hidden focus-target heading as the first child of `.results`:

```jsx
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import './GameResults.css'

export default function GameResults({
  score, total, missed, onPlayAgain, onHome, renderMissedItem,
  offerDifficultyBump = false, numChoices, onAcceptDifficultyBump, onDismissDifficultyBump,
  personalBestResult = null, newBadges = [],
}) {
  const { t } = useTranslation()
  const headingRef = useRef(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <div className="results">
      <h1 className="sr-only" tabIndex={-1} ref={headingRef}>{t('common.resultsHeading')}</h1>
      <div className="results__emoji">{missed.length === 0 ? '🎉' : '⭐'}</div>
      <div className="results__score">{score} / {total}</div>
      <div className="results__label">{t('common.scoreLabel', { score, total })}</div>
```

(leave the rest of the component body unchanged from this point on).

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/components/__tests__/GameIntro.test.jsx src/components/__tests__/GameResults.test.jsx`
Expected: PASS.

- [ ] **Step 8: Run the full suite**

Run: `npx vitest run`
Expected: PASS — in particular, existing `GameResults.test.jsx` assertions like `screen.getByText('3 / 5')` are unaffected by the new hidden heading.

- [ ] **Step 9: Commit**

```bash
git add src/components/GameIntro.jsx src/components/GameResults.jsx src/index.css src/i18n/en.json src/components/__tests__/GameIntro.test.jsx src/components/__tests__/GameResults.test.jsx
git commit -m "fix(a11y): move focus to the heading when GameIntro/GameResults mount"
```

---

## Task 14: Focus management — top-level pages

**Files:**
- Modify: `src/components/Dashboard.jsx`
- Modify: `src/admin/AdminPage.jsx`
- Modify: `src/parent/ParentDashboard.jsx`
- Modify: `src/kids/KidsProgressPage.jsx`
- Modify: `src/components/__tests__/Dashboard.test.jsx`, `src/admin/__tests__/AdminPage.test.jsx`, `src/parent/__tests__/ParentDashboard.test.jsx`, `src/kids/__tests__/KidsProgressPage.test.jsx`

**Interfaces:** none — each page independently gets the same treatment.

- [ ] **Step 1: Write the four failing tests**

Add to `src/components/__tests__/Dashboard.test.jsx`:

```jsx
it('moves focus to the page title on mount', () => {
  render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
})
```

Add to `src/admin/__tests__/AdminPage.test.jsx`:

```jsx
it('moves focus to the page title on mount', () => {
  render(<MemoryRouter><AdminPage manifests={[]} /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: /settings/i })).toHaveFocus()
})
```

Add to `src/parent/__tests__/ParentDashboard.test.jsx`:

```jsx
it('moves focus to the page title on mount', () => {
  mockGetAllScores.mockReturnValue([])
  renderDashboard()
  expect(screen.getByRole('heading', { name: /progress dashboard/i })).toHaveFocus()
})
```

Add to `src/kids/__tests__/KidsProgressPage.test.jsx` (check the file's existing render helper name/props and match its style):

```jsx
it('moves focus to the page title on mount', () => {
  render(<MemoryRouter><KidsProgressPage manifests={[]} /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: /my progress/i })).toHaveFocus()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/__tests__/Dashboard.test.jsx src/admin/__tests__/AdminPage.test.jsx src/parent/__tests__/ParentDashboard.test.jsx src/kids/__tests__/KidsProgressPage.test.jsx`
Expected: FAIL on all four new tests — none of the `<h1>`s are focusable yet.

- [ ] **Step 3: Update `src/components/Dashboard.jsx`**

Add `useEffect`/`useRef` to the import line (`import { useState, useEffect, useRef } from 'react'`). Inside the component, after the existing hook calls, add:

```js
const titleRef = useRef(null)
useEffect(() => { titleRef.current?.focus() }, [])
```

Change the title heading:

```jsx
<h1 className="dashboard__title" tabIndex={-1} ref={titleRef}>🌊 {title}</h1>
```

- [ ] **Step 4: Update `src/admin/AdminPage.jsx`**

Add `useRef` to the import line (`import { useState, useEffect, useRef } from 'react'`). Inside the component, add:

```js
const titleRef = useRef(null)
useEffect(() => { titleRef.current?.focus() }, [])
```

Change the title heading:

```jsx
<h1 className="admin__title" tabIndex={-1} ref={titleRef}>{t('admin.title')}</h1>
```

- [ ] **Step 5: Update `src/parent/ParentDashboard.jsx`**

Add `useRef` to the import line. Inside the component, add:

```js
const titleRef = useRef(null)
useEffect(() => { titleRef.current?.focus() }, [])
```

Change the title heading:

```jsx
<h1 className="parent__title" tabIndex={-1} ref={titleRef}>{t('parent.title')}</h1>
```

- [ ] **Step 6: Update `src/kids/KidsProgressPage.jsx`**

Add `useRef` to the import line (`import { useState, useEffect, useRef } from 'react'`). Inside the component, add:

```js
const titleRef = useRef(null)
useEffect(() => { titleRef.current?.focus() }, [])
```

Change the title heading:

```jsx
<h1 className="kid-progress__title" tabIndex={-1} ref={titleRef}>{t('kids.title')}</h1>
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/components/__tests__/Dashboard.test.jsx src/admin/__tests__/AdminPage.test.jsx src/parent/__tests__/ParentDashboard.test.jsx src/kids/__tests__/KidsProgressPage.test.jsx`
Expected: PASS.

- [ ] **Step 8: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/Dashboard.jsx src/admin/AdminPage.jsx src/parent/ParentDashboard.jsx src/kids/KidsProgressPage.jsx src/components/__tests__/Dashboard.test.jsx src/admin/__tests__/AdminPage.test.jsx src/parent/__tests__/ParentDashboard.test.jsx src/kids/__tests__/KidsProgressPage.test.jsx
git commit -m "fix(a11y): move focus to each top-level page's title on mount"
```

---

## Task 15: `aria-live="polite"` on `StreakBadge`

**Files:**
- Modify: `src/components/StreakBadge.jsx`
- Modify: `src/components/__tests__/StreakBadge.test.jsx`

**Interfaces:** none.

- [ ] **Step 1: Write the failing test**

Add to `src/components/__tests__/StreakBadge.test.jsx`:

```jsx
it('has aria-live="polite" so screen readers announce streak changes', () => {
  render(<StreakBadge streak={3} />)
  expect(screen.getByText(/3/)).toHaveAttribute('aria-live', 'polite')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/StreakBadge.test.jsx`
Expected: FAIL — no `aria-live` attribute exists yet.

- [ ] **Step 3: Update `src/components/StreakBadge.jsx`**

```jsx
import { useTranslation } from 'react-i18next'
import './StreakBadge.css'

export default function StreakBadge({ streak }) {
  const { t } = useTranslation()
  if (streak < 2) return null
  return (
    <span className="streak-badge" aria-live="polite">{t('common.streak', { streak })}</span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/StreakBadge.test.jsx`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/StreakBadge.jsx src/components/__tests__/StreakBadge.test.jsx
git commit -m "fix(a11y): announce streak changes via aria-live"
```

---

## Task 16: `prefers-reduced-motion` guard on correct/wrong animations

**Files:**
- Modify: `src/index.css:42-59`

**Interfaces:** none — CSS only.

- [ ] **Step 1: Replace the animation block in `src/index.css`**

Replace:

```css
@keyframes pulse-green {
  0%   { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
  70%  { box-shadow: 0 0 0 16px rgba(76, 175, 80, 0); }
  100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
}

@keyframes shake-red {
  0%, 100% { transform: translateX(0); background: inherit; }
  20%       { transform: translateX(-8px); background: #ef9a9a; }
  40%       { transform: translateX(8px);  background: #ef9a9a; }
  60%       { transform: translateX(-8px); background: #ef9a9a; }
  80%       { transform: translateX(8px);  background: #ef9a9a; }
}

.correct { animation: pulse-green 0.6s ease forwards; background: #a5d6a7 !important; }
.wrong   { animation: shake-red   0.6s ease forwards; }
.highlight-correct { background: #a5d6a7 !important; }
.game__choice--disabled-wrong { opacity: 0.45; filter: grayscale(60%); animation: shake-red 0.6s ease; }
```

with:

```css
@keyframes pulse-green {
  0%   { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
  70%  { box-shadow: 0 0 0 16px rgba(76, 175, 80, 0); }
  100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
}

@keyframes shake-red {
  0%, 100% { transform: translateX(0); background: inherit; }
  20%       { transform: translateX(-8px); background: #ef9a9a; }
  40%       { transform: translateX(8px);  background: #ef9a9a; }
  60%       { transform: translateX(-8px); background: #ef9a9a; }
  80%       { transform: translateX(8px);  background: #ef9a9a; }
}

/* Correct/wrong feedback is color + motion; when a user has opted out of
   motion at the OS level, keep the color signal and drop only the animation.
   The button is also `disabled` at this point, so the state is still
   conveyed by more than color alone even with motion removed. */
@media (prefers-reduced-motion: no-preference) {
  .correct { animation: pulse-green 0.6s ease forwards; }
  .wrong   { animation: shake-red   0.6s ease forwards; }
  .game__choice--disabled-wrong { animation: shake-red 0.6s ease; }
}

.correct { background: #a5d6a7 !important; }
.wrong   { background: #ef9a9a; }
.highlight-correct { background: #a5d6a7 !important; }
.game__choice--disabled-wrong { opacity: 0.45; filter: grayscale(60%); }
```

- [ ] **Step 2: Manually verify in a browser**

In Chrome DevTools, open the Rendering tab, set "Emulate CSS media feature prefers-reduced-motion" to "reduce", play a game, and answer both correctly and incorrectly.
Expected: correct answers show a static green background with no pulse; wrong answers show a static red-ish background with no shake. Turn the emulation off and repeat — the original animated behavior returns.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — no test currently asserts on animation presence, so this is a pure CSS behavior change with no test regressions expected. If any Storybook visual-regression baseline captures a mid-animation frame (unlikely, since Playwright screenshots settle after paint), update it per the visual regression instructions in `docs/TESTING.md`.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "fix(a11y): respect prefers-reduced-motion for correct/wrong feedback animations"
```

---

## Task 17: Fix contrast on the disabled-wrong choice state

**Files:**
- Modify: `src/index.css` (the `.game__choice--disabled-wrong` rule from Task 16)

**Interfaces:** none — CSS only.

- [ ] **Step 1: Replace the opacity-based fade**

Change:

```css
.game__choice--disabled-wrong { opacity: 0.45; filter: grayscale(60%); }
```

to:

```css
.game__choice--disabled-wrong { filter: grayscale(85%) brightness(0.88); }
```

(`opacity` blends the whole button — text included — against whatever's behind it, which can push a label below AA contrast depending on the page background; `filter` on `grayscale`/`brightness` desaturates and dims without introducing that blend-with-background risk.)

- [ ] **Step 2: Manually verify contrast with a checker**

`src/games/color-match/data/colors.js` picks each swatch's `textColor` to already be exactly at the AA 4.5:1 floor against its `color` (see the comment at the top of that file) — this is the tightest-margin case in the app. Using a contrast checker (e.g. the one built into Chrome DevTools' color picker, or WebAIM's), check the `yellow` swatch (`#FDD835` background, `#000000` text) after applying `grayscale(85%) brightness(0.88)`: compute the resulting background color and confirm black text against it is still ≥ 4.5:1. Adjust the `brightness()` value if it falls short (a lower brightness value darkens the desaturated gray, increasing contrast against black text; if a game ever pairs a *dark* swatch with *white* text, err toward keeping brightness closer to 1 instead of dimming further).

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — no jsdom-based test asserts computed contrast; this is confirmed via Step 2's manual check and by the existing `@axe-core/playwright` E2E scans, which do check real rendered contrast in a browser.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "fix(a11y): replace opacity-based fade on disabled-wrong choices with a contrast-safe filter"
```

---

## Task 18: Chart accessibility — hidden table fallback + translated legends

**Files:**
- Modify: `src/parent/ParentDashboard.jsx`
- Modify: `src/parent/__tests__/ParentDashboard.test.jsx`

**Interfaces:**
- Consumes: `.sr-only` from Task 13, `gameNames` from Task 8.

- [ ] **Step 1: Write the failing test**

Add to `src/parent/__tests__/ParentDashboard.test.jsx` (inside the "with scores" describe block, which already has 2+ sessions so the charts render instead of the "not enough data" message):

```jsx
it('provides a visually-hidden data table alternative for the score trend chart', () => {
  renderDashboard()
  const tables = screen.getAllByRole('table')
  // one for streak history (already visible) + one hidden table per chart
  expect(tables.length).toBeGreaterThanOrEqual(3)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parent/__tests__/ParentDashboard.test.jsx`
Expected: FAIL — only the existing streak-history `<table>` exists (1 table, not 3+).

- [ ] **Step 3: Add a small reusable hidden-table component and use it in both charts**

Add this component above `ScoreTrendChart` in `src/parent/ParentDashboard.jsx`:

```jsx
function ChartDataTable({ caption, data, gameIds, gameNames, formatValue }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>Date</th>
          {gameIds.map(id => <th key={id}>{gameNames[id] ?? id}</th>)}
        </tr>
      </thead>
      <tbody>
        {data.map(row => (
          <tr key={row.date}>
            <td>{row.date}</td>
            {gameIds.map(id => <td key={id}>{row[id] != null ? formatValue(row[id]) : '—'}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

Update `ScoreTrendChart`:

```jsx
function ScoreTrendChart({ data, gameIds, gameNames }) {
  const { t } = useTranslation()
  if (data.length < 2) return <p className="parent__empty-chart">{t('parent.notEnoughData')}</p>
  return (
    <>
      <ChartDataTable
        caption={t('parent.scoreTrendHeading')}
        data={data}
        gameIds={gameIds}
        gameNames={gameNames}
        formatValue={v => `${v}%`}
      />
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} width={42} />
          <Tooltip formatter={v => `${v}%`} labelFormatter={formatDate} />
          <Legend />
          {gameIds.map((id, i) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              name={gameNames[id] ?? id}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}
```

Update `ResponseTimeChart` the same way:

```jsx
function ResponseTimeChart({ data, gameIds, gameNames }) {
  const { t } = useTranslation()
  if (data.length < 2) return <p className="parent__empty-chart">{t('parent.notEnoughData')}</p>
  return (
    <>
      <ChartDataTable
        caption={t('parent.responseTimeHeading')}
        data={data}
        gameIds={gameIds}
        gameNames={gameNames}
        formatValue={formatMs}
      />
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatMs} tick={{ fontSize: 12 }} width={48} />
          <Tooltip formatter={formatMs} labelFormatter={formatDate} />
          <Legend />
          {gameIds.map((id, i) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              name={gameNames[id] ?? id}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}
```

(`gameNames` is already passed to these two components from Task 8 — no call-site changes needed here.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parent/__tests__/ParentDashboard.test.jsx`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/parent/ParentDashboard.jsx src/parent/__tests__/ParentDashboard.test.jsx
git commit -m "fix(a11y): add hidden data-table alternative and translated legends to charts"
```

---

## Task 19: Documentation and version bump

**Files:**
- Modify: `docs/TESTING.md`
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `src/games/character-match/manifest.json`
- Modify: `src/games/animal-sounds/manifest.json`
- Modify: `src/games/color-match/manifest.json`

**Interfaces:** none — documentation/metadata only.

- [ ] **Step 1: Update `docs/TESTING.md`**

In the "i18n string convention" section, after the existing bullet list, add:

```markdown
**File layout:** core cross-cutting strings (`common`, `dashboard`, `admin`, `parent`, `kids`, `scoreHistory`, `badges`) live in `src/i18n/en.json`. Each game's own strings (its `prompt`/`howToPlay` and its item-name catalog) live in `src/games/<id>/i18n/en.json` and are auto-merged at startup via `import.meta.glob`, mirroring the manifest/component auto-discovery pattern — no registry to edit when adding a game's strings. `mergeLocaleResources()` (`src/i18n/index.js`) throws if two files define the same top-level key.
```

- [ ] **Step 2: Update `CLAUDE.md`**

In the "Architecture" section, after the "Auto-discovery is the core mechanic" paragraph, add one sentence:

```markdown
i18n strings follow the same auto-discovery principle: `src/games/<id>/i18n/en.json` is picked up automatically by `src/i18n/index.js` — no shared file to edit when adding a game.
```

- [ ] **Step 3: Add a `CHANGELOG.md` entry**

Add above the existing `## [0.10.0]` entry:

```markdown
## [0.12.0] - 2026-07-05

### Added
- Per-game i18n locale files (`src/games/<id>/i18n/en.json`), auto-merged at startup — adding a game's translations no longer requires editing a shared file.
- `settings.locale` and a hidden-until-needed `LocaleSelector` in Admin Settings, so a second language can be added later without further plumbing.
- Dynamic `<html lang>` sync to the active i18next language.

### Fixed
- Added `:focus-visible` styling (matching the existing nav/card/tab pattern) to game answer choices, results buttons, the intro start button, the sound-replay button, and all Admin action/toggle buttons — previously only nav chrome had visible keyboard focus.
- Game phase transitions (intro → play → results) and top-level page loads now move focus to the new view's heading, so keyboard and screen-reader users are told when a new view appears.
- Correct/wrong answer feedback now respects `prefers-reduced-motion`.
- The disabled "already tried, wrong" choice state no longer risks dropping below AA text contrast (replaced an opacity-based fade with a fixed filter).
- `StreakBadge` announces streak changes via `aria-live="polite"`.
- Parent Dashboard's missed-items panel, streak table, and chart legends show each game's real name instead of its raw id; both trend charts gained a visually-hidden data-table alternative for screen readers.
- Admin's "No games found" message and Dashboard's category tag labels now go through `t()` instead of being hardcoded.
```

- [ ] **Step 4: Bump `package.json` version**

Change `"version": "0.11.0"` to `"version": "0.12.0"`.

- [ ] **Step 5: Bump each game manifest's version**

`src/games/character-match/manifest.json`: `"version": "1.2.0"` → `"version": "1.3.0"`.
`src/games/animal-sounds/manifest.json`: `"version": "1.4.0"` → `"version": "1.5.0"`.
`src/games/color-match/manifest.json`: `"version": "1.4.0"` → `"version": "1.5.0"`.

- [ ] **Step 6: Run the full suite one last time**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Run E2E and visual regression**

Run: `npm run e2e`
Expected: PASS. If any visual regression baseline fails due to a legitimate rendering change from this plan (unlikely, since all a11y CSS changes are focus/motion/contrast-state-only, not default-state layout), review the diff and run `npx playwright test visual.spec.js --update-snapshots`, then commit the updated PNGs alongside this task's commit.

- [ ] **Step 8: Commit**

```bash
git add docs/TESTING.md CLAUDE.md CHANGELOG.md package.json src/games/character-match/manifest.json src/games/animal-sounds/manifest.json src/games/color-match/manifest.json
git commit -m "docs: document i18n/a11y hardening, bump to v0.12.0"
```
