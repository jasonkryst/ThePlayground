import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, Outlet, useLocation, useNavigate, matchPath } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShellContext, INACTIVE_GAME_STATUS } from './ShellContext'
import ExitConfirmDialog from './ExitConfirmDialog'
import StreakBadge from './StreakBadge'
import ManifestIcon from './ManifestIcon'
import useFocusOnMount from '../hooks/useFocusOnMount'
import useHeaderHeightVar from '../hooks/useHeaderHeightVar'
import useSettings from '../hooks/useSettings'
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

const THEME_CYCLE = ['system', 'light', 'dark', 'high-contrast']
const THEME_ICON = { system: '🌓', light: '☀️', dark: '🌙', 'high-contrast': '◐' }
const THEME_LABEL_KEY = {
  system: 'shell.themeToggleSystem',
  light: 'shell.themeToggleLight',
  dark: 'shell.themeToggleDark',
  'high-contrast': 'shell.themeToggleHighContrast',
}

export default function AppShell({ manifests = [] }) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [gameStatus, setGameStatus] = useState(INACTIVE_GAME_STATUS)
  const [confirmingExit, setConfirmingExit] = useState(false)
  const exitTriggerRef = useRef(null)
  const titleRef = useFocusOnMount([location.pathname])
  const bodyRef = useRef(null)
  const headerRef = useRef(null)
  useHeaderHeightVar(headerRef)
  const { settings, updateSetting } = useSettings()
  const currentTheme = THEME_CYCLE.includes(settings.theme) ? settings.theme : 'system'

  // Read inside the popstate handler below instead of closing over
  // gameStatus/isGameRoute directly, so the handler (registered once) always
  // sees the current guard condition rather than a stale one from mount.
  const guardedRef = useRef(false)

  const gameMatch = matchPath('/game/:gameId', location.pathname)
  const isGameRoute = gameMatch != null
  const gameManifest = isGameRoute
    ? manifests.find(m => m.id === gameMatch.params.gameId) ?? null
    : null
  const pageTitleKey = PAGE_TITLE_KEYS[location.pathname]
  const isHome = location.pathname === '/'

  // One resolved shape for "is there a title, and what does it look like"
  // instead of branching on isGameRoute again at render time with two
  // differently-shaped null checks.
  const title = isGameRoute
    ? (gameManifest ? { icon: gameManifest.icon, text: t(gameManifest.nameKey) } : null)
    : (pageTitleKey ? { icon: null, text: t(pageTitleKey) } : null)

  // setGameStatus from useState is referentially stable, so this value never changes.
  const contextValue = useMemo(() => ({ setGameStatus }), [])

  useEffect(() => {
    guardedRef.current = isGameRoute && gameStatus.sessionActive
  }, [isGameRoute, gameStatus.sessionActive])

  // titleRef (useFocusOnMount above) owns route-entry focus wherever the
  // shell owns the page title (subpages and games); on '/' the Dashboard
  // focuses its own greeting instead. This effect only resets the exit
  // dialog on route change.
  useEffect(() => {
    setConfirmingExit(false)
  }, [location.pathname])

  // Guards the browser/OS back button too, not just in-app taps — a popstate
  // never reaches an onClick handler. The standard SPA trick: push a sentinel
  // history entry when a session goes active, so the first back-press lands
  // on a popstate we can intercept instead of actually leaving; re-push on
  // every subsequent back-press while still guarded, so the browser can never
  // step past this page until the user actually confirms. pushState never
  // fires its own popstate, so this can't loop.
  useEffect(() => {
    if (!(isGameRoute && gameStatus.sessionActive)) return
    window.history.pushState(null, '', window.location.href)
  }, [isGameRoute, gameStatus.sessionActive])

  useEffect(() => {
    function handlePopState() {
      if (!guardedRef.current) return
      window.history.pushState(null, '', window.location.href)
      exitTriggerRef.current = null
      setConfirmingExit(true)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // While the exit-confirm dialog is open, everything behind it (header,
  // game content, footer) must be unreachable to assistive tech — Tab-key
  // focus is already trapped inside the dialog itself, but a screen reader's
  // swipe/virtual-cursor navigation walks DOM order, not Tab order, and would
  // otherwise still land on (and activate) the shell's home button or brand
  // link right through the backdrop. `inert` covers focus + pointer-events +
  // the accessibility tree in one attribute; aria-hidden is a defense-in-depth
  // fallback for engines with incomplete `inert` support. Set via
  // setAttribute rather than the JSX `inert` prop / `.inert` IDL property so
  // this is verifiable in jsdom-based tests, not just real browsers.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (confirmingExit) {
      el.setAttribute('inert', '')
      el.setAttribute('aria-hidden', 'true')
    } else {
      el.removeAttribute('inert')
      el.removeAttribute('aria-hidden')
    }
  }, [confirmingExit])

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

  function handleThemeToggle() {
    const nextIndex = (THEME_CYCLE.indexOf(currentTheme) + 1) % THEME_CYCLE.length
    updateSetting('theme', THEME_CYCLE[nextIndex])
  }

  return (
    <ShellContext.Provider value={contextValue}>
      <div className="shell">
        {/* display:contents so this wrapper is invisible to layout — it exists
            solely as an inert/aria-hidden host while the exit dialog is open. */}
        <div className="shell__body" ref={bodyRef}>
          <header className="shell__header" ref={headerRef}>
            {/* Row 1: app-level chrome (brand, back, nav/home) — identical
                shape on every route. Row 2 (below): route content — the page
                title, plus the streak badge on game routes — gets the full
                row width instead of splitting it with row 1's icons. */}
            <div className="shell__row">
              <div className="shell__side">
                {!isGameRoute && !isHome && (
                  <Link to="/" className="shell__back" aria-label={t('shell.back')}>←</Link>
                )}
                <Link
                  to="/"
                  className="shell__brand"
                  aria-label={t('shell.brand')}
                  onClick={handleGuardedNavClick}
                >
                  <span aria-hidden="true">🌊</span>
                  <span className="shell__brand-label">{t('shell.brand')}</span>
                </Link>
              </div>

              <div className="shell__side shell__side--end">
                <button
                  className="shell__theme-toggle"
                  aria-label={t(THEME_LABEL_KEY[currentTheme])}
                  onClick={handleThemeToggle}
                >
                  <span aria-hidden="true">{THEME_ICON[currentTheme]}</span>
                </button>
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
            </div>

            {title && (
              <div className="shell__title-row">
                <h1 className="shell__title" tabIndex={-1} ref={titleRef}>
                  {title.icon && (
                    <>
                      <ManifestIcon icon={title.icon} className="shell__title-icon" ariaHidden />
                      {' '}
                    </>
                  )}
                  {title.text}
                </h1>
                {isGameRoute && gameStatus.sessionActive && (
                  <StreakBadge streak={gameStatus.streak} />
                )}
              </div>
            )}
          </header>

          {/* key remounts the content on navigation so the fade-in replays */}
          <main className="shell__content" key={location.pathname}>
            <Outlet />
          </main>

          <footer className="shell__footer">
            <span className="shell__copyright">{t('shell.copyright', { year: new Date().getFullYear() })}</span>
            <span className="shell__footer-versions">
              {isGameRoute && gameManifest && (
                <span className="shell__game-version">{t(gameManifest.nameKey)} v{gameManifest.version}</span>
              )}
              <span className="shell__version">v{version}</span>
            </span>
          </footer>
        </div>

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
