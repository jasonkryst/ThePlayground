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

          {(isGameRoute ? gameManifest != null : pageTitleKey != null) && (
            <div className="shell__title-row">
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
