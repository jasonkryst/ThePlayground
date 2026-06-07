import { Link } from 'react-router-dom'
import GameCard from './GameCard'
import useScores from '../hooks/useScores'
import './Dashboard.css'

export default function Dashboard({ manifests }) {
  const { getBestScore } = useScores()

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title">🌊 Baby's Playroom</h1>
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
    </div>
  )
}
