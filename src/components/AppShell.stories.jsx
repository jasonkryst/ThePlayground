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
