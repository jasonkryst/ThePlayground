import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import GameCard from './GameCard'
import useScores from '../hooks/useScores'
import useSettings from '../hooks/useSettings'
import { version } from '../../package.json'
import './Dashboard.css'

export default function Dashboard({ manifests = [] }) {
  const { t } = useTranslation()
  const { getBestScore } = useScores()
  const { settings } = useSettings()

  const name = settings.childName?.trim()
  const title = name ? t('dashboard.titleNamed', { name }) : t('dashboard.titleDefault')

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title">🌊 {title}</h1>
        <Link to="/admin" className="dashboard__admin" aria-label={t('dashboard.settingsLabel')}>⚙️</Link>
      </div>

      {manifests.length === 0 ? (
        <p className="dashboard__empty">{t('dashboard.empty')}</p>
      ) : (
        <div className="dashboard__grid">
          {manifests.map(m => (
            <GameCard key={m.id} manifest={m} bestScore={getBestScore(m.id)} />
          ))}
        </div>
      )}

      <footer className="dashboard__footer">
        <span>{t('dashboard.footerName')}</span>
        <span className="dashboard__version">v{version}</span>
      </footer>
    </div>
  )
}
