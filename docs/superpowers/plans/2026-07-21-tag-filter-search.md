# Better Game Tag Filter/Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the dashboard's game-discovery UI (issue #103) so it scales past today's ~8 tags: add a name-search box, switch the tag strip from single-select tabs to multi-select toggle pills with AND filtering, and collapse the pill row to one line with a "+N more" expander once it would otherwise wrap.

**Architecture:** Two independent pieces of local state in `Dashboard.jsx` (`searchText`, `selectedTags`) replace today's single `activeTag`. A new presentational `TagFilterBar` component owns pill rendering, selected-first ordering, and the collapse/expand toggle, backed by a new `useTagRowOverflow` measurement hook (real-DOM `offsetTop` comparison, no hardcoded pixel constants — mirrors the `useFitTileSize` precedent from issue #104). Tag pills switch from the ARIA Tabs pattern (`role="tab"`/`"tablist"`, which requires single selection) to `role="group"` + `aria-pressed` toggle buttons, the correct pattern for independent multi-select.

**Tech Stack:** React 18, react-i18next, Vitest + React Testing Library + jsdom, Playwright (e2e + Storybook visual regression), existing CSS custom properties in `src/index.css`.

**Design doc:** `docs/superpowers/specs/2026-07-21-tag-filter-search-design.md`

## Global Constraints

