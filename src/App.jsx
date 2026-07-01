import { BrowserRouter, Routes, Route, useParams, useNavigate, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import AdminPage from './admin/AdminPage'
import ParentDashboard from './parent/ParentDashboard'
import useSettings from './hooks/useSettings'

const manifestModules = import.meta.glob('./games/*/manifest.json', { eager: true })
const gameModules     = import.meta.glob('./games/*/index.jsx')

const manifests = Object.values(manifestModules).map(m => m.default ?? m)

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

function GameRoute() {
  const { gameId } = useParams()
  const navigate   = useNavigate()
  const Game       = gameComponents[gameId]

  if (!Game) return <div style={{ padding: 24 }}>Game not found.</div>

  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
      <Game onGameEnd={() => navigate('/')} />
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <GoogleAnalytics />
      <Routes>
        <Route path="/"             element={<Dashboard manifests={manifests} />} />
        <Route path="/admin"        element={<AdminPage manifests={manifests} />} />
        <Route path="/parent"       element={<ParentDashboard />} />
        <Route path="/game/:gameId" element={<GameRoute />} />
      </Routes>
    </BrowserRouter>
  )
}
