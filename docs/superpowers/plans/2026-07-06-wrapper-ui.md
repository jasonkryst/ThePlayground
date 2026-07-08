# Wrapper UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One persistent shell (header + footer) shared by every route — home, badges, settings, parent, games — with a kid-safe exit guard during gameplay, per spec `docs/superpowers/specs/2026-07-06-wrapper-ui-design.md` (GitHub issue #16).

**Architecture:** A new `AppShell` component mounts as a React Router **layout route** wrapping all existing routes; pages render via `<Outlet/>`. A narrow `ShellContext` lets games publish `{ streak, sessionActive }` upward; the shell guards exits with a confirm overlay while `sessionActive`. All per-page chrome (nav links, back links, page titles, footers, per-game mini headers) is deleted from pages and games.

**Tech Stack:** React 18, react-router-dom v7, react-i18next, Vitest + React Testing Library + jest-axe, Playwright, Storybook 8, plain CSS with BEM-ish class names.

## Global Constraints

- Work in `C:/_s/ThePlayground` (main checkout, branch `16-wrapper-ui`). Do NOT use the broken `.claude/worktrees/feature+character-match` worktree.
- Only `AppShell` renders `<main>` and `<footer>`; pages and games must not render `main`/`header`/`footer` landmarks (one banner, one main, at most one contentinfo per page).
- One `<h1>` per page: the shell's title on `/admin`, `/parent`, `/my-progress`, and `/game/:gameId`; the Dashboard greeting on `/`.
- All user-facing strings go through i18next `t()`. New shell strings live under the `shell` namespace in `src/i18n/en.json` (the only core locale).
- Exit guard is **fail-open**: default game status is `{ streak: 0, sessionActive: false }`; navigation must never be blocked unless a game explicitly reported `sessionActive: true`.
- Animations only inside `@media (prefers-reduced-motion: no-preference)` (existing repo pattern in `src/index.css`).
- Use design tokens from `src/index.css` (`--color-*`, `--radius-*`, `--font-main`) in all new CSS. Class naming: `shell__*`, `exit-confirm__*`.
- Unit tests: `npx vitest run <file>` from repo root. Lint gates: `npm run lint` and `npm run lint:css`. E2E: `npm run e2e` (Playwright starts the dev server itself).
- Commit after every task with a conventional-commit message ending in `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- The interim state between Task 4 and Tasks 5–10 intentionally shows duplicated chrome (shell + old page headers). Unit tests stay green per task; e2e/visual suites are only reconciled in Task 11.

---

### Task 1: ShellContext + useShellGameStatus + shell i18n keys

**Files:**
- Create: `src/components/ShellContext.jsx`
- Test: `src/components/__tests__/ShellContext.test.jsx`
- Modify: `src/i18n/en.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `ShellContext` (React context; value shape `{ setGameStatus(status) }`), `INACTIVE_GAME_STATUS` (`{ streak: 0, sessionActive: false }`), `useShellGameStatus({ streak, sessionActive })` — all named exports from `src/components/ShellContext.jsx`. Tasks 3 and 10 rely on these exact names.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/ShellContext.test.jsx`:

```jsx
import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ShellContext, useShellGameStatus, INACTIVE_GAME_STATUS } from '../ShellContext'

function Probe({ streak, sessionActive }) {
  useShellGameStatus({ streak, sessionActive })
  return null
}

function renderWithSpy(ui) {
  const setGameStatus = vi.fn()
  const utils = render(
    <ShellContext.Provider value={{ setGameStatus }}>{ui}</ShellContext.Provider>
  )
  return { setGameStatus, ...utils }
}

