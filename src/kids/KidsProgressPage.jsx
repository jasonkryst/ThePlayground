import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useScores from '../hooks/useScores'
import useBadges from '../hooks/useBadges'
import adapter from '../storage/index'
import { computeBestAccuracy } from '../utils/kidStats'
import { BADGE_CATALOG } from '../lib/badges'
import ManifestIcon from '../components/ManifestIcon'
import './KidsProgressPage.css'

function StatTile({ icon, value, label }) {
  return (
    <div className="kid-progress__stat">
      <span className="kid-progress__stat-icon" aria-hidden="true">{icon}</span>
      <span className="kid-progress__stat-value">{value}</span>
      <span className="kid-progress__stat-label">{label}</span>
    </div>
  )
}

function BadgeChip({ badge, count, t }) {
  const earned = count > 0
  const name = t(badge.nameKey)
  const ariaLabel = earned
    ? t('kids.badgeEarned', { name })
    : t('kids.badgeLocked', { name })

  return (
    <div
      role="group"
      className={`kid-progress__badge${earned ? '' : ' kid-progress__badge--locked'}`}
      aria-label={ariaLabel}
    >
      <span className="kid-progress__badge-icon" aria-hidden="true">{badge.icon}</span>
      {earned && (
        <span className="kid-progress__badge-name">
          {name}{count > 1 ? ` ×${count}` : ''}
        </span>
      )}
    </div>
  )
}

function GameProgressSection({ manifest, scores, badgeData, bestStreak, t }) {
  const bestAccuracy = computeBestAccuracy(scores, manifest.id)
  const totalPlayed  = badgeData.lifetimeQuestions[manifest.id] ?? 0
  const awards       = badgeData.awards[manifest.id] ?? {}

  return (
    <section
      className="kid-progress__game"
      style={{ borderTop: `6px solid ${manifest.color}` }}
      aria-labelledby={`kid-progress-${manifest.id}`}
    >
      <h2 id={`kid-progress-${manifest.id}`} className="kid-progress__game-name">
        <ManifestIcon icon={manifest.icon} className="kid-progress__game-icon" ariaHidden /> {manifest.name}
      </h2>

      <div className="kid-progress__stats">
        <StatTile
          icon="🎯"
          value={bestAccuracy != null ? `${bestAccuracy}%` : '—'}
          label={t('kids.statBestScore')}
        />
        <StatTile icon="🔥" value={bestStreak ?? 0} label={t('kids.statBestStreak')} />
        <StatTile icon="🔢" value={totalPlayed} label={t('kids.statTotalPlayed')} />
      </div>

      <div className="kid-progress__badges">
        {BADGE_CATALOG.map(badge => (
          <BadgeChip key={badge.id} badge={badge} count={awards[badge.id] ?? 0} t={t} />
        ))}
      </div>
    </section>
  )
}

export default function KidsProgressPage({ manifests = [] }) {
  const { t } = useTranslation()
  const { getAllScores } = useScores()
  const { badgeData } = useBadges()
  const [bestStreaks, setBestStreaks] = useState({})

  useEffect(() => {
    adapter.getBestStreaks().then(setBestStreaks)
  }, [])

  const scores = getAllScores()

  return (
    <div className="kid-progress">
      {manifests.map(m => (
        <GameProgressSection
          key={m.id}
          manifest={m}
          scores={scores}
          badgeData={badgeData}
          bestStreak={bestStreaks[m.id]}
          t={t}
        />
      ))}
    </div>
  )
}
