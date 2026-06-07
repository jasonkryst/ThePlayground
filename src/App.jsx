import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import Dashboard from './components/Dashboard'
import AdminPage from './admin/AdminPage'

const manifestModules = import.meta.glob('./games/*/manifest.json', { eager: true })
const gameModules     = import.meta.glob('./games/*/index.jsx')

const manifests = Object.values(manifestModules).map(m => m.default ?? m)

const gameComponents = Object.fromEntries(
  Object.entries(gameModules).map(([path, loader]) => {
    const id = path.match(/\.\/games\/(.+)\/index\.jsx/)[1]
    return [id, lazy(loader)]
  })
)

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
      <Routes>
        <Route path="/"             element={<Dashboard manifests={manifests} />} />
        <Route path="/admin"        element={<AdminPage />} />
        <Route path="/game/:gameId" element={<GameRoute />} />
      </Routes>
    </BrowserRouter>
  )
}