describe('useShellGameStatus', () => {
  it('publishes the given status to the shell', () => {
    const { setGameStatus } = renderWithSpy(<Probe streak={3} sessionActive={true} />)
    expect(setGameStatus).toHaveBeenLastCalledWith({ streak: 3, sessionActive: true })
  })

  it('re-publishes when the status changes', () => {
    const setGameStatus = vi.fn()
    const { rerender } = render(
      <ShellContext.Provider value={{ setGameStatus }}>
        <Probe streak={0} sessionActive={true} />
      </ShellContext.Provider>
    )
    rerender(
      <ShellContext.Provider value={{ setGameStatus }}>
        <Probe streak={2} sessionActive={true} />
      </ShellContext.Provider>
    )
    expect(setGameStatus).toHaveBeenLastCalledWith({ streak: 2, sessionActive: true })
  })

  it('resets to inactive on unmount so the shell never keeps stale game status', () => {
    const { setGameStatus, unmount } = renderWithSpy(<Probe streak={5} sessionActive={true} />)
    unmount()
    expect(setGameStatus).toHaveBeenLastCalledWith(INACTIVE_GAME_STATUS)
  })

  it('is a safe no-op without a provider (default context value)', () => {
    expect(() => render(<Probe streak={1} sessionActive={true} />)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/ShellContext.test.jsx`
Expected: FAIL — cannot resolve `../ShellContext`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/ShellContext.jsx`:

```jsx
import { createContext, useContext, useEffect } from 'react'

export const INACTIVE_GAME_STATUS = { streak: 0, sessionActive: false }

// Default is a no-op so games render fine outside the shell (unit tests, Storybook).
export const ShellContext = createContext({ setGameStatus: () => {} })

// A game publishes its live status to the shell. Cleared on unmount so a
// left game never leaves stale status behind (exit guard is fail-open).
export function useShellGameStatus({ streak, sessionActive }) {
  const { setGameStatus } = useContext(ShellContext)

  useEffect(() => {
    setGameStatus({ streak, sessionActive })
  }, [setGameStatus, streak, sessionActive])

  useEffect(() => () => setGameStatus(INACTIVE_GAME_STATUS), [setGameStatus])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/ShellContext.test.jsx`
Expected: 4 passed.

- [ ] **Step 5: Add shell i18n keys**

In `src/i18n/en.json`, add a top-level `"shell"` object (alphabetical position doesn't matter; place it after `"common"`):

```json
"shell": {
  "brand": "The Playground",
  "back": "Back to home",
  "home": "Go to home",
  "navLabel": "Main navigation",
  "navParent": "📊 Progress Dashboard",
  "navProgress": "🌟 My Progress",
  "navSettings": "⚙️ Settings",
  "footerName": "The Playground",
  "exitConfirmTitle": "Leave the game?",
  "keepPlaying": "Keep playing! ▶️",
  "leaveGame": "Leave game 🏠"
}
```

Do NOT remove any existing keys in this task (pages still use them until Tasks 5–8).

- [ ] **Step 6: Run the i18n tests**

Run: `npx vitest run src/i18n/__tests__/i18n.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/ShellContext.jsx src/components/__tests__/ShellContext.test.jsx src/i18n/en.json
git commit -m "feat(shell): add ShellContext, useShellGameStatus, and shell i18n keys"
```

---

### Task 2: ExitConfirmDialog

**Files:**
- Create: `src/components/ExitConfirmDialog.jsx`
- Create: `src/components/ExitConfirmDialog.css`
- Test: `src/components/__tests__/ExitConfirmDialog.test.jsx`

**Interfaces:**
- Consumes: i18n keys `shell.exitConfirmTitle`, `shell.keepPlaying`, `shell.leaveGame` (Task 1).
- Produces: default export `ExitConfirmDialog({ onResume, onLeave })`. Task 3 renders it.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/ExitConfirmDialog.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import ExitConfirmDialog from '../ExitConfirmDialog'

describe('ExitConfirmDialog', () => {
  it('renders a modal dialog with keep-playing focused by default', () => {
    render(<ExitConfirmDialog onResume={() => {}} onLeave={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: /keep playing/i })).toHaveFocus()
  })

  it('calls onResume when keep-playing is clicked', async () => {
    const onResume = vi.fn()
    render(<ExitConfirmDialog onResume={onResume} onLeave={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /keep playing/i }))
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('calls onLeave when leave-game is clicked', async () => {
    const onLeave = vi.fn()
    render(<ExitConfirmDialog onResume={() => {}} onLeave={onLeave} />)
    await userEvent.click(screen.getByRole('button', { name: /leave game/i }))
    expect(onLeave).toHaveBeenCalledOnce()
  })

  it('calls onResume on Escape', async () => {
    const onResume = vi.fn()
    render(<ExitConfirmDialog onResume={onResume} onLeave={() => {}} />)
    await userEvent.keyboard('{Escape}')
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('calls onResume when the backdrop is clicked', async () => {
    const onResume = vi.fn()
    render(<ExitConfirmDialog onResume={onResume} onLeave={() => {}} />)
    await userEvent.click(screen.getByTestId('exit-confirm-backdrop'))
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('traps Tab between the two buttons', async () => {
    render(<ExitConfirmDialog onResume={() => {}} onLeave={() => {}} />)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: /leave game/i })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: /keep playing/i })).toHaveFocus()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ExitConfirmDialog onResume={() => {}} onLeave={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/ExitConfirmDialog.test.jsx`
Expected: FAIL — cannot resolve `../ExitConfirmDialog`.

- [ ] **Step 3: Write the implementation**

Create `src/components/ExitConfirmDialog.jsx`:

```jsx
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import './ExitConfirmDialog.css'

// Kid-safe exit guard: leaving a game mid-session takes two deliberate taps
// in different screen regions. Chosen over press-and-hold so keyboard and
// switch-access users get the same protection (see design spec).
export default function ExitConfirmDialog({ onResume, onLeave }) {
  const { t } = useTranslation()
  const keepRef = useRef(null)
  const leaveRef = useRef(null)

  useEffect(() => { keepRef.current?.focus() }, [])

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      onResume()
      return
    }
    if (e.key === 'Tab') {
      // Only two focusables exist; toggle between them to trap focus.
      e.preventDefault()
      const next = document.activeElement === keepRef.current ? leaveRef.current : keepRef.current
      next?.focus()
    }
  }

  return (
    <div
      className="exit-confirm__backdrop"
      data-testid="exit-confirm-backdrop"
      role="presentation"
      onClick={onResume}
    >
      {/* stopPropagation so clicks inside the card don't hit the backdrop resume handler */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- keydown implements the dialog's focus trap, not a click alternative */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-confirm-title"
        className="exit-confirm"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id="exit-confirm-title" className="exit-confirm__title">{t('shell.exitConfirmTitle')}</h2>
        <button ref={keepRef} className="exit-confirm__keep" onClick={onResume}>
          {t('shell.keepPlaying')}
        </button>
        <button ref={leaveRef} className="exit-confirm__leave" onClick={onLeave}>
          {t('shell.leaveGame')}
        </button>
      </div>
    </div>
  )
}
```

(If `npm run lint` reports a different or no jsx-a11y rule for the inner div, adjust or drop the eslint-disable comment so lint passes cleanly — do not silence rules that don't fire.)

Create `src/components/ExitConfirmDialog.css`:

```css
.exit-confirm__backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(0 0 0 / 45%);
}

.exit-confirm {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 360px;
  padding: 32px 24px;
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-card);
}

.exit-confirm__title { font-size: 22px; font-weight: 800; color: var(--color-text); }

.exit-confirm__keep {
  min-height: 80px;
  font-size: 22px;
  font-weight: 800;
  color: var(--color-teal-dark);
  background: var(--color-teal);
}

.exit-confirm__leave {
  font-weight: 600;
  color: var(--color-text-muted);
  background: transparent;
  border: 2px solid rgb(0 0 0 / 12%);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/ExitConfirmDialog.test.jsx`
Expected: 7 passed.

- [ ] **Step 5: Lint and commit**

Run: `npm run lint && npm run lint:css`
Expected: clean.

```bash
git add src/components/ExitConfirmDialog.jsx src/components/ExitConfirmDialog.css src/components/__tests__/ExitConfirmDialog.test.jsx
git commit -m "feat(shell): add kid-safe ExitConfirmDialog"
```

---

### Task 3: AppShell component

**Files:**
- Create: `src/components/AppShell.jsx`
- Create: `src/components/AppShell.css`
- Create: `src/components/AppShell.stories.jsx`
- Test: `src/components/__tests__/AppShell.test.jsx`

**Interfaces:**
- Consumes: `ShellContext`, `INACTIVE_GAME_STATUS`, `useShellGameStatus` (Task 1); `ExitConfirmDialog({ onResume, onLeave })` (Task 2); existing `StreakBadge({ streak })`, `ManifestIcon({ icon, className, ariaHidden })`; i18n keys `shell.*` plus existing `admin.title`, `parent.title`, `kids.title`.
- Produces: default export `AppShell({ manifests })` — a layout-route component rendering `<Outlet/>`. Task 4 mounts it in `App.jsx`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/__tests__/AppShell.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import AppShell from '../AppShell'
import { useShellGameStatus } from '../ShellContext'

const manifests = [
  { id: 'color-match', name: 'Color Match', description: 'Colors!', icon: '🎨', color: '#CE93D8' },
]

function FakeGame({ streak = 0, sessionActive = false }) {
  useShellGameStatus({ streak, sessionActive })
  return <div>FakeGameBody</div>
}

function renderShell(initialPath, gameElement = <FakeGame />) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppShell manifests={manifests} />}>
          <Route path="/" element={<div>HomeBody</div>} />
          <Route path="/admin" element={<div>AdminBody</div>} />
          <Route path="/parent" element={<div>ParentBody</div>} />
          <Route path="/my-progress" element={<div>ProgressBody</div>} />
          <Route path="/game/:gameId" element={gameElement} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('AppShell — home route', () => {
  it('renders brand link, all three nav links, and the footer', () => {
    renderShell('/')
    expect(screen.getByRole('link', { name: /the playground/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /progress dashboard/i })).toHaveAttribute('href', '/parent')
    expect(screen.getByRole('link', { name: /my progress/i })).toHaveAttribute('href', '/my-progress')
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
  })

  it('renders no back link and no shell page title on home', () => {
    renderShell('/')
    expect(screen.queryByRole('link', { name: /back to home/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderShell('/')
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('AppShell — subpages', () => {
  it('renders back link, focused page title, and marks the current nav link', () => {
    renderShell('/admin')
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
    const title = screen.getByRole('heading', { level: 1, name: /settings/i })
    expect(title).toHaveFocus()
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /progress dashboard/i })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('shows the right titles for parent and my-progress', () => {
    renderShell('/parent')
    expect(screen.getByRole('heading', { level: 1, name: /progress dashboard/i })).toBeInTheDocument()
  })
})

describe('AppShell — game route', () => {
  it('shows the game name as h1, a home button, no nav links, no footer', () => {
    renderShell('/game/color-match')
    expect(screen.getByRole('heading', { level: 1, name: /color match/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /go to home/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /progress dashboard/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  })

  it('renders the streak badge while a session is active', () => {
    renderShell('/game/color-match', <FakeGame streak={4} sessionActive={true} />)
    expect(screen.getByText('🔥 4 in a row!')).toBeInTheDocument()
  })

  it('survives an unknown game id (no title, working home button)', async () => {
    renderShell('/game/nope', <div>NotFoundBody</div>)
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /go to home/i }))
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
  })
})

describe('AppShell — exit guard', () => {
  it('navigates home immediately when no session is active', async () => {
    renderShell('/game/color-match', <FakeGame sessionActive={false} />)
    await userEvent.click(screen.getByRole('button', { name: /go to home/i }))
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the confirm dialog instead of navigating while a session is active', async () => {
    renderShell('/game/color-match', <FakeGame sessionActive={true} />)
    await userEvent.click(screen.getByRole('button', { name: /go to home/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('FakeGameBody')).toBeInTheDocument()
  })

  it('keep-playing closes the dialog and returns focus to the home button', async () => {
    renderShell('/game/color-match', <FakeGame sessionActive={true} />)
    const homeBtn = screen.getByRole('button', { name: /go to home/i })
    await userEvent.click(homeBtn)
    await userEvent.click(screen.getByRole('button', { name: /keep playing/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('FakeGameBody')).toBeInTheDocument()
    expect(homeBtn).toHaveFocus()
  })

  it('leave-game navigates home', async () => {
    renderShell('/game/color-match', <FakeGame sessionActive={true} />)
    await userEvent.click(screen.getByRole('button', { name: /go to home/i }))
    await userEvent.click(screen.getByRole('button', { name: /leave game/i }))
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
  })

  it('guards the brand link too while a session is active', async () => {
    renderShell('/game/color-match', <FakeGame sessionActive={true} />)
    await userEvent.click(screen.getByRole('link', { name: /the playground/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('FakeGameBody')).toBeInTheDocument()
  })

  it('does not guard the brand link on non-game pages', async () => {
    renderShell('/admin')
    await userEvent.click(screen.getByRole('link', { name: /the playground/i }))
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/AppShell.test.jsx`
Expected: FAIL — cannot resolve `../AppShell`.

- [ ] **Step 3: Write the implementation**

Create `src/components/AppShell.jsx`:

```jsx
import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, Outlet, useLocation, useNavigate, matchPath } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShellContext, INACTIVE_GAME_STATUS } from './ShellContext'
import ExitConfirmDialog from './ExitConfirmDialog'
import StreakBadge from './StreakBadge'
import ManifestIcon from './ManifestIcon'
import { version } from '../../package.json'
import './AppShell.css'

const NAV_ITEMS = [
  { to: '/parent',      icon: '📊', labelKey: 'shell.navParent' },
  { to: '/my-progress', icon: '🌟', labelKey: 'shell.navProgress' },
  { to: '/admin',       icon: '⚙️', labelKey: 'shell.navSettings' },
]

const PAGE_TITLE_KEYS = {
  '/admin':       'admin.title',
  '/parent':      'parent.title',
  '/my-progress': 'kids.title',
}

export default function AppShell({ manifests = [] }) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [gameStatus, setGameStatus] = useState(INACTIVE_GAME_STATUS)
  const [confirmingExit, setConfirmingExit] = useState(false)
  const exitTriggerRef = useRef(null)
  const titleRef = useRef(null)

  const gameMatch = matchPath('/game/:gameId', location.pathname)
  const isGameRoute = gameMatch != null
  const gameManifest = isGameRoute
    ? manifests.find(m => m.id === gameMatch.params.gameId) ?? null
    : null
  const pageTitleKey = PAGE_TITLE_KEYS[location.pathname]
  const isHome = location.pathname === '/'

  // setGameStatus from useState is referentially stable, so this value never changes.
  const contextValue = useMemo(() => ({ setGameStatus }), [])

  // The shell owns route-entry focus wherever it owns the page title
  // (subpages and games). On '/' the Dashboard focuses its own greeting.
  useEffect(() => {
    setConfirmingExit(false)
    titleRef.current?.focus()
  }, [location.pathname])

  function handleGuardedNavClick(e) {
    if (isGameRoute && gameStatus.sessionActive) {
      e.preventDefault()
      exitTriggerRef.current = e.currentTarget
      setConfirmingExit(true)
    }
  }

  function handleHomeButtonClick(e) {
    if (gameStatus.sessionActive) {
      exitTriggerRef.current = e.currentTarget
      setConfirmingExit(true)
    } else {
      navigate('/')
    }
  }

  return (
    <ShellContext.Provider value={contextValue}>
      <div className="shell">
        <header className="shell__header">
          <div className="shell__side">
            {!isGameRoute && !isHome && (
              <Link to="/" className="shell__back" aria-label={t('shell.back')}>←</Link>
            )}
            <Link to="/" className="shell__brand" onClick={handleGuardedNavClick}>
              <span aria-hidden="true">🌊</span> {t('shell.brand')}
            </Link>
          </div>

          {(isGameRoute ? gameManifest != null : pageTitleKey != null) && (
            <div className="shell__center">
              <h1 className="shell__title" tabIndex={-1} ref={titleRef}>
                {isGameRoute ? (
                  <>
                    <ManifestIcon icon={gameManifest.icon} className="shell__title-icon" ariaHidden />
                    {' '}{gameManifest.name}
                  </>
                ) : (
                  t(pageTitleKey)
                )}
              </h1>
              {isGameRoute && gameStatus.sessionActive && (
                <StreakBadge streak={gameStatus.streak} />
              )}
            </div>
          )}

          <div className="shell__side shell__side--end">
            {isGameRoute ? (
              <button className="shell__home" aria-label={t('shell.home')} onClick={handleHomeButtonClick}>
                🏠
              </button>
            ) : (
              <nav className="shell__nav" aria-label={t('shell.navLabel')}>
                {NAV_ITEMS.map(item => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="shell__nav-link"
                    aria-label={t(item.labelKey)}
                    aria-current={location.pathname === item.to ? 'page' : undefined}
                  >
                    {item.icon}
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </header>

        {/* key remounts the content on navigation so the fade-in replays */}
        <main className="shell__content" key={location.pathname}>
          <Outlet />
        </main>

        {!isGameRoute && (
          <footer className="shell__footer">
            <span>{t('shell.footerName')}</span>
            <span className="shell__version">v{version}</span>
          </footer>
        )}

        {confirmingExit && (
          <ExitConfirmDialog
            onResume={() => {
              setConfirmingExit(false)
              exitTriggerRef.current?.focus()
            }}
            onLeave={() => {
              setConfirmingExit(false)
              navigate('/')
            }}
          />
        )}
      </div>
    </ShellContext.Provider>
  )
}
```

Create `src/components/AppShell.css`:

```css
.shell { display: flex; flex-direction: column; min-height: 100vh; }

.shell__header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background: var(--color-surface);
  border-bottom: 1px solid rgb(0 0 0 / 8%);
}

.shell__side { display: flex; flex: 1; gap: 4px; align-items: center; }
.shell__side--end { justify-content: flex-end; }

.shell__brand {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 48px;
  padding: 0 8px;
  font-size: 20px;
  font-weight: 800;
  color: var(--color-lavender-dark);
  text-decoration: none;
  border-radius: var(--radius-button);
}

.shell__back,
.shell__nav-link {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 48px;
  font-size: 24px;
  color: var(--color-text);
  text-decoration: none;
  border-radius: var(--radius-button);
  transition: background 0.15s;
}

.shell__home {
  min-width: 48px;
  min-height: 48px;
  font-size: 24px;
  background: transparent;
}

.shell__brand:hover,
.shell__back:hover,
.shell__nav-link:hover,
.shell__home:hover { background: rgb(0 0 0 / 6%); }

.shell__brand:focus,
.shell__back:focus,
.shell__nav-link:focus,
.shell__home:focus,
.shell__title:focus { outline: none; }

.shell__brand:focus-visible,
.shell__back:focus-visible,
.shell__nav-link:focus-visible,
.shell__home:focus-visible {
  outline: 3px solid var(--color-lavender);
  outline-offset: 3px;
}

.shell__nav-link[aria-current='page'] { background: rgb(0 0 0 / 8%); }

.shell__center {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.shell__title {
  overflow: hidden;
  font-size: 18px;
  font-weight: 800;
  color: var(--color-lavender-dark);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shell__content { display: flex; flex: 1; flex-direction: column; }

/* Route cross-fade: ~200ms fade-in on the remounted content container.
   Gated on reduced-motion like every other animation in this app. */
@media (prefers-reduced-motion: no-preference) {
  .shell__content { animation: shell-fade-in 0.2s ease; }
}

@keyframes shell-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.shell__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  font-size: 13px;
  color: var(--color-text-muted);
  border-top: 1px solid rgb(0 0 0 / 8%);
}

.shell__version { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/AppShell.test.jsx`
Expected: all tests pass.

- [ ] **Step 5: Add the Storybook story**

Create `src/components/AppShell.stories.jsx`:

```jsx
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AppShell from './AppShell'

const manifests = [
  { id: 'color-match', name: 'Color Match', description: 'Match the color!', icon: '🎨', color: '#CE93D8' },
]

export default {
  title: 'Components/AppShell',
  component: AppShell,
}

function shellAt(path) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell manifests={manifests} />}>
          <Route path="/" element={<div style={{ padding: 24 }}>Home content</div>} />
          <Route path="/admin" element={<div style={{ padding: 24 }}>Settings content</div>} />
          <Route path="/game/:gameId" element={<div style={{ padding: 24 }}>Game content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

export const Home = { render: () => shellAt('/') }
export const Subpage = { render: () => shellAt('/admin') }
export const GameRoute = { render: () => shellAt('/game/color-match') }
```

- [ ] **Step 6: Lint and commit**

Run: `npm run lint && npm run lint:css`
Expected: clean.

```bash
git add src/components/AppShell.jsx src/components/AppShell.css src/components/AppShell.stories.jsx src/components/__tests__/AppShell.test.jsx
git commit -m "feat(shell): add AppShell layout with route-driven header, footer, exit guard, and cross-fade"
```

---

### Task 4: Mount AppShell as the layout route in App.jsx

**Files:**
- Modify: `src/App.jsx` (routes block, lines ~82–96)
- Test: `src/App.test.jsx`

**Interfaces:**
- Consumes: `AppShell` default export (Task 3).
- Produces: every route now renders inside the shell. Pages temporarily show duplicated chrome until Tasks 5–10 (expected; see Global Constraints).

- [ ] **Step 1: Write the failing test**

Add to `src/App.test.jsx` (new describe block; also add `screen` to the `@testing-library/react` import):

```jsx
describe('App — shell chrome', () => {
  it('renders the shared shell header and footer around the home page', async () => {
    render(<App />)
    expect(await screen.findByRole('link', { name: /the playground/i })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.jsx`
Expected: the new test FAILS (no shell chrome yet); the locale-sync test still passes.

- [ ] **Step 3: Wire the layout route**

In `src/App.jsx`, add `import AppShell from './components/AppShell'` and change the routes block to:

```jsx
<Routes>
  <Route element={<AppShell manifests={manifests} />}>
    <Route path="/"             element={<Dashboard manifests={manifests} />} />
    <Route path="/admin"        element={<AdminPage manifests={manifests} />} />
    <Route path="/parent"       element={<ParentDashboard manifests={manifests} />} />
    <Route path="/my-progress" element={<KidsProgressPage manifests={manifests} />} />
    <Route path="/game/:gameId" element={<GameRoute />} />
  </Route>
</Routes>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/App.test.jsx`
Expected: PASS (both describes).

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/App.test.jsx
git commit -m "feat(shell): mount AppShell as the layout route for all pages"
```

---

### Task 5: De-chrome Dashboard (home page)

**Files:**
- Modify: `src/components/Dashboard.jsx`
- Modify: `src/components/Dashboard.css`
- Modify: `src/i18n/en.json`
- Test: `src/components/__tests__/Dashboard.test.jsx`

**Interfaces:**
- Consumes: shell now provides nav + footer (Tasks 3–4).
- Produces: Dashboard renders only page content (greeting h1 + featured + tabs + grid). Keeps its greeting `<h1>` and focus-on-mount behavior.

- [ ] **Step 1: Update the tests first**

In `src/components/__tests__/Dashboard.test.jsx` delete these three tests (this chrome is now covered by `AppShell.test.jsx`):
- `'renders the admin gear link'`
- `'renders the parent dashboard link'`
- `'renders the my progress link'`

- [ ] **Step 2: Edit Dashboard.jsx**

In `src/components/Dashboard.jsx`:
1. Delete the `<div className="dashboard__nav">…</div>` block (the three `Link`s).
2. Delete the entire `<footer className="dashboard__footer">…</footer>` block.
3. Remove the now-unused `<main>` wrapper: replace `<main>` / `</main>` with nothing, keeping its children directly under `<div className="dashboard">` (shell owns the `main` landmark).
4. Remove now-unused imports: `Link` from `react-router-dom` and `version` from `../../package.json`.

The header block becomes:

```jsx
<div className="dashboard__header">
  <h1 className="dashboard__title" tabIndex={-1} ref={titleRef}>🌊 {title}</h1>
</div>
```

- [ ] **Step 3: Edit Dashboard.css**

In `src/components/Dashboard.css`:
1. Change line 1 to `.dashboard { padding: 24px 16px; }` (shell owns viewport height).
2. Delete the rules for `.dashboard__nav`, `.dashboard__nav-link` (including `:hover`, `:focus`, `:focus-visible`), `.dashboard__footer`, and `.dashboard__version`.

- [ ] **Step 4: Remove dead i18n keys**

In `src/i18n/en.json`, delete from the `"dashboard"` object: `"settingsLabel"`, `"parentLabel"`, `"myProgressLabel"`, `"footerName"`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/__tests__/Dashboard.test.jsx src/App.test.jsx src/i18n/__tests__/i18n.test.js`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

Run: `npm run lint && npm run lint:css`
Expected: clean (catches any unused imports/CSS you missed).

```bash
git add src/components/Dashboard.jsx src/components/Dashboard.css src/components/__tests__/Dashboard.test.jsx src/i18n/en.json
git commit -m "refactor(dashboard): drop page chrome now owned by AppShell"
```

---

### Task 6: De-chrome AdminPage

**Files:**
- Modify: `src/admin/AdminPage.jsx`
- Modify: `src/admin/AdminPage.css`
- Modify: `src/i18n/en.json`
- Test: `src/admin/__tests__/AdminPage.test.jsx`

**Interfaces:**
- Consumes: shell renders the `admin.title` h1 (focused on navigation) and the back link.
- Produces: AdminPage renders only the tabbed settings content. The `admin.title` key STAYS (shell uses it, and the tablist `aria-label` uses it).

- [ ] **Step 1: Update tests first**

In `src/admin/__tests__/AdminPage.test.jsx`:
- Delete the `'moves focus to the page title on mount'` test (~line 339) — route-entry focus is now `AppShell.test.jsx`'s job.
- Delete any test asserting the `←` back link or the page-title heading (search the file for `back` and `heading` with `/settings/i`; the tab-related `aria-labelledby` test at ~line 77 is about tabs — keep it).

- [ ] **Step 2: Edit AdminPage.jsx**

1. Delete the `<div className="admin__header">…</div>` block (back `Link` + `h1`).
2. Remove the `<main>` wrapper, keeping children directly under `<div className="admin">`.
3. Remove the `titleRef` declaration and its focus `useEffect`, and any now-unused imports (`Link` from `react-router-dom`; `useRef`/`useEffect` only if nothing else in the file uses them — check before removing).

- [ ] **Step 3: Edit AdminPage.css**

1. Change line 1 to `.admin { max-width: 600px; padding: 24px 16px; margin: 0 auto; }`.
2. Delete the rules for `.admin__header`, `.admin__back` (all variants), and `.admin__title`.

- [ ] **Step 4: Remove dead i18n key**

In `src/i18n/en.json`, delete `"back"` from the `"admin"` object. Keep `"title"`.

- [ ] **Step 5: Run tests, lint, commit**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx src/i18n/__tests__/i18n.test.js && npm run lint && npm run lint:css`
Expected: PASS / clean.

```bash
git add src/admin/AdminPage.jsx src/admin/AdminPage.css src/admin/__tests__/AdminPage.test.jsx src/i18n/en.json
git commit -m "refactor(admin): drop page chrome now owned by AppShell"
```

---

### Task 7: De-chrome ParentDashboard

**Files:**
- Modify: `src/parent/ParentDashboard.jsx` (return block at ~lines 324–334)
- Modify: `src/parent/ParentDashboard.css`
- Modify: `src/i18n/en.json`
- Test: `src/parent/__tests__/ParentDashboard.test.jsx`

**Interfaces:**
- Consumes: shell renders the `parent.title` h1 and back link.
- Produces: page content starts with an export-CSV toolbar (the export button moves out of the deleted header). `parent.title` and `parent.exportCsv` keys STAY.

- [ ] **Step 1: Update tests first**

In `src/parent/__tests__/ParentDashboard.test.jsx`:
- Delete the page-title heading assertion (~line 86, `getByRole('heading', { name: /progress dashboard/i })`) — if it's the only assertion in its test, delete the test; if the heading query is used as a load-wait, replace it with `await screen.findByRole('button', { name: /export csv/i })`.
- Delete the `'renders a back link pointing to /'` test (~lines 99–103).
- Delete the `'ParentDashboard — focus management'` describe block (~line 243+).
- Keep every export-CSV test — the button still renders, just inside `.parent__toolbar`.

- [ ] **Step 2: Edit ParentDashboard.jsx**

Replace the header block and `<main>` wrapper:

```jsx
return (
  <div className="parent">
    <div className="parent__toolbar">
      <button className="parent__export-btn" onClick={handleExport} aria-label={t('parent.exportCsv')}>
        {t('parent.exportCsv')}
      </button>
    </div>
    {/* …existing empty-state / sections content unchanged… */}
  </div>
)
```

Remove `titleRef` + its focus `useEffect`, the `Link` import, and any other now-unused imports.

- [ ] **Step 3: Edit ParentDashboard.css**

1. Change line 1 to `.parent { max-width: 800px; padding: 24px 16px; margin: 0 auto; }`.
2. Delete the rules for `.parent__header`, `.parent__back` (all variants), and `.parent__title`.
3. Add:

```css
.parent__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}
```

- [ ] **Step 4: Remove dead i18n key**

In `src/i18n/en.json`, delete `"back"` from the `"parent"` object.

- [ ] **Step 5: Run tests, lint, commit**

Run: `npx vitest run src/parent/__tests__/ParentDashboard.test.jsx src/i18n/__tests__/i18n.test.js && npm run lint && npm run lint:css`
Expected: PASS / clean.

```bash
git add src/parent/ParentDashboard.jsx src/parent/ParentDashboard.css src/parent/__tests__/ParentDashboard.test.jsx src/i18n/en.json
git commit -m "refactor(parent): drop page chrome now owned by AppShell"
```

---

### Task 8: De-chrome KidsProgressPage

**Files:**
- Modify: `src/kids/KidsProgressPage.jsx` (return block, lines ~93–113)
- Modify: `src/kids/KidsProgressPage.css`
- Modify: `src/i18n/en.json`
- Test: `src/kids/__tests__/KidsProgressPage.test.jsx`

**Interfaces:**
- Consumes: shell renders the `kids.title` h1 and back link. `kids.title` STAYS.
- Produces: page renders only the per-game progress sections.

- [ ] **Step 1: Update tests first**

In `src/kids/__tests__/KidsProgressPage.test.jsx`:
- The helper at ~line 34 uses `await screen.findByRole('heading', { name: /my progress/i })` as a load-wait — replace every such wait with `await screen.findByRole('heading', { name: /animal sounds/i })` (a game-section heading from the test's own manifest fixture).
- Delete the title-rendering test (~line 62), the `'renders a back link pointing to /'` test (~lines 65–68), and the `'KidsProgressPage — focus management'` describe block (~line 145+).

- [ ] **Step 2: Edit KidsProgressPage.jsx**

Replace the return block:

```jsx
return (
  <div className="kid-progress">
    {manifests.map(m => (
      <GameProgressSection
        key={m.id}
        manifest={m}
        scores={scores}
        badgeData={badgeData}
        bestStreak={bestStreaks[m.id]}
        t={t}
      />
    ))}
  </div>
)
```

Remove `titleRef` + its focus `useEffect`, the `Link` import, and other now-unused imports (`useRef` if unused).

- [ ] **Step 3: Edit KidsProgressPage.css**

1. Change line 1 to `.kid-progress { padding: 24px 16px; }`.
2. Delete the rules for `.kid-progress__header`, `.kid-progress__back` (all variants), and `.kid-progress__title`.

- [ ] **Step 4: Remove dead i18n key**

In `src/i18n/en.json`, delete `"back"` from the `"kids"` object.

- [ ] **Step 5: Run tests, lint, commit**

Run: `npx vitest run src/kids/__tests__/KidsProgressPage.test.jsx src/i18n/__tests__/i18n.test.js && npm run lint && npm run lint:css`
Expected: PASS / clean.

```bash
git add src/kids/KidsProgressPage.jsx src/kids/KidsProgressPage.css src/kids/__tests__/KidsProgressPage.test.jsx src/i18n/en.json
git commit -m "refactor(kids): drop page chrome now owned by AppShell"
```

---

### Task 9: GameIntro/GameResults landmark and heading fixes

**Files:**
- Modify: `src/components/GameIntro.jsx`
- Modify: `src/components/GameResults.jsx` (line 19 only)
- Test: `src/components/__tests__/GameIntro.test.jsx`, `src/components/__tests__/GameResults.test.jsx`

**Interfaces:**
- Consumes: shell owns the game route's `<h1>` (game name) and route-entry focus.
- Produces: intro/results screens render as plain content: no `main` landmark, headings demoted to `h2`. GameResults keeps its focus-on-mount (it appears mid-route — the shell won't refocus, so results still get announced).

- [ ] **Step 1: Update tests first**

- `src/components/__tests__/GameIntro.test.jsx`: delete the `'moves focus to the game name heading on mount'` test (~lines 57–64). Other heading queries (`getByRole('heading', …)`) still pass against an `h2`.
- `src/components/__tests__/GameResults.test.jsx`: no changes expected — the focus test (~line 168) works with `h2`. Verify in Step 3.

- [ ] **Step 2: Edit the components**

`src/components/GameIntro.jsx`:
1. `<main className="game-intro">` → `<div className="game-intro">` (and closing tag).
2. `<h1 className="game-intro__name" tabIndex={-1} ref={headingRef}>{name}</h1>` → `<h2 className="game-intro__name">{name}</h2>`.
3. Remove `headingRef` and its focus `useEffect`; remove `useEffect, useRef` from the react import (nothing else uses them).

`src/components/GameResults.jsx` line 19: change `<h1 …>` to `<h2 …>` keeping all attributes (`className="sr-only" tabIndex={-1} ref={headingRef}`).

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/components/__tests__/GameIntro.test.jsx src/components/__tests__/GameResults.test.jsx`
Expected: PASS.

- [ ] **Step 4: Lint and commit**

Run: `npm run lint`
Expected: clean.

```bash
git add src/components/GameIntro.jsx src/components/GameResults.jsx src/components/__tests__/GameIntro.test.jsx
git commit -m "refactor(game-screens): demote intro/results headings under the shell h1, drop extra main landmark"
```

---

### Task 10: De-chrome all three games + shared GameLayout.css

**Files:**
- Create: `src/components/GameLayout.css`
- Modify: `src/App.jsx` (add one import), `src/games/color-match/index.jsx`, `src/games/animal-sounds/index.jsx`, `src/games/character-match/index.jsx`
- Modify: `src/games/color-match/ColorMatchGame.css`, `src/games/animal-sounds/AnimalSoundsGame.css`, `src/games/character-match/CharacterMatchGame.css`
- Test: `src/games/color-match/__tests__/ColorMatchGame.test.jsx`, `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`, `src/games/character-match/__tests__/CharacterMatchGame.test.jsx`

**Interfaces:**
- Consumes: `useShellGameStatus({ streak, sessionActive })` from `src/components/ShellContext.jsx` (Task 1); `ShellContext` for test spies.
- Produces: games render `<div className="game">` with no header; each publishes `{ streak, sessionActive: introResolved && !showIntro && !done }`.

Apply the SAME edit to all three games. Full instructions once; per-file specifics in the table below.

- [ ] **Step 1: Update each game's tests first**

In each game test file, find the test `'shows the streak badge after 2 correct answers in a row'`. Keep its existing arrange/act steps (answering two questions correctly) but:
1. Rename it to `'reports the streak to the shell after 2 correct answers in a row'`.
2. Add imports: `import { ShellContext } from '../../../components/ShellContext'`.
3. Wrap that test's `render(...)` call in a provider with a spy:

```jsx
const setGameStatus = vi.fn()
render(
  <ShellContext.Provider value={{ setGameStatus }}>
    <ColorMatchGame onGameEnd={() => {}} />   {/* per-game component name */}
  </ShellContext.Provider>
)
```

4. Replace the StreakBadge visibility assertion (e.g. `expect(screen.getByText('🔥 2 in a row!')).toBeInTheDocument()`) with:

```jsx
expect(setGameStatus).toHaveBeenLastCalledWith({ streak: 2, sessionActive: true })
```

5. Delete any assertions on the removed mini header — search each test file for `game__name`, `game__version`, and `v{` / version-string assertions and remove them. Heading assertions that target the GameIntro name heading still pass (it's an `h2` now) — keep those.

- [ ] **Step 2: Run tests to verify the changed ones fail**

Run: `npx vitest run src/games`
Expected: the three renamed streak tests FAIL (hook not wired yet); others pass.

- [ ] **Step 3: Edit the three game components**

In each `index.jsx`:
1. Add `import { useShellGameStatus } from '../../components/ShellContext'` and remove the `StreakBadge` import.
2. Immediately after the `useGameSession(...)` destructuring, add:

```jsx
useShellGameStatus({ streak, sessionActive: introResolved && !showIntro && !done })
```

(This must sit BEFORE the early `return null` statements — hooks cannot be conditional.)
3. Delete the mini-header block:

```jsx
<div className="game__header">
  <h1 className="game__name">{manifest.name}</h1>
  <StreakBadge streak={streak} />
  <span className="game__version">v{manifest.version}</span>
</div>
```

4. Change `<main className="game">` to `<div className="game">` (and the matching closing tag).

| File | Component name | Hidden testid kept |
|---|---|---|
| `src/games/color-match/index.jsx` | `ColorMatchGame` | `correct-color-id` |
| `src/games/animal-sounds/index.jsx` | `AnimalSoundsGame` | (whatever exists — keep) |
| `src/games/character-match/index.jsx` | `CharacterMatchGame` | `correct-character-id` |

- [ ] **Step 4: Consolidate the CSS**

Create `src/components/GameLayout.css`:

```css
/* Shared page layout for every game screen. Games must not render their own
   header/main/footer — AppShell owns page chrome (see design spec). */
.game {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 24px;
  align-items: center;
  width: 100%;
  padding: 24px 16px;
}
```

In `src/App.jsx`, add `import './components/GameLayout.css'` next to the other imports.

In each of `ColorMatchGame.css`, `AnimalSoundsGame.css`, `CharacterMatchGame.css`, delete:
- the `.game { … }` rule (line 1),
- the `.game__header { … }` block,
- the `.game__name` and `.game__version` rules.

- [ ] **Step 5: Run tests, lint**

Run: `npx vitest run src/games src/components && npm run lint && npm run lint:css`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/GameLayout.css src/App.jsx src/games
git commit -m "refactor(games): drop per-game chrome, report status to shell, share game layout CSS"
```

---

### Task 11: E2E updates + exit-guard spec + visual snapshots

**Files:**
- Create: `e2e/app-shell.spec.js`
- Modify: any e2e spec matching `getByRole('button', { name: 'Home' })` (at least `e2e/color-match.spec.js:53`; grep all of `e2e/`)
- Modify: `e2e/visual.spec.js-snapshots/` (regenerated)

**Interfaces:**
- Consumes: the shell home button's accessible name `"Go to home"`; the results screen's `"Home"` button; `game-intro-start` testid.
- Produces: green e2e suite.

- [ ] **Step 1: Fix the Home-button ambiguity**

Playwright's `getByRole(…, { name })` is substring by default, so `'Home'` now also matches the shell's `"Go to home"` button. Grep `e2e/` for `name: 'Home'` and add `exact: true`:

```js
await page.getByRole('button', { name: 'Home', exact: true }).click()
```

- [ ] **Step 2: Write the new shell spec**

Create `e2e/app-shell.spec.js`:

```js
import { test, expect } from '@playwright/test'

test('shared header persists from home into a game', async ({ page }) => {
  await page.goto('/')
  const brand = page.getByRole('banner').getByRole('link', { name: /the playground/i })
  await expect(brand).toBeVisible()
  await page.getByRole('link', { name: /color match/i }).first().click()
  await expect(brand).toBeVisible()
  await expect(page.getByRole('banner').getByRole('heading', { name: /color match/i })).toBeVisible()
})

test('mid-game exit shows the confirm overlay and can resume or leave', async ({ page }) => {
  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-start').click()

  await page.getByRole('button', { name: 'Go to home' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: /keep playing/i }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/game\/color-match$/)

  await page.getByRole('button', { name: 'Go to home' }).click()
  await dialog.getByRole('button', { name: /leave game/i }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('intro screen exits immediately without a confirm overlay', async ({ page }) => {
  await page.goto('/game/color-match')
  await expect(page.getByTestId('game-intro-start')).toBeVisible()
  await page.getByRole('button', { name: 'Go to home' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('dialog')).toBeHidden()
})
```

- [ ] **Step 3: Run the functional e2e suites**

Run: `npm run e2e`
Expected: `visual.spec.js` fails (chrome changed — expected); everything else passes. Fix any other selector breakage the run reveals (report what you changed).

- [ ] **Step 4: Regenerate visual snapshots**

Run: `npx playwright test visual.spec.js --update-snapshots`
Then: `npm run e2e`
Expected: all specs pass.

- [ ] **Step 5: Commit**

```bash
git add e2e
git commit -m "test(e2e): cover shell persistence and exit guard, refresh visual snapshots"
```

---

### Task 12: Documentation + full verification

**Files:**
- Modify: `README.md` (Architecture section, ~lines 77–120)
- Modify: `docs/TESTING.md`

**Interfaces:**
- Consumes: everything above.
- Produces: docs matching the shipped code; a fully green branch.

- [ ] **Step 1: Update README.md**

In the Architecture tree, add under `components/`:

```
├── components/                # Shared UI: AppShell (persistent header/footer + exit guard),
│                               # ShellContext, GameCard, GameIntro/GameResults,
│                               # GameChoiceGrid, BadgeGallery, Timer, StreakBadge, ...
```

After the Auto-Discovery section (or wherever game authoring is described), add a short subsection:

```markdown
### Wrapper UI (AppShell)

Every route renders inside `AppShell`, a React Router layout route that owns the
page chrome: brand/home link, contextual nav, back links, page titles, footer,
and the kid-safe exit guard on game routes. Games must NOT render their own
`header`/`main`/`footer` — they render a `<div className="game">` (layout in
`src/components/GameLayout.css`) and report live status to the shell with:

​```jsx
useShellGameStatus({ streak, sessionActive: introResolved && !showIntro && !done })
​```

While `sessionActive` is true, leaving the game (home button or brand link)
opens a confirm overlay instead of navigating, so a stray toddler tap can't
kill a session. The guard is fail-open: a game that never reports status can
always be exited immediately.
```

(Remove the zero-width characters around the code fence when writing the file — they're only here to nest fences.)

- [ ] **Step 2: Update docs/TESTING.md**

Add a bullet/short paragraph in the unit-testing section: `AppShell` tests cover route-driven chrome states (home/subpage/game), footer visibility, route-entry focus, and the exit-guard dialog (open/resume/leave/Escape/focus restore); `ExitConfirmDialog` has dedicated a11y tests (jest-axe). Mention `e2e/app-shell.spec.js` in the e2e section.

- [ ] **Step 3: Full verification**

Run each, expect all green:

```bash
npm run lint
npm run lint:css
npx vitest run
npm run build
npm run e2e
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/TESTING.md
git commit -m "docs: document AppShell wrapper UI and its test coverage"
```
