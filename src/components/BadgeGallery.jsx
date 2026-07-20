import { useTranslation } from 'react-i18next'
import { getBadgesForGame } from '../lib/badges'
import './BadgeGallery.css'

export default function BadgeGallery({ manifests, badgeData }) {
  const { t } = useTranslation()
  return (
    <div className="badge-gallery">
      {manifests.map(game => (
        <div key={game.id} className="badge-gallery__game">
          <h3 className="badge-gallery__game-name">{t(game.nameKey)}</h3>
          <div className="badge-gallery__badges">
            {getBadgesForGame(game.id).map(badge => {
              const count = badgeData.awards[game.id]?.[badge.id] ?? 0
              const earned = count > 0
              return (
                <div
                  key={badge.id}
                  className={`badge-gallery__badge${earned ? '' : ' badge-gallery__badge--locked'}`}
                >
                  <span className="badge-gallery__icon" aria-hidden="true">{badge.icon}</span>
                  <span className="badge-gallery__name">{t(badge.nameKey)}</span>
                  {earned && count > 1 && <span className="badge-gallery__count">×{count}</span>}
                  {!earned && <span className="badge-gallery__locked-label">{t('badges.locked')}</span>}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
