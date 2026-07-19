import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ManifestIcon from './ManifestIcon'
import './GameCard.css'

const MS_PER_DAY = 86_400_000

function getDaysDiff(lastPlayedMs) {
  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const playedMidnight = new Date(
    new Date(lastPlayedMs).getFullYear(),
    new Date(lastPlayedMs).getMonth(),
    new Date(lastPlayedMs).getDate()
  ).getTime()
  return Math.round((todayMidnight - playedMidnight) / MS_PER_DAY)
}

function recentLabel(recentInfo, t) {
  const { lastPlayed, playCount } = recentInfo
  const days = getDaysDiff(lastPlayed.getTime())
  const plays = t('gameCard.playCount', { count: playCount })
  const when =
    days === 0 ? t('gameCard.playedToday') :
    days === 1 ? t('gameCard.playedYesterday') :
    t('gameCard.playedDaysAgo', { days })
  return `${when} · ${plays}`
}

export default function GameCard({ manifest, bestScore, recentInfo = null }) {
  const { t } = useTranslation()
  const { id, nameKey, descriptionKey, icon, color } = manifest
  const name = t(nameKey)
  const description = t(descriptionKey)

  const cardStyle = recentInfo
    ? { boxShadow: `0 0 0 3px ${color}, 0 4px 16px rgba(0,0,0,0.1)` }
    : { borderTop: `6px solid ${color}` }

  return (
    <Link
      to={`/game/${id}`}
      className={`game-card${recentInfo ? ' game-card--recently-played' : ''}`}
      style={cardStyle}
    >
      <ManifestIcon icon={icon} className="game-card__icon" />
      <span className="game-card__name">{name}</span>
      <span className="game-card__desc">{description}</span>
      {bestScore > 0 && (
        <span className="game-card__score">{t('gameCard.best', { score: bestScore })}</span>
      )}
      {manifest.orientation === 'landscape' && (
        <span
          className="game-card__landscape-badge"
          data-testid="landscape-badge"
          role="img"
          aria-label={t('dashboard.landscapeOnly')}
        >
          ↔️
        </span>
      )}
      {manifest.orientation === 'portrait' && (
        <span
          className="game-card__landscape-badge"
          data-testid="portrait-badge"
          role="img"
          aria-label={t('dashboard.portraitOnly')}
        >
          ↕️
        </span>
      )}
      {recentInfo && (
        <span className="game-card__recent-badge" data-testid="recently-played-badge">
          {recentLabel(recentInfo, t)}
        </span>
      )}
    </Link>
  )
}
