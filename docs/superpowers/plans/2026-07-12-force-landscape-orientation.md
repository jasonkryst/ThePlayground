# Force Landscape via Manifest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A game manifest can declare `"orientation": "landscape"`; the engine then blocks that game's route with an accessible rotate-prompt overlay whenever the layout is portrait, pauses the memory-session timer while blocked, announces the requirement on the intro slide, and badges the game on the dashboard. First adopter: Animal Memory Match. (Issue #62; spec: `docs/superpowers/specs/2026-07-12-force-landscape-design.md`.)

**Architecture:** A `useOrientation()` hook does hybrid detection (physical `screen.orientation` on coarse-pointer devices, `(orientation: landscape)` media query elsewhere). An `OrientationGate` component wraps the game route in `App.jsx`, renders an `OrientationOverlay` over the game content (which stays mounted, `inert` + `aria-hidden`), and publishes `{ blocked }` through `OrientationGateContext`; `useMemorySession` consumes the context to pause timing and ignore flips. Games opt in via manifest only — zero game wiring.

**Tech Stack:** React 18, Vite, Vitest + RTL + jest-axe (jsdom), Playwright + axe-core (e2e + visual regression), Storybook, i18next.

## Global Constraints

- **No hardcoded user-facing strings** — every string goes through i18n (`src/i18n/en.json` for core-engine strings; see `docs/TESTING.md` § i18n string convention).
- **Design tokens** — CSS uses `var(--color-*)` / `var(--radius-*)` from `src/index.css`, never raw hex. Stylelint enforces modern syntax (`rgb(0 0 0 / 10%)` form, if needed).
- **Reduced motion** — every animation is gated behind `@media (prefers-reduced-motion: ...)` like the rest of the app.
- **a11y** — every new component test file includes a `jest-axe` `toHaveNoViolations()` case; the inert/aria-hidden host pattern must match `AppShell`'s exit-dialog implementation (`setAttribute`, verifiable in jsdom).
- **Positive AND negative test cases** for every behavior (explicit user requirement).
- **Fake timers + `fireEvent`** (never `userEvent`) in any test using `vi.useFakeTimers()`; activate fake timers only after async setup that polls with real timers.
- **Commits:** conventional style scoped to the issue, e.g. `feat(62): ...`, `test(62): ...`, `docs(62): ...`.
- **Manifest field contract:** optional `orientation`; the only recognized value is `"landscape"`; absent or unrecognized ⇒ no enforcement anywhere (overlay, intro notice, card badge all absent).
- jsdom has **no** `window.matchMedia` and **no** `window.screen.orientation` — all orientation code must degrade to `'landscape'` (fail-open, never a stuck overlay) when APIs are missing, and tests install explicit mocks to exercise real behavior.

## Task overview (for the kickoff progress table)

| # | Task | Est. | Difficulty |
|---|------|------|------------|
| 1 | `useOrientation` hook + tests | 30 min | Medium (API mocking) |
| 2 | Overlay strings + `OrientationOverlay` component + story | 25 min | Easy |
| 3 | `OrientationGateContext` + `OrientationGate` + tests | 45 min | Medium (focus/inert) |
| 4 | `useMemorySession` pause + tests | 40 min | Medium (fake timers) |
| 5 | `GameIntro` landscape notice + memory game prop | 25 min | Easy |
| 6 | Dashboard card badges | 25 min | Easy |
| 7 | Engine wiring, manifest flag, e2e specs | 45 min | Medium (existing-test updates) |
| 8 | Visual-regression baselines | 15 min | Easy |
| 9 | Docs, changelog, version bumps, full verification | 30 min | Easy |

---

### Task 1: `useOrientation` hook

**Files:**
- Create: `src/hooks/useOrientation.js`
- Test: `src/hooks/__tests__/useOrientation.test.jsx`

**Interfaces:**
- Consumes: browser `window.matchMedia`, `window.screen.orientation` (both optional).
- Produces: `useOrientation()` (default export) → returns `'landscape' | 'portrait'`, live-updated on orientation/viewport change. Later tasks import it as `import useOrientation from '../hooks/useOrientation'`.

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useOrientation.test.jsx`:

```jsx
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import useOrientation from '../useOrientation'

// jsdom ships neither matchMedia nor screen.orientation, so each test
// installs exactly the API surface it wants and removes it afterwards.

function installMatchMedia({ coarse = false, landscape = true } = {}) {
  const state = { coarse, landscape }
  const listeners = new Set()
  window.matchMedia = query => ({
    get matches() {
      if (query === '(pointer: coarse)') return state.coarse
      if (query === '(orientation: landscape)') return state.landscape
      return false
    },
    media: query,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  })
  return {
    rotate(landscapeNow) {
      state.landscape = landscapeNow
      listeners.forEach(fn => fn())
    },
  }
}

function installScreenOrientation(initialType = 'landscape-primary') {
  const state = { type: initialType }
  const listeners = new Set()
  Object.defineProperty(window.screen, 'orientation', {
    configurable: true,
    value: {
      get type() { return state.type },
      addEventListener: (_type, fn) => listeners.add(fn),
      removeEventListener: (_type, fn) => listeners.delete(fn),
    },
  })
  return {
    change(newType) {
      state.type = newType
      listeners.forEach(fn => fn())
    },
  }
}

afterEach(() => {
  delete window.matchMedia
  delete window.screen.orientation
})

