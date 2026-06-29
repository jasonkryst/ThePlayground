import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import GameCard from './GameCard'
import FeaturedGameCard from './FeaturedGameCard'
import useScores from '../hooks/useScores'
import useSettings from '../hooks/useSettings'
import useRecentlyPlayed from '../hooks/useRecentlyPlayed'
import useFeaturedGame from '../hooks/useFeaturedGame'
import useGameTags from '../hooks/useGameTags'
import { version } from '../../package.json'
import './Dashboard.css'

export default function Dashboard({ manifests = [] }) {
  const { t } = useTranslation()
  const { getBestScore } = useScores()
  const { settings } = useSettings()
  const recentlyPlayed = useRecentlyPlayed()
  const featured = useFeaturedGame(manifests)
  const { tagMap, allTags } = useGameTags(manifests)
  const [activeTag, setActiveTag] = useState('all')

  const name = settings.childName?.trim()
  const title = name ? t('dashboard.titleNamed', { name }) : t('dashboard.titleDefault')

  return (
    <div className="dashboard">
      <main>
        <div className="dashboard__header">
          <h1 className="dashboard__title">🌊 {title}</h1>
          <div className="dashboard__nav">
            <Link to="/parent" className="dashboard__nav-link" aria-label={t('dashboard.parentLabel')}>📊</Link>
            <Link to="/admin"  className="dashboard__nav-link" aria-label={t('dashboard.settingsLabel')}>⚙️</Link>
          </div>
        </div>

        <FeaturedGameCard manifest={featured} />

        {manifests.length === 0 ? (
          <p className="dashboard__empty">{t('dashboard.empty')}</p>
        ) : (
          <div className="dashboard__grid">
            {manifests.map(m => (
              <GameCard
                key={m.id}
                manifest={m}
                bestScore={getBestScore(m.id)}
                recentInfo={recentlyPlayed.get(m.id) ?? null}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="dashboard__footer">
        <span>{t('dashboard.footerName')}</span>
        <span className="dashboard__version">v{version}</span>
      </footer>
    </div>
  )
}
