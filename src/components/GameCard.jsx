import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './GameCard.css'

export default function GameCard({ manifest, bestScore }) {
  const { t } = useTranslation()
  const { id, name, description, icon, color } = manifest
  return (
    <Link
      to={`/game/${id}`}
      className="game-card"
      style={{ borderTop: `6px solid ${color}` }}
    >
      <span className="game-card__icon">{icon}</span>
      <span className="game-card__name">{name}</span>
      <span className="game-card__desc">{description}</span>
      {bestScore > 0 && (
        <span className="game-card__score">{t('gameCard.best', { score: bestScore })}</span>
      )}
    </Link>
  )
}