describe('useOrientation', () => {
  it('fine pointer: follows the (orientation: landscape) media query', () => {
    const media = installMatchMedia({ coarse: false, landscape: true })
    const { result } = renderHook(() => useOrientation())
    expect(result.current).toBe('landscape')
    act(() => media.rotate(false))
    expect(result.current).toBe('portrait')
    act(() => media.rotate(true))
    expect(result.current).toBe('landscape')
  })

  it('coarse pointer with screen.orientation: follows the physical device orientation', () => {
    installMatchMedia({ coarse: true, landscape: true })
    const device = installScreenOrientation('portrait-primary')
    const { result } = renderHook(() => useOrientation())
    expect(result.current).toBe('portrait')
    act(() => device.change('landscape-secondary'))
    expect(result.current).toBe('landscape')
  })

  it('coarse pointer WITHOUT screen.orientation falls back to the media query (negative)', () => {
    const media = installMatchMedia({ coarse: true, landscape: false })
    const { result } = renderHook(() => useOrientation())
    expect(result.current).toBe('portrait')
    act(() => media.rotate(true))
    expect(result.current).toBe('landscape')
  })

  it('no matchMedia at all degrades to landscape, never crashing (negative)', () => {
    const { result } = renderHook(() => useOrientation())
    expect(result.current).toBe('landscape')
  })

  it('unknown screen.orientation.type values degrade to landscape (negative)', () => {
    installMatchMedia({ coarse: true })
    installScreenOrientation('some-future-value')
    const { result } = renderHook(() => useOrientation())
    expect(result.current).toBe('landscape')
  })

  it('unsubscribes on unmount (no listener leak)', () => {
    const media = installMatchMedia({ coarse: false, landscape: true })
    const { unmount } = renderHook(() => useOrientation())
    unmount()
    expect(() => act(() => media.rotate(false))).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useOrientation.test.jsx`
Expected: FAIL — cannot resolve `../useOrientation`.

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useOrientation.js`:

```js
import { useState, useEffect } from 'react'

// Effective screen orientation for layout enforcement (issue #62).
// Hybrid detection: coarse-pointer (touch) devices report the physical
// device orientation via screen.orientation; desktop — and any browser
// without screen.orientation (older iOS Safari) — falls back to the
// viewport aspect ratio. Missing APIs degrade to 'landscape' so a broken
// environment can never strand the player behind the rotate overlay.

function isCoarsePointer() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches
}

function usesDeviceOrientation() {
  return isCoarsePointer() && typeof window.screen?.orientation?.type === 'string'
}

function getOrientation() {
  if (usesDeviceOrientation()) {
    return window.screen.orientation.type.startsWith('portrait') ? 'portrait' : 'landscape'
  }
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait'
  }
  return 'landscape'
}

export default function useOrientation() {
  const [orientation, setOrientation] = useState(getOrientation)

  useEffect(() => {
    const update = () => setOrientation(getOrientation())

    if (usesDeviceOrientation()) {
      window.screen.orientation.addEventListener('change', update)
      return () => window.screen.orientation.removeEventListener('change', update)
    }
    if (typeof window.matchMedia === 'function') {
      const mql = window.matchMedia('(orientation: landscape)')
      mql.addEventListener('change', update)
      return () => mql.removeEventListener('change', update)
    }
    return undefined
  }, [])

  return orientation
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useOrientation.test.jsx`
Expected: 6 passed.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/hooks/useOrientation.js src/hooks/__tests__/useOrientation.test.jsx
git commit -m "feat(62): useOrientation hook with hybrid device/viewport detection"
```

---

### Task 2: Overlay strings + `OrientationOverlay` component

**Files:**
- Modify: `src/i18n/en.json` (the `common` block)
- Create: `src/components/OrientationOverlay.jsx`
- Create: `src/components/OrientationOverlay.css`
- Create: `src/components/OrientationOverlay.stories.jsx`
- Test: `src/components/__tests__/OrientationOverlay.test.jsx`

**Interfaces:**
- Consumes: i18n keys `common.orientationOverlayHeading`, `common.orientationOverlayBody`.
- Produces: `<OrientationOverlay headingRef={ref} />` (default export) — a purely presentational full-area overlay. `headingRef` (optional React ref) attaches to the focusable `<h2 tabIndex={-1}>`. Renders `data-testid="orientation-overlay"` on its root and `role="alert"`. Task 3's gate renders it; the story exists so Task 8 can screenshot the overlay deterministically (the gate itself only shows it when the *test browser* is portrait, which Storybook isn't).

- [ ] **Step 1: Add the i18n strings**

In `src/i18n/en.json`, inside the existing `"common": { ... }` object, add (before the closing brace, comma-separated like its neighbors):

```json
    "orientationOverlayHeading": "Turn it sideways!",
    "orientationOverlayBody": "This game needs a wide screen. Turn your device to keep playing!"
```

- [ ] **Step 2: Write the failing tests**

Create `src/components/__tests__/OrientationOverlay.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { createRef } from 'react'
import { axe } from 'jest-axe'
import OrientationOverlay from '../OrientationOverlay'

describe('OrientationOverlay', () => {
  it('renders the rotate heading and body as an alert', () => {
    render(<OrientationOverlay />)
    expect(screen.getByTestId('orientation-overlay')).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('heading', { name: /turn it sideways/i })).toBeInTheDocument()
    expect(screen.getByText(/needs a wide screen/i)).toBeInTheDocument()
  })

  it('attaches headingRef to a programmatically focusable heading', () => {
    const ref = createRef()
    render(<OrientationOverlay headingRef={ref} />)
    expect(ref.current).toBe(screen.getByRole('heading', { name: /turn it sideways/i }))
    expect(ref.current).toHaveAttribute('tabindex', '-1')
  })

  it('hides the decorative icon from assistive tech', () => {
    render(<OrientationOverlay />)
    expect(screen.getByText('📱')).toHaveAttribute('aria-hidden', 'true')
  })

  it('works without a headingRef (negative)', () => {
    expect(() => render(<OrientationOverlay />)).not.toThrow()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<OrientationOverlay />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/components/__tests__/OrientationOverlay.test.jsx`
Expected: FAIL — cannot resolve `../OrientationOverlay`.

- [ ] **Step 4: Write the component and styles**

Create `src/components/OrientationOverlay.jsx`:

```jsx
import { useTranslation } from 'react-i18next'
import './OrientationOverlay.css'

// Presentational rotate prompt shown by OrientationGate when a game that
// requires landscape is viewed in portrait (issue #62). role="alert" makes
// its appearance announce immediately; the gate moves focus to the heading.
export default function OrientationOverlay({ headingRef }) {
  const { t } = useTranslation()

  return (
    <div className="orientation-overlay" role="alert" data-testid="orientation-overlay">
      <div className="orientation-overlay__icon" aria-hidden="true">📱</div>
      <h2 className="orientation-overlay__heading" tabIndex={-1} ref={headingRef}>
        {t('common.orientationOverlayHeading')}
      </h2>
      <p className="orientation-overlay__body">{t('common.orientationOverlayBody')}</p>
    </div>
  )
}
```

Create `src/components/OrientationOverlay.css`:

```css
/* Fills whatever positioned container the gate provides (inset: 0), with an
   opaque background so the broken portrait layout underneath never shows. */
.orientation-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  text-align: center;
  background: var(--color-bg);
}

.orientation-overlay__icon {
  font-size: 96px;
  line-height: 1;
}

.orientation-overlay__heading {
  font-size: 28px;
  font-weight: 800;
  margin: 0;
}

.orientation-overlay__heading:focus { outline: none; }

.orientation-overlay__body {
  font-size: 20px;
  opacity: 0.8;
  max-width: 480px;
  margin: 0;
}

/* Rock the phone glyph toward horizontal and back — a wordless hint for a
   pre-reading audience. Static for reduced-motion users. */
@media (prefers-reduced-motion: no-preference) {
  .orientation-overlay__icon {
    animation: orientation-overlay-rotate 2s ease-in-out infinite;
  }
}

@keyframes orientation-overlay-rotate {
  0%, 20%   { transform: rotate(0deg); }
  50%, 70%  { transform: rotate(90deg); }
  100%      { transform: rotate(0deg); }
}
```

Create `src/components/OrientationOverlay.stories.jsx`:

```jsx
import OrientationOverlay from './OrientationOverlay'

export default {
  title: 'Components/OrientationOverlay',
  component: OrientationOverlay,
  // The overlay positions absolutely against its gate container in the app;
  // give the story an equivalent positioned box so it has size to fill.
  decorators: [
    Story => (
      <div style={{ position: 'relative', height: '100vh' }}>
        <Story />
      </div>
    ),
  ],
}

export const Default = {}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/__tests__/OrientationOverlay.test.jsx`
Expected: 5 passed.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint && npm run lint:css
git add src/i18n/en.json src/components/OrientationOverlay.jsx src/components/OrientationOverlay.css src/components/OrientationOverlay.stories.jsx src/components/__tests__/OrientationOverlay.test.jsx
git commit -m "feat(62): OrientationOverlay rotate prompt component"
```

---

### Task 3: `OrientationGateContext` + `OrientationGate`

**Files:**
- Create: `src/components/OrientationGateContext.jsx`
- Create: `src/components/OrientationGate.jsx`
- Create: `src/components/OrientationGate.css`
- Test: `src/components/__tests__/OrientationGate.test.jsx`

**Interfaces:**
- Consumes: `useOrientation` (Task 1), `OrientationOverlay` (Task 2).
- Produces:
  - `OrientationGateContext` (named export) and `useOrientationGate()` (named export) → `{ blocked: boolean }`, default `{ blocked: false }`. Task 4 imports `useOrientationGate` from `'../components/OrientationGateContext'`.
  - `<OrientationGate orientation={manifest?.orientation}>{children}</OrientationGate>` (default export). Task 7 wires it into `App.jsx`.

- [ ] **Step 1: Write the context module**

Create `src/components/OrientationGateContext.jsx`:

```jsx
import { createContext, useContext } from 'react'

// Default is unblocked so session hooks work outside a gate (unit tests,
// Storybook, any future non-gated embedding). Mirrors ShellContext's
// safe-default pattern.
export const OrientationGateContext = createContext({ blocked: false })

// Whether an enclosing OrientationGate is currently blocking gameplay
// (wrong orientation for a game that requires one). Session hooks use this
// to pause timing and ignore input.
export function useOrientationGate() {
  return useContext(OrientationGateContext)
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/components/__tests__/OrientationGate.test.jsx`. Reuse the same `installMatchMedia` helper shape as Task 1 (repeated here so this file stands alone):

```jsx
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { axe } from 'jest-axe'
import OrientationGate from '../OrientationGate'
import { useOrientationGate } from '../OrientationGateContext'

function installMatchMedia({ coarse = false, landscape = true } = {}) {
  const state = { coarse, landscape }
  const listeners = new Set()
  window.matchMedia = query => ({
    get matches() {
      if (query === '(pointer: coarse)') return state.coarse
      if (query === '(orientation: landscape)') return state.landscape
      return false
    },
    media: query,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  })
  return {
    rotate(landscapeNow) {
      state.landscape = landscapeNow
      listeners.forEach(fn => fn())
    },
  }
}

afterEach(() => { delete window.matchMedia })

function BlockedProbe() {
  const { blocked } = useOrientationGate()
  return <span data-testid="blocked-probe">{String(blocked)}</span>
}

function renderGate(orientation) {
  return render(
    <OrientationGate orientation={orientation}>
      <button data-testid="game-button">flip</button>
      <BlockedProbe />
    </OrientationGate>
  )
}

describe('OrientationGate — no requirement (negative cases)', () => {
  it('renders children without any wrapper chrome and never blocks, even in portrait', () => {
    installMatchMedia({ landscape: false })
    renderGate(undefined)
    expect(screen.queryByTestId('orientation-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('blocked-probe')).toHaveTextContent('false')
    expect(screen.getByTestId('game-button')).toBeInTheDocument()
  })

  it('treats an unrecognized orientation value as no requirement', () => {
    installMatchMedia({ landscape: false })
    renderGate('diagonal')
    expect(screen.queryByTestId('orientation-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('blocked-probe')).toHaveTextContent('false')
  })
})

describe('OrientationGate — landscape required', () => {
  it('satisfied: no overlay, children not inert, context unblocked', () => {
    installMatchMedia({ landscape: true })
    renderGate('landscape')
    expect(screen.queryByTestId('orientation-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('blocked-probe')).toHaveTextContent('false')
    expect(screen.getByTestId('game-button').closest('[inert]')).toBeNull()
  })

  it('unsatisfied: overlay shown, content inert + aria-hidden, context blocked, heading focused', () => {
    installMatchMedia({ landscape: false })
    renderGate('landscape')
    expect(screen.getByTestId('orientation-overlay')).toBeInTheDocument()
    const content = screen.getByTestId('game-button').closest('.orientation-gate__content')
    expect(content).toHaveAttribute('inert')
    expect(content).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('blocked-probe')).toHaveTextContent('true')
    expect(screen.getByRole('heading', { name: /turn it sideways/i })).toHaveFocus()
  })

  it('rotating to landscape clears the overlay, un-inerts content, and restores focus', () => {
    const media = installMatchMedia({ landscape: true })
    renderGate('landscape')
    screen.getByTestId('game-button').focus()

    act(() => media.rotate(false))
    expect(screen.getByTestId('orientation-overlay')).toBeInTheDocument()

    act(() => media.rotate(true))
    expect(screen.queryByTestId('orientation-overlay')).not.toBeInTheDocument()
    const content = screen.getByTestId('game-button').closest('.orientation-gate__content')
    expect(content).not.toHaveAttribute('inert')
    expect(content).not.toHaveAttribute('aria-hidden')
    expect(screen.getByTestId('game-button')).toHaveFocus()
  })

  it('children stay mounted (state preserved) while blocked', () => {
    const media = installMatchMedia({ landscape: true })
    renderGate('landscape')
    const before = screen.getByTestId('game-button')
    act(() => media.rotate(false))
    expect(screen.getByTestId('game-button')).toBe(before)
  })

  it('has no accessibility violations while blocking', async () => {
    installMatchMedia({ landscape: false })
    const { container } = renderGate('landscape')
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/components/__tests__/OrientationGate.test.jsx`
Expected: FAIL — cannot resolve `../OrientationGate`.

- [ ] **Step 4: Write the gate component and styles**

Create `src/components/OrientationGate.jsx`:

```jsx
import { useEffect, useMemo, useRef } from 'react'
import useOrientation from '../hooks/useOrientation'
import { OrientationGateContext } from './OrientationGateContext'
import OrientationOverlay from './OrientationOverlay'
import './OrientationGate.css'

const RECOGNIZED_ORIENTATIONS = ['landscape']

// Engine-level enforcement for a manifest's `"orientation"` field (issue
// #62). Children (the game) stay mounted while blocked so game state
// survives a rotation; they're made inert + aria-hidden under the overlay
// using the same setAttribute pattern as AppShell's exit dialog. The shell
// header/footer live outside this component, so the home button stays
// usable while the overlay is up.
export default function OrientationGate({ orientation, children }) {
  const required = RECOGNIZED_ORIENTATIONS.includes(orientation) ? orientation : null
  const current  = useOrientation()
  const blocked  = required != null && current !== required

  const contentRef       = useRef(null)
  const headingRef       = useRef(null)
  const previousFocusRef = useRef(null)

  const contextValue = useMemo(() => ({ blocked }), [blocked])

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    if (blocked) {
      previousFocusRef.current = document.activeElement
      content.setAttribute('inert', '')
      content.setAttribute('aria-hidden', 'true')
      headingRef.current?.focus()
    } else {
      content.removeAttribute('inert')
      content.removeAttribute('aria-hidden')
      const previous = previousFocusRef.current
      previousFocusRef.current = null
      if (previous && previous !== document.body && document.contains(previous)) {
        previous.focus()
      }
    }
  }, [blocked])

  if (!required) {
    return (
      <OrientationGateContext.Provider value={contextValue}>
        {children}
      </OrientationGateContext.Provider>
    )
  }

  return (
    <OrientationGateContext.Provider value={contextValue}>
      <div className="orientation-gate">
        <div className="orientation-gate__content" ref={contentRef}>
          {children}
        </div>
        {blocked && <OrientationOverlay headingRef={headingRef} />}
      </div>
    </OrientationGateContext.Provider>
  )
}
```

Create `src/components/OrientationGate.css`:

```css
/* Both wrappers replicate .shell__content's flex column so the game's own
   `.game { flex: 1 }` layout behaves exactly as if the gate weren't there.
   position: relative anchors the absolutely-positioned overlay to the game
   content area only — the shell header/footer stay above/below it. */
.orientation-gate {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
}

.orientation-gate__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/__tests__/OrientationGate.test.jsx`
Expected: 7 passed. If the `aria-hidden-focus` axe rule fires on the blocking case, the `inert` attribute isn't being applied before axe runs — verify the effect ordering rather than suppressing the rule (AppShell's identical pattern passes).

- [ ] **Step 6: Lint and commit**

```bash
npm run lint && npm run lint:css
git add src/components/OrientationGateContext.jsx src/components/OrientationGate.jsx src/components/OrientationGate.css src/components/__tests__/OrientationGate.test.jsx
git commit -m "feat(62): OrientationGate engine component with blocking overlay and context"
```

---

### Task 4: `useMemorySession` pause while blocked

**Files:**
- Modify: `src/hooks/useMemorySession.js`
- Test (create): `src/hooks/__tests__/useMemorySession.pause.test.jsx`

**Interfaces:**
- Consumes: `useOrientationGate()` from `'../components/OrientationGateContext'` (Task 3).
- Produces: no API change — the hook's returned shape is untouched. Behavior change only: while an enclosing gate reports `blocked: true`, `flipTile` is a no-op, `currentElapsedMs` stops ticking, and blocked time is excluded from the saved `durationMs` (and therefore from fastest-board personal bests).

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useMemorySession.pause.test.jsx`. The mock preamble replicates `useMemorySession.test.js` (each test file must stand alone; `vi.mock` is per-file):

```jsx
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { OrientationGateContext } from '../../components/OrientationGateContext'

const { mockAddScore, mockGetSettings } = vi.hoisted(() => ({
  mockAddScore: vi.fn().mockResolvedValue(undefined),
  mockGetSettings: vi.fn(),
}))

vi.mock('../../storage/index', () => ({
  DEFAULT_SETTINGS: { memoryPairs: 5, animationsEnabled: true, soundEffectsEnabled: true, timerMode: 'countUp', introDismissed: {} },
  default: {
    getSettings: mockGetSettings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
    getScores: vi.fn().mockResolvedValue([]),
    addScore: mockAddScore,
    getBadgeData: vi.fn().mockResolvedValue({ awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} }),
    saveBadgeData: vi.fn().mockResolvedValue(undefined),
    getBestStreaks: vi.fn().mockResolvedValue({}),
    saveBestStreaks: vi.fn().mockResolvedValue(undefined),
    getPersonalBests: vi.fn().mockResolvedValue({}),
    savePersonalBests: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../lib/badges', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    GAME_BADGE_CATALOGS: { ...actual.GAME_BADGE_CATALOGS, 'test-memory': [] },
  }
})

vi.mock('../../lib/confetti', () => ({
  fireConfetti: vi.fn(),
  fireFireworks: vi.fn(),
  FIREWORKS_BURSTS: 6,
  FIREWORKS_INTERVAL_MS: 350,
}))

import useMemorySession from '../useMemorySession'

const ITEMS = [
  { id: 'dog' }, { id: 'cat' }, { id: 'cow' },
  { id: 'duck' }, { id: 'frog' }, { id: 'lion' },
]

const SETTINGS = {
  memoryPairs: 3, animationsEnabled: true, soundEffectsEnabled: true,
  timerMode: 'countUp', introDismissed: { 'test-memory': true },
}

function findPair(tiles) {
  const down = tiles.filter(t => t.state === 'down')
  for (const t of down) {
    const twin = down.find(o => o.itemId === t.itemId && o.tileId !== t.tileId)
    if (twin) return [t.tileId, twin.tileId]
  }
  return null
}

// Renders the hook inside a live OrientationGateContext whose blocked value
// tests can flip at will — simulating the gate without any matchMedia.
let setBlocked
function Wrapper({ children }) {
  const [blocked, set] = useState(false)
  setBlocked = set
  return (
    <OrientationGateContext.Provider value={{ blocked }}>
      {children}
    </OrientationGateContext.Provider>
  )
}

async function renderSession() {
  const hook = renderHook(
    () => useMemorySession({ gameId: 'test-memory', items: ITEMS }),
    { wrapper: Wrapper }
  )
  await waitFor(() => expect(hook.result.current.tiles.length).toBe(6))
  return hook
}

async function completeBoard(result) {
  for (let i = 0; i < 3; i++) {
    const pair = findPair(result.current.tiles)
    act(() => result.current.flipTile(pair[0]))
    act(() => result.current.flipTile(pair[1]))
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSettings.mockResolvedValue(SETTINGS)
})
afterEach(() => vi.useRealTimers())

describe('useMemorySession — orientation pause', () => {
  // NOTE: fake timers only AFTER renderSession() — its waitFor polls with
  // real timers (same caveat as useMemorySession.test.js).

  it('ignores flips while blocked, and accepts them again after unblocking', async () => {
    const { result } = await renderSession()
    const pair = findPair(result.current.tiles)

    act(() => setBlocked(true))
    act(() => result.current.flipTile(pair[0]))
    expect(result.current.tiles.every(t => t.state === 'down')).toBe(true)
    expect(result.current.flipAttempts).toBe(0)

    act(() => setBlocked(false))
    act(() => result.current.flipTile(pair[0]))
    act(() => result.current.flipTile(pair[1]))
    expect(result.current.pairsFound).toBe(1)
  })

  it('freezes the elapsed clock while blocked', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()

    act(() => vi.advanceTimersByTime(1000))
    const beforeBlock = result.current.currentElapsedMs
    expect(beforeBlock).toBeGreaterThanOrEqual(1000)

    act(() => setBlocked(true))
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.currentElapsedMs).toBe(beforeBlock)
  })

  it('excludes blocked time from the saved durationMs', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()

    act(() => vi.advanceTimersByTime(1000))
    act(() => setBlocked(true))
    act(() => vi.advanceTimersByTime(60_000))
    act(() => setBlocked(false))

    await completeBoard(result)
    await waitFor(() => expect(mockAddScore).toHaveBeenCalled())
    const { durationMs } = mockAddScore.mock.calls[0][0]
    expect(durationMs).toBeGreaterThanOrEqual(1000)
    expect(durationMs).toBeLessThan(10_000) // nowhere near the 60s block
  })

  it('negative: a never-blocked session counts time continuously', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()

    act(() => vi.advanceTimersByTime(2000))
    await completeBoard(result)
    await waitFor(() => expect(mockAddScore).toHaveBeenCalled())
    const { durationMs } = mockAddScore.mock.calls[0][0]
    expect(durationMs).toBeGreaterThanOrEqual(2000)
  })

  it('negative: blocking after completion does not corrupt the recorded duration', async () => {
    const { result } = await renderSession()
    vi.useFakeTimers()

    act(() => vi.advanceTimersByTime(1000))
    await completeBoard(result)
    await waitFor(() => expect(mockAddScore).toHaveBeenCalled())
    const recorded = mockAddScore.mock.calls[0][0].durationMs

    act(() => setBlocked(true))
    act(() => vi.advanceTimersByTime(5000))
    act(() => setBlocked(false))
    expect(mockAddScore).toHaveBeenCalledTimes(1)
    expect(mockAddScore.mock.calls[0][0].durationMs).toBe(recorded)
  })
})
```

The `completeBoard` + `waitFor(addScore)` pattern with fake timers: `waitFor` under fake timers is supported by RTL (it advances timers). If it hangs, use `await act(async () => { await vi.runOnlyPendingTimersAsync() })` then assert directly — the existing `useMemorySession.test.js` completion tests show the working idiom for this stack; mirror it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useMemorySession.pause.test.jsx`
Expected: FAIL — flips register while blocked, clock keeps ticking (no pause code exists yet).

- [ ] **Step 3: Implement the pause in `useMemorySession.js`**

Add the import at the top with the other hook imports:

```js
import { useOrientationGate } from '../components/OrientationGateContext'
```

Inside the hook, after the existing `useBadges()` line, read the gate:

```js
  const { blocked } = useOrientationGate()
```

With the other refs, add:

```js
  const blockedRef = useRef(false)
  const pausedAtRef = useRef(null)
```

Add the pause/resume effect (place it after the deck-building effect, before the tick-interval effect):

```js
  // Orientation-gate pause (issue #62): while the gate blocks play, freeze
  // the wall-clock baseline. Shifting startRef forward by the paused span on
  // resume keeps every derived figure (currentElapsedMs, durationMs, fastest-
  // board personal bests) honest with no other bookkeeping.
  useEffect(() => {
    blockedRef.current = blocked
    if (blocked) {
      pausedAtRef.current = Date.now()
    } else if (pausedAtRef.current != null) {
      startRef.current += Date.now() - pausedAtRef.current
      pausedAtRef.current = null
    }
  }, [blocked])
```

Change the tick-interval effect's guard (add `blocked` to both the condition and the dependency array):

```js
  useEffect(() => {
    if (done || !introResolved || showIntro || blocked) return
    const id = setInterval(() => setCurrentElapsedMs(Date.now() - startRef.current), 100)
    return () => clearInterval(id)
  }, [done, introResolved, showIntro, blocked])
```

Change `flipTile`'s first guard line:

```js
    if (lockedRef.current || doneRef.current || blockedRef.current) return
```

- [ ] **Step 4: Run the new tests AND the existing suite for the hook**

Run: `npx vitest run src/hooks/__tests__/useMemorySession.pause.test.jsx src/hooks/__tests__/useMemorySession.test.js`
Expected: all pass (existing tests prove no regression — they run with the default unblocked context).

- [ ] **Step 5: Run the memory game's component tests (they exercise the hook through the UI)**

Run: `npx vitest run src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`
Expected: PASS (default context `{ blocked: false }` means zero behavior change without a gate).

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add src/hooks/useMemorySession.js src/hooks/__tests__/useMemorySession.pause.test.jsx
git commit -m "feat(62): pause memory session timing and input while orientation-blocked"
```

---

### Task 5: `GameIntro` landscape notice + memory game passes it

**Files:**
- Modify: `src/i18n/en.json` (the `common` block)
- Modify: `src/components/GameIntro.jsx`
- Modify: `src/components/GameIntro.css`
- Modify: `src/components/GameIntro.stories.jsx`
- Modify: `src/games/animal-memory-match/index.jsx`
- Test (extend): `src/components/__tests__/GameIntro.test.jsx`

**Interfaces:**
- Consumes: i18n key `common.gameIntroLandscape` (added here).
- Produces: `GameIntro` accepts optional `orientation` prop; `"landscape"` renders the notice (testid `game-intro-orientation`), anything else renders nothing.

- [ ] **Step 1: Add the i18n string**

In `src/i18n/en.json` `common` block, add:

```json
    "gameIntroLandscape": "Play this game with your screen sideways!"
```

- [ ] **Step 2: Write the failing tests**

Append to the `describe('GameIntro', ...)` block in `src/components/__tests__/GameIntro.test.jsx`:

```jsx
  it('shows the landscape notice when orientation is "landscape"', () => {
    render(<GameIntro icon="🧠" name="Memory" instructions="x" orientation="landscape" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />)
    const notice = screen.getByTestId('game-intro-orientation')
    expect(notice).toHaveTextContent(/sideways/i)
    expect(screen.getByText('↔️')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows no notice when orientation is absent (negative)', () => {
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />)
    expect(screen.queryByTestId('game-intro-orientation')).not.toBeInTheDocument()
  })

  it('shows no notice for an unrecognized orientation value (negative)', () => {
    render(<GameIntro icon="🐘" name="Animal Sounds" instructions="x" orientation="portrait" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />)
    expect(screen.queryByTestId('game-intro-orientation')).not.toBeInTheDocument()
  })

  it('has no accessibility violations with the landscape notice', async () => {
    const { container } = render(
      <GameIntro icon="🧠" name="Memory" instructions="x" orientation="landscape" dontShowAgain={false} onDontShowAgainChange={vi.fn()} onStart={vi.fn()} />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npx vitest run src/components/__tests__/GameIntro.test.jsx`
Expected: the 4 new tests FAIL (no `game-intro-orientation` element), the original 7 pass.

- [ ] **Step 4: Implement**

In `src/components/GameIntro.jsx`, add `orientation` to the props destructuring:

```jsx
export default function GameIntro({ icon, name, instructions, orientation, dontShowAgain, onDontShowAgainChange, onStart }) {
```

Insert between the instructions `<p>` and the checkbox `<label>`:

```jsx
      {orientation === 'landscape' && (
        <p className="game-intro__orientation" data-testid="game-intro-orientation">
          <span aria-hidden="true">↔️</span> {t('common.gameIntroLandscape')}
        </p>
      )}
```

In `src/components/GameIntro.css`, add after the `.game-intro__instructions` rule:

```css
.game-intro__orientation {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--color-text-muted);
}
```

In `src/components/GameIntro.stories.jsx`, add:

```jsx
export const LandscapeRequired = {
  args: {
    icon: '🧠',
    name: 'Animal Memory Match',
    instructions: 'Flip the tiles and find the matching animal pairs!',
    orientation: 'landscape',
    dontShowAgain: false,
    onDontShowAgainChange: () => {},
    onStart: () => {},
  },
}
```

In `src/games/animal-memory-match/index.jsx`, add the prop to the `<GameIntro>` element (after `instructions=...`):

```jsx
        orientation={manifest.orientation}
```

(The manifest gains the field in Task 7; until then the prop is `undefined`, which is the no-notice negative path — harmless.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/__tests__/GameIntro.test.jsx src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`
Expected: all pass.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint && npm run lint:css
git add src/i18n/en.json src/components/GameIntro.jsx src/components/GameIntro.css src/components/GameIntro.stories.jsx src/games/animal-memory-match/index.jsx src/components/__tests__/GameIntro.test.jsx
git commit -m "feat(62): landscape-required notice on the game intro slide"
```

---

### Task 6: Dashboard card badges

**Files:**
- Modify: `src/i18n/en.json` (the `dashboard` block)
- Modify: `src/components/GameCard.jsx`, `src/components/GameCard.css`
- Modify: `src/components/FeaturedGameCard.jsx`, `src/components/FeaturedGameCard.css`
- Test (extend): `src/components/__tests__/GameCard.test.jsx`, `src/components/__tests__/FeaturedGameCard.test.jsx`

**Interfaces:**
- Consumes: i18n key `dashboard.landscapeOnly` (added here); `manifest.orientation`.
- Produces: both cards render `data-testid="landscape-badge"` when `manifest.orientation === 'landscape'`.

- [ ] **Step 1: Add the i18n string**

In `src/i18n/en.json` `dashboard` block, add (before the `"tag"` object):

```json
    "landscapeOnly": "Landscape only",
```

- [ ] **Step 2: Write the failing tests**

Both existing test files render with a router wrapper (the components use `Link`) — follow each file's existing render helper. Add to `GameCard.test.jsx`:

```jsx
  it('shows an accessible landscape-only badge when the manifest requires landscape', () => {
    renderCard({ ...baseManifest, orientation: 'landscape' })
    expect(screen.getByTestId('landscape-badge')).toHaveAccessibleName('Landscape only')
  })

  it('shows no landscape badge when the manifest has no orientation (negative)', () => {
    renderCard(baseManifest)
    expect(screen.queryByTestId('landscape-badge')).not.toBeInTheDocument()
  })

  it('shows no landscape badge for an unrecognized orientation value (negative)', () => {
    renderCard({ ...baseManifest, orientation: 'upside-down' })
    expect(screen.queryByTestId('landscape-badge')).not.toBeInTheDocument()
  })
```

(`renderCard`/`baseManifest`: adapt to the file's existing fixture names — every GameCard test already renders a manifest fixture; reuse it and spread `orientation` on top.) Add the same three cases to `FeaturedGameCard.test.jsx` with its own fixture/helper.

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npx vitest run src/components/__tests__/GameCard.test.jsx src/components/__tests__/FeaturedGameCard.test.jsx`
Expected: 6 new tests FAIL (no badge element), existing ones pass.

- [ ] **Step 4: Implement**

`src/components/GameCard.jsx` — inside the `<Link>`, after the best-score span (keep the recent badge last):

```jsx
      {manifest.orientation === 'landscape' && (
        <span
          className="game-card__landscape-badge"
          data-testid="landscape-badge"
          role="img"
          aria-label={t('dashboard.landscapeOnly')}
        >
          ↔️
        </span>
      )}
```

`src/components/GameCard.css` — style it like the existing recent-badge pill:

```css
.game-card__landscape-badge {
  font-size: 14px;
  line-height: 1;
  background: rgb(0 0 0 / 5%);
  border-radius: 12px;
  padding: 4px 10px;
}
```

`src/components/FeaturedGameCard.jsx` — after the description span:

```jsx
      {manifest.orientation === 'landscape' && (
        <span
          className="featured-card__landscape-badge"
          data-testid="landscape-badge"
          role="img"
          aria-label={t('dashboard.landscapeOnly')}
        >
          ↔️
        </span>
      )}
```

`src/components/FeaturedGameCard.css` — same pill rule with the `featured-card__landscape-badge` class name.

Note: `FeaturedGameCard` destructures manifest fields at the top — either add `orientation` to the destructuring and use it directly, or reference `manifest.orientation`; match the file's existing style (it destructures, so add `orientation` there and use `orientation === 'landscape'`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/__tests__/GameCard.test.jsx src/components/__tests__/FeaturedGameCard.test.jsx src/components/__tests__/Dashboard.test.jsx`
Expected: all pass (Dashboard renders GameCards — confirm no fixture breaks).

- [ ] **Step 6: Lint and commit**

```bash
npm run lint && npm run lint:css
git add src/i18n/en.json src/components/GameCard.jsx src/components/GameCard.css src/components/FeaturedGameCard.jsx src/components/FeaturedGameCard.css src/components/__tests__/GameCard.test.jsx src/components/__tests__/FeaturedGameCard.test.jsx
git commit -m "feat(62): landscape-only badge on dashboard game cards"
```

---

### Task 7: Engine wiring, manifest flag, e2e coverage

**Files:**
- Modify: `src/App.jsx` (GameRoute)
- Modify: `src/games/animal-memory-match/manifest.json`
- Modify: `e2e/animal-memory-match.spec.js` (two portrait viewports → landscape)
- Create: `e2e/orientation-gate.spec.js`

**Interfaces:**
- Consumes: `OrientationGate` (Task 3), manifests array already in `App.jsx` module scope.
- Produces: `/game/animal-memory-match` is orientation-enforced end to end.

- [ ] **Step 1: Wire the gate into `GameRoute` in `src/App.jsx`**

Add the import:

```jsx
import OrientationGate from './components/OrientationGate'
```

Replace the `GameRoute` function body's return with:

```jsx
function GameRoute() {
  const { gameId } = useParams()
  const navigate   = useNavigate()
  const Game       = gameComponents[gameId]
  const manifest   = manifests.find(m => m.id === gameId)

  if (!Game) return <div style={{ padding: 24 }}>Game not found.</div>

  return (
    <OrientationGate orientation={manifest?.orientation}>
      <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
        <Game onGameEnd={() => navigate('/')} />
      </Suspense>
    </OrientationGate>
  )
}
```

- [ ] **Step 2: Add the manifest flag + version bump**

`src/games/animal-memory-match/manifest.json` — add the field and bump `1.1.2` → `1.2.0`:

```json
{
  "id": "animal-memory-match",
  "name": "Animal Memory Match",
  "description": "Flip the tiles and find the matching animal pairs!",
  "icon": "🧠",
  "gameType": "memory",
  "color": "#4DB6AC",
  "version": "1.2.0",
  "orientation": "landscape",
  "tags": ["memory", "animals"]
}
```

- [ ] **Step 3: Run the unit suite to confirm nothing regressed**

Run: `npx vitest run`
Expected: all pass. (`App.test.jsx` only renders the home route; game component tests render games directly without the gate; the gate degrades to `'landscape'` in jsdom where `matchMedia` is missing, so even gated renders stay unblocked.)

- [ ] **Step 4: Update the two portrait-viewport e2e tests in `e2e/animal-memory-match.spec.js`**

The game now blocks portrait, so these tests must drive landscape viewports (this is the behavior change, not test gaming — the assertions still guard tap-target size and centering):

Test at line ~61 (`cards are large tap targets... on phone`): change the viewport line to

```js
  await page.setViewportSize({ width: 667, height: 375 }) // landscape phone — the game now requires landscape (#62)
```

The assertions hold: 667px viewport − 32px `.game` padding = 635px container; auto-fit lands on 4 columns of ~150px (≥120 floor), left gap > 0, no horizontal overflow.

Test at line ~79 (`cards grow to fill more of a tablet screen`): change the viewport line to

```js
  await page.setViewportSize({ width: 1024, height: 768 }) // landscape tablet — the game now requires landscape (#62)
```

The assertion holds: the grid caps at 748px → 5 columns of 140px tiles (≥125). Update the test's inline comment: at 1024×768 the cap (748px) is what limits width, giving exactly 140px tiles.

- [ ] **Step 5: Write the new e2e spec**

Create `e2e/orientation-gate.spec.js`:

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Desktop Chrome (fine pointer) exercises the viewport-aspect-ratio path of
// the hybrid detection; the screen.orientation path is unit-tested.
const PORTRAIT  = { width: 375, height: 667 }
const LANDSCAPE = { width: 667, height: 375 }

test('landscape game in portrait: overlay blocks play until rotated', async ({ page }) => {
  await page.setViewportSize(PORTRAIT)
  await page.goto('/game/animal-memory-match')
  await expect(page.getByTestId('orientation-overlay')).toBeVisible()
  await expect(page.locator('.orientation-gate__content')).toHaveAttribute('inert', '')

  await page.setViewportSize(LANDSCAPE)
  await expect(page.getByTestId('orientation-overlay')).toHaveCount(0)
  await page.getByTestId('game-intro-start').click()
  await expect(page.locator('[data-tile-id]')).toHaveCount(10)
})

test('rotating to portrait mid-game blocks the board; rotating back resumes play', async ({ page }) => {
  await page.setViewportSize(LANDSCAPE)
  await page.goto('/game/animal-memory-match')
  await page.getByTestId('game-intro-start').click()
  await page.locator('[data-tile-id]').first().waitFor()

  await page.setViewportSize(PORTRAIT)
  await expect(page.getByTestId('orientation-overlay')).toBeVisible()

  await page.setViewportSize(LANDSCAPE)
  await expect(page.getByTestId('orientation-overlay')).toHaveCount(0)
  await page.locator('[data-tile-id]').first().click()
  await expect(page.locator('.memory-board__tile--up, .memory-board__tile--matched')).not.toHaveCount(0)
})

test('shell home button stays reachable while the overlay is up', async ({ page }) => {
  await page.setViewportSize(PORTRAIT)
  await page.goto('/game/animal-memory-match')
  await expect(page.getByTestId('orientation-overlay')).toBeVisible()
  await page.getByRole('button', { name: 'Go to home' }).click()
  await expect(page).toHaveURL('/')
})

test('overlay state has no accessibility violations', async ({ page }) => {
  await page.setViewportSize(PORTRAIT)
  await page.goto('/game/animal-memory-match')
  await page.getByTestId('orientation-overlay').waitFor()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('negative: a game without the manifest flag never shows the overlay in portrait', async ({ page }) => {
  await page.setViewportSize(PORTRAIT)
  await page.goto('/game/animal-sounds')
  await expect(page.getByTestId('game-intro-start')).toBeVisible()
  await expect(page.getByTestId('orientation-overlay')).toHaveCount(0)
})
```

- [ ] **Step 6: Run the affected e2e specs**

Run: `npx playwright test orientation-gate.spec.js animal-memory-match.spec.js`
Expected: all pass. (Playwright launches dev + Storybook servers itself; the memory-match spec's other tests run at the default 1280×720, which is landscape.)

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/games/animal-memory-match/manifest.json e2e/animal-memory-match.spec.js e2e/orientation-gate.spec.js
git commit -m "feat(62): enforce landscape for Animal Memory Match via manifest + e2e coverage"
```

---

### Task 8: Visual-regression baselines

**Files:**
- Modify: `e2e/visual.spec.js`
- Create (generated): `e2e/visual.spec.js-snapshots/components-orientationoverlay--default-chromium-win32.png`, `e2e/visual.spec.js-snapshots/components-gameintro--landscape-required-chromium-win32.png`

- [ ] **Step 1: Register the new stories**

In `e2e/visual.spec.js`, add to the `stories` array (next to the existing gameintro entries):

```js
  'components-gameintro--landscape-required',
  'components-orientationoverlay--default',
```

- [ ] **Step 2: Generate the two new baselines**

Run: `npx playwright test visual.spec.js --update-snapshots`
Expected: two new PNGs created; **all pre-existing baselines unchanged** (`git status` must show only the two new files — if any existing PNG changed, something regressed visually; investigate before committing).

- [ ] **Step 3: Eyeball the new PNGs**

Open both new snapshot files and confirm: the overlay shows the phone glyph + heading + body centered on the app background; the intro shows the ↔️ notice between instructions and checkbox.

- [ ] **Step 4: Verify the visual suite passes clean**

Run: `npx playwright test visual.spec.js`
Expected: all stories pass, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add e2e/visual.spec.js e2e/visual.spec.js-snapshots/
git commit -m "test(62): visual baselines for orientation overlay and landscape intro notice"
```

---

### Task 9: Docs, changelog, versions, full verification

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `docs/TESTING.md`, `docs/ENHANCEMENTS.md`, `CHANGELOG.md`, `package.json`

- [ ] **Step 1: README — manifest field documentation**

In `README.md` § *Adding a New Game*, after the paragraph "The `icon` can also be an image path… Memory-type games add `"gameType": "memory"`…", add:

```markdown
Games that only lay out well in a horizontal viewport can add `"orientation": "landscape"`. The engine then enforces it for that game's whole route: a full-screen rotate prompt blocks play (and pauses the memory-session timer) whenever the device/viewport is portrait, the intro slide announces the requirement, and the dashboard card shows a ↔️ *Landscape only* badge. Detection is hybrid — physical device orientation on touch devices, viewport aspect ratio on desktop. No game code is needed beyond the manifest field (pass `manifest.orientation` to `GameIntro` if the game renders its own intro).
```

Also add `orientation` to the annotated manifest comment in the repo-layout tree (the line `manifest.json  # Game metadata (id, name, tags, version, optional gameType)` becomes `... optional gameType, orientation`).

- [ ] **Step 2: CLAUDE.md — architecture note**

In the *Architecture* section's auto-discovery paragraph, extend the manifest sentence: after "(the `tags` field is required; memory games also set `gameType: "memory"`)" add ", and games that require a horizontal layout set `"orientation": "landscape"` — the engine's `OrientationGate` (wrapping every game route in `src/App.jsx`) then blocks portrait play with a rotate overlay and publishes `{ blocked }` via `OrientationGateContext`, which `useMemorySession` consumes to pause timing".

- [ ] **Step 3: docs/TESTING.md — new patterns**

Add two bullets to the Layer-1 patterns list:

```markdown
- **Mocking orientation APIs:** jsdom has neither `window.matchMedia` nor `screen.orientation`. Orientation tests install getter-based mocks (see `src/hooks/__tests__/useOrientation.test.jsx` — `installMatchMedia` / `installScreenOrientation`, with listener sets the test fires manually) and delete them in `afterEach`. Production code fails open to `'landscape'` when the APIs are missing, so unmocked jsdom renders are never blocked.
- **Orientation-gate pause:** hooks that must react to the rotate overlay read `useOrientationGate()` (default `{ blocked: false }`); tests drive it by wrapping `renderHook` in an `OrientationGateContext.Provider` whose value the test flips (see `useMemorySession.pause.test.jsx`).
```

Add a row to the Layer-3 spec table:

```markdown
| `orientation-gate.spec.js` | Manifest-driven forced-landscape enforcement: overlay blocks portrait play, clears on rotate, home stays reachable, axe scan of the overlay, and a no-flag game never blocks |
```

- [ ] **Step 4: docs/ENHANCEMENTS.md — backlog entries**

Under *Core Engine*, add:

```markdown
- **Orientation pause for quiz games** — `useMemorySession` pauses timing behind the issue-#62 rotate overlay, but `useGameSession` doesn't: its per-question countdown (`timeLimitMs` timeout) keeps running if a future quiz game sets `"orientation"` in its manifest. Suspend/resume the question timer off `useOrientationGate()` before any quiz game adopts the flag.
- **`"orientation": "portrait"` support** — the manifest field and gate are enum-shaped; recognizing `portrait` is the same overlay with a flipped condition and a rotated glyph, if a vertical-first game ever wants it.
```

- [ ] **Step 5: CHANGELOG + version bumps**

`package.json`: `"version": "0.24.5"` → `"0.25.0"`.

`CHANGELOG.md`, new entry above `[0.24.5]`:

```markdown
## [0.25.0] - 2026-07-12

### Added
- Games can require a horizontal layout via a new optional manifest field, `"orientation": "landscape"` (issue #62). The engine enforces it for the game's whole route: an accessible full-content rotate prompt ("Turn it sideways!") blocks play whenever the layout is portrait — physical device orientation on touch devices, viewport aspect ratio on desktop — while the shell's home button stays reachable. The game stays mounted (state survives rotation), the memory-session clock pauses so personal-best times stay fair, the intro slide announces the requirement, and dashboard cards show a ↔️ "Landscape only" badge. First adopter: Animal Memory Match (v1.2.0). New engine pieces: `useOrientation` hook, `OrientationGate`/`OrientationOverlay` components, `OrientationGateContext`.
```

- [ ] **Step 6: Full verification run**

```bash
npm run lint && npm run lint:css
npx vitest run
npm run build
npm run e2e
```

Expected: everything green. If `npm run e2e` shows failures unrelated to orientation (flaky Storybook cold-boot retries are known), re-run the failing spec in isolation before investigating.

- [ ] **Step 7: Commit**

```bash
git add README.md CLAUDE.md docs/TESTING.md docs/ENHANCEMENTS.md CHANGELOG.md package.json
git commit -m "docs(62): document orientation manifest field; v0.25.0"
```

---

## Self-review notes (completed during planning)

- **Spec coverage:** manifest contract → T7; detection hybrid → T1; gate/overlay/inert/focus/context → T2+T3; timer pause + input guard → T4; intro notice → T5; card badges → T6; e2e/a11y/visual → T7+T8; docs/backlog/versions → T9. The spec's "unknown values ignored" appears as negative tests in T3/T5/T6.
- **Pre-existing tests that WOULD break:** the two portrait-viewport board-layout tests in `e2e/animal-memory-match.spec.js` — updated in T7 Step 4 with recomputed expectations, not loosened assertions.
- **Type consistency:** `useOrientation()` → string `'landscape' | 'portrait'`; `useOrientationGate()` → `{ blocked }`; `OrientationOverlay({ headingRef })`; `OrientationGate({ orientation, children })` — names match across T1–T7.
