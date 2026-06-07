import { BrowserRouter, Routes, Route } from 'react-router-dom'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div>Dashboard coming soon</div>} />
        <Route path="/admin" element={<div>Admin coming soon</div>} />
        <Route path="/game/:gameId" element={<div>Game coming soon</div>} />
      </Routes>
    </BrowserRouter>
  )
}