- Search matches each game's **translated name only** (`t(manifest.nameKey)`), not description.
- Multi-select tags use **AND** logic: a game must carry every selected tag.
- No standalone "All" pill — "no tags selected" already means All; a **Clear filters** action (visible whenever `searchText` or `selectedTags` is non-empty) replaces its one-click-reset role.
- Tag pills shown are computed from games matching the current **search text only**, not narrowed by already-selected tags (faceted-filter behavior).
- Selected tags are always sorted to the front of the pill list so an active filter is never hidden by the collapse.
- Tag pills use `role="group"` + `<button aria-pressed>`, not `role="tablist"`/`role="tab"` (ARIA Tabs mandates single selection — wrong pattern once multiple pills can be active).
- **AU-7 (`docs/ENHANCEMENTS.md`) is already resolved** — verified against a live dev-server render, `.dashboard__tab` is 64×64px via the global `button{min-height/min-width:64px}` rule. Do not add tap-target CSS; just remove the stale entry.
- i18n: add every new key to `src/i18n/en.json`, `es.json`, **and** `pl.json` (cross-locale parity test enforces matching base key sets). Pluralized keys (`moreTags`, `resultsCount`) use `_one`/`_other` for en/es and all four CLDR forms (`_one`/`_few`/`_many`/`_other`) for pl, per `docs/TESTING.md`'s pluralization convention.
- CSS class names `dashboard__tab` / `dashboard__tab--active` are kept as-is on the new toggle buttons (only the ARIA role/behavior changes) — minimizes risk, no need to touch the existing hover-specificity-fix CSS block.
- Version bump: `0.31.2` → `0.32.0` (minor — this is a new feature, matching this repo's convention of bumping minor for `### Added` CHANGELOG entries, e.g. `0.31.0`/`0.29.0`).

---

### Task 1: Add new i18n keys (additive only — no removals yet)

**Files:**
- Modify: `src/i18n/en.json:49-68` (the `dashboard` block)
- Modify: `src/i18n/es.json:49-68`
- Modify: `src/i18n/pl.json:51-70`
- Test: `src/i18n/__tests__/i18n.test.js` (existing — run only, no edits)

**Interfaces:**
- Produces: i18n keys `dashboard.searchLabel`, `dashboard.searchPlaceholder`, `dashboard.noResults`, `dashboard.clearFilters`, `dashboard.moreTags` (pluralized), `dashboard.showLessTags`, `dashboard.resultsCount` (pluralized), `dashboard.tagsGroupLabel` — consumed by Task 3 (`TagFilterBar`) and Task 4 (`Dashboard`).
- This task deliberately does **not** remove `dashboard.tabAll`/`dashboard.tabsLabel` yet — the old `Dashboard.jsx` still reads them until Task 4 replaces it. Removing them now would transiently break the current passing test suite.

- [ ] **Step 1: Add the new keys to `src/i18n/en.json`**

Find the `dashboard` block (lines 49-68) and replace it with:

```json
  "dashboard": {
    "titleDefault": "My Playground",
    "titleNamed": "{{name}}'s Playground",
    "empty": "No games found. Drop a game folder into src/games/.",
    "todaysGame": "Today's Game",
    "categoryOther": "Other",
    "tabAll": "All",
    "tabsLabel": "Filter games by category",
    "tagsGroupLabel": "Filter games by category",
    "searchLabel": "Search games",
    "searchPlaceholder": "Search games...",
    "noResults": "No games match your filters.",
    "clearFilters": "Clear filters",
    "moreTags_one": "+{{count}} more",
    "moreTags_other": "+{{count}} more",
    "showLessTags": "Show less",
    "resultsCount_one": "{{count}} game found",
    "resultsCount_other": "{{count}} games found",
    "featuredAriaLabel": "Play today's featured game: {{name}}",
    "landscapeOnly": "Landscape only",
    "portraitOnly": "Portrait only",
    "tag": {
      "sounds": "Sounds",
      "visual": "Visual",
      "numbers": "Numbers",
      "animals": "Animals",
      "colors": "Colors",
      "characters": "Characters"
    }
  },
```

- [ ] **Step 2: Add the new keys to `src/i18n/es.json`**

Find the `dashboard` block (lines 49-68) and replace it with:

```json
  "dashboard": {
    "titleDefault": "Mi Playground",
    "titleNamed": "El Playground de {{name}}",
    "empty": "No se encontraron juegos. Agrega una carpeta de juego en src/games/.",
    "todaysGame": "Juego de hoy",
    "categoryOther": "Otros",
    "tabAll": "Todos",
    "tabsLabel": "Filtrar juegos por categoría",
    "tagsGroupLabel": "Filtrar juegos por categoría",
    "searchLabel": "Buscar juegos",
    "searchPlaceholder": "Buscar juegos...",
    "noResults": "Ningún juego coincide con tus filtros.",
    "clearFilters": "Borrar filtros",
    "moreTags_one": "+{{count}} más",
    "moreTags_other": "+{{count}} más",
    "showLessTags": "Mostrar menos",
    "resultsCount_one": "{{count}} juego encontrado",
    "resultsCount_other": "{{count}} juegos encontrados",
    "featuredAriaLabel": "Jugar el juego destacado de hoy: {{name}}",
    "landscapeOnly": "Solo horizontal",
    "portraitOnly": "Solo vertical",
    "tag": {
      "sounds": "Sonidos",
      "visual": "Visual",
      "numbers": "Números",
      "animals": "Animales",
      "colors": "Colores",
      "characters": "Personajes"
    }
  },
```

- [ ] **Step 3: Add the new keys to `src/i18n/pl.json`**

Find the `dashboard` block (lines 51-70) and replace it with:

```json
  "dashboard": {
    "titleDefault": "Mój Playground",
    "titleNamed": "{{name}} — Playground",
    "empty": "Nie znaleziono gier. Dodaj folder gry do src/games/.",
    "todaysGame": "Gra dnia",
    "categoryOther": "Inne",
    "tabAll": "Wszystkie",
    "tabsLabel": "Filtruj gry według kategorii",
    "tagsGroupLabel": "Filtruj gry według kategorii",
    "searchLabel": "Szukaj gier",
    "searchPlaceholder": "Szukaj gier...",
    "noResults": "Żadna gra nie pasuje do filtrów.",
    "clearFilters": "Wyczyść filtry",
    "moreTags_one": "+{{count}} więcej",
    "moreTags_few": "+{{count}} więcej",
    "moreTags_many": "+{{count}} więcej",
    "moreTags_other": "+{{count}} więcej",
    "showLessTags": "Pokaż mniej",
    "resultsCount_one": "Znaleziono {{count}} grę",
    "resultsCount_few": "Znaleziono {{count}} gry",
    "resultsCount_many": "Znaleziono {{count}} gier",
    "resultsCount_other": "Znaleziono {{count}} gier",
    "featuredAriaLabel": "Zagraj w dzisiejszą polecaną grę: {{name}}",
    "landscapeOnly": "Tylko poziomo",
    "portraitOnly": "Tylko pionowo",
    "tag": {
      "sounds": "Dźwięki",
      "visual": "Wizualne",
      "numbers": "Liczby",
      "animals": "Zwierzęta",
      "colors": "Kolory",
      "characters": "Postacie"
    }
  },
```

- [ ] **Step 4: Run the cross-locale parity test**

Run: `npx vitest run src/i18n/__tests__/i18n.test.js`
Expected: PASS (all three locales now expose the same new key set; `pl` supplies all four plural forms where en/es supply two).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/en.json src/i18n/es.json src/i18n/pl.json
git commit -m "feat(103): add i18n keys for dashboard search and tag filter redesign"
```

---

### Task 2: `useTagRowOverflow` measurement hook

**Files:**
- Create: `src/hooks/useTagRowOverflow.js`
- Test: `src/hooks/__tests__/useTagRowOverflow.test.js`

**Interfaces:**
- Produces: `useTagRowOverflow(ref: RefObject<HTMLElement>, dep: any) => { visibleCount: number, rowHeight: number | null }`. `dep` is a single scalar value (not an array — see the note after Step 1 for why) that changes whenever the measured row's content changes. `visibleCount` is `Infinity` and `rowHeight` is `null` until the first real measurement (no children, or ref not yet attached). Consumed by Task 3's `TagFilterBar`.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useTagRowOverflow.test.js`:

```js
import { act, renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import useTagRowOverflow from '../useTagRowOverflow'

class MockResizeObserver {
  constructor(callback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }
  observe(el) { this.el = el }
  disconnect() { this.disconnected = true }
}
MockResizeObserver.instances = []

function makePill({ offsetTop, height }) {
  const el = document.createElement('button')
  Object.defineProperty(el, 'offsetTop', { value: offsetTop, configurable: true })
  el.getBoundingClientRect = () => ({
    height, width: 0, top: offsetTop, left: 0, right: 0, bottom: offsetTop + height, x: 0, y: offsetTop, toJSON() {},
  })
  return el
}

function makeRow(pills) {
  const el = document.createElement('div')
  pills.forEach(p => el.appendChild(p))
  return { current: el }
}

beforeEach(() => {
  MockResizeObserver.instances = []
  global.ResizeObserver = MockResizeObserver
})

describe('useTagRowOverflow', () => {
  it("reports every child visible and the first child's height when all share the first row's offsetTop", () => {
    const ref = makeRow([
      makePill({ offsetTop: 0, height: 44 }),
      makePill({ offsetTop: 0, height: 44 }),
      makePill({ offsetTop: 0, height: 44 }),
    ])
    const { result } = renderHook(() => useTagRowOverflow(ref, 'a'))
    expect(result.current.visibleCount).toBe(3)
    expect(result.current.rowHeight).toBe(44)
  })

  it('excludes children that wrapped to a second row (larger offsetTop) from visibleCount', () => {
    const ref = makeRow([
      makePill({ offsetTop: 0, height: 44 }),
      makePill({ offsetTop: 0, height: 44 }),
      makePill({ offsetTop: 52, height: 44 }),
    ])
    const { result } = renderHook(() => useTagRowOverflow(ref, 'a'))
    expect(result.current.visibleCount).toBe(2)
  })

  it('negative: does nothing when ref.current is null', () => {
    const ref = { current: null }
    expect(() => renderHook(() => useTagRowOverflow(ref, 'a'))).not.toThrow()
  })

  it('negative: keeps the Infinity/null defaults when the row has no children yet', () => {
    const ref = makeRow([])
    const { result } = renderHook(() => useTagRowOverflow(ref, 'a'))
    expect(result.current.visibleCount).toBe(Infinity)
    expect(result.current.rowHeight).toBe(null)
  })

  it('recomputes when the observed element resizes (a wrapped pill now fits row 1)', () => {
    const ref = makeRow([
      makePill({ offsetTop: 0, height: 44 }),
      makePill({ offsetTop: 52, height: 44 }),
    ])
    const { result } = renderHook(() => useTagRowOverflow(ref, 'a'))
    expect(result.current.visibleCount).toBe(1)
    Object.defineProperty(ref.current.children[1], 'offsetTop', { value: 0, configurable: true })
    act(() => { MockResizeObserver.instances[0].callback() })
    expect(result.current.visibleCount).toBe(2)
  })

  it('recomputes when dep changes', () => {
    const ref = makeRow([makePill({ offsetTop: 0, height: 44 })])
    const { result, rerender } = renderHook(({ dep }) => useTagRowOverflow(ref, dep), {
      initialProps: { dep: 'a' },
    })
    expect(result.current.visibleCount).toBe(1)
    ref.current.appendChild(makePill({ offsetTop: 0, height: 44 }))
    rerender({ dep: 'b' })
    expect(result.current.visibleCount).toBe(2)
  })

  it('negative: disconnects the observer on unmount (no further recompute)', () => {
    const ref = makeRow([makePill({ offsetTop: 0, height: 44 })])
    const { unmount } = renderHook(() => useTagRowOverflow(ref, 'a'))
    unmount()
    expect(MockResizeObserver.instances[0].disconnected).toBe(true)
  })
})
```

**Note on the `dep` parameter (single scalar, not an array):** the plan originally specified `useTagRowOverflow(ref, deps = [])` with `[ref, ...deps]` as the effect's own dependency array. That's a real bug, not just a style choice — React's dependency comparison only checks indices up to `min(prevDeps.length, nextDeps.length)`, so a *spread, variable-length* array silently skips re-running the effect whenever the caller's `deps` array grows between renders (confirmed against `react-dom`'s `areHookInputsEqual` source during Task 2 implementation). The signature above (single scalar `dep`, effect deps always `[ref, dep]`) avoids the footgun entirely. If you are implementing from an older copy of this plan, use the signature in this note, not one with a spread array.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useTagRowOverflow.test.js`
Expected: FAIL with "Failed to resolve import ../useTagRowOverflow" (module doesn't exist yet).

- [ ] **Step 3: Write the hook**

Create `src/hooks/useTagRowOverflow.js`:

```js
import { useLayoutEffect, useState } from 'react'

// Measures a flex-wrap row of pills: how many children share the first
// row's offsetTop (children that wrapped to a later row have a larger
// offsetTop), and that first row's own rendered height. Both come from the
// real DOM rather than a hardcoded pixel constant, so the count and height
// stay correct across pill label length, locale, or OS/browser large-text
// scaling -- same "measure real DOM, don't guess" approach as
// useFitTileSize (issue #104), applied to counting instead of sizing.
export default function useTagRowOverflow(ref, dep) {
  const [state, setState] = useState({ visibleCount: Infinity, rowHeight: null })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const update = () => {
      const children = [...el.children]
      if (children.length === 0) return
      const firstRowTop = children[0].offsetTop
      const rowChildren = children.filter(child => child.offsetTop === firstRowTop)
      const rowHeight = rowChildren[0].getBoundingClientRect().height
      setState({ visibleCount: rowChildren.length, rowHeight })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, dep])

  return state
}
```

`dep` is a single caller-supplied value (not an array) that should change whenever the row's content changes — e.g. a joined string of the current tag list. **This is deliberate, not a simplification:** React's dependency-array comparison (`areHookInputsEqual`) only checks indices up to `min(prevDeps.length, nextDeps.length)`, so a *spread, variable-length* array (`[ref, ...deps]`) silently skips re-running the effect whenever `deps` grows between renders — a real bug, not a hypothetical. A single scalar dependency avoids it entirely since the effect's own deps array is always exactly `[ref, dep]`, constant length. Task 3's `TagFilterBar` must call this as `useTagRowOverflow(rowRef, orderedTags.join('|'))` — a single string, not `[orderedTags.join('|')]`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useTagRowOverflow.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTagRowOverflow.js src/hooks/__tests__/useTagRowOverflow.test.js
git commit -m "feat(103): add useTagRowOverflow hook for tag pill row collapse"
```

---

### Task 3: `TagFilterBar` component

**Files:**
- Create: `src/components/TagFilterBar.jsx`
- Create: `src/components/TagFilterBar.css`
- Test: `src/components/__tests__/TagFilterBar.test.jsx`

**Interfaces:**
- Consumes: `useTagRowOverflow(ref, deps) => { visibleCount, rowHeight }` (Task 2).
- Produces: `<TagFilterBar tags={string[]} selectedTags={Set<string>} onToggleTag={(tag: string) => void} tagLabel={(tag: string) => string} />` — consumed by Task 4's `Dashboard.jsx`. Renders `null` when `tags` is empty.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/TagFilterBar.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TagFilterBar from '../TagFilterBar'

const mockOverflow = { visibleCount: Infinity, rowHeight: null }
vi.mock('../../hooks/useTagRowOverflow', () => ({
  default: () => mockOverflow,
}))

const tagLabel = tag => tag.charAt(0).toUpperCase() + tag.slice(1)

beforeEach(() => {
  mockOverflow.visibleCount = Infinity
  mockOverflow.rowHeight = null
})

describe('TagFilterBar', () => {
  it('renders nothing when tags is empty', () => {
    const { container } = render(
      <TagFilterBar tags={[]} selectedTags={new Set()} onToggleTag={() => {}} tagLabel={tagLabel} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a toggle button per tag with aria-pressed reflecting selection', () => {
    render(
      <TagFilterBar
        tags={['sounds', 'visual']}
        selectedTags={new Set(['sounds'])}
        onToggleTag={() => {}}
        tagLabel={tagLabel}
      />
    )
    expect(screen.getByRole('button', { name: 'Sounds' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Visual' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onToggleTag with the clicked tag', async () => {
    const user = userEvent.setup()
    const onToggleTag = vi.fn()
    render(
      <TagFilterBar tags={['sounds']} selectedTags={new Set()} onToggleTag={onToggleTag} tagLabel={tagLabel} />
    )
    await user.click(screen.getByRole('button', { name: 'Sounds' }))
    expect(onToggleTag).toHaveBeenCalledWith('sounds')
  })

  it('sorts selected tags to the front of the list', () => {
    render(
      <TagFilterBar
        tags={['animals', 'sounds', 'visual']}
        selectedTags={new Set(['visual'])}
        onToggleTag={() => {}}
        tagLabel={tagLabel}
      />
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons.map(b => b.textContent)).toEqual(['Visual', 'Animals', 'Sounds'])
  })

  it('shows a "+N more" toggle when the row reports hidden tags', () => {
    mockOverflow.visibleCount = 2
    mockOverflow.rowHeight = 44
    render(
      <TagFilterBar
        tags={['animals', 'sounds', 'visual']}
        selectedTags={new Set()}
        onToggleTag={() => {}}
        tagLabel={tagLabel}
      />
    )
    expect(screen.getByRole('button', { name: '+1 more' })).toBeInTheDocument()
  })

  it('expands to show all tags and switches to "Show less" when the toggle is clicked', async () => {
    mockOverflow.visibleCount = 2
    mockOverflow.rowHeight = 44
    const user = userEvent.setup()
    render(
      <TagFilterBar
        tags={['animals', 'sounds', 'visual']}
        selectedTags={new Set()}
        onToggleTag={() => {}}
        tagLabel={tagLabel}
      />
    )
    await user.click(screen.getByRole('button', { name: '+1 more' }))
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument()
  })

  it('negative: does not render a more/less toggle when nothing is hidden', () => {
    mockOverflow.visibleCount = 3
    mockOverflow.rowHeight = 44
    render(
      <TagFilterBar
        tags={['animals', 'sounds', 'visual']}
        selectedTags={new Set()}
        onToggleTag={() => {}}
        tagLabel={tagLabel}
      />
    )
    expect(screen.queryByText(/more/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/show less/i)).not.toBeInTheDocument()
  })

  it('groups the pills under a labeled role="group", not role="tablist"', () => {
    render(
      <TagFilterBar tags={['sounds']} selectedTags={new Set()} onToggleTag={() => {}} tagLabel={tagLabel} />
    )
    expect(screen.getByRole('group', { name: 'Filter games by category' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/TagFilterBar.test.jsx`
Expected: FAIL with "Failed to resolve import ../TagFilterBar" (component doesn't exist yet).

- [ ] **Step 3: Write the component**

Create `src/components/TagFilterBar.jsx`:

```jsx
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useTagRowOverflow from '../hooks/useTagRowOverflow'
import './TagFilterBar.css'

export default function TagFilterBar({ tags, selectedTags, onToggleTag, tagLabel }) {
  const { t } = useTranslation()
  const rowRef = useRef(null)
  const [expanded, setExpanded] = useState(false)

  const orderedTags = useMemo(
    () => [
      ...tags.filter(tag => selectedTags.has(tag)),
      ...tags.filter(tag => !selectedTags.has(tag)),
    ],
    [tags, selectedTags]
  )

  const { visibleCount, rowHeight } = useTagRowOverflow(rowRef, orderedTags.join('|'))
  const hiddenCount = Math.max(0, orderedTags.length - visibleCount)

  if (tags.length === 0) return null

  return (
    <div className="tag-filter-bar">
      <div
        ref={rowRef}
        role="group"
        aria-label={t('dashboard.tagsGroupLabel')}
        className="tag-filter-bar__row"
        style={!expanded && rowHeight ? { maxHeight: rowHeight, overflow: 'hidden' } : undefined}
      >
        {orderedTags.map(tag => (
          <button
            key={tag}
            type="button"
            aria-pressed={selectedTags.has(tag)}
            className={`dashboard__tab${selectedTags.has(tag) ? ' dashboard__tab--active' : ''}`}
            onClick={() => onToggleTag(tag)}
          >
            {tagLabel(tag)}
          </button>
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          className="tag-filter-bar__toggle"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? t('dashboard.showLessTags') : t('dashboard.moreTags', { count: hiddenCount })}
        </button>
      )}
    </div>
  )
}
```

Create `src/components/TagFilterBar.css`:

```css
.tag-filter-bar {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 24px;
}

.tag-filter-bar__row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-filter-bar__toggle {
  min-width: auto;
  min-height: auto;
  padding: 6px 12px;
  border: none;
  background: transparent;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-lavender-dark);
  text-decoration: underline;
  cursor: pointer;
}

.tag-filter-bar__toggle:focus { outline: none; }
.tag-filter-bar__toggle:focus-visible {
  outline: 3px solid var(--color-lavender);
  outline-offset: 3px;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/TagFilterBar.test.jsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/TagFilterBar.jsx src/components/TagFilterBar.css src/components/__tests__/TagFilterBar.test.jsx
git commit -m "feat(103): add TagFilterBar multi-select pill component"
```

---

### Task 4: Rewrite `Dashboard.jsx` — search, multi-select state, wiring

**Files:**
- Modify: `src/components/Dashboard.jsx` (full rewrite)
- Modify: `src/components/Dashboard.css`
- Modify: `src/components/__tests__/Dashboard.test.jsx` (full rewrite)
- Modify: `src/i18n/en.json`, `es.json`, `pl.json` (remove now-dead `tabAll`/`tabsLabel` keys)

**Interfaces:**
- Consumes: `TagFilterBar` (Task 3), `useTagRowOverflow` indirectly via `TagFilterBar`, `useGameTags(manifests) => { tagMap, allTags }` (unchanged, existing).
- Produces: no new exports — `Dashboard` remains the default export with the same `{ manifests }` prop contract.

- [ ] **Step 1: Rewrite the test file first (defines the new contract)**

Replace `src/components/__tests__/Dashboard.test.jsx` in full:

```jsx
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import userEvent from '@testing-library/user-event'
import Dashboard from '../Dashboard'

vi.mock('../../hooks/useScores', () => ({
  default: () => ({
    getBestScore: (gameId) => gameId === 'animal-sounds' ? 7 : 3,
    getScoresByGame: () => [],
    scores: [],
    getAllScores: () => [],
  }),
}))

const mockSettings = { childName: '' }

vi.mock('../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings }),
}))

const TODAY = new Date(); TODAY.setHours(12, 0, 0, 0)
const mockRecentlyPlayed = new Map()
vi.mock('../../hooks/useRecentlyPlayed', () => ({
  default: () => mockRecentlyPlayed,
}))

vi.mock('../../hooks/useFeaturedGame', () => ({
  default: (manifests) => manifests[0] ?? null,
}))

vi.mock('../../hooks/useGameTags', () => ({
  default: (manifests) => {
    const tagMap = new Map(manifests.map(m => [m.id, m.tags ?? []]))
    const allTagsSet = new Set(manifests.flatMap(m => m.tags ?? []))
    return { tagMap, allTags: [...allTagsSet].sort() }
  },
}))

const manifests = [
  { id: 'animal-sounds', nameKey: 'animalSounds.manifestName', descriptionKey: 'animalSounds.manifestDescription', icon: '🐘', color: '#B39DDB', tags: ['sounds', 'animals'] },
  { id: 'color-match',   nameKey: 'colorMatch.manifestName',   descriptionKey: 'colorMatch.manifestDescription',   icon: '🎨', color: '#CE93D8', tags: ['visual', 'colors'] },
  { id: 'character-match', nameKey: 'characterMatch.manifestName', descriptionKey: 'characterMatch.manifestDescription', icon: '🎭', color: '#90CAF9', tags: ['visual', 'characters'] },
]

describe('Dashboard', () => {
  it('renders one card per manifest', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    const animalSoundsCards = screen.getAllByRole('link', { name: /animal sounds/i })
    const colorMatchCards = screen.getAllByRole('link', { name: /color match/i })
    expect(animalSoundsCards.length).toBeGreaterThan(0)
    expect(colorMatchCards.length).toBeGreaterThan(0)
  })

  it('renders empty state when no manifests', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.getByText(/no games/i)).toBeInTheDocument()
  })

  it('shows the default title when no child name is set', () => {
    mockSettings.childName = ''
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText("🌊 My Playground")).toBeInTheDocument()
  })

  it('shows a personalized title when a child name is set', () => {
    mockSettings.childName = 'Mia'
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText("🌊 Mia's Playground")).toBeInTheDocument()
    mockSettings.childName = ''
  })

  it('shows recently-played badge for a game with recent play data', () => {
    mockRecentlyPlayed.set('color-match', { lastPlayed: TODAY, playCount: 3 })
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByTestId('recently-played-badge')).toBeInTheDocument()
    expect(screen.getByTestId('recently-played-badge')).toHaveTextContent('Today')
    mockRecentlyPlayed.clear()
  })

  it('renders FeaturedGameCard above the grid', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByText(/Today's Game/i)).toBeInTheDocument()
  })

  it('does not render FeaturedGameCard when manifests is empty', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.queryByText(/Today's Game/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders a labeled search input', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('searchbox', { name: 'Search games' })).toBeInTheDocument()
  })

  it('renders a toggle pill for each tag when allTags is non-empty, with no "All" pill', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Sounds' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Visual' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('no tags are selected by default', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Sounds' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders CategorySection headings in the unfiltered view', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /visual/i })).toBeInTheDocument()
  })

  it('includes the featured game inside its own category section in the unfiltered view', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    const soundsSection = screen.getByRole('heading', { name: /sounds/i }).closest('section')
    expect(soundsSection).not.toBeNull()
    expect(within(soundsSection).getByText('Animal Sounds')).toBeInTheDocument()
  })

  it('clicking a tag pill filters the grid to matching games (leaves sections view)', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Sounds' }))
    expect(screen.getByRole('button', { name: 'Sounds' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('Animal Sounds')).toHaveLength(2) // banner + grid card
    expect(screen.queryByText('Color Match')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /visual/i })).not.toBeInTheDocument()
  })

  it('selecting two tags combines with AND (game must carry both)', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Visual' }))
    await user.click(screen.getByRole('button', { name: 'Colors' }))
    expect(screen.getByText('Color Match')).toBeInTheDocument()
    expect(screen.queryByText('Character Match')).not.toBeInTheDocument()
  })

  it('clicking a selected tag pill again deselects it', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Sounds' }))
    await user.click(screen.getByRole('button', { name: 'Sounds' }))
    expect(screen.getByRole('button', { name: 'Sounds' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Color Match')).toBeInTheDocument()
  })

  it('searching by name filters the grid (positive match)', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.type(screen.getByRole('searchbox'), 'animal')
    expect(screen.getAllByText('Animal Sounds').length).toBeGreaterThan(0)
    expect(screen.queryByText('Color Match')).not.toBeInTheDocument()
  })

  it('searching with no match shows the no-results empty state (negative)', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.type(screen.getByRole('searchbox'), 'zzz-nonexistent')
    expect(screen.getByText(/no games match your filters/i)).toBeInTheDocument()
  })

  it('search narrows which tag pills are shown to tags present among matches', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.type(screen.getByRole('searchbox'), 'animal')
    expect(screen.getByRole('button', { name: 'Sounds' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Colors' })).not.toBeInTheDocument()
  })

  it('search text and a selected tag combine with AND', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.type(screen.getByRole('searchbox'), 'match')
    await user.click(screen.getByRole('button', { name: 'Colors' }))
    expect(screen.getByText('Color Match')).toBeInTheDocument()
    expect(screen.queryByText('Character Match')).not.toBeInTheDocument()
  })

  it('Clear filters resets both search text and selected tags', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.type(screen.getByRole('searchbox'), 'animal')
    await user.click(screen.getByRole('button', { name: 'Sounds' }))
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Sounds' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Color Match')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /visual/i })).toBeInTheDocument()
  })

  it('announces the result count while a filter is active', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Sounds' }))
    expect(screen.getByRole('status')).toHaveTextContent('1 game found')
  })

  it('negative: does not show a Clear filters button or result count in the unfiltered view', () => {
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the featured banner visible on a filtered tag', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Sounds' }))
    expect(screen.getByText(/Today's Game/i)).toBeInTheDocument()
  })

  it('keeps the featured banner visible even on a tag that does not match the featured game', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Colors' }))
    expect(screen.getByText(/Today's Game/i)).toBeInTheDocument()
    expect(screen.getAllByText('Animal Sounds')).toHaveLength(1)
  })

  it('does not render the featured banner on any filter state when manifests is empty', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.queryByText(/Today's Game/i)).not.toBeInTheDocument()
  })

  it('renders a translated label for a known tag instead of just capitalizing the slug', () => {
    const testManifests = [{ id: 'a', nameKey: 'a.name', descriptionKey: 'a.description', icon: '🎈', color: '#fff', tags: ['sounds'] }]
    render(<MemoryRouter><Dashboard manifests={testManifests} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /sounds/i })).toBeInTheDocument()
  })

  it('falls back to a capitalized slug for a tag with no translation entry', () => {
    const testManifests = [{ id: 'a', nameKey: 'a.name', descriptionKey: 'a.description', icon: '🎈', color: '#fff', tags: ['xyz-custom'] }]
    render(<MemoryRouter><Dashboard manifests={testManifests} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /xyz-custom/i })).toBeInTheDocument()
  })

  it('moves focus to the page title on mount', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails against the old Dashboard.jsx**

Run: `npx vitest run src/components/__tests__/Dashboard.test.jsx`
Expected: FAIL — multiple tests fail (`role="searchbox"` not found, `role="button", name: "Sounds"` not found because it's still `role="tab"`, etc.)

- [ ] **Step 3: Rewrite `Dashboard.jsx`**

Replace `src/components/Dashboard.jsx` in full:

```jsx
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GameCard from './GameCard'
import FeaturedGameCard from './FeaturedGameCard'
import CategorySection from './CategorySection'
import TagFilterBar from './TagFilterBar'
import useScores from '../hooks/useScores'
import useSettings from '../hooks/useSettings'
import useRecentlyPlayed from '../hooks/useRecentlyPlayed'
import useFeaturedGame from '../hooks/useFeaturedGame'
import useGameTags from '../hooks/useGameTags'
import useFocusOnMount from '../hooks/useFocusOnMount'
import './Dashboard.css'

const TAG_ICONS = {
  sounds:     '🔊',
  visual:     '👁️',
  numbers:    '🔢',
  animals:    '🐾',
  colors:     '🎨',
  characters: '🎭',
}

function tagLabel(tag, t) {
  return t(`dashboard.tag.${tag}`, { defaultValue: tag.charAt(0).toUpperCase() + tag.slice(1) })
}

function buildSections(manifests, tagMap, allTags, t) {
  const sections = []
  for (const tag of allTags) {
    const games = manifests.filter(m => (tagMap.get(m.id) ?? []).includes(tag))
    if (games.length > 0) {
      const icon = TAG_ICONS[tag] ?? ''
      const label = `${icon} ${tagLabel(tag, t)}`.trim()
      sections.push({ heading: label, games })
    }
  }
  const untagged = manifests.filter(m => (tagMap.get(m.id) ?? []).length === 0)
  if (untagged.length > 0) {
    sections.push({ heading: t('dashboard.categoryOther'), games: untagged })
  }
  return sections
}

export default function Dashboard({ manifests = [] }) {
  const { t } = useTranslation()
  const { getBestScore } = useScores()
  const { settings } = useSettings()
  const recentlyPlayed = useRecentlyPlayed()
  const featured = useFeaturedGame(manifests)
  const { tagMap, allTags } = useGameTags(manifests)
  const [searchText, setSearchText] = useState('')
  const [selectedTags, setSelectedTags] = useState(() => new Set())
  const titleRef = useFocusOnMount()

  const name = settings.childName?.trim()
  const title = name ? t('dashboard.titleNamed', { name }) : t('dashboard.titleDefault')

  const normalizedSearch = searchText.trim().toLowerCase()

  const searchMatches = useMemo(
    () => manifests.filter(m =>
      normalizedSearch === '' || t(m.nameKey).toLowerCase().includes(normalizedSearch)
    ),
    [manifests, normalizedSearch, t]
  )

  const visibleTags = useMemo(() => {
    const tagSet = new Set()
    for (const m of searchMatches) {
      for (const tag of tagMap.get(m.id) ?? []) tagSet.add(tag)
    }
    return allTags.filter(tag => tagSet.has(tag))
  }, [searchMatches, tagMap, allTags])

  const isFiltering = normalizedSearch !== '' || selectedTags.size > 0

  const filteredManifests = isFiltering
    ? searchMatches.filter(m => {
        const tags = tagMap.get(m.id) ?? []
        return [...selectedTags].every(tag => tags.includes(tag))
      })
    : manifests

  const sections = isFiltering ? null : buildSections(manifests, tagMap, allTags, t)

  function toggleTag(tag) {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  function clearFilters() {
    setSearchText('')
    setSelectedTags(new Set())
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title" tabIndex={-1} ref={titleRef}>🌊 {title}</h1>
      </div>

      <FeaturedGameCard manifest={featured} />

      {manifests.length === 0 ? (
        <p className="dashboard__empty">{t('dashboard.empty')}</p>
      ) : (
        <>
          <div className="dashboard__search">
            <label htmlFor="dashboard-search" className="sr-only">
              {t('dashboard.searchLabel')}
            </label>
            <input
              id="dashboard-search"
              type="search"
              className="dashboard__search-input"
              placeholder={t('dashboard.searchPlaceholder')}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </div>

          <TagFilterBar
            tags={visibleTags}
            selectedTags={selectedTags}
            onToggleTag={toggleTag}
            tagLabel={tag => tagLabel(tag, t)}
          />

          {isFiltering && (
            <div className="dashboard__filter-status">
              <span role="status">{t('dashboard.resultsCount', { count: filteredManifests.length })}</span>
              <button type="button" className="dashboard__clear-filters" onClick={clearFilters}>
                {t('dashboard.clearFilters')}
              </button>
            </div>
          )}

          {sections ? (
            <div className="dashboard__sections">
              {sections.map(({ heading, games }) => (
                <CategorySection key={heading} heading={heading}>
                  {games.map(m => (
                    <GameCard
                      key={m.id}
                      manifest={m}
                      bestScore={getBestScore(m.id)}
                      recentInfo={recentlyPlayed.get(m.id) ?? null}
                    />
                  ))}
                </CategorySection>
              ))}
            </div>
          ) : filteredManifests.length === 0 ? (
            <p className="dashboard__empty">{t('dashboard.noResults')}</p>
          ) : (
            <div className="dashboard__grid">
              {filteredManifests.map(m => (
                <GameCard
                  key={m.id}
                  manifest={m}
                  bestScore={getBestScore(m.id)}
                  recentInfo={recentlyPlayed.get(m.id) ?? null}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Update `Dashboard.css`**

In `src/components/Dashboard.css`, delete the now-unused `.dashboard__tabs` rule (the old tablist wrapper — replaced by `TagFilterBar`'s own `.tag-filter-bar__row`):

```css
.dashboard__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 24px;
}

```

Delete that whole block (keep every other rule — `.dashboard__tab`, `.dashboard__tab--active`, the hover-specificity-fix block, and the focus rules all stay unchanged, since `TagFilterBar` reuses those same class names).

Then append these new rules at the end of the file:

```css

.dashboard__search { margin-bottom: 16px; }

.dashboard__search-input {
  width: 100%;
  max-width: 360px;
  padding: 10px 16px;
  border-radius: var(--radius-button);
  border: 2px solid rgb(0 0 0 / 12%);
  font-size: 1rem;
  font-family: var(--font-main);
}

.dashboard__search-input:focus { outline: none; }
.dashboard__search-input:focus-visible {
  outline: 3px solid var(--color-lavender);
  outline-offset: 3px;
}

.dashboard__filter-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.dashboard__clear-filters {
  min-width: auto;
  min-height: auto;
  padding: 6px 16px;
  border-radius: var(--radius-button);
  border: 2px solid rgb(0 0 0 / 12%);
  background: transparent;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-lavender-dark);
  cursor: pointer;
}

.dashboard__clear-filters:focus { outline: none; }
.dashboard__clear-filters:focus-visible {
  outline: 3px solid var(--color-lavender);
  outline-offset: 3px;
}
```

- [ ] **Step 5: Remove the now-dead `tabAll`/`tabsLabel` keys from all three locale files**

In `src/i18n/en.json`, within the `dashboard` block, delete these two lines:

```json
    "tabAll": "All",
    "tabsLabel": "Filter games by category",
```

In `src/i18n/es.json`, within the `dashboard` block, delete:

```json
    "tabAll": "Todos",
    "tabsLabel": "Filtrar juegos por categoría",
```

In `src/i18n/pl.json`, within the `dashboard` block, delete:

```json
    "tabAll": "Wszystkie",
    "tabsLabel": "Filtruj gry według kategorii",
```

- [ ] **Step 6: Run the Dashboard and i18n test suites**

Run: `npx vitest run src/components/__tests__/Dashboard.test.jsx src/i18n/__tests__/i18n.test.js`
Expected: PASS (all Dashboard tests green; i18n parity still holds since `tabAll`/`tabsLabel` were removed from all three locales together)

- [ ] **Step 7: Run the full unit test suite and lint to catch any other consumer of the removed keys/markup**

Run: `npx vitest run && npm run lint`
Expected: PASS. (`grep -rn "tabAll\|dashboard.tabsLabel" src` was already confirmed empty of other consumers during planning — this step is the safety net.)

- [ ] **Step 8: Commit**

```bash
git add src/components/Dashboard.jsx src/components/Dashboard.css src/components/__tests__/Dashboard.test.jsx src/i18n/en.json src/i18n/es.json src/i18n/pl.json
git commit -m "feat(103): redesign dashboard filter to name search + multi-select tags"
```

---

### Task 5: Update `e2e/dashboard.spec.js` for the new roles and behavior

**Files:**
- Modify: `e2e/dashboard.spec.js` (full rewrite)

**Interfaces:**
- Consumes: the running app's real `Dashboard`/`TagFilterBar` (Task 4) against real seeded games (`animal-sounds` tag `sounds`, `color-match` tags `visual`+`colors`, per the real manifests in `src/games/`).

- [ ] **Step 1: Rewrite the spec file**

Replace `e2e/dashboard.spec.js` in full:

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('dashboard shows both game cards and the settings link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Animal Sounds').first()).toBeVisible()
  await expect(page.getByText('Color Match').first()).toBeVisible()
  await expect(page.locator('a[href="/admin"]')).toHaveAttribute('href', '/admin')
})

test('dashboard has no accessibility violations', async ({ page }) => {
  // Settle the shell's route-entry fade-in (opacity 0→1 over ~200ms) before
  // scanning: mid-fade, .game-card__desc's own resting opacity (0.75)
  // compounds with the animation's transient opacity, so an axe scan taken
  // immediately after goto() can catch a real-but-momentary sub-4.5:1 frame
  // that isn't present once the page settles. Disabling reduced motion here
  // uses the same prefers-reduced-motion gate the animation itself respects.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('featured hero card is visible on dashboard load', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText("Today's Game")).toBeVisible()
})

test('featured hero card navigates to the game on click', async ({ page }) => {
  await page.goto('/')
  const heroLink = page.locator('.featured-card')
  const href = await heroLink.getAttribute('href')
  await heroLink.click()
  await expect(page).toHaveURL(href)
})

test('tag pills appear and filter the grid', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sounds' })).toBeVisible()
  await page.getByRole('button', { name: 'Sounds' }).click()
  await expect(page.getByRole('button', { name: 'Sounds' })).toHaveAttribute('aria-pressed', 'true')
  // Scope to the grid (not the always-visible featured banner, which may show
  // either game regardless of the active filter) to check what the filter actually did.
  const grid = page.locator('.dashboard__grid')
  await expect(grid.getByText('Animal Sounds')).toBeVisible()
  await expect(grid.getByText('Color Match')).not.toBeVisible()
})

test('deselecting the only active tag pill restores the full sectioned view', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sounds' }).click()
  await page.getByRole('button', { name: 'Sounds' }).click()
  // Color Match carries two tags ("visual" and "colors"), so in the unfiltered view it
  // legitimately renders once per matching category section (see Dashboard.jsx's
  // buildSections). .first() just confirms the sectioned view is restored, not that
  // there's exactly one card.
  await expect(page.getByText('Color Match').first()).toBeVisible()
})

test('Clear filters resets search text and selected tags', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('searchbox').fill('animal')
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByRole('searchbox')).toHaveValue('')
  await expect(page.getByText('Color Match').first()).toBeVisible()
})

test('searching by name filters the grid to matching games', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('searchbox').fill('animal')
  const grid = page.locator('.dashboard__grid')
  await expect(grid.getByText('Animal Sounds')).toBeVisible()
  await expect(grid.getByText('Color Match')).not.toBeVisible()
})

test('recently-played badge appears for a game with seeded scores', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    // Seed scores for both games rather than a single hardcoded gameId: the
    // dashboard's "Today's Game" banner always shows the featured game (see
    // Dashboard.jsx), but that banner card itself never renders a
    // recently-played badge — only the matching GameCard in the grid/section
    // does. Seeding both games guarantees at least one badge-bearing grid
    // card is visible regardless of which game is featured today.
    const today = new Date().toISOString().split('T')[0]
    const scores = [
      { gameId: 'animal-sounds', score: 8, total: 10, date: today, timestamp: Date.now() },
      { gameId: 'color-match', score: 8, total: 10, date: today, timestamp: Date.now() },
    ]
    localStorage.setItem('playground_scores', JSON.stringify(scores))
  })
  await page.reload()
  await expect(page.getByTestId('recently-played-badge').first()).toBeVisible()
  await expect(page.getByTestId('recently-played-badge').first()).toHaveText(/today/i)
})

test('dashboard has no accessibility violations after enhancements', async ({ page }) => {
  // See the comment on the other a11y test above: settle the shell's
  // route-entry fade before scanning.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('an active tag pill keeps its solid background when hovered', async ({ page }) => {
  await page.goto('/')
  const soundsPill = page.getByRole('button', { name: 'Sounds' })
  await soundsPill.click()
  await soundsPill.hover()
  await page.waitForTimeout(200)
  await expect(soundsPill).toHaveCSS('background-color', 'rgb(106, 79, 163)')
  await expect(soundsPill).toHaveCSS('color', 'rgb(255, 255, 255)')
})

test('an inactive tag pill still shows the light hover tint, not the active color', async ({ page }) => {
  await page.goto('/')
  const animalsPill = page.getByRole('button', { name: 'Animals' })
  await animalsPill.hover()
  await page.waitForTimeout(200)
  await expect(animalsPill).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.05)')
})

test('active tag pill has no accessibility violations while hovered', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const soundsPill = page.getByRole('button', { name: 'Sounds' })
  await soundsPill.click()
  await soundsPill.hover()
  await page.waitForTimeout(200)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

- [ ] **Step 2: Run the e2e dashboard spec**

Run: `npx playwright test e2e/dashboard.spec.js`
Expected: PASS (13 tests). If `webServer` needs to boot the dev server fresh, allow extra time on first run.

- [ ] **Step 3: Commit**

```bash
git add e2e/dashboard.spec.js
git commit -m "test(103): update e2e dashboard spec for multi-select tag pills and search"
```

---

### Task 6: Regenerate Storybook visual-regression baselines

**Files:**
- Modify (generated, not hand-edited): `e2e/dashboard.spec.js-snapshots/*.png` or wherever `components-dashboard--default`/`components-dashboard--empty` baselines live (path is whatever Playwright's `toHaveScreenshot` already uses in this repo — do not guess it; let Playwright report/update the actual path).

**Interfaces:**
- Consumes: `Dashboard` (Task 4) rendered via `src/components/Dashboard.stories.jsx` (unchanged — its two manifests carry no `tags`, so `TagFilterBar` still renders nothing for them; only the new search input changes their screenshot).

- [ ] **Step 1: Run the visual-regression suite to see the current (expected) failures**

Run: `npx playwright test e2e/visual.spec.js -g "dashboard"`
Expected: FAIL for `visual: components-dashboard--default` and `visual: components-dashboard--empty` (new search input changes the rendered pixels vs. the old baseline). Other story IDs unaffected.

- [ ] **Step 2: Regenerate just the affected baselines**

Run: `npx playwright test e2e/visual.spec.js -g "dashboard" --update-snapshots`
Expected: exits 0, and `git status` shows exactly two modified `.png` files (the dashboard default/empty baselines) — no other snapshot changed.

- [ ] **Step 3: Visually review the diff before trusting it**

Open the two updated PNGs (e.g. via the Read tool, which can display images) and confirm the only change is the new search input appearing above the game grid — no unrelated layout shift.

- [ ] **Step 4: Run the full visual suite once to confirm nothing else regressed**

Run: `npx playwright test e2e/visual.spec.js`
Expected: PASS (all story IDs, including the two just-updated dashboard baselines)

- [ ] **Step 5: Commit**

```bash
git add -A e2e/**/*.png
git commit -m "test(103): regenerate dashboard visual-regression baselines for search input"
```

---

### Task 7: Docs — README, ENHANCEMENTS.md, CHANGELOG, version bump

**Files:**
- Modify: `README.md:43-46` (the "Game Categories & Tags" section)
- Modify: `docs/ENHANCEMENTS.md` (remove the AU-7 line)
- Modify: `CHANGELOG.md`
- Modify: `package.json:4`

**Interfaces:** none — documentation/metadata only.

- [ ] **Step 1: Rewrite the README's "Game Categories & Tags" section**

In `README.md`, replace:

```markdown
### Game Categories & Tags

Games are organized under category headings ("Sounds 🔊", "Visual 👁️", "Memory 🧠", etc.) on the dashboard. A tab strip at the top of the dashboard lets parents filter by category to see only games in a particular group. The "Today's Game" featured banner is unaffected by this filter and always stays at the top.
```

with:

```markdown
### Game Categories & Tags, Search

Games are organized under category headings ("Sounds 🔊", "Visual 👁️", "Memory 🧠", etc.) on the dashboard. A search box filters games by name, and a row of tag pills below it lets parents select one or more categories at once — a game must carry every selected tag to stay visible (e.g. "Visual" + "Colors" narrows to games tagged with both). Selected pills always sort to the front of the row so an active filter is never hidden; once there are more tags than fit on one line, the rest collapse behind a "+N more" toggle. A "Clear filters" button appears whenever search text or a tag is active, resetting both at once. The "Today's Game" featured banner is unaffected by any of this and always stays at the top.
```

- [ ] **Step 2: Remove the AU-7 entry from `docs/ENHANCEMENTS.md`**

In `docs/ENHANCEMENTS.md`, find and delete this line from the UX section:

```markdown
- **Honor the tap-target standard on the dashboard tab strip (AU-7)** — `.dashboard__tab` is ~33 px tall (`padding: 6px 16px`), which passes WCAG 2.5.8 but contradicts the README's "64×64 px minimum tap targets throughout" claim, on the home screen a child is most likely to be handling. Raise the strip to ≥44 px (regenerate visual baselines) — or, second-best, scope the README claim to child-facing game surfaces; the claim-vs-reality gap is the defect. (From `docs/accessibility_usability.md`.)
```

- [ ] **Step 3: Bump the version in `package.json`**

In `package.json`, change:

```json
  "version": "0.31.2",
```

to:

```json
  "version": "0.32.0",
```

- [ ] **Step 4: Add a CHANGELOG entry**

In `CHANGELOG.md`, insert a new section immediately after the `# Changelog` header/format line and before the existing `## [0.31.2]` entry:

```markdown

## [0.32.0] - 2026-07-21

### Added

- Dashboard game search (issue #103): a search box above the tag strip filters games by name as you type. Tag pills switched from single-select tabs to multi-select toggles (AND logic — a game must carry every selected tag), always sorting selected tags to the front of the row so an active filter is never hidden. Once there are more tags than fit on one line, the rest collapse behind a "+N more" toggle, driven by a new `useTagRowOverflow` hook that measures real rendered pill positions (`offsetTop`) rather than a hardcoded pixel count — same "measure real DOM, don't guess" approach as issue #104's `useFitTileSize`. A "Clear filters" action replaces the old standalone "All" tab. Tag pills also switched from `role="tab"`/`"tablist"` (which requires single selection) to `role="group"` + `aria-pressed` toggle buttons, the correct ARIA pattern for independent multi-select.

### Changed

- `docs/ENHANCEMENTS.md`'s AU-7 entry ("dashboard tab strip tap targets") removed — verified against a live render that `.dashboard__tab` is already 64×64px via the global `button` rule (present since project scaffold), not the ~33px the 2026-07-12 audit's padding-only arithmetic estimated. No CSS change was needed.
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs/ENHANCEMENTS.md CHANGELOG.md package.json
git commit -m "docs(103): update README, remove stale AU-7 entry, bump to 0.32.0"
```

---

## Self-Review Notes

- **Spec coverage:** state model (Task 4), overflow/collapse mechanism (Tasks 2-3), components/a11y (Tasks 3-4), i18n (Tasks 1, 4), testing (all tasks include their own test step; Task 5 covers e2e; Task 6 covers visual regression), docs (Task 7) — every design-doc section maps to a task.
- **Type consistency checked:** `useTagRowOverflow(ref, deps) => { visibleCount, rowHeight }` is the same shape in the hook (Task 2), its test, and `TagFilterBar`'s consumption (Task 3). `TagFilterBar` props (`tags`, `selectedTags`, `onToggleTag`, `tagLabel`) match between its own test (Task 3) and `Dashboard.jsx`'s usage (Task 4).
- **Known scope note:** the design doc originally sketched the "+N more" toggle as inline at the end of row 1; it's implemented here as a separate line below the row instead, to avoid the toggle button itself being counted as a flex child during row-1 measurement (a real circularity: adding it to the measured row would change what counts as "visible"). This preserves the approved UX contract (collapse to one row, expandable, selected tags never hidden) — it's a implementation-detail refinement, not a scope change.
