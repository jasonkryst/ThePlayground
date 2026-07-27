import { BrowserRouter, Routes, Route, useParams, useNavigate, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import AppShell from './components/AppShell'
import OrientationGate from './components/OrientationGate'
import ParentalLockGate from './components/ParentalLockGate'
import useSettings from './hooks/useSettings'
import { gameIconMap, resolveIcon } from './lib/gameIcons'
import i18n from './i18n'
import './components/GameLayout.css'

const manifestModules = import.meta.glob('./games/*/manifest.json', { eager: true })
const gameModules     = import.meta.glob('./games/*/index.jsx')

// Lazy — none of these three are needed to render the dashboard ('/'), so
// keeping them out of the main bundle (rather than a static import) removes
// their dependencies from the dashboard's critical rendering path. In
// particular ParentDashboard pulls in recharts, a large charting library
// only ever used on /parent; before this change it shipped in the same
// chunk the dashboard needed just to paint its own title (confirmed via
// Lighthouse CI: LCP element was the dashboard's <h1>, scoring 0.16/1 at
// 5.7s, well before this fix).
const AdminPage        = lazy(() => import('./admin/AdminPage'))
const ParentDashboard  = lazy(() => import('./parent/ParentDashboard'))
const KidsProgressPage = lazy(() => import('./kids/KidsProgressPage'))

const manifests = Object.values(manifestModules)
  .map(m => m.default ?? m)
  .map(manifest => ({ ...manifest, icon: resolveIcon(manifest, gameIconMap) }))

const gameComponents = Object.fromEntries(
  Object.entries(gameModules).map(([path, loader]) => {
    const match = path.match(/\.\/games\/([^/]+)\/index\.jsx/)
    if (!match) throw new Error(`Unexpected game module path: ${path}`)
    const id = match[1]
    return [id, lazy(loader)]
  })
)

// Only allows alphanumeric, dash, underscore — prevents script injection via a stored GA ID
function sanitizeGaId(id) {
  return (id || '').trim().replace(/[^A-Za-z0-9_-]/g, '')
}

function GoogleAnalytics() {
  const { settings } = useSettings()
  const location     = useLocation()
  const gaId         = sanitizeGaId(settings.gaId)

  useEffect(() => {
    if (!gaId || document.getElementById('ga-script')) return
    window.dataLayer = window.dataLayer || []
    window.gtag = function() { window.dataLayer.push(arguments) }
    window.gtag('js', new Date())
    window.gtag('config', gaId)
    const script = document.createElement('script')
    script.id    = 'ga-script'
    script.async = true
    script.src   = `https://www.googletagmanager.com/gtag/js?id=${gaId}`
    document.head.appendChild(script)
  }, [gaId])

  useEffect(() => {
    if (!gaId || typeof window.gtag !== 'function') return
    window.gtag('event', 'page_view', { page_path: location.pathname })
  }, [location.pathname, gaId])

  return null
}

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

export default function App() {
  return (
    <BrowserRouter>
      <GoogleAnalytics />
      <LocaleSync />
      <Routes>
        <Route element={<AppShell manifests={manifests} />}>
          <Route path="/"             element={<Dashboard manifests={manifests} />} />
          <Route path="/admin"        element={<ParentalLockGate><Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}><AdminPage manifests={manifests} /></Suspense></ParentalLockGate>} />
          <Route path="/parent"       element={<ParentalLockGate><Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}><ParentDashboard manifests={manifests} /></Suspense></ParentalLockGate>} />
          <Route path="/my-progress" element={<Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}><KidsProgressPage manifests={manifests} /></Suspense>} />
          <Route path="/game/:gameId" element={<GameRoute />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
