import { Link } from 'react-router-dom'
import GameCard from './GameCard'
import useScores from '../hooks/useScores'
import useSettings from '../hooks/useSettings'
import { version } from '../../package.json'
import './Dashboard.css'

export default function Dashboard({ manifests = [] }) {
  const { getBestScore } = useScores()
  const { settings } = useSettings()

  const name = settings.childName?.trim()
  const title = name ? `${name}'s Playground` : "Baby's Playground"

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title">🌊 {title}</h1>
        <Link to="/admin" className="dashboard__admin" aria-label="⚙️ Settings">⚙️</Link>
      </div>

      {manifests.length === 0 ? (
        <p className="dashboard__empty">No games found. Drop a game folder into src/games/.</p>
      ) : (
        <div className="dashboard__grid">
          {manifests.map(m => (
            <GameCard key={m.id} manifest={m} bestScore={getBestScore(m.id)} />
          ))}
        </div>
      )}

      <footer className="dashboard__footer">
        <span>The Playground</span>
        <span className="dashboard__version">v{version}</span>
      </footer>
    </div>
  )
}
