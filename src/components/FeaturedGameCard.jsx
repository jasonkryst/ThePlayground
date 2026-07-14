import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ManifestIcon from './ManifestIcon'
import './FeaturedGameCard.css'

export default function FeaturedGameCard({ manifest }) {
  const { t } = useTranslation()
  if (!manifest) return null
  const { id, name, description, icon, color, orientation } = manifest
  return (
    <Link
      to={`/game/${id}`}
      className="featured-card"
      style={{ borderColor: color }}
      aria-label={t('dashboard.featuredAriaLabel', { name })}
    >
      <span className="featured-card__label">⭐ {t('dashboard.todaysGame')}</span>
      <ManifestIcon icon={icon} className="featured-card__icon" />
      <span className="featured-card__name">{name}</span>
      <span className="featured-card__desc">{description}</span>
      {orientation === 'landscape' && (
        <span
          className="featured-card__landscape-badge"
          data-testid="landscape-badge"
          role="img"
          aria-label={t('dashboard.landscapeOnly')}
        >
          ↔️
        </span>
      )}
      {orientation === 'portrait' && (
        <span
          className="featured-card__landscape-badge"
          data-testid="portrait-badge"
          role="img"
          aria-label={t('dashboard.portraitOnly')}
        >
          ↕️
        </span>
      )}
    </Link>
  )
}
